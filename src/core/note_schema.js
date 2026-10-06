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
 * ## Format Detection
 *
 * Detection: if `noteKeys` is present on the track → compact format.
 */

/**
 * Ordered list of note properties for the compact array format.
 * Order matters: index in this array = index in the note array.
 *
 * @typedef {string} NoteKey
 */
const NOTE_KEY_ORDER = [
    'velocity',
    'beat',
    'beatStep',
    'pitch',
    'pan',
    'every',
    'prob',
    'rate',
    'retriggerCount',
    'arp',
    'arpTriggerProbability',
    'euclideanFill',
    'euclideanRotation',
    'pos',
    // Per-note arpeggio overrides owned by the note editor. Not playback data
    // (NOTE_DEFAULTS holds undefined), but they must survive the compact
    // encoding — leaving them out silently reverted every arpeggio on reload.
    '_arpScale',
    '_arpType',
]

/**
 * Default values for note properties.
 * Properties at these values are omitted from the compact format.
 *
 * @typedef {Object} NoteDefaults
 * @property {number} velocity              - Playback volume (0-1). Default: 0.8
 * @property {number} beat                  - Measure index within the track (0-based). Default: 0
 * @property {number} beatStep              - Step index within the measure (0-based). Default: 0
 * @property {number} pitch                 - Pitch offset in semitones. Default: 0 (no transposition)
 * @property {number} pan                   - Stereo pan (-1=left, 0=center, 1=right). Default: 0
 * @property {number} every                 - Fire once every N passes of the pattern
 *                                          (1 = every pass, 2 = every other pass…). NOT
 *                                          "every N steps": notes live on whole grid
 *                                          steps, this counts pattern cycles — see
 *                                          isTriggered(pos, every, loop). Default: 1
 * @property {number} prob                  - Trigger probability (0-1). Default: 1 (certain)
 * @property {number} rate                  - Ghost/retrigger spacing CODE, decoded by
 *                                          getStepSpacing (`<8` -> value/8,
 *                                          `>=8` -> value-7 steps). Bigger = WIDER, and
 *                                          1 is the tightest setting, not "normal".
 *                                          Default: 1
 * @property {number} retriggerCount          - Number of retriggers per step (1=no retrigger). Default: 1
 * @property {Array|null} arp               - Arpeggio intervals (e.g. [0, 4, 7]). Default: null (disabled)
 * @property {number} arpTriggerProbability - Probability of arpeggio trigger (0-1). Default: 1
 * @property {number} euclideanFill         - Euclidean pulses k over the span to the next note, base note included (0-16, 0=disabled). Default: 0 (disabled)
 * @property {number} euclideanRotation     - Phase offset of the euclidean pattern in steps (0-15). Default: 0
 * @property {number} pos                   - Phase offset inside the `every` cycle: the
 *                                          note fires on the pass where
 *                                          (pass + pos) % every === 0, so pos shifts
 *                                          which pass fires first. Not sub-step
 *                                          micro-timing. Default: 0
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
    retriggerCount: 1,
    arp: null,
    arpTriggerProbability: 1,
    euclideanFill: 0,
    euclideanRotation: 0,
    pos: 0,
    /** @type {string|undefined} arpeggio scale override (note editor only) */
    _arpScale: undefined,
    /** @type {string|undefined} arpeggio direction override (note editor only) */
    _arpType: undefined,
}

/**
 * Properties that are recalculated on the fly (derived).
 * Never exported or imported in the compact format.
 */
export const NOTE_RECALCULATED = ['steppc']

/**
 * Position keys used for step calculation.
 * Included in the compact format when non-default.
 */
export const NOTE_POSITION_KEYS = new Set(['beat', 'beatStep'])

/**
 * Convert a note object to a compact array using the given key order.
 * Omits trailing default values (keeps all values up to and including
 * the last non-default value).
 *
 * @param {Object} note - The note object
 * @param {string[]} keys - The key order to use
 * @returns {Array} Compact note array
 */
const NOTE_ROUND_2D = new Set(['velocity', 'pan', 'prob', 'rate'])

export function noteToObjectCompact(note, keys = NOTE_KEY_ORDER) {
    let lastIndex = -1
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const val = note[key]
        const defaultVal = NOTE_DEFAULTS[key]
        if (val !== undefined && val !== defaultVal) {
            lastIndex = i
        }
    }
    if (lastIndex === -1) return []
    const arr = []
    for (let i = 0; i <= lastIndex; i++) {
        const val = note[keys[i]] ?? NOTE_DEFAULTS[keys[i]]
        arr.push(NOTE_ROUND_2D.has(keys[i]) ? Math.round(val * 100) / 100 : val)
    }
    return arr
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
    const note = {}
    for (let i = 0; i < arr.length && i < keys.length; i++) {
        note[keys[i]] = arr[i]
    }
    return note
}

/**
 * Determine which keys are actually used in a set of notes.
 * Returns only the keys needed (non-default values present), in NOTE_KEY_ORDER.
 *
 * @param {Object[]} notes - Array of note objects
 * @returns {string[]} Used keys in optimal order
 */
export function detectUsedKeys(notes) {
    const used = new Set()
    for (const note of notes) {
        for (const key of NOTE_KEY_ORDER) {
            if (key in note && note[key] !== NOTE_DEFAULTS[key]) {
                used.add(key)
            }
        }
    }
    return NOTE_KEY_ORDER.filter((key) => used.has(key))
}

