import { describe, it, expect, vi } from 'vitest'
import {
    safeDisconnect,
    clamp,
    toFiniteNumber,
    computeOscFrequency,
    computeNoteRatio,
    computeLfoValue,
    getLfoWaveformValue,
    computeAccent,
    syncToHz,
} from '../src/audio/math.js'
import { TICK, C3_FREQ, MIN_NOTE_RATIO } from '../src/core/constants.js'

describe('safeDisconnect', () => {
    it('calls disconnect on node', () => {
        const node = { disconnect: vi.fn() }
        safeDisconnect(node)
        expect(node.disconnect).toHaveBeenCalledOnce()
    })

    it('ignores null node', () => {
        safeDisconnect(null)
    })

    it('ignores node without disconnect', () => {
        safeDisconnect({})
    })

    it('ignores already-disconnected node', () => {
        const node = { disconnect: vi.fn(() => { throw new Error('already') }) }
        safeDisconnect(node)
        expect(node.disconnect).toHaveBeenCalledOnce()
    })
})

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
})

describe('computeNoteRatio', () => {
    it('returns input ratio when valid', () => {
        expect(computeNoteRatio(2)).toBe(2)
    })

    it('returns 1 for undefined', () => {
        expect(computeNoteRatio(undefined)).toBe(1)
    })

    it('clamps to MIN_NOTE_RATIO minimum', () => {
        expect(computeNoteRatio(0)).toBe(MIN_NOTE_RATIO)
    })
})

describe('computeOscFrequency', () => {
    it('returns C3_FREQ for default params', () => {
        const freq = computeOscFrequency(1, 0, 0)
        expect(freq).toBeCloseTo(C3_FREQ, 1)
    })

    it('applies octave shift', () => {
        const base = computeOscFrequency(1, 0, 0)
        const octave = computeOscFrequency(1, 1, 0)
        expect(octave).toBeCloseTo(base * 2, 1)
    })

    it('clamps octave to [-4, 4]', () => {
        const freq1 = computeOscFrequency(1, 10, 0)
        const freq2 = computeOscFrequency(1, 4, 0)
        expect(freq1).toBeCloseTo(freq2, 1)
    })

    it('applies detune', () => {
        const base = computeOscFrequency(1, 0, 0)
        const detuned = computeOscFrequency(1, 0, 100)
        expect(detuned).toBeCloseTo(base * 2, 1)
    })
})

describe('getLfoWaveformValue', () => {
    it('sine returns 0 at phase 0.25', () => {
        expect(getLfoWaveformValue(0.25, 0)).toBeCloseTo(0, 2)
    })

    it('sine returns ~1 at phase 0.5', () => {
        expect(getLfoWaveformValue(0.5, 0)).toBeCloseTo(1, 2)
    })

    it('tri returns expected value at key phases', () => {
        const v0 = getLfoWaveformValue(0.25, 1)
        expect(v0).toBeCloseTo(-1, 1)
        const v1 = getLfoWaveformValue(0.75, 1)
        expect(v1).toBeCloseTo(1, 1)
    })

    it('saw returns expected values', () => {
        const p = (0 - 0.25) - Math.floor(0 - 0.25)
        expect(getLfoWaveformValue(0, 2)).toBeCloseTo(p * 2 - 1, 2)
    })

    it('square returns 1 for first half of phase', () => {
        const v = getLfoWaveformValue(0.375, 3)
        expect(v).toBe(1)
    })

    it('square returns -1 for second half of phase', () => {
        const v = getLfoWaveformValue(0.875, 3)
        expect(v).toBe(-1)
    })

    it('S&H returns values in [-1, 1]', () => {
        for (let i = 0; i < 20; i++) {
            const v = getLfoWaveformValue(i, 4)
            expect(v).toBeGreaterThanOrEqual(-1)
            expect(v).toBeLessThanOrEqual(1)
        }
    })
})

describe('computeLfoValue', () => {
    it('returns 0 for null lfo', () => {
        expect(computeLfoValue(null, 0)).toBe(0)
    })

    it('returns value in [min, max] range', () => {
        const lfo = { freq: 1, min: 0.2, max: 0.8, phase: 0, type: 'sine' }
        const val = computeLfoValue(lfo, 0, TICK * 4)
        expect(val).toBeGreaterThanOrEqual(0.2)
        expect(val).toBeLessThanOrEqual(0.8)
    })

    it('returns min at phase=0.25 offset', () => {
        const lfo = { freq: 1, min: 0.5, max: 0.5, phase: 0, type: 'sine' }
        const val = computeLfoValue(lfo, TICK, TICK * 4)
        expect(val).toBe(0.5)
    })

    it('time-based mode uses audioTime', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, type: 'sine' }
        const val = computeLfoValue(lfo, null, null, null, 0, 120)
        expect(typeof val).toBe('number')
        expect(val).toBeGreaterThanOrEqual(0)
        expect(val).toBeLessThanOrEqual(1)
    })

    it('unknown waveform name falls back to 0 (sine)', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, type: 'unknown' }
        const val = computeLfoValue(lfo, 0, TICK * 4)
        expect(typeof val).toBe('number')
    })

    it('uses waveform alias (waveform prop)', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'square' }
        const val = computeLfoValue(lfo, 0, TICK * 4)
        expect(typeof val).toBe('number')
    })
})

describe('computeAccent', () => {
    it('detects accented note (velocity > 0.5)', () => {
        const result = computeAccent(0.8, 0.5)
        expect(result.isAccented).toBe(true)
        expect(result.accentMultiplier).toBeGreaterThan(1)
        expect(result.accentFilterBoost).toBeGreaterThan(0)
    })

    it('detects non-accented note', () => {
        const result = computeAccent(0.3, 0.5)
        expect(result.isAccented).toBe(false)
        expect(result.accentMultiplier).toBe(1)
        expect(result.accentFilterBoost).toBe(0)
    })

    it('accent multiplier scales with amount', () => {
        const r1 = computeAccent(1, 0.2)
        const r2 = computeAccent(1, 0.8)
        expect(r2.accentMultiplier).toBeGreaterThan(r1.accentMultiplier)
    })
})

describe('syncToHz', () => {
    it('converts 1/4 at 120bpm to 2Hz', () => {
        expect(syncToHz('1/4', 120)).toBe(2)
    })

    it('converts 1/8 at 120bpm to 4Hz', () => {
        expect(syncToHz('1/8', 120)).toBe(4)
    })

    it('returns null for off', () => {
        expect(syncToHz('off', 120)).toBeNull()
    })

    it('returns null for null syncValue', () => {
        expect(syncToHz(null, 120)).toBeNull()
    })

    it('returns null for invalid bpm', () => {
        expect(syncToHz('1/4', 0)).toBeNull()
    })

    it('returns null for unknown sync value', () => {
        expect(syncToHz('1/32', 120)).toBeNull()
    })

    it('handles triplet values', () => {
        const hz = syncToHz('1/8T', 120)
        expect(hz).toBeCloseTo(2 * 2 / 3 * 2, 1)
    })
})
