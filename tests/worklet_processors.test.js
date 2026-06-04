/**
 * @vitest-environment jsdom
 *
 * Processor source tests: validate the inline JS strings that get loaded
 * into AudioWorkletGlobalScope. We don't actually run a worklet (jsdom
 * has no AudioContext), but we can:
 *   1. Parse the source to confirm it has `registerProcessor` calls
 *   2. Extract the class source and validate it has the expected shape
 *   3. Mock-implement AudioWorkletProcessor and run the DSP math directly
 */
import { describe, it, expect } from 'vitest'
import SATURATION_SOURCE from '../src/audio/worklets/processors/saturation_source.js'
import FILTER_SOURCE from '../src/audio/worklets/processors/filter_source.js'
import REVERB_SOURCE from '../src/audio/worklets/processors/reverb_source.js'

// ---- shared mock AudioWorkletGlobalScope helpers ----

class MockAudioWorkletProcessor {
    static parameterDescriptors = []
    constructor() {}
    process() { return true }
}

const globalScope = {
    sampleRate: 44100,
    currentTime: 0,
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    processors: {}
}

function registerProcessor(name, cls) {
    globalScope.processors[name] = cls
}

function instantiate(name, params = {}) {
    const Cls = globalScope.processors[name]
    if (!Cls) throw new Error(`No processor: ${name}`)
    return new Cls(params)
}

function runProcess(processor, inputs, paramValues, frames = 128) {
    // Build param-value arrays
    const parameters = {}
    const descs = processor.constructor.parameterDescriptors
    for (const desc of descs) {
        const v = paramValues[desc.name] ?? desc.defaultValue
        parameters[desc.name] = new Float32Array(frames).fill(v)
    }
    // Real AudioWorklet shape:
    //   inputs[N]  = array of channels
    //   outputs[N] = array of channels
    const normalizedInputs = inputs.map(ch => {
        if (Array.isArray(ch)) return ch
        return [ch]
    })
    const outputs = [[new Float32Array(frames), new Float32Array(frames)]]
    processor.process(normalizedInputs, outputs, parameters)
    return outputs[0]  // return the channel array, [ch1, ch2]
}

// ===========================================================
// Saturation processor
// ===========================================================
describe('SaturationProcessor source', () => {
    it('exports a non-empty string', () => {
        expect(typeof SATURATION_SOURCE).toBe('string')
        expect(SATURATION_SOURCE.length).toBeGreaterThan(100)
    })

    it('contains registerProcessor call for saturation', () => {
        expect(SATURATION_SOURCE).toContain("registerProcessor('saturation'")
    })

    it('declares 4 AudioParams: drive, mix, output, type', () => {
        expect(SATURATION_SOURCE).toContain("name: 'drive'")
        expect(SATURATION_SOURCE).toContain("name: 'mix'")
        expect(SATURATION_SOURCE).toContain("name: 'output'")
        expect(SATURATION_SOURCE).toContain("name: 'type'")
    })

    it('implements tanh (soft), clip (hard), atan (tape) shaping', () => {
        expect(SATURATION_SOURCE).toContain('Math.tanh')
        expect(SATURATION_SOURCE).toContain('Math.atan')
        expect(SATURATION_SOURCE).toContain('return 1;')
        expect(SATURATION_SOURCE).toContain('return -1;')
    })

    it('produces output close to input at drive=1, mix=1, output=1 (soft)', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', SATURATION_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('saturation')
        const input = new Float32Array(128)
        for (let i = 0; i < 128; i++) input[i] = Math.sin(i * 0.05) * 0.5
        const out = runProcess(proc, [input], { drive: 1, mix: 1, output: 1, type: 0 })
        // soft saturation at low amplitude should pass nearly through
        expect(out[0].length).toBe(128)
        for (let i = 0; i < 128; i++) {
            expect(Math.abs(out[0][i] - Math.tanh(input[i]))).toBeLessThan(0.001)
        }
    })

    it('soft saturation compresses high amplitudes (no overshoot above 1)', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', SATURATION_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('saturation')
        const input = new Float32Array(128)
        for (let i = 0; i < 128; i++) input[i] = 5.0  // very hot
        const out = runProcess(proc, [input], { drive: 1, mix: 1, output: 1, type: 0 })
        for (let i = 0; i < 128; i++) {
            expect(Math.abs(out[0][i])).toBeLessThanOrEqual(1.0 + 0.0001)
        }
    })

    it('hard saturation clips to ±1', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', SATURATION_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('saturation')
        const input = new Float32Array(128)
        for (let i = 0; i < 128; i++) input[i] = 2.0
        const out = runProcess(proc, [input], { drive: 1, mix: 1, output: 1, type: 1 })
        for (let i = 0; i < 128; i++) {
            expect(out[0][i]).toBeCloseTo(1, 5)
        }
    })

    it('tape saturation uses atan (softer than hard, harder than soft)', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', SATURATION_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('saturation')
        const input = new Float32Array(128)
        for (let i = 0; i < 128; i++) input[i] = 0.8
        const out = runProcess(proc, [input], { drive: 1, mix: 1, output: 1, type: 2 })
        // atan(0.8) ≈ 0.6747
        expect(out[0][0]).toBeCloseTo(Math.atan(0.8), 3)
    })

    it('mix=0 produces dry signal (no saturation applied)', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', SATURATION_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('saturation')
        const input = new Float32Array(128)
        for (let i = 0; i < 128; i++) input[i] = i / 128
        const out = runProcess(proc, [input], { drive: 7, mix: 0, output: 1, type: 1 })
        for (let i = 0; i < 128; i++) {
            expect(out[0][i]).toBeCloseTo(input[i], 5)
        }
    })
})

