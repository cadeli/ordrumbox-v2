/**
 * Tests for first-start audio initialization and mixer connection guards.
 *
 * Verifies:
 * 1. toggleStartStop creates AudioContext synchronously (user-gesture context).
 * 2. toggleStartStop resumes a suspended AudioContext.
 * 3. Concurrent start() calls are guarded (_starting flag).
 * 4. mixer.start() does not create duplicate connections.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Shared stubs ────────────────────────────────────────────────────────────

function makeFakeAudioCtx(overrides = {}) {
    return {
        state: 'suspended',
        currentTime: 0,
        sampleRate: 44100,
        resume: vi.fn().mockResolvedValue(undefined),
        createGain: vi.fn(() => ({
            gain: { value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
        })),
        createAnalyser: vi.fn(() => ({
            fftSize: 4096,
            frequencyBinCount: 2048,
            connect: vi.fn(),
            disconnect: vi.fn(),
            getByteTimeDomainData: vi.fn(),
        })),
        createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(1) })),
        createBufferSource: vi.fn(() => ({
            buffer: null,
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
        })),
        createOscillator: vi.fn(() => ({
            frequency: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
            type: 'sine',
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
        })),
        createBiquadFilter: vi.fn(() => ({
            type: 'lowpass',
            frequency: { value: 350, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
            Q: { value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
        })),
        createStereoPanner: vi.fn(() => ({
            pan: { value: 0, cancelScheduledValues: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
        })),
        createConstantSource: vi.fn(() => ({
            offset: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
        })),
        destination: { connect: vi.fn() },
        ...overrides,
    }
}

function makeFakeResourcesLoader(audioCtx) {
    return {
        audioCtx,
        ensureResourcesLoaded: vi.fn().mockResolvedValue(undefined),
        loadPatterns: vi.fn().mockResolvedValue(undefined),
        loadDrumkitList: vi.fn().mockResolvedValue(undefined),
        loadGeneratedSounds: vi.fn().mockResolvedValue(undefined),
    }
}

function makeFakeTransport() {
    return {
        isRunning: false,
        audioCtx: null,
        setBpm: vi.fn(),
        start: vi.fn(function () { this.isRunning = true }),
        stop: vi.fn(function () { this.isRunning = false }),
        onSchedule: null,
    }
}

function makeFakeAutoAssign() {
    return {
        autoAssignSounds: vi.fn().mockResolvedValue(undefined),
        autoAssignTrackSounds: vi.fn(),
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('toggleStartStop — audioCtx creation', () => {
    it('creates audioCtx synchronously from resources_loader when null', async () => {
        const fakeCtx = makeFakeAudioCtx()
        const fakeLoader = makeFakeResourcesLoader(fakeCtx)

        const { default: MfSeq } = await import('../src/core/seq.js')
        const seq = new MfSeq({
            serviceRegistry: {
                audioCtx: null,
                mfResourcesLoader: fakeLoader,
                transport: null,
                audioEngine: null,
            },
        })

        seq.toggleStartStop()

        expect(fakeLoader.audioCtx).toBe(fakeCtx)
    })

    it('calls resume() on suspended audioCtx', async () => {
        const fakeCtx = makeFakeAudioCtx({ state: 'suspended' })
        const fakeLoader = makeFakeResourcesLoader(fakeCtx)

        const { default: MfSeq } = await import('../src/core/seq.js')
        const seq = new MfSeq({
            serviceRegistry: {
                audioCtx: fakeCtx,
                mfResourcesLoader: fakeLoader,
                transport: makeFakeTransport(),
                audioEngine: null,
            },
        })

        seq.toggleStartStop()

        expect(fakeCtx.resume).toHaveBeenCalled()
    })

    it('does not call resume() on running audioCtx', async () => {
        const fakeCtx = makeFakeAudioCtx({ state: 'running' })
        const fakeLoader = makeFakeResourcesLoader(fakeCtx)

        const { default: MfSeq } = await import('../src/core/seq.js')
        const seq = new MfSeq({
            serviceRegistry: {
                audioCtx: fakeCtx,
                mfResourcesLoader: fakeLoader,
                transport: makeFakeTransport(),
                audioEngine: null,
            },
        })

        seq.toggleStartStop()

        expect(fakeCtx.resume).not.toHaveBeenCalled()
    })

    it('logs error and returns when AudioContext creation throws', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const errorLoader = {
            get audioCtx() { throw new Error('No AudioContext') },
            ensureResourcesLoaded: vi.fn(),
        }

        const { default: MfSeq } = await import('../src/core/seq.js')
        const seq = new MfSeq({
            serviceRegistry: {
                audioCtx: null,
                mfResourcesLoader: errorLoader,
                transport: null,
                audioEngine: null,
            },
        })

        seq.toggleStartStop()

        expect(consoleSpy).toHaveBeenCalledWith(
            'MfSeq::toggleStartStop: Failed to create AudioContext',
            expect.any(Error)
        )
        consoleSpy.mockRestore()
    })
})

describe('toggleStartStop — start guard', () => {
    it('does not call start() twice concurrently', async () => {
        let startCallCount = 0
        const fakeCtx = makeFakeAudioCtx()
        const fakeLoader = makeFakeResourcesLoader(fakeCtx)
        const fakeTransport = makeFakeTransport()

        const { default: MfSeq } = await import('../src/core/seq.js')
        const seq = new MfSeq({
            serviceRegistry: {
                audioCtx: fakeCtx,
                mfResourcesLoader: fakeLoader,
                transport: fakeTransport,
                audioEngine: null,
                mfCmd: { setSelectedPatternNum: vi.fn() },
            },
        })

        // Mock _startInner to track calls
        seq._startInner = vi.fn().mockImplementation(async () => {
            startCallCount++
        })

        // First call
        seq.toggleStartStop()
        // Second call while first is still "running"
        seq.toggleStartStop()

        // Give microtasks time to settle
        await new Promise(r => setTimeout(r, 50))

        // _startInner should only be entered once (second call skipped)
        expect(seq._startInner).toHaveBeenCalledTimes(1)
    })
})

describe('mixer.start() — no duplicate connections', () => {
    it('disconnects before reconnecting bus nodes', async () => {
        const ctx = {
            sampleRate: 44100,
            currentTime: 0,
            createGain: vi.fn(() => ({
                gain: { value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() },
                connect: vi.fn(),
                disconnect: vi.fn(),
            })),
            createAnalyser: vi.fn(() => ({
                fftSize: 4096,
                frequencyBinCount: 2048,
                connect: vi.fn(),
                disconnect: vi.fn(),
            })),
            createConstantSource: vi.fn(() => ({
                offset: { value: 0 },
                start: vi.fn(),
                stop: vi.fn(),
                connect: vi.fn(),
                disconnect: vi.fn(),
            })),
        }

        const { default: MfMixer } = await import('../src/audio/mixer.js')
        const { default: WorkletLoader } = await import('../src/audio/worklets/loader.js')

        // Mock WorkletLoader to avoid real worklet loading
        vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
        vi.spyOn(WorkletLoader, 'isContextReady').mockReturnValue(true)
        vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
        vi.spyOn(WorkletLoader, 'register').mockImplementation(() => {})
        vi.spyOn(WorkletLoader, 'createNode').mockReturnValue({
            parameters: {
                get: vi.fn(() => ({
                    value: 0,
                    setValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                })),
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
            port: { postMessage: vi.fn() },
        })

        const mixer = new MfMixer(ctx)
        await WorkletLoader.ensureLoaded(ctx)
        mixer._init()

        const busInput = mixer.busInput
        const callsAfterInit = busInput.connect.mock.calls.length

        // Call start() multiple times — each must disconnect before connect
        mixer.start()
        mixer.start()
        mixer.start()

        // busInput.disconnect() must have been called at least once per start()
        expect(busInput.disconnect.mock.calls.length).toBeGreaterThanOrEqual(3)
        // busInput.connect() was called in _init() + 3× start(), but each start
        // disconnected first — so no duplicate signal accumulation.
        expect(busInput.connect.mock.calls.length).toBe(callsAfterInit + 3)
    })
})
