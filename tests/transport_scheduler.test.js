import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: { midiManager: null, audioCtx: { currentTime: 0 } },
}))

vi.mock('../src/core/timerworker.js', () => ({}))

class MockWorker {
    constructor() { this.onmessage = null }
    postMessage() {}
    terminate() {}
}
globalThis.Worker = MockWorker

describe('Transport scheduler', () => {
    let Transport

    beforeEach(async () => {
        Transport = (await import('../src/logic/transport/transport.js')).default
    })

    function makeRunningTransport(opts = {}) {
        const ctx = { currentTime: opts.audioTime ?? 0 }
        const t = new Transport(ctx)
        t.scheduleAheadTime = opts.scheduleAhead ?? 1.0
        t.isRunning = true
        t.tick = 0
        t.nextStepTime = opts.audioTime ?? 0
        return t
    }

    it('does not advance tick when #tickInFlight blocks onSchedule', () => {
        const t = makeRunningTransport()

        let resolveFlight
        const flightPromise = new Promise(r => { resolveFlight = r })
        t.onSchedule = vi.fn(() => flightPromise)

        t.scheduler()
        expect(t.onSchedule).toHaveBeenCalledTimes(1)
        expect(t.onSchedule).toHaveBeenCalledWith(0, expect.any(Number))
        // nextNote was called once after onSchedule → tick = 1
        expect(t.tick).toBe(1)

        // Second scheduler call — #tickInFlight is set, should not call onSchedule or advance
        t.scheduler()
        expect(t.onSchedule).toHaveBeenCalledTimes(1)
        expect(t.tick).toBe(1)

        resolveFlight()
    })

    it('resumes scheduling after #tickInFlight resolves', async () => {
        const t = makeRunningTransport({ scheduleAhead: 10.0 })

        let resolveFirst
        const firstPromise = new Promise(r => { resolveFirst = r })

        t.onSchedule = vi.fn((tick) => {
            if (tick === 0) return firstPromise
            return null
        })

        // First scheduler call — tick=0 fires, returns promise
        t.scheduler()
        expect(t.onSchedule).toHaveBeenCalledTimes(1)
        expect(t.onSchedule).toHaveBeenCalledWith(0, expect.any(Number))

        // Second call — blocked by #tickInFlight
        t.scheduler()
        expect(t.onSchedule).toHaveBeenCalledTimes(1)

        // Resolve the first promise
        resolveFirst()
        await new Promise(r => setTimeout(r, 0))

        // After resolving, onSchedule should be callable again (no more blocking)
        // Third call — tick=1 should now fire (among others scheduled ahead)
        const callsBefore = t.onSchedule.mock.calls.length
        t.scheduler()
        expect(t.onSchedule.mock.calls.length).toBeGreaterThan(callsBefore)
        // tick=1 was among the calls
        const tickValues = t.onSchedule.mock.calls.map(c => c[0])
        expect(tickValues).toContain(1)
    })

    it('tick is never skipped when scheduler runs while blocked', () => {
        const t = makeRunningTransport({ scheduleAhead: 10.0 })

        let resolveFlight
        const flightPromise = new Promise(r => { resolveFlight = r })
        t.onSchedule = vi.fn(() => flightPromise)

        // Run scheduler multiple times while blocked
        t.scheduler()
        t.scheduler()
        t.scheduler()
        t.scheduler()

        // Only tick 0 should have been scheduled (1 call)
        expect(t.onSchedule).toHaveBeenCalledTimes(1)
        expect(t.tick).toBe(1)

        resolveFlight()
    })
})
