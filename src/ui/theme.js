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
    bg: '#14163E',
    surface: '#1D2157',
    'surface-2': '#262B68',
    line: '#3F47AD',
    muted: '#9BA4EE',
    text: '#EAFFD0',
    accent: '#9BBC0F',

    // Accent variants
    'accent-400': '#C6E93A',
    'accent-600': '#6F9200',

    // Toy plastics
    'toy-pink': '#FF4FA3',
    'toy-cyan': '#37E0FF',
    'toy-yellow': '#FFE14D',
    'toy-violet': '#A97BFF',
    'toy-orange': '#FF9040',
    'toy-lime': '#B7FF3C',
    phosphor: '#B6FF2E',
    'scope-bg': '#050A14',

    // Borders
    'border-subtle': '#4D56C4',

    // Semantic (candy signals)
    'color-success': '#4DFFB2',
    'color-success-dark': '#17C98A',
    'color-warning': '#FFE14D',
    'color-danger': '#FF4FA3',
    'color-danger-light': '#FF9EC7',
    'color-info': '#37E0FF',
    'bg-success': '#17C98A',

    // Shadows
    'canvas-shadow': '#000000',
    'toast-shadow': '#000000',
}

import { logger } from '../core/logger.js'

function cssVar(name) {
    try {
        return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
    } catch (e) {
        logger.warn('Theme', `CSS variable --${name} not found`, e)
        return ''
    }
}

function hexToRgb(hex) {
    const h = hex.replace('#', '')
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
}

let cache = null

function resolve() {
    if (cache) return cache
    cache = {}
    for (const [key, fallback] of Object.entries(TOKENS)) {
        const hex = cssVar(key) || fallback
        const [r, g, b] = hexToRgb(hex)
        cache[key] = { hex, r, g, b }
    }
    return cache
}

/** Returns the hex color string for a token. */
export function color(key) {
    return resolve()[key]?.hex ?? '#000'
}

/** Returns an rgba() string with the given alpha. */
export function rgba(key, alpha) {
    const t = resolve()[key]
    return t ? `rgba(${t.r},${t.g},${t.b},${alpha})` : `rgba(0,0,0,${alpha})`
}

/**
 * Canvas colors for the sample envelope graphs (track editor + drumkit manager).
 * Near-black scope background, phosphor curve and pink decay marker keep the
 * graph readable at a glance — both call sites share this so a sample looks
 * identical wherever it is edited.
 * @returns {{ background: string, stroke: string, fill: string, marker: string, lineWidth: number }}
 */
export function sampleWaveformTheme(lineWidth = 2) {
    return {
        background: color('scope-bg'),
        stroke: color('phosphor'),
        fill: rgba('phosphor', 0.16),
        marker: color('toy-pink'),
        lineWidth,
    }
}
