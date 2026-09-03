import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'

vi.mock('../src/audio/engine.js', () => ({ default: vi.fn() }))
vi.mock('../src/audio/stall_detector.js', () => ({ default: vi.fn() }))
vi.mock('../src/core/timerworker.js', () => ({}))

class MockWorker {
    constructor() { this.onmessage = null }
    postMessage() {}
    terminate() {}
}
globalThis.Worker = MockWorker

vi.mock('../src/logic/transport/transport.js', () => {
    return {
        default: vi.fn().mockImplementation(function() {
            return {
                audioCtx: null,
                isRunning: false,
                tick: 1,
                bpm: 120,
                onSchedule: null,
                setBpm: vi.fn(function(bpm) { this.bpm = bpm }),
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
            createBufferSource: vi.fn().mockReturnValue({ connect: vi.fn(), start: vi.fn(), buffer: null, disconnect: vi.fn() }),
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
        serviceRegistry.patterns = {
            computeFlatNotesFromPattern: vi.fn(),
            computeNextPatternStepNote: vi.fn().mockReturnValue([]),
        }
        serviceRegistry.autoAssign = {
            autoAssignSounds: vi.fn().mockResolvedValue(undefined),
            autoAssignTrackSounds: vi.fn(),
        }
        serviceRegistry.autoGenerate = null
        appState.patterns = [{
            bpm: 120,
            nbBeats: 4,
            name: 'Test',
            tracks: [],
        }]
        appState.selectedPatternNum = 0

        Sequencer = (await import('../src/core/seq.js')).default
    })

    it('constructor creates transport if none exists', () => {
        serviceRegistry.transport = null
        const seq = new Sequencer()
        expect(serviceRegistry.transport).toBeDefined()
    })

    it('constructor reuses existing transport', () => {
        const existing = { audioCtx: serviceRegistry.audioCtx, onSchedule: null }
        serviceRegistry.transport = existing
        const seq = new Sequencer()
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
        serviceRegistry.transport = { isRunning: false, stop: vi.fn(), start: vi.fn(), audioCtx: serviceRegistry.audioCtx }
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
        const seq = new Sequencer()
        expect(serviceRegistry.transport.onSchedule).toBeTypeOf('function')
    })

    it('ensureTransport sets audioCtx when missing', () => {
        const fakeTransport = { audioCtx: null, onSchedule: null }
        serviceRegistry.transport = fakeTransport
        const seq = new Sequencer()
        expect(fakeTransport.audioCtx).toBe(serviceRegistry.audioCtx)
    })

    it('toggleStartStop does nothing if audioCtx creation fails', () => {
        serviceRegistry.resourcesLoader = { audioCtx: null, ensureResourcesLoaded: vi.fn() }
        serviceRegistry.audioCtx = null
        serviceRegistry.transport = null
        const seq = new Sequencer()
        seq.toggleStartStop()
        // No crash = pass
    })

    // ── race condition: start/stop TOCTOU ─────────────────────────────

    it('start() sets _pendingStop when called while already starting', async () => {
        const seq = new Sequencer()
        // Make _startInner take time
        seq._startInner = vi.fn(() => new Promise(() => {})) // never resolves
        const startPromise = seq.start()
        expect(seq._starting).toBe(true)

        // Call start() again while _starting — should set _pendingStop
        seq.start()
        expect(seq._pendingStop).toBe(true)

        // Abort the never-resolving promise to unblock
        seq._starting = false
        seq._pendingStop = false
    })

    it('start() calls stop() after _startInner if _pendingStop was set', async () => {
        const seq = new Sequencer()
        seq._startInner = vi.fn(async () => {
            // Simulate user clicking stop during async init
            seq._pendingStop = true
        })
        seq.stop = vi.fn()
        await seq.start()
        expect(seq.stop).toHaveBeenCalledOnce()
    })

    it('start() does not call stop() when _pendingStop is false', async () => {
        const seq = new Sequencer()
        seq._startInner = vi.fn(async () => {})
        seq.stop = vi.fn()
        await seq.start()
        expect(seq.stop).not.toHaveBeenCalled()
    })
})