/**
 * Note keys renamed by past versions, keyed by their CURRENT name.
 *
 * Files written before a rename still carry the old spelling, in object notes
 * and in the compact `noteKeys` header, so every read path maps it back:
 * `fixPattern` (library load + .odbox via song_service), `importPatternFromJson`
 * and the one-shot `MIGRATIONS[7]` rewrite of the IndexedDB copy.
 * @type {Readonly<Record<string, string>>}
 */
export const LEGACY_NOTE_KEY_ALIASES = Object.freeze({ retriggerNum: 'retriggerCount' })

/**
 * Rewrite a note's legacy keys onto their current names, in place. The current
 * key wins when a note carries both, and the legacy one is dropped so it cannot
 * leak back out through the exporter.
 *
 * @param {any} note an object note — anything else is left alone
 * @returns {boolean} true when a key was rewritten
 */
export function migrateLegacyNoteKeys(note) {
    if (!note || typeof note !== 'object' || Array.isArray(note)) return false
    let changed = false
    for (const [legacy, current] of Object.entries(LEGACY_NOTE_KEY_ALIASES)) {
        if (!Object.prototype.hasOwnProperty.call(note, legacy)) continue
        if (note[current] === undefined) note[current] = note[legacy]
        delete note[legacy]
        changed = true
    }
    return changed
}

/**
 * Map a `noteKeys` header onto current names. Compact notes decode
 * positionally, so renaming the header entry moves no value.
 *
 * @param {unknown} keys
 * @returns {string[]} current names (always a fresh array)
 */
export function canonicalNoteKeys(keys) {
    if (!Array.isArray(keys)) return []
    return keys.map((key) => (typeof key === 'string' ? (LEGACY_NOTE_KEY_ALIASES[key] ?? key) : key))
}

/**
 * Rewrite the legacy note keys of every track of a pattern, in place: the
 * compact `noteKeys` header and the object notes. Compact note arrays are
 * left alone — they are positional and follow their header.
 *
 * Track walking is inlined rather than borrowed from `./tracks.js`: that
 * module reaches this one through `./notes.js`, so importing it back would
 * close a cycle (tests/module_graph.test.js).
 *
 * @param {any} pattern
 * @returns {boolean} true when a key was rewritten
 */
export function migrateLegacyPatternKeys(pattern) {
    const tracks = !pattern?.tracks
        ? []
        : Array.isArray(pattern.tracks)
          ? pattern.tracks
          : Object.values(pattern.tracks)
    let changed = false
    for (const track of tracks) {
        if (Array.isArray(track?.noteKeys)) {
            const canonical = canonicalNoteKeys(track.noteKeys)
            if (canonical.some((key, i) => key !== track.noteKeys[i])) {
                track.noteKeys = canonical
                changed = true
            }
        }
        if (Array.isArray(track?.notes)) {
            for (const note of track.notes) changed = migrateLegacyNoteKeys(note) || changed
        }
    }
    return changed
}

/**
 * Check if a track uses compact array format (notes as arrays with noteKeys header).
 *
 * @param {Object} track - The track object
 * @returns {boolean} True if notes are arrays (compact format)
 */
export function isCompactFormat(track) {
    return (
        Array.isArray(track.noteKeys) &&
        track.notes?.length > 0 &&
        Array.isArray(track.notes[0]) &&
        areValidNoteKeys(track.noteKeys)
    )
}

/**
 * A compact track decodes positionally: noteKeys[i] names notes[][i]. A header
 * carrying an unknown key (or reordering the known ones) therefore rewrites
 * note values onto the wrong properties — silently, with no decode error.
 * Only a header made of distinct known keys, in NOTE_KEY_ORDER, is trusted.
 * A legacy spelling (LEGACY_NOTE_KEY_ALIASES) counts as its current name, so a
 * file written before a rename still validates — decode must use
 * canonicalNoteKeys() with the same mapping.
 * @param {unknown} keys
 * @returns {boolean}
 */
export function areValidNoteKeys(keys) {
    if (!Array.isArray(keys)) return false
    const mapped = canonicalNoteKeys(keys)
    if (new Set(mapped).size !== mapped.length) return false
    const positions = mapped.map((k) => NOTE_KEY_ORDER.indexOf(k))
    if (positions.some((i) => i < 0)) return false
    return positions.every((pos, i) => i === 0 || pos > positions[i - 1])
}

/**
 * Normalize a note object by applying default values for missing properties.
 * Single source of truth for note normalization.
 *
 * @param {Object|null} note - The note object to normalize
 * @returns {Object} Normalized note with all properties
 */
export function normalizeNote(note) {
    if (!note) return { ...NOTE_DEFAULTS }
    return {
        velocity: note.velocity ?? NOTE_DEFAULTS.velocity,
        beat: note.beat ?? NOTE_DEFAULTS.beat,
        beatStep: note.beatStep ?? NOTE_DEFAULTS.beatStep,
        pitch: note.pitch ?? NOTE_DEFAULTS.pitch,
        pan: note.pan ?? NOTE_DEFAULTS.pan,
        every: note.every ?? NOTE_DEFAULTS.every,
        prob: note.prob ?? NOTE_DEFAULTS.prob,
        rate: note.rate ?? NOTE_DEFAULTS.rate,
        retriggerCount: note.retriggerCount ?? NOTE_DEFAULTS.retriggerCount,
        arp: note.arp ?? NOTE_DEFAULTS.arp,
        arpTriggerProbability: note.arpTriggerProbability ?? NOTE_DEFAULTS.arpTriggerProbability,
        euclideanFill: note.euclideanFill ?? NOTE_DEFAULTS.euclideanFill,
        euclideanRotation: note.euclideanRotation ?? NOTE_DEFAULTS.euclideanRotation,
        pos: note.pos ?? NOTE_DEFAULTS.pos,
        ...note,
    }
}
