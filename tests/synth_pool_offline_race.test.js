/**
 * Regression test for the synth-voice pool / offline-export timing race.
 *
 * SynthVoiceNodePool.release() is scheduled from WorkletSynthVoice via a
 * plain JS setTimeout keyed to wall-clock time (see worklet_synth_voice.js
 * start()/cleanup()). That's safe for real-time playback, where wall-clock
 * time tracks AudioContext time closely enough that a note's cleanup fires
 * roughly when its audio has actually finished.
 *
 * It is NOT safe for offline export: wav_exporter.js / AudioEngine.export-
 * Offline schedule every note in the whole pattern synchronously, in a
 * tight loop, *before* ever calling offlineCtx.startRendering(). During
 * that loop, AudioContext.currentTime sits at (or near) 0 for the entire
 * song while individual notes' times span the whole pattern. A setTimeout
 * scheduled from an early note can fire (in wall-clock terms) long before
 * the render has actually reached that point in audio time. When it does,
 * the node is returned to the pool and handed to a completely unrelated,
 * much-later note — both notes then fight over the same processor's live
 * parameters and pending trigger/release messages.
 *
 * `Sound`'s `isOffline` flag (sound.js) is the fix: it skips the pool
 * entirely for offline rendering, so every synth note always gets its own
 * fresh AudioWorkletNode, independent of setTimeout timing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import WorkletLoader from '../src/audio/worklets/loader.js'
import WorkletSynthVoice from '../src/audio/voices/worklet_synth_voice.js'
import SynthVoiceNodePool from '../src/audio/voices/synth_voice_pool.js'
import Sound from '../src/audio/sound.js'
import { makeParam, makeNode } from './helpers/worklet_mocks.js'

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        transport: { bpm: 120 },
        resourcesLoader: { loadGeneratedSounds: vi.fn().mockResolvedValue() },
    },
}))

// Every mock node gets a unique id so assertions can check *identity*
// (same physical node handed to two notes), not just call counts.
let nodeCounter
function makeUniqueSynthNode() {
    nodeCounter += 1
    return {
        _id: nodeCounter,
        port: { postMessage: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
    }
}

function createMockAudioCtx() {
    return {
        // Mirrors real OfflineAudioContext behaviour: currentTime stays at
        // 0 for the whole synchronous scheduling phase (it only advances
        // once startRendering() actually processes samples).
        currentTime: 0,
        sampleRate: 44100,
        destination: { connect: vi.fn() },
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(0) })),
    }
}

function createMockStrip() {
    return { voicesInput: makeNode() }
}

function makeGeneratedSound(overrides = {}) {
    return {
        masterVolume: 0.8,
        vco1: { wave: 'sine', octave: 0, detune: 0, gain: 1 },
        vco2: null,
        vco3: null,
        enveloppe: { attack: 0.01, decay: 0.05, sustain: 0.7, release: 0.05 },
        filter: { type: 'lowpass', freq: 1000, Q: 1, filterEnvelopeAmount: 0 },
        noise: { mix: 0 },
        lfo: { wave: 'sine', freq: 0, depth: 0, target: 'NOT' },
        ...overrides,
    }
}

function makeFlatNote(overrides = {}) {
    return { fpitch: 1, pan: 0, note: { velocity: 0.8 }, ...overrides }
}

describe('synth-voice pool vs. offline export scheduling race', () => {
    beforeEach(() => {
        nodeCounter = 0
        vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
        vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
        vi.spyOn(WorkletLoader, 'createNode').mockImplementation(() => makeUniqueSynthNode())
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('BUG (pool, wall-clock release): an early note and a much-later note can end up sharing the same node', async () => {
        const ctx = createMockAudioCtx()
        const strip = createMockStrip()
        const pool = new SynthVoiceNodePool(ctx)

        // Note A: scheduled at the very start of the song.
        const voiceA = new WorkletSynthVoice(ctx, strip, makeGeneratedSound(), 'A', null, pool)
        await voiceA.setup(makeFlatNote(), 0)
        voiceA.start(0)
        const nodeA = voiceA.workletNode

        // The whole song is scheduled in one synchronous loop, so barely
        // any real time passes here in the exporter. We simulate the
        // render itself taking ~1s of real wall-clock time — long enough
        // for A's setTimeout-based cleanup to fire — while audio-context
        // time (ctx.currentTime) is left untouched, exactly as it would be
        // mid-way through the synchronous scheduling loop.
        vi.advanceTimersByTime(1000)

        // Note B: in the SONG this plays 50 seconds later, with a totally
        // different sound. In the exporter's synchronous scheduling loop
        // it's nonetheless set up right after A.
        const voiceB = new WorkletSynthVoice(
            ctx, strip,
            makeGeneratedSound({ vco1: { wave: 'square', octave: 2, detune: 0, gain: 1 } }),
            'B', null, pool
        )
        await voiceB.setup(makeFlatNote(), 50)
        voiceB.start(50)
        const nodeB = voiceB.workletNode

        // This is the bug: B was handed the exact same AudioWorkletNode as
        // A even though the two notes are 50 seconds apart in the song.
        // B's 'update'/'trigger' messages simply overwrote A's on that node.
        expect(nodeB).toBe(nodeA)
    })

    it('FIX: Sound(isOffline=true) never builds a pool, so unrelated notes always get distinct nodes', async () => {
        const ctx = createMockAudioCtx()
        const mixer = { getOrCreateStrip: vi.fn().mockResolvedValue(createMockStrip()) }
        const offlineSound = new Sound(ctx, mixer, {}, {}, true)
        expect(offlineSound.synthNodePool).toBeNull()

        const strip = createMockStrip()
        const voiceA = new WorkletSynthVoice(ctx, strip, makeGeneratedSound(), 'A', null, offlineSound.synthNodePool)
        await voiceA.setup(makeFlatNote(), 0)
        voiceA.start(0)
        const nodeA = voiceA.workletNode

        vi.advanceTimersByTime(1000)

        const voiceB = new WorkletSynthVoice(
            ctx, strip,
            makeGeneratedSound({ vco1: { wave: 'square', octave: 2, detune: 0, gain: 1 } }),
            'B', null, offlineSound.synthNodePool
        )
        await voiceB.setup(makeFlatNote(), 50)
        voiceB.start(50)
        const nodeB = voiceB.workletNode

        expect(nodeB).not.toBe(nodeA)
        expect(nodeA._id).not.toBe(nodeB._id)
    })

    it('online (real-time) playback still legitimately reuses a released node — reuse itself is not the bug', async () => {
        const ctx = createMockAudioCtx()
        const pool = new SynthVoiceNodePool(ctx)
        const strip = createMockStrip()

        const voiceA = new WorkletSynthVoice(ctx, strip, makeGeneratedSound(), 'A', null, pool)
        await voiceA.setup(makeFlatNote(), 0)
        voiceA.start(0)
        const nodeA = voiceA.workletNode

        // In real-time playback, wall-clock time and AudioContext time
        // advance together, so by the time this later note is genuinely
        // due, the earlier note's cleanup has legitimately already run.
        vi.advanceTimersByTime(1000)
        ctx.currentTime = 1.0

        const voiceB = new WorkletSynthVoice(ctx, strip, makeGeneratedSound(), 'B', null, pool)
        await voiceB.setup(makeFlatNote(), 1.0)
        voiceB.start(1.0)

        expect(voiceB.workletNode).toBe(nodeA)
    })
})
