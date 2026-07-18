import Utils from '../core/utils.js';
import {
    NOTE_DEFAULTS,
    NOTE_KEY_ORDER,
    NOTE_RECALCULATED,
    detectUsedKeys,
    noteToObjectCompact
} from '../core/note_schema.js';

export class PatternExporter {
    static isDefaultValue(value, defaultVal) {
        if (value === defaultVal) return true;
        if (value === null && defaultVal === null) return true;
        if (Array.isArray(value) && Array.isArray(defaultVal) && value.length === 0 && defaultVal.length === 0) return true;
        return false;
    }

    static cleanNote(note) {
        const cleaned = {};
        for (const [key, val] of Object.entries(note)) {
            if (NOTE_RECALCULATED.includes(key)) continue;
            if (!(key in NOTE_DEFAULTS) || val !== NOTE_DEFAULTS[key]) {
                cleaned[key] = val;
            }
        }
        return cleaned;
    }

    static cleanTrack(track) {
        const cleaned = {};
        for (const [key, val] of Object.entries(track)) {
            if (Utils.TRACK_RECALCULATED.includes(key)) continue;
            if (key === 'noteKeys') continue;
            if (!(key in Utils.TRACK_DEFAULTS)) {
                cleaned[key] = val;
                continue;
            }
            if (!this.isDefaultValue(val, Utils.TRACK_DEFAULTS[key])) {
                if (key === 'notes') {
                    const encoded = this.encodeNotes(val, track);
                    if (encoded) {
                        cleaned.noteKeys = encoded.noteKeys;
                        cleaned.notes = encoded.notes;
                    } else {
                        cleaned.notes = [];
                    }
                } else {
                    cleaned[key] = val;
                }
            }
        }
        return cleaned;
    }

    static encodeNotes(notes, track) {
        if (!Array.isArray(notes) || notes.length === 0) {
            return null;
        }

        const cleanedNotes = notes.map(n => this.cleanNote(n));
        const usedKeys = detectUsedKeys(cleanedNotes);

        if (usedKeys.length === 0) {
            return null;
        }

        const encoded = cleanedNotes.map(note => noteToObjectCompact(note, usedKeys));

        return { noteKeys: usedKeys, notes: encoded };
    }

    static cleanPattern(pattern) {
        const cleaned = {};
        for (const [key, val] of Object.entries(pattern)) {
            if (!(key in Utils.PATTERN_DEFAULTS) || !this.isDefaultValue(val, Utils.PATTERN_DEFAULTS[key])) {
                if (key === 'tracks') {
                    cleaned[key] = val.map(t => this.cleanTrack(t));
                } else {
                    cleaned[key] = val;
                }
            }
        }
        return cleaned;
    }

    static export(pattern) {
        const cleaned = this.cleanPattern(pattern);
        return {
            application: "online-ordrumbox",
            url: "https://www.ordrumbox.com",
            ...cleaned
        };
    }
}
