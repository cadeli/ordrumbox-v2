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
    #coalesceIds = new WeakMap()
    #coalesceSeq = 1

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
     * @param {string} [command.coalesceKey] - same key within the coalesce
     *   window merges with the previous entry (one undo step per gesture)
     * @param {object} [command.params] - parameter snapshot shown in the
     *   undo/redo report toast (key → value)
     * @param {object} [command.prev] - values the undo restores, for the
     *   "new → old" arrows in the report toast
     *
     * The change is ALREADY applied when record() is called — execute only
     * replays it on redo. A missing execute degrades to "undo works, redo is
     * blocked loudly" (never a silent no-op that corrupts the stack).
     */
    record({ execute, undo, desc = '', coalesceKey, params, prev } = {}) {
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
            meta: { desc, params: params ?? null, prev: prev ?? null },
            coalesceKey,
        })
    }

    /**
     * Stable identity for a mutable object (note, track, …) used to build
     * coalesce keys: continuous UI gestures must never merge edits belonging
     * to two different objects.
     * @param {object} obj
     * @returns {number} id unique for the lifetime of obj
     */
    coalesceId(obj) {
        let id = this.#coalesceIds.get(obj)
        if (id === undefined) {
            id = this.#coalesceSeq++
            this.#coalesceIds.set(obj, id)
        }
        return id
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
     * @param {object} [params] - parameter snapshot for the undo/redo report toast
     * @returns {any} fn's return value (partial mutations are still recorded if it throws)
     */
    recordTransaction(desc, fn, params = null) {
        const before = this.#snapshotState()
        let result
        try {
            result = this.withSuppressedRecord(fn)
        } finally {
            const after = this.#snapshotState()
            if (before.keyJson !== after.keyJson) {
                this.record({
                    desc,
                    params,
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

    /**
     * Apply a partial track update (known keys only, range-clamped), persist
     * and record one undoable entry.
     * @param {object} track
     * @param {object} updates - key → value (unknown/derived keys skipped)
     * @param {object} [opts]
     * @param {string} [opts.desc] - history label (defaults to "Update <name>")
     * @param {boolean} [opts.coalesce] - merge rapid same-key updates of this
     *   track into ONE undo step (slider/knob drags)
     * @returns {object} the track
     */
    updateTrack = (track, updates, { desc, coalesce = false } = {}) => {
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
            const coalesceKey = coalesce
                ? `track:${this.coalesceId(track)}:${Object.keys(newValues).sort().join(',')}`
                : undefined
            applyValues(newValues)
            this.record({
                desc: desc ?? `Update ${track.name}`,
                coalesceKey,
                params: { track: track.name, ...newValues },
                prev: { ...oldValues },
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

    /** Shallow-clones one state value: arrays/objects get a fresh container. */
    #cloneStateValue(value) {
        if (Array.isArray(value)) return value.map((v) => (v && typeof v === 'object' ? { ...v } : v))
        if (value && typeof value === 'object') return { ...value }
        return value
    }

    /**
     * Snapshot of EVERY own key of a track (notes, swing, LFOs, genre flags…)
     * — generators mutate far more than the note list.
     */
    #trackStateOf(track) {
        const state = {}
        for (const key of Object.keys(track)) {
            state[key] = this.#cloneStateValue(track[key])
        }
        return state
    }

    /** Restores a full track snapshot; keys created after the snapshot are deleted. */
    #restoreTrackState(track, state) {
        for (const key of Object.keys(track)) {
            if (!(key in state)) delete track[key]
        }
        for (const [key, value] of Object.entries(state)) {
            track[key] = this.#cloneStateValue(value)
        }
    }

    /** Snapshot of every own pattern key except the tracks array and _version. */
    #patternStateOf(pattern) {
        const state = {}
        for (const key of Object.keys(pattern)) {
            if (key === 'tracks' || key === '_version') continue
            state[key] = this.#cloneStateValue(pattern[key])
        }
        return state
    }

    /** Restores a pattern-level snapshot (_autoGenGenre, tags, bpm…); new keys are deleted. */
    #restorePatternState(pattern, state) {
        for (const key of Object.keys(pattern)) {
            if (key === 'tracks' || key === '_version') continue
            if (!(key in state)) delete pattern[key]
        }
        for (const [key, value] of Object.entries(state)) {
            pattern[key] = this.#cloneStateValue(value)
        }
    }

    beginGenerationUndo = (pattern) => {
        this.#genSnapshot = {
            pattern,
            patternState: this.#patternStateOf(pattern),
            trackSnapshots: (pattern.tracks ?? []).map((t) => ({ ref: t, state: this.#trackStateOf(t) })),
        }
        this.#suppressRecord = true
    }

    commitGenerationUndo = (desc = 'Generate pattern') => {
        const snap = this.#genSnapshot
        if (!snap) return
        this.#suppressRecord = false

        const capture = () => ({
            patternState: this.#patternStateOf(snap.pattern),
            trackStates: snap.pattern.tracks.map((t) => ({ ref: t, state: this.#trackStateOf(t) })),
        })
        const applySnapshot = ({ patternState, trackStates }) => {
            snap.pattern.tracks.splice(0, snap.pattern.tracks.length, ...trackStates.map((st) => st.ref))
            for (const st of trackStates) {
                this.#restoreTrackState(st.ref, st.state)
            }
            this.#restorePatternState(snap.pattern, patternState)
            snap.pattern._version = (snap.pattern._version ?? 0) + 1
            this.persist()
        }
        const before = { patternState: snap.patternState, trackStates: snap.trackSnapshots }
        const after = capture()
        this.record({
            desc,
            params: { pattern: snap.pattern?.name ?? '' },
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
