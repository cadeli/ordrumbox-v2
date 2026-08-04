import { injectUiCss, positionBelowPatternPanel, syncWidthWithPatternPanel, hidePanelsById, escapeHtml, ALL_PANEL_IDS } from './components/panel_helpers.js'
import { playbackEvents } from '../state/playback_events.js'

const KEEP_VISIBLE_IDS = ['te-panel']

/** Maps panel IDs to the event names that should hide them when fired. */
const HIDE_ON_EVENTS = {
    'tools-panel':    ['trackSelect', 'noteSelect'],
    'output-panel':   ['trackSelect', 'noteSelect'],
    'about-panel':    ['toolsToggle', 'outputToggle', 'trackSelect', 'noteSelect'],
    'dm-panel':       ['toolsToggle', 'outputToggle', 'aboutToggle'],
    'pp-panel':       ['toolsToggle', 'outputToggle', 'aboutToggle', 'drumkitManagerToggle'],
    'soft-synth-panel': ['trackSelect', 'noteSelect'],
}

/**
 * BasePanel - Base class for all UI panels.
 * Encapsulates common logic: DOM creation, CSS injection, show/hide, repositioning.
 */
export default class BasePanel {
    constructor(id) {
        this.id = id
        this.container = null
    }

    /**
     * Common initialization flow.
     */
    init() {
        this.injectCSS()
        this.createDOM()
        this.sync()
        this.subscribe()
        this._registerHideEvents()
    }

    /**
     * Auto-registers hide subscriptions for this panel based on HIDE_ON_EVENTS map.
     */
    _registerHideEvents() {
        const events = HIDE_ON_EVENTS[this.id]
        if (!events) return
        for (const evt of events) {
            const listeners = playbackEvents.getListeners(evt)
            listeners.push(() => this.hide())
        }
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
    }

    /** Subscribes to playbackEvents. Override in derived classes. */
    subscribe() {}

    /** Renders/updates the UI based on current state. Override in derived classes. */
    sync() {}

    /**
     * Standard show logic.
     * @param {string[]} [panelsToHide] Panel IDs to hide. Defaults to all other panels except te-panel and ne-panel.
     */
    show(panelsToHide) {
        hidePanelsById(panelsToHide ?? this._hideOtherPanels())
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        this.container.style.display = 'block'
        this.sync()
        this.reposition()
    }

    /**
     * Returns panel IDs to hide when this panel opens.
     * Excludes this panel's own ID and panels in KEEP_VISIBLE_IDS (te-panel, ne-panel).
     */
    _hideOtherPanels() {
        return ALL_PANEL_IDS.filter(id => id !== this.id && !KEEP_VISIBLE_IDS.includes(id))
    }

    /** Standard hide logic. */
    hide() {
        this.container?.style.setProperty('display', 'none')
    }

    /**
     * Positions the panel below the pattern panel and syncs its width.
     */
    reposition() {
        if (!this.container) return
        positionBelowPatternPanel(this.container)
        syncWidthWithPatternPanel(this.container)
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
