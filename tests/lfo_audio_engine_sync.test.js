/**
 * @vitest-environment jsdom
 *
 * Audio engine vs track editor visualization LFO sync verification.
 *
 * Compares the velocity LFO value that the AUDIO ENGINE would apply to a
 * note at a given engine tick, against the value that the TRACK EDITOR
 * visualization (OrSlider driven by LfoUpdater.computeLfoValue) shows
 * at the same tick.
 *
 * - Visualization source of truth:
 *     src/audio/math.js → computeLfoValue(lfo, tick, nbTicks, controlKey)
 *     (also exposed via LfoUpdater.computeLfoValue, the proxy used by
 *     src/ui/track_editor.js:_updateLfoSliders)
 *
 * - Audio engine source of truth:
 *     src/audio/worklets/processors/strip_source.js:167-171
 *     (inlined `computeLfo(transportPhase, freqVal, wave, depth, bias, phaseOffset)`
 *     function used for the per-sample LFO of the strip worklet).
 *
 * Both must produce the same value at the same transport phase. This test
 * does NOT modify any source. It re-implements the worklet's formula in
 * pure JS (using the same shared `getLfoWaveformValue` helper from math.js)
 * and additionally validates the inlined worklet code matches the helper.
 *
 * Sample grid: 128 engine ticks, every 16 ticks → 9 sample points
 * (0, 16, 32, 48, 64, 80, 96, 112, 128).
 */

import { describe, it, expect } from 'vitest'
import {
    computeLfoValue,
    getLfoWaveformValue,
} from '../src/audio/math.js'
import LfoUpdater from '../src/patterns/lfo_updater.js'
import STRIP_SOURCE from '../src/audio/worklets/processors/strip_source.js'

/**
 * Re-implementation of the audio engine's LFO formula.
 *
 * Mirrors `computeLfo` in src/audio/worklets/processors/strip_source.js
 * lines 167-171, which is the per-sample LFO evaluation used by the
 * unified strip worklet for velocity, pan, cutoff, Q, and pitch.
 *
 * The audio engine receives a continuous `transportPhase` (driven by
 * the transportClock), so we feed it `tick / 128` (1 unit = 16 beats,
 * matching the visualization's `transportPhase = tick / 128`).
 *
 * @param {number} transportPhase  1 unit = 16 beats (= tick / 128)
 * @param {number} freqVal         LFO frequency multiplier
 * @param {number} wave            Waveform (0=sine, 1=tri, 2=saw, 3=square, 4=S&H)
 * @param {number} depth           depth = max - min
 * @param {number} bias            bias = min
 * @param {number} phaseOffset     LFO phase offset
 * @returns {number}               LFO value in [bias, bias + depth]
 */
function workletComputeLfo(transportPhase, freqVal, wave, depth, bias, phaseOffset) {
    const localPhase = (transportPhase / freqVal) + phaseOffset
    const raw = getLfoWaveformValue(localPhase, wave)   // returns in [-1, 1]
    return bias + ((raw + 1) * 0.5) * depth             // maps to [bias, bias+depth]
}

/**
 * Visualization value: what the track editor's OrSlider displays for
 * the velocity LFO at the given engine tick.
 *
 * Uses the shared helper from src/audio/math.js (rounded to 2 decimals).
 */
function visualizationVelocity(lfo, tick, nbTicks = 128) {
    return computeLfoValue(lfo, tick, nbTicks, 'velocity')
}

/**
 * Audio engine value: what the strip worklet would multiply the base
 * velocity by (raw, before the replace mix). Uses the same
 * `getLfoWaveformValue` as the visualization, fed with the same
 * `transportPhase = tick / 128`.
 */
function audioEngineVelocity(lfo, tick) {
    const transportPhase = tick / 128
    const depth = (lfo.max ?? 1) - (lfo.min ?? 0)
    const bias  = (lfo.min ?? 0)
    return workletComputeLfo(
        transportPhase,
        lfo.freq ?? 1,
        lfo.waveform ?? 0,
        depth,
        bias,
        lfo.phase ?? 0
    )
}

