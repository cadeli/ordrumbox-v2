import { fmt as _fmt, escapeHtml as _escapeHtml, pitchToNoteName as _pitchToName, formatNoteTooltip as _fmtNote } from './ui_utils.js'
export const fmt = _fmt
export const escapeHtml = _escapeHtml
export const pitchToNoteName = _pitchToName
export const formatNoteTooltip = _fmtNote

export function injectUiCss() {
    if (document.getElementById('ui-styles')) return
    const link = document.createElement('link')
    link.id = 'ui-styles'
    link.rel = 'stylesheet'
    link.href = new URL('../styles.css', import.meta.url).href
    document.head.appendChild(link)
}

export function bindCloseButton(container, onClose) {
    container.querySelector('.ne-close')?.addEventListener('click', onClose)
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
const KNOB_FORMATTERS = new Map([
    ['velocity', v => Math.round(v * 100)],
    ['pitch',    v => `${v >= 0 ? '+' : ''}${v}`],
    ['decay',    v => `${Math.round(v)} ms`],
])
export const knobFormat = (def) => KNOB_FORMATTERS.get(def.key) ?? fmt

// ─── Option / Icon rendering helpers ──────────────────────────────────────

const _eq = (a, b) => String(a) === String(b)

/**
 * Builds <option> tags with correct `selected` marking.
 *
 * @param {Array<string|{value:string,label:string}>} options
 * @param {*} currentValue  Currently selected value
 * @param {object}          [opts]
 * @param {string[]}        [opts.labels]   Override display labels (index-aligned)
 * @param {function}        [opts.escape]   HTML-escape function (e.g. escapeHtml)
 * @returns {string} HTML
 */
export function renderOptions(options, currentValue, { labels, escape: esc } = {}) {
    return options.map((opt, i) => {
        const value = typeof opt === 'object' ? opt.value : opt
        const label = labels?.[i] ?? (typeof opt === 'object' ? opt.label : opt)
        const sel = _eq(value, currentValue) ? ' selected' : ''
        const dVal = esc ? esc(value) : value
        const dLbl = esc ? esc(label) : label
        return `<option value="${dVal}"${sel}>${dLbl}</option>`
    }).join('')
}

/**
 * Builds icon-toggle buttons with `selected` class on the active one.
 *
 * @param {Array<string|number|{value:*,label:string}>} options
 * @param {*}       currentValue   Currently selected value
 * @param {Object}  iconMap        value → icon content (text / SVG / emoji)
 * @param {object}  [opts]
 * @param {string}  [opts.cssClass]      CSS class for every button
 * @param {string}  [opts.valueDataAttr] data-* attribute carrying the value (e.g. 'data-wave-val')
 * @param {function}[opts.escape]        HTML-escape function
 * @param {function}[opts.extraAttrs]    (value) => string — extra HTML attributes per button
 * @returns {string} HTML
 */
export function renderIconChoices(options, currentValue, iconMap, { cssClass, valueDataAttr, escape: esc, extraAttrs, titleMap } = {}) {
    return options.map(opt => {
        const value = typeof opt === 'object' ? opt.value : opt
        const sel = _eq(value, currentValue) ? ' selected' : ''
        const dVal = esc ? esc(value) : value
        const icon = iconMap[value] ?? value
        const extra = extraAttrs ? extraAttrs(value) : ''
        const title = titleMap?.[value] ?? dVal
        return `<button class="${cssClass}${sel}" ${valueDataAttr}="${dVal}" title="${title}"${extra}>${icon}</button>`
    }).join('')
}

/**
 * @param {boolean} hidden
 */
export function setPatternPanelHidden(hidden) {
    document.getElementById('pattern-panel')?.classList.toggle('ui-hidden', hidden)
}
