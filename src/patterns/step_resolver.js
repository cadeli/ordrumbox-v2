import Utils from '../core/utils.js'

/**
 * Single source of truth for "where does a note's sub-note span end?" —
 * used by the flat-note recompute (audio, WAV export, MIDI export) and by
 * the pattern grid / piano roll ghost rendering.
 *
 * ── Cache strategy (ONE rule, no invalidation point to remember) ────────────
 * A resolver owns its occupied-set snapshot and lives exactly ONE pass:
 * one flat-note recompute, one grid render, one piano-roll render or
 * illumination frame. Callers create it with `createStepResolver(track)` at
 * the start of the pass and drop it at the end.
 *
 * Nothing is stored on the track, so a mutation of `track.notes` (membership,
 * beat/beatStep, in-place slider edits, generators, undo/redo…) can never be
 * observed through a stale span: audio, WAV export, MIDI export and the UI
 * all rebuild from the same rule, at most O(notes) per pass.
 */

/**
 * Absolute steps occupied by the track notes (array or map form).
 * @param {any} track
 * @returns {Set<number>}
 */
export function buildOccupiedSet(track) {
    const set = new Set()
    const notes = track.notes
    if (!notes) return set
    const stepsPerBeat = track.stepsPerBeat ?? 4
    const values = Array.isArray(notes) ? notes : Object.values(notes)
    for (let i = 0; i < values.length; i++) {
        set.add(Utils.getNoteAbsoluteStep(values[i], stepsPerBeat))
    }
    return set
}

/**
 * End of the sub-note span of a note: the next occupied step inside the
 * track, clamped by the loop point when it falls inside the span, otherwise
 * the end of the track.
 *
 * @param {object} note
 * @param {any} track
 * @param {Set<number>} occupied - steps built by {@link buildOccupiedSet}
 * @returns {number} absolute step (exclusive end of the span)
 */
export function resolveSpanEnd(note, track, occupied) {
    const stepsPerBeat = track.stepsPerBeat ?? 4
    const last = stepsPerBeat * (track.beatCount ?? 4)
    const first = Utils.getNoteAbsoluteStep(note, stepsPerBeat)

    let end = last
    for (let i = first + 1; i < last; i++) {
        if (occupied.has(i)) {
            end = i
            break
        }
    }

    const loopAtStep = Number(track.loopAtStep)
    if (Number.isFinite(loopAtStep) && loopAtStep > first && loopAtStep < end) end = loopAtStep
    return end
}

/**
 * Pass-scoped resolver: snapshot the track once, then resolve any number of
 * notes in O(1) each. Build it at the start of a pass, never keep it longer.
 *
 * @param {any} track
 * @returns {(note: object) => number} end step of the note's sub-note span
 */
export function createStepResolver(track) {
    const occupied = buildOccupiedSet(track)
    return (note) => resolveSpanEnd(note, track, occupied)
}
