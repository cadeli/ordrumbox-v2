/**
 * @vitest-environment jsdom
 *
 * Player cache invalidation (Lot A):
 *   1. Player.invalidateCache() must actually drop the flatNotes cache — the
 *      old AudioEngine.invalidateCache() wrote `player._lastFlatNotesLoop`,
 *      a dead property (the real field is private #lastFlatNotesLoop), so the
 *      next tick kept serving a stale map.
 *   2. NOTE_TRIGGER trackIdx must stay correct after in-place track splices:
 *      removeTrack/pasteTrack mutate the SAME array, so the old ref-only check
 *      kept a stale track → row mapping and lit up the wrong grid row.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Player from '../src/audio/player.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { EVENTS } from '../src/core/events.js'
import { logger } from '../src/core/logger.js'

vi.mock('../src/audio/sound.js', () => ({
    default: class SoundMock {
        play = vi.fn(() => Promise.resolve())
    },
}))

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function makeTrack(name) {
    return { name, mute: false, solo: false, pan: 0, pitch: 0, velocity: 1, notes: [] }
}

function makePattern(tracks) {
    return { name: 'CacheTest', bpm: 120, nbBeats: 4, tracks }
}

function makePlayer(pattern, getFlatNotes) {
    return new Player({
        audioCtx: { currentTime: 0 },
        mixer: {},
        sounds: {},
        generatedSounds: {},
        patterns: [pattern],
        getSelectedPatternNum: () => 0,
        computeFlatNotes: vi.fn(),
        getAutoGenerate: vi.fn(() => Promise.resolve({ changeTrack: vi.fn() })),
        getFlatNotes,
        TICK: 32,
        secondsPerBeat: 0.25,
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
})

describe('AudioEngine.invalidateCache wiring', () => {
    const engineSrc = readFileSync(join(ROOT, 'src/audio/engine.js'), 'utf8')
    const playerSrc = readFileSync(join(ROOT, 'src/audio/player.js'), 'utf8')

    it('delegates to Player.invalidateCache instead of a dead property', () => {
        expect(engineSrc).toContain('this.player.invalidateCache()')
        expect(engineSrc).not.toMatch(/_lastFlatNotesLoop/)
        expect(playerSrc).toMatch(/invalidateCache\(\)\s*\{/)
    })

    it('rebuilds the trackIdx map on size change, not only on ref change', () => {
        // The rebuild condition must include the size comparison
        expect(playerSrc).toMatch(/#trackIdxMapRef !== tracks \|\| this\.#trackIdxMapCount !== trackCount/)
    })
})
