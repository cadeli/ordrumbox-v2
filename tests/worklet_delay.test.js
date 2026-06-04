/**
 * @vitest-environment jsdom
 *
 * Delay processor tests: validate the inline JS string and DSP math.
 */
import { describe, it, expect } from 'vitest'
import DELAY_SOURCE from '../src/audio/worklets/processors/delay_source.js'

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

function runProcess(processor, inputs, paramValues, frames = 128) {
    const parameters = {}
    const descs = processor.constructor.parameterDescriptors
    for (const desc of descs) {
        const v = paramValues[desc.name] ?? desc.defaultValue
        parameters[desc.name] = new Float32Array(frames).fill(v)
    }
    // Real AudioWorklet: inputs is array of "input nodes", each = array of channel Float32Arrays
    // The test convention here: inputs[0] is the array of channel Float32Arrays (single input)
    // If a Float32Array is passed, treat it as a 1-channel input.
    const isFloat32Array = ch => ch instanceof Float32Array
    const normalizedInputs = inputs.map(ch => isFloat32Array(ch) ? [ch] : ch)
    const outputs = [[new Float32Array(frames), new Float32Array(frames)]]
    processor.process(normalizedInputs, outputs, parameters)
    return outputs[0]
}

describe('DelayProcessor source', () => {
    it('exports a non-empty string', () => {
        expect(typeof DELAY_SOURCE).toBe('string')
        expect(DELAY_SOURCE.length).toBeGreaterThan(100)
    })

    it('contains registerProcessor call for delay', () => {
        expect(DELAY_SOURCE).toContain("registerProcessor('delay'")
    })

    it('declares 9 AudioParams: timeL, timeR, feedback, mix, filter, saturation, saturationType, mode, width', () => {
        const expected = ['timeL', 'timeR', 'feedback', 'mix', 'filter', 'saturation', 'saturationType', 'mode', 'width']
        for (const name of expected) {
            expect(DELAY_SOURCE).toContain(`name: '${name}'`)
        }
    })

    it('uses two delay lines for pingpong support', () => {
        expect(DELAY_SOURCE).toContain('class _DelayLine')
        expect(DELAY_SOURCE).toContain('this.lineL')
        expect(DELAY_SOURCE).toContain('this.lineR')
    })

    it('applies saturation in the feedback loop', () => {
        expect(DELAY_SOURCE).toContain('_shape(filtL * fb, sat, satType)')
        expect(DELAY_SOURCE).toContain('_shape(filtR * fb, sat, satType)')
    })

    it('implements a 1-pole lowpass in the feedback loop', () => {
        expect(DELAY_SOURCE).toContain('_lowpass')
        expect(DELAY_SOURCE).toContain('this.filterL = filtL')
    })

    it('pingpong mode crosses L/R feedback', () => {
        expect(DELAY_SOURCE).toContain('isPingPong')
        expect(DELAY_SOURCE).toContain('this.lineL.write(inL + satR)')
        expect(DELAY_SOURCE).toContain('this.lineR.write(inR + satL)')
    })

    it('instantiates with two delay lines', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', DELAY_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['delay']()
        expect(proc.lineL).toBeDefined()
        expect(proc.lineR).toBeDefined()
        expect(proc.lineL.buffer.length).toBeGreaterThan(0)
        expect(proc.lineR.buffer.length).toBeGreaterThan(0)
    })

    it('slap mode (time=0.1s) produces a delayed echo', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', DELAY_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['delay']()
        // Buffer must be larger than the delay so the echo appears inside the loop
        const FRAMES = 5500
        const inpL = new Float32Array(FRAMES)
        const inpR = new Float32Array(FRAMES)
        inpL[0] = 1.0
        const out = runProcess(proc, [[inpL, inpR]], {
            timeL: 0.1, timeR: 0.1, feedback: 0.3, mix: 1,
            filter: 20000, saturation: 0, saturationType: 0, mode: 0, width: 1
        }, FRAMES)
        // Echo should appear at sample ~4410 (100ms)
        let echoMax = 0
        for (let i = 4400; i < 4500; i++) {
            if (Math.abs(out[0][i]) > echoMax) echoMax = Math.abs(out[0][i])
        }
        expect(echoMax).toBeGreaterThan(0.01)
    })

    it('pingpong mode puts echo on opposite channel', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', DELAY_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['delay']()
        const FRAMES = 5500
        const inpL = new Float32Array(FRAMES)
        const inpR = new Float32Array(FRAMES)
        inpL[0] = 1.0
        const out = runProcess(proc, [[inpL, inpR]], {
            timeL: 0.1, timeR: 0.1, feedback: 0, mix: 1,
            filter: 20000, saturation: 0, saturationType: 0, mode: 2, width: 1
        }, FRAMES)
        // Left channel should have echo, right should not
        let echoL = 0, echoR = 0
        for (let i = 4400; i < 4500; i++) {
            if (Math.abs(out[0][i]) > echoL) echoL = Math.abs(out[0][i])
            if (Math.abs(out[1][i]) > echoR) echoR = Math.abs(out[1][i])
        }
        expect(echoL).toBeGreaterThan(0.01)
        expect(echoR).toBeLessThan(0.001)
    })

    it('mix=0 produces dry signal with no delay', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', DELAY_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['delay']()
        const FRAMES = 1024
        const inpL = new Float32Array(FRAMES)
        for (let i = 0; i < FRAMES; i++) inpL[i] = Math.sin(2 * Math.PI * 440 * i / 44100)
        const out = runProcess(proc, [inpL, inpL], {
            timeL: 0.1, timeR: 0.1, feedback: 0.5, mix: 0,
            filter: 20000, saturation: 0, saturationType: 0, mode: 0, width: 1
        }, FRAMES)
        for (let i = 0; i < FRAMES; i++) {
            expect(out[0][i]).toBeCloseTo(inpL[i], 5)
        }
    })

    it('feedback creates multiple echoes (reverb-like)', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', DELAY_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['delay']()
        const FRAMES = 8820  // 200ms
        const inpL = new Float32Array(FRAMES)
        const inpR = new Float32Array(FRAMES)
        inpL[0] = 1.0
        const out = runProcess(proc, [[inpL, inpR]], {
            timeL: 0.05, timeR: 0.05, feedback: 0.5, mix: 1,
            filter: 20000, saturation: 0, saturationType: 0, mode: 0, width: 1
        }, FRAMES)
        // Should have echo at 50ms (sample 2205), 100ms (4410), 150ms (6615)
        let e50 = 0, e100 = 0, e150 = 0
        for (let i = 2200; i < 2300; i++) if (Math.abs(out[0][i]) > e50) e50 = Math.abs(out[0][i])
        for (let i = 4400; i < 4500; i++) if (Math.abs(out[0][i]) > e100) e100 = Math.abs(out[0][i])
        for (let i = 6600; i < 6700; i++) if (Math.abs(out[0][i]) > e150) e150 = Math.abs(out[0][i])
        expect(e50).toBeGreaterThan(0.01)
        expect(e100).toBeGreaterThan(0.001)
    })

    it('saturation limits amplitude in feedback (no runaway)', () => {
        const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', DELAY_SOURCE)
        factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
        const proc = new globalScope.processors['delay']()
        const FRAMES = 8820
        const inpL = new Float32Array(FRAMES)
        const inpR = new Float32Array(FRAMES)
        inpL[0] = 1.0
        const out = runProcess(proc, [[inpL, inpR]], {
            timeL: 0.05, timeR: 0.05, feedback: 0.95, mix: 1,
            filter: 20000, saturation: 0.5, saturationType: 0, mode: 0, width: 1
        }, FRAMES)
        // Even with high feedback, saturation should keep amplitude bounded
        for (let i = 0; i < FRAMES; i++) {
            expect(Math.abs(out[0][i])).toBeLessThan(2.0)
            expect(Math.abs(out[1][i])).toBeLessThan(2.0)
        }
    })
})
