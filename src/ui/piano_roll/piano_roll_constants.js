// src/ui/piano_roll/piano_roll_constants.js
// Shared geometry for the piano roll panel.

import { NOTE_NAMES } from '../../core/note_names.js'

export const NOTE_HEIGHT = 14
export const BLACK_KEY_INDICES = new Set([1, 3, 6, 8, 10])

export const MIDI_MIN = 12
export const MIDI_MAX = 108
export const TOTAL_KEYS = MIDI_MAX - MIDI_MIN + 1
export const MIDDLE_C = 60
export const GRID_HEIGHT = TOTAL_KEYS * NOTE_HEIGHT

export const MIN_CELL_WIDTH = 16
export const KEYS_COLUMN_WIDTH = 80

/** @param {number} midi @returns {string} */
export function midiName(midi) {
    return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

