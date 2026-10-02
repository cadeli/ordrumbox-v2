// @ts-check
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
//    `clip.startBar`, so its local step is measured from there.

import { BEATS_PER_BAR, songBpm, songLengthBars } from '../model/song_schema.js'

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

/** Transport tick -> position in the song, in bars (fractional). */
export function tickToSongBars(tick, tickPerBar) {
    return tick / tickPerBar
}

/**
 * Patterns sounding at `tick` under `song`.
 *
 * @param {import('../model/song_schema.js').Song|null|undefined} song a normalized song
 * @param {Map<string, {beatCount?: number, bpm?: number}>|Record<string, {beatCount?: number, bpm?: number}>} patternsById
 * @param {number} tick transport tick (monotonic; never reset by this module)
 * @param {number} ticksPerBeat 32
 * @param {number} [loopBars] overrides the song's own loop length
 * @returns {SongSource[]}
 */
export function resolveSongSources(song, patternsById, tick, ticksPerBeat, loopBars) {
    if (!song || tick == null || !Number.isFinite(tick)) return []

    const tickPerBar = ticksPerBeat * BEATS_PER_BAR
    if (!(tickPerBar > 0)) return []

    const total = Number(loopBars) > 0 ? Number(loopBars) : songLengthBars(song)
    if (!(total > 0)) return []

    // Wrapping here (rather than resetting the transport) keeps the transport
    // free to keep counting, and makes "play the same bar twice" impossible.
    const bars = tickToSongBars(tick, tickPerBar) % total
    const clips = song.clips ?? []

    /** @type {SongSource[]} */
    const sources = []
    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i]
        const startBar = Number(clip.startBar) || 0
        const bars_ = Number(clip.bars) > 0 ? Number(clip.bars) : 1
        // bars < startBar + bars_: a 0.75-bar clip still occupies the bar it
        // starts in, which is why this compares against the fractional end.
        if (bars < startBar || bars >= startBar + bars_) continue

        const pattern = patternsById instanceof Map ? patternsById.get(clip.pattern) : patternsById?.[clip.pattern]
        if (!pattern) continue

        const beatCount = Number(pattern.beatCount)
        const patternTicks = (Number.isFinite(beatCount) && beatCount > 0 ? beatCount : 4) * ticksPerBeat
        const clipStartTick = startBar * tickPerBar
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
    const byId = new Map()
    for (const pattern of patterns ?? []) {
        if (pattern?.id) byId.set(pattern.id, pattern)
    }
    const out = []
    const seen = new Set()
    for (const clip of song?.clips ?? []) {
        const pattern = byId.get(clip.pattern)
        if (!pattern || seen.has(pattern)) continue
        seen.add(pattern)
        out.push(pattern)
    }
    return out
}

/**
 * Where the transport sits in the arrangement, in bars (fractional).
 *
 * The transport keeps counting past the last bar — the song wraps inside
 * resolveSongSources rather than resetting the transport — so the position is
 * wrapped on the loop length. Shared by the grid playhead and the menus that
 * insert a clip, which must agree on the bar they name.
 *
 * @param {import('../model/song_schema.js').Song|null|undefined} song
 * @param {number} tick transport tick
 * @param {number} [ticksPerBeat] 32
 * @returns {number}
 */
export function songBarAtTick(song, tick, ticksPerBeat = 32) {
    const bar = tickToSongBars(tick ?? 0, ticksPerBeat * BEATS_PER_BAR)
    const total = song?.loopBars ?? songLengthBars(song)
    if (!(total > 0) || bar <= 0) return Math.max(0, bar)
    return ((bar % total) + total) % total
}

/**
 * Transport tick for a given bar, so the UI can show where the song is.
 * @param {number} bar
 * @param {number} ticksPerBeat
 * @returns {number}
 */
export function barToTick(bar, ticksPerBeat) {
    return Math.floor(bar * ticksPerBeat * BEATS_PER_BAR)
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
