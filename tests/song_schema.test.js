import { describe, it, expect } from 'vitest'
import {
    BEATS_PER_BAR,
    SONG_MIN_BPM,
    SONG_MAX_BPM,
    SONG_DEFAULTS,
    slugify,
    uniqueId,
    ensurePatternId,
    barsForPattern,
    songLengthBars,
    songBpm,
    normalizeSong,
    normalizeSongs,
    pruneSongClips,
} from '../src/model/song_schema.js'

describe('slugify', () => {
    it('lowercases and dashes', () => {
        expect(slugify('Rock Pattern')).toBe('rock-pattern')
    })

    it('strips accents', () => {
        expect(slugify('Guirlande Électronique')).toBe('guirlande-electronique')
    })

    it('returns empty for names with nothing sluggable', () => {
        expect(slugify('***')).toBe('')
        expect(slugify(undefined)).toBe('')
    })

    it('bounds the length', () => {
        expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(48)
    })
})

describe('uniqueId', () => {
    it('returns the candidate when free', () => {
        const taken = new Set()
        expect(uniqueId('rock', taken)).toBe('rock')
        expect(uniqueId('bass', taken)).toBe('bass')
    })

    it('appends the first free numeric suffix', () => {
        const taken = new Set(['rock', 'rock-2'])
        expect(uniqueId('rock', taken)).toBe('rock-3')
    })

    it('falls back to a literal when the slug is empty', () => {
        expect(uniqueId('', new Set())).toBe('pattern')
    })
})

describe('ensurePatternId', () => {
    it('fills a missing id from the name', () => {
        const taken = new Set()
        const p = { name: 'Rock Pattern' }
        expect(ensurePatternId(p, taken)).toBe('rock-pattern')
        expect(p.id).toBe('rock-pattern')
    })

    // The whole arrangement feature rests on this: an id assigned once must
    // survive a rename, or every clip of that pattern silently detaches.
    it('never regenerates an existing id when the pattern is renamed', () => {
        const p = { id: 'rock', name: 'Rock Pattern' }
        ensurePatternId(p, new Set())
        p.name = 'Something Else Entirely'
        expect(ensurePatternId(p, new Set())).toBe('rock')
        expect(p.id).toBe('rock')
    })

    it('de-duplicates ids already present', () => {
        const taken = new Set()
        expect(ensurePatternId({ id: 'x' }, taken)).toBe('x')
        expect(ensurePatternId({ name: 'Y' }, taken)).toBe('y')
        expect(ensurePatternId({ name: 'X' }, taken)).toBe('x-2')
    })

    it('trims and rejects a blank id', () => {
        expect(ensurePatternId({ id: '  spaced  ' }, new Set())).toBe('spaced')
        const p = { id: '   ', name: 'Fallback' }
        expect(ensurePatternId(p, new Set())).toBe('fallback')
    })
})

describe('barsForPattern', () => {
    it('converts beats to bars', () => {
        expect(BEATS_PER_BAR).toBe(4)
        expect(barsForPattern({ beatCount: 4 })).toBe(1)
        expect(barsForPattern({ beatCount: 8 })).toBe(2)
        expect(barsForPattern({ beatCount: 16 })).toBe(4)
    })

    // beatCount is authored in beats and may be any value in 1..MAX_BEATS
    it('keeps sub-bar patterns', () => {
        expect(barsForPattern({ beatCount: 3 })).toBe(0.75)
        expect(barsForPattern({ beatCount: 1 })).toBe(0.25)
    })

    it('never returns less than one bar', () => {
        expect(barsForPattern({ beatCount: 0 })).toBe(1)
        expect(barsForPattern({})).toBe(1)
        expect(barsForPattern(null)).toBe(1)
        expect(barsForPattern({ beatCount: NaN })).toBe(1)
    })
})

describe('songLengthBars', () => {
    const song = (clips, loopBars) => ({ clips, ...(loopBars ? { loopBars } : {}) })

    it('is the furthest clip end', () => {
        expect(
            songLengthBars(
                song([
                    { startBar: 0, bars: 2 },
                    { startBar: 16, bars: 8 },
                ]),
            ),
        ).toBe(24)
    })

    it('honours an explicit loop length', () => {
        expect(songLengthBars(song([{ startBar: 0, bars: 2 }], 64))).toBe(64)
    })

    it('is 0 with no clip', () => {
        expect(songLengthBars(song([]))).toBe(0)
        expect(songLengthBars(null)).toBe(0)
    })
})

describe('songBpm', () => {
    it('returns a valid declared bpm', () => {
        expect(songBpm({ bpm: 95 })).toBe(95)
    })

    it('falls back when the declared bpm is out of range or missing', () => {
        expect(songBpm({ bpm: 5 })).toBe(SONG_DEFAULTS.bpm)
        expect(songBpm({ bpm: 5000 })).toBe(SONG_DEFAULTS.bpm)
        expect(songBpm({}, 90)).toBe(90)
        expect(songBpm(null, 90)).toBe(90)
    })

    it('exposes the accepted range', () => {
        expect(SONG_MIN_BPM).toBeLessThan(SONG_DEFAULT_FALLBACK())
        expect(SONG_MAX_BPM).toBeGreaterThan(SONG_DEFAULT_FALLBACK())
    })
})

function SONG_DEFAULT_FALLBACK() {
    return SONG_DEFAULTS.bpm
}

