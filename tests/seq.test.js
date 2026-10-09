import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { makePattern, PARAM_SETS } from './helpers/make_pattern.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'

vi.mock('../src/audio/engine.js', () => ({ default: vi.fn() }))
vi.mock('../src/audio/stall_detector.js', () => ({
    default: class {
        start() {}
        stop() {}
    },
}))
vi.mock('../src/core/timerworker.js', () => ({}))

class MockWorker {
    constructor() {
        this.onmessage = null
    }
    postMessage() {}
    terminate() {}
}
globalThis.Worker = MockWorker

vi.mock('../src/logic/transport/transport.js', () => {
    return {
        default: vi.fn().mockImplementation(function () {
            return {
                audioCtx: null,
                isRunning: false,
                tick: 1,
                bpm: 120,
                onSchedule: null,
                setBpm: vi.fn(function (bpm) {
                    this.bpm = bpm
                }),
                start: vi.fn(),
                stop: vi.fn(),
                ensureTimerWorker: vi.fn(),
            }
        }),
    }
})

describe('Sequencer', () => {
    let Sequencer

    beforeEach(async () => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.audioCtx = {
            currentTime: 0,
            state: 'running',
            resume: vi.fn().mockResolvedValue(undefined),
            createBuffer: vi.fn().mockReturnValue({ getChannelData: () => new Float32Array(0) }),
            createBufferSource: vi
                .fn()
                .mockReturnValue({ connect: vi.fn(), start: vi.fn(), buffer: null, disconnect: vi.fn() }),
            destination: {},
            createGain: vi.fn().mockReturnValue({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
        }
        serviceRegistry.resourcesLoader = {
            audioCtx: serviceRegistry.audioCtx,
            ensureResourcesLoaded: vi.fn().mockResolvedValue(undefined),
        }
        serviceRegistry.cmd = {
            addNote: vi.fn().mockReturnValue({ velocity: 0.8 }),
        }
        serviceRegistry.flatNotes = {
            applyFlatNotes: vi.fn(),
        }
        serviceRegistry.autoAssign = {
            autoAssignSounds: vi.fn().mockResolvedValue(undefined),
            autoAssignTrackSounds: vi.fn(),
        }
        serviceRegistry.autoGenerator = null
        appState.patterns = [makePattern()]
        appState.selectedPatternIdx = 0

        Sequencer = (await import('../src/logic/sequencer.js')).default
    })

    it('constructor creates transport if none exists', () => {
        serviceRegistry.transport = null
        new Sequencer()
        // toBeDefined() also passes for null, which is what it was before
        expect(serviceRegistry.transport).not.toBeNull()
        expect(serviceRegistry.transport.isRunning).toBe(false)
    })

    // PATTERN_CHANGE's payload is behaviour, not decoration: an array re-syncs
    // those tracks, no payload re-syncs the whole pattern. Eight emitters pass
    // nothing on purpose, so the contract had to be written down (core/events.js)
    // and pinned here.
    describe('PATTERN_CHANGE payload contract', () => {
        async function bus() {
            return {
                playbackEvents: (await import('../src/state/event_bus.js')).playbackEvents,
                EVENTS: (await import('../src/core/events.js')).EVENTS,
            }
        }

        // the Sequencer constructor builds its own Engine and puts it in the
        // registry, so the mock has to BE the spy
        async function engineSpies() {
            const engine = {
                invalidateCache: vi.fn(),
                syncTrack: vi.fn(),
                syncAllTracks: vi.fn(),
            }
            const { default: Engine } = await import('../src/audio/engine.js')
            Engine.mockImplementation(function () {
                return engine
            })
            return engine
        }

        it('an array of tracks re-syncs exactly those', async () => {
            const engine = await engineSpies()
            const seq = new Sequencer()
            seq.ensureAudioEngine()
            const { playbackEvents, EVENTS } = await bus()
            const kick = { name: 'KICK' }
            const snare = { name: 'SNARE' }

            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [kick, snare])

            expect(engine.invalidateCache).toHaveBeenCalled()
            expect(engine.syncTrack.mock.calls.map((c) => c[0])).toEqual([kick, snare])
            expect(engine.syncAllTracks).not.toHaveBeenCalled()
        })

        it('no payload re-syncs the whole selected pattern', async () => {
            const engine = await engineSpies()
            const seq = new Sequencer()
            seq.ensureAudioEngine()
            const { playbackEvents, EVENTS } = await bus()

            playbackEvents.emit(EVENTS.PATTERN_CHANGE)

            expect(engine.syncAllTracks).toHaveBeenCalledWith(appState.patterns[0])
            expect(engine.syncTrack).not.toHaveBeenCalled()
        })

        it('an empty array also means "re-sync everything"', async () => {
            // [] has no length, so it takes the same branch as no payload: an
            // empty list cannot tell the engine which tracks changed.
            const engine = await engineSpies()
            const seq = new Sequencer()
            seq.ensureAudioEngine()
            const { playbackEvents, EVENTS } = await bus()

            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [])

            expect(engine.syncAllTracks).toHaveBeenCalledWith(appState.patterns[0])
        })
    })

    it('constructor reuses existing transport', () => {
        const existing = { audioCtx: serviceRegistry.audioCtx, onSchedule: null }
        serviceRegistry.transport = existing
        new Sequencer()
        expect(serviceRegistry.transport).toBe(existing)
    })

    it('isRunning returns false when no transport', () => {
        serviceRegistry.transport = null
        const seq = new Sequencer()
        serviceRegistry.transport = null
        expect(seq.isRunning).toBe(false)
    })

    it('tick returns transport tick', () => {
        const seq = new Sequencer()
        serviceRegistry.transport.tick = 42
        expect(seq.tick).toBe(42)
    })

    it('tick returns 0 when no transport', () => {
        const seq = new Sequencer()
        serviceRegistry.transport = null
        expect(seq.tick).toBe(0)
    })

    it('setBpm updates transport and pattern bpm', () => {
        const seq = new Sequencer()
        seq.setBpm(140)
        expect(serviceRegistry.transport.bpm).toBe(140)
        expect(appState.patterns[0].bpm).toBe(140)
    })

    it('setBpm propagates to audioEngine if exists', () => {
        serviceRegistry.audioEngine = { setBpm: vi.fn() }
        const seq = new Sequencer()
        seq.setBpm(150)
        expect(serviceRegistry.audioEngine.setBpm).toHaveBeenCalledWith(150)
    })

    it('stop stops transport and dispatches event', () => {
        const seq = new Sequencer()
        serviceRegistry.transport = { stop: vi.fn(), isRunning: false }
        seq.stop()
        expect(serviceRegistry.transport.stop).toHaveBeenCalledOnce()
    })

    it('stop stops audioEngine', () => {
        serviceRegistry.audioEngine = { stop: vi.fn() }
        const seq = new Sequencer()
        seq.stop()
        expect(serviceRegistry.audioEngine.stop).toHaveBeenCalledOnce()
    })

    it('toggleStartStop resumes suspended audioCtx', () => {
        serviceRegistry.audioCtx.state = 'suspended'
        serviceRegistry.transport = { isRunning: true, stop: vi.fn() }
        const seq = new Sequencer()
        seq.toggleStartStop()
        expect(serviceRegistry.audioCtx.resume).toHaveBeenCalledOnce()
    })

    it('toggleStartStop calls start when not running', () => {
        serviceRegistry.transport = {
            isRunning: false,
            stop: vi.fn(),
            start: vi.fn(),
            audioCtx: serviceRegistry.audioCtx,
        }
        const seq = new Sequencer()
        seq.start = vi.fn()
        seq.toggleStartStop()
        expect(seq.start).toHaveBeenCalledOnce()
    })

    it('toggleStartStop calls stop when running', () => {
        serviceRegistry.transport = { isRunning: true, stop: vi.fn(), audioCtx: serviceRegistry.audioCtx }
        const seq = new Sequencer()
        seq.stop = vi.fn()
        seq.toggleStartStop()
        expect(seq.stop).toHaveBeenCalledOnce()
    })

    it('ensureTransport sets onSchedule on new transport', () => {
        serviceRegistry.transport = null
        new Sequencer()
        expect(serviceRegistry.transport.onSchedule).toBeTypeOf('function')
    })

    it('ensureTransport sets audioCtx when missing', () => {
        const fakeTransport = { audioCtx: null, onSchedule: null }
        serviceRegistry.transport = fakeTransport
        new Sequencer()
        expect(fakeTransport.audioCtx).toBe(serviceRegistry.audioCtx)
    })

    it('toggleStartStop does nothing if audioCtx creation fails', async () => {
        serviceRegistry.resourcesLoader = { audioCtx: null, ensureResourcesLoaded: vi.fn() }
        serviceRegistry.audioCtx = null
        serviceRegistry.transport = null
        const seq = new Sequencer()
        expect(serviceRegistry.transport).not.toBeNull()

        expect(() => seq.toggleStartStop()).not.toThrow()
        await Promise.resolve()
        await Promise.resolve()

        expect(serviceRegistry.audioCtx).toBeNull()
        expect(seq.isRunning).toBe(false)
    })

    // ── race condition: start/stop TOCTOU ─────────────────────────────

    it('start() called while starting enters the loading path only once and honors the pending stop', async () => {
        const seq = new Sequencer()
        serviceRegistry.audioEngine = {
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn(),
            setBpm: vi.fn(),
            invalidateCache: vi.fn(),
        }

        // Hold resource loading open so the first start() stays in flight
        let releaseResources
        serviceRegistry.resourcesLoader.ensureResourcesLoaded.mockReturnValue(
            new Promise((resolve) => {
                releaseResources = resolve
            }),
        )
        seq.stop = vi.fn()

        const first = seq.start()
        expect(serviceRegistry.resourcesLoader.ensureResourcesLoaded).toHaveBeenCalledTimes(1)

        // Second call while the first is in flight: no second loading pass
        const second = seq.start()
        expect(serviceRegistry.resourcesLoader.ensureResourcesLoaded).toHaveBeenCalledTimes(1)

        releaseResources()
        await first
        await second

        // The stop requested while starting is honored once startup finished
        expect(seq.stop).toHaveBeenCalledOnce()
    })

    it('start() runs the full startup and does not stop when nothing was requested', async () => {
        const seq = new Sequencer()
        serviceRegistry.audioEngine = {
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn(),
            setBpm: vi.fn(),
            invalidateCache: vi.fn(),
        }
        seq.stop = vi.fn()

        await seq.start()

        expect(serviceRegistry.resourcesLoader.ensureResourcesLoaded).toHaveBeenCalledTimes(1)
        expect(serviceRegistry.transport.start).toHaveBeenCalled()
        expect(seq.stop).not.toHaveBeenCalled()
    })

    // ── tempo ownership: the visible view decides ─────────────────────

    describe('playback tempo follows the view', () => {
        /** A transport stub that records every tempo it is given. */
        function makeTransport() {
            return {
                isRunning: false,
                tick: 0,
                nextStepTime: 0,
                bpm: 120,
                setBpm: vi.fn(function (bpm) {
                    this.bpm = bpm
                }),
                start: vi.fn(function () {
                    this.isRunning = true
                    this.tick = 0
                }),
                stop: vi.fn(),
            }
        }

        function makeEngine() {
            return {
                start: vi.fn().mockResolvedValue(undefined),
                setBpm: vi.fn(),
                invalidateCache: vi.fn(),
            }
        }

        /** Loads an arrangement whose bpm differs from the pattern's (140). */
        function withArrangement(songBpm = 120) {
            appState.patterns = [makePattern({ bpm: 140 })]
            appState.songs = [{ id: 'demo', name: 'Demo', bpm: songBpm, clips: [] }]
            appState.selectedSongIdx = 0
        }

        /** Starts playback so the transport is anchored on the given view. */
        async function startIn(view) {
            appState.currentView = view
            const seq = new Sequencer()
            const transport = makeTransport()
            const engine = makeEngine()
            serviceRegistry.transport = transport
            serviceRegistry.audioEngine = engine
            await seq.start()
            return { seq, transport, engine }
        }

        it('is the pattern bpm outside the song view and the arrangement bpm inside it', async () => {
            withArrangement(150)
            const seq = new Sequencer()

            appState.currentView = 'edit'
            expect(seq.currentPlaybackTempo()).toBe(140)
            appState.currentView = 'synth'
            expect(seq.currentPlaybackTempo()).toBe(140)
            appState.currentView = 'song'
            expect(seq.currentPlaybackTempo()).toBe(150)
        })

        it('starts a pattern view on the pattern bpm, not on the arrangement bpm', async () => {
            withArrangement(120)
            const { transport } = await startIn('edit')

            expect(transport.setBpm).toHaveBeenCalledWith(140)
        })

        it('starts the song view on the arrangement bpm', async () => {
            withArrangement(120)
            const { transport } = await startIn('song')

            expect(transport.setBpm).toHaveBeenCalledWith(120)
        })

        // grid -> synth is not a mode change: the transport keeps its tempo,
        // its position and its cache.
        it('leaves the transport alone when the switch stays in pattern mode', async () => {
            withArrangement(120)
            const { seq, transport, engine } = await startIn('edit')
            transport.tick = 42
            transport.setBpm.mockClear()
            engine.invalidateCache.mockClear()

            appState.currentView = 'synth'
            seq.syncPlaybackMode()

            expect(transport.setBpm).not.toHaveBeenCalled()
            expect(transport.tick).toBe(42)
            expect(engine.invalidateCache).not.toHaveBeenCalled()
        })

        it('re-anchors on the new tempo when the playback mode changes', async () => {
            withArrangement(120)
            const { seq, transport, engine } = await startIn('song')
            expect(transport.bpm).toBe(120)
            transport.tick = 42
            transport.setBpm.mockClear()

            // leaving the arrangement for a pattern view
            appState.currentView = 'proll'
            seq.syncPlaybackMode()

            expect(transport.setBpm).toHaveBeenCalledWith(140)
            expect(transport.tick).toBe(0)
            expect(engine.setBpm).toHaveBeenCalledWith(140)
            expect(engine.invalidateCache).toHaveBeenCalled()
        })
    })

    // ── arrangement cursor: the ruler click ─────────────────────────────

    describe('song cursor', () => {
        // one measure is 4 beats of 32 ticks
        const MEASURE_TICKS = 4 * 32

        /** A transport stub the cursor tests can aim. */
        function makeTransport(isRunning) {
            return {
                isRunning,
                tick: 0,
                nextStepTime: 0,
                setBpm: vi.fn(),
                stop: vi.fn(),
                // like the real Transport: starting re-anchors on zero
                start: vi.fn(function () {
                    this.isRunning = true
                    this.tick = 0
                }),
            }
        }

        it('starts a song from the measure the cursor was put on', async () => {
            appState.currentView = 'song'
            const seq = new Sequencer()
            serviceRegistry.transport = makeTransport(false)
            serviceRegistry.audioEngine = {
                start: vi.fn().mockResolvedValue(undefined),
                setBpm: vi.fn(),
                invalidateCache: vi.fn(),
            }
            seq.setSongCursor(3)
            expect(seq.songCursorMeasure).toBe(3)

            await seq.start()
            // transport.start() re-anchors to zero, the cursor re-aims it right after
            expect(serviceRegistry.transport.tick).toBe(3 * MEASURE_TICKS)
        })

        // A song measure would land mid-pattern, so the pattern view keeps its
        // own zero even after the cursor was moved.
        it('starts a pattern from its own zero', async () => {
            appState.currentView = 'edit'
            const seq = new Sequencer()
            serviceRegistry.transport = makeTransport(false)
            serviceRegistry.audioEngine = {
                start: vi.fn().mockResolvedValue(undefined),
                setBpm: vi.fn(),
                invalidateCache: vi.fn(),
            }
            seq.setSongCursor(3)

            await seq.start()
            expect(serviceRegistry.transport.tick).toBe(0)
        })

        it('jumps a running transport there, re-anchored on the audio clock', () => {
            const seq = new Sequencer()
            serviceRegistry.transport = makeTransport(true)
            serviceRegistry.audioCtx.currentTime = 12
            serviceRegistry.audioEngine = { invalidateCache: vi.fn() }
            serviceRegistry.transport.tick = 99

            seq.setSongCursor(5)
            expect(serviceRegistry.transport.tick).toBe(5 * MEASURE_TICKS)
            expect(serviceRegistry.transport.nextStepTime).toBe(12)
            expect(serviceRegistry.audioEngine.invalidateCache).toHaveBeenCalled()
        })

        // Stopped: there is nothing to jump, the cursor only has to be remembered.
        it('only remembers the measure while the transport is stopped', () => {
            const seq = new Sequencer()
            serviceRegistry.transport = makeTransport(false)
            serviceRegistry.transport.tick = 99

            seq.setSongCursor(2)
            expect(serviceRegistry.transport.tick).toBe(99)
            expect(serviceRegistry.transport.nextStepTime).toBe(0)
            expect(seq.songCursorMeasure).toBe(2)
        })

        it('clamps and floors the measure it is given', () => {
            const seq = new Sequencer()
            serviceRegistry.transport = makeTransport(false)

            seq.setSongCursor(4.7)
            expect(seq.songCursorMeasure).toBe(4)
            seq.setSongCursor(-3)
            expect(seq.songCursorMeasure).toBe(0)
            seq.setSongCursor(Number.NaN)
            expect(seq.songCursorMeasure).toBe(0)
        })
    })

    describe.each(PARAM_SETS)('Sequencer — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
        it('creates transport and can set bpm', () => {
            appState.patterns = [makePattern({ bpm, beatCount })]
            const seq = new Sequencer()
            seq.setBpm(bpm + 10)
            expect(serviceRegistry.transport.bpm).toBe(bpm + 10)
        })
    })
})
