import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: { midiManager: null, audioCtx: { currentTime: 0 } },
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

describe('Transport scheduler', () => {
    let Transport

    beforeEach(async () => {
        Transport = (await import('../src/logic/transport/transport.js')).default
    })

    /**
     * A running transport on a real tempo.
     *
     * setBpm() is not optional: without it nextStepTime advances on the
     * appState.secondsPerBeat placeholder (8, i.e. 2s per tick), so the scheduler
     * would only ever emit a single tick per lookahead window and the tests would
     * measure the placeholder instead of the scheduler.
     */
    function makeRunningTransport(opts = {}) {
        const ctx = { currentTime: opts.audioTime ?? 0 }
        const t = new Transport(ctx)
        t.setBpm(opts.bpm ?? 120)
        t.scheduleAheadSeconds = opts.scheduleAhead ?? 0.1
        t.isRunning = true
        t.tick = 0
        t.nextStepTime = opts.audioTime ?? 0
        return t
    }

    it('fills the lookahead with consecutive ticks', () => {
        const t = makeRunningTransport()
        t.onSchedule = vi.fn()

        t.scheduler()

        const ticks = t.onSchedule.mock.calls.map((c) => c[0])
        const times = t.onSchedule.mock.calls.map((c) => c[1])
        expect(ticks.length).toBeGreaterThan(1)
        expect(ticks).toEqual([...ticks].sort((a, b) => a - b)) // monotonic, no gaps
        expect(ticks[0]).toBe(0)
        // tick follows the last scheduled one, never the other way round
        expect(t.tick).toBe(ticks.at(-1) + 1)
        // and the scheduled times sit inside the lookahead window
        expect(Math.max(...times)).toBeLessThanOrEqual(0.1)
    })

    it('keeps scheduling when onSchedule throws synchronously', () => {
        const t = makeRunningTransport()
        t.onSchedule = vi.fn(() => {
            throw new Error('boom')
        })

        expect(() => t.scheduler()).not.toThrow()
        // the tick still advanced, so one bad tick cannot freeze playback
        expect(t.onSchedule.mock.calls.length).toBeGreaterThan(1)
        expect(t.tick).toBeGreaterThan(0)
    })
})
