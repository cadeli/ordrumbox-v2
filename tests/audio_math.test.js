import { describe, it, expect } from 'vitest'
import { TICK } from '../src/core/constants.js'
import {
    clamp,
    toFiniteNumber,
    computeOscFrequency,
    computeNoteRatio,
    computeLfoFrequency,
    computeLfoValueFromTick,
    computeLfoValue,
    computeLfoDepth,
    getLfoWaveformValue,
    computeSaturationCurve,
    computeImpulseSampleData,
    computeDriveGain,
    computeOutputGain,
    computeDelaySettings,
    computeAccent,
    computePeakFilterFreq,
    computeAdsrEnvelopeParams,
    computeTrackPan,
    REVERB_PRESETS,
    SATURATION_TYPES,
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

describe('audioMath - computeLfoFrequency', () => {
    it('computes frequency at 120 BPM (1 unit = 16 beats = 8s @ 120BPM)', () => {
        const freq = computeLfoFrequency(1, 120)
        expect(freq).toBeCloseTo(1 / 8, 5)
    })

    it('scales with config frequency (linear period scaling: freq 2 = 32 beats = f1 / 2)', () => {
        const f1 = computeLfoFrequency(1, 120)
        const f2 = computeLfoFrequency(2, 120)
        expect(f2).toBeCloseTo(f1 / 2, 5)
    })
})

describe('audioMath - computeLfoValueFromTick', () => {
    it('returns min at tick 0 phase 0 for range [0, 1] (phase 0 = trough)', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0 }
        // phase 0 maps to -0.25 in getLfoWaveformValue, sin(2π*-0.25) = -1 → min
        expect(computeLfoValueFromTick(lfo, 0)).toBe(0)
    })

    it('returns max at 1/2 period with phase 0 (phase 0.5 = peak)', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0 }
        const period = 4 * TICK
        expect(computeLfoValueFromTick(lfo, period / 2)).toBe(1)
    })

    it('returns min at full period with phase 0 (phase 1.0 = trough again)', () => {
        const lfo = { freq: 1, min: 0, max: 1, phase: 0 }
        const period = 4 * TICK
        expect(computeLfoValueFromTick(lfo, period)).toBe(0)
    })

    it('doubling frequency parameter doubles the period (tick 1/2 freq 1 == tick 1 freq 2)', () => {
        const lfo1 = { freq: 1, min: 0, max: 1, phase: 0 }
        const lfo2 = { freq: 2, min: 0, max: 1, phase: 0 }
        const val1 = computeLfoValueFromTick(lfo1, 2 * TICK) // 1/2 of 4*TICK
        const val2 = computeLfoValueFromTick(lfo2, 4 * TICK) // 1/2 of 8*TICK
        expect(val1).toBe(val2)
    })
})

describe('audioMath - computeLfoDepth', () => {
    it('returns max - min', () => {
        expect(computeLfoDepth(-12, 12)).toBe(24)
        expect(computeLfoDepth(0, 1)).toBe(1)
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
        // period = freq * 4 * TICK
        // The helper must produce the same value as getLfoWaveformValue.
        const lfo = { freq: 2, min: -1, max: 1, phase: 0.25 }
        for (const tick of [0, 16, 32, 48, 64, 96]) {
            const period = 2 * 4 * TICK
            const curPhase = (tick / period) + 0.25
            const raw = getLfoWaveformValue(curPhase, 0) // wave 0 = sine
            const expected = -1 + ((raw + 1) * 0.5) * 2
            const expectedRounded = Math.round(100 * expected) / 100
            const actual = computeLfoValue(lfo, tick, TICK * 4)
            expect(actual).toBe(expectedRounded)
        }
    })
})

describe('audioMath - computeSaturationCurve', () => {
    it('returns identity curve when amount is 0', () => {
        const curve = computeSaturationCurve('soft', 0)
        expect(curve.length).toBe(1024)
        expect(curve[0]).toBeCloseTo(-1, 1)
        expect(curve[1023]).toBeCloseTo(1, 1)
        expect(curve[256]).toBeCloseTo(-0.5, 1)
        expect(curve[768]).toBeCloseTo(0.5, 1)
    })

    it('returns different curves for different types', () => {
        const soft = computeSaturationCurve('soft', 0.5)
        const hard = computeSaturationCurve('hard', 0.5)
        const tape = computeSaturationCurve('tape', 0.5)

        expect(soft).not.toEqual(hard)
        expect(hard).not.toEqual(tape)
        expect(soft).not.toEqual(tape)
    })

    it('hard clipping saturates at ±1', () => {
        const curve = computeSaturationCurve('hard', 1)
        const maxVal = Math.max(...curve)
        const minVal = Math.min(...curve)
        expect(maxVal).toBe(1)
        expect(minVal).toBe(-1)
    })

    it('soft clipping uses tanh', () => {
        const curve = computeSaturationCurve('soft', 0.5)
        expect(curve[1023]).toBeCloseTo(1, 3)
    })

    it('tape clipping uses atan', () => {
        const curve = computeSaturationCurve('tape', 0.5)
        expect(curve[1023]).toBeCloseTo(1, 3)
    })
})

