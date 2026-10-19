/**
 * Defaults of a PATTERN object: what a new pattern (or a fresh load) is made of.
 * Track-level defaults live in track_schema.js, note-level in note_schema.js.
 *
 * @typedef {object} Pattern
 * @property {string}  id            - Stable id, assigned once at creation and never
 *                                     regenerated: song arrangements reference patterns
 *                                     by id (see song_schema.js). A rename must not
 *                                     change it. Default: ""
 * @property {string}  [name]        - Display name. Set by createPattern()/rename and
 *                                     by every import path, but absent from
 *                                     PATTERN_DEFAULTS — hence optional here.
 * @property {number}  beatCount     - Beats in the pattern (a measure is 4). Default: 4
 * @property {number}  bpm           - Tempo. Default: 120
 * @property {string}  description   - Free-text description. Default: ""
 * @property {string[]} tags         - Free-text tags. Default: []
 * @property {import('./track_schema.js').Track[]} tracks - Track array (normalized on
 *                                     import, never an indexed object). Default: []
 * @property {number}  [_revision]       - Undo/redo bookkeeping (commander.js), bumped
 *                                         on every command touching the pattern.
 * @property {string}  [_autoGenGenre]   - Auto-generation state (auto_generator.js).
 * @property {string}  [_autoGenScale]   - Auto-generation state (auto_generator.js).
 * @property {number}  [_autoGenKeyOffset] - Auto-generation state (auto_generator.js).
 */
/** @type {Pattern} */
export const PATTERN_DEFAULTS = {
    id: '',
    beatCount: 4,
    bpm: 120,
    description: '',
    tags: [],
    tracks: [],
}
Object.freeze(PATTERN_DEFAULTS)
