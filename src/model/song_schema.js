// src/model/song_schema.js
//
// Single source of truth for the *arrangement* format: a song is an ordered
// list of clips that place patterns on a measure timeline, and several clips may
// overlap.
//
// ## Format
//
// song.json is a pattern library shared by every arrangement:
//
//     {
//       infos:   { name, description, date },
//       songs:   [ { id, name, description, bpm, clips: [...] } ],
//       patterns:[ { id, name, beatCount, tracks: [...] } ]
//     }
//
// A clip is `{ pattern, startMeasure, measureCount }`:
//   - `pattern`   the **id** of a pattern, never its index or name: indices
//                 shift when a pattern is removed, duplicated or undone, and a
//                 rename would silently detach every clip.
//   - `startMeasure`  0-based measure where the pattern starts (1 measure = 4 beats).
//   - `measureCount`  duration in measures. A clip added through
//                 `cmd.addSongClip()` defaults it to the pattern's own length
//                 (beatCount / 4), so an 8-beat pattern needs only
//                 `{pattern, startMeasure}`; `normalizeSong()`, which can be called
//                 without the pattern library, falls back to 1 measure instead.
//
// ## Measure maths
//
// `beatCount` is authored in beats and may be any value in 1..MAX_BEATS, so a
// pattern is not necessarily a whole number of measures. We keep that: a clip may
// last 0.75 measure. Only *positions* snap to whole measures, because that is what a
// measure-based arrangement grid can draw.

/** Beats in one measure of 4/4. */
export const BEATS_PER_MEASURE = 4

/** BPM bounds accepted in a song file. */
export const SONG_MIN_BPM = 20
export const SONG_MAX_BPM = 300

/**
 * One placement of a pattern on the measure timeline.
 * @typedef {{ pattern: string, startMeasure: number, measureCount: number }} SongClip
 */

/**
 * A validated arrangement.
 * @typedef {object} Song
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {number} bpm
 * @property {number} [loopMeasureCount]
 * @property {SongClip[]} clips
 */

/**
 * A clip that was rejected during normalization, kept so the caller can tell the
 * user which pattern reference went stale instead of silently losing it.
 * @typedef {{ pattern: string, reason: string }} DroppedClip
 */

/** Song fields written by the exporter and expected on load. */
export const SONG_DEFAULTS = Object.freeze({
    name: '',
    description: '',
    bpm: 120,
    clips: [],
})

// The id helpers live in core/ids.js (core may not import model, and idb.js
// needs them for its migration); re-exported here as the domain-facing entry.
import { slugify, uniqueId, ensurePatternId } from '../core/ids.js'
import { migrateLegacySongKeys } from '../core/legacy_keys.js'

export { slugify, uniqueId, ensurePatternId }

/**
 * Measures occupied by a pattern. A pattern shorter than a measure still occupies
 * measure it starts in — the grid cannot draw a fraction of a row.
 * @param {{ beatCount?: number }|null|undefined} pattern
 * @returns {number} measures, > 0
 */
export function measuresForPattern(pattern) {
    const beats = Number(pattern?.beatCount)
    if (!Number.isFinite(beats) || beats <= 0) return 1
    // Not floored to 1: beatCount is authored in beats and 1..MAX_BEATS are all
    // legal, so a 3-beat pattern really is 0.75 measure long.
    return beats / BEATS_PER_MEASURE
}

/**
 * How far the arrangement reaches: the furthest end across its clips.
 *
 * The measure after the last one, so a clip on measure 8 lasting 4 measures ends at 12.
 * The grid width and the loop length are both derived from this — see
 * songLengthMeasures and SongCommands.
 * @param {Song|null|undefined} song a normalized song
 * @returns {number} measures, 0 when the song has no clip
 */
export function songContentMeasures(song) {
    let end = 0
    for (const clip of song?.clips ?? []) end = Math.max(end, (clip.startMeasure ?? 0) + clip.measureCount)
    return end
}

/**
 * Total length of a song in measureCount: the furthest end across its clips, or
 * `loopMeasureCount` when the song declares one.
 * @param {Song|null|undefined} song a normalized song
 * @returns {number} measures, 0 when the song has no clip
 */
export function songLengthMeasures(song) {
    if (!song) return 0
    if (Number.isFinite(Number(song.loopMeasureCount)) && Number(song.loopMeasureCount) > 0) {
        return Math.max(1, Math.floor(Number(song.loopMeasureCount)))
    }
    return songContentMeasures(song)
}

/**
 * Resolve a song's tempo. A song plays every pattern at one BPM; its own value
 * wins, and `fallbackBpm` (the first pattern played) covers a file that omits it.
 * @param {{ bpm?: number }|null|undefined} song
 * @param {number} [fallbackBpm]
 * @returns {number}
 */
