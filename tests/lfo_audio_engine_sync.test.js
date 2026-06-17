/**
 * @vitest-environment jsdom
 *
 * LFO computation correctness tests.
 *
 * LFO values are computed in JS via computeLfoValue() — this is the single
 * source of truth used by both the track editor display and the per-step
 * engine push. There is no longer any worklet-side LFO computation.
 *
 * Sample grid: 128 engine ticks, every 16 ticks → 9 sample points
 * (0, 16, 32, 48, 64, 80, 96, 112, 128).
 */

import { describe, it, expect } from 'vitest'
import { computeLfoValue } from '../src/audio/math.js'

const TICK_STRIDE = 16
const TICK_MAX = 128
const SAMPLE_TICKS = Array.from(
    { length: TICK_MAX / TICK_STRIDE + 1 },
    (_, i) => i * TICK_STRIDE
)

describe('computeLfoValue (single source of truth)', () => {

    describe('Frequency 1 (period = 16 beats = 128 ticks = 4 bars)', () => {
        const lfo = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 }

        it('produces 0.0 at the start of the cycle (tick 0)', () => {
            expect(computeLfoValue(lfo, 0, 128, 'velocity')).toBeCloseTo(0, 2)
        })

        it('produces 1.0 at the peak (tick 64 = 1/2 period)', () => {
            expect(computeLfoValue(lfo, 64, 128, 'velocity')).toBeCloseTo(1, 2)
        })

        it('returns to 0.0 at the end of the cycle (tick 128)', () => {
            expect(computeLfoValue(lfo, 128, 128, 'velocity')).toBeCloseTo(0, 2)
        })
    })

    describe('Frequency 2 (2 cycles in 128 ticks = 4 bars)', () => {
        const lfo = { freq: 2, phase: 0, min: 0, max: 1, waveform: 0 }

        it('at tick 0 is min, tick 32 is peak, tick 64 is min (full cycle in 64 ticks)', () => {
            expect(computeLfoValue(lfo, 0, 128, 'velocity')).toBeCloseTo(0, 2)
            expect(computeLfoValue(lfo, 32, 128, 'velocity')).toBeCloseTo(1, 2)
            expect(computeLfoValue(lfo, 64, 128, 'velocity')).toBeCloseTo(0, 2)
        })
    })

    describe('Non-zero min/max range (velocity offset)', () => {
        const lfo = { freq: 1, phase: 0, min: 0.3, max: 0.9, waveform: 0 }

        it.each(SAMPLE_TICKS)('tick %d: respects [0.3, 0.9] window', (tick) => {
            const val = computeLfoValue(lfo, tick, 128, 'velocity')
            expect(val).toBeGreaterThanOrEqual(0.3)
            expect(val).toBeLessThanOrEqual(0.9 + 1e-9)
        })
    })

    describe('LFO sync contract: freq=1 = 4 bars (128 ticks) at 120 BPM', () => {
        const lfo = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 }

        const CYCLE_KEYPOINTS = [
            { tick: 0,   value: 0   },
            { tick: 32,  value: 0.5 },
            { tick: 64,  value: 1   },
            { tick: 96,  value: 0.5 },
            { tick: 128, value: 0   },
        ]

        it.each(CYCLE_KEYPOINTS)(
            'tick $tick: computeLfoValue returns $value',
            ({ tick, value }) => {
                expect(computeLfoValue(lfo, tick, 128, 'velocity')).toBeCloseTo(value, 2)
            }
        )
    })
})
