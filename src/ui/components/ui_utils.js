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

/**
 * Compute the MIDI note number from pitch and track pitch offset.
 * @param {number} pitch – pitch relative to base MIDI 60
 * @param {number} [trackPitch=0] – additional pitch offset from track
 * @returns {number}
 */
export function pitchToMidi(pitch, trackPitch = 0) {
    return 60 + trackPitch + pitch
}

/**
 * Build a detailed tooltip string for a note, including MIDI number and properties.
 * @param {Object} note
 * @param {number} trackPitch
 * @returns {string}
 */
export function formatNoteTooltip(note, trackPitch = 0) {
    const pitch = note.pitch ?? 0
    const midiNote = pitchToMidi(pitch, trackPitch)
    const name = pitchToNoteName(pitch, trackPitch)

    const parts = [`${name}  MIDI ${midiNote}`]

    const vel = note.velocity ?? 0.8
    if (vel !== 0.8) parts.push(`vel:${fmt(vel)}`)

    const prob = note.prob ?? 1
    if (prob !== 1) parts.push(`prob:${fmt(prob)}`)

    const every = note.every ?? 1
    if (every !== 1) parts.push(`every:${every}`)

    const retriggerNum = note.retriggerNum ?? 1
    if (retriggerNum !== 1) parts.push(`retrig:${retriggerNum}`)

    const arp = note.arp
    if (arp && Array.isArray(arp) && arp.length >= 2) {
        parts.push(`arp:[${arp.join(',')}]`)
    } else if (arp && typeof arp === 'object' && !Array.isArray(arp) && Array.isArray(arp.intervals) && arp.intervals.length >= 2) {
        parts.push(`arp:[${arp.intervals.join(',')}]`)
    }

    const arpTriggerProb = note.arpTriggerProbability ?? 1
    if (arpTriggerProb !== 1) parts.push(`arpProb:${fmt(arpTriggerProb)}`)

    const euclidianFill = note.euclidianFill ?? 0
    if (euclidianFill > 0) parts.push(`eucl:${euclidianFill}`)

    const rate = note.rate ?? 1
    if (rate !== 1) parts.push(`rate:${fmt(rate)}`)

    const pan = note.pan ?? 0
    if (pan !== 0) parts.push(`pan:${fmt(pan)}`)

    return parts.join('  ')
}
