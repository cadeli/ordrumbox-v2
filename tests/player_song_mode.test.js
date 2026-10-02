/**
 * Song playback mode: when the Song view is visible the transport follows the
 * arrangement, and every clip covering the current bar sounds at once.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Player from '../src/audio/player.js'
import { PLAYBACK_MODE } from '../src/logic/song_playback.js'
import FlatNote from '../src/model/flatnote.js'

const TICK = 32
const BAR = TICK * 4 // one bar in ticks

/** Pattern whose every beat has a note, so layer count is easy to assert. */
function makePattern(id, beatCount) {
    const trackName = id
    const notes = []
    for (let beat = 0; beat < beatCount; beat++) {
        notes.push({ beat, beatStep: 0, velocity: 1, pitch: 0, pos: 0, every: 1, prob: 1, retriggerNum: 1 })
    }
    return {
        id,
        name: id,
        beatCount,
        tracks: [{ name: trackName, velocity: 1, notes, loopAtStep: beatCount * 4, stepsPerBeat: 4 }],
    }
}

/**
 * A player wired to a real flat-notes computation, so layering is exercised
 * end to end without an AudioContext.
 */
function makePlayer({ patterns, song, view = 'song' }) {
    const played = []
    const emitted = []
    const buildFlatNotes = (pattern) => {
        const map = new Map()
        for (const note of pattern.tracks[0].notes) {
            const step = note.beat * TICK
            const list = map.get(step) ?? []
            list.push(new FlatNote(step, pattern.tracks[0], note))
            map.set(step, list)
        }
        return map
    }
    const player = new Player({
        audioCtx: { currentTime: 0, sampleRate: 44100 },
        mixer: { channels: new Map(), masterGain: {}, isOffline: true },
        sounds: {},
        generatedSounds: {},
        patterns,
        getSelectedPatternIdx: () => 0,
        getPlaybackMode: () => (view === 'song' ? PLAYBACK_MODE.SONG : PLAYBACK_MODE.PATTERN),
        getSong: () => song,
        getFlatNotesForPattern: (pattern, _loop) => buildFlatNotes(pattern),
        getFlatNotes: () => new Map(),
        // handleLoopStart calls this at every cycle boundary, song mode included
        computeFlatNotes: (pattern, _loop) => buildFlatNotes(pattern),
        TICK,
        secondsPerBeat: 0.5,
        isOffline: true,
    })
    player.sound.play = (flatNote) => {
        played.push(flatNote)
        return Promise.resolve()
    }
    player.getAutoGenerate = () => Promise.resolve({ changeTrack: () => Promise.resolve() })
    return { player, played, emitted, events: emitted }
}

describe('Player — song playback mode', () => {
    let patterns
    let song

    beforeEach(() => {
        patterns = [makePattern('rock', 4), makePattern('bass', 8), makePattern('lead', 4)]
        song = {
            id: 'demo',
            name: 'Demo',
            bpm: 120,
            clips: [
                { pattern: 'rock', startBar: 0, bars: 2 },
                { pattern: 'bass', startBar: 0, bars: 2 },
                { pattern: 'lead', startBar: 4, bars: 4 },
            ],
        }
    })

    it('is in pattern mode in every view but the song one', () => {
        for (const view of ['edit', 'proll', 'synth']) {
            const { player } = makePlayer({ patterns, song, view })
            expect(player.isSongMode).toBe(false)
        }
        const { player } = makePlayer({ patterns, song, view: 'song' })
        expect(player.isSongMode).toBe(true)
    })

    it('stays in pattern mode when the library has no song', () => {
        const { player } = makePlayer({ patterns, song: null, view: 'song' })
        expect(player.isSongMode).toBe(false)
    })

    // The whole point: two clips on bar 0 must both sound on the same tick.
    it('sounds every clip covering the current bar at once', async () => {
        const { player, played } = makePlayer({ patterns, song })
        await player.playNotes(0, 0)
        expect(played.map((n) => n.track.name).sort()).toEqual(['bass', 'rock'])
    })

    it('plays only the clip that is alone on that bar', async () => {
        const { player, played } = makePlayer({ patterns, song })
        await player.playNotes(4 * BAR, 0)
        expect(played.map((n) => n.track.name)).toEqual(['lead'])
    })

    it('is silent in a gap of the arrangement', async () => {
        song.clips = [{ pattern: 'rock', startBar: 0, bars: 1 }]
        song.loopBars = 8
        const { player, played } = makePlayer({ patterns, song })
        await player.playNotes(3 * BAR, 0)
        expect(played).toHaveLength(0)
    })

    // bass is 2 bars long and starts on bar 1, so on bar 3 it has completed one
    // cycle and is back on beat 0. A naive `tick % patternTicks` would put it on
    // beat 4 instead: the phase must be measured from the clip's own start.
    it('keeps each pattern in phase with its own clip', async () => {
        song.clips = [{ pattern: 'bass', startBar: 1, bars: 4 }]
        const { player, played } = makePlayer({ patterns, song })
        await player.playNotes(3 * BAR, 0)
        expect(played).toHaveLength(1)
        expect(played[0].note.beat).toBe(0)
    })

    it('loops the arrangement at loopBars', async () => {
        song.clips = [{ pattern: 'rock', startBar: 0, bars: 2 }]
        song.loopBars = 4
        const { player, played } = makePlayer({ patterns, song })
        await player.playNotes(4 * BAR, 0)
        expect(played.map((n) => n.track.name)).toEqual(['rock']) // bar 0 again
    })

    it('reports its position in the song for the UI', async () => {
        const { player } = makePlayer({ patterns, song })
        await player.playNotes(4 * BAR + 64, 0)
        expect(player.currentSongBar).toBeCloseTo(4.5, 5)
    })

    it('reports the arrangement tempo, not a pattern one', () => {
        const { player } = makePlayer({ patterns, song })
        expect(player.getSongTempo()).toBe(120)
        song.bpm = 95
        expect(player.getSongTempo()).toBe(95)
    })

    it('has no song tempo in pattern mode', () => {
        const { player } = makePlayer({ patterns, song, view: 'edit' })
        expect(player.getSongTempo()).toBeNull()
    })

    // Song mode must not stop pattern mode from working.
    it('keeps looping the selected pattern outside song mode', async () => {
        const { player, played } = makePlayer({ patterns, song, view: 'edit' })
        player.computeFlatNotes = (pattern, _loop) => {
            const map = new Map()
            for (const note of pattern.tracks[0].notes) {
                map.set(note.beat * TICK, [new FlatNote(note.beat * TICK, pattern.tracks[0], note)])
            }
            return map
        }
        player.getFlatNotes = () => player.computeFlatNotes(patterns[0], 0)
        await player.playNotes(0, 0)
        expect(played.map((n) => n.track.name)).toEqual(['rock'])
    })

    it('rebuilds the pattern index when the library changes', () => {
        const { player } = makePlayer({ patterns, song })
        expect(player.patternsById.has('lead')).toBe(true)
        patterns.push(makePattern('extra', 4))
        player.invalidateCache()
        expect(player.patternsById.has('extra')).toBe(true)
    })
})
