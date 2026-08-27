import { NOT_FOUND } from '../../core/constants.js'
import Utils from '../../core/utils.js'
import Defaults from '../../patterns/defaults.js'
import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { getAutoAssignService, getHistoryService } from '../../state/service_loader.js'
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
        this._history = null
        this._suppressRecord = false
    }

    _getHistory() {
        if (!this._history) {
            this._history = serviceRegistry.history
        }
        return this._history
    }

    _record(undoFn, meta = {}) {
        if (this._suppressRecord) return
        const history = this._getHistory()
        if (history) {
            history.record({ execute: () => {}, undo: undoFn, meta })
        }
    }

    _recordExec(executeFn, undoFn, meta = {}) {
        const history = this._getHistory()
        if (history) {
            return history.execute(executeFn, undoFn, meta)
        }
        return executeFn()
    }

    _persist = () => {
        serviceRegistry.resourcesLoader?.persistPatterns?.()
    }

    beginGenerationUndo = (pattern) => {
        this._genSnapshot = {
            pattern,
            savedTracksLength: (pattern.tracks ?? []).length,
            trackSnapshots: (pattern.tracks ?? []).map(t => ({
                ref: t,
                notes: t.notes.map(n => ({ ...n })),
                loopPointStep: t.loopPointStep,
                loopPointBeat: t.loopPointBeat,
                loopAtStep: t.loopAtStep,
            })),
        }
        this._suppressRecord = true
    }

    commitGenerationUndo = (desc = 'Generate pattern') => {
        const snap = this._genSnapshot
        if (!snap) return
        this._suppressRecord = false
        this._record(() => {
            for (const ts of snap.trackSnapshots) {
                ts.ref.notes = ts.notes
                ts.ref.loopPointStep = ts.loopPointStep
                ts.ref.loopPointBeat = ts.loopPointBeat
                ts.ref.loopAtStep = ts.loopAtStep
            }
            if (snap.pattern.tracks && snap.pattern.tracks.length > snap.savedTracksLength) {
                snap.pattern.tracks.length = snap.savedTracksLength
            }
            this._incrementPatternVersionByTrack(snap.pattern.tracks[0])
            this._persist()
        }, { desc })
        this._genSnapshot = null
    }

    // Safe updater for track properties
    // Accepts a track object and a updates object. Only whitelisted keys are applied.
    // Extra or unknown keys are ignored gracefully to avoid runtime errors when callers
    // pass a larger payload (beats, stepsPerBeat, pan, reverbAmount, etc.).
