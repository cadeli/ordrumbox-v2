const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const A4_HZ = 440
const A4_MIDI = 69
const LN2_OVER_12 = Math.LN2 / 12

/**
 * Convert a frequency in Hz to the nearest musical note.
 * @param {number} hz - Frequency in Hz
 * @returns {{ note: string, octave: number, cents: number, midi: number } | null}
 */
export function hzToNote(hz) {
    if (!Number.isFinite(hz) || hz <= 0) return null

    const semitones = 12 * Math.log2(hz / A4_HZ)
    const midiFloat = A4_MIDI + semitones
    const midi = Math.round(midiFloat)
    const cents = Math.round((midiFloat - midi) * 100)

    const noteIndex = ((midi % 12) + 12) % 12
    const octave = Math.floor(midi / 12) - 1

    return {
        note: NOTE_NAMES[noteIndex],
        octave,
        cents,
        midi
    }
}

/**
 * Convert semitones offset to Hz relative to a base frequency.
 * @param {number} semitones
 * @param {number} baseHz
 * @returns {number}
 */
export function semitonesToHz(semitones, baseHz = A4_HZ) {
    return baseHz * Math.pow(2, semitones / 12)
}

/**
 * Format a note result as a readable string.
 * @param {{ note: string, octave: number, cents: number }} noteResult
 * @returns {string}
 */
export function formatNote(noteResult) {
    if (!noteResult) return '—'
    const sign = noteResult.cents > 0 ? '+' : ''
    return `${noteResult.note}${noteResult.octave} ${sign}${noteResult.cents}ct`
}
