// src/logic/history_manager.js
// Undo/Redo history manager

import { playbackEvents } from '../state/playback_events.js'
import { logger } from '../core/logger.js'
import { showToast } from '../core/notify.js'
import { EVENTS } from '../core/events.js'

/** Max parameter lines shown in an undo/redo report toast. */
const REPORT_MAX_PARAMS = 8
/** Values longer than this are truncated in the report toast. */
const REPORT_VALUE_MAX = 120

function formatParamValue(value) {
    if (value === null) return 'null'
    if (value === undefined) return '—'
    if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`
    if (typeof value === 'object') {
        const json = JSON.stringify(value)
        return json.length > REPORT_VALUE_MAX ? `${json.slice(0, REPORT_VALUE_MAX - 1)}…` : json
    }
    const str = String(value)
    return str.length > REPORT_VALUE_MAX ? `${str.slice(0, REPORT_VALUE_MAX - 1)}…` : str
}

/**
 * One entry of the undo stack: the command and its coalescing bookkeeping.
 * `meta` carries the report shown in the undo toast.
 * @typedef {object} HistoryEntry
 * @property {() => void} execute
 * @property {() => void} undo
 * @property {() => void} [redo]
 * @property {string} [desc]
 * @property {object} [meta]
 * @property {object} [meta.params] changed parameters, for the report
 * @property {object} [meta.prev] values before the change
 * @property {string} [meta.desc]
 * @property {string} [coalesceKey] groups repeated gestures of the same kind
 * @property {number} [coalesceAt] timestamp of the last coalesce
 */

export default class HistoryManager {
    /** Window in which two records with the same coalesceKey merge into one undo step. */
    static COALESCE_WINDOW_MS = 400

    #past
    #future
    #maxSize
    #isUndoing
    #isRedoing

    constructor(maxSize = 50) {
        this.#past = []
        this.#future = []
        this.#maxSize = maxSize
        this.#isUndoing = false
        this.#isRedoing = false
    }

    get canUndo() {
        return this.#past.length > 0
    }

    get canRedo() {
        return this.#future.length > 0
    }

    get pastLength() {
        return this.#past.length
    }

    get futureLength() {
        return this.#future.length
    }

    /**
     * Record a command with execute and undo functions.
     * @param {object} command - { execute: Function, undo: Function, meta: object, coalesceKey?: string }
     *
     * With a coalesceKey matching the last past entry inside
     * COALESCE_WINDOW_MS, the two records merge into ONE entry: the first
     * entry's undo is kept (it restores the pre-gesture state) while
     * execute/meta are replaced by the newest values — so a whole slider
     * drag is a single undo step instead of one per input tick.
     */
    /** @param {HistoryEntry} command */
    record(command) {
        if (this.#isUndoing || this.#isRedoing) return

        const last = this.#past.at(-1)
        if (
            command.coalesceKey &&
            last &&
            last.coalesceKey === command.coalesceKey &&
            performance.now() - (last.coalesceAt ?? 0) < HistoryManager.COALESCE_WINDOW_MS
        ) {
            last.execute = command.execute
            last.meta = command.meta
            last.coalesceAt = performance.now()
            this.#emitChange()
            return
        }

        // Monotonic clock: a wall-clock step backwards (NTP, DST) would
        // otherwise merge unrelated gestures into a single undo step.
        command.coalesceAt = performance.now()
        this.#past.push(command)
        if (this.#past.length > this.#maxSize) {
            this.#past.shift()
        }
        this.#future = []
        this.#emitChange()
    }

    /**
     * Runs the action AND pushes an undo entry for it. The name said "execute"
     * for a method with two effects, so a caller could not tell that reading it
     * changed the undo stack.
     * @param {() => void} executeFn - The action to perform
     * @param {() => void} undoFn - The inverse action
     * @param {object} [meta] - Optional metadata
     * @returns {any} Result of executeFn
     */
    executeAndRecord(executeFn, undoFn, meta = {}) {
        const result = executeFn()
        this.record({ execute: executeFn, undo: undoFn, meta })
        return result
    }

    /**
     * Perform undo - calls the most recent command's undo function.
     */
    undo() {
        if (!this.canUndo) return false

        this.#isUndoing = true
        const command = this.#past.pop()
        try {
            command.undo()
            this.#future.push(command)
        } catch (err) {
            logger.error('HistoryManager', 'undo failed', err)
            showToast('Undo failed', 'error')
            this.#past.push(command)
            this.#isUndoing = false
            return false
        }
        this.#isUndoing = false
        this.#emitBatchedRefresh()
        this.#toastReport('Undo', command)
        return true
    }

    /**
     * Perform redo - re-executes the most recently undone command.
     * A command without an execute closure can never be re-applied: it is kept
     * in #future (NOT pushed to #past — undoing it again would re-run its undo
     * on stale state) and redo stays blocked until history is cleared.
     */
    redo() {
        if (!this.canRedo) return false

        const command = this.#future.at(-1)
        if (typeof command.execute !== 'function') {
            logger.error('HistoryManager', 'redo: command has no execute closure', command.meta?.desc)
            showToast('Redo unavailable', 'error')
            return false
        }

        this.#isRedoing = true
        this.#future.pop()
        try {
            command.execute()
            this.#past.push(command)
        } catch (err) {
            logger.error('HistoryManager', 'redo failed', err)
            showToast('Redo failed', 'error')
            this.#future.push(command)
            this.#isRedoing = false
            return false
        }
        this.#isRedoing = false
        this.#emitBatchedRefresh()
        this.#toastReport('Redo', command)
        return true
    }

    /**
     * Explicit report toast for a successful undo/redo: command name, its
     * parameters (with "current → restored" arrows when prev values are
     * known) and the resulting stack sizes.
     * @param {'Undo'|'Redo'} action
     * @param {HistoryEntry} command - the history entry that was applied
     */
    #toastReport(action, command) {
        const meta = command.meta ?? {}
        const params = meta.params && typeof meta.params === 'object' ? meta.params : null
        const prev = meta.prev && typeof meta.prev === 'object' ? meta.prev : null
        const lines = [`${action} — ${meta.desc || 'Unnamed command'}`]
        if (params) {
            const entries = Object.entries(params)
            for (const [key, value] of entries.slice(0, REPORT_MAX_PARAMS)) {
                const hasPrev = prev && Object.prototype.hasOwnProperty.call(prev, key)
                const current = formatParamValue(value)
                const restored = formatParamValue(prev?.[key])
                if (hasPrev && action === 'Undo') lines.push(`${key}: ${current} → ${restored}`)
                else if (hasPrev && action === 'Redo') lines.push(`${key}: ${restored} → ${current}`)
                else lines.push(`${key}: ${current}`)
            }
            if (entries.length > REPORT_MAX_PARAMS) {
                lines.push(`+${entries.length - REPORT_MAX_PARAMS} more…`)
            }
        }
        lines.push(`history: ${this.#past.length} undo · ${this.#future.length} redo`)
        showToast(lines.join('\n'), 'info', { duration: 4500 })
    }

    #emitBatchedRefresh() {
        playbackEvents.batch(() => {
            this.#emitChange()
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
        })
    }

    clear() {
        this.#past = []
        this.#future = []
        this.#emitChange()
    }

    #emitChange() {
        playbackEvents.emit(EVENTS.HISTORY_CHANGE, {
            canUndo: this.canUndo,
            canRedo: this.canRedo,
            pastLength: this.pastLength,
            futureLength: this.futureLength,
            nextUndoDesc: this.#past.at(-1)?.meta?.desc ?? null,
            nextRedoDesc: this.#future.at(-1)?.meta?.desc ?? null,
        })
    }
}
