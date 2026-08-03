export { fmt, escapeHtml, pitchToNoteName } from './ui_utils.js'

/** Canonical set of all overlay panel IDs (pattern-panel is never hidden by other panels). */
export const ALL_PANEL_IDS = [
    'te-panel', 'tools-panel', 'output-panel',
    'about-panel', 'dm-panel', 'soft-synth-panel'
]

export function injectUiCss() {
    if (document.getElementById('ui-styles')) return
    const link = document.createElement('link')
    link.id = 'ui-styles'
    link.rel = 'stylesheet'
    link.href = new URL('../styles.css', import.meta.url).href
    document.head.appendChild(link)
}



const PANEL_GAP_PX = 4

export function positionBelowPatternPanel(container) {
    if (window.innerWidth <= 768 || window.innerHeight <= 480) return
    const patternPanel = document.getElementById('pattern-panel')
    if (patternPanel) {
        container.style.top = (patternPanel.offsetTop + patternPanel.offsetHeight + PANEL_GAP_PX) + 'px'
    }
}

const SYNC_WIDTH_SKIP_IDS = ['pattern-panel', 'te-panel']

export function syncWidthWithPatternPanel(container) {
    if (SYNC_WIDTH_SKIP_IDS.includes(container.id)) return
    const pp = document.getElementById('pattern-panel')
    if (!pp || pp.classList.contains('ui-hidden')) return
    const rect = pp.getBoundingClientRect()
    container.style.left = rect.left + 'px'
    container.style.width = rect.width + 'px'
}

export function bindCloseButton(container, onClose) {
    container.querySelector('.ne-close')?.addEventListener('click', onClose)
}

export function bindVisibilityToggles(container, visibilityState, onChange) {
    container.querySelectorAll('.ne-toggle[data-toggle]').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const key = btn.dataset.toggle
            visibilityState[key] = !visibilityState[key]
            onChange?.(key, btn)
            event.stopPropagation()
        })
    })
}

export function bindPanelToggles(container, getTarget) {
    container.querySelectorAll('.ne-toggle[data-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active')
            const target = getTarget(btn.dataset.toggle)
            if (target) {
                target.style.display = btn.classList.contains('active') ? '' : 'none'
            }
        })
    })
}

export function hidePanelsById(ids) {
    ids.forEach(id => {
        const panel = document.getElementById(id)
        if (panel) panel.style.display = 'none'
    })
}



/**
 * Binds click handlers on `.ne-tab-btn` elements to toggle `.ne-tab-panel` visibility.
 * @param {HTMLElement} container
 * @param {function(string): void} [onChange]  – called with the newly activated tab id
 */
export function bindTabToggles(container, onChange) {
    container.querySelectorAll('.ne-tab-btn[data-ne-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.neTab
            container.querySelectorAll('.ne-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.neTab === id))
            container.querySelectorAll('.ne-tab-panel').forEach(p => p.classList.toggle('ne-tab-panel-hidden', p.dataset.tabPanel !== id))
            onChange?.(id)
        })
    })
}

/**
 * Sets the active state of a toolbar view button.
 * @param {'synth' | 'edit'} name
 * @param {boolean} active
 */
export function setViewBtn(name, active) {
    document.querySelector(`.tb-view-btn[data-view="${name}"]`)?.classList.toggle('active', active)
}
