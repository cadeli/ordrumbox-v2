/**
 * OrTab — Reusable tab bar component.
 *
 * Manages active-tab state, renders the tab-bar HTML, handles click events,
 * and provides panel-visibility toggling. Supports custom CSS classes and
 * data attributes for nested/independent tab systems.
 *
 * Usage:
 *   const tab = new OrTab({ tabs: [...], defaultTab: 'fx', onChange: id => sync() })
 *   // In sync(): container.innerHTML = tab.renderBar() + panels...
 *   // After render: tab.bindTo(container)
 *   // Toggle panels: tab.togglePanels(container)
 *   // Programmatic: tab.setActive('snd')
 */
export class OrTab {
    /** @type {string} */
    #activeTab
    /** @type {Array<{id: string, label: string}>} */
    #tabs
    /** @type {(tabId: string) => void} */
    #onChange
    /** @type {object} */
    #css

    /**
     * Convert kebab-case to camelCase for dataset access.
     * e.g. 'ne-tab' → 'neTab', 'fx-tab' → 'fxTab'
     * @param {string} kebab
     * @returns {string}
     */
    static #toCamel(kebab) {
        return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    }

    /**
     * @param {object} opts
     * @param {Array<{id: string, label: string}>} opts.tabs
     * @param {string} [opts.defaultTab] — defaults to first tab's id
     * @param {(tabId: string) => void} [opts.onChange]
     * @param {object} [opts.css] — custom CSS class / data-attribute overrides
     * @param {string} [opts.css.bar]        — tab bar container class (default: 'ne-tab-bar')
     * @param {string} [opts.css.btn]        — tab button class (default: 'ne-tab-btn')
     * @param {string} [opts.css.panel]      — panel class (default: 'ne-tab-panel')
     * @param {string} [opts.css.hidden]     — hidden panel class (default: 'ne-tab-panel-hidden')
     * @param {string} [opts.css.dataAttr]   — data attribute for tab id on buttons (default: 'ne-tab')
     * @param {string} [opts.css.panelData]  — data attribute for panel id (default: 'tab-panel')
     */
    constructor({ tabs, defaultTab, onChange, css } = {}) {
        this.#tabs = tabs ?? []
        this.#activeTab = defaultTab ?? this.#tabs[0]?.id ?? ''
        this.#onChange = onChange
        this.#css = {
            bar: 'ne-tab-bar',
            btn: 'ne-tab-btn',
            panel: 'ne-tab-panel',
            hidden: 'ne-tab-panel-hidden',
            dataAttr: 'ne-tab',
            panelData: 'tab-panel',
            ...css,
        }
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
     * @param {string} tabId
     * @returns {boolean}
     */
    isHidden(tabId) {
        return tabId !== this.#activeTab
    }

    /**
     * Render the tab bar as an HTML string.
     * @returns {string}
     */
    renderBar() {
        const { bar, btn, dataAttr } = this.#css
        let html = `<div class="${bar}">`
        for (const t of this.#tabs) {
            const cls = t.id === this.#activeTab ? ' active' : ''
            html += `<button class="${btn}${cls}" data-${dataAttr}="${escapeAttr(t.id)}">${escapeHtml(t.label)}</button>`
        }
        html += '</div>'
        return html
    }

    /**
     * Create the tab bar as a DOM element with built-in click handling.
     * @returns {HTMLElement}
     */
    createElement() {
        const { bar, btn, dataAttr } = this.#css
        const camelDataAttr = OrTab.#toCamel(dataAttr)
        const barEl = document.createElement('div')
        barEl.className = bar
        for (const t of this.#tabs) {
            const button = document.createElement('button')
            button.className = btn + (t.id === this.#activeTab ? ' active' : '')
            button.dataset[camelDataAttr] = t.id
            button.textContent = t.label
            barEl.appendChild(button)
        }
        barEl.addEventListener('click', (e) => {
            const clicked = e.target.closest(`[data-${dataAttr}]`)
            if (clicked) this.setActive(clicked.dataset[camelDataAttr])
        })
        return barEl
    }

    /**
     * Bind click events on the tab bar found inside a root element.
     * Call this after rendering the tab bar HTML (renderBar) into the DOM.
     * Scopes clicks to the tab bar element — no cross-panel leakage.
     * @param {HTMLElement} root
     */
    bindTo(root) {
        const { bar, dataAttr } = this.#css
        const camelDataAttr = OrTab.#toCamel(dataAttr)
        const barEl = root.querySelector(`.${bar}`)
        if (!barEl || barEl.dataset.orTabBound) return
        barEl.dataset.orTabBound = '1'
        barEl.addEventListener('click', (e) => {
            const clicked = e.target.closest(`[data-${dataAttr}]`)
            if (clicked) this.setActive(clicked.dataset[camelDataAttr])
        })
    }

    /**
     * Toggle panel visibility within a container.
     * Uses the configured panel/hidden CSS classes and panelData attribute.
     * @param {HTMLElement} container
     */
    togglePanels(container) {
        const { panel, hidden, panelData } = this.#css
        const camelPanelData = OrTab.#toCamel(panelData)
        container.querySelectorAll(`.${panel}`).forEach(p => {
            p.classList.toggle(hidden, p.dataset[camelPanelData] !== this.#activeTab)
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