updateTrack = (track, updates) => {
        if (!track || !updates || typeof updates !== 'object') {
            return track
        }

        const oldValues = {}
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
                oldValues[k] = track[k]
                track[k] = clamped
                changed = true
            }
        }

        if (changed) {
            this._incrementPatternVersionByTrack(track)
            this._persist()
            this._record(() => {
                for (const [k, v] of Object.entries(oldValues)) {
                    track[k] = v
                }
                this._incrementPatternVersionByTrack(track)
                this._persist()
            }, { desc: 'Update track' })
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

    deleteNote = (track, selNote) => {
        const values = Object.values(track.notes)
        for (let i = values.length - 1; i >= 0; i--) {
            const note = values[i]
            if (note.beatStep === selNote.beatStep && note.beat === selNote.beat && (note.pitch ?? 0) === (selNote.pitch ?? 0)) {
                const deletedNote = { ...note }
                const noteIndex = track.notes.indexOf(note)
                track.notes.splice(noteIndex, 1)
                this._incrementPatternVersionByTrack(track)
                this._persist()
                this._record(() => {
                    track.notes.splice(noteIndex, 0, deletedNote)
                    this._incrementPatternVersionByTrack(track)
                    this._persist()
                }, { desc: 'Delete note' })
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
        const noteIndex = track.notes.length
        track.notes.push(note)
        this._incrementPatternVersionByTrack(track)
        this._persist()
        this._record(() => {
            track.notes.splice(noteIndex, 1)
            this._incrementPatternVersionByTrack(track)
            this._persist()
        }, { desc: 'Add note' })
        return note
    }

    addTrack = (pattern, type, stepsPerBeat = 4) => {

        let track = this.createTrack(pattern.nbBeats, type, stepsPerBeat);
        const trackIndex = pattern.tracks.length
        pattern.tracks.push(track)
        this._persist()
        this._record(() => {
            pattern.tracks.splice(trackIndex, 1)
            this._persist()
        }, { desc: 'Add track' })
        return track
    }

    removeTrack = (pattern, trackIdx) => {
        const tracks = pattern.tracks
        if (trackIdx < 0 || trackIdx >= tracks.length) return
        const removed = tracks[trackIdx]
        const removedNotes = removed.notes.map(n => ({ ...n }))
        tracks.splice(trackIdx, 1)
        this._persist()
        this._record(() => {
            tracks.splice(trackIdx, 0, removed)
            removed.notes = removedNotes
            this._persist()
        }, { desc: 'Remove track' })
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
        const patternIndex = appState.patterns.length
        appState.patterns.push(pattern)
        this._persist()
        this._record(() => {
            appState.patterns.splice(patternIndex, 1)
            this._persist()
        }, { desc: 'Add pattern' })
        return pattern
    }

    removePattern = (idx) => {
        if (appState.patterns.length <= 1) return false
        const removedPattern = appState.patterns[idx]
        appState.patterns.splice(idx, 1)
        if (appState.selectedPatternNum >= appState.patterns.length) {
            appState.selectedPatternNum = appState.patterns.length - 1
        }
        this._persist()
        this._record(() => {
            appState.patterns.splice(idx, 0, removedPattern)
            this._persist()
        }, { desc: 'Remove pattern' })
        return true
    }

    renamePattern = (idx, newName) => {
        const pat = appState.patterns[idx]
        if (!pat) return
        const oldName = pat.name
        pat.name = String(newName ?? '').trim() || pat.name
        this._persist()
        this._record(() => {
            pat.name = oldName
            this._persist()
        }, { desc: 'Rename pattern' })
    }

    getPatternByName = (name) => {
        const normalizedName = String(name ?? '').trim().toUpperCase()
        return appState.patterns.find((pattern) => pattern?.name?.toUpperCase() === normalizedName) ?? null
    }

    setPatternBpm = (pattern, bpm) => {
        const bpmNum = Number(bpm)
        const oldBpm = pattern.bpm
        if (!Number.isFinite(bpmNum) || bpmNum === 0) {
            logger.warn('Command', 'bpm NaN/0', bpm)
            pattern.bpm = Defaults.getPatternProp({}, 'bpm')
        } else {
            pattern.bpm = bpmNum
        }
        this._persist()
        this._record(() => {
            pattern.bpm = oldBpm
            this._persist()
        }, { desc: 'Set BPM' })
        return pattern
    }

    setPatternDescription = (pattern, description) => {
        const oldDescription = pattern.description
        pattern.description = String(description ?? '')
        this._persist()
        this._record(() => {
            pattern.description = oldDescription
            this._persist()
        }, { desc: 'Set description' })
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
                appState.selectedPatternNum = num
                let selPattern = appState.patterns[appState.selectedPatternNum]
                serviceRegistry.seq.setBpm(selPattern.bpm)
                if (Object.keys(soundRegistry.sounds).length > 0) {
                    const autoAssign = await getAutoAssignService()
                    autoAssign.autoAssignSounds(selPattern)
                }
                serviceRegistry.patterns.computeFlatNotesFromPattern(selPattern, 0, serviceRegistry.audioCtx)
                playbackEvents.emit("selectedPatternChange")
            }
        } catch (err) {
            logger.error('Commander', 'cmd::setSelectedPatternNum failed', err)
        }
    }

    incrNbStepPerBar = (track) => {
        const oldStepsPerBeat = track.stepsPerBeat
        const oldLoopPointStep = track.loopPointStep
        const oldLoopAtStep = track.loopAtStep
        const oldNotes = track.notes.map(n => ({ ...n }))

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
        this._record(() => {
            track.stepsPerBeat = oldStepsPerBeat
            track.loopPointStep = oldLoopPointStep
            track.loopAtStep = oldLoopAtStep
            track.notes = oldNotes
            this._persist()
        }, { desc: 'Inc steps per bar' })
    }

    incrLoopPoint = (track) => {
        const oldLoopAtStep = track.loopAtStep
        const oldLoopPointBeat = track.loopPointBeat
        const oldLoopPointStep = track.loopPointStep

        track.loopAtStep--
        if (track.loopAtStep < 1) {
            track.loopAtStep = track.stepsPerBeat * track.nbBeats
        }
        recalcLoopDerived(track)
        this._persist()
        this._record(() => {
            track.loopAtStep = oldLoopAtStep
            track.loopPointBeat = oldLoopPointBeat
            track.loopPointStep = oldLoopPointStep
            this._persist()
        }, { desc: 'Inc loop point' })
    }

    cleanPattern = (pattern) => { 
        Utils.getTracksArray(pattern).forEach((track) => {
            this.cleanTrack(track )
        })
    }

    cleanTrack = (track)=> {
        const oldNotes = track.notes.map(n => ({ ...n }))
        const oldLoopPointStep = track.loopPointStep
        const oldLoopPointBeat = track.loopPointBeat
        const oldLoopAtStep = track.loopAtStep
        track.notes = []
        track.loopPointStep = 0
        track.loopPointBeat = track.nbBeats
        track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
        this._record(() => {
            track.notes = oldNotes
            track.loopPointStep = oldLoopPointStep
            track.loopPointBeat = oldLoopPointBeat
            track.loopAtStep = oldLoopAtStep
            this._persist()
        }, { desc: 'Clean track' })
    }

    compactTrack = (track) => {
        const oldNotes = track.notes.map(n => ({ ...n }))
        const oldLoopPointStep = track.loopPointStep
        const oldLoopPointBeat = track.loopPointBeat
        const oldLoopAtStep = track.loopAtStep
        const result = Utils.addLoopToTrackIfPossible(track)
        if (result.changed) {
            this._record(() => {
                track.notes = oldNotes
                track.loopPointStep = oldLoopPointStep
                track.loopPointBeat = oldLoopPointBeat
                track.loopAtStep = oldLoopAtStep
                this._persist()
            }, { desc: 'Compact tracks' })
        }
        return result
    }

    randomizeTrack = (track, pattern) => {
        const oldNotes = track.notes.map(n => ({ ...n }))
        const oldLoopPointStep = track.loopPointStep
        const oldLoopPointBeat = track.loopPointBeat
        const oldLoopAtStep = track.loopAtStep
        track.notes = []
        track.loopPointStep = 0
        track.loopPointBeat = track.nbBeats ?? pattern.nbBeats ?? 4
        track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
        const beats = track.nbBeats ?? pattern.nbBeats ?? 4
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const totalSteps = beats * stepsPerBeat
        const noteCount = Math.max(1, Math.floor(totalSteps * (0.15 + Math.random() * 0.2)))
        const used = new Set()
        for (let i = 0; i < noteCount; i++) {
            let step
            do { step = Math.floor(Math.random() * totalSteps) } while (used.has(step))
            used.add(step)
            const beat = Math.floor(step / stepsPerBeat)
            const beatStep = step % stepsPerBeat
            const pitch = Math.floor(Math.random() * 13) - 6
            track.notes.push({ ...Utils.NOTE_DEFAULTS, beat, beatStep, pitch, velocity: 0.5 + Math.random() * 0.5 })
        }
        this._record(() => {
            track.notes = oldNotes
            track.loopPointStep = oldLoopPointStep
            track.loopPointBeat = oldLoopPointBeat
            track.loopAtStep = oldLoopAtStep
            this._persist()
        }, { desc: 'Randomize track' })
    }

    changeTrackSound = (track, soundId) => {
        const oldSoundId = track.soundId
        const oldUseAutoAssign = track.useAutoAssignSound
        const oldUseSoftSynth = track.useSoftSynth
        track.soundId = soundId
        track.useAutoAssignSound = false
        track.useSoftSynth = false
        this._persist()
        this._record(() => {
            track.soundId = oldSoundId
            track.useAutoAssignSound = oldUseAutoAssign
            track.useSoftSynth = oldUseSoftSynth
            this._persist()
        }, { desc: 'Change track sound' })
    }

    changeTrackName = (track, newName) => {
        const oldName = track.name
        track.name = newName
        this._persist()
        this._record(() => {
            track.name = oldName
            this._persist()
        }, { desc: 'Change track name' })
    }

    getSoundIdFromUrl = (url) => {
        const entry = Object.entries(soundRegistry.sounds).find(([, s]) => s.url === url)
        return entry?.[0] ?? NOT_FOUND
    }

}