// ===========================================================
// Filter processor
// ===========================================================
describe('FilterProcessor source', () => {
    it('exports a non-empty string', () => {
        expect(typeof FILTER_SOURCE).toBe('string')
        expect(FILTER_SOURCE.length).toBeGreaterThan(100)
    })

    it('contains registerProcessor call for filter', () => {
        expect(FILTER_SOURCE).toContain("registerProcessor('filter'")
    })

    it('declares 3 AudioParams: cutoff, q, mode', () => {
        expect(FILTER_SOURCE).toContain("name: 'cutoff'")
        expect(FILTER_SOURCE).toContain("name: 'q'")
        expect(FILTER_SOURCE).toContain("name: 'mode'")
    })

    it('uses TPT state variable filter (g, k, a1, a2, a3 coefficients)', () => {
        expect(FILTER_SOURCE).toContain('TPT')
        expect(FILTER_SOURCE).toContain('const g')
        expect(FILTER_SOURCE).toContain('const k')
        expect(FILTER_SOURCE).toContain('const a1')
        expect(FILTER_SOURCE).toContain('const a2')
        expect(FILTER_SOURCE).toContain('const a3')
    })

    it('LP mode attenuates high frequencies more than low ones', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', FILTER_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('filter')
        // Run several iterations to reach filter steady state
        const FRAMES = 2048
        const outL = new Float32Array(FRAMES)
        const outH = new Float32Array(FRAMES)
        const inputLow = new Float32Array(FRAMES)
        const inputHigh = new Float32Array(FRAMES)
        for (let i = 0; i < FRAMES; i++) {
            inputLow[i] = Math.sin(2 * Math.PI * 200 * i / 44100)
            inputHigh[i] = Math.sin(2 * Math.PI * 8000 * i / 44100)
        }
        const oL = runProcess(proc, [inputLow], { cutoff: 1000, q: 0.7, mode: 0 }, FRAMES)
        const oH = runProcess(proc, [inputHigh], { cutoff: 1000, q: 0.7, mode: 0 }, FRAMES)
        // Measure RMS in the second half (after filter settles)
        const rms = (arr, start) => {
            let s = 0
            for (let i = start; i < arr.length; i++) s += arr[i] * arr[i]
            return Math.sqrt(s / (arr.length - start))
        }
        const lowEnergy = rms(oL[0], FRAMES / 2)
        const highEnergy = rms(oH[0], FRAMES / 2)
        expect(lowEnergy).toBeGreaterThan(highEnergy)
    })

    it('HP mode attenuates low frequencies more than high ones', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', FILTER_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('filter')
        const FRAMES = 2048
        const inputLow = new Float32Array(FRAMES)
        const inputHigh = new Float32Array(FRAMES)
        for (let i = 0; i < FRAMES; i++) {
            inputLow[i] = Math.sin(2 * Math.PI * 100 * i / 44100)
            inputHigh[i] = Math.sin(2 * Math.PI * 5000 * i / 44100)
        }
        const oL = runProcess(proc, [inputLow], { cutoff: 2000, q: 0.7, mode: 1 }, FRAMES)
        const oH = runProcess(proc, [inputHigh], { cutoff: 2000, q: 0.7, mode: 1 }, FRAMES)
        const rms = (arr, start) => {
            let s = 0
            for (let i = start; i < arr.length; i++) s += arr[i] * arr[i]
            return Math.sqrt(s / (arr.length - start))
        }
        expect(rms(oH[0], FRAMES / 2)).toBeGreaterThan(rms(oL[0], FRAMES / 2))
    })
})