describe('normalizeSong', () => {
    const ids = new Set(['rock', 'bassA'])

    it('accepts a minimal song', () => {
        const r = normalizeSong({ id: 'demo', name: 'Demo', bpm: 100, clips: [] }, ids)
        expect(r.ok).toBe(true)
        expect(r.song.id).toBe('demo')
        expect(r.song.bpm).toBe(100)
        expect(r.dropped).toEqual([])
    })

    it('defaults bpm and id', () => {
        const r = normalizeSong({ name: 'My Song' }, ids)
        expect(r.song.id).toBe('my-song')
        expect(r.song.bpm).toBe(SONG_DEFAULTS.bpm)
    })

    it('keeps overlapping clips on different patterns', () => {
        const r = normalizeSong(
            {
                id: 'demo',
                clips: [
                    { pattern: 'rock', startBar: 0, bars: 2 },
                    { pattern: 'bassA', startBar: 0, bars: 2 },
                ],
            },
            ids,
        )
        expect(r.song.clips).toHaveLength(2)
        expect(r.song.clips.map((c) => c.startBar)).toEqual([0, 0])
    })

    it('keeps two clips of the same pattern at different bars', () => {
        const r = normalizeSong(
            {
                clips: [
                    { pattern: 'rock', startBar: 0, bars: 1 },
                    { pattern: 'rock', startBar: 4, bars: 1 },
                ],
            },
            ids,
        )
        expect(r.song.clips).toHaveLength(2)
    })

    // A stale id must not cost the user the whole arrangement.
    it('drops an unknown pattern id but keeps the rest', () => {
        const r = normalizeSong(
            {
                clips: [
                    { pattern: 'gone', startBar: 0, bars: 1 },
                    { pattern: 'rock', startBar: 4, bars: 2 },
                ],
            },
            ids,
        )
        expect(r.ok).toBe(true)
        expect(r.song.clips).toEqual([{ pattern: 'rock', startBar: 4, bars: 2 }])
        expect(r.dropped).toEqual([{ pattern: 'gone', reason: 'unknown pattern id' }])
    })

    it('reports malformed clips', () => {
        const r = normalizeSong({ clips: [null, 5, { startBar: 0 }] }, ids)
        expect(r.song.clips).toEqual([])
        expect(r.dropped).toHaveLength(3)
        expect(r.dropped[0].reason).toBe('clip is not an object')
        expect(r.dropped[1].reason).toBe('clip is not an object')
        expect(r.dropped[2].reason).toBe('clip has no pattern')
    })

    it('rejects a non-array clips', () => {
        expect(normalizeSong({ clips: {} }, ids)).toEqual({
            ok: false,
            error: '"clips" must be an array',
        })
    })

    it('clamps a negative or fractional start bar to whole bars', () => {
        const r = normalizeSong(
            {
                clips: [
                    { pattern: 'rock', startBar: -4 },
                    { pattern: 'bassA', startBar: 2.7 },
                ],
            },
            ids,
        )
        expect(r.song.clips.map((c) => c.startBar)).toEqual([0, 2])
    })

    it('keeps a fractional duration', () => {
        const r = normalizeSong({ clips: [{ pattern: 'rock', bars: 0.75 }] }, ids)
        expect(r.song.clips[0].bars).toBe(0.75)
    })

    it('defaults a missing duration to one bar', () => {
        const r = normalizeSong({ clips: [{ pattern: 'rock', startBar: 3 }] }, ids)
        expect(r.song.clips[0].bars).toBe(1)
    })

    it('accepts a Map of patterns as the library', () => {
        const lib = new Map([['rock', { beatCount: 8 }]])
        expect(normalizeSong({ clips: [{ pattern: 'rock' }] }, lib).ok).toBe(true)
        expect(normalizeSong({ clips: [{ pattern: 'nope' }] }, lib).song.clips).toEqual([])
    })

    it('rejects a non-object song', () => {
        expect(normalizeSong(null, ids).ok).toBe(false)
        expect(normalizeSong([], ids).ok).toBe(false)
        expect(normalizeSong('x', ids).ok).toBe(false)
    })
})

describe('normalizeSongs', () => {
    const ids = new Set(['rock'])

    it('normalizes each entry', () => {
        const { songs } = normalizeSongs(
            [
                { id: 'a', clips: [] },
                { id: 'b', clips: [] },
            ],
            ids,
        )
        expect(songs.map((s) => s.id)).toEqual(['a', 'b'])
    })

    // An entry whose only clip was dropped is still a valid, empty arrangement.
    it('keeps it, and accumulates the drops', () => {
        const { songs, dropped } = normalizeSongs([null, { id: 'ok' }, { clips: [{ pattern: 'zz' }] }], ids)
        expect(songs.map((s) => s.id)).toEqual(['ok', 'song'])
        expect(dropped).toEqual([{ pattern: 'zz', reason: 'unknown pattern id' }])
    })

    it('de-duplicates song ids', () => {
        const { songs } = normalizeSongs([{ id: 'dup' }, { id: 'dup' }], ids)
        expect(songs[0].id).toBe('dup')
        expect(songs[1].id).not.toBe('dup')
    })

    it('returns nothing for a non-array', () => {
        expect(normalizeSongs(null, ids)).toEqual({ songs: [], dropped: [] })
    })
})

describe('pruneSongClips', () => {
    it('drops clips whose pattern disappeared', () => {
        const song = { id: 's', clips: [{ pattern: 'rock', startBar: 0, bars: 2 }] }
        expect(pruneSongClips(song, new Set(['bass']))).toBeNull()
        expect(pruneSongClips(song, new Set(['rock'])).clips).toHaveLength(1)
    })

    it('is null for a missing song', () => {
        expect(pruneSongClips(null, new Set())).toBeNull()
    })
})
