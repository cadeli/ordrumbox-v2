import { PATTERN_DEFAULTS } from '../model/pattern_schema.js'
import { TRACK_DEFAULTS } from '../model/track_schema.js'
import { NOTE_DEFAULTS, normalizeNote } from '../core/note_schema.js'
/**
 * Fallback accessors for the three default tables. It defines none of them: the
 * note table lives in core/note_schema.js, the track and pattern ones in
 * model/track_schema.js, so edit THOSE, not this file.
 */
export default class Defaults {
    static TAG = 'Defaults'

    static normalizeNote = normalizeNote

    /** note[key], falling back to NOTE_DEFAULTS.
     *  @template {keyof typeof NOTE_DEFAULTS} K
     *  @param {Partial<Record<K, typeof NOTE_DEFAULTS[K]>>|null|undefined} note
     *  @param {K} key
     *  @returns {typeof NOTE_DEFAULTS[K]} */
    static getNoteProp(note, key) {
        return note?.[key] ?? NOTE_DEFAULTS[key]
    }

    /** track[key], falling back to TRACK_DEFAULTS.
     *  @template {keyof typeof TRACK_DEFAULTS} K
     *  @param {Partial<Record<K, typeof TRACK_DEFAULTS[K]>>|null|undefined} track
     *  @param {K} key
     *  @returns {typeof TRACK_DEFAULTS[K]} */
    static getTrackProp(track, key) {
        return track?.[key] ?? TRACK_DEFAULTS[key]
    }

    /** pattern[key], falling back to PATTERN_DEFAULTS.
     *  @template {keyof typeof PATTERN_DEFAULTS} K
     *  @param {Partial<Record<K, typeof PATTERN_DEFAULTS[K]>>|null|undefined} pattern
     *  @param {K} key
     *  @returns {typeof PATTERN_DEFAULTS[K]} */
    static getPatternProp(pattern, key) {
        return pattern?.[key] ?? PATTERN_DEFAULTS[key]
    }
}
