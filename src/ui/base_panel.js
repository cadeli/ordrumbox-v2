// @ts-check
import { injectUiCss, escapeHtml } from './components/panel_helpers.js'

/**
 * BasePanel - Base class for all UI panels.
 * Encapsulates common logic: DOM creation, CSS injection, show/hide and
 * EventBus lifecycle (sub() → destroy()).
 */
export default class BasePanel {
    /** Live instances, keyed by panel id — used to make init() idempotent. */
    static #instances = new Map()

    #unsubs = []
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
        const prev = BasePanel.#instances.get(this.id)
        if (prev && prev !== this) prev.destroy()
        BasePanel.#instances.set(this.id, this)
        this.#initialized = true
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
        const off = bus.on(event, fn)
        this.#unsubs.push(off)
        return off
    }

    /** Teardown hook for derived classes (observers, rAF, document listeners). */
    onDestroy() {}

    /**
     * Unsubscribes every handler registered through sub(), runs onDestroy()
     * and detaches the container created by createDOM().
     */
    destroy() {
        for (const off of this.#unsubs.splice(0)) off()
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

    /** Standard hide logic. */
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
