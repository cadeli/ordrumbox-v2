// src/ui/components/note_paint.js
// Pure note-painting helpers shared by the pattern grid and the piano roll.

/** Default velocity a note is painted with when it carries none. */
const NOTE_DEFAULT_VELOCITY = 0.8

/**
 * Opacity a note is drawn at for a given velocity — the alpha both grids use,
 * so a note reads at the same strength whichever grid shows it.
 *
 * @param {number} [velocity]
 * @returns {number} 0.25 … 1
 */
export function noteOpacity(velocity) {
    return 0.25 + (velocity ?? NOTE_DEFAULT_VELOCITY) * 0.75
}

/**
 * Trigger flavour of a note: `'rand'` when it fires probabilistically,
 * `'fixed'` when it fires every Nth pass, `null` when it plays every pass.
 * Prob wins over the cycle, as the renderers have always done.
 *
 * @param {{prob?: number, every?: number}} [note]
 * @returns {'rand'|'fixed'|null}
 */
export function noteTriggerKind(note) {
    if ((note?.prob ?? 1) < 1) return 'rand'
    if ((note?.every ?? 1) > 1) return 'fixed'
    return null
}