// ===========================================================
// Reverb processor
// ===========================================================
describe('ReverbProcessor source', () => {
    it('exports a non-empty string', () => {
        expect(typeof REVERB_SOURCE).toBe('string')
        expect(REVERB_SOURCE.length).toBeGreaterThan(100)
    })

    it('contains registerProcessor call for reverb', () => {
        expect(REVERB_SOURCE).toContain("registerProcessor('reverb'")
    })

    it('declares 5 AudioParams: roomSize, damping, width, mix, preDelay', () => {
        expect(REVERB_SOURCE).toContain("name: 'roomSize'")
        expect(REVERB_SOURCE).toContain("name: 'damping'")
        expect(REVERB_SOURCE).toContain("name: 'width'")
        expect(REVERB_SOURCE).toContain("name: 'mix'")
        expect(REVERB_SOURCE).toContain("name: 'preDelay'")
    })

    it('uses Freeverb-style comb + allpass filter network', () => {
        expect(REVERB_SOURCE).toContain('class _Comb')
        expect(REVERB_SOURCE).toContain('class _Allpass')
        expect(REVERB_SOURCE).toContain('COMB_TUNINGS_L')
        expect(REVERB_SOURCE).toContain('ALLPASS_TUNINGS_L')
    })

    it('mix=0 produces dry signal with no reverb tail', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', REVERB_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('reverb')
        const input = new Float32Array(128)
        for (let i = 0; i < 128; i++) input[i] = Math.sin(2 * Math.PI * 440 * i / 44100)
        const out = runProcess(proc, [input, input], { roomSize: 0.85, damping: 0.3, width: 1, mix: 0, preDelay: 0.02 })
        for (let i = 0; i < 128; i++) {
            expect(out[0][i]).toBeCloseTo(input[i], 5)
            expect(out[1][i]).toBeCloseTo(input[i], 5)
        }
    })

    it('mix=1 with impulse produces decaying tail (reverb works)', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', REVERB_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('reverb')
        const FRAMES = 4096
        const input = new Float32Array(FRAMES)
        input[0] = 1.0
        const out = runProcess(proc, [input, input], { roomSize: 0.99, damping: 0.2, width: 1, mix: 1, preDelay: 0 }, FRAMES)
        // After the impulse, reverb tail should appear (after comb delay length)
        let hasTail = false
        for (let i = 1640; i < FRAMES; i++) {
            if (Math.abs(out[0][i]) > 0.000001) { hasTail = true; break }
        }
        expect(hasTail).toBe(true)
    })

    it('all 8 comb filters + 4 allpass filters are instantiated per channel', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', REVERB_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = instantiate('reverb')
        expect(proc.combsL.length).toBe(8)
        expect(proc.combsR.length).toBe(8)
        expect(proc.allpassL.length).toBe(4)
        expect(proc.allpassR.length).toBe(4)
    })
})
