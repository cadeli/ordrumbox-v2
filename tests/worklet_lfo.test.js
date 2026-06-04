/**
 * @vitest-environment jsdom
 *
 * LFO processor tests: validate the inline JS string and waveform shapes.
 */
import { describe, it, expect } from 'vitest'
import LFO_SOURCE from '../src/audio/worklets/processors/lfo_source.js'

class MockAudioWorkletProcessor {
    static parameterDescriptors = []
    constructor() {}
    process() { return true }
}

const globalScope = {
    sampleRate: 44100,
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    processors: {}
}
function registerProcessor(name, cls) { globalScope.processors[name] = cls }

function runProcess(processor, paramValues, frames = 4410) {
    const parameters = {}
    const descs = processor.constructor.parameterDescriptors
    for (const desc of descs) {
        const v = paramValues[desc.name] ?? desc.defaultValue
        parameters[desc.name] = new Float32Array(frames).fill(v)
    }
    const outputs = [[new Float32Array(frames)]]
    processor.process([], outputs, parameters)
    return outputs[0][0]
}

describe('LFOProcessor source', () => {
    it('exports a non-empty string', () => {
        expect(typeof LFO_SOURCE).toBe('string')
        expect(LFO_SOURCE.length).toBeGreaterThan(100)
    })

    it('contains registerProcessor call for lfo', () => {
        expect(LFO_SOURCE).toContain("registerProcessor('lfo'")
    })

    it('declares 4 AudioParams: freq, waveform, phase, bias', () => {
        const expected = ['freq', 'waveform', 'phase', 'bias']
        for (const name of expected) {
            expect(LFO_SOURCE).toContain(`name: '${name}'`)
        }
    })

    it('implements 5 waveforms: sine, triangle, saw, square, sample-and-hold', () => {
        expect(LFO_SOURCE).toContain('Math.sin')
        expect(LFO_SOURCE).toContain('triangle')
        expect(LFO_SOURCE).toContain('saw')
        expect(LFO_SOURCE).toContain('square')
        expect(LFO_SOURCE).toContain('sample-and-hold')
    })

    it('sine LFO oscillates between -1 and +1', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', LFO_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['lfo']()
        const FRAMES = 4410  // 100ms
        const out = runProcess(proc, { freq: 10, waveform: 0, phase: 0, bias: 0 }, FRAMES)
        let max = -Infinity, min = Infinity
        for (let i = 100; i < FRAMES; i++) { // skip startup transient
            if (out[i] > max) max = out[i]
            if (out[i] < min) min = out[i]
        }
        expect(max).toBeGreaterThan(0.9)
        expect(min).toBeLessThan(-0.9)
    })

    it('sine LFO at 10Hz completes ~1 cycle in 100ms', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', LFO_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['lfo']()
        const FRAMES = 4410
        const out = runProcess(proc, { freq: 10, waveform: 0, phase: 0, bias: 0 }, FRAMES)
        // Count zero crossings
        let crossings = 0
        for (let i = 1; i < FRAMES; i++) {
            if ((out[i-1] < 0 && out[i] >= 0) || (out[i-1] >= 0 && out[i] < 0)) {
                crossings++
            }
        }
        // 10Hz at 100ms = 1 cycle = 2 zero crossings
        expect(crossings).toBeGreaterThanOrEqual(2)
        expect(crossings).toBeLessThanOrEqual(4)
    })

    it('square LFO alternates between +1 and -1', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', LFO_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['lfo']()
        const FRAMES = 4410
        const out = runProcess(proc, { freq: 10, waveform: 3, phase: 0, bias: 0 }, FRAMES)
        for (let i = 10; i < FRAMES; i++) {
            // Square should be exactly +1 or -1
            const v = out[i]
            expect(v === 1 || v === -1).toBe(true)
        }
    })

    it('saw LFO ramps from -1 to +1', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', LFO_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['lfo']()
        // Need buffer long enough for full cycle: 1Hz needs 44100 frames
        const FRAMES = 44100
        const out = runProcess(proc, { freq: 1, waveform: 2, phase: 0, bias: 0 }, FRAMES)
        let max = -Infinity, min = Infinity
        for (let i = 0; i < FRAMES; i++) {
            if (out[i] > max) max = out[i]
            if (out[i] < min) min = out[i]
        }
        expect(max).toBeGreaterThan(0.5)
        expect(min).toBeLessThan(-0.5)
    })

    it('bias adds DC offset to the output', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', LFO_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['lfo']()
        // Run for a full second so sine averages to 0
        const FRAMES = 44100
        const out = runProcess(proc, { freq: 1, waveform: 0, phase: 0, bias: 0.5 }, FRAMES)
        let avg = 0
        for (let i = 1000; i < FRAMES - 1000; i++) avg += out[i]
        avg /= (FRAMES - 2000)
        // Sine + 0.5 bias should average around 0.5
        expect(avg).toBeGreaterThan(0.4)
        expect(avg).toBeLessThan(0.6)
    })

    it('higher frequency produces more cycles', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', LFO_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc1 = new globalScope.processors['lfo']()
        const proc2 = new globalScope.processors['lfo']()
        const FRAMES = 4410
        const out1 = runProcess(proc1, { freq: 1, waveform: 0, phase: 0, bias: 0 }, FRAMES)
        const out2 = runProcess(proc2, { freq: 5, waveform: 0, phase: 0, bias: 0 }, FRAMES)
        const countCrossings = arr => {
            let c = 0
            for (let i = 1; i < FRAMES; i++) {
                if ((arr[i-1] < 0 && arr[i] >= 0) || (arr[i-1] >= 0 && arr[i] < 0)) c++
            }
            return c
        }
        const c1 = countCrossings(out1)
        const c2 = countCrossings(out2)
        expect(c2).toBeGreaterThan(c1 * 2)
    })

    it('sample-and-hold holds random values per cycle', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', LFO_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['lfo']()
        // At 50Hz over 1 second we get 50 cycles, hence 50 new random values
        const FRAMES = 44100
        const out = runProcess(proc, { freq: 50, waveform: 4, phase: 0, bias: 0 }, FRAMES)
        // Sample-and-hold should produce discrete plateaus
        const seen = new Set()
        for (let i = 0; i < FRAMES; i++) {
            seen.add(out[i].toFixed(4))
        }
        expect(seen.size).toBeGreaterThan(20)
    })
})
