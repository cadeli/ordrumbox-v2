import Utils from '../core/utils.js'
import { NOTE_DEFAULTS, normalizeNote } from '../core/note_schema.js'

export default class MfDefaults {
    static TAG = "MFDEFAULTS"

    static normalizeNote = normalizeNote

    static getNoteProp(note, key) {
        return note?.[key] ?? NOTE_DEFAULTS[key]
    }

    static getTrackProp(track, key) {
        return track?.[key] ?? Utils.TRACK_DEFAULTS[key]
    }

    static getPatternProp(pattern, key) {
        return pattern?.[key] ?? Utils.PATTERN_DEFAULTS[key]
    }
}
