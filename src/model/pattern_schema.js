/**
 * Defaults of a PATTERN object: what a new pattern (or a fresh load) is made of.
 * Track-level defaults live in track_schema.js, note-level in note_schema.js.
 */
export const PATTERN_DEFAULTS = {
    // Stable id, assigned once at creation and never regenerated: song
    // arrangements reference patterns by id (see song_schema.js).
    // A rename must not change it.
    id: '',
    beatCount: 4,
    bpm: 120,
    description: '',
    tags: [],
    tracks: [],
}
