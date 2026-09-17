/**
 * Shared UI utilities — single source of truth for small helpers
 * used across multiple UI components.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * Prompt the user for a numeric value, returning the clamped result or null if cancelled.
 * @param {string} label  – display name for the input
 * @param {number} min    – minimum allowed value
 * @param {number} max    – maximum allowed value
 * @param {number} current – default value to show
 * @param {string} [unit] – optional unit suffix
 * @param {(num: number) => number} [clampFn] – optional custom clamp; defaults to Math.min/max
 * @returns {number|null}
 */
export function promptNumericInput(label, min, max, current, unit, clampFn) {
    const title = `Enter value for ${label} (${min}–${max}${unit ? ' ' + unit : ''}):`
    const raw = window.prompt(title, current)
    if (raw === null || raw.trim() === '') return null
    const num = parseFloat(raw)
    if (Number.isNaN(num)) return null
    return clampFn ? clampFn(num) : Math.min(max, Math.max(min, num))
}

/**
 * Format a number to at most 2 decimal places.
 * @param {number} v
 * @returns {number}
 */
export const fmt = v => parseFloat(Number(v).toFixed(2))

/**
 * Escape HTML special characters to prevent XSS in template literals.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
    const str = String(value ?? '')
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Convert a MIDI note number to a human-readable name (e.g. 60 → "C4").
 * @param {number} pitch    – pitch relative to base MIDI 60
 * @param {number} [trackPitch=0] – additional pitch offset from track
 * @returns {string}
 */
export function pitchToNoteName(pitch, trackPitch = 0) {
    const baseMidi = 60
    const midiNote = baseMidi + trackPitch + pitch
    const noteIndex = ((midiNote % 12) + 12) % 12
    const octave = Math.floor(midiNote / 12) - 1
    return `${NOTE_NAMES[noteIndex]}${octave}`
}

/**
 * Compute the MIDI note number from pitch and track pitch offset.
 * @param {number} pitch – pitch relative to base MIDI 60
 * @param {number} [trackPitch=0] – additional pitch offset from track
 * @returns {number}
 */
function pitchToMidi(pitch, trackPitch = 0) {
    return 60 + trackPitch + pitch
}

/**
 * Build a detailed tooltip string for a note, including MIDI number and properties.
 * @param {Object} note
 * @param {number} trackPitch
 * @returns {string}
 */
export function formatNoteTooltip(note, trackPitch = 0) {
    const pitch = note.pitch ?? 0
    const midiNote = pitchToMidi(pitch, trackPitch)
    const name = pitchToNoteName(pitch, trackPitch)

    const parts = [`${name}  MIDI ${midiNote}`]

    const vel = note.velocity ?? 0.8
    if (vel !== 0.8) parts.push(`vel:${fmt(vel)}`)

    const prob = note.prob ?? 1
    if (prob !== 1) parts.push(`prob:${fmt(prob)}`)

    const every = note.every ?? 1
    if (every !== 1) parts.push(`every:${every}`)

    const retriggerNum = note.retriggerNum ?? 1
    if (retriggerNum !== 1) parts.push(`retrig:${retriggerNum}`)

    const arp = note.arp
    if (arp && Array.isArray(arp) && arp.length >= 2) {
        parts.push(`arp:[${arp.join(',')}]`)
    } else if (arp && typeof arp === 'object' && !Array.isArray(arp) && Array.isArray(arp.intervals) && arp.intervals.length >= 2) {
        parts.push(`arp:[${arp.intervals.join(',')}]`)
    }

    const arpTriggerProb = note.arpTriggerProbability ?? 1
    if (arpTriggerProb !== 1) parts.push(`arpProb:${fmt(arpTriggerProb)}`)

    const euclidianFill = note.euclidianFill ?? 0
    if (euclidianFill > 0) parts.push(`eucl:${euclidianFill}`)

    const rate = note.rate ?? 1
    if (rate !== 1) parts.push(`rate:${fmt(rate)}`)

    const pan = note.pan ?? 0
    if (pan !== 0) parts.push(`pan:${fmt(pan)}`)

    return parts.join('  ')
}

// ─── Panel helpers (moved from panel_helpers.js) ──────────────────────────

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