describe('audioMath - computeImpulseSampleData', () => {
    it('returns correct length', () => {
        const preset = REVERB_PRESETS.room
        const data = computeImpulseSampleData(44100, preset)
        expect(data.length).toBe(Math.floor(44100 * 0.8))
    })

    it('returns length 1 for none preset (Math.max guard)', () => {
        const data = computeImpulseSampleData(44100, REVERB_PRESETS.none)
        expect(data.length).toBe(1)
    })
})

describe('audioMath - computeDriveGain', () => {
    it('returns 1 for amount 0', () => {
        expect(computeDriveGain(0)).toBe(1)
    })

    it('returns 7 for amount 1', () => {
        expect(computeDriveGain(1)).toBe(7)
    })

    it('scales linearly', () => {
        expect(computeDriveGain(0.5)).toBe(4)
    })
})

describe('audioMath - computeOutputGain', () => {
    it('returns 1 for amount 0', () => {
        expect(computeOutputGain(0)).toBe(1)
    })

    it('returns 0.85 for amount 1', () => {
        expect(computeOutputGain(1)).toBe(0.85)
    })
})

describe('audioMath - computeDelaySettings', () => {
    it('returns tape settings by default', () => {
        const settings = computeDelaySettings('tape')
        expect(settings.feedback).toBe(0.4)
        expect(settings.filterFreq).toBe(2000)
    })

    it('returns slap settings', () => {
        const settings = computeDelaySettings('slap')
        expect(settings.feedback).toBe(0.2)
        expect(settings.filterFreq).toBe(8000)
    })

    it('returns pingpong settings', () => {
        const settings = computeDelaySettings('pingpong')
        expect(settings.feedback).toBe(0.35)
        expect(settings.filterFreq).toBe(5000)
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

describe('audioMath - computePeakFilterFreq', () => {
    it('returns base freq when envelope is 0', () => {
        expect(computePeakFilterFreq(1000, 0)).toBe(1000)
    })

    it('returns max freq when envelope is 1', () => {
        expect(computePeakFilterFreq(1000, 1)).toBe(20000)
    })

    it('interpolates for partial envelope', () => {
        expect(computePeakFilterFreq(1000, 0.5)).toBe(10500)
    })
})

describe('audioMath - computeAdsrEnvelopeParams', () => {
    it('computes correct params', () => {
        const env = { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 }
        const params = computeAdsrEnvelopeParams(env, 0.8, 1, 1)
        expect(params.attackTime).toBe(0.01)
        expect(params.decayTime).toBe(0.1)
        expect(params.sustainLevel).toBe(0.7)
        expect(params.releaseTime).toBe(0.2)
        expect(params.peakGain).toBeCloseTo(0.8, 5)
    })

    it('applies accent multiplier to peak gain', () => {
        const env = { attack: 0, decay: 0, sustain: 1, release: 0 }
        const params = computeAdsrEnvelopeParams(env, 0.8, 1, 1.25)
        expect(params.peakGain).toBeCloseTo(1, 5)
    })

    it('uses defaults for missing env values', () => {
        const env = {}
        const params = computeAdsrEnvelopeParams(env, 0.8)
        expect(params.attackTime).toBe(0)
        expect(params.decayTime).toBe(0)
        expect(params.sustainLevel).toBe(1)
        expect(params.releaseTime).toBe(0)
    })
})

describe('audioMath - computeTrackPan', () => {
    it('returns pan from index map', () => {
        expect(computeTrackPan(0)).toBe(0)
        expect(computeTrackPan(1)).toBe(0.3)
        expect(computeTrackPan(2)).toBe(0.5)
        expect(computeTrackPan(3)).toBe(-0.4)
        expect(computeTrackPan(4)).toBe(0.4)
        expect(computeTrackPan(5)).toBe(-0.3)
        expect(computeTrackPan(6)).toBe(-0.2)
        expect(computeTrackPan(7)).toBe(1)
    })

    it('defaults to 0 for index >= 8', () => {
        expect(computeTrackPan(8)).toBe(0)
        expect(computeTrackPan(99)).toBe(0)
    })
})

describe('audioMath - constants', () => {
    it('SATURATION_TYPES is frozen array', () => {
        expect(SATURATION_TYPES).toEqual(['soft', 'hard', 'tape'])
        expect(Object.isFrozen(SATURATION_TYPES)).toBe(true)
    })

    it('REVERB_PRESETS has expected keys', () => {
        expect(Object.keys(REVERB_PRESETS)).toEqual(['none', 'room', 'hall', 'plate', 'spring', 'gated'])
    })
})
