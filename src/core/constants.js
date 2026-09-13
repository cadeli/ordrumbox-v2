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

// ── Import limits ──────────────────────────────────────────────────
export const MAX_IMPORT_TRACKS = 64
export const MAX_IMPORT_NOTES = 10_000

// ── MIDI import ────────────────────────────────────────────────────
export const MIDI_MAX_BEATS = 32
export const MIDI_MAX_PATTERNS = 16

// ── Loop / Pattern ─────────────────────────────────────────────────
export const MAX_LOOP_RETRY = 20
export const MAX_EXPORT_LOOPS = 16

// ── Mobile breakpoint thresholds ───────────────────────────────────
export const MOBILE_MAX_WIDTH = 768
export const MOBILE_MAX_HEIGHT = 480

/** True when viewport matches mobile criteria (portrait or landscape) */
export function isMobileViewport() {
    return typeof window !== 'undefined'
        && (window.innerWidth <= MOBILE_MAX_WIDTH || window.innerHeight <= MOBILE_MAX_HEIGHT)
}
