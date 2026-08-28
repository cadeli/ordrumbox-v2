import Utils from '../../core/utils.js'
import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { getHistoryService } from '../../state/service_loader.js'
import { TRACK_DEFAULTS, TRACK_VALUE_RANGES, recalcLoopDerived } from '../../model/track_schema.js'
import { createNoteMethods } from './cmd/cmd_notes.js'
import { createTrackMethods } from './cmd/cmd_tracks.js'
import { createPatternMethods } from './cmd/cmd_patterns.js'
import { createSelectionMethods } from './cmd/cmd_selection.js'

export default class Commander {
    static TAG = "Commander"
    static #DERIVED_KEYS = new Set(['loopPointBeat', 'loopPointStep'])
    static #TRACK_KEY_SET = new Set(Object.keys(TRACK_DEFAULTS))
    static TRACK_VALUE_RANGES = TRACK_VALUE_RANGES

    constructor() {
        this._history = null
        this._suppressRecord = false

        // Bind methods from sub-modules
        Object.assign(this, createNoteMethods(this))
        Object.assign(this, createTrackMethods(this))
        Object.assign(this, createPatternMethods(this))
        Object.assign(this, createSelectionMethods(this))
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

    _incrementPatternVersionByTrack(track) {
        for (const pattern of appState.patterns) {
            if (Utils.getTracksArray(pattern).includes(track)) {
                pattern._version = (pattern._version ?? 0) + 1
                break
            }
        }
    }

    updateTrack = (track, updates) => {
        if (!track || !updates || typeof updates !== 'object') {
            return track
        }

        const oldValues = {}
        let changed = false
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
}
