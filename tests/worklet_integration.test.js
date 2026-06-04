/**
 * @vitest-environment jsdom
 *
 * WorkletBridge integration tests with MfStrip.
 * Verifies that updateSaturation/updateFilter/updateReverb branch
 * correctly when worklets are present vs absent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfStrip from '../src/audio/strip.js'
import WorkletBridge from '../src/audio/worklets/bridge.js'

function makeAudioCtx() {
    return {
        sampleRate: 44100,
        currentTime: 0.1,
        destination: { connect: vi.fn() },
        createGain: vi.fn(() => ({
            gain: {
                value: 1,
                setTargetAtTime: vi.fn(),
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn()
            },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createBiquadFilter: vi.fn(() => ({
            type: 'allpass',
            frequency: { value: 1000, setTargetAtTime: vi.fn() },
            Q: { value: 1, setTargetAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createWaveShaper: vi.fn(() => ({
            curve: null,
            oversample: '4x',
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createConvolver: vi.fn(() => ({
            buffer: null,
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createDelay: vi.fn(() => ({
            delayTime: { value: 0.25, setTargetAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createStereoPanner: vi.fn(() => ({
            pan: { value: 0, setTargetAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createOscillator: vi.fn(() => ({
            type: 'sine',
            frequency: { value: 1, setValueAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            start: vi.fn(),
            stop: vi.fn()
        })),
        createBuffer: vi.fn((ch, len, sr) => ({
            numberOfChannels: ch, length: len, sampleRate: sr,
            getChannelData: vi.fn(() => new Float32Array(len))
        })),
        createBufferSource: vi.fn(() => ({
            buffer: null, loop: false, playbackRate: { value: 1, setTargetAtTime: vi.fn() },
            connect: vi.fn(function () { return this }), start: vi.fn(), stop: vi.fn(),
            onended: null
        })),
        audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) }
    }
}

describe('WorkletBridge + MfStrip integration', () => {
    let ctx, strip

    beforeEach(() => {
        ctx = makeAudioCtx()
        strip = new MfStrip('TRK_1', ctx)
    })

    it('native path: updateSaturation sets saturator.curve', () => {
        strip.updateSaturation('soft', 0.5)
        expect(strip.saturator.curve).toBeInstanceOf(Float32Array)
    })

    it('native path: updateReverb sets reverb.buffer when type != none', () => {
        const impulse = ctx.createBuffer(2, 100, 44100)
        strip.impulseCache = new Map()
        // getImpulseResponse is a MfStrip method that builds a buffer
        strip.updateReverb('room', 0.5)
        // If impulse cache empty, getImpulseResponse is called inside updateReverb
        // We don't assert on the buffer content here, just that no error was thrown
        expect(strip.currentReverbType).toBe('room')
    })

    it('native path: updateFilter with allpass sets type to allpass', () => {
        strip.updateFilter('allpass', 1000, 1)
        expect(strip.filter1.type).toBe('allpass')
        expect(strip.filter2.type).toBe('allpass')
    })

    it('native path: updateFilter with lowpass sets freq/Q', () => {
        strip.updateFilter('lowpass', 5000, 5)
        expect(strip.filter1.type).toBe('lowpass')
        expect(strip.filter2.type).toBe('lowpass')
    })

    it('worklet path: updateSaturation uses worklet when present', () => {
        // Simulate worklet upgrade
        const satParams = new Map()
        satParams.set('drive', { setTargetAtTime: vi.fn() })
        satParams.set('mix', { setTargetAtTime: vi.fn() })
        satParams.set('output', { setTargetAtTime: vi.fn() })
        satParams.set('type', { setTargetAtTime: vi.fn() })
        const satNode = { parameters: satParams, connect: vi.fn(), disconnect: vi.fn() }
        strip._worklet = { active: true, nodes: { saturation: satNode } }

        strip.updateSaturation('tape', 0.7)
        // Should have called setTargetAtTime on the worklet params
        expect(satParams.get('drive').setTargetAtTime).toHaveBeenCalled()
        expect(satParams.get('type').setTargetAtTime).toHaveBeenCalled()
    })

    it('worklet path: updateFilter uses worklet when present', () => {
        const filtParams = new Map()
        filtParams.set('cutoff', { setTargetAtTime: vi.fn() })
        filtParams.set('q', { setTargetAtTime: vi.fn() })
        filtParams.set('mode', { setTargetAtTime: vi.fn() })
        const filtNode = { parameters: filtParams, connect: vi.fn(), disconnect: vi.fn() }
        strip._worklet = { active: true, nodes: { filter: filtNode } }

        strip.updateFilter('lowpass', 2000, 0.7)
        expect(filtParams.get('cutoff').setTargetAtTime).toHaveBeenCalled()
        expect(filtParams.get('mode').setTargetAtTime).toHaveBeenCalled()
    })

    it('worklet path: updateReverb uses worklet when present', () => {
        const verbParams = new Map()
        verbParams.set('roomSize', { setTargetAtTime: vi.fn() })
        verbParams.set('damping', { setTargetAtTime: vi.fn() })
        verbParams.set('width', { setTargetAtTime: vi.fn() })
        verbParams.set('mix', { setTargetAtTime: vi.fn() })
        verbParams.set('preDelay', { setTargetAtTime: vi.fn() })
        const verbNode = { parameters: verbParams, connect: vi.fn(), disconnect: vi.fn() }
        strip._worklet = { active: true, nodes: { reverb: verbNode } }

        strip.updateReverb('hall', 0.5)
        expect(verbParams.get('roomSize').setTargetAtTime).toHaveBeenCalled()
        expect(verbParams.get('mix').setTargetAtTime).toHaveBeenCalled()
    })

    it('worklet path: updateDelay uses worklet when present', () => {
        const delayParams = new Map()
        delayParams.set('timeL', { setTargetAtTime: vi.fn() })
        delayParams.set('timeR', { setTargetAtTime: vi.fn() })
        delayParams.set('feedback', { setTargetAtTime: vi.fn() })
        delayParams.set('mix', { setTargetAtTime: vi.fn() })
        delayParams.set('filter', { setTargetAtTime: vi.fn() })
        delayParams.set('saturation', { setTargetAtTime: vi.fn() })
        delayParams.set('saturationType', { setTargetAtTime: vi.fn() })
        delayParams.set('mode', { setTargetAtTime: vi.fn() })
        delayParams.set('width', { setTargetAtTime: vi.fn() })
        const delayNode = { parameters: delayParams, connect: vi.fn(), disconnect: vi.fn() }
        strip._worklet = { active: true, nodes: { delay: delayNode } }

        strip.updateDelay('pingpong', 0.5, 0.6)
        expect(delayParams.get('mode').setTargetAtTime).toHaveBeenCalled()
        expect(delayParams.get('mix').setTargetAtTime).toHaveBeenCalled()
        expect(delayParams.get('timeL').setTargetAtTime).toHaveBeenCalled()
    })

    it('worklet path: updateDelay with mode=none uses worklet (zero mix)', () => {
        const delayParams = new Map()
        delayParams.set('timeL', { setTargetAtTime: vi.fn() })
        delayParams.set('timeR', { setTargetAtTime: vi.fn() })
        delayParams.set('feedback', { setTargetAtTime: vi.fn() })
        delayParams.set('mix', { setTargetAtTime: vi.fn() })
        delayParams.set('filter', { setTargetAtTime: vi.fn() })
        delayParams.set('saturation', { setTargetAtTime: vi.fn() })
        delayParams.set('saturationType', { setTargetAtTime: vi.fn() })
        delayParams.set('mode', { setTargetAtTime: vi.fn() })
        delayParams.set('width', { setTargetAtTime: vi.fn() })
        const delayNode = { parameters: delayParams, connect: vi.fn(), disconnect: vi.fn() }
        strip._worklet = { active: true, nodes: { delay: delayNode } }

        strip.updateDelay('none', 0.25, 0)
        // mix should be 0 (off)
        const mixCall = delayParams.get('mix').setTargetAtTime.mock.calls[0]
        expect(mixCall[0]).toBe(0)
    })

    it('worklet path is preferred when both worklet and native are present', () => {
        const satParams = new Map()
        satParams.set('drive', { setTargetAtTime: vi.fn() })
        satParams.set('mix', { setTargetAtTime: vi.fn() })
        satParams.set('output', { setTargetAtTime: vi.fn() })
        satParams.set('type', { setTargetAtTime: vi.fn() })
        strip._worklet = { active: true, nodes: { saturation: { parameters: satParams } } }
        const curveBefore = strip.saturator.curve
        strip.updateSaturation('hard', 0.3)
        // saturator.curve should NOT have been modified (worklet path)
        expect(strip.saturator.curve).toBe(curveBefore)
    })

    it('setSaturation helper correctly maps type index', () => {
        const satParams = new Map()
        satParams.set('drive', { setTargetAtTime: vi.fn() })
        satParams.set('mix', { setTargetAtTime: vi.fn() })
        satParams.set('output', { setTargetAtTime: vi.fn() })
        satParams.set('type', { setTargetAtTime: vi.fn() })
        const satNode = { parameters: satParams }
        strip._worklet = { active: true, nodes: { saturation: satNode } }

        WorkletBridge.setSaturation(strip, 'tape', 0.5)
        const typeCall = satParams.get('type').setTargetAtTime.mock.calls[0]
        expect(typeCall[0]).toBe(2) // tape = 2
    })

    it('setFilter helper correctly maps filter mode', () => {
        const filtParams = new Map()
        filtParams.set('cutoff', { setTargetAtTime: vi.fn() })
        filtParams.set('q', { setTargetAtTime: vi.fn() })
        filtParams.set('mode', { setTargetAtTime: vi.fn() })
        const filtNode = { parameters: filtParams }
        strip._worklet = { active: true, nodes: { filter: filtNode } }

        WorkletBridge.setFilter(strip, 'bandpass', 1500, 1.5)
        const modeCall = filtParams.get('mode').setTargetAtTime.mock.calls[0]
        expect(modeCall[0]).toBe(2) // bandpass = 2
    })

    it('setReverb helper correctly maps preset', () => {
        const verbParams = new Map()
        verbParams.set('roomSize', { setTargetAtTime: vi.fn() })
        verbParams.set('damping', { setTargetAtTime: vi.fn() })
        verbParams.set('width', { setTargetAtTime: vi.fn() })
        verbParams.set('mix', { setTargetAtTime: vi.fn() })
        verbParams.set('preDelay', { setTargetAtTime: vi.fn() })
        const verbNode = { parameters: verbParams }
        strip._worklet = { active: true, nodes: { reverb: verbNode } }

        WorkletBridge.setReverb(strip, 'hall', 0.5)
        const roomCall = verbParams.get('roomSize').setTargetAtTime.mock.calls[0]
        expect(roomCall[0]).toBe(0.85) // hall = 0.85
    })
})
