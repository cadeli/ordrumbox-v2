// src/ui/toolbar/overflow_menu.js
// Overflow menu: tools, about, settings, mobile pattern name.

import { playbackEvents } from '../../state/event_bus.js'
import { EVENTS } from '../../core/events.js'
import { Lifecycle } from '../../core/lifecycle.js'

export default class OverflowMenu {
    /** Owns every listener bound through #life — released by destroy(). */
    #life = new Lifecycle()
    /** @type {HTMLButtonElement} */
    #toolsBtn
    /** @type {HTMLButtonElement} */
    #aboutBtn
    /** @type {HTMLButtonElement} */
    #settingsBtn
    /** @type {HTMLSpanElement} */
    #patternNameMobile

    get toolsBtn() {
        return this.#toolsBtn
    }

    get aboutBtn() {
        return this.#aboutBtn
    }

    get settingsBtn() {
        return this.#settingsBtn
    }

    get patternNameMobile() {
        return this.#patternNameMobile
    }

    /** Releases every DOM listener bound through listen(). */
    destroy() {
        this.#life.destroy()
    }

    createDOM() {
        this.#toolsBtn = document.createElement('button')
        this.#toolsBtn.className = 'tb-tools tb-hide-mobile'
        this.#toolsBtn.textContent = '⚙'
        this.#toolsBtn.title = 'Tools'

        this.#aboutBtn = document.createElement('button')
        this.#aboutBtn.className = 'tb-about'
        this.#aboutBtn.textContent = '⋮'
        this.#aboutBtn.title = 'About'

        /* Mobile-specific elements */
        this.#patternNameMobile = document.createElement('span')
        this.#patternNameMobile.className = 'tb-pattern-name-mobile'
        this.#patternNameMobile.textContent = 'Pattern 1'

        this.#settingsBtn = document.createElement('button')
        this.#settingsBtn.className = 'tb-settings-btn'
        this.#settingsBtn.textContent = '⚙'
        this.#settingsBtn.title = 'Pattern Settings'

        return {
            toolsBtn: this.#toolsBtn,
            aboutBtn: this.#aboutBtn,
            patternNameMobile: this.#patternNameMobile,
            settingsBtn: this.#settingsBtn,
        }
    }

    /**
     * Renders the current pattern name on the mobile title.
     * @param {{patternName: string, hasPattern: boolean}} data
     */
    sync(data) {
        if (data.hasPattern) this.#patternNameMobile.textContent = data.patternName
    }

    bindEvents() {
        // Fresh signal if this is a re-init cycle after destroy().
        this.#life.reset()

        this.#life.listen(this.#toolsBtn, 'click', () => {
            playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
        })

        this.#life.listen(this.#aboutBtn, 'click', () => {
            playbackEvents.emit(EVENTS.ABOUT_TOGGLE, true)
        })

        this.#life.listen(this.#settingsBtn, 'click', () => {
            playbackEvents.emit(EVENTS.PATTERN_SETTINGS_TOGGLE, true)
        })
    }
}
