import { toFiniteNumber } from './numbers.js'
import { NOTE_POSITION_KEYS } from './note_schema.js'

/**
 * Absolute step of a note within its track: `beat * stepsPerBeat + beatStep`.
 *
 * A note without `beat`/`beatStep` (a trigger config, say) reads as step 0.
 *
 * @param {{beat?: number, beatStep?: number, [key: string]: any}} note
 * @param {number} stepsPerBeat
 * @returns {number}
 */
export function getNoteAbsoluteStep(note, stepsPerBeat) {
    const beat = toFiniteNumber(note?.beat, 0, 'getNoteAbsoluteStep.beat')
    const beatStep = toFiniteNumber(note?.beatStep, 0, 'getNoteAbsoluteStep.beatStep')
    return Math.floor(beat * stepsPerBeat + beatStep)
}

/**
 * Inverse of getNoteAbsoluteStep: absolute step → { beat, beatStep }.
 *
 * @param {number} step
 * @param {number} stepsPerBeat
 * @returns {{beat: number, beatStep: number}}
 */
export function stepToBeat(step, stepsPerBeat) {
    return {
        beat: Math.floor(step / stepsPerBeat),
        beatStep: step % stepsPerBeat,
    }
}

/**
 * Canonical step → tick conversion: the single source of the
 * `beat * tick + Math.round((beatStep * tick) / stepsPerBeat)` formula.
 *
 * @param {number} step
 * @param {number} stepsPerBeat
 * @param {number} tick - TICK, ticks per BEAT (32), not per step
 * @returns {number}
 */
export function stepToTick(step, stepsPerBeat, tick) {
    const { beat, beatStep } = stepToBeat(step, stepsPerBeat)
    return beat * tick + Math.round((beatStep * tick) / stepsPerBeat)
}

/**
 * Notes sitting at one grid position. Safe for both storage shapes
 * (array or indexed object) — a bare `(track.notes ?? []).filter(...)`
 * breaks on the object form.
 *
 * @param {any} track
 * @param {number} beat
 * @param {number} beatStep
 * @returns {any[]}
 */
export function notesAtStep(track, beat, beatStep) {
    return Object.values(track?.notes ?? {}).filter((n) => n.beat === beat && n.beatStep === beatStep)
}

/**
 * Canonical string for the AUDIBLE part of a note: every property except the
 * position keys, sorted, so two notes at the same step compare by sound alone.
 *
 * @param {object} note
 * @returns {string}
 */
export function getAudibleNoteSignature(note) {
    const audibleProps = {}
    Object.keys(note ?? {})
        .filter((key) => !NOTE_POSITION_KEYS.has(key))
        .sort()
        .forEach((key) => {
            audibleProps[key] = normalizeSignatureValue(note[key])
        })
    return JSON.stringify(audibleProps)
}

/**
 * Recursively sort object keys so a signature does not depend on insertion
 * order, and keep arrays in order (their order is audible).
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeSignatureValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeSignatureValue(item))
    }
    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((normalized, key) => {
                normalized[key] = normalizeSignatureValue(value[key])
                return normalized
            }, {})
    }
    return value
}

/**
 * Map of step → signature of every note on it, signatures joined in sorted
 * order. Used to compare a track's notes against a loop of them.
 *
 * @param {any} notes
 * @param {number} stepsPerBeat
 * @param {(step: number) => number} stepMapper - maps a source step to the step it is stored under
 * @returns {Map<number, string>}
 */
export function createStepSignatureMap(notes, stepsPerBeat, stepMapper) {
    const map = new Map()
    Object.values(notes ?? []).forEach((note) => {
        const sourceStep = getNoteAbsoluteStep(note, stepsPerBeat)
        const step = stepMapper(sourceStep)
        if (!Number.isInteger(step) || step < 0) {
            return
        }
        const signatures = map.get(step) ?? []
        signatures.push(getAudibleNoteSignature(note))
        signatures.sort()
        map.set(step, signatures)
    })

    for (const [step, signatures] of map) {
        map.set(step, signatures.join('|'))
    }

    return map
}
/**
 * Playback rate ratio for a semitone offset (equal temperament, A4 = 440Hz).
 *
 * @param {number} semiTone
 * @returns {number}
 */
export function semiToneToPitch(semiTone) {
    return Math.pow(2, semiTone / 12)
}

/**
 * UI curve for a knob/slider value: the first octave is linear up to 8, then
 * one step per unit, so low values stay usable.
 *
 * @param {number} value
 * @returns {number}
 */
export function getStepSpacing(value) {
    if (value < 8) {
        return value / 8
    } else {
        return value - 7
    }
}

/**
 * @param {object} obj - an object whose keys are candidates (a scale, a palette…)
 * @returns {string|null} a random key, null when obj is empty
 */
export function getRandomKey(obj) {
    const keys = Object.keys(obj)
    if (keys.length === 0) return null

    const randomIdx = Math.floor(Math.random() * keys.length)
    return keys[randomIdx]
}
