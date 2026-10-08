import { injectUiCss, escapeHtml } from './components/ui_utils.js'
import { Lifecycle } from '../core/lifecycle.js'

/**
 * BasePanel - Base class for all UI panels.
 * Encapsulates common logic: DOM creation, CSS injection, show/hide.
 * Cancellation (DOM listeners + bus subscriptions) comes from the composed
 * Lifecycle: sub() / listen() / destroy() delegate to it.
 */
export default class BasePanel {
    /** Live instances, keyed by panel id — used to make init() idempotent. */
    static #instances = new Map()

    #lifecycle = new Lifecycle()
    #initialized = false
    #ownsContainer = false

    constructor(id) {
        this.id = id
        this.container = null
    }

    /**
     * Common initialization flow.
     * Idempotent: initializing a panel whose id is already registered destroys
     * the previous instance first, so bus handlers are never bound twice.
     */
    init() {
        this.beginInit()
        this.injectCSS()
        this.createDOM()
        this.sync()
        this.subscribe()
    }

    /**
     * Registration step of init(). Call it first from a custom init() override.
     */
    beginInit() {
        if (this.#initialized) this.destroy()
        // Fresh signal per init cycle: destroy() aborted the previous one.
        this.#lifecycle.reset()
        const prev = BasePanel.#instances.get(this.id)
        if (prev && prev !== this) prev.destroy()
        BasePanel.#instances.set(this.id, this)
        this.#initialized = true
    }

    /** Signal shared by every listener bound through listen(). */
    get signal() {
        return this.#lifecycle.signal
    }

    /**
     * addEventListener tied to the panel lifetime: destroy() aborts it, so no
     * panel has to keep handler references around for removeEventListener.
     * @param {EventTarget} target
     * @param {string} type
     * @param {EventListener} handler
     * @param {AddEventListenerOptions} [options]
     */
    listen(target, type, handler, options) {
        this.#lifecycle.listen(target, type, handler, options)
    }

    injectCSS() {
        injectUiCss()
    }

    /**
     * Creates the container and appends it to document.body.
     * Derived classes should override this to set specific attributes or innerHTML.
     */
    createDOM() {
        this.container = document.createElement('div')
        this.container.id = this.id
        this.container.classList.add('ne-panel')
        this.container.style.display = 'none'
        document.body.appendChild(this.container)
        this.#ownsContainer = true
    }

    /** Subscribes to playbackEvents. Override in derived classes. */
    subscribe() {}

    /** Renders/updates the UI based on current state. Override in derived classes. */
    sync() {}

    /**
     * Subscribe to a bus event; the handler is unsubscribed by destroy().
     * @param {{on: (event: string, fn: Function) => (() => void)}} bus event bus (e.g. playbackEvents)
     * @param {string} event event name
     * @param {Function} fn handler
     * @returns {() => void} unsubscribe function
     */
    sub(bus, event, fn) {
        return this.#lifecycle.sub(bus, event, fn)
    }

    /** Teardown hook for derived classes (observers, rAF, document listeners). */
    onDestroy() {}

    /**
     * Unsubscribes every handler registered through sub(), aborts the DOM
     * listeners bound through listen(), runs onDestroy() and detaches the
     * container created by createDOM().
     */
    destroy() {
        this.#lifecycle.destroy()
        this.onDestroy()
        if (this.#ownsContainer) this.container?.remove()
        if (BasePanel.#instances.get(this.id) === this) BasePanel.#instances.delete(this.id)
        this.#initialized = false
    }

    /** Standard show logic. */
    show() {
        this.container.style.display = 'block'
        this.sync()
    }

    /**
     * Standard hide logic: display none.
     *
     * Subclasses override this to release what they own, and some of them discard
     * per-session state on the way (TrackEditor drops the edit session and the
     * uncommitted synth draft, NoteEditor destroys its controls): hide() means
     * "the panel is closed", not "temporarily invisible". Do not call it to keep
     * a panel's state alive — override isVisible instead.
     */
    hide() {
        this.container?.style.setProperty('display', 'none')
    }

    /** Helper to escape HTML. */
    esc(str) {
        return escapeHtml(str)
    }

    /** @returns {boolean} whether the panel is currently visible */
    get isVisible() {
        return this.container && this.container.style.display !== 'none'
    }
}
