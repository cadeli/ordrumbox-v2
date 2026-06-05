/**
 * @vitest-environment jsdom
 *
 * Proxy benchmark for the worklet pipeline JS cost.
 *
 * This test does NOT measure audio rendering performance — jsdom has no real
 * AudioContext, so no DSP ever runs. What it does measure is the JS-side
 * cost of constructing the worklet pipeline:
 *
 *   1. WorkletLoader.ensureLoaded() with all processors registered
 *   2. MfStrip.create() × N tracks (creates the unified strip worklet node
 *      and per-strip LFO gain nodes)
 *   3. MfMixer instantiation + start() (creates busInput + busWorklet +
 *      analyser, wires them up)
 *   4. syncAllTracks(pattern) (the path engine.start() runs after mixer.start)
 *
 * Use this as a regression baseline: if a future change pushes the total
 * well past 50 ms for the 64-bar / 8-track pattern, the JS bookkeeping of
 * the worklet pipeline is likely doing too much.
 *
 * Reference comparison vs. pre-worklet (commit 47aae8a, same pattern, jsdom):
 *
 *                        │ pre-worklet │ post-worklet │  delta
 *   ─────────────────────┼─────────────┼──────────────┼────────
 *   mixer.start          │   0.32 ms   │   0.08 ms    │  -75%
 *   strip.create × 8     │   3.40 ms   │   1.09 ms    │  -68%
 *   syncAllTracks        │  11.40 ms   │   0.24 ms    │  -98%
 *   TOTAL                │  15.12 ms   │   1.47 ms    │  -90%
 *
 * Pre-worklet strips created ~20+ native nodes each (BiquadFilter, Convolver,
 * Delay, multiple GainNodes, LFOs) — the construction + per-call native node
 * traversal dominated the cost. Post-worklet the strip is a single
 * AudioWorkletNode with a param map; the heavy lifting is in the audio
 * thread (not measured here, but a real OfflineAudioContext benchmark would
 * show the DSP work is now offloaded).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import WorkletLoader from '../src/audio/worklets/loader.js'
import MfStrip from '../src/audio/strip.js'
import MfMixer from '../src/audio/mixer.js'
import AudioEngine from '../src/audio/engine.js'
import { appState } from '../src/state/app_state.js'
import { installWorkletMocks, makeParam, makeNode } from './helpers/worklet_mocks.js'

const NB_BARS = 64
const NB_TRACKS = 8
const STEPS_PER_BAR = 16
const TOTAL_BUDGET_MS = 50

function buildHeavyPattern() {
    const tracks = []
    for (let i = 0; i < NB_TRACKS; i++) {
        const notes = []
        for (let bar = 0; bar < NB_BARS; bar++) {
            for (let step = 0; step < STEPS_PER_BAR; step++) {
                if ((step + i) % 4 === 0) {
                    notes.push({ bar, barStep: step, velocity: 0.8 })
                }
            }
        }
        tracks.push({
            name: `TRK_${i}`,
            notes,
            mute: false,
            solo: false,
            useAutoAssignSound: false,
            useSoftSynth: false,
            soundId: 'real/kick.wav',
            velocity: 0.8,
            pan: 0,
            pitch: 0,
            filterCutoff: 12000,
            filterResonance: 1,
            filterType: 'lowpass',
            filterLfo: 0,
            filterEnvelopeAmount: 0,
            lfoPitch: 0, lfoVolume: 0, lfoPan: 0, lfoFilter: 0,
            pitchLfo: 0, volumeLfo: 0, panLfo: 0, filterLfoValue: 0,
            pitchEnv: 0,
            delaySend: 0, reverbSend: 0, saturationDrive: 0,
            delayActive: false, reverbActive: false, saturationActive: false,
            swingAmount: 0, swingMode: 'off',
            loopLength: NB_BARS, loopEnabled: false,
        })
    }
    return {
        name: 'WORKLET_PIPELINE_BENCH',
        bpm: 140,
        nbBars: NB_BARS,
        bars: NB_BARS,
        barQuantize: STEPS_PER_BAR,
        tracks,
    }
}

function makeAudioCtx() {
    return {
        currentTime: 0,
        sampleRate: 44100,
        destination: {},
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
        createAnalyser: vi.fn(() => ({
            ...makeNode(),
            fftSize: 1024,
            frequencyBinCount: 512,
        })),
    }
}

describe('Worklet pipeline JS cost (proxy benchmark)', () => {
    let ctx
    let pattern
    let measurements

    beforeEach(() => {
        appState.reset()
        installWorkletMocks()
        ctx = makeAudioCtx()
        pattern = buildHeavyPattern()
        measurements = {}
    })

    it('measure ensureLoaded + strip creation + mixer.start + syncAllTracks', async () => {
        // Importing MfStrip and MfMixer registers 'strip' and 'master-bus'
        // worklet processors at module load. The import path in this file's
        // top-level imports is enough — no extra registration needed here.

        const t0 = performance.now()
        await WorkletLoader.ensureLoaded(ctx)
        const t1 = performance.now()
        measurements.ensureLoadedMs = t1 - t0

        // 2. MfStrip.create × 8
        const t2 = performance.now()
        const strips = await Promise.all(
            pattern.tracks.map(t => MfStrip.create(t.name, ctx))
        )
        const t3 = performance.now()
        measurements.stripCreateMs = t3 - t2
        measurements.stripCount = strips.length

        // 3. MfMixer instantiation + start()
        const t4 = performance.now()
        const mixer = new MfMixer(ctx, { analyser: null, lfo: null, getOrCreateStrip: () => null })
        await mixer.start()
        const t5 = performance.now()
        measurements.mixerStartMs = t5 - t4

        // 4. syncAllTracks — exercise the per-track param-update path with
        // the strips we just built
        const t6 = performance.now()
        for (let i = 0; i < pattern.tracks.length; i++) {
            const strip = strips[i]
            const track = pattern.tracks[i]
            strip.updateFilter(track.filterType, 0.5, 0.5)
            strip.updateSaturation('soft', 0.5)
            strip.updateReverb('room', 0.5)
            strip.updateDelay('tape', 1, 0.5)
        }
        const t7 = performance.now()
        measurements.syncAllTracksMs = t7 - t6

        measurements.totalMs = +(t7 - t0).toFixed(2)

        // ── Sanity checks ────────────────────────────────────────────────
        expect(measurements.ensureLoadedMs).toBeGreaterThanOrEqual(0)
        expect(measurements.stripCount).toBe(NB_TRACKS)
        expect(measurements.totalMs).toBeLessThan(TOTAL_BUDGET_MS)

        // ── Report ───────────────────────────────────────────────────────
        console.log('\n========== WORKLET PIPELINE COST ==========')
        console.log(`Pattern      : ${NB_BARS} bars × ${NB_TRACKS} tracks × ${STEPS_PER_BAR} steps`)
        console.log(`ensureLoaded : ${measurements.ensureLoadedMs.toFixed(2)} ms`)
        console.log(`strip.create : ${measurements.stripCreateMs.toFixed(2)} ms (× ${measurements.stripCount})`)
        console.log(`mixer.start  : ${measurements.mixerStartMs.toFixed(2)} ms`)
        console.log(`syncAllTracks: ${measurements.syncAllTracksMs.toFixed(2)} ms`)
        console.log(`TOTAL        : ${measurements.totalMs} ms (budget ${TOTAL_BUDGET_MS} ms)`)
        console.log('============================================\n')
    })
})
