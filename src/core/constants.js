import { isCompactDevice } from './device.js'

export const NOT_FOUND = 'NOT_FOUND'

// ── App version (bump to invalidate IndexedDB cache) ───────────────
export const APP_VERSION = '2.0.0'

// ── Timing constants ───────────────────────────────────────────────
export const TICK = 32

// ── Audio / Synthesis ──────────────────────────────────────────────
export const C3_FREQ = 130.8127826502993
export const NOTE_VELO_BALANCE = 1
export const MIN_GAIN_VALUE = 0.001
export const MIN_NOTE_RATIO = 0.0001

// ── Timing / Ramp (setTargetAtTime) ────────────────────────────────
export const RAMP_TIME = 0.02
export const PITCH_RAMP_TIME = 0.001
export const GAIN_ATTACK_RAMP = 0.005
export const RELEASE_TIME = 0.05
export const STOP_BUFFER = 0.015
export const STOP_EXTRA_BUFFER = 0.02
// ── UI / Display ───────────────────────────────────────────────────
export const BEATS_PER_PAGE = 4
export const MAX_BEATS = 16

// ── Import limits ──────────────────────────────────────────────────
export const MAX_IMPORT_TRACKS = 64
export const MAX_IMPORT_NOTES = 10_000

// ── MIDI import ────────────────────────────────────────────────────
export const MIDI_MAX_BEATS = 32
export const MIDI_MAX_PATTERNS = 16

// ── Mobile breakpoint thresholds ───────────────────────────────────
const MOBILE_MAX_WIDTH = 768
const MOBILE_MAX_HEIGHT = 480

/**
 * True when the app must use its compact (mobile) layout.
 * Union of two signals:
 *  - device class from the user agent (phones AND tablets, whatever the
 *    window size — large tablets used to slip through the size check)
 *  - viewport size (a narrow desktop window keeps the compact layout so
 *    the CSS never breaks — same criterion the CSS `.is-compact` class uses)
 */
export function isMobileViewport() {
    if (typeof window === 'undefined') return false
    return isCompactDevice() || window.innerWidth <= MOBILE_MAX_WIDTH || window.innerHeight <= MOBILE_MAX_HEIGHT
}
