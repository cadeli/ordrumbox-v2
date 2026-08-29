// src/logic/history_manager.js
// Undo/Redo history manager

import { playbackEvents } from '../state/playback_events.js'

export default class HistoryManager {
    constructor(maxSize = 50) {
        this._past = []
        this._future = []
        this._maxSize = maxSize
        this._isUndoing = false
        this._isRedoing = false
    }

    get canUndo() {
        return this._past.length > 0
    }

    get canRedo() {
        return this._future.length > 0
    }

    get pastLength() {
        return this._past.length
    }

    get futureLength() {
        return this._future.length
    }

    /**
     * Record a command with execute and undo functions.
     * @param {object} command - { execute: Function, undo: Function, meta: object }
     */
    record(command) {
        if (this._isUndoing || this._isRedoing) return

        this._past.push(command)
        if (this._past.length > this._maxSize) {
            this._past.shift()
        }
        this._future = []
        this._emitChange()
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
        const command = this._past.pop()
        try {
            command.undo()
            this._future.push(command)
        } catch (err) {
            console.error('HistoryManager: undo failed', err)
            this._past.push(command)
            this._isUndoing = false
            return false
        }
        this._isUndoing = false
        this._emitBatchedRefresh()
        return true
    }

    /**
     * Perform redo - re-executes the most recently undone command.
     */
    redo() {
        if (!this.canRedo) return false

        this._isRedoing = true
        const command = this._future.pop()
        try {
            command.execute()
            this._past.push(command)
        } catch (err) {
            console.error('HistoryManager: redo failed', err)
            this._future.push(command)
            this._isRedoing = false
            return false
        }
        this._isRedoing = false
        this._emitBatchedRefresh()
        return true
    }

    _emitBatchedRefresh() {
        playbackEvents.batch(() => {
            this._emitChange()
            playbackEvents.emit('patternChange')
            playbackEvents.emit('noteChange')
            playbackEvents.emit('patternStructureChange')
        })
    }

    clear() {
        this._past = []
        this._future = []
        this._emitChange()
    }

    _emitChange() {
        playbackEvents.emit('historyChange', {
            canUndo: this.canUndo,
            canRedo: this.canRedo,
            pastLength: this.pastLength,
            futureLength: this.futureLength
        })
    }
}