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

        it('worklet computes localPhase as (transportPhase / fMult) + phaseOffset', () => {
            // (transportPhase / fMult) + phaseOffset
            expect(STRIP_SOURCE).toMatch(/transportPhase\s*\/\s*fMult\s*\)\s*\+\s*phaseOffset/)
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

    describe('Frequency 2 (period = 8 beats = 64 ticks, 2 cycles in 128 ticks)', () => {
        const lfo = { freq: 2, phase: 0, min: 0, max: 1, waveform: 0 }

        it.each(SAMPLE_TICKS)('tick %d: audio engine matches track editor visualization', (tick) => {
            const vizu = visualizationVelocity(lfo, tick)
            const audio = audioEngineVelocity(lfo, tick)

            expect(audio).toBeCloseTo(vizu, 2)
        })

        it('completes exactly 2 full cycles across 128 ticks', () => {
            // At tick 0, 64, 128 the waveform crosses 0 (going up / down / up).
            // At tick 32, 96 the waveform hits the peaks (1, 1).
            expect(visualizationVelocity(lfo, 0)).toBeCloseTo(0, 2)
            expect(visualizationVelocity(lfo, 32)).toBeCloseTo(1, 2)
            expect(visualizationVelocity(lfo, 64)).toBeCloseTo(0, 2)
            expect(visualizationVelocity(lfo, 96)).toBeCloseTo(1, 2)
            expect(visualizationVelocity(lfo, 128)).toBeCloseTo(0, 2)
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

            expect(audio).toBeGreaterThanOrEqual(0.3)
            expect(audio).toBeLessThanOrEqual(0.9)
            expect(audio).toBeCloseTo(vizu, 2)
        })
    })
})
