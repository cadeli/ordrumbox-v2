import { describe, it, expect } from 'vitest'
import {
    PLAYBACK_MODE,
    resolveSongSources,
    songBarAtTick,
    songPatterns,
    tickToSongBars,
    barToTick,
    songTempo,
} from '../src/logic/song_playback.js'

const TICK = 32
const BAR = TICK * 4 // 128 ticks per bar

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
        expect(resolveSongSources(song([{ pattern: 'rock', startBar: 0, bars: 1 }]), patterns, NaN, TICK)).toEqual([])
    })

    it('sounds the clip covering the current bar', () => {
        const s = song([
            { pattern: 'rock', startBar: 0, bars: 2 },
            { pattern: 'lead', startBar: 4, bars: 2 },
        ])
        expect(resolveSongSources(s, patterns, 0, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
        expect(resolveSongSources(s, patterns, 4 * BAR, TICK).map((x) => x.pattern.id)).toEqual(['lead'])
    })

    it('is silent in a gap', () => {
        // explicit loopBars, otherwise a 1-bar song wraps and bar 3 is bar 0
        const s = song([{ pattern: 'rock', startBar: 0, bars: 1 }], { loopBars: 8 })
        expect(resolveSongSources(s, patterns, 3 * BAR, TICK)).toEqual([])
    })

    // The whole point of the feature: overlapping clips sound together.
    it('returns every clip covering the bar, layered', () => {
        const s = song([
            { pattern: 'rock', startBar: 0, bars: 2 },
            { pattern: 'bass', startBar: 0, bars: 2 },
            { pattern: 'lead', startBar: 1, bars: 1 },
        ])
        expect(resolveSongSources(s, patterns, 0, TICK).map((x) => x.pattern.id)).toEqual(['rock', 'bass'])
        expect(resolveSongSources(s, patterns, BAR, TICK).map((x) => x.pattern.id)).toEqual(['rock', 'bass', 'lead'])
    })

    it('keeps each clip in phase with itself, not with the transport', () => {
        // bass is 8 beats (2 bars) and starts at bar 2; at bar 5 it must be at
        // its own local step 3 bars in, not at 1 bar in as tick % would say.
        const s = song([{ pattern: 'bass', startBar: 2, bars: 4 }], { loopBars: 8 })
        const atBar5 = resolveSongSources(s, patterns, 5 * BAR, TICK)[0]
        // 3 bars elapsed from its own start, on a 2-bar pattern: second pass,
        // one bar in. `tick % patternTicks` would have said bar 1 of the song.
        expect(atBar5.patternTicks).toBe(8 * TICK)
        expect(atBar5.loop).toBe(1)
        expect(atBar5.localStep).toBe(1 * BAR)
        expect(atBar5.localStep).toBeLessThan(atBar5.patternTicks)
    })

    it('reports the loop counter so variation and every vary per cycle', () => {
        const s = song([{ pattern: 'rock', startBar: 0, bars: 8 }]) // rock = 1 bar
        expect(resolveSongSources(s, patterns, 0, TICK)[0].loop).toBe(0)
        expect(resolveSongSources(s, patterns, 1 * BAR, TICK)[0].loop).toBe(1)
        expect(resolveSongSources(s, patterns, 4 * BAR, TICK)[0].loop).toBe(4)
    })

    it('wraps at loopBars and keeps counting', () => {
        const s = song([{ pattern: 'rock', startBar: 0, bars: 2 }], { loopBars: 4 })
        expect(resolveSongSources(s, patterns, 0, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
        // bars 2 and 3 are the gap before the wrap
        expect(resolveSongSources(s, patterns, 2 * BAR, TICK)).toEqual([])
        expect(resolveSongSources(s, patterns, 3 * BAR, TICK)).toEqual([])
        expect(resolveSongSources(s, patterns, 4 * BAR, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
        // and the loop counter keeps growing rather than resetting
        expect(resolveSongSources(s, patterns, 8 * BAR, TICK)[0].loop).toBe(8)
    })

    it('falls back to the clip extent when loopBars is absent', () => {
        // no loopBars: the song loops over its own length (2 bars here)
        const s = song([{ pattern: 'rock', startBar: 0, bars: 2 }])
        expect(resolveSongSources(s, patterns, BAR, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
        expect(resolveSongSources(s, patterns, 2 * BAR, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
    })

    it('skips a clip whose pattern is not in the library', () => {
        const s = song([
            { pattern: 'ghost', startBar: 0, bars: 2 },
            { pattern: 'rock', startBar: 0, bars: 2 },
        ])
        expect(resolveSongSources(s, patterns, 0, TICK).map((x) => x.pattern.id)).toEqual(['rock'])
    })

    it('accepts a plain object of patterns', () => {
        const asObject = { rock: patterns.get('rock') }
        const s = song([{ pattern: 'rock', startBar: 0, bars: 1 }])
        expect(resolveSongSources(s, asObject, 0, TICK)).toHaveLength(1)
    })

    // A 3-beat pattern is 0.75 bar; it must still sound during the bar it starts in.
    it('plays a sub-bar clip for the whole bar it starts in', () => {
        const lib = new Map([['odd', { id: 'odd', beatCount: 3 }]])
        const s = song([{ pattern: 'odd', startBar: 2, bars: 0.75 }])
        expect(resolveSongSources(s, lib, 2 * BAR, TICK)).toHaveLength(1)
        expect(resolveSongSources(s, lib, 2 * BAR + 0.9 * BAR, TICK)).toEqual([])
        expect(resolveSongSources(s, lib, 3 * BAR, TICK)).toEqual([])
    })

    it('defaults a missing beatCount to 4 beats', () => {
        const lib = new Map([['x', { id: 'x' }]])
        const s = song([{ pattern: 'x', startBar: 0, bars: 1 }])
        expect(resolveSongSources(s, lib, 0, TICK)[0].patternTicks).toBe(4 * TICK)
    })
})

describe('tick and bar conversion', () => {
    it('converts a tick to fractional bars', () => {
        expect(tickToSongBars(0, BAR)).toBe(0)
        expect(tickToSongBars(BAR / 2, BAR)).toBe(0.5)
        expect(tickToSongBars(BAR, BAR)).toBe(1)
    })

    it('converts a bar back to a tick', () => {
        expect(barToTick(0, TICK)).toBe(0)
        expect(barToTick(4, TICK)).toBe(4 * BAR)
    })
})

describe('songTempo', () => {
    it('uses the song bpm', () => {
        expect(songTempo(song([], { bpm: 95 }), patterns)).toBe(95)
    })

    it('falls back to the first clip pattern bpm when the song has none', () => {
        const s = { id: 'x', clips: [{ pattern: 'bass', startBar: 0, bars: 1 }] }
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
            { pattern: 'bass', startBar: 0, bars: 2 },
            { pattern: 'rock', startBar: 0, bars: 2 },
            { pattern: 'lead', startBar: 4, bars: 4 },
        ])
        expect(songPatterns(s, library).map((p) => p.id)).toEqual(['bass', 'rock', 'lead'])
    })

    // The engine has to prepare each of them once, not once per clip.
    it('never lists the same pattern twice', () => {
        const s = song([
            { pattern: 'rock', startBar: 0, bars: 4 },
            { pattern: 'rock', startBar: 4, bars: 4 },
            { pattern: 'rock', startBar: 8, bars: 4 },
        ])
        expect(songPatterns(s, library).map((p) => p.id)).toEqual(['rock'])
    })

    it('skips clips pointing at a pattern that is not in the library', () => {
        const s = song([
            { pattern: 'ghost', startBar: 0, bars: 1 },
            { pattern: 'rock', startBar: 0, bars: 1 },
        ])
        expect(songPatterns(s, library).map((p) => p.id)).toEqual(['rock'])
    })

    it('is empty without a song, and for a song with no clips', () => {
        expect(songPatterns(null, library)).toEqual([])
        expect(songPatterns(song([]), library)).toEqual([])
    })

    it('does not pick up patterns the arrangement never references', () => {
        expect(songPatterns(song([{ pattern: 'lead', startBar: 0, bars: 1 }]), library).map((p) => p.id)).toEqual([
            'lead',
        ])
    })
})

describe('songBarAtTick', () => {
    const s8 = song([{ pattern: 'rock', startBar: 0, bars: 8 }], { loopBars: 8 })

    it('turns a tick into fractional bars', () => {
        expect(songBarAtTick(s8, 0)).toBe(0)
        expect(songBarAtTick(s8, BAR / 2)).toBe(0.5)
        expect(songBarAtTick(s8, BAR)).toBe(1)
        expect(songBarAtTick(s8, 3 * BAR + 64)).toBeCloseTo(3.5, 6)
    })

    // The transport keeps counting after the arrangement wraps, so the position
    // the menus name must stay a bar that exists.
    it('wraps on the loop length instead of running past the last bar', () => {
        expect(songBarAtTick(s8, 9 * BAR)).toBe(1)
        expect(songBarAtTick(s8, 100 * BAR + 32)).toBeCloseTo(4.25, 6)
    })

    it('falls back to the arrangement length when the song has no loop', () => {
        const noLoop = song([{ pattern: 'rock', startBar: 0, bars: 8 }])
        expect(songBarAtTick(noLoop, 8 * BAR)).toBe(0)
        expect(songBarAtTick(noLoop, 3 * BAR)).toBe(3)
    })

    // wrapping a negative tick would land on the LAST bar, which is not where a
    // stopped transport is
    it('is never negative, and survives a missing song or tick', () => {
        expect(songBarAtTick(s8, -BAR)).toBe(0)
        expect(songBarAtTick(s8, -100 * BAR)).toBe(0)
        expect(songBarAtTick(null, 3 * BAR)).toBe(3)
        expect(songBarAtTick(undefined, 0)).toBe(0)
        expect(songBarAtTick(song([]), 0)).toBe(0)
    })

    it('follows the ticks-per-beat of the engine', () => {
        expect(songBarAtTick(s8, 8, 8)).toBe(0.25) // 8 ticks per beat = half a bar
    })
})
