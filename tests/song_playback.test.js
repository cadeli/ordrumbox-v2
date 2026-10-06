import { describe, it, expect } from 'vitest'
import {
    PLAYBACK_MODE,
    resolveSongSources,
    songMeasureAtTick,
    songPatterns,
    tickToSongMeasures,
    measureToTick,
    songTempo,
} from '../src/logic/song_playback.js'
import { TICK } from '../src/core/constants.js'
import { BEATS_PER_MEASURE } from '../src/model/song_schema.js'

const MEASURE = TICK * BEATS_PER_MEASURE // one measure in ticks

const patterns = new Map([
    ['rock', { id: 'rock', name: 'Rock', beatCount: 4, bpm: 120 }],
    ['bass', { id: 'bass', name: 'Bass', beatCount: 8, bpm: 90 }],
    ['lead', { id: 'lead', name: 'Lead', beatCount: 4, bpm: 140 }],
])

const song = (clips, extra = {}) => ({ id: 'demo', name: 'Demo', bpm: 120, clips, ...extra })

describe('PLAYBACK_MODE', () => {
    it('exposes the two modes', () => {
        expect(PLAYBACK_MODE.PATTERN).toBe('pattern')
        expect(PLAYBACK_MODE.SONG).toBe('song')
    })
})

describe('resolveSongSources', () => {
    it('is empty without a song or with a zero tick', () => {
        expect(resolveSongSources(null, patterns, 0, TICK)).toEqual([])
        expect(resolveSongSources(song([]), patterns, 0, TICK)).toEqual([])
        expect(
            resolveSongSources(song([{ pattern: 'rock', startMeasure: 0, measureCount: 1 }]), patterns, NaN, TICK),
        ).toEqual([])
    })

    it('sounds the clip covering the current measure', () => {
        const s = song([
            { pattern: 'rock', startMeasure: 0, measureCount: 2 },
            { pattern: 'lead', startMeasure: 4, measureCount: 2 },
        ])
        expect(resolveSongSources(s, patterns, 0, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
        expect(resolveSongSources(s, patterns, 4 * MEASURE, TICK).map((x) => x.pattern.id)).toEqual(['lead'])
    })

    it('is silent in a gap', () => {
        // explicit loopMeasureCount, otherwise a 1-measure song wraps and measure 3 is measure 0
        const s = song([{ pattern: 'rock', startMeasure: 0, measureCount: 1 }], { loopMeasureCount: 8 })
        expect(resolveSongSources(s, patterns, 3 * MEASURE, TICK)).toEqual([])
    })

    // The whole point of the feature: overlapping clips sound together.
    it('returns every clip covering the measure, layered', () => {
        const s = song([
            { pattern: 'rock', startMeasure: 0, measureCount: 2 },
            { pattern: 'bass', startMeasure: 0, measureCount: 2 },
            { pattern: 'lead', startMeasure: 1, measureCount: 1 },
        ])
        expect(resolveSongSources(s, patterns, 0, TICK).map((x) => x.pattern.id)).toEqual(['rock', 'bass'])
        expect(resolveSongSources(s, patterns, MEASURE, TICK).map((x) => x.pattern.id)).toEqual([
            'rock',
            'bass',
            'lead',
        ])
    })

    it('keeps each clip in phase with itself, not with the transport', () => {
        // bass is 8 beats (2 measures) and starts at measure 2; at measure 5 it must be at
        // its own local step 3 measures in, not at 1 measure in as tick % would say.
        const s = song([{ pattern: 'bass', startMeasure: 2, measureCount: 4 }], { loopMeasureCount: 8 })
        const atMeasure5 = resolveSongSources(s, patterns, 5 * MEASURE, TICK)[0]
        // 3 measures elapsed from its own start, on a 2-measure pattern: second pass,
        // one measure in. `tick % patternTicks` would have said measure 1 of the song.
        expect(atMeasure5.patternTicks).toBe(8 * TICK)
        expect(atMeasure5.loop).toBe(1)
        expect(atMeasure5.localStep).toBe(1 * MEASURE)
        expect(atMeasure5.localStep).toBeLessThan(atMeasure5.patternTicks)
    })

    it('reports the loop counter so variation and every vary per cycle', () => {
        const s = song([{ pattern: 'rock', startMeasure: 0, measureCount: 8 }]) // rock = 1 measure
        expect(resolveSongSources(s, patterns, 0, TICK)[0].loop).toBe(0)
        expect(resolveSongSources(s, patterns, 1 * MEASURE, TICK)[0].loop).toBe(1)
        expect(resolveSongSources(s, patterns, 4 * MEASURE, TICK)[0].loop).toBe(4)
    })

    it('wraps at loopMeasureCount and keeps counting', () => {
        const s = song([{ pattern: 'rock', startMeasure: 0, measureCount: 2 }], { loopMeasureCount: 4 })
        expect(resolveSongSources(s, patterns, 0, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
        // measures 2 and 3 are the gap before the wrap
        expect(resolveSongSources(s, patterns, 2 * MEASURE, TICK)).toEqual([])
        expect(resolveSongSources(s, patterns, 3 * MEASURE, TICK)).toEqual([])
        expect(resolveSongSources(s, patterns, 4 * MEASURE, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
        // and the loop counter keeps growing rather than resetting
        expect(resolveSongSources(s, patterns, 8 * MEASURE, TICK)[0].loop).toBe(8)
    })

    it('falls back to the clip extent when loopMeasureCount is absent', () => {
        // no loopMeasureCount: the song loops over its own length (2 measures here)
        const s = song([{ pattern: 'rock', startMeasure: 0, measureCount: 2 }])
        expect(resolveSongSources(s, patterns, MEASURE, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
        expect(resolveSongSources(s, patterns, 2 * MEASURE, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
    })

    it('skips a clip whose pattern is not in the library', () => {
        const s = song([
            { pattern: 'ghost', startMeasure: 0, measureCount: 2 },
            { pattern: 'rock', startMeasure: 0, measureCount: 2 },
        ])
        expect(resolveSongSources(s, patterns, 0, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
    })

    it('accepts a plain object of patterns', () => {
        const asObject = { rock: patterns.get('rock') }
        const s = song([{ pattern: 'rock', startMeasure: 0, measureCount: 1 }])
        expect(resolveSongSources(s, asObject, 0, TICK)).toHaveLength(1)
    })

    // A 3-beat pattern is 0.75 measure; it must still sound during the measure it starts in.
    it('plays a sub-measure clip for the whole measure it starts in', () => {
        const lib = new Map([['odd', { id: 'odd', beatCount: 3 }]])
        const s = song([{ pattern: 'odd', startMeasure: 2, measureCount: 0.75 }])
        expect(resolveSongSources(s, lib, 2 * MEASURE, TICK)).toHaveLength(1)
        expect(resolveSongSources(s, lib, 2 * MEASURE + 0.9 * MEASURE, TICK)).toEqual([])
        expect(resolveSongSources(s, lib, 3 * MEASURE, TICK)).toEqual([])
    })

    it('defaults a missing beatCount to 4 beats', () => {
        const lib = new Map([['x', { id: 'x' }]])
        const s = song([{ pattern: 'x', startMeasure: 0, measureCount: 1 }])
        expect(resolveSongSources(s, lib, 0, TICK)[0].patternTicks).toBe(4 * TICK)
    })
})

describe('tick and measure conversion', () => {
    it('converts a tick to fractional measures', () => {
        expect(tickToSongMeasures(0, MEASURE)).toBe(0)
        expect(tickToSongMeasures(MEASURE / 2, MEASURE)).toBe(0.5)
        expect(tickToSongMeasures(MEASURE, MEASURE)).toBe(1)
    })

    it('converts a measure back to a tick', () => {
        expect(measureToTick(0, TICK)).toBe(0)
        expect(measureToTick(4, TICK)).toBe(4 * MEASURE)
    })
})

describe('songTempo', () => {
    it('uses the song bpm', () => {
        expect(songTempo(song([], { bpm: 95 }), patterns)).toBe(95)
    })

    it('falls back to the first clip pattern bpm when the song has none', () => {
        const s = { id: 'x', clips: [{ pattern: 'bass', startMeasure: 0, measureCount: 1 }] }
        expect(songTempo(s, patterns)).toBe(90)
    })

    it('is null without a song', () => {
        expect(songTempo(null, patterns)).toBeNull()
    })
})

describe('songPatterns', () => {
    const library = [
        { id: 'rock', name: 'Rock' },
        { id: 'bass', name: 'Bass' },
        { id: 'lead', name: 'Lead' },
        { id: 'unused', name: 'Unused' },
    ]

    it('lists every pattern the arrangement plays, in clip order', () => {
        const s = song([
            { pattern: 'bass', startMeasure: 0, measureCount: 2 },
            { pattern: 'rock', startMeasure: 0, measureCount: 2 },
            { pattern: 'lead', startMeasure: 4, measureCount: 4 },
        ])
        expect(songPatterns(s, library).map((p) => p.id)).toEqual(['bass', 'rock', 'lead'])
    })

    // The engine has to prepare each of them once, not once per clip.
    it('never lists the same pattern twice', () => {
        const s = song([
            { pattern: 'rock', startMeasure: 0, measureCount: 4 },
            { pattern: 'rock', startMeasure: 4, measureCount: 4 },
            { pattern: 'rock', startMeasure: 8, measureCount: 4 },
        ])
        expect(songPatterns(s, library).map((p) => p.id)).toEqual(['rock'])
    })

    it('skips clips pointing at a pattern that is not in the library', () => {
        const s = song([
            { pattern: 'ghost', startMeasure: 0, measureCount: 1 },
            { pattern: 'rock', startMeasure: 0, measureCount: 1 },
        ])
        expect(songPatterns(s, library).map((p) => p.id)).toEqual(['rock'])
    })

    it('is empty without a song, and for a song with no clips', () => {
        expect(songPatterns(null, library)).toEqual([])
        expect(songPatterns(song([]), library)).toEqual([])
    })

    it('does not pick up patterns the arrangement never references', () => {
        expect(
            songPatterns(song([{ pattern: 'lead', startMeasure: 0, measureCount: 1 }]), library).map((p) => p.id),
        ).toEqual(['lead'])
    })
})

describe('songMeasureAtTick', () => {
    const s8 = song([{ pattern: 'rock', startMeasure: 0, measureCount: 8 }], { loopMeasureCount: 8 })

    it('turns a tick into fractional measures', () => {
        expect(songMeasureAtTick(s8, 0)).toBe(0)
        expect(songMeasureAtTick(s8, MEASURE / 2)).toBe(0.5)
        expect(songMeasureAtTick(s8, MEASURE)).toBe(1)
        expect(songMeasureAtTick(s8, 3 * MEASURE + 64)).toBeCloseTo(3.5, 6)
    })

    // The transport keeps counting after the arrangement wraps, so the position
    // the menus name must stay a measure that exists.
    it('wraps on the loop length instead of running past the last measure', () => {
        expect(songMeasureAtTick(s8, 9 * MEASURE)).toBe(1)
        expect(songMeasureAtTick(s8, 100 * MEASURE + 32)).toBeCloseTo(4.25, 6)
    })

    it('falls back to the arrangement length when the song has no loop', () => {
        const noLoop = song([{ pattern: 'rock', startMeasure: 0, measureCount: 8 }])
        expect(songMeasureAtTick(noLoop, 8 * MEASURE)).toBe(0)
        expect(songMeasureAtTick(noLoop, 3 * MEASURE)).toBe(3)
    })

    // wrapping a negative tick would land on the LAST measure, which is not where a
    // stopped transport is
    it('is never negative, and survives a missing song or tick', () => {
        expect(songMeasureAtTick(s8, -MEASURE)).toBe(0)
        expect(songMeasureAtTick(s8, -100 * MEASURE)).toBe(0)
        expect(songMeasureAtTick(null, 3 * MEASURE)).toBe(3)
        expect(songMeasureAtTick(undefined, 0)).toBe(0)
        expect(songMeasureAtTick(song([]), 0)).toBe(0)
    })

    it('follows the ticks-per-beat of the engine', () => {
        expect(songMeasureAtTick(s8, 8, 8)).toBe(0.25) // 8 ticks per beat = half a measure
    })
})
