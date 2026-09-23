/**
 * UI Theme — single source of truth for semantic color tokens in runtime JS.
 *
 * Canvas drawing and inline styles cannot use CSS custom properties directly.
 * This module reads tokens from CSS :root at runtime (when available) and falls
 * back to the same hex values declared in styles.css.
 *
 * Usage:
 *   import { color, rgba } from './theme.js'
 *   ctx.fillStyle = color('surface-2')
 *   ctx.strokeStyle = rgba('color-info', 0.15)
 */

// Fallback hex values — must stay in sync with styles.css :root
const TOKENS = {
    // Palette
    bg: '#E7E8E4',
    surface: '#D9DAD6',
    'surface-2': '#CFD0CC',
    line: '#A9AAA6',
    muted: '#686A67',
    text: '#202321',
    accent: '#596B61',

    // Accent variants
    'accent-400': '#6a7d73',
    'accent-600': '#4a5c52',

    // Borders
    'border-subtle': '#C1C2BE',

    // Semantic (mapped to palette, for dark mode overrides)
    'color-success': '#596B61',
    'color-warning': '#686A67',
    'color-danger': '#686A67',
    'color-info': '#596B61',

    // Shadows
    'canvas-shadow': '#000000',
    'toast-shadow': '#000000',
}

import { logger } from '../core/logger.js'

function _cssVar(name) {
    try {
        return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
    } catch (e) {
        logger.warn('Theme', `CSS variable --${name} not found`, e)
        return ''
    }
}

function _hexToRgb(hex) {
    const h = hex.replace('#', '')
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
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

/** Returns an rgba() string with the given alpha. */
export function rgba(key, alpha) {
    const t = _resolve()[key]
    return t ? `rgba(${t.r},${t.g},${t.b},${alpha})` : `rgba(0,0,0,${alpha})`
}