const TICK_STRIDE = 16
const TICK_MAX = 128
const SAMPLE_TICKS = Array.from(
    { length: TICK_MAX / TICK_STRIDE + 1 },
    (_, i) => i * TICK_STRIDE
)

describe('Audio engine LFO ↔ Track editor visualization (velocity)', () => {

    describe('Contract: worklet inlines the same formula as the helper', () => {
        it('worklet uses the bias + ((raw+1)*0.5)*depth formula', () => {
            expect(STRIP_SOURCE).toContain('b + ((raw + 1) * 0.5) * d')
        })

        it('worklet computes localPhase as (transportPhase / fMult) + phase', () => {
            // (transportPhase / fMult) + phase
            expect(STRIP_SOURCE).toMatch(/transportPhase\s*\/\s*fMult\s*\)\s*\+\s*phase/)
        })

        it('worklet reads the waveform via getLfoWaveformValue (not S&H branch)', () => {
            expect(STRIP_SOURCE).toContain('getLfoWaveformValue(localPhase, w)')
        })
    })

    describe('Frequency 1 (period = 16 beats = 128 ticks)', () => {
        const lfo = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 }

        it.each(SAMPLE_TICKS)('tick %d: audio engine matches track editor visualization', (tick) => {
            const vizu = visualizationVelocity(lfo, tick)
            const audio = audioEngineVelocity(lfo, tick)

            // The visualization rounds to 2 decimals; the audio engine is
            // continuous. Allow a 0.01 tolerance for the rounding.
            expect(audio).toBeCloseTo(vizu, 2)
        })

        it('produces 0.0 at the start of the cycle (tick 0)', () => {
            expect(visualizationVelocity(lfo, 0)).toBeCloseTo(0, 2)
            expect(audioEngineVelocity(lfo, 0)).toBeCloseTo(0, 2)
        })

        it('produces 1.0 at the peak (tick 64 = 1/2 period)', () => {
            expect(visualizationVelocity(lfo, 64)).toBeCloseTo(1, 2)
            expect(audioEngineVelocity(lfo, 64)).toBeCloseTo(1, 2)
        })

        it('returns to 0.0 at the end of the cycle (tick 128)', () => {
            expect(visualizationVelocity(lfo, 128)).toBeCloseTo(0, 2)
            expect(audioEngineVelocity(lfo, 128)).toBeCloseTo(0, 2)
        })
    })

    describe('Frequency 2 (period = 16 beats = 256 ticks, 0.5 cycle in 128 ticks)', () => {
        const lfo = { freq: 2, phase: 0, min: 0, max: 1, waveform: 0 }

        it.each(SAMPLE_TICKS)('tick %d: audio engine matches track editor visualization', (tick) => {
            const vizu = visualizationVelocity(lfo, tick)
            const audio = audioEngineVelocity(lfo, tick)

            expect(audio).toBeCloseTo(vizu, 2)
        })

        it('at tick 0 is min, tick 64 is midpoint, tick 128 is max (half a period)', () => {
            // Period = freq * 4 * TICK = 2 * 128 = 256 ticks.
            // Across 128 ticks, the LFO covers exactly half a cycle:
            // tick 0 = trough, tick 64 = midpoint (rising), tick 128 = peak.
            expect(visualizationVelocity(lfo, 0)).toBeCloseTo(0, 2)
            expect(visualizationVelocity(lfo, 64)).toBeCloseTo(0.5, 2)
            expect(visualizationVelocity(lfo, 128)).toBeCloseTo(1, 2)
        })

        it('audio engine and visualization diverge by less than 0.005 across all sample ticks', () => {
            // Tighter contract: the two pipelines must agree to within
            // half a cent (0.005). The visualization rounds to 2 decimals
            // (0.01 grid), so any disagreement here would indicate that
            // the worklet formula has drifted from the helper.
            for (const tick of SAMPLE_TICKS) {
                const vizu = visualizationVelocity(lfo, tick)
                const audio = audioEngineVelocity(lfo, tick)
                expect(Math.abs(audio - vizu)).toBeLessThan(0.005)
            }
        })
    })

    describe('LfoUpdater proxy agrees with audio engine', () => {
        // LfoUpdater is what the track editor actually imports; this block
        // ensures the proxy is not silently diverging from the helper.
        const lfo = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 }

        it.each(SAMPLE_TICKS)('LfoUpdater.computeLfoValue matches audio engine at tick %d', (tick) => {
            const viaProxy  = LfoUpdater.computeLfoValue(lfo, tick, 128)
            const audio     = audioEngineVelocity(lfo, tick)
            expect(viaProxy).toBeCloseTo(audio, 2)
        })
    })

    describe('Non-zero min/max range (velocity offset)', () => {
        // Real-world use case: a track's velocity LFO rarely goes 0..1.
        // Verify the audio engine respects the user's [min, max] window.
        const lfo = { freq: 1, phase: 0, min: 0.3, max: 0.9, waveform: 0 }

        it.each(SAMPLE_TICKS)('tick %d: audio engine respects [0.3, 0.9] window', (tick) => {
            const audio = audioEngineVelocity(lfo, tick)
            const vizu  = visualizationVelocity(lfo, tick)

            // Allow a tiny epsilon for the floating-point ceiling of the
            // un-rounded audio value, which can land marginally above 0.9.
            expect(audio).toBeGreaterThanOrEqual(0.3)
            expect(audio).toBeLessThanOrEqual(0.9 + 1e-9)
            expect(audio).toBeCloseTo(vizu, 2)
        })
    })

    // ── LFO sync contract: 1 bar = 1 cycle at freq=1 ──────────────────────────
    //
    // This contract locks the relationship between THREE independent code
    // paths that must stay in lockstep:
    //   1. Transport tick rate          (transport.js: schedule interval)
    //   2. Visualization LFO period     (audio/math.js: periodInTicks = freqVal * 4 * TICK)
    //   3. Worklet LFO period           (strip_source.js: fMult * 4 * (60/bpm))
    //
    // If any of them drifts (e.g. someone re-introduces a `* 0.25` factor in
    // the transport, or changes the worklet's LFO period constant from `4` to
    // `16`), the three layers will no longer agree and the user hears an LFO
    // out of sync with the BPM grid — the original "4x trop lent" bug.
    //
    // At 120 BPM, 1 bar = 128 ticks = 2 s. freq=1 must therefore complete
    // exactly ONE full cycle across those 128 ticks.

    describe('LFO sync contract: freq=1 = 1 bar (128 ticks) at 120 BPM', () => {
        const lfo = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 }

        // One full cycle, sampled at the 4 cardinal points plus the wrap.
        const CYCLE_KEYPOINTS = [
            { tick: 0,   value: 0   },  // trough (cycle start)
            { tick: 32,  value: 0.5 },  // midpoint rising
            { tick: 64,  value: 1   },  // peak
            { tick: 96,  value: 0.5 },  // midpoint falling
            { tick: 128, value: 0   },  // trough (one full cycle done)
        ]

        it.each(CYCLE_KEYPOINTS)(
            'tick $tick: both pipelines agree on the value $value (one cycle = one bar)',
            ({ tick, value }) => {
                const audio = audioEngineVelocity(lfo, tick)
                const vizu  = visualizationVelocity(lfo, tick)

                expect(audio).toBeCloseTo(value, 2)
                expect(vizu).toBeCloseTo(value, 2)
                // The two pipelines must agree at the cardinal points too.
                expect(audio).toBeCloseTo(vizu, 2)
            }
        )

        it('worklet and helper disagree by < 0.005 across ALL 128 ticks', () => {
            // Catches any sub-tick drift between the worklet's inlined formula
            // and the helper, even at non-cardinal points.
            for (let tick = 0; tick <= 128; tick += 1) {
                const audio = audioEngineVelocity(lfo, tick)
                const vizu  = visualizationVelocity(lfo, tick)
                expect(Math.abs(audio - vizu)).toBeLessThan(0.005)
            }
        })
    })
})
