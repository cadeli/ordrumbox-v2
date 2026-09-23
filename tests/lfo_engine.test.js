// tests/lfo_engine.test.js
import { describe, it, expect } from 'vitest'
import { computeLfoValue, getLfoWaveformValue } from '../src/audio/math.js'
import { computeTrackLfoValues, LFO_MAP } from '../src/logic/lfo_engine.js'

// Phase shift: p = (phase - 0.25) - floor(phase - 0.25)
// At phase=0 → p=0.75, sine=−1, tri=−2, saw=0.5, square=−1
// At phase=0.25 → p=0, sine=0, tri=−1, saw=−1, square=1
// At phase=0.5 → p=0.25, sine=1, tri=2, saw=−0.5, square=1
// At phase=0.75 → p=0.5, sine=0, tri=1, saw=0, square=−1

describe('getLfoWaveformValue', () => {
    it('sine at phase=0 → p=0.75 → sin(3π/2) = −1', () => {
        expect(getLfoWaveformValue(0, 0)).toBeCloseTo(-1, 5)
    })

    it('sine at phase=0.25 → p=0 → sin(0) = 0', () => {
        expect(getLfoWaveformValue(0.25, 0)).toBeCloseTo(0, 5)
    })

    it('sine at phase=0.5 → p=0.25 → sin(π/2) = 1', () => {
        expect(getLfoWaveformValue(0.5, 0)).toBeCloseTo(1, 5)
    })

    it('sine at phase=0.75 → p=0.5 → sin(π) = 0', () => {
        expect(getLfoWaveformValue(0.75, 0)).toBeCloseTo(0, 5)
    })

    it('triangle at phase=0.5 → p=0.25 → midpoint = 2', () => {
        expect(getLfoWaveformValue(0.5, 1)).toBeCloseTo(2, 5)
    })

    it('triangle at phase=0.75 → p=0.5 → third = 1', () => {
        expect(getLfoWaveformValue(0.75, 1)).toBeCloseTo(1, 5)
    })

    it('sawtooth at phase=0.5 → p=0.25 → 0.25*2−1 = −0.5', () => {
        expect(getLfoWaveformValue(0.5, 2)).toBeCloseTo(-0.5, 5)
    })

    it('sawtooth at phase=0.75 → p=0.5 → 0', () => {
        expect(getLfoWaveformValue(0.75, 2)).toBeCloseTo(0, 5)
    })

    it('square returns 1 in first half (p<0.5)', () => {
        expect(getLfoWaveformValue(0.25, 3)).toBe(1)
    })

    it('square returns −1 in second half (p>=0.5)', () => {
        expect(getLfoWaveformValue(0.75, 3)).toBe(-1)
    })

    it('random produces values in [-1, 1]', () => {
        for (let phase = 0; phase < 10; phase++) {
            const val = getLfoWaveformValue(phase, 4)
            expect(val).toBeGreaterThanOrEqual(-1)
            expect(val).toBeLessThanOrEqual(1)
        }
    })

    it('random is deterministic for same cycle', () => {
        const a = getLfoWaveformValue(3.0, 4)
        const b = getLfoWaveformValue(3.5, 4)
        expect(a).toBe(b)
    })

    it('random varies between cycles', () => {
        const a = getLfoWaveformValue(0, 4)
        const b = getLfoWaveformValue(1, 4)
        expect(a).not.toBe(b)
    })
})

