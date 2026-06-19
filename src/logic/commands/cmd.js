import { NOT_FOUND } from '../../core/constants.js'
import Utils from '../../core/utils.js'
import MfDefaults from '../../patterns/defaults.js'
import { appState } from '../../state/app_state.js'
import { getAutoAssignService, serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { playbackEvents } from '../../state/playback_events.js'
import { normalizeTrack, TRACK_DEFAULTS, recalcLoopDerived } from '../../model/track_schema.js'
import { importPatternFromJson } from './pattern_import.js'
import { logger } from "../../core/logger.js"

export default class MfCmd {
    static TAG = "MFCMD"

    constructor() {
    }

    // Safe updater for track properties
    // Accepts a track object and a updates object. Only whitelisted keys are applied.
    // Extra or unknown keys are ignored gracefully to avoid runtime errors when callers
    // pass a larger payload (bars, barQuantize, pan, reverbAmount, etc.).
    updateTrack = (track, updates) => {
        if (!track || !updates || typeof updates !== 'object') {
            return track
        }
        
        let changed = false
        // Derived properties are handled separately
        const derivedKeys = new Set(['loopPointBar', 'loopPointStep'])
        const allTrackKeys = new Set(Object.keys(TRACK_DEFAULTS))
        
        for (const [k, v] of Object.entries(updates)) {
            if (allTrackKeys.has(k) && !derivedKeys.has(k)) {
                if (track[k] !== v) {
                    track[k] = v
                    changed = true
                }
            }
        }

        if (changed) {
            this._incrementPatternVersionByTrack(track)
        }

        if (typeof track.barQuantize === 'number' && typeof track.loopAtStep === 'number') {
            recalcLoopDerived(track)
        }

        if (track.loopAtStep === undefined && typeof track.loopPointBar === 'number' && typeof track.barQuantize === 'number') {
            track.loopAtStep = track.loopPointBar * track.barQuantize + (track.loopPointStep ?? 0)
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

    isNoteAt = (track, bar, barStep) => {
        let notes = []
        Object.values(track.notes).forEach((note) => {
            if (note.barStep === barStep && note.bar === bar) {
                notes.push(note)
            }
        })
        return notes
    }

    deleteNote = (track, selNote) => {
        let i = 0
        let deleted = false
        Object.values(track.notes).forEach((note) => {
            if (note.barStep === selNote.barStep && note.bar === selNote.bar) {
                track.notes.splice(i, 1)
                deleted = true
            }
            i++
        })
        if (deleted) {
            this._incrementPatternVersionByTrack(track)
        }
    }

    addNote = (track, bar, barStep, pitch = 0) => {
        let steppc = Math.round((barStep * 100) / track.barQuantize)
        if (steppc > 100) {
            track.barQuantize = 8
            steppc = Math.round((barStep * 100) / track.barQuantize)
        }
        const note = {
            ...Utils.NOTE_DEFAULTS,
            barStep,
            steppc,
            bar,
            pitch
        }
        track.notes.push(note)
        this._incrementPatternVersionByTrack(track)
        return note
    }

    addTrack = (pattern, type, barQuantize = 4) => {
        // console.log("mfCmd::addTrack " + pattern.name + " = " + type)

        let track = this.createTrack(pattern.nbBars, type, barQuantize);
        pattern.tracks.push(track)
        return track
    }

    createTrack = (nbBars, name, barQuantize = 4) => {
        const newTrack = normalizeTrack({
            name,
            bars: nbBars,
            barQuantize,
            loopAtStep: nbBars * barQuantize,
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
        pattern.bpm = ((_v=>!Number.isNaN(_v) && _v !== 0 ? _v : (logger.warn('Command','bpm NaN/0',bpm),MfDefaults.getPatternProp({},'bpm')))(Number(bpm)))
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
            (track, bar, barStep, pitch) => this.addNote(track, bar, barStep, pitch)
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
            "nbBars": 4
        }
        return pattern
    }

    kitIsLoaded = (drumkit) => {
        return Object.values(soundRegistry.sounds).some(sound => sound.kit_name === drumkit.name);
    }

    setSelectedDrumkitNum = (num) => {
        appState.selectedDrumkitNum = num
        if (!this.kitIsLoaded(soundRegistry.drumkitList[num])) {
            serviceRegistry.mfResourcesLoader.loadSamplesFromDrumkit(soundRegistry.drumkitList[num], this.autoAssignSoundsForNewDrumkit)
        } else {
            this.autoAssignSoundsForNewDrumkit()
        }
        playbackEvents.dispatchDrumkitChange()
    }

    autoAssignSoundsForNewDrumkit = async () => {
        let selPattern = appState.patterns[appState.selectedPatternNum]
        serviceRegistry.mfSeq.setBpm(selPattern.bpm)
        const mfAutoAssign = await getAutoAssignService()
        mfAutoAssign.autoAssignSounds(selPattern)
        serviceRegistry.mfPatterns.computeFlatNotesFromPattern(selPattern, 0, serviceRegistry.audioCtx)
    }

    setSelectedPatternNum = async (num) => {
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
    }


    getTrackFromType = (pattern, type) => {
        return Utils.getTracksArray(pattern).find(track => track.name === type) ?? null
    }



    setNbBar = (pattern, newBar) => {
        let oldBar = pattern.nbBars * (Utils.getTracksArray(pattern)[0]?.barQuantize ?? 4)
        pattern.nbBars = newBar * 4
        Utils.getTracksArray(pattern).forEach((track, indexTrack) => {
            if (track.loopAtStep >= oldBar) {
                track.loopAtStep = pattern.nbBars * track.barQuantize
                recalcLoopDerived(track)
            }
            track.bars = pattern.nbBars
        })
    }

    incrNbStepPerBar = (track) => {
        let loopStepPc = Math.round((track.loopPointStep * 100) / track.barQuantize)
        track.barQuantize++
        if (track.barQuantize > 8) {
            track.barQuantize = 1
        }

        Object.values(track.notes).forEach((note) => {
            note.barStep = Math.floor((note.steppc / 100) * track.barQuantize)
        })
        track.loopPointStep = Math.floor((loopStepPc / 100) * track.barQuantize)
        track.loopAtStep = track.loopPointBar * track.barQuantize + track.loopPointStep
    }

    incrLoopPoint = (track) => {
        track.loopAtStep--
        if (track.loopAtStep < 1) {
            track.loopAtStep = track.barQuantize * track.bars
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
        track.loopPointBar = track.bars
        track.loopAtStep = track.loopPointBar * track.barQuantize + track.loopPointStep
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
        track.sampleLength = 1
    }

    changeTrackName = (track, newName) => {
        track.name = newName
        track.sampleLength = 1
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
