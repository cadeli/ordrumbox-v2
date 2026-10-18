// src/core/legacy_keys.js
//
// Read-side aliases for persisted keys that were renamed. IndexedDB records are
// rewritten by MIGRATIONS[8] in core/idb.js, but files outside the DB (.odbox,
// pattern JSON, imported song.json) are mapped on read instead: they can be
// older than any migration and are never rewritten on disk.
//
// Note keys keep their own alias table in core/note_schema.js
// (LEGACY_NOTE_KEY_ALIASES) — this module carries the track and song keys.

/** Legacy track key -> its current spelling. @type {Readonly<Record<string, string>>} */
const LEGACY_TRACK_KEY_ALIASES = Object.freeze({ soundId: 'sampleId' })

/** Legacy song-clip key -> its current spelling. @type {Readonly<Record<string, string>>} */
const LEGACY_CLIP_KEY_ALIASES = Object.freeze({ startBar: 'startMeasure', bars: 'measureCount' })

/** Legacy song key -> its current spelling. @type {Readonly<Record<string, string>>} */
const LEGACY_SONG_KEY_ALIASES = Object.freeze({ loopBars: 'loopMeasureCount' })


/**
 * Rename legacy keys onto their current spellings in place, using the given
 * alias table. The current name always wins (a record carrying both keeps the
 * newer value). Returns whether anything changed.
 * @param {any} obj
 * @param {Readonly<Record<string, string>>} aliases
 * @returns {boolean}
 */
function renameLegacyKeys(obj, aliases) {
    if (!obj || typeof obj !== 'object') return false
    let changed = false
    for (const [legacy, current] of Object.entries(aliases)) {
        if (!Object.prototype.hasOwnProperty.call(obj, legacy)) continue
        if (!(current in obj)) obj[current] = obj[legacy]
        delete obj[legacy]
        changed = true
    }
    return changed
}
/**
 * Rename the legacy spellings of one track's keys in place. The current name
 * always wins, so a record carrying both spellings keeps the newer value.
 * @param {any} track
 * @returns {boolean} whether anything changed
 */
export function migrateLegacyTrackKeys(track) {
    return renameLegacyKeys(track, LEGACY_TRACK_KEY_ALIASES)
}

/**
 * Rename the legacy spellings of one clip in place (`startBar`, `bars`).
 * @param {any} clip
 * @returns {boolean} whether anything changed
 */
export function migrateLegacyClipKeys(clip) {
    return renameLegacyKeys(clip, LEGACY_CLIP_KEY_ALIASES)
}

/**
 * Rename the legacy spellings of one song in place: `loopBars` and the clip
 * keys of every clip. The song's embedded patterns are the caller's job — they
 * travel through migrateLegacyPatternKeys() in core/note_schema.js.
 * @param {any} song
 * @returns {boolean} whether anything changed
 */
export function migrateLegacySongKeys(song) {
    if (!song || typeof song !== 'object') return false
    let changed = renameLegacyKeys(song, LEGACY_SONG_KEY_ALIASES)
    if (Array.isArray(song.clips)) {
        for (const clip of song.clips) changed = migrateLegacyClipKeys(clip) || changed
    }
    return changed
}