export function songBpm(song, fallbackBpm = SONG_DEFAULTS.bpm) {
    const bpm = Number(song?.bpm)
    if (Number.isFinite(bpm) && bpm >= SONG_MIN_BPM && bpm <= SONG_MAX_BPM) return bpm
    const fb = Number(fallbackBpm)
    return Number.isFinite(fb) ? fb : SONG_DEFAULTS.bpm
}

/**
 * Validate and normalize one song. Unknown clips (referencing a pattern id that
 * is not in the library) are dropped and reported by name rather than failing
 * the whole file: a partially stale arrangement is still worth loading.
 *
 * A file written before the measure rename (`startBar`/`bars`/`loopBars`) is
 * mapped first, in place — raw is either a freshly parsed file or an
 * already-normalized song, where the mapping is a no-op.
 *
 * @param {any} raw
 * @param {Map<string, object>|Set<string>} knownPatternIds library ids, or a Map id→pattern
 * @returns {{ ok: boolean, song?: Song, error?: string, dropped?: DroppedClip[] }}
 */
export function normalizeSong(raw, knownPatternIds) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, error: 'Each song must be a JSON object' }
    }
    migrateLegacySongKeys(raw)

    const ids = knownPatternIds instanceof Map ? new Set(knownPatternIds.keys()) : (knownPatternIds ?? new Set())
    const clips = []
    /** @type {DroppedClip[]} */
    const dropped = []

    if (raw.clips != null && !Array.isArray(raw.clips)) {
        return { ok: false, error: '"clips" must be an array' }
    }
    for (const [index, rawClip] of (raw.clips ?? []).entries()) {
        if (!rawClip || typeof rawClip !== 'object' || Array.isArray(rawClip)) {
            dropped.push({ pattern: `#${index}`, reason: 'clip is not an object' })
            continue
        }
        const ref = String(rawClip.pattern ?? '').trim()
        if (!ref) {
            dropped.push({ pattern: `#${index}`, reason: 'clip has no pattern' })
            continue
        }
        if (!ids.has(ref)) {
            dropped.push({ pattern: ref, reason: 'unknown pattern id' })
            continue
        }
        const startMeasure = Math.max(0, Math.floor(Number(rawClip.startMeasure) || 0))
        // Default length comes from the referenced pattern, which the caller may
        // not have handed us; 1 measure is the sane floor either way.
        const measureCount = Number(rawClip.measureCount) > 0 ? Number(rawClip.measureCount) : 1
        clips.push({ pattern: ref, startMeasure, measureCount })
    }

    const bpm = Number(raw.bpm)
    return {
        ok: true,
        song: {
            id: String(raw.id ?? '').trim() || slugify(raw.name) || 'song',
            name: String(raw.name ?? SONG_DEFAULTS.name),
            description: String(raw.description ?? SONG_DEFAULTS.description),
            bpm: Number.isFinite(bpm) && bpm >= SONG_MIN_BPM && bpm <= SONG_MAX_BPM ? bpm : SONG_DEFAULTS.bpm,
            ...(Number(raw.loopMeasureCount) > 0 ? { loopMeasureCount: Math.floor(Number(raw.loopMeasureCount)) } : {}),
            clips,
        },
        dropped,
    }
}

/**
 * Normalize a whole `songs` array, de-duplicating song ids on the way.
 * @param {any} raw
 * @param {Map<string, object>|Set<string>} knownPatternIds
 * @returns {{ songs: Song[], dropped: DroppedClip[] }}
 */
export function normalizeSongs(raw, knownPatternIds) {
    if (!Array.isArray(raw)) return { songs: [], dropped: [] }
    const taken = new Set()
    const songs = []
    const dropped = []
    for (const entry of raw) {
        const result = normalizeSong(entry, knownPatternIds)
        if (!result.ok || !result.song) continue
        const song = result.song
        if (taken.has(song.id)) song.id = uniqueId(`${song.id}-alt`, taken)
        else taken.add(song.id)
        dropped.push(...result.dropped)
        songs.push(song)
    }
    return { songs, dropped }
}

/**
 * Re-project a song's clips on a new pattern library — used after a pattern is
 * removed, so clips pointing at a dead id are dropped instead of dangling.
 * @param {object|null|undefined} song
 * @param {Set<string>|Map<string, object>} knownPatternIds
 * @returns {object|null} a new song, or null when the song had nothing left
 */
export function pruneSongClips(song, knownPatternIds) {
    if (!song) return null
    const result = normalizeSong(song, knownPatternIds)
    if (!result.ok || !result.song) return null
    return result.song.clips.length > 0 ? result.song : null
}
