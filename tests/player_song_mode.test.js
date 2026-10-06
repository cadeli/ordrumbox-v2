/**
 * Song playback mode: when the Song view is visible the transport follows the
 * arrangement, and every clip covering the current measure sounds at once.
 *
 * What the *arrangement* means at a given tick — overlap, per-clip phase, the loop
 * length — is asserted on the pure resolver in tests/song_playback.test.js. What is
 * left here is the Player side: that it enters song mode only from the Song view,
 * forwards the transport tick, layers every source it is handed, and keeps pattern
 * mode intact.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Player from '../src/audio/player.js'
import { PLAYBACK_MODE } from '../src/logic/song_playback.js'
import FlatNote from '../src/model/flat_note.js'
import { TICK } from '../src/core/constants.js'
import { BEATS_PER_MEASURE } from '../src/model/song_schema.js'

const MEASURE = TICK * BEATS_PER_MEASURE // one measure in ticks

/** Pattern whose every beat has a note, so layer count is easy to assert. */
function makePattern(id, beatCount) {
    const trackName = id
    const notes = []
    for (let beat = 0; beat < beatCount; beat++) {
        notes.push({ beat, beatStep: 0, velocity: 1, pitch: 0, pos: 0, every: 1, prob: 1, retriggerCount: 1 })
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
        secondsPerTick: 0.5,
        isOffline: true,
    })
    player.sound.play = (flatNote) => {
        played.push(flatNote)
        return Promise.resolve()
    }
    player.getAutoGenerator = () => Promise.resolve({ changeTrack: () => Promise.resolve() })
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
                { pattern: 'rock', startMeasure: 0, measureCount: 2 },
                { pattern: 'bass', startMeasure: 0, measureCount: 2 },
                { pattern: 'lead', startMeasure: 4, measureCount: 4 },
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

    // The whole point: two clips on measure 0 must both sound on the same tick.
    it('sounds every clip covering the current measure at once', async () => {
        const { player, played } = makePlayer({ patterns, song })
        await player.playNotes(0, 0)
        expect(played.map((n) => n.track.name).sort()).toEqual(['bass', 'rock'])
    })

    it('plays only the clip that is alone on that measure', async () => {
        const { player, played } = makePlayer({ patterns, song })
        await player.playNotes(4 * MEASURE, 0)
        expect(played.map((n) => n.track.name)).toEqual(['lead'])
    })

    it('reports its position in the song for the UI', async () => {
        const { player } = makePlayer({ patterns, song })
        await player.playNotes(4 * MEASURE + 64, 0)
        expect(player.currentSongMeasure).toBeCloseTo(4.5, 5)
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
