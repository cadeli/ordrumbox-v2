import { injectUiCss, positionBelowPatternPanel, hidePanelsById, escapeHtml, ALL_PANEL_IDS } from './components/panel_helpers.js'

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
        this.container.style.display = 'none'
        document.body.appendChild(this.container)
    }

    /**
     * Subscribes to playbackEvents. Override in derived classes.
     */
    subscribe() {}

    /**
     * Renders/updates the UI based on current state. Override in derived classes.
     */
    sync() {}

    /**
     * Standard show logic.
     * @param {string[]} [panelsToHide] Panel IDs to hide. Defaults to all other panels.
     */
    show(panelsToHide) {
        hidePanelsById(panelsToHide ?? this._hideOtherPanels())
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        this.container.style.display = 'block'
        this.sync()
        this.reposition()
    }

    /**
     * Returns all canonical panel IDs except this panel's own ID.
     */
    _hideOtherPanels() {
        return ALL_PANEL_IDS.filter(id => id !== this.id)
    }

    /**
     * Standard hide logic.
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none'
        }
    }

    /**
     * Standard repositioning logic.
     */
    reposition() {
        if (this.container) {
            positionBelowPatternPanel(this.container)
        }
    }

    /**
     * Helper to escape HTML.
     */
    esc(str) {
        return escapeHtml(str)
    }

    /**
     * Helper to check visibility.
     */
    get isVisible() {
        return this.container && this.container.style.display !== 'none'
    }
}
