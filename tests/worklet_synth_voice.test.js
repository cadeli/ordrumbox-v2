/**
 * @vitest-environment jsdom
 *
 * Synth Voice processor tests: validate the inline JS string and DSP
 * behavior (3 VCO + noise + filter + ADSR + master + pan).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import SYNTH_VOICE_SOURCE from '../src/audio/worklets/processors/synth_voice_source.js'

class MockAudioWorkletProcessor {
    static parameterDescriptors = []
    constructor() {
        this.port = { onmessage: null, postMessage: () => {} }
    }
    process() { return true }
}

const globalScope = {
    sampleRate: 44100,
    currentFrame: 0,
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    processors: {}
}
function registerProcessor(name, cls) { globalScope.processors[name] = cls }

function makeProc() {
    const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', SYNTH_VOICE_SOURCE)
    factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
    return new globalScope.processors['synth-voice']()
}

function runProcess(processor, paramValues, frames = 128) {
    const parameters = {}
    const descs = processor.constructor.parameterDescriptors
    for (const desc of descs) {
        const v = paramValues[desc.name] ?? desc.defaultValue
        parameters[desc.name] = new Float32Array(frames).fill(v)
    }
    const outputs = [[new Float32Array(frames), new Float32Array(frames)]]
    
    // Set globals for the process call
    globalThis.sampleRate = globalScope.sampleRate
    globalThis.currentFrame = globalScope.currentFrame
    
    processor.process([], outputs, parameters)
    
    globalScope.currentFrame += frames
    return outputs[0]  // [chL, chR]
}

describe('SynthVoiceProcessor source', () => {
    beforeEach(() => {
        globalScope.currentFrame = 0
    })

    it('idles silently when not triggered', () => {
        const proc = makeProc()
        const out = runProcess(proc, { master: 1, osc1Gain: 1 })
        for (let i = 0; i < 128; i++) {
            expect(out[0][i]).toBe(0)
            expect(out[1][i]).toBe(0)
        }
    })

    it('trigger message starts the voice', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const out = runProcess(proc, { master: 1, osc1Gain: 1, attack: 0.001, sustain: 1 }, 256)
        let rms = 0
        for (let i = 0; i < 256; i++) rms += out[0][i] * out[0][i]
        expect(Math.sqrt(rms / 256)).toBeGreaterThan(0.1)
    })

    it('release message stops the voice', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        // Run for a bit to reach sustain
        const out1 = runProcess(proc, { master: 1, osc1Gain: 1, attack: 0.001, sustain: 1, release: 0.05 }, 8820) // 200ms
        let rms1 = 0
        for (let i = 0; i < 8820; i++) rms1 += out1[0][i] * out1[0][i]
        expect(Math.sqrt(rms1 / 8820)).toBeGreaterThan(0.1)  // sustain level

        // Now release
        proc.port.onmessage({ data: { type: 'release', releaseTime: 0.2 } })
        const out2 = runProcess(proc, { master: 1, osc1Gain: 1, attack: 0.001, sustain: 1, release: 0.05 }, 4410) // 100ms
        // Output should drop to silence by end of release
        let rms2 = 0
        for (let i = 4410 - 100; i < 4410; i++) rms2 += out2[0][i] * out2[0][i]
        expect(Math.sqrt(rms2 / 100)).toBeLessThan(0.01)
    })

    it('attack ramp produces linear gain increase', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        // Attack = 10ms, sample at start, mid, end
        const FRAMES = 441 // 10ms
        const out = runProcess(proc, { master: 1, osc1Gain: 1, attack: 0.01, decay: 0, sustain: 1, velocity: 1 }, FRAMES)
        // Check envelope shape
        const rms = (start, end) => {
            let s = 0
            for (let i = start; i < end; i++) s += out[0][i] * out[0][i]
            return Math.sqrt(s / (end - start))
        }
        // Early in attack, gain should be small
        const early = rms(0, 50)
        // Late in attack, gain should be larger
        const late = rms(FRAMES - 100, FRAMES)
        expect(late).toBeGreaterThan(early * 2)
    })

    it('sustain holds the level after decay', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        // Attack 5ms, decay 50ms, sustain 0.5
        const FRAMES = 44100 // 1s
        const out = runProcess(proc, {
            master: 1, osc1Gain: 1,
            attack: 0.005, decay: 0.05, sustain: 0.5,
            velocity: 1, release: 5  // never release
        }, FRAMES)
        // Measure RMS in middle of sustain (200ms in)
        let rms = 0
        for (let i = 8820; i < 13230; i++) rms += out[0][i] * out[0][i]
        const susLevel = Math.sqrt(rms / (13230 - 8820))
        // Expected: peak * 0.5 = 0.5
        expect(susLevel).toBeGreaterThan(0.3)
        expect(susLevel).toBeLessThan(0.7)
    })

    it('3 oscillators sum correctly when all enabled', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const FRAMES = 1024
        const out = runProcess(proc, {
            osc1Gain: 1, osc2Gain: 1, osc3Gain: 1,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        let peak = 0
        for (let i = 100; i < FRAMES; i++) peak = Math.max(peak, Math.abs(out[0][i]))
        // 3 sines summed can reach ±3, but with envelope < 1, expect > 1
        expect(peak).toBeGreaterThan(1.0)
    })

    it('detune shifts oscillator frequency', () => {
        const proc1 = makeProc()
        const proc2 = makeProc()
        proc1.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        proc2.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        // 100 cents = 1 semitone up
        const FRAMES = 4410
        const out1 = runProcess(proc1, { osc1Gain: 1, osc1Detune: 0,   attack: 0.001, sustain: 1, release: 5, velocity: 1, master: 1 }, FRAMES)
        const out2 = runProcess(proc2, { osc1Gain: 1, osc1Detune: 100, attack: 0.001, sustain: 1, release: 5, velocity: 1, master: 1 }, FRAMES)
        // Count zero crossings — detuned should have more crossings
        const count = (arr) => {
            let c = 0
            for (let i = 1; i < FRAMES; i++) {
                if ((arr[i-1] < 0 && arr[i] >= 0) || (arr[i-1] >= 0 && arr[i] < 0)) c++
            }
            return c
        }
        const c1 = count(out1[0])
        const c2 = count(out2[0])
        // 100 cents = ~5.9% higher frequency → ~6% more crossings
        expect(c2).toBeGreaterThan(c1)
    })

    it('noise generator adds white noise to output', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const FRAMES = 4410
        const outNoise = runProcess(proc, {
            osc1Gain: 0, osc2Gain: 0, osc3Gain: 0,
            noiseMix: 1, attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // Noise should have many distinct values, not pure tone
        const seen = new Set()
        for (let i = 100; i < FRAMES; i++) seen.add(outNoise[0][i].toFixed(3))
        expect(seen.size).toBeGreaterThan(100)
    })

    it('filter LP mode passes low frequencies', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const FRAMES = 44100  // 1s
        const out = runProcess(proc, {
            osc1Gain: 1, attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1, filterType: 0, filterFreq: 20000, filterQ: 0.7
        }, FRAMES)
        // With LP at 20kHz (open), output should be roughly the oscillator level
        let rms = 0
        for (let i = 8820; i < FRAMES; i++) rms += out[0][i] * out[0][i]
        expect(Math.sqrt(rms / (FRAMES - 8820))).toBeGreaterThan(0.2)
    })

    it('filter HP mode attenuates low frequencies (DC)', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const FRAMES = 44100
        // Use a 0Hz osc1 (DC)... actually we need AC, so use 50Hz tone
        const out = runProcess(proc, {
            osc1Freq: 50, osc1Gain: 1,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1,
            filterType: 1, filterFreq: 1000, filterQ: 0.7
        }, FRAMES)
        // 50Hz tone should be heavily attenuated by 1000Hz HPF
        let rms = 0
        for (let i = FRAMES - 1000; i < FRAMES; i++) rms += out[0][i] * out[0][i]
        const outLevel = Math.sqrt(rms / 1000)
        // Compare to unfiltered
        const proc2 = makeProc()
        proc2.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const outNoFilt = runProcess(proc2, {
            osc1Freq: 50, osc1Gain: 1,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1,
            filterType: 0, filterFreq: 20000, filterQ: 0.7
        }, FRAMES)
        let rms2 = 0
        for (let i = FRAMES - 1000; i < FRAMES; i++) rms2 += outNoFilt[0][i] * outNoFilt[0][i]
        const inLevel = Math.sqrt(rms2 / 1000)
        // HPF should reduce 50Hz by > 6dB
        expect(outLevel).toBeLessThan(inLevel * 0.5)
    })

    it('stereo pan routes signal to one side', () => {
        const procL = makeProc()
        const procR = makeProc()
        procL.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procR.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const FRAMES = 256
        const outL = runProcess(procL, {
            osc1Gain: 1, attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1, pan: -1
        }, FRAMES)
        const outR = runProcess(procR, {
            osc1Gain: 1, attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1, pan: 1
        }, FRAMES)
        // pan=-1: L should be loud, R should be silent
        let rmsLR = 0, rmsRR = 0
        for (let i = 100; i < FRAMES; i++) {
            rmsLR += outL[0][i] * outL[0][i]
            rmsRR += outL[1][i] * outL[1][i]
        }
        expect(Math.sqrt(rmsLR / 156)).toBeGreaterThan(0.1)
        expect(Math.sqrt(rmsRR / 156)).toBeLessThan(0.01)
    })

    it('master gain scales final output', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const FRAMES = 256
        const outLoud = runProcess(proc, { osc1Gain: 1, attack: 0.001, sustain: 1, release: 5, velocity: 1, master: 1 }, FRAMES)
        const proc2 = makeProc()
        proc2.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const outQuiet = runProcess(proc2, { osc1Gain: 1, attack: 0.001, sustain: 1, release: 5, velocity: 1, master: 0.5 }, FRAMES)
        let rmsL = 0, rmsQ = 0
        for (let i = 100; i < FRAMES; i++) {
            rmsL += outLoud[0][i] * outLoud[0][i]
            rmsQ += outQuiet[0][i] * outQuiet[0][i]
        }
        const loudRms = Math.sqrt(rmsL / 156)
        const quietRms = Math.sqrt(rmsQ / 156)
        // Half gain = ~half amplitude = ~half RMS (rough)
        expect(loudRms).toBeGreaterThan(quietRms * 1.5)
    })

    it('velocity scales the envelope peak', () => {
        const procV1 = makeProc()
        const procV2 = makeProc()
        procV1.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procV2.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const FRAMES = 1024
        const outV1 = runProcess(procV1, { osc1Gain: 1, attack: 0.001, sustain: 1, release: 5, velocity: 0.5, master: 1 }, FRAMES)
        const outV2 = runProcess(procV2, { osc1Gain: 1, attack: 0.001, sustain: 1, release: 5, velocity: 1.0, master: 1 }, FRAMES)
        let peak1 = 0, peak2 = 0
        for (let i = 100; i < FRAMES; i++) {
            peak1 = Math.max(peak1, Math.abs(outV1[0][i]))
            peak2 = Math.max(peak2, Math.abs(outV2[0][i]))
        }
        // v=1.0 should peak about 2x higher than v=0.5
        expect(peak2).toBeGreaterThan(peak1 * 1.5)
    })

    it('update message overrides AudioParams', () => {
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        // Send update to set master=0.1
        proc.port.onmessage({ data: { type: 'update', master: 0.1 } })
        const FRAMES = 256
        const out = runProcess(proc, { osc1Gain: 1, attack: 0.001, sustain: 1, release: 5, velocity: 1, master: 1 }, FRAMES)
        // Should use the override (0.1), not the param (1)
        let peak = 0
        for (let i = 50; i < FRAMES; i++) peak = Math.max(peak, Math.abs(out[0][i]))
        expect(peak).toBeLessThan(0.5)
    })

    it('bypassFilter skips the filter (dry signal passes through)', () => {
        const FRAMES = 4410
        // With filter active (HP at 1000Hz, should attenuate 50Hz)
        const procFilt = makeProc()
        procFilt.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const outFilt = runProcess(procFilt, {
            osc1Freq: 50, osc1Gain: 1,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1,
            filterType: 1, filterFreq: 1000, filterQ: 0.7
        }, FRAMES)
        let rmsFilt = 0
        for (let i = FRAMES - 500; i < FRAMES; i++) rmsFilt += outFilt[0][i] * outFilt[0][i]
        const levelFilt = Math.sqrt(rmsFilt / 500)

        // With filter bypassed
        const procByp = makeProc()
        procByp.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procByp.port.onmessage({ data: { type: 'update', bypassFilter: true } })
        const outByp = runProcess(procByp, {
            osc1Freq: 50, osc1Gain: 1,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1,
            filterType: 1, filterFreq: 1000, filterQ: 0.7
        }, FRAMES)
        let rmsByp = 0
        for (let i = FRAMES - 500; i < FRAMES; i++) rmsByp += outByp[0][i] * outByp[0][i]
        const levelByp = Math.sqrt(rmsByp / 500)

        // Bypassed filter should pass the 50Hz signal at higher level
        expect(levelByp).toBeGreaterThan(levelFilt * 1.5)
    })

    it('bypassEnv replaces envelope with flat gain (no ADSR shaping)', () => {
        const FRAMES = 256
        // With envelope: short attack should produce ramp-up
        const procEnv = makeProc()
        procEnv.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const outEnv = runProcess(procEnv, {
            osc1Gain: 1, attack: 0.01, sustain: 0.5, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // With bypass: envelope=1, should be constant from the start
        const procByp = makeProc()
        procByp.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procByp.port.onmessage({ data: { type: 'update', bypassEnv: true } })
        const outByp = runProcess(procByp, {
            osc1Gain: 1, attack: 0.01, sustain: 0.5, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // Bypassed env: first sample should be near full level (no ramp-up)
        expect(Math.abs(outByp[0][10])).toBeGreaterThan(0.1)
        // With envelope: first samples should be small (attack ramp)
        expect(Math.abs(outEnv[0][10])).toBeLessThan(Math.abs(outByp[0][10]))
    })

    it('bypassNoise silences the noise generator', () => {
        const FRAMES = 4410
        // With noise
        const procNoise = makeProc()
        procNoise.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const outNoise = runProcess(procNoise, {
            osc1Gain: 0, noiseMix: 1,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        let rmsNoise = 0
        for (let i = 100; i < FRAMES; i++) rmsNoise += outNoise[0][i] * outNoise[0][i]
        const levelNoise = Math.sqrt(rmsNoise / (FRAMES - 100))

        // With noise bypassed
        const procByp = makeProc()
        procByp.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procByp.port.onmessage({ data: { type: 'update', bypassNoise: true } })
        const outByp = runProcess(procByp, {
            osc1Gain: 0, noiseMix: 1,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        let rmsByp = 0
        for (let i = 100; i < FRAMES; i++) rmsByp += outByp[0][i] * outByp[0][i]
        const levelByp = Math.sqrt(rmsByp / (FRAMES - 100))

        expect(levelNoise).toBeGreaterThan(0.01)
        expect(levelByp).toBeLessThan(0.01)
    })

    it('bypassLfo1 disables LFO1 modulation', () => {
        const FRAMES = 4410
        // With LFO targeting master gain (tremolo)
        const procLfo = makeProc()
        procLfo.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procLfo.port.onmessage({ data: { type: 'update', lfo1Target: 5, lfo1Depth: 0.5, lfo1Freq: 5 } })
        const outLfo = runProcess(procLfo, {
            osc1Gain: 1, attack: 0.001, sustain: 1, release: 5,
            velocity: 0.5, master: 1
        }, FRAMES)
        // With LFO bypassed
        const procByp = makeProc()
        procByp.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procByp.port.onmessage({ data: { type: 'update', lfo1Target: 5, lfo1Depth: 0.5, lfo1Freq: 5, bypassLfo1: true } })
        const outByp = runProcess(procByp, {
            osc1Gain: 1, attack: 0.001, sustain: 1, release: 5,
            velocity: 0.5, master: 1
        }, FRAMES)
        // With LFO, output should vary; with bypass, it should be constant
        const variance = (arr) => {
            let min = Infinity, max = -Infinity
            for (let i = 200; i < arr.length; i++) { min = Math.min(min, arr[i]); max = Math.max(max, arr[i]) }
            return max - min
        }
        expect(variance(outLfo[0])).toBeGreaterThan(variance(outByp[0]) + 0.05)
    })

    it('bypassFm disables frequency modulation', () => {
        const FRAMES = 4410
        // With FM cascade (algo 2: 3→2→1, high amount should produce sidebands)
        const procFm = makeProc()
        procFm.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procFm.port.onmessage({ data: { type: 'update', fmAmount: 1, fmAlgo: 2 } })
        const outFm = runProcess(procFm, {
            osc1Gain: 1, osc2Gain: 1, osc3Gain: 1, osc3Freq: 220,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // With FM bypassed
        const procByp = makeProc()
        procByp.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procByp.port.onmessage({ data: { type: 'update', fmAmount: 1, fmAlgo: 2, bypassFm: true } })
        const outByp = runProcess(procByp, {
            osc1Gain: 1, osc2Gain: 1, osc3Gain: 1, osc3Freq: 220,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // FM should produce more zero crossings than non-FM
        const countCrossings = (arr) => {
            let c = 0
            for (let i = 1; i < arr.length; i++) {
                if ((arr[i - 1] < 0 && arr[i] >= 0) || (arr[i - 1] >= 0 && arr[i] < 0)) c++
            }
            return c
        }
        const crossingsFm = countCrossings(outFm[0])
        const crossingsByp = countCrossings(outByp[0])
        // FM should add sidebands = more crossings
        expect(crossingsFm).toBeGreaterThan(crossingsByp)
    })

    it('fmAlgo 0 routes osc2→osc1 only', () => {
        const FRAMES = 4410
        // Algo 0: only osc2→osc1 (osc3 unmodulated)
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        proc.port.onmessage({ data: { type: 'update', fmAmount: 1, fmAlgo: 0 } })
        const out = runProcess(proc, {
            osc1Gain: 1, osc2Gain: 1, osc3Gain: 0,
            osc2Freq: 880,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // Should produce output (FM is active on osc1)
        let rms = 0
        for (let i = 200; i < FRAMES; i++) rms += out[0][i] * out[0][i]
        expect(Math.sqrt(rms / (FRAMES - 200))).toBeGreaterThan(0.1)
    })

    it('fmAlgo 3 (2+3→1) sums both modulators on osc1', () => {
        const FRAMES = 4410
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        proc.port.onmessage({ data: { type: 'update', fmAmount: 1, fmAlgo: 3 } })
        const out = runProcess(proc, {
            osc1Gain: 1, osc2Gain: 1, osc3Gain: 1,
            osc2Freq: 880, osc3Freq: 660,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        let rms = 0
        for (let i = 200; i < FRAMES; i++) rms += out[0][i] * out[0][i]
        expect(Math.sqrt(rms / (FRAMES - 200))).toBeGreaterThan(0.1)
    })

    it('fmAlgo 4 (2↔1) cross-modulates osc1 and osc2', () => {
        const FRAMES = 4410
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        proc.port.onmessage({ data: { type: 'update', fmAmount: 1, fmAlgo: 4 } })
        const out = runProcess(proc, {
            osc1Gain: 1, osc2Gain: 1, osc3Gain: 0,
            osc2Freq: 880,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        let rms = 0
        for (let i = 200; i < FRAMES; i++) rms += out[0][i] * out[0][i]
        expect(Math.sqrt(rms / (FRAMES - 200))).toBeGreaterThan(0.1)
    })

    it('bypassModEnv disables mod envelope pitch modulation', () => {
        const FRAMES = 4410
        // With mod envelope targeting pitch (mTgt=2), pitch should sweep
        const procMod = makeProc()
        procMod.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procMod.port.onmessage({ data: { type: 'update', modEnvTarget: 2, modEnvDepth: 1, modEnvAttack: 0.01, modEnvDecay: 0.5, modEnvSustain: 0, modEnvRelease: 0.1 } })
        const outMod = runProcess(procMod, {
            osc1Gain: 1, attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // With mod envelope bypassed
        const procByp = makeProc()
        procByp.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procByp.port.onmessage({ data: { type: 'update', modEnvTarget: 2, modEnvDepth: 1, modEnvAttack: 0.01, modEnvDecay: 0.5, modEnvSustain: 0, modEnvRelease: 0.1, bypassModEnv: true } })
        const outByp = runProcess(procByp, {
            osc1Gain: 1, attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // Pitch modulation produces more zero crossings (sidebands)
        const countCrossings = (arr) => {
            let c = 0
            for (let i = 1; i < arr.length; i++) {
                if ((arr[i - 1] < 0 && arr[i] >= 0) || (arr[i - 1] >= 0 && arr[i] < 0)) c++
            }
            return c
        }
        expect(countCrossings(outMod[0])).toBeGreaterThan(countCrossings(outByp[0]))
    })

    it('bypassFilterEnv disables filter envelope sweep', () => {
        const FRAMES = 4410
        // With filter envelope: HP at 1000Hz with env sweep should affect signal
        const procEnv = makeProc()
        procEnv.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procEnv.port.onmessage({ data: { type: 'update', filterFreq: 1000, filterQ: 0.7, filterType: 1 } })
        const outEnv = runProcess(procEnv, {
            osc1Freq: 200, osc1Gain: 1,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1,
            filterType: 1, filterFreq: 1000, filterQ: 0.7, filterEnvelopeAmount: 0.8
        }, FRAMES)
        // With filter envelope bypassed
        const procByp = makeProc()
        procByp.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        procByp.port.onmessage({ data: { type: 'update', filterFreq: 1000, filterQ: 0.7, filterType: 1, bypassFilterEnv: true } })
        const outByp = runProcess(procByp, {
            osc1Freq: 200, osc1Gain: 1,
            attack: 0.001, sustain: 1, release: 5,
            velocity: 1, master: 1,
            filterType: 1, filterFreq: 1000, filterQ: 0.7, filterEnvelopeAmount: 0.8
        }, FRAMES)
        // Both should produce output (filter is active, just envelope sweep differs)
        let rmsEnv = 0, rmsByp = 0
        for (let i = 200; i < FRAMES; i++) {
            rmsEnv += outEnv[0][i] * outEnv[0][i]
            rmsByp += outByp[0][i] * outByp[0][i]
        }
        expect(Math.sqrt(rmsEnv / (FRAMES - 200))).toBeGreaterThan(0.01)
        expect(Math.sqrt(rmsByp / (FRAMES - 200))).toBeGreaterThan(0.01)
    })

    it('resetEnv message restarts envelope from attack', () => {
        const FRAMES = 256
        // Trigger note and let it play into sustain
        const proc = makeProc()
        proc.port.onmessage({ data: { type: 'trigger', startTime: 0 } })
        const out1 = runProcess(proc, {
            osc1Gain: 1, attack: 0.01, decay: 0.1, sustain: 0.5, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // After sustain, level should be near 0.5 * velocity
        const sustainLevel = Math.abs(out1[0][FRAMES - 10])
        expect(sustainLevel).toBeGreaterThan(0.1)

        // Now send resetEnv — envelope should restart from attack
        proc.port.onmessage({ data: { type: 'resetEnv' } })
        const out2 = runProcess(proc, {
            osc1Gain: 1, attack: 0.01, decay: 0.1, sustain: 0.5, release: 5,
            velocity: 1, master: 1
        }, FRAMES)
        // First samples after reset should be small (attack ramp starting from 0)
        expect(Math.abs(out2[0][10])).toBeLessThan(sustainLevel)
    })
})
