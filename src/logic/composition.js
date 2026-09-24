/**
 * Standard composition sequences (chord progressions).
 * Pure data + helpers — no UI, no audio dependencies.
 */

export const CHORD_QUALITIES = Object.freeze({
    maj: [0, 4, 7],
    min: [0, 3, 7],
    dim: [0, 3, 6],
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10],
    sus4: [0, 5, 7],
})

/** Beats per measure (4/4) — one sequence chord is placed per measure. */
export const BEATS_PER_MEASURE = 4

/**
 * Standard progressions. Roots are semitone offsets from the sequence tonic.
 * Chords repeat cyclically across pattern measures (one chord per measure).
 */
export const SEQUENCES = Object.freeze([
    {
        id: 'pop',
        name: 'I-V-vi-IV',
        chords: [
            { quality: 'maj', root: 0 },
            { quality: 'maj', root: 7 },
            { quality: 'min', root: 9 },
            { quality: 'maj', root: 5 },
        ],
    },
    {
        id: 'doo-wop',
        name: 'I-vi-IV-V',
        chords: [
            { quality: 'maj', root: 0 },
            { quality: 'min', root: 9 },
            { quality: 'maj', root: 5 },
            { quality: 'maj', root: 7 },
        ],
    },
    {
        id: 'minor-natural',
        name: 'i-VI-III-VII',
        chords: [
            { quality: 'min', root: 0 },
            { quality: 'maj', root: 8 },
            { quality: 'maj', root: 3 },
            { quality: 'maj', root: 10 },
        ],
    },
    {
        id: 'andalusian',
        name: 'i-VII-VI-V',
        chords: [
            { quality: 'min', root: 0 },
            { quality: 'maj', root: 10 },
            { quality: 'maj', root: 8 },
            { quality: 'maj', root: 7 },
        ],
    },
    {
        id: 'canon',
        name: 'I-V-vi-iii',
        chords: [
            { quality: 'maj', root: 0 },
            { quality: 'maj', root: 7 },
            { quality: 'min', root: 9 },
            { quality: 'min', root: 4 },
        ],
    },
    {
        id: 'ii-V-I',
        name: 'ii-V-I',
        chords: [
            { quality: 'min', root: 2 },
            { quality: 'maj', root: 7 },
            { quality: 'maj', root: 0 },
        ],
    },
])

export function getSequence(index) {
    if (SEQUENCES.length === 0) return null
    const i = (((Math.trunc(index) || 0) % SEQUENCES.length) + SEQUENCES.length) % SEQUENCES.length
    return SEQUENCES[i]
}

/**
 * Build absolute relative-pitch notes for one chord per measure (4/4).
 * @param {object} sequence  entry from SEQUENCES
 * @param {number} tonic     relative pitch of the sequence root (track pitch units)
 * @param {number} beatCount number of beats in the pattern
 * @param {number} [beatsPerMeasure=4] beats in one measure
 * @returns {Array<{beat:number, beatStep:number, pitch:number}>}
 */
export function buildSequenceNotes(sequence, tonic, beatCount, beatsPerMeasure = BEATS_PER_MEASURE) {
    if (!sequence || !Array.isArray(sequence.chords) || sequence.chords.length === 0) return []
    const beats = Math.max(0, Math.trunc(beatCount) || 0)
    const spb = Math.max(1, Math.trunc(beatsPerMeasure) || BEATS_PER_MEASURE)
    const notes = []
    for (let measure = 0, beat = 0; beat < beats; measure++, beat += spb) {
        const chord = sequence.chords[measure % sequence.chords.length]
        const intervals = CHORD_QUALITIES[chord.quality] ?? CHORD_QUALITIES.maj
        const root = tonic + (chord.root ?? 0)
        for (const interval of intervals) {
            notes.push({ beat, beatStep: 0, pitch: root + interval })
        }
    }
    return notes
}