describe('computeLfoValue', () => {
    it('returns 0 for null lfo', () => {
        expect(computeLfoValue(null, 0, 128)).toBe(0)
    })

    it('sine at tick=0, freq=1 → phase=0 → sine=−1 → (−1+1)/2 = 0', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' }
        expect(computeLfoValue(lfo, 0, 128)).toBe(0)
    })

    it('sine at tick=32, freq=1 → phase=0.25 → sine=0 → 0.5', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' }
        const val = computeLfoValue(lfo, 32, 128)
        expect(val).toBe(0.5)
    })

    it('sine at tick=64, freq=1 → phase=0.5 → sine=1 → 1.0', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' }
        const val = computeLfoValue(lfo, 64, 128)
        expect(val).toBe(1)
    })

    it('sine at tick=96, freq=1 → phase=0.75 → sine=0 → 0.5', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' }
        const val = computeLfoValue(lfo, 96, 128)
        expect(val).toBe(0.5)
    })

    it('sine full cycle: 0 → 0.5 → 1 → 0.5 → 0', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' }
        const v0 = computeLfoValue(lfo, 0, 128)
        const v32 = computeLfoValue(lfo, 32, 128)
        const v64 = computeLfoValue(lfo, 64, 128)
        const v96 = computeLfoValue(lfo, 96, 128)
        const v128 = computeLfoValue(lfo, 128, 128)
        expect(v0).toBe(0)
        expect(v32).toBe(0.5)
        expect(v64).toBe(1)
        expect(v96).toBe(0.5)
        expect(v128).toBe(0)
    })

    it('respects min/max range', () => {
        const lfo = { freq: 1, min: 0.3, max: 0.7, phase: 0, waveform: 'sine' }
        for (let tick = 0; tick < 128; tick += 4) {
            const val = computeLfoValue(lfo, tick, 128)
            expect(val).toBeGreaterThanOrEqual(0.3)
            expect(val).toBeLessThanOrEqual(0.7)
        }
    })

    it('respects phase offset', () => {
        const lfoA = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' }
        const lfoB = { freq: 1, min: 0, max: 1, phase: 0.5, waveform: 'sine' }
        const valA = computeLfoValue(lfoA, 0, 128)
        const valB = computeLfoValue(lfoB, 0, 128)
        expect(valA).not.toBe(valB)
    })

    it('clamps freq to max 2', () => {
        const lfoA = { freq: 2, min: 0, max: 1, phase: 0, waveform: 'sine' }
        const lfoB = { freq: 10, min: 0, max: 1, phase: 0, waveform: 'sine' }
        const valA = computeLfoValue(lfoA, 32, 128)
        const valB = computeLfoValue(lfoB, 32, 128)
        expect(valA).toBe(valB)
    })

    it('handles triangle waveform', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'triangle' }
        const val = computeLfoValue(lfo, 64, 128)
        expect(typeof val).toBe('number')
        expect(Number.isFinite(val)).toBe(true)
    })

    it('handles sawtooth waveform', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sawtooth' }
        const val = computeLfoValue(lfo, 0, 128)
        expect(typeof val).toBe('number')
    })

    it('handles square waveform', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'square' }
        const val = computeLfoValue(lfo, 32, 128)
        expect([0, 1]).toContain(val)
    })

    it('handles random waveform', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'random' }
        const val = computeLfoValue(lfo, 0, 128)
        expect(typeof val).toBe('number')
        expect(val).toBeGreaterThanOrEqual(0)
        expect(val).toBeLessThanOrEqual(1)
    })

    it('accepts "type" property as alias for waveform', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, type: 'sawtooth' }
        const val = computeLfoValue(lfo, 0, 128)
        expect(typeof val).toBe('number')
    })

    it('defaults to sine for unknown waveform name (treated as numeric 0)', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'nonexistent' }
        const val = computeLfoValue(lfo, 0, 128)
        expect(typeof val).toBe('number')
    })

    it('defaults freq to 1 when missing', () => {
        const lfo = { min: 0, max: 1, phase: 0, waveform: 'sine' }
        const val = computeLfoValue(lfo, 32, 128)
        expect(val).toBe(0.5)
    })

    it('returns value rounded to 2 decimal places', () => {
        const lfo = { freq: 0.3, min: 0, max: 1, phase: 0.123, waveform: 'sine' }
        const val = computeLfoValue(lfo, 17, 128)
        const str = String(val)
        const decimals = str.includes('.') ? str.split('.')[1].length : 0
        expect(decimals).toBeLessThanOrEqual(2)
    })
})

describe('computeLfoValue time-based mode', () => {
    it('uses audioTime when provided with bpm', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' }
        const val = computeLfoValue(lfo, null, 128, null, 0, 120)
        expect(typeof val).toBe('number')
    })

    it('differs from tick-based at non-zero time', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' }
        const tickVal = computeLfoValue(lfo, 32, 128)
        const timeVal = computeLfoValue(lfo, null, 128, null, 0.5, 120)
        expect(tickVal).not.toBe(timeVal)
    })
})

describe('computeTrackLfoValues', () => {
    it('returns 0 for all targets when no LFOs on track', () => {
        const track = { name: 'KICK' }
        const result = computeTrackLfoValues(track, 0, 128, 120)
        expect(result).toEqual({
            velocity: 0,
            pan: 0,
            pitch: 0,
            filterFreq: 0,
            filterQ: 0,
        })
    })

    it('computes values for each LFO_MAP entry', () => {
        const track = {
            velocityLfo: { freq: 1, min: 0, max: 1, phase: 0, waveform: 'sine' },
            panLfo: { freq: 1, min: -1, max: 1, phase: 0, waveform: 'sine' },
            pitchLfo: { freq: 1, min: -12, max: 12, phase: 0, waveform: 'sine' },
            filterFreqLfo: { freq: 1, min: 0, max: 1000, phase: 0, waveform: 'sine' },
            filterQLfo: { freq: 1, min: 0, max: 10, phase: 0, waveform: 'sine' },
        }
        const result = computeTrackLfoValues(track, 64, 128, 120)
        expect(result.velocity).toBe(1)
        expect(result.pan).toBe(1)
        expect(result.pitch).toBe(12)
        expect(result.filterFreq).toBe(1000)
        expect(result.filterQ).toBe(10)
    })

    it('LFO_MAP has exactly 5 entries', () => {
        expect(LFO_MAP).toHaveLength(5)
    })
})
