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

    /** Get array of listeners for backward compatibility */
    getListeners(event) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, [])
        }
        return this._listeners.get(event)
    }
}

const bus = new EventBus()

/** Backward-compat proxy for tests using onX pattern (e.g. onPatternChange.push) */
export const playbackEvents = new Proxy(bus, {
    get(target, prop) {
        if (typeof prop !== 'string') return Reflect.get(target, prop)
        if (prop in target) return Reflect.get(target, prop)

        // Legacy onX array access (e.g. playbackEvents.onPatternChange.push(fn))
        if (prop.startsWith('on')) {
            const eventName = prop.slice(2)
            const event = eventName.charAt(0).toLowerCase() + eventName.slice(1)
            return target.getListeners(event)
        }

        return Reflect.get(target, prop)
    }
})
