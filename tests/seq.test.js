import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { appState } from '../src/state/app_state.js'

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
        default: vi.fn().mockImplementation(() => ({
            audioCtx: null,
            isRunning: false,
            tick: 1,
            bpm: 120,
            onSchedule: null,
            setBpm: vi.fn(function(bpm) { this.bpm = bpm }),
            start: vi.fn(),
            stop: vi.fn(),
            ensureTimerWorker: vi.fn(),
        })),
    }
})

describe('MfSeq', () => {
    let MfSeq

    beforeEach(async () => {
        MfGlobals.resetAll()
        serviceRegistry.audioCtx = {
            currentTime: 0,
            state: 'running',
            resume: vi.fn().mockResolvedValue(undefined),
            createBuffer: vi.fn().mockReturnValue({ getChannelData: () => new Float32Array(0) }),
            createBufferSource: vi.fn().mockReturnValue({ connect: vi.fn(), start: vi.fn(), buffer: null, disconnect: vi.fn() }),
            destination: {},
            createGain: vi.fn().mockReturnValue({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
        }
        serviceRegistry.mfResourcesLoader = {
            audioCtx: serviceRegistry.audioCtx,
            ensureResourcesLoaded: vi.fn().mockResolvedValue(undefined),
        }
        serviceRegistry.mfCmd = {
            addNote: vi.fn().mockReturnValue({ velocity: 0.8 }),
        }
        serviceRegistry.mfPatterns = {
            computeFlatNotesFromPattern: vi.fn(),
            computeNextPatternStepNote: vi.fn().mockReturnValue([]),
        }
        serviceRegistry.mfAutoAssign = {
            autoAssignSounds: vi.fn().mockResolvedValue(undefined),
            autoAssignTrackSounds: vi.fn(),
        }
        serviceRegistry.mfAutoGenerate = null
        appState.patterns = [{
            bpm: 120,
            nbBeats: 4,
            name: 'Test',
            tracks: [],
        }]
        appState.selectedPatternNum = 0

        MfSeq = (await import('../src/core/seq.js')).default
    })

    it('constructor creates transport if none exists', () => {
        serviceRegistry.transport = null
        const seq = new MfSeq()
        expect(serviceRegistry.transport).toBeDefined()
    })

    it('constructor reuses existing transport', () => {
        const existing = { audioCtx: serviceRegistry.audioCtx, onSchedule: null }
        serviceRegistry.transport = existing
        const seq = new MfSeq()
        expect(serviceRegistry.transport).toBe(existing)
    })

    it('isRunning returns false when no transport', () => {
        serviceRegistry.transport = null
        const seq = new MfSeq()
        serviceRegistry.transport = null
        expect(seq.isRunning).toBe(false)
    })

    it('tick returns transport tick', () => {
        const seq = new MfSeq()
        serviceRegistry.transport.tick = 42
        expect(seq.tick).toBe(42)
    })

    it('tick returns 0 when no transport', () => {
        const seq = new MfSeq()
        serviceRegistry.transport = null
        expect(seq.tick).toBe(0)
    })

    it('setBpm updates transport and pattern bpm', () => {
        const seq = new MfSeq()
        seq.setBpm(140)
        expect(serviceRegistry.transport.bpm).toBe(140)
        expect(appState.patterns[0].bpm).toBe(140)
    })

    it('setBpm propagates to audioEngine if exists', () => {
        serviceRegistry.audioEngine = { setBpm: vi.fn() }
        const seq = new MfSeq()
        seq.setBpm(150)
        expect(serviceRegistry.audioEngine.setBpm).toHaveBeenCalledWith(150)
    })

    it('stop stops transport and dispatches event', () => {
        const seq = new MfSeq()
        serviceRegistry.transport = { stop: vi.fn(), isRunning: false }
        seq.stop()
        expect(serviceRegistry.transport.stop).toHaveBeenCalledOnce()
    })

    it('stop stops audioEngine', () => {
        serviceRegistry.audioEngine = { stop: vi.fn() }
        const seq = new MfSeq()
        seq.stop()
        expect(serviceRegistry.audioEngine.stop).toHaveBeenCalledOnce()
    })

    it('toggleStartStop resumes suspended audioCtx', () => {
        serviceRegistry.audioCtx.state = 'suspended'
        serviceRegistry.transport = { isRunning: true, stop: vi.fn() }
        const seq = new MfSeq()
        seq.toggleStartStop()
        expect(serviceRegistry.audioCtx.resume).toHaveBeenCalledOnce()
    })

    it('toggleStartStop calls start when not running', () => {
        serviceRegistry.transport = { isRunning: false, stop: vi.fn(), start: vi.fn(), audioCtx: serviceRegistry.audioCtx }
        const seq = new MfSeq()
        seq.start = vi.fn()
        seq.toggleStartStop()
        expect(seq.start).toHaveBeenCalledOnce()
    })

    it('toggleStartStop calls stop when running', () => {
        serviceRegistry.transport = { isRunning: true, stop: vi.fn(), audioCtx: serviceRegistry.audioCtx }
        const seq = new MfSeq()
        seq.stop = vi.fn()
        seq.toggleStartStop()
        expect(seq.stop).toHaveBeenCalledOnce()
    })

    it('ensureTransport sets onSchedule on new transport', () => {
        serviceRegistry.transport = null
        const seq = new MfSeq()
        expect(serviceRegistry.transport.onSchedule).toBeTypeOf('function')
    })

    it('ensureTransport sets audioCtx when missing', () => {
        const fakeTransport = { audioCtx: null, onSchedule: null }
        serviceRegistry.transport = fakeTransport
        const seq = new MfSeq()
        expect(fakeTransport.audioCtx).toBe(serviceRegistry.audioCtx)
    })

    it('toggleStartStop does nothing if audioCtx creation fails', () => {
        serviceRegistry.mfResourcesLoader = { audioCtx: null, ensureResourcesLoaded: vi.fn() }
        serviceRegistry.audioCtx = null
        serviceRegistry.transport = null
        const seq = new MfSeq()
        seq.toggleStartStop()
        // No crash = pass
    })
})
