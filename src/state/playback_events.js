/**
 * Generic EventBus - simple pub/sub for internal events.
 */
class EventBus {
    constructor() {
        this._listeners = new Map()
        this._batchDepth = 0
        this._pending = []
    }

    /** Subscribe to an event */
    on(event, fn) {
        if (typeof fn !== 'function') return () => {}
        if (!this._listeners.has(event)) {
            this._listeners.set(event, [])
        }
        this._listeners.get(event).push(fn)
        return () => this.off(event, fn)
    }

    /** Unsubscribe from an event */
    off(event, fn) {
        const arr = this._listeners.get(event)
        if (!arr) return
        this._listeners.set(event, arr.filter(f => f !== fn))
    }

    /** Emit an event with payload. Deferred if inside batch(). */
    emit(event, payload) {
        if (this._batchDepth > 0) {
            this._pending.push({ event, payload })
            return
        }
        const arr = this._listeners.get(event)
        if (arr) {
            arr.forEach(fn => fn(payload))
        }
    }

    /** Batch multiple emits — listeners run once at the end, not per emit. */
    batch(fn) {
        this._batchDepth++
        try { fn() } finally {
            this._batchDepth--
            if (this._batchDepth === 0) this._flushPending()
        }
    }

    _flushPending() {
        const pending = this._pending.splice(0)
        for (const { event, payload } of pending) {
            const arr = this._listeners.get(event)
            if (arr) arr.forEach(fn => fn(payload))
        }
    }
}

export const playbackEvents = new EventBus()
