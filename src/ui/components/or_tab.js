/**
 * OrTab — Reusable tab bar component.
 *
 * Manages active-tab state, renders the tab-bar HTML, handles click events,
 * and provides panel-visibility toggling. Designed for panels that re-render
 * their DOM on tab change (sync()-based panels).
 *
 * Usage:
 *   const tab = new OrTab({ tabs: [...], defaultTab: 'fx', onChange: id => sync() })
 *   // In sync(): container.innerHTML = tab.renderBar() + panels...
 *   // To toggle panels: tab.togglePanels(container)
 *   // Programmatic: tab.setActive('snd')
 */
export class OrTab {
    /** @type {string} */
    #activeTab
    /** @type {Array<{id: string, label: string}>} */
    #tabs
    /** @type {(tabId: string) => void} */
    #onChange

    /**
     * @param {object} opts
     * @param {Array<{id: string, label: string}>} opts.tabs
     * @param {string} [opts.defaultTab] — defaults to first tab's id
     * @param {(tabId: string) => void} [opts.onChange]
     */
    constructor({ tabs, defaultTab, onChange } = {}) {
        this.#tabs = tabs ?? []
        this.#activeTab = defaultTab ?? this.#tabs[0]?.id ?? ''
        this.#onChange = onChange
    }

    /** Currently active tab id. */
    get active() { return this.#activeTab }

    /** Tab definitions. */
    get tabs() { return this.#tabs }

    /**
     * Set the active tab programmatically.
     * Calls onChange if the tab actually changes.
     * @param {string} tabId
     */
    setActive(tabId) {
        if (tabId === this.#activeTab) return
        this.#activeTab = tabId
        this.#onChange?.(tabId)
    }

    /**
     * Returns true if the given tab id is hidden (not active).
     * Useful when rendering panel visibility classes.
     * @param {string} tabId
     * @returns {boolean}
     */
    isHidden(tabId) {
        return tabId !== this.#activeTab
    }

    /**
     * Render the tab bar as an HTML string.
     * Uses existing .ne-tab-bar / .ne-tab-btn CSS classes.
     * @returns {string}
     */
    renderBar() {
        let html = '<div class="ne-tab-bar">'
        for (const t of this.#tabs) {
            const cls = t.id === this.#activeTab ? ' active' : ''
            html += `<button class="ne-tab-btn${cls}" data-ne-tab="${escapeAttr(t.id)}">${escapeHtml(t.label)}</button>`
        }
        html += '</div>'
        return html
    }

    /**
     * Create the tab bar as a DOM element with built-in click handling.
     * Use this when you need a persistent element (no innerHTML re-render).
     * @returns {HTMLElement}
     */
    createElement() {
        const bar = document.createElement('div')
        bar.className = 'ne-tab-bar'
        for (const t of this.#tabs) {
            const btn = document.createElement('button')
            btn.className = 'ne-tab-btn' + (t.id === this.#activeTab ? ' active' : '')
            btn.dataset.neTab = t.id
            btn.textContent = t.label
            bar.appendChild(btn)
        }
        bar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-ne-tab]')
            if (btn) this.setActive(btn.dataset.neTab)
        })
        return bar
    }

    /**
     * Bind click events on the tab bar found inside a root element.
     * Call this after rendering the tab bar HTML (renderBar) into the DOM.
     * Scopes clicks to the first .ne-tab-bar inside root — no cross-panel leakage.
     * @param {HTMLElement} root
     */
    bindTo(root) {
        const bar = root.querySelector('.ne-tab-bar')
        if (!bar || bar.dataset.orTabBound) return
        bar.dataset.orTabBound = '1'
        bar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-ne-tab]')
            if (btn) this.setActive(btn.dataset.neTab)
        })
    }

    /**
     * Toggle .ne-tab-panel-hidden on all .ne-tab-panel children of a container.
     * Call this after setActive() or after re-rendering the DOM.
     * @param {HTMLElement} container
     */
    togglePanels(container) {
        container.querySelectorAll('.ne-tab-panel').forEach(p => {
            p.classList.toggle('ne-tab-panel-hidden', p.dataset.tabPanel !== this.#activeTab)
        })
    }
}

/** Minimal HTML escaping for attribute values. */
function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** Minimal HTML escaping for text content. */
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}
