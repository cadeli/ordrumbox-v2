/**
 * euclidean.js — Bjorklund's Euclidean rhythm algorithm.
 *
 * Shared by the pattern engine (ticks) and the pattern grid / piano roll
 * (steps) so every view and the audio engine place euclidean onsets on the
 * exact same steps.
 */
import Utils from './utils.js'

/**
 * Bjorklund's algorithm — distributes `pulses` onsets as evenly as possible
 * across `steps` discrete positions.
 *
 * Invariants: the result always has length `steps`, exactly
 * `min(pulses, steps)` onsets, onset 0 is always set (the anchor), and the
 * cyclic gaps between onsets differ by at most 1 (maximally even).
 *
 * @param {number} pulses - Number of onsets (clamped to [0, steps])
 * @param {number} steps  - Number of discrete positions
 * @returns {boolean[]}   - length === steps
 */
export function bjorklund(pulses, steps) {
    const n = Math.max(0, Math.round(steps))
    if (n <= 0) return []

    const k = Utils.clamp(Math.round(pulses), 0, n)
    if (k === 0) return new Array(n).fill(false)
    if (k === n) return new Array(n).fill(true)

    let a = Array.from({ length: k }, () => [true])
    let b = Array.from({ length: n - k }, () => [false])

    while (b.length > 1) {
        const count = Math.min(a.length, b.length)
        const merged = []
        for (let i = 0; i < count; i++) merged.push(a[i].concat(b[i]))
        const remA = a.slice(count)
        const remB = b.slice(count)
        a = merged
        b = remA.length ? remA : remB
    }

    return a.concat(b).flat()
}

/**
 * Positions of the euclidean onsets added after a base note.
 *
 * `pulses` counts the base note itself as the first onset (Euclidean
 * vocabulary: k pulses over n steps, n = `stepsSpan`), so the returned list
 * holds `pulses - 1` positions when `pulses <= stepsSpan`, and every position
 * of the span when `pulses >= stepsSpan` (full roll — clamped, never
 * duplicated).
 *
 * @param {number} basePos   - Absolute step position of the base note (onset 0)
 * @param {number} stepsSpan - Span of discrete steps until the next onset boundary
 * @param {number} pulses    - Total number of pulses k (base included)
 * @param {number} rotation  - Phase offset of the pattern (steps, non-anchor part)
 * @returns {number[]}       - Absolute step positions, ascending, base excluded
 */
export function computeEuclideanFillPositions(basePos, stepsSpan, pulses, rotation = 0) {
    const span = Math.max(0, Math.round(stepsSpan))
    const k = Math.round(pulses)
    if (span <= 1 || k <= 1) return []

    const pattern = bjorklund(k, span)

    // The base note always anchors the rhythm as onset #1.
    if (!pattern[0]) {
        pattern[0] = true
        for (let i = pattern.length - 1; i > 0; i--) {
            if (pattern[i]) {
                pattern[i] = false
                break
            }
        }
    }

    // Rotation shifts the non-anchor onsets so the phase can be tuned without
    // ever moving an onset onto the base note (which is already playing).
    const slots = span - 1
    const shift = ((Math.round(rotation) % slots) + slots) % slots

    const positions = []
    for (let i = 1; i < span; i++) {
        const source = 1 + ((i - 1 - shift + slots) % slots)
        if (pattern[source]) positions.push(basePos + i)
    }
    return positions
}
