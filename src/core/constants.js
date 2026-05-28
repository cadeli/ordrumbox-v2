export const NOT_FOUND = 'NOT_FOUND'

// ── Timing constants ───────────────────────────────────────────────
export const TICK = 32

// ── Audio / Synthesis ──────────────────────────────────────────────
export const C3_FREQ = 130.8127826502993
export const LFO_GAIN_MULTIPLIER = 1000
export const LFO_FREQ_OFFSET = 0.1
export const FILTER_FREQ_MIN = 20
export const FILTER_FREQ_MAX = 20000
export const NOISE_FILTER_FREQ_DEFAULT = 1000
export const NOTE_VELO_BALANCE = 1 / 16
export const MIN_GAIN_VALUE = 0.001
export const MIN_NOTE_RATIO = 0.0001

// ── Timing / Ramp (setTargetAtTime) ────────────────────────────────
export const RAMP_TIME = 0.02
export const PITCH_RAMP_TIME = 0.001
export const GAIN_ATTACK_RAMP = 0.005
export const RELEASE_TIME = 0.05
export const STOP_BUFFER = 0.015
export const STOP_EXTRA_BUFFER = 0.02
export const COMPRESSOR_ATTACK = 0.005

// ── Delay presets ──────────────────────────────────────────────────
export const DELAY_FILTER_FREQ = Object.freeze({
    tape: 8000,
    analog: 5000,
    digital: 2000,
})

export const DELAY_FEEDBACK = Object.freeze({
    tape: 0.2,
    analog: 0.35,
    digital: 0.4,
})

// ── UI / Display ───────────────────────────────────────────────────
export const SCREEN_WIDTH_THRESHOLD = 1000
export const MODAL_TIMEOUT_MS = 1000
export const FALLBACK_FPS = 60
export const LED_MAX_VALUE = 20
export const LED_DECAY_RATE = 1.4
export const LED_DIVISOR = 20
export const SLIDER_STEP_DEFAULT = 0.05

// ── Loop / Pattern ─────────────────────────────────────────────────
export const MAX_LOOP_RETRY = 20
export const MAX_EXPORT_LOOPS = 16
