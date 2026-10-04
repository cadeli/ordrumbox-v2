import { logger } from './logger.js'

/** Logger tag for every warning this module emits. */
const TAG = 'Numbers'

/**
 * Coerce a value to a finite number, or return `fallback` when it is not one.
 *
 * @param {unknown} value - value to coerce
 * @param {number} [fallback] - returned when `value` is not a finite number
 * @param {string|null} [label] - logged with the fallback, to identify the caller
 * @returns {number}
 */
export function toFiniteNumber(value, fallback = 0, label = null) {
    const num = Number(value)
    if (!Number.isFinite(num)) {
        if (label) logger.warn(TAG, 'num', label, fallback)
        return fallback
    }
    return num
}

/** Rate-limit state for out-of-range warnings (hot-path sliders clamp every frame). */
let lastClampWarnAt = 0

/**
 * Clamp `value` into `[min, max]` — the canonical bound check for the whole app.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
    const clamped = Math.min(max, Math.max(min, value))
    if (clamped !== value) {
        const now = Date.now()
        // Rate-limit: hot-path sliders can hit the bound every frame — warn at most once per second.
        if (now - lastClampWarnAt >= 1000) {
            lastClampWarnAt = now
            logger.warn(TAG, `clamp: ${value} outside [${min}, ${max}] -> ${clamped}`)
        }
    }
    return clamped
}
