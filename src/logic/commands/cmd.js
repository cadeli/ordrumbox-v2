import Utils from '../../core/utils.js'
import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { logger } from '../../core/logger.js'
import { TRACK_DEFAULTS, TRACK_VALUE_RANGES, recalcLoopDerived } from '../../model/track_schema.js'
import { createNoteMethods } from './cmd/cmd_notes.js'
import { createTrackMethods } from './cmd/cmd_tracks.js'
import { createPatternMethods } from './cmd/cmd_patterns.js'
import { createSelectionMethods } from './cmd/cmd_selection.js'

export default class Commander {
    static TAG = 'Commander'
    static #DERIVED_KEYS = new Set(['loopPointBeat', 'loopPointStep'])
    static #TRACK_KEY_SET = new Set(Object.keys(TRACK_DEFAULTS))
    static TRACK_VALUE_RANGES = TRACK_VALUE_RANGES

    _history
    #suppressRecord
    #genSnapshot

    constructor() {
        this._history = null
        this.#suppressRecord = false

        // Bind methods from sub-modules
        Object.assign(this, createNoteMethods(this))
        Object.assign(this, createTrackMethods(this))
        Object.assign(this, createPatternMethods(this))
        Object.assign(this, createSelectionMethods(this))
    }

    getHistory() {
        if (!this._history) {
            this._history = serviceRegistry.history
        }
        return this._history
    }

    /**
     * Record a reversible command.
     * @param {object} command
     * @param {Function} command.execute - re-applies the change (redo)
     * @param {Function} command.undo - reverts the change
     * @param {string} [command.desc] - human-readable label (toolbar tooltips)
     *
     * The change is ALREADY applied when record() is called — execute only
     * replays it on redo. A missing execute degrades to "undo works, redo is
     * blocked loudly" (never a silent no-op that corrupts the stack).
     */
    record({ execute, undo, desc = '' } = {}) {
        if (this.#suppressRecord) return
        if (typeof undo !== 'function') {
            logger.error('Commander', 'record skipped: missing undo closure', desc)
            return
        }
        const history = this.getHistory()
        if (!history) return
        if (typeof execute !== 'function') {
            logger.error('Commander', 'record: missing execute closure — redo unavailable', desc)
        }
        history.record({
            execute: typeof execute === 'function' ? execute : null,
            undo,
            meta: { desc },
        })
    }

    /**
     * Run fn with history recording suppressed (previous state restored even
     * on throw) — used by loadSong() so boot does not fill the undo stack.
     */
    withSuppressedRecord(fn) {
        const prev = this.#suppressRecord
        this.#suppressRecord = true
        try {
            return fn()
        } finally {
            this.#suppressRecord = prev
        }
    }

    /**
     * Run fn as ONE undoable history entry: inner cmd.record calls are
     * suppressed and a single before/after snapshot command is recorded
     * instead (used by MIDI/JSON/song imports).
     * @param {string} desc - history label
     * @param {Function} fn - synchronous action to run
     * @returns {any} fn's return value (partial mutations are still recorded if it throws)
     */
    recordTransaction(desc, fn) {
        const before = this.#snapshotState()
        let result
        try {
            result = this.withSuppressedRecord(fn)
        } finally {
            const after = this.#snapshotState()
            if (before.keyJson !== after.keyJson) {
                this.record({
                    desc,
                    execute: () => this.#restoreState(after),
                    undo: () => this.#restoreState(before),
                })
            }
        }
        return result
    }

    #snapshotState() {
        const state = {
            patterns: structuredClone(appState.patterns),
            songInfos: structuredClone(appState.songInfos ?? {}),
            selectedPatternNum: appState.selectedPatternNum,
            selectedTrackNum: appState.selectedTrackNum,
        }
        return { ...state, keyJson: JSON.stringify(state) }
    }

