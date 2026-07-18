/**
 * note_schema.js — Single source of truth for note structure.
 *
 * Defines the ordered list of note properties and their default values.
 * Used by the compact format exporter/importer to encode notes as arrays
 * instead of objects, reducing JSON size by ~40%.
 *
 * ## Compact Format Spec
 *
 * Each track has a `noteKeys` array listing the property names used in that track.
 * Each note is encoded as an array where index i corresponds to noteKeys[i].
 * Properties at their default value are omitted from the end of the array.
 *
 * Example:
 *   noteKeys: ["velocity", "beat", "beatStep", "pitch"]
 *   notes: [
 *     [0.4],                        → velocity=0.4 (rest at defaults)
 *     [0.9, 1],                     → velocity=0.9, beat=1
 *     [0.35, 1, 2],                 → velocity=0.35, beat=1, beatStep=2
 *     [0.35, 2, 2, -3]              → velocity=0.35, beat=2, beatStep=2, pitch=-3
 *   ]
 *
 * ## Backward Compatibility
 *
 * The loader accepts both:
 *   - Legacy format: notes as objects with named keys
 *   - Compact format: notes as arrays with noteKeys header
 *
 * Detection: if `noteKeys` is present on the track → compact format.
 */

/**
 * Ordered list of note properties for the compact array format.
 * Order matters: index in this array = index in the note array.
 *
 * @typedef {string} NoteKey
 */
export const NOTE_KEY_ORDER = [
    'velocity',
    'beat',
    'beatStep',
    'pitch',
    'pan',
    'every',
    'prob',
    'rate',
    'retriggerNum',
    'arp',
    'arpTriggerProbability',
    'euclidianFill',
    'pos'
];

/**
 * Default values for note properties.
 * Properties at these values are omitted from the compact format.
 *
 * @typedef {Object} NoteDefaults
 * @property {number} velocity              - Playback volume (0–1). Default: 0.8
 * @property {number} beat                  - Measure index within the track (0-based). Default: 0
 * @property {number} beatStep              - Step index within the measure (0-based). Default: 0
 * @property {number} pitch                 - Pitch offset in semitones. Default: 0 (no transposition)
 * @property {number} pan                   - Stereo pan (-1=left, 0=center, 1=right). Default: 0
 * @property {number} every                 - Play every N steps (1=every step, 2=every other, etc). Default: 1
 * @property {number} prob                  - Trigger probability (0–1). Default: 1 (certain)
 * @property {number} rate                  - Playback rate multiplier (1=normal). Default: 1
 * @property {number} retriggerNum          - Number of retriggers per step (1=no retrigger). Default: 1
 * @property {Array|null} arp               - Arpeggio intervals (e.g. [0, 4, 7]). Default: null (disabled)
 * @property {number} arpTriggerProbability - Probability of arpeggio trigger (0–1). Default: 1
 * @property {number} euclidianFill         - Euclidean fill amount (0–16). Default: 0 (disabled)
 * @property {number} pos                   - Position within the step for micro-timing. Default: 0
 */
export const NOTE_DEFAULTS = {
    velocity: 0.8,
    beat: 0,
    beatStep: 0,
    pitch: 0,
    pan: 0,
    every: 1,
    prob: 1,
    rate: 1,
    retriggerNum: 1,
    arp: null,
    arpTriggerProbability: 1,
    euclidianFill: 0,
    pos: 0
};

/**
 * Properties that are recalculated on the fly (derived).
 * Never exported or imported in the compact format.
 */
export const NOTE_RECALCULATED = ['steppc', 'stepPercent'];

/**
 * Position keys used for step calculation.
 * Included in the compact format when non-default.
 */
export const NOTE_POSITION_KEYS = new Set(['beat', 'beatStep', 'steppc', 'stepPercent']);

/**
 * Convert a note object to a compact array using the given key order.
 * Omits trailing default values (keeps all values up to and including
 * the last non-default value).
 *
 * @param {Object} note - The note object
 * @param {string[]} keys - The key order to use
 * @returns {Array} Compact note array
 */
export function noteToObjectCompact(note, keys = NOTE_KEY_ORDER) {
    let lastIndex = -1;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const val = note[key];
        const defaultVal = NOTE_DEFAULTS[key];
        if (val !== undefined && val !== defaultVal) {
            lastIndex = i;
        }
    }
    if (lastIndex === -1) return [];
    const arr = [];
    for (let i = 0; i <= lastIndex; i++) {
        arr.push(note[keys[i]] ?? NOTE_DEFAULTS[keys[i]]);
    }
    return arr;
}

/**
 * Convert a compact array back to a note object using the given key order.
 * Missing values are filled with defaults.
 *
 * @param {Array} arr - Compact note array
 * @param {string[]} keys - The key order to use
 * @returns {Object} Note object with all properties
 */
export function compactArrayToNote(arr, keys = NOTE_KEY_ORDER) {
    const note = {};
    for (let i = 0; i < arr.length && i < keys.length; i++) {
        note[keys[i]] = arr[i];
    }
    return note;
}

/**
 * Determine which keys are actually used in a set of notes.
 * Returns only the keys needed (non-default values present), in NOTE_KEY_ORDER.
 *
 * @param {Object[]} notes - Array of note objects
 * @returns {string[]} Used keys in optimal order
 */
export function detectUsedKeys(notes) {
    const used = new Set();
    for (const note of notes) {
        for (const key of NOTE_KEY_ORDER) {
            if (key in note && note[key] !== NOTE_DEFAULTS[key]) {
                used.add(key);
            }
        }
    }
    return NOTE_KEY_ORDER.filter(key => used.has(key));
}

/**
 * Check if a track's notes are in compact array format.
 *
 * @param {Object} track - The track object
 * @returns {boolean} True if notes are arrays (compact format)
 */
export function isCompactFormat(track) {
    return Array.isArray(track.noteKeys) && track.notes?.length > 0 && Array.isArray(track.notes[0]);
}

/**
 * Normalize a note object by applying default values for missing properties.
 * Single source of truth for note normalization.
 *
 * @param {Object|null} note - The note object to normalize
 * @returns {Object} Normalized note with all properties
 */
export function normalizeNote(note) {
    if (!note) return { ...NOTE_DEFAULTS };
    return {
        velocity: note.velocity ?? NOTE_DEFAULTS.velocity,
        beat: note.beat ?? NOTE_DEFAULTS.beat,
        beatStep: note.beatStep ?? NOTE_DEFAULTS.beatStep,
        pitch: note.pitch ?? NOTE_DEFAULTS.pitch,
        pan: note.pan ?? NOTE_DEFAULTS.pan,
        every: note.every ?? NOTE_DEFAULTS.every,
        prob: note.prob ?? NOTE_DEFAULTS.prob,
        rate: note.rate ?? NOTE_DEFAULTS.rate,
        retriggerNum: note.retriggerNum ?? NOTE_DEFAULTS.retriggerNum,
        arp: note.arp ?? NOTE_DEFAULTS.arp,
        arpTriggerProbability: note.arpTriggerProbability ?? NOTE_DEFAULTS.arpTriggerProbability,
        euclidianFill: note.euclidianFill ?? NOTE_DEFAULTS.euclidianFill,
        pos: note.pos ?? NOTE_DEFAULTS.pos,
        ...note,
    };
}
