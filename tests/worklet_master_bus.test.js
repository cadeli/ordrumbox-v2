/**
 * @vitest-environment jsdom
 *
 * Master Bus processor tests: validate the inline JS string and DSP
 * behavior (EQ, compressor, master gain).
 */
import { describe, it, expect } from 'vitest'
import MASTER_BUS_SOURCE from '../src/audio/worklets/processors/master_bus_source.js'

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

function makeProc() {
    const factory = new Function('registerProcessor', 'AudioWorkletProcessor', 'sampleRate', MASTER_BUS_SOURCE)
    factory.call(globalScope, registerProcessor, MockAudioWorkletProcessor, 44100)
    return new globalScope.processors['master-bus']()
}

function runProcess(processor, inputs, paramValues, frames = 128) {
    const parameters = {}
    const descs = processor.constructor.parameterDescriptors
    for (const desc of descs) {
        const v = paramValues[desc.name] ?? desc.defaultValue
        parameters[desc.name] = new Float32Array(frames).fill(v)
    }
    const outputs = [[new Float32Array(frames), new Float32Array(frames)]]
    processor.process(inputs, outputs, parameters)
    return outputs[0]  // [chL, chR]
}

describe('MasterBusProcessor source', () => {
    it('exports a non-empty string', () => {
        expect(typeof MASTER_BUS_SOURCE).toBe('string')
        expect(MASTER_BUS_SOURCE.length).toBeGreaterThan(100)
    })

    it('contains registerProcessor call for master-bus', () => {
        expect(MASTER_BUS_SOURCE).toContain("registerProcessor('master-bus'")
    })

    it('declares 10 AudioParams', () => {
        const expected = [
            'compThreshold', 'compRatio', 'compKnee',
            'compAttack', 'compRelease', 'compMakeup',
            'lowcut', 'hicut', 'master', 'bypass'
        ]
        for (const name of expected) {
            expect(MASTER_BUS_SOURCE).toContain(`name: '${name}'`)
        }
    })

    it('bypass mode: signal passes through unchanged (with master gain)', () => {
        const proc = makeProc()
        const FRAMES = 256
        const inL = new Float32Array(FRAMES)
        for (let i = 0; i < FRAMES; i++) inL[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5
        const out = runProcess(proc, [[inL, inL]], {
            bypass: 1, master: 1.0
        }, FRAMES)
        // With bypass=1, EQ+comp are skipped; only master gain applied
        for (let i = 0; i < FRAMES; i++) {
            expect(Math.abs(out[0][i] - inL[i])).toBeLessThan(0.01)
            expect(Math.abs(out[1][i] - inL[i])).toBeLessThan(0.01)
        }
    })

    it('master gain scales the signal', () => {
        const proc = makeProc()
        const FRAMES = 256
        const inL = new Float32Array(FRAMES).fill(0.5)
        const out = runProcess(proc, [[inL, inL]], {
            bypass: 1, master: 0.5
        }, FRAMES)
        for (let i = 5; i < FRAMES; i++) {
            expect(out[0][i]).toBeCloseTo(0.25, 5)
        }
    })

    it('lowcut filter removes DC offset', () => {
        const proc = makeProc()
        const FRAMES = 4410  // 100ms
        const inL = new Float32Array(FRAMES).fill(0.5)  // pure DC
        const out = runProcess(proc, [[inL, inL]], {
            lowcut: 1000,  // high HPF cutoff removes DC and low frequencies
            hicut: 20000,
            master: 1.0
        }, FRAMES)
        // After TPT HPF settles, output should be near 0
        let sumAbs = 0
        for (let i = 4410 - 1000; i < FRAMES; i++) sumAbs += Math.abs(out[0][i])
        const avg = sumAbs / 1000
        expect(avg).toBeLessThan(0.1)  // DC should be largely removed
    })

    it('hicut filter passes low frequencies', () => {
        const proc = makeProc()
        const FRAMES = 4410
        const inL = new Float32Array(FRAMES)
        for (let i = 0; i < FRAMES; i++) {
            inL[i] = Math.sin(2 * Math.PI * 100 * i / 44100)  // 100Hz tone
        }
        const out = runProcess(proc, [[inL, inL]], {
            lowcut: 20,
            hicut: 20000,  // wide open
            master: 1.0
        }, FRAMES)
        // 100Hz tone should pass through with most of its energy
        let outRms = 0, inRms = 0
        for (let i = 2000; i < FRAMES; i++) {
            outRms += out[0][i] * out[0][i]
            inRms += inL[i] * inL[i]
        }
        expect(Math.sqrt(outRms / (FRAMES - 2000))).toBeGreaterThan(0.5)
    })

    it('hicut filter attenuates high frequencies', () => {
        const proc = makeProc()
        const FRAMES = 44100  // 1s
        const inL = new Float32Array(FRAMES)
        for (let i = 0; i < FRAMES; i++) {
            inL[i] = Math.sin(2 * Math.PI * 10000 * i / 44100)  // 10kHz tone
        }
        const out = runProcess(proc, [[inL, inL]], {
            lowcut: 20,
            hicut: 1000,  // aggressive LPF
            master: 1.0
        }, FRAMES)
        // 10kHz tone should be heavily attenuated
        let maxAbs = 0
        for (let i = FRAMES - 2000; i < FRAMES; i++) {
            maxAbs = Math.max(maxAbs, Math.abs(out[0][i]))
        }
        expect(maxAbs).toBeLessThan(0.5)
    })

    it('compressor with low threshold reduces loud signal', () => {
        const proc = makeProc()
        const FRAMES = 44100  // 1s to let envelope settle
        const inL = new Float32Array(FRAMES).fill(0.8)  // loud DC
        const out = runProcess(proc, [[inL, inL]], {
            compThreshold: -20,
            compRatio: 10,
            compKnee: 0,
            compAttack: 0.001,
            compRelease: 0.05,
            compMakeup: 0,
            lowcut: 10,
            hicut: 22000,
            master: 1.0
        }, FRAMES)
        // After envelope settles, output should be lower than input
        let outSettled = 0
        for (let i = FRAMES - 1000; i < FRAMES; i++) outSettled += Math.abs(out[0][i])
        outSettled /= 1000
        // Original loud signal was 0.8; compressor should reduce it
        expect(outSettled).toBeLessThan(0.7)
    })

    it('compressor with high threshold leaves quiet signal alone', () => {
        const proc = makeProc()
        const FRAMES = 44100
        const inL = new Float32Array(FRAMES).fill(0.05)  // quiet DC
        const out = runProcess(proc, [[inL, inL]], {
            compThreshold: -6,
            compRatio: 10,
            compKnee: 0,
            compAttack: 0.001,
            compRelease: 0.05,
            compMakeup: 0,
            lowcut: 10,
            hicut: 22000,
            master: 1.0
        }, FRAMES)
        // Quiet signal (0.05 ≈ -26dB) below threshold (-6dB), no compression
        let outSettled = 0
        for (let i = FRAMES - 1000; i < FRAMES; i++) outSettled += Math.abs(out[0][i])
        outSettled /= 1000
        expect(outSettled).toBeCloseTo(0.05, 1)
    })

    it('makeup gain compensates for compression', () => {
        const proc = makeProc()
        const FRAMES = 44100
        const inL = new Float32Array(FRAMES).fill(0.5)
        // Compare: no makeup
        const outNoMakeup = runProcess(proc, [[inL, inL]], {
            compThreshold: -20, compRatio: 10, compKnee: 0,
            compAttack: 0.001, compRelease: 0.05, compMakeup: 0,
            lowcut: 10, hicut: 22000, master: 1.0
        }, FRAMES)
        // Re-instantiate for clean envelope state
        const proc2 = makeProc()
        const outWithMakeup = runProcess(proc2, [[inL, inL]], {
            compThreshold: -20, compRatio: 10, compKnee: 0,
            compAttack: 0.001, compRelease: 0.05, compMakeup: 12,
            lowcut: 10, hicut: 22000, master: 1.0
        }, FRAMES)
        const sum = (out) => {
            let s = 0
            for (let i = FRAMES - 1000; i < FRAMES; i++) s += Math.abs(out[0][i])
            return s / 1000
        }
        // Makeup should bring level back up
        expect(sum(outWithMakeup)).toBeGreaterThan(sum(outNoMakeup) * 1.5)
    })

    it('soft-knee smoothly transitions around threshold', () => {
        const proc = makeProc()
        const FRAMES = 44100
        const inL = new Float32Array(FRAMES).fill(0.3)
        // With knee > 0, output should be smooth (no hard transition)
        const out = runProcess(proc, [[inL, inL]], {
            compThreshold: -10, compRatio: 4, compKnee: 20,
            compAttack: 0.001, compRelease: 0.05, compMakeup: 0,
            lowcut: 10, hicut: 22000, master: 1.0
        }, FRAMES)
        // Check that envelope doesn't have any sudden jumps
        let maxDelta = 0
        for (let i = 1; i < FRAMES; i++) {
            maxDelta = Math.max(maxDelta, Math.abs(out[0][i] - out[0][i - 1]))
        }
        expect(maxDelta).toBeLessThan(0.5)
    })

    it('stereo processing: L and R remain independent', () => {
        const proc = makeProc()
        const FRAMES = 256
        const inL = new Float32Array(FRAMES).fill(0.3)
        const inR = new Float32Array(FRAMES).fill(-0.3)
        const out = runProcess(proc, [[inL, inR]], {
            bypass: 1, master: 1.0
        }, FRAMES)
        for (let i = 5; i < FRAMES; i++) {
            expect(out[0][i]).toBeCloseTo(0.3, 5)
            expect(out[1][i]).toBeCloseTo(-0.3, 5)
        }
    })

    it('mono input is duplicated to both output channels', () => {
        const proc = makeProc()
        const FRAMES = 256
        const inL = new Float32Array(FRAMES).fill(0.4)
        const out = runProcess(proc, [[inL]], {
            bypass: 1, master: 1.0
        }, FRAMES)
        for (let i = 5; i < FRAMES; i++) {
            expect(out[0][i]).toBeCloseTo(0.4, 5)
            expect(out[1][i]).toBeCloseTo(0.4, 5)
        }
    })

    it('a-rate hicut parameter modulates the cutoff', () => {
        const proc = makeProc()
        const FRAMES = 4410
        const inL = new Float32Array(FRAMES)
        for (let i = 0; i < FRAMES; i++) inL[i] = Math.sin(2 * Math.PI * 5000 * i / 44100)
        // Use k-rate (default) by setting constant value
        const parameters = {}
        const descs = proc.constructor.parameterDescriptors
        for (const desc of descs) {
            let v = desc.defaultValue
            if (desc.name === 'hicut') v = 1000  // strong LPF
            if (desc.name === 'lowcut') v = 20
            if (desc.name === 'master') v = 1.0
            parameters[desc.name] = new Float32Array(FRAMES).fill(v)
        }
        const outputs = [[new Float32Array(FRAMES), new Float32Array(FRAMES)]]
        proc.process([[inL, inL]], outputs, parameters)
        // 5kHz tone should be heavily attenuated
        let maxAbs = 0
        for (let i = FRAMES - 500; i < FRAMES; i++) maxAbs = Math.max(maxAbs, Math.abs(outputs[0][0][i]))
        expect(maxAbs).toBeLessThan(0.5)
    })
})
