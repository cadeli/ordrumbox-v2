/**
 * UI Theme — single source of truth for semantic color tokens in runtime JS.
 *
 * Canvas drawing and inline styles cannot use CSS custom properties directly.
 * This module reads tokens from CSS :root at runtime (when available) and falls
 * back to the same hex values declared in styles.css.
 *
 * Usage:
 *   import { color, rgb, rgba } from './theme.js'
 *   ctx.fillStyle = color('bg-canvas')
 *   ctx.strokeStyle = rgba('color-info', 0.15)
 */

// Fallback hex values — must stay in sync with styles.css :root
const TOKENS = {
    // Backgrounds
    'bg-canvas':       '#D1D2CE',
    'bg':              '#E7E8E4',
    'bg-elevated':     '#D9DAD6',
    'bg-input':        '#CFD0CC',
    'bg-hover':        '#CFD0CC',
    'bg-accent':       '#596B61',
    'bg-success':      '#596B61',

    // Text
    'text':            '#202321',
    'text-dim':        '#202321',
    'text-secondary':  '#686A67',
    'text-tertiary':   '#686A67',
    'text-disabled':   '#A9AAA6',

    // Borders
    'border-subtle':   '#C1C2BE',
    'border':          '#A9AAA6',
    'border-strong':   '#151716',

    // Semantic (mapped to palette)
    'accent':          '#596B61',
    'color-success':   '#596B61',
    'color-warning':   '#686A67',
    'color-danger':    '#686A67',
    'color-info':      '#596B61',

    // Canvas / Waveform
    'canvas-bg':       '#D1D2CE',
    'canvas-grid':     '#C1C2BE',
    'waveform-cyan':   '#202321',
    'waveform-green':  '#596B61',
    'waveform-red':    '#202321',
    'waveform-yellow': '#686A67',
    'canvas-shadow':   '#000000',
    'toast-shadow':    '#000000',
}

const ALPHA = {
    'canvas-shadow': 0.3,
    'toast-shadow': 0.5,
    'color-info':    0.15,
    'waveform-red':  0.15,
}

/** Read a CSS custom property from :root (browser only). */
function _cssVar(name) {
    try {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(`--${name}`).trim()
    } catch { return '' }
}

function _hexToRgb(hex) {
    const h = hex.replace('#', '')
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ]
}

let _cache = null

function _resolve() {
    if (_cache) return _cache
    _cache = {}
    for (const [key, fallback] of Object.entries(TOKENS)) {
        const hex = _cssVar(key) || fallback
        const [r, g, b] = _hexToRgb(hex)
        _cache[key] = { hex, r, g, b }
    }
    return _cache
}

/** Returns the hex color string for a token. */
export function color(key) {
    return _resolve()[key]?.hex ?? '#000'
}

/** Returns the "r,g,b" string for use in rgb()/rgba(). */
export function rgb(key) {
    const t = _resolve()[key]
    return t ? `${t.r},${t.g},${t.b}` : '0,0,0'
}

/** Returns an rgba() string with the given alpha. */
export function rgba(key, alpha) {
    const t = _resolve()[key]
    return t ? `rgba(${t.r},${t.g},${t.b},${alpha})` : `rgba(0,0,0,${alpha})`
}

/** Returns the default alpha for a token (used in under-curve fills, shadows, etc.). */
export function defaultAlpha(key) {
    return ALPHA[key] ?? 1
}
