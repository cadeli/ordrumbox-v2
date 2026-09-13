import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AudioStallDetector from '../src/audio/stall_detector.js'
import { playbackEvents } from '../src/state/playback_events.js'

function makeTransport(tick = 0, isRunning = false) {
    return { tick, isRunning }
}

function makeAudioCtx(state = 'running') {
    const listeners = {}
    return {
        state,
        addEventListener: vi.fn((type, fn) => {
            if (!listeners[type]) listeners[type] = []
            listeners[type].push(fn)
        }),
        removeEventListener: vi.fn((type, fn) => {
            if (listeners[type]) {
                listeners[type] = listeners[type].filter(f => f !== fn)
            }
        }),
        resume: vi.fn().mockResolvedValue(undefined),
        _emit(type) {
            for (const fn of listeners[type] ?? []) fn()
        }
    }
}

describe('AudioStallDetector', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.spyOn(playbackEvents, 'emit')
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('constructor sets default state', () => {
        const detector = new AudioStallDetector({
            audioCtx: makeAudioCtx(),
            transport: makeTransport()
        })
        expect(detector.isStalled).toBe(false)
    })

    describe('start / stop lifecycle', () => {
        it('start sets up interval and event listener', () => {
            const audioCtx = makeAudioCtx()
            const transport = makeTransport()
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()

            expect(audioCtx.addEventListener).toHaveBeenCalledWith('statechange', expect.any(Function))
            expect(detector.isStalled).toBe(false)
        })

        it('stop clears interval and removes event listener', () => {
            const audioCtx = makeAudioCtx()
            const transport = makeTransport()
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            detector.stop()

            expect(audioCtx.removeEventListener).toHaveBeenCalledWith('statechange', expect.any(Function))
            expect(detector.isStalled).toBe(false)
        })

        it('stop emits stallResume if was stalled', () => {
            const audioCtx = makeAudioCtx('suspended')
            const transport = makeTransport(0, true)
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()

            // Trigger stall via tick not advancing
            vi.advanceTimersByTime(100)
            expect(detector.isStalled).toBe(true)

            playbackEvents.emit.mockClear()
            detector.stop()

            expect(playbackEvents.emit).toHaveBeenCalledWith('stallResume')
            expect(detector.isStalled).toBe(false)
        })

        it('start is idempotent (does nothing if already started)', () => {
            const audioCtx = makeAudioCtx()
            const transport = makeTransport()
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            detector.start()

            expect(audioCtx.addEventListener).toHaveBeenCalledTimes(1)
        })
    })

    describe('tick stall detection', () => {
        it('detects stall when tick stops advancing', () => {
            const audioCtx = makeAudioCtx()
            const transport = makeTransport(5, true)
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            vi.advanceTimersByTime(100)

            expect(detector.isStalled).toBe(true)
            expect(playbackEvents.emit).toHaveBeenCalledWith('stall', { reason: 'scheduler-silent' })
        })

        it('resumes when tick starts advancing again', () => {
            const audioCtx = makeAudioCtx()
            const transport = makeTransport(5, true)
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            vi.advanceTimersByTime(100)
            expect(detector.isStalled).toBe(true)

            transport.tick = 10
            vi.advanceTimersByTime(100)
            expect(detector.isStalled).toBe(false)
            expect(playbackEvents.emit).toHaveBeenCalledWith('stallResume')
        })

        it('does not stall when transport is not running', () => {
            const audioCtx = makeAudioCtx()
            const transport = makeTransport(5, false)
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            vi.advanceTimersByTime(200)

            expect(detector.isStalled).toBe(false)
        })

        it('does not re-emit stall on consecutive checks while stalled', () => {
            const audioCtx = makeAudioCtx()
            const transport = makeTransport(5, true)
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            vi.advanceTimersByTime(100)
            expect(detector.isStalled).toBe(true)

            playbackEvents.emit.mockClear()
            vi.advanceTimersByTime(100)
            expect(playbackEvents.emit).not.toHaveBeenCalledWith('stall', expect.anything())
        })
    })

    describe('AudioContext state change', () => {
        it('detects suspension during playback', () => {
            const audioCtx = makeAudioCtx('running')
            const transport = makeTransport(0, true)
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            audioCtx.state = 'suspended'
            audioCtx._emit('statechange')

            expect(detector.isStalled).toBe(true)
            expect(playbackEvents.emit).toHaveBeenCalledWith('stall', { reason: 'context-suspended' })
        })

        it('does not stall on suspension when transport is not running', () => {
            const audioCtx = makeAudioCtx('running')
            const transport = makeTransport(0, false)
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            audioCtx.state = 'suspended'
            audioCtx._emit('statechange')

            expect(detector.isStalled).toBe(false)
        })

        it('resumes when context returns to running', () => {
            const audioCtx = makeAudioCtx('running')
            const transport = makeTransport(0, true)
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            audioCtx.state = 'suspended'
            audioCtx._emit('statechange')
            expect(detector.isStalled).toBe(true)

            audioCtx.state = 'running'
            audioCtx._emit('statechange')
            expect(detector.isStalled).toBe(false)
            expect(playbackEvents.emit).toHaveBeenCalledWith('stallResume')
        })

        it('attempts audioCtx.resume() on suspension', () => {
            const audioCtx = makeAudioCtx('running')
            const transport = makeTransport(0, true)
            const detector = new AudioStallDetector({ audioCtx, transport, checkIntervalMs: 100 })

            detector.start()
            audioCtx.state = 'suspended'
            audioCtx._emit('statechange')

            expect(audioCtx.resume).toHaveBeenCalled()
        })
    })
})
