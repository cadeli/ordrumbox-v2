import { describe, it, expect } from 'vitest'
import { TICK } from '../src/core/constants.js'
import {
    clamp,
    toFiniteNumber,
    computeOscFrequency,
    computeNoteRatio,
    computeLfoValue,
    getLfoWaveformValue,
    computeAccent,
} from '../src/audio/math.js'

describe('audioMath - clamp', () => {
    it('clamps values within range', () => {
        expect(clamp(5, 0, 10)).toBe(5)
        expect(clamp(-5, 0, 10)).toBe(0)
        expect(clamp(15, 0, 10)).toBe(10)
    })
})

describe('audioMath - toFiniteNumber', () => {
    it('returns number for valid input', () => {
        expect(toFiniteNumber(5)).toBe(5)
        expect(toFiniteNumber('3.14')).toBe(3.14)
    })

    it('returns fallback for invalid input', () => {
        expect(toFiniteNumber(NaN, 0)).toBe(0)
        expect(toFiniteNumber(Infinity, 1)).toBe(1)
        expect(toFiniteNumber(undefined, 42)).toBe(42)
    })
})

describe('audioMath - computeOscFrequency', () => {
    it('computes base frequency at C3', () => {
        const freq = computeOscFrequency(1, 0, 0)
        expect(freq).toBeCloseTo(130.8127826502993, 5)
    })

    it('applies octave shift', () => {
        const freq = computeOscFrequency(1, 1, 0)
        expect(freq).toBeCloseTo(261.6255653005986, 3)
    })

    it('applies detune', () => {
        const freq = computeOscFrequency(1, 0, 100)
        expect(freq).toBeCloseTo(130.8127826502993 * 2, 5)
    })

    it('clamps octave to -4..4', () => {
        const f1 = computeOscFrequency(1, 10, 0)
        const f2 = computeOscFrequency(1, 4, 0)
        expect(f1).toBe(f2)
    })

    it('clamps detune to -100..100', () => {
        const f1 = computeOscFrequency(1, 0, 200)
        const f2 = computeOscFrequency(1, 0, 100)
        expect(f1).toBe(f2)
    })
})

describe('audioMath - computeNoteRatio', () => {
    it('returns fpitch for valid input', () => {
        expect(computeNoteRatio(1.5)).toBe(1.5)
    })

    it('defaults to 1 for invalid input', () => {
        expect(computeNoteRatio(NaN)).toBe(1)
        expect(computeNoteRatio(undefined)).toBe(1)
    })

    it('enforces minimum ratio', () => {
        expect(computeNoteRatio(0.00001)).toBeGreaterThan(0.00001)
    })
})

describe('audioMath - computeLfoValue (replace semantics, controlKey normalization)', () => {
    it('returns 0 when lfo is null/undefined (caller decides replace vs add)', () => {
        expect(computeLfoValue(null, 100, TICK * 4)).toBe(0)
        expect(computeLfoValue(undefined, 100, TICK * 4)).toBe(0)
    })

    it('returns value in [min, max] for velo/pan/pitch (natural units)', () => {
        const lfo = { freq: 1, min: 0.2, max: 0.8, phase: 0 }
        for (let tick = 0; tick < 200; tick += 10) {
            const val = computeLfoValue(lfo, tick, TICK * 4)
            expect(val).toBeGreaterThanOrEqual(0.2)
            expect(val).toBeLessThanOrEqual(0.8)
        }
    })

    it('returns value in [min, max] for pitch in semitones (no normalization)', () => {
        const lfo = { freq: 1, min: -12, max: 12, phase: 0 }
        for (let tick = 0; tick < 200; tick += 10) {
            const val = computeLfoValue(lfo, tick, TICK * 4, 'pitch')
            expect(val).toBeGreaterThanOrEqual(-12)
            expect(val).toBeLessThanOrEqual(12)
        }
    })

    it('normalizes filterFreq LFO config from Hz to [0,1] when min/max > 1', () => {
        // 20000 Hz → normalized = log10(20000/20)/3 = 1.0
        // 20 Hz    → normalized = log10(20/20)/3    = 0.0
        // phase 0 maps to -0.25 in getLfoWaveformValue, sin(2π*-0.25) = -1 → min
        const lfo = { freq: 1, min: 20, max: 20000, phase: 0 }
        expect(computeLfoValue(lfo, 0, TICK * 4, 'filterFreq')).toBe(0)
    })

    it('keeps filterFreq LFO config in [0,1] when already normalized', () => {
        const lfo = { freq: 1, min: 0.2, max: 0.8, phase: 0 }
        // phase 0 = trough → min of normalized range = 0.2
        expect(computeLfoValue(lfo, 0, TICK * 4, 'filterFreq')).toBe(0.2)
    })

    it('normalizes filterQ LFO config from Q to [0,1] when min/max > 1', () => {
        // Q=0.707 → normalized = (0.707-0.707)/18 = 0
        // Q=18.707 → normalized = (18.707-0.707)/18 = 1
        // phase 0 = trough → min of normalized range = 0
        const lfo = { freq: 1, min: 0.707, max: 18.707, phase: 0 }
        expect(computeLfoValue(lfo, 0, TICK * 4, 'filterQ')).toBe(0)
    })

    it('handles string-typed freq and min/max (as stored in JSON)', () => {
        const lfo = { freq: '1', phase: 0, min: '0', max: '1' }
        // phase 0 = trough → min = 0
        expect(computeLfoValue(lfo, 0, TICK * 4)).toBe(0)
    })

    it('matches the worklet formula (inlined in strip_source.js)', () => {
        // The worklet uses: bias + ((raw + 1) * 0.5) * depth
        // where bias = min, depth = max - min, raw = getLfoWaveformValue(phase, wave)
        // frequency = freq (cycles per 4 bars)
        // The helper must produce the same value as getLfoWaveformValue.
        const lfo = { freq: 2, min: -1, max: 1, phase: 0.25 }
        for (const tick of [0, 16, 32, 48, 64, 96]) {
            const curPhase = (tick / (TICK * 4)) * 2 + 0.25
            const raw = getLfoWaveformValue(curPhase, 0) // wave 0 = sine
            const expected = -1 + ((raw + 1) * 0.5) * 2
            const expectedRounded = Math.round(100 * expected) / 100
            const actual = computeLfoValue(lfo, tick, TICK * 4)
            expect(actual).toBe(expectedRounded)
        }
    })
})

describe('audioMath - computeAccent', () => {
    it('no accent for low velocity', () => {
        const accent = computeAccent(0.3)
        expect(accent.isAccented).toBe(false)
        expect(accent.accentMultiplier).toBe(1)
        expect(accent.accentFilterBoost).toBe(0)
    })

    it('accent for high velocity', () => {
        const accent = computeAccent(0.8)
        expect(accent.isAccented).toBe(true)
        expect(accent.accentMultiplier).toBe(1.25)
        expect(accent.accentFilterBoost).toBe(1000)
    })
})
