import { describe, it, expect, vi, afterEach } from 'vitest'
import { clamp, toFiniteNumber } from '../src/core/numbers.js'
import { logger } from '../src/core/logger.js'

describe('clamp', () => {
    it('returns value within range', () => {
        expect(clamp(5, 0, 10)).toBe(5)
    })

    it('clamps to min', () => {
        expect(clamp(-1, 0, 10)).toBe(0)
    })

    it('clamps to max', () => {
        expect(clamp(15, 0, 10)).toBe(10)
    })
})

describe('toFiniteNumber', () => {
    it('returns number if finite', () => {
        expect(toFiniteNumber(42)).toBe(42)
    })

    it('returns fallback for NaN', () => {
        expect(toFiniteNumber(NaN)).toBe(0)
    })

    it('returns fallback for Infinity', () => {
        expect(toFiniteNumber(Infinity)).toBe(0)
    })

    it('returns custom fallback', () => {
        expect(toFiniteNumber(NaN, 99)).toBe(99)
    })

    it('parses string numbers', () => {
        expect(toFiniteNumber('3.14')).toBe(3.14)
    })

    it('does not throw on an invalid value without a label', () => {
        expect(toFiniteNumber(undefined, 7)).toBe(7)
    })
})

// The rate-limit is asserted on logger.warn, NOT console.warn: tests/setup.js
// pins the logger level to ERROR, so console.warn is never reached.
describe('clamp rate-limiting', () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('warns at most once per second when a hot path keeps clamping', () => {
        vi.useFakeTimers()
        const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

        // The rate-limit window is module state shared by every test in this
        // file, so step past it before counting: an earlier clamp already
        // stamped lastClampWarnAt.
        vi.advanceTimersByTime(1500)
        clamp(99, 0, 10)
        const afterFirstBurst = warn.mock.calls.length
        expect(afterFirstBurst).toBeGreaterThanOrEqual(1)

        vi.advanceTimersByTime(200)
        clamp(99, 0, 10)
        expect(warn.mock.calls.length).toBe(afterFirstBurst)

        vi.advanceTimersByTime(1200)
        clamp(99, 0, 10)
        expect(warn.mock.calls.length).toBeGreaterThan(afterFirstBurst)
    })

    it('does not warn when the value is already in range', () => {
        const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
        clamp(5, 0, 10)
        expect(warn).not.toHaveBeenCalled()
    })
})
