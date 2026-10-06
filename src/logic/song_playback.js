// src/logic/song_playback.js
//
// Resolves what the transport must sound at a given tick when a song
// arrangement is playing. Pure: it takes the transport tick and returns the
// patterns to sound, so it can be unit tested without an AudioContext.
//
// ## Two things make this non-obvious
//
// 1. **Clips may overlap.** Several patterns can cover the same measure and all
//    of them sound together — that is the point of an arrangement. The caller
//    layers their notes.
//
// 2. **A pattern plays in phase with its own clip, not with the transport.**
//    Patterns have their own length (beatCount), so `tick % patternTicks` would
//    drift as soon as a clip did not start on a cycle boundary of that pattern.
//    Each clip therefore owns its own phase: the pattern started playing at
//    `clip.startMeasure`, so its local step is measured from there.

import { BEATS_PER_MEASURE, songBpm, songLengthMeasures } from '../model/song_schema.js'

/** Playback modes: loop the selected pattern, or follow a song arrangement. */
export const PLAYBACK_MODE = Object.freeze({ PATTERN: 'pattern', SONG: 'song' })

/**
 * @typedef {object} SongSource
 * @property {object} pattern       the pattern to sound
 * @property {import('../model/song_schema.js').SongClip} clip the clip that placed it
 * @property {number} clipIndex     index of that clip in the song
 * @property {number} loop          pattern-cycle counter, drives `every`/variation
 * @property {number} localStep     tick inside the pattern, 0..patternTicks-1
 * @property {number} patternTicks  length of the pattern in ticks
 */

/** Transport tick -> position in the song, in measures (fractional). */
export function tickToSongMeasures(tick, tickPerMeasure) {
    return tick / tickPerMeasure
}

/**
 * Patterns sounding at `tick` under `song`.
 *
 * @param {import('../model/song_schema.js').Song|null|undefined} song a normalized song
 * @param {Map<string, {beatCount?: number, bpm?: number}>|Record<string, {beatCount?: number, bpm?: number}>} patternsById
 * @param {number} tick transport tick (monotonic; never reset by this module)
 * @param {number} ticksPerBeat 32
 * @param {number} [loopMeasureCount] overrides the song's own loop length
 * @returns {SongSource[]}
 */
export function resolveSongSources(song, patternsById, tick, ticksPerBeat, loopMeasureCount) {
    if (!song || tick == null || !Number.isFinite(tick)) return []

    const tickPerMeasure = ticksPerBeat * BEATS_PER_MEASURE
    if (!(tickPerMeasure > 0)) return []

    const total = Number(loopMeasureCount) > 0 ? Number(loopMeasureCount) : songLengthMeasures(song)
    if (!(total > 0)) return []

    // Wrapping here (rather than resetting the transport) keeps the transport
    // free to keep counting, and makes "play the same measure twice" impossible.
    const measures = tickToSongMeasures(tick, tickPerMeasure) % total
    const clips = song.clips ?? []

    /** @type {SongSource[]} */
    const sources = []
    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i]
        const startMeasure = Number(clip.startMeasure) || 0
        const measureCount = Number(clip.measureCount) > 0 ? Number(clip.measureCount) : 1
        // measures < startMeasure + measureCount: a 0.75-measure clip still occupies the measure it
        // starts in, which is why this compares against the fractional end.
        if (measures < startMeasure || measures >= startMeasure + measureCount) continue

        const pattern = patternsById instanceof Map ? patternsById.get(clip.pattern) : patternsById?.[clip.pattern]
        if (!pattern) continue

        const beatCount = Number(pattern.beatCount)
        const patternTicks = (Number.isFinite(beatCount) && beatCount > 0 ? beatCount : 4) * ticksPerBeat
        const clipStartTick = startMeasure * tickPerMeasure
        const elapsed = Math.max(0, tick - clipStartTick)
        sources.push({
            pattern,
            clip,
            clipIndex: i,
            loop: Math.floor(elapsed / patternTicks),
            localStep: Math.floor(elapsed % patternTicks),
            patternTicks,
        })
    }
    return sources
}

/**
 * Every distinct pattern a song plays, in clip order.
 *
 * A song is only audible once all of them are ready: the engine has to assign
 * their sounds and build their strips, and the selected pattern is generally
 * just one of them.
 *
 * @param {import('../model/song_schema.js').Song|null|undefined} song
 * @param {Array<{id?: string}>} patterns the pattern library
 * @returns {Array<object>}
 */
export function songPatterns(song, patterns) {
    const patternsById = new Map()
    for (const pattern of patterns ?? []) {
        if (pattern?.id) patternsById.set(pattern.id, pattern)
    }
    const out = []
    const seen = new Set()
    for (const clip of song?.clips ?? []) {
        const pattern = patternsById.get(clip.pattern)
        if (!pattern || seen.has(pattern)) continue
        seen.add(pattern)
        out.push(pattern)
    }
    return out
}

/**
 * Where the transport sits in the arrangement, in measures (fractional).
 *
 * The transport keeps counting past the last measure — the song wraps inside
 * resolveSongSources rather than resetting the transport — so the position is
 * wrapped on the loop length. Shared by the grid playhead and the menus that
 * insert a clip, which must agree on the measure they name.
 *
 * @param {import('../model/song_schema.js').Song|null|undefined} song
 * @param {number} tick transport tick
 * @param {number} [ticksPerBeat] 32
 * @returns {number}
 */
export function songMeasureAtTick(song, tick, ticksPerBeat = 32) {
    const measure = tickToSongMeasures(tick ?? 0, ticksPerBeat * BEATS_PER_MEASURE)
    const total = song?.loopMeasureCount ?? songLengthMeasures(song)
    if (!(total > 0) || measure <= 0) return Math.max(0, measure)
    return ((measure % total) + total) % total
}

/**
 * Transport tick for a given measure, so the UI can show where the song is.
 * @param {number} measure
 * @param {number} ticksPerBeat
 * @returns {number}
 */
export function measureToTick(measure, ticksPerBeat) {
    return Math.floor(measure * ticksPerBeat * BEATS_PER_MEASURE)
}

/**
 * The tempo a song plays at. The song owns one BPM for the whole arrangement;
 * its own value wins, with the first clip's pattern as the fallback.
 * @param {import('../model/song_schema.js').Song|null|undefined} song
 * @param {Map<string, {bpm?: number}>|Record<string, {bpm?: number}>} [patternsById]
 * @returns {number|null}
 */
export function songTempo(song, patternsById) {
    if (!song) return null
    const first = (song.clips ?? [])[0]
    const lookup = (id) => (patternsById instanceof Map ? patternsById.get(id) : patternsById?.[id])
    const fallback = first ? lookup(first.pattern)?.bpm : undefined
    const bpm = songBpm(song, fallback ?? NaN)
    return Number.isFinite(bpm) ? bpm : null
}
