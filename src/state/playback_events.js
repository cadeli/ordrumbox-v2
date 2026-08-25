/**
 * Generic EventBus - simple pub/sub for internal events.
 */
class EventBus {
    constructor() {
        this._listeners = new Map()
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

    /** Emit an event with payload */
    emit(event, payload) {
        const arr = this._listeners.get(event)
        if (arr) {
            arr.forEach(fn => fn(payload))
        }
    }
}

export const playbackEvents = new EventBus()
