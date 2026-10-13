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
export const LEGACY_TRACK_KEY_ALIASES = Object.freeze({ soundId: 'sampleId' })

/** Legacy song-clip key -> its current spelling. @type {Readonly<Record<string, string>>} */
const LEGACY_CLIP_KEY_ALIASES = Object.freeze({ startBar: 'startMeasure', bars: 'measureCount' })

/** Legacy song key -> its current spelling. @type {Readonly<Record<string, string>>} */
const LEGACY_SONG_KEY_ALIASES = Object.freeze({ loopBars: 'loopMeasureCount' })

/**
 * Rename the legacy spellings of one track's keys in place. The current name
 * always wins, so a record carrying both spellings keeps the newer value.
 * @param {any} track
 * @returns {boolean} whether anything changed
 */
export function migrateLegacyTrackKeys(track) {
    if (!track || typeof track !== 'object') return false
    let changed = false
    for (const [legacy, current] of Object.entries(LEGACY_TRACK_KEY_ALIASES)) {
        if (!Object.prototype.hasOwnProperty.call(track, legacy)) continue
        if (!(current in track)) track[current] = track[legacy]
        // The delete mutates too, so it counts as a change: dropping it here
        // left MIGRATIONS[8] thinking the record was already up to date.
        delete track[legacy]
        changed = true
    }
    return changed
}

/**
 * Rename the legacy spellings of one clip in place (`startBar`, `bars`).
 * @param {any} clip
 * @returns {boolean} whether anything changed
 */
export function migrateLegacyClipKeys(clip) {
    if (!clip || typeof clip !== 'object') return false
    let changed = false
    for (const [legacy, current] of Object.entries(LEGACY_CLIP_KEY_ALIASES)) {
        if (!Object.prototype.hasOwnProperty.call(clip, legacy)) continue
        if (!(current in clip)) clip[current] = clip[legacy]
        delete clip[legacy]
        changed = true
    }
    return changed
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
    let changed = false
    for (const [legacy, current] of Object.entries(LEGACY_SONG_KEY_ALIASES)) {
        if (!Object.prototype.hasOwnProperty.call(song, legacy)) continue
        if (!(current in song)) song[current] = song[legacy]
        delete song[legacy]
        changed = true
    }
    if (Array.isArray(song.clips)) {
        for (const clip of song.clips) changed = migrateLegacyClipKeys(clip) || changed
    }
    return changed
}
