import { NOT_FOUND } from '../../core/constants.js'
import Utils from '../../core/utils.js'
import Defaults from '../../patterns/defaults.js'
import { appState } from '../../state/app_state.js'
import { getAutoAssignService, serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { playbackEvents } from '../../state/playback_events.js'
import { normalizeTrack, TRACK_DEFAULTS, TRACK_VALUE_RANGES, recalcLoopDerived } from '../../model/track_schema.js'
import { importPatternFromJson } from './pattern_import.js'
import { logger } from "../../core/logger.js"

export default class Commander {
    static TAG = "Commander"
    static #DERIVED_KEYS = new Set(['loopPointBeat', 'loopPointStep'])
    static #TRACK_KEY_SET = new Set(Object.keys(TRACK_DEFAULTS))

    constructor() {
    }

    _persist = () => {
        serviceRegistry.resourcesLoader?.persistPatterns?.()
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
        for (const [k, v] of Object.entries(updates)) {
            if (Commander.#DERIVED_KEYS.has(k) || !Commander.#TRACK_KEY_SET.has(k)) continue
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

        if (changed) {
            this._incrementPatternVersionByTrack(track)
            this._persist()
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

    isNoteAt = (track, beat, beatStep) =>
        Object.values(track.notes).filter(n => n.beatStep === beatStep && n.beat === beat)

    deleteNote = (track, selNote) => {
        const values = Object.values(track.notes)
        for (let i = values.length - 1; i >= 0; i--) {
            const note = values[i]
            if (note.beatStep === selNote.beatStep && note.beat === selNote.beat && (note.pitch ?? 0) === (selNote.pitch ?? 0)) {
                track.notes.splice(track.notes.indexOf(note), 1)
                this._incrementPatternVersionByTrack(track)
                this._persist()
                return
            }
        }
    }

    addNote = (track, beat, beatStep, pitch = 0) => {
        let steppc = Math.round((beatStep * 100) / track.stepsPerBeat)
        if (steppc > 100) {
            logger.warn('Cmd', `stepsPerBeat override ${track.stepsPerBeat} → 8 (beatStep ${beatStep})`)
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
        this._persist()
        return note
    }

    addTrack = (pattern, type, stepsPerBeat = 4) => {
        // console.log("cmd::addTrack " + pattern.name + " = " + type)

        let track = this.createTrack(pattern.nbBeats, type, stepsPerBeat);
        pattern.tracks.push(track)
        this._persist()
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
        this._persist()
        return pattern
    }

    removePattern = (idx) => {
        if (appState.patterns.length <= 1) return false
        appState.patterns.splice(idx, 1)
        if (appState.selectedPatternNum >= appState.patterns.length) {
            appState.selectedPatternNum = appState.patterns.length - 1
        }
        this._persist()
        return true
    }

    renamePattern = (idx, newName) => {
        const pat = appState.patterns[idx]
        if (pat) pat.name = String(newName ?? '').trim() || pat.name
        this._persist()
    }

    getPatternByName = (name) => {
        const normalizedName = String(name ?? '').trim().toUpperCase()
        return appState.patterns.find((pattern) => pattern?.name?.toUpperCase() === normalizedName) ?? null
    }

    setPatternBpm = (pattern, bpm) => {
        const bpmNum = Number(bpm)
        pattern.bpm = Number.isFinite(bpmNum) && bpmNum !== 0
            ? bpmNum
            : (logger.warn('Command', 'bpm NaN/0', bpm), Defaults.getPatternProp({}, 'bpm'))
        this._persist()
        return pattern
    }

    setPatternDescription = (pattern, description) => {
        pattern.description = String(description ?? '')
        this._persist()
        return pattern
    }

    importPatternFromJson = (sourcePattern) => {
        const result = importPatternFromJson(
            sourcePattern,
            (name) => this.addPattern(name),
            (pattern, name) => this.addTrack(pattern, name),
            (track, beat, beatStep, pitch) => this.addNote(track, beat, beatStep, pitch)
        )
        this._persist()
        return result
    }

    createPattern = (name) => {
        name ??= `NewPat_${appState.patterns.length}`
        return { name, description: "", tracks: [], bpm: 120, nbBeats: 4 }
    }

    kitIsLoaded = (drumkit) => {
        return Object.values(soundRegistry.sounds).some(sound => sound.kit_name === drumkit.name);
    }

    setSelectedDrumkitNum = async (num) => {
        try {
            appState.selectedDrumkitNum = num
            await serviceRegistry.resourcesLoader.loadMissingSamplesFromDrumkits([soundRegistry.drumkitList[num]])
            await this.autoAssignSoundsForNewDrumkit()
            playbackEvents.emit("drumkitChange")
        } catch (err) {
            logger.error('Commander', 'cmd::setSelectedDrumkitNum failed', err)
        }
    }

    autoAssignSoundsForNewDrumkit = async () => {
        try {
            let selPattern = appState.patterns[appState.selectedPatternNum]
            serviceRegistry.seq.setBpm(selPattern.bpm)
            const autoAssign = await getAutoAssignService()
            autoAssign.autoAssignSounds(selPattern)
            serviceRegistry.patterns.computeFlatNotesFromPattern(selPattern, 0, serviceRegistry.audioCtx)
            serviceRegistry.audioEngine?.invalidateCache()
        } catch (err) {
            logger.error('Commander', 'cmd::autoAssignSoundsForNewDrumkit failed', err)
        }
    }

    setSelectedPatternNum = async (num) => {
        try {
            if (appState.patterns.length > 0) {
                //console.log("cmd::setSelectedPatternNum " + num + " = " + appState.patterns[num].name)
                appState.selectedPatternNum = num
                let selPattern = appState.patterns[appState.selectedPatternNum]
                serviceRegistry.seq.setBpm(selPattern.bpm)
                if (Object.keys(soundRegistry.sounds).length > 0) {
                    const autoAssign = await getAutoAssignService()
                    autoAssign.autoAssignSounds(selPattern)
                }
                serviceRegistry.patterns.computeFlatNotesFromPattern(selPattern, 0, serviceRegistry.audioCtx)
                // console.log(flatnotes)
            }
        } catch (err) {
            logger.error('Commander', 'cmd::setSelectedPatternNum failed', err)
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
        this._persist()
    }

    incrNbStepPerBar = (track) => {
        let loopStepPc = Math.round((track.loopPointStep * 100) / track.stepsPerBeat)
        track.stepsPerBeat++
        if (track.stepsPerBeat > 8) {
            track.stepsPerBeat = 1
        }

        Object.values(track.notes).forEach((note) => {
            note.beatStep = Math.min(Math.round((note.steppc / 100) * track.stepsPerBeat), track.stepsPerBeat - 1)
        })
        track.loopPointStep = Math.floor((loopStepPc / 100) * track.stepsPerBeat)
        track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
        this._persist()
    }

    incrLoopPoint = (track) => {
        track.loopAtStep--
        if (track.loopAtStep < 1) {
            track.loopAtStep = track.stepsPerBeat * track.nbBeats
        }
        recalcLoopDerived(track)
        this._persist()
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
        return Object.values(soundRegistry.sounds).filter(s => s.key === soundKey)
    }

    changeTrackSound = (track, soundId) => {
        track.soundId = soundId
        track.useAutoAssignSound = false
        track.useSoftSynth = false
        this._persist()
    }

    changeTrackName = (track, newName) => {
        track.name = newName
        this._persist()
    }

    getSoundIdFromUrl = (url) => {
        const entry = Object.entries(soundRegistry.sounds).find(([, s]) => s.url === url)
        return entry?.[0] ?? NOT_FOUND
    }

}
