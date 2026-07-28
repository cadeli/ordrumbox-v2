/**
 * Shared UI utilities — single source of truth for small helpers
 * used across multiple UI components.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * Format a number to at most 2 decimal places.
 * @param {number} v
 * @returns {number}
 */
export const fmt = v => parseFloat(Number(v).toFixed(2))

/**
 * Escape HTML special characters to prevent XSS in template literals.
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
    const str = String(value ?? '')
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Convert a MIDI note number to a human-readable name (e.g. 60 → "C4").
 * @param {number} pitch    – pitch relative to base MIDI 60
 * @param {number} [trackPitch=0] – additional pitch offset from track
 * @returns {string}
 */
export function pitchToNoteName(pitch, trackPitch = 0) {
    const baseMidi = 60
    const midiNote = baseMidi + trackPitch + pitch
    const noteIndex = ((midiNote % 12) + 12) % 12
    const octave = Math.floor(midiNote / 12) - 1
    return `${NOTE_NAMES[noteIndex]}${octave}`
}
