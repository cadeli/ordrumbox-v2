/**
 * Generic EventBus with backward-compatible Proxy support for legacy onX / dispatchX calls.
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

export const playbackEvents = new Proxy(bus, {
    get(target, prop) {
        if (typeof prop !== 'string') return Reflect.get(target, prop)
        if (prop in target) return Reflect.get(target, prop)

        // Legacy dispatchX(payload) -> bus.emit('X', payload)
        if (prop.startsWith('dispatch')) {
            const eventName = prop.slice(8)
            const event = eventName.charAt(0).toLowerCase() + eventName.slice(1)
            return (payload) => target.emit(event, payload)
        }

        // Legacy offX(fn) -> bus.off('X', fn)
        if (prop.startsWith('off')) {
            const eventName = prop.slice(3)
            const event = eventName.charAt(0).toLowerCase() + eventName.slice(1)
            return (fn) => target.off(event, fn)
        }

        // Legacy onX array access (e.g. playbackEvents.on("patternChange", fn))
        if (prop.startsWith('on')) {
            const eventName = prop.slice(2)
            const event = eventName.charAt(0).toLowerCase() + eventName.slice(1)
            return target.getListeners(event)
        }

        return Reflect.get(target, prop)
    }
})
