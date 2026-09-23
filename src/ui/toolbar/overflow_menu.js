// src/ui/toolbar/overflow_menu.js
// Overflow menu: tools, about, settings, mobile pattern name.

import { playbackEvents } from '../../state/playback_events.js'
import { EVENTS } from '../../core/events.js'

export default class OverflowMenu {
    #tb

    /** @param {import('../toolbar.js').default} toolbar */
    constructor(toolbar) {
        this.#tb = toolbar
    }

    createDOM() {
        const tb = this.#tb

        tb.toolsBtn = document.createElement('button')
        tb.toolsBtn.className = 'tb-tools tb-hide-mobile'
        tb.toolsBtn.textContent = '⚙'
        tb.toolsBtn.title = 'Tools'

        tb.aboutBtn = document.createElement('button')
        tb.aboutBtn.className = 'tb-about'
        tb.aboutBtn.textContent = '⋮'
        tb.aboutBtn.title = 'About'

        /* Mobile-specific elements */
        tb.patternNameMobile = document.createElement('span')
        tb.patternNameMobile.className = 'tb-pattern-name-mobile'
        tb.patternNameMobile.textContent = 'Pattern 1'

        tb.settingsBtn = document.createElement('button')
        tb.settingsBtn.className = 'tb-settings-btn'
        tb.settingsBtn.textContent = '⚙'
        tb.settingsBtn.title = 'Pattern Settings'

        return {
            toolsBtn: tb.toolsBtn,
            aboutBtn: tb.aboutBtn,
            patternNameMobile: tb.patternNameMobile,
            settingsBtn: tb.settingsBtn,
        }
    }

    bindEvents() {
        const tb = this.#tb

        tb.toolsBtn.addEventListener('click', () => {
            playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
        })

        tb.aboutBtn.addEventListener('click', () => {
            playbackEvents.emit(EVENTS.ABOUT_TOGGLE, true)
        })

        tb.settingsBtn.addEventListener('click', () => {
            playbackEvents.emit(EVENTS.PATTERN_SETTINGS_TOGGLE, true)
        })
    }
}
