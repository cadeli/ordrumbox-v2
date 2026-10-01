// @ts-check
import { logger } from '../core/logger.js'
import { reportUserError } from '../core/notify.js'
import { EVENTS } from '../core/events.js'

/**
 * Generic EventBus - simple pub/sub for internal events.
 */
class EventBus {
    #listeners
    #batchDepth
    #pending

    constructor() {
        this.#listeners = new Map()
        this.#batchDepth = 0
        this.#pending = []
    }

    /** Subscribe to an event */
    on(event, fn) {
        if (typeof fn !== 'function') return () => {}
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, [])
        }
        this.#listeners.get(event).push(fn)
        return () => this.off(event, fn)
    }

    /** Unsubscribe from an event */
    off(event, fn) {
        const arr = this.#listeners.get(event)
        if (!arr) return
        this.#listeners.set(
            event,
            arr.filter((f) => f !== fn),
        )
    }

    /**
     * Dispatch to one listener, isolating its failures: without this a single
     * throwing subscriber aborted every remaining subscriber of the event and
     * rethrew into the emitter (a PATTERN_CHANGE subscriber bug could silently
     * starve the UI redraw of the whole panel).
     * @param {string} event
     * @param {Function} fn
     * @param {any} payload
     */
    #dispatch(event, fn, payload) {
        try {
            fn(payload)
        } catch (err) {
            logger.error('EventBus', `listener for "${event}" threw`, err)
            reportUserError('EventBus.listener', `An internal listener failed on "${event}"`, { cause: err })
        }
    }

    /** Emit an event with payload. Deferred if inside batch(). */
    emit(event, payload) {
        if (this.#batchDepth > 0) {
            this.#pending.push({ event, payload })
            return
        }
        const arr = this.#listeners.get(event)
        if (arr) {
            // Snapshot the array so listeners registered during emit are
            // deferred to the next emit cycle (prevents re-entrancy).
            arr.slice().forEach((fn) => this.#dispatch(event, fn, payload))
        }
    }

    /** Batch multiple emits — listeners run once at the end, not per emit. */
    batch(fn) {
        this.#batchDepth++
        try {
            fn()
        } finally {
            this.#batchDepth--
            if (this.#batchDepth === 0) this.#flushPending()
        }
    }

    #flushPending() {
        // Splice first: a listener emitting during the flush would otherwise be
        // delivered before the events already queued.
        const pending = this.#pending.splice(0)
        for (const { event, payload } of pending) {
            const arr = this.#listeners.get(event)
            if (arr) arr.forEach((fn) => this.#dispatch(event, fn, payload))
        }
    }
}

export const playbackEvents = new EventBus()

/**
 * The "a track parameter changed" pair, repeated at ~20 call sites across the
 * panels (the payloads had already drifted: some sites passed a track, some an
 * array, some nothing — every subscriber ignores them).
 * @param {any} [track]
 * @param {{batch: Function, emit: Function}} [bus] injected bus (DI)
 */
export const emitTrackChanged = (track, bus = playbackEvents) =>
    bus.batch(() => {
        bus.emit(EVENTS.TRACK_PARAM_CHANGE, track)
        bus.emit(EVENTS.PATTERN_CHANGE, [track])
    })

/**
 * The "notes changed" pair (pattern panel context menu, piano roll, note editor).
 * @param {any} [track]
 * @param {{batch: Function, emit: Function}} [bus] injected bus (DI)
 */
export const emitNotesChanged = (track, bus = playbackEvents) =>
    bus.batch(() => {
        bus.emit(EVENTS.NOTE_CHANGE, [track])
        bus.emit(EVENTS.PATTERN_CHANGE, [track])
    })
