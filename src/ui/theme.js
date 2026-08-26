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
    'bg-canvas':       '#0d0d1a',
    'bg':              '#1a1a2e',
    'bg-elevated':     '#2a2a3e',
    'bg-input':        '#16213e',
    'bg-hover':        '#3a3a4e',
    'bg-accent':       '#0f3460',
    'bg-success':      '#0a2e0a',

    // Text
    'text':            '#fff',
    'text-dim':        '#eee',
    'text-secondary':  '#ccc',
    'text-tertiary':   '#888',
    'text-disabled':   '#555',

    // Borders
    'border-subtle':   '#333',
    'border':          '#555',
    'border-strong':   '#888',

    // Semantic
    'accent':          '#e94560',
    'color-success':   '#4ade80',
    'color-warning':   '#f59e0b',
    'color-danger':    '#c62828',
    'color-info':      '#4fc3f7',

    // Canvas / Waveform
    'canvas-bg':       '#0d0d1a',
    'canvas-grid':     '#2D3438',
    'waveform-cyan':   '#00fff5',
    'waveform-green':  '#8EEA3B',
    'waveform-red':    '#F24C4C',
    'waveform-yellow': '#f5e642',
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
