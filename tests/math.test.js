import { describe, it, expect, vi } from 'vitest'
import { safeDisconnect, computeOscFrequency, computeNoteRatio, computeAccent, syncToHz } from '../src/audio/math.js'
import { C3_FREQ, MIN_NOTE_RATIO } from '../src/core/constants.js'

// The LFO waveform and value functions of this module are covered in
// tests/lfo_engine.test.js, which pins their exact output at each phase.

describe('safeDisconnect', () => {
    it('calls disconnect on node', () => {
        const node = { disconnect: vi.fn() }
        safeDisconnect(node)
        expect(node.disconnect).toHaveBeenCalledOnce()
    })

    it('ignores null node', () => {
        expect(() => safeDisconnect(null)).not.toThrow()
    })

    it('ignores node without disconnect', () => {
        expect(() => safeDisconnect({})).not.toThrow()
    })

    it('ignores already-disconnected node', () => {
        const node = {
            disconnect: vi.fn(() => {
                throw new Error('already')
            }),
        }
        safeDisconnect(node)
        expect(node.disconnect).toHaveBeenCalledOnce()
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
        expect(hz).toBeCloseTo(((2 * 2) / 3) * 2, 1)
    })
})
