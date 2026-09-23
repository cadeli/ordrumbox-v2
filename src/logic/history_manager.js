// src/logic/history_manager.js
// Undo/Redo history manager

import { playbackEvents } from '../state/playback_events.js'
import { logger } from '../core/logger.js'
import { showToast } from '../core/notify.js'

export default class HistoryManager {
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
     * @param {object} command - { execute: Function, undo: Function, meta: object }
     */
    record(command) {
        if (this._isUndoing || this._isRedoing) return

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
     */
    redo() {
        if (!this.canRedo) return false

        this._isRedoing = true
        const command = this.#future.pop()
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
            playbackEvents.emit('patternChange')
            playbackEvents.emit('noteChange')
            playbackEvents.emit('patternStructureChange')
        })
    }

    clear() {
        this.#past = []
        this.#future = []
        this.#emitChange()
    }

    #emitChange() {
        playbackEvents.emit('historyChange', {
            canUndo: this.canUndo,
            canRedo: this.canRedo,
            pastLength: this.pastLength,
            futureLength: this.futureLength,
            nextUndoDesc: this.#past.at(-1)?.meta?.desc ?? null,
            nextRedoDesc: this.#future.at(-1)?.meta?.desc ?? null,
        })
    }
}