    #restoreState(snap) {
        appState.patterns.splice(0, appState.patterns.length, ...structuredClone(snap.patterns))
        if (snap.songInfos) {
            appState.songInfos = { ...snap.songInfos }
        }
        appState.selectedPatternNum = Utils.clamp(
            snap.selectedPatternNum ?? 0,
            0,
            Math.max(0, appState.patterns.length - 1),
        )
        const tracks = Utils.getTracksArray(appState.patterns[appState.selectedPatternNum] ?? {})
        appState.selectedTrackNum = Utils.clamp(snap.selectedTrackNum ?? 0, 0, Math.max(0, tracks.length - 1))
        this.persist()
    }

    persist = () => {
        serviceRegistry.resourcesLoader?.persistPatterns?.()
    }

    incrementPatternVersionByTrack(track) {
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
        const newValues = {}
        let changed = false
        for (const [k, v] of Object.entries(updates)) {
            if (Commander.#DERIVED_KEYS.has(k) || !Commander.#TRACK_KEY_SET.has(k)) continue
            let clamped = v
            const range = TRACK_VALUE_RANGES[k]
            if (range && typeof v === 'number' && Number.isFinite(v)) {
                clamped = Utils.clamp(v, range.min, range.max)
            }
            if (track[k] !== clamped) {
                oldValues[k] = track[k]
                newValues[k] = clamped
                track[k] = clamped
                changed = true
            }
        }

        if (changed) {
            const applyValues = (values) => {
                for (const [k, v] of Object.entries(values)) {
                    track[k] = v
                }
                if (typeof track.stepsPerBeat === 'number' && typeof track.loopAtStep === 'number') {
                    recalcLoopDerived(track)
                }
                this.incrementPatternVersionByTrack(track)
                this.persist()
            }
            applyValues(newValues)
            this.record({
                desc: `Update ${track.name}`,
                execute: () => applyValues(newValues),
                undo: () => applyValues(oldValues),
            })
        }

        if (typeof track.stepsPerBeat === 'number' && typeof track.loopAtStep === 'number') {
            recalcLoopDerived(track)
        }

        if (
            track.loopAtStep === undefined &&
            typeof track.loopPointBeat === 'number' &&
            typeof track.stepsPerBeat === 'number'
        ) {
            track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + (track.loopPointStep ?? 0)
            recalcLoopDerived(track)
        }
        return track
    }

    beginGenerationUndo = (pattern) => {
        this.#genSnapshot = {
            pattern,
            savedTracksLength: (pattern.tracks ?? []).length,
            trackSnapshots: (pattern.tracks ?? []).map((t) => ({
                ref: t,
                notes: t.notes.map((n) => ({ ...n })),
                loopPointStep: t.loopPointStep,
                loopPointBeat: t.loopPointBeat,
                loopAtStep: t.loopAtStep,
            })),
        }
        this.#suppressRecord = true
    }

    commitGenerationUndo = (desc = 'Generate pattern') => {
        const snap = this.#genSnapshot
        if (!snap) return
        this.#suppressRecord = false
        const cloneState = (pattern) => ({
            tracks: pattern.tracks.slice(),
            trackStates: pattern.tracks.map((t) => ({
                ref: t,
                notes: t.notes.map((n) => ({ ...n })),
                loopPointStep: t.loopPointStep,
                loopPointBeat: t.loopPointBeat,
                loopAtStep: t.loopAtStep,
            })),
        })
        const before = { tracks: snap.trackSnapshots.map((st) => st.ref), trackStates: snap.trackSnapshots }
        const after = cloneState(snap.pattern)
        const applySnapshot = ({ tracks, trackStates }) => {
            snap.pattern.tracks.splice(0, snap.pattern.tracks.length, ...tracks)
            for (const st of trackStates) {
                st.ref.notes = st.notes.map((n) => ({ ...n }))
                st.ref.loopPointStep = st.loopPointStep
                st.ref.loopPointBeat = st.loopPointBeat
                st.ref.loopAtStep = st.loopAtStep
            }
            snap.pattern._version = (snap.pattern._version ?? 0) + 1
            this.persist()
        }
        this.record({
            desc,
            execute: () => applySnapshot(after),
            undo: () => applySnapshot(before),
        })
        this.#genSnapshot = null
    }

    /** Abort a generation transaction without recording — re-enables #suppressRecord. Safe to call anytime. */
    cancelGenerationUndo = () => {
        this.#suppressRecord = false
        this.#genSnapshot = null
    }
}
