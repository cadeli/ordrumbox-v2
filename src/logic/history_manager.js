// src/logic/history_manager.js
// Undo/Redo history manager

import { playbackEvents } from '../state/playback_events.js'
import { logger } from '../core/logger.js'
import { showToast } from '../core/notify.js'
import { EVENTS } from '../core/events.js'

export default class HistoryManager {
    /** Window in which two records with the same coalesceKey merge into one undo step. */
    static COALESCE_WINDOW_MS = 400

    #past
    #future
    #maxSize
    _isUndoing
    _isRedoing

    constructor(maxSize = 50) {
        this.#past = []
        this.#future = []
        this.#maxSize = maxSize
        this._isUndoing = false
        this._isRedoing = false
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
    record(command) {
        if (this._isUndoing || this._isRedoing) return

        const last = this.#past.at(-1)
        if (
            command.coalesceKey &&
            last &&
            last.coalesceKey === command.coalesceKey &&
            Date.now() - (last.coalesceAt ?? 0) < HistoryManager.COALESCE_WINDOW_MS
        ) {
            last.execute = command.execute
            last.meta = command.meta
            last.coalesceAt = Date.now()
            this.#emitChange()
            return
        }

        command.coalesceAt = Date.now()
        this.#past.push(command)
        if (this.#past.length > this.#maxSize) {
            this.#past.shift()
        }
        this.#future = []
        this.#emitChange()
    }

    /**
     * Execute and record a command in one step.
     * @param {Function} executeFn - The action to perform
     * @param {Function} undoFn - The inverse action
     * @param {object} [meta] - Optional metadata
     * @returns {any} Result of executeFn
     */
    execute(executeFn, undoFn, meta = {}) {
        const result = executeFn()
        this.record({ execute: executeFn, undo: undoFn, meta })
        return result
    }

    /**
     * Perform undo - calls the most recent command's undo function.
     */
    undo() {
        if (!this.canUndo) return false

        this._isUndoing = true
        const command = this.#past.pop()
        try {
            command.undo()
            this.#future.push(command)
        } catch (err) {
            logger.error('HistoryManager', 'undo failed', err)
            showToast('Undo failed', 'error')
            this.#past.push(command)
            this._isUndoing = false
            return false
        }
        this._isUndoing = false
        this.#emitBatchedRefresh()
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

        this._isRedoing = true
        this.#future.pop()
        try {
            command.execute()
            this.#past.push(command)
        } catch (err) {
            logger.error('HistoryManager', 'redo failed', err)
            showToast('Redo failed', 'error')
            this.#future.push(command)
            this._isRedoing = false
            return false
        }
        this._isRedoing = false
        this.#emitBatchedRefresh()
        return true
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
