import { fmt as _fmt, escapeHtml as _escapeHtml, pitchToNoteName as _pitchToNoteName, formatNoteTooltip as _formatNoteTooltip } from './ui_utils.js'
import { isMobileViewport } from '../../core/constants.js'
export const fmt = _fmt
export const escapeHtml = _escapeHtml
export const pitchToNoteName = _pitchToNoteName
export const formatNoteTooltip = _formatNoteTooltip

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
    if (isMobileViewport()) return
    const patternPanel = document.getElementById('pattern-panel')
    if (patternPanel) {
        const savedMinHeight = patternPanel.style.minHeight
        patternPanel.style.minHeight = ''
        const offsetHeight = patternPanel.offsetHeight
        patternPanel.style.minHeight = savedMinHeight
        container.style.top = (patternPanel.offsetTop + offsetHeight + PANEL_GAP_PX) + 'px'
    }
}

const SYNC_WIDTH_SKIP_IDS = ['pattern-panel', 'te-panel', 'piano-roll-panel']

export function syncWidthWithPatternPanel(container) {
    if (isMobileViewport()) return
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
 * @param {'synth' | 'edit' | 'proll'} name
 * @param {boolean} active
 */
export function setViewBtn(name, active) {
    document.querySelector(`.tb-view-btn[data-view="${name}"]`)?.classList.toggle('active', active)
}

/**
 * Sets all toolbar view buttons for a given mode.
 * @param {'synth' | 'edit' | 'proll'} mode
 */
export function setViewMode(mode) {
    setViewBtn('synth', mode === 'synth')
    setViewBtn('edit', mode === 'edit' || mode === 'mobileTrack')
    setViewBtn('proll', mode === 'proll')
}

/**
 * Downloads data as a JSON file.
 * @param {unknown} data
 * @param {string} filename
 */
export function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

/**
 * Creates a Knob format callback for velocity/pitch/fallback.
 */
export function knobFormat(def) {
    return def.key === 'velocity'
        ? v => Math.round(v * 100)
        : def.key === 'pitch'
            ? v => `${v >= 0 ? '+' : ''}${v}`
            : def.key === 'decay'
                ? v => `${Math.round(v)} ms`
                : fmt
}
