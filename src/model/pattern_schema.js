/**
 * Defaults of a PATTERN object: what a new pattern (or a fresh load) is made of.
 * Track-level defaults live in track_schema.js, note-level in note_schema.js.
 *
 * @typedef {object} Pattern
 * @property {string}  id            - Stable id, assigned once at creation and never
 *                                     regenerated: song arrangements reference patterns
 *                                     by id (see song_schema.js). A rename must not
 *                                     change it. Default: ""
 * @property {number}  beatCount     - Beats in the pattern (a measure is 4). Default: 4
 * @property {number}  bpm           - Tempo. Default: 120
 * @property {string}  description   - Free-text description. Default: ""
 * @property {Array}   tags          - Free-text tags. Default: []
 * @property {Array}   tracks        - Track array (normalized on import, never an
 *                                     indexed object). Default: []
 */
export const PATTERN_DEFAULTS = {
    id: '',
    beatCount: 4,
    bpm: 120,
    description: '',
    tags: [],
    tracks: [],
}
