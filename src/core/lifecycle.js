/**
 * Lifecycle — shared cancellation helper, by composition.
 *
 * Two binding primitives (`listen()` for DOM events, `sub()` for the event
 * bus) plus one teardown (`destroy()`), so a class does not have to carry its
 * own AbortController and unsubscribe list. A panel keeps one instance and
 * delegates to it; nothing here knows about DOM creation, CSS or show/hide.
 *
 * After `destroy()` the instance can be reused: `reset()` arms a fresh signal
 * for a new init cycle (listeners bound before it stay dead).
 */
export class Lifecycle {
    /** Owns every listener bound through listen() — aborted by destroy(). */
    #abortController = new AbortController()
    /** Every unsubscribe function returned by sub(). */
    #unsubs = []

    /** Signal shared by every listener bound through listen(). */
    get signal() {
        return this.#abortController.signal
    }

    /**
     * addEventListener tied to this lifetime: destroy() aborts it, so no
     * handler reference is kept for removeEventListener.
     * @param {EventTarget|null|undefined} target
     * @param {string} type
     * @param {EventListener} handler
     * @param {AddEventListenerOptions} [options]
     */
    listen(target, type, handler, options) {
        // Already destroyed: bind nothing until reset() — jsdom does not
        // enforce the aborted-signal rule browsers do.
        if (this.#abortController.signal.aborted) return
        target?.addEventListener(type, handler, { ...options, signal: this.#abortController.signal })
    }

    /**
     * Subscribe to a bus event; the handler is unsubscribed by destroy().
     * @param {{on: (event: string, fn: Function) => (() => void)}} bus event bus (e.g. playbackEvents)
     * @param {string} event event name
     * @param {Function} fn handler
     * @returns {() => void} unsubscribe function
     */
    sub(bus, event, fn) {
        const off = bus.on(event, fn)
        this.#unsubs.push(off)
        return off
    }

    /** Unsubscribes every handler from sub() and aborts every listener from listen(). */
    destroy() {
        for (const off of this.#unsubs.splice(0)) off()
        this.#abortController.abort()
    }

    /** destroy() then a fresh signal: ready to bind again (new init cycle). */
    reset() {
        this.destroy()
        this.#abortController = new AbortController()
    }
}
