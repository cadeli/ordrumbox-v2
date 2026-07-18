import { NOT_FOUND } from '../../core/constants.js'
import Utils from '../../core/utils.js'
import MfDefaults from '../../patterns/defaults.js'
import { appState } from '../../state/app_state.js'
import { getAutoAssignService, serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { playbackEvents } from '../../state/playback_events.js'
import { normalizeTrack, TRACK_DEFAULTS, TRACK_VALUE_RANGES, recalcLoopDerived } from '../../model/track_schema.js'
import { importPatternFromJson } from './pattern_import.js'
import { logger } from "../../core/logger.js"

export default class MfCmd {
    static TAG = "MFCMD"

    constructor() {
    }

    // Safe updater for track properties
    // Accepts a track object and a updates object. Only whitelisted keys are applied.
    // Extra or unknown keys are ignored gracefully to avoid runtime errors when callers
    // pass a larger payload (beats, stepsPerBeat, pan, reverbAmount, etc.).
    updateTrack = (track, updates) => {
        if (!track || !updates || typeof updates !== 'object') {
            return track
        }
        
        let changed = false
        // Derived properties are handled separately
        const derivedKeys = new Set(['loopPointBeat', 'loopPointStep'])
        const allTrackKeys = new Set(Object.keys(TRACK_DEFAULTS))
        
        for (const [k, v] of Object.entries(updates)) {
            if (allTrackKeys.has(k) && !derivedKeys.has(k)) {
                let clamped = v
                const range = TRACK_VALUE_RANGES[k]
                if (range && typeof v === 'number' && Number.isFinite(v)) {
                    clamped = Math.min(range.max, Math.max(range.min, v))
                }
                if (track[k] !== clamped) {
                    track[k] = clamped
                    changed = true
                }
            }
        }

        if (changed) {
            this._incrementPatternVersionByTrack(track)
        }

        if (typeof track.stepsPerBeat === 'number' && typeof track.loopAtStep === 'number') {
            recalcLoopDerived(track)
        }

        if (track.loopAtStep === undefined && typeof track.loopPointBeat === 'number' && typeof track.stepsPerBeat === 'number') {
            track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + (track.loopPointStep ?? 0)
            recalcLoopDerived(track)
        }
        return track
    }

    _incrementPatternVersionByTrack(track) {
        // Find the pattern containing this track to increment its version
        for (const pattern of appState.patterns) {
            if (Utils.getTracksArray(pattern).includes(track)) {
                pattern._version = (pattern._version ?? 0) + 1
                break
            }
        }
    }

    isNoteAt = (track, beat, beatStep) => {
        let notes = []
        Object.values(track.notes).forEach((note) => {
            if (note.beatStep === beatStep && note.beat === beat) {
                notes.push(note)
            }
        })
        return notes
    }

    deleteNote = (track, selNote) => {
        let i = 0
        let deleted = false
        Object.values(track.notes).forEach((note) => {
            if (note.beatStep === selNote.beatStep && note.beat === selNote.beat) {
                track.notes.splice(i, 1)
                deleted = true
            }
            i++
        })
        if (deleted) {
            this._incrementPatternVersionByTrack(track)
        }
    }

    addNote = (track, beat, beatStep, pitch = 0) => {
        let steppc = Math.round((beatStep * 100) / track.stepsPerBeat)
        if (steppc > 100) {
            track.stepsPerBeat = 8
            steppc = Math.round((beatStep * 100) / track.stepsPerBeat)
        }
        const note = {
            ...Utils.NOTE_DEFAULTS,
            beatStep,
            steppc,
            beat,
            pitch
        }
        track.notes.push(note)
        this._incrementPatternVersionByTrack(track)
        return note
    }

    addTrack = (pattern, type, stepsPerBeat = 4) => {
        // console.log("mfCmd::addTrack " + pattern.name + " = " + type)

        let track = this.createTrack(pattern.nbBeats, type, stepsPerBeat);
        pattern.tracks.push(track)
        return track
    }

    createTrack = (nbBeats, name, stepsPerBeat = 4) => {
        const newTrack = normalizeTrack({
            name,
            nbBeats: nbBeats,
            stepsPerBeat,
            loopAtStep: nbBeats * stepsPerBeat,
            pan: Utils.getPanFromTrackName(name),
        })
        recalcLoopDerived(newTrack)
        return newTrack
    }

    addPattern = (name) => {
        let pattern = this.createPattern(name)
        appState.patterns.push(pattern)
        return pattern
    }

    getPatternByName = (name) => {
        const normalizedName = String(name ?? '').trim().toUpperCase()
        return appState.patterns.find((pattern) => pattern?.name?.toUpperCase() === normalizedName) ?? null
    }

    setPatternBpm = (pattern, bpm) => {
        const bpmNum = Number(bpm)
        pattern.bpm = Number.isFinite(bpmNum) && bpmNum !== 0
            ? bpmNum
            : (logger.warn('Command', 'bpm NaN/0', bpm), MfDefaults.getPatternProp({}, 'bpm'))
        return pattern
    }

    setPatternDescription = (pattern, description) => {
        pattern.description = String(description ?? '')
        return pattern
    }

    importPatternFromJson = (sourcePattern) => {
        return importPatternFromJson(
            sourcePattern,
            (name) => this.addPattern(name),
            (pattern, name) => this.addTrack(pattern, name),
            (track, beat, beatStep, pitch) => this.addNote(track, beat, beatStep, pitch)
        )
    }

    createPattern = (name) => {
        if (!name) {
            let nb = 0
            if (appState.patterns.length) {
                nb = appState.patterns.length
            }
            name = "NewPat_" + nb
        }
        let pattern = {
            "name": name,
            "description": "",
            "tracks": [],
            "bpm": 120,
            "nbBeats": 4
        }
        return pattern
    }

    kitIsLoaded = (drumkit) => {
        return Object.values(soundRegistry.sounds).some(sound => sound.kit_name === drumkit.name);
    }

    setSelectedDrumkitNum = async (num) => {
        try {
            appState.selectedDrumkitNum = num
            await serviceRegistry.mfResourcesLoader.loadMissingSamplesFromDrumkits([soundRegistry.drumkitList[num]])
            await this.autoAssignSoundsForNewDrumkit()
            playbackEvents.dispatchDrumkitChange()
        } catch (err) {
            console.error('cmd::setSelectedDrumkitNum failed', err)
        }
    }

    autoAssignSoundsForNewDrumkit = async () => {
        try {
            let selPattern = appState.patterns[appState.selectedPatternNum]
            serviceRegistry.mfSeq.setBpm(selPattern.bpm)
            const mfAutoAssign = await getAutoAssignService()
            mfAutoAssign.autoAssignSounds(selPattern)
            serviceRegistry.mfPatterns.computeFlatNotesFromPattern(selPattern, 0, serviceRegistry.audioCtx)
            serviceRegistry.audioEngine?.invalidateCache()
        } catch (err) {
            console.error('cmd::autoAssignSoundsForNewDrumkit failed', err)
        }
    }

    setSelectedPatternNum = async (num) => {
        try {
            if (appState.patterns.length > 0) {
                //console.log("mfCmd::setSelectedPatternNum " + num + " = " + appState.patterns[num].name)
                appState.selectedPatternNum = num
                let selPattern = appState.patterns[appState.selectedPatternNum]
                serviceRegistry.mfSeq.setBpm(selPattern.bpm)
                if (Object.keys(soundRegistry.sounds).length > 0) {
                    const mfAutoAssign = await getAutoAssignService()
                    mfAutoAssign.autoAssignSounds(selPattern)
                }
                serviceRegistry.mfPatterns.computeFlatNotesFromPattern(selPattern, 0, serviceRegistry.audioCtx)
                // console.log(flatnotes)
            }
        } catch (err) {
            console.error('cmd::setSelectedPatternNum failed', err)
        }
    }


    getTrackFromType = (pattern, type) => {
        return Utils.getTracksArray(pattern).find(track => track.name === type) ?? null
    }



    setNbBeats = (pattern, newBeats) => {
        let oldBeats = pattern.nbBeats * (Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4)
        pattern.nbBeats = newBeats * 4
        Utils.getTracksArray(pattern).forEach((track, indexTrack) => {
            if (track.loopAtStep >= oldBeats) {
                track.loopAtStep = pattern.nbBeats * track.stepsPerBeat
                recalcLoopDerived(track)
            }
            track.nbBeats = pattern.nbBeats
        })
    }

    incrNbStepPerBar = (track) => {
        let loopStepPc = Math.round((track.loopPointStep * 100) / track.stepsPerBeat)
        track.stepsPerBeat++
        if (track.stepsPerBeat > 8) {
            track.stepsPerBeat = 1
        }

        Object.values(track.notes).forEach((note) => {
            note.beatStep = Math.floor((note.steppc / 100) * track.stepsPerBeat)
        })
        track.loopPointStep = Math.floor((loopStepPc / 100) * track.stepsPerBeat)
        track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
    }

    incrLoopPoint = (track) => {
        track.loopAtStep--
        if (track.loopAtStep < 1) {
            track.loopAtStep = track.stepsPerBeat * track.nbBeats
        }
        recalcLoopDerived(track)
    }

    cleanPattern = (pattern) => { 
        Utils.getTracksArray(pattern).forEach((track) => {
            this.cleanTrack(track )
        })
    }

    cleanTrack = (track)=> {
        track.notes = []
        track.loopPointStep = 0
        track.loopPointBeat = track.nbBeats
        track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
    }

    getAllSoundsForType(soundKey) {
        let retSounds = []
        for (const soundId in soundRegistry.sounds) {
            if (soundRegistry.sounds[soundId].key === soundKey) {
                retSounds.push(soundRegistry.sounds[soundId])
            }
        }
        return retSounds
    }

    changeTrackSound = (track, soundId) => {
        track.soundId = soundId
        track.useAutoAssignSound = false
        track.useSoftSynth = false
        track.sampleDecay = 0.5
    }

    changeTrackName = (track, newName) => {
        track.name = newName
        track.sampleDecay = 0.5
    }

    getSoundIdFromUrl = (url) => {
        for (const soundId in soundRegistry.sounds) {
            if (soundRegistry.sounds[soundId].url === url) {
                return soundId;
            }
        }
        return NOT_FOUND;
    }

}
