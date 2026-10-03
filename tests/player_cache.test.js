/**
 * @vitest-environment jsdom
 *
 * Playback cache invalidation — observed through the public behaviour only:
 *   1. flatNotes must be fetched once per loop and served again from cache
 *      until Player.invalidateCache() / AudioEngine.invalidateCache() runs.
 *   2. NOTE_TRIGGER trackIdx must stay correct when the tracks container
 *      changes: in-place splice/push (same array) and array replacement
 *      (new array, same size) must both rebuild the track -> index mapping,
 *      otherwise the wrong grid row lights up.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AudioEngine from '../src/audio/engine.js'
import Player from '../src/audio/player.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { EVENTS } from '../src/core/events.js'
import { logger } from '../src/core/logger.js'

vi.mock('../src/audio/sound.js', () => ({
    default: class SoundMock {
        play = vi.fn(() => Promise.resolve())
    },
}))

function makeTrack(name) {
    return { name, mute: false, solo: false, pan: 0, pitch: 0, velocity: 1, notes: [] }
}

function makePattern(tracks) {
    return { name: 'CacheTest', bpm: 120, beatCount: 4, tracks }
}

function makePlayer(pattern, getFlatNotes) {
    return new Player({
        audioCtx: { currentTime: 0 },
        mixer: {},
        sounds: {},
        generatedSounds: {},
        patterns: [pattern],
        getSelectedPatternIdx: () => 0,
        computeFlatNotes: vi.fn(),
        getAutoGenerate: vi.fn(() => Promise.resolve({ changeTrack: vi.fn() })),
        getFlatNotes,
        TICK: 32,
        secondsPerTick: 0.25,
        isOffline: false,
    })
}

describe('Player cache invalidation', () => {
    let triggers
    let errorSpy
    let unsubscribe

    beforeEach(() => {
        triggers = []
        unsubscribe = playbackEvents.on(EVENTS.NOTE_TRIGGER, (e) => triggers.push(e))
        errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        unsubscribe?.()
        errorSpy.mockRestore()
    })

    it('recomputes flatNotes once per loop and again after invalidateCache', async () => {
        const track = makeTrack('KICK')
        const pattern = makePattern([track])
        const flatNote = { track, note: { beat: 0, beatStep: 1 }, swingTime: 0 }

        let calls = 0
        const player = makePlayer(pattern, () => {
            calls++
            return new Map([
                [1, [flatNote]],
                [3, [flatNote]],
            ])
        })

        // Two ticks in the same loop → the map must be fetched only once
        await player.playNotes(1, 0)
        await player.playNotes(3, 0)
        expect(calls).toBe(1)
        expect(player.getCurrentFlatNotesMap()).not.toBe(null)

        // Old bug: this wrote a dead property and left the private cache warm
        player.invalidateCache()
        expect(player.getCurrentFlatNotesMap()).toBe(null)

        await player.playNotes(1, 0)
        expect(calls).toBe(2)
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('rebuilds the trackIdx map after an in-place track splice (same array ref)', async () => {
        const t0 = makeTrack('A')
        const t1 = makeTrack('B')
        const t2 = makeTrack('C')
        const pattern = makePattern([t0, t1, t2])
        const flatNote = { track: t2, note: { beat: 0, beatStep: 1 }, swingTime: 0 }
        const flatNotes = new Map([[1, [flatNote]]])

        const player = makePlayer(pattern, () => flatNotes)

        await player.playNotes(1, 0)
        expect(triggers).toHaveLength(1)
        expect(triggers[0].trackIdx).toBe(2)

        // removeTrack/pasteTrack style mutation: splice keeps the SAME array
        pattern.tracks.splice(1, 1) // now [A, C] — t2 moved to index 1
        triggers.length = 0

        // No invalidateCache here: the length check alone must catch this
        await player.playNotes(1, 0)
        expect(triggers).toHaveLength(1)
        expect(triggers[0].trackIdx).toBe(1)
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('appends a track at the end and keeps indices coherent', async () => {
        const t0 = makeTrack('A')
        const pattern = makePattern([t0])
        const tNew = makeTrack('D')
        const flatNote = { track: tNew, note: { beat: 1, beatStep: 0 }, swingTime: 0 }
        const flatNotes = new Map([[33, [flatNote]]])

        const player = makePlayer(pattern, () => flatNotes)

        await player.playNotes(33, 0)
        expect(triggers[0].trackIdx).toBe(-1) // track not in map yet (added after build)

        pattern.tracks.push(tNew)
        triggers.length = 0

        await player.playNotes(33, 0)
        expect(triggers[0].trackIdx).toBe(1)
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it('rebuilds the trackIdx map when the tracks array is replaced (new ref, same size)', async () => {
        const t0 = makeTrack('A')
        const t1 = makeTrack('B')
        const pattern = makePattern([t0, t1])
        const flatNote = { track: t0, note: { beat: 0, beatStep: 1 }, swingTime: 0 }
        const flatNotes = new Map([[1, [flatNote]]])

        const player = makePlayer(pattern, () => flatNotes)

        await player.playNotes(1, 0)
        expect(triggers).toHaveLength(1)
        expect(triggers[0].trackIdx).toBe(0)

        // Array replacement keeps the size but changes both the ref and the order
        pattern.tracks = [t1, t0]
        triggers.length = 0

        await player.playNotes(1, 0)
        expect(triggers).toHaveLength(1)
        expect(triggers[0].trackIdx).toBe(1)
        expect(errorSpy).not.toHaveBeenCalled()
    })
})

describe('AudioEngine cache wiring', () => {
    let warnSpy
    let errorSpy
    let consoleWarnSpy

    beforeEach(() => {
        // The fake AudioContext cannot build a worklet mixer, so Mixer.start
        // fails on its first missing ctx call. The failure is reported through
        // reportUserError, which writes straight to console and bypasses the
        // logger entirely — silencing only the logger still leaked the report.
        // The mixer is irrelevant to the cache wiring under test.
        warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
        errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        warnSpy.mockRestore()
        errorSpy.mockRestore()
        consoleWarnSpy.mockRestore()
    })

    function makeEngine(patterns = []) {
        return new AudioEngine({
            audioCtx: { currentTime: 0, createBuffer: () => ({}) },
            sounds: {},
            patterns,
            getAutoGenerate: vi.fn(() => Promise.resolve({ changeTrack: vi.fn() })),
            TICK: 32,
            secondsPerTick: 0.25,
            isOffline: true,
        })
    }

    it('drops the cached flatNotes map for the current pattern', () => {
        const pattern = makePattern([makeTrack('A')])
        const engine = makeEngine([pattern])

        const first = engine.getFlatNotesForCurrentPattern(0)
        expect(engine.getFlatNotesForCurrentPattern(0)).toBe(first)

        engine.invalidateCache()
        expect(engine.getFlatNotesForCurrentPattern(0)).not.toBe(first)
    })

    it('delegates to the wired player and tolerates a missing one', () => {
        const engine = makeEngine()
        expect(engine.player).toBeNull()
        expect(() => engine.invalidateCache()).not.toThrow()

        const invalidateCache = vi.fn()
        engine.player = { invalidateCache }
        engine.invalidateCache()
        expect(invalidateCache).toHaveBeenCalledTimes(1)
    })
})
