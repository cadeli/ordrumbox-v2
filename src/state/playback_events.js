/**
 * Generic EventBus - simple pub/sub for internal events.
 */
class EventBus {
    #listeners;
    #batchDepth;
    #pending;

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
        this.#listeners.set(event, arr.filter(f => f !== fn))
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
            arr.slice().forEach(fn => fn(payload))
        }
    }

    /** Batch multiple emits — listeners run once at the end, not per emit. */
    batch(fn) {
        this.#batchDepth++
        try { fn() } finally {
            this.#batchDepth--
            if (this.#batchDepth === 0) this.#flushPending()
        }
    }

    #flushPending() {
        const pending = this.#pending.splice(0)
        for (const { event, payload } of pending) {
            const arr = this.#listeners.get(event)
            if (arr) arr.forEach(fn => fn(payload))
        }
    }
}

export const playbackEvents = new EventBus()
