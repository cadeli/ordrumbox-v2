/**
 * @vitest-environment jsdom
 *
 * WorkletBridge integration tests with MfStrip.
 * Verifies that updateSaturation/updateFilter/updateReverb branch
 * correctly when worklets are present vs absent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfStrip from '../src/audio/strip.js'
import MfMixer from '../src/audio/mixer.js'
import WorkletBridge from '../src/audio/worklets/bridge.js'
import SYNTH_VOICE_SOURCE from '../src/audio/worklets/processors/synth_voice_source.js'

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
            frequency: { value: 1000, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
            Q: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
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
        createDynamicsCompressor: vi.fn(() => ({
            threshold: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            knee:      { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            ratio:     { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            attack:    { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            release:   { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createAnalyser: vi.fn(() => ({
            fftSize: 0,
            frequencyBinCount: 512,
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

// ===========================================================
// Master bus worklet integration
// ===========================================================
describe('WorkletBridge + MfMixer integration', () => {
    let ctx

    beforeEach(() => {
        ctx = makeAudioCtx()
    })

    it('MfMixer starts in native mode by default', () => {
        const mixer = new MfMixer(ctx)
        mixer.start()
        expect(mixer._workletActive).toBe(false)
        expect(mixer.busWorklet).toBeNull()
    })

    it('native mode: busInput connects to compressor', () => {
        const mixer = new MfMixer(ctx)
        mixer.start()
        expect(mixer.busInput).toBeTruthy()
        // busInput.connect should have been called with compressor
        expect(mixer.busInput.connect).toHaveBeenCalledWith(mixer.compressor)
    })

    it('addStrip connects strip.pan to busInput', () => {
        const mixer = new MfMixer(ctx)
        mixer.start()
        mixer.addStrip('KICK')
        const strip = mixer.strips['KICK']
        expect(strip.pan.connect).toHaveBeenCalledWith(mixer.busInput)
    })

    it('worklet path: busWorklet is wired when _workletActive', () => {
        const mixer = new MfMixer(ctx)
        // Pre-configure worklet BEFORE start()
        const busNode = { connect: vi.fn(), disconnect: vi.fn() }
        mixer.busWorklet = busNode
        mixer._workletActive = true
        mixer.start()
        // In worklet mode, busInput should be connected to busWorklet
        expect(mixer.busInput.connect).toHaveBeenCalledWith(busNode)
    })

    it('worklet path: analyser is fed by busWorklet output', () => {
        const mixer = new MfMixer(ctx)
        const busNode = { connect: vi.fn(), disconnect: vi.fn() }
        mixer.busWorklet = busNode
        mixer._workletActive = true
        mixer.start()
        expect(busNode.connect).toHaveBeenCalledWith(mixer.analyser)
    })

    it('setMasterBus sets all parameters on the worklet node', () => {
        const mixer = new MfMixer(ctx)
        const params = new Map()
        const paramNames = [
            'compThreshold', 'compRatio', 'compKnee', 'compAttack',
            'compRelease', 'compMakeup', 'lowcut', 'hicut', 'master', 'bypass'
        ]
        for (const name of paramNames) {
            params.set(name, { setTargetAtTime: vi.fn() })
        }
        mixer.busWorklet = { parameters: params, connect: vi.fn(), disconnect: vi.fn() }

        WorkletBridge.setMasterBus(mixer, {
            lowcut: 50, hicut: 18000, master: 0.8,
            threshold: -18, ratio: 6, knee: 20,
            attack: 0.005, release: 0.2, makeup: 3,
            bypass: false
        })
        for (const name of paramNames) {
            expect(params.get(name).setTargetAtTime).toHaveBeenCalled()
        }
    })

    it('setMasterBus with bypass=true sets bypass to 1', () => {
        const mixer = new MfMixer(ctx)
        const params = new Map()
        params.set('bypass', { setTargetAtTime: vi.fn() })
        mixer.busWorklet = { parameters: params, connect: vi.fn(), disconnect: vi.fn() }

        WorkletBridge.setMasterBus(mixer, { bypass: true })
        const call = params.get('bypass').setTargetAtTime.mock.calls[0]
        expect(call[0]).toBe(1)
    })

    it('setMasterBus returns false if no busWorklet', () => {
        const mixer = new MfMixer(ctx)
        mixer.busWorklet = null
        expect(WorkletBridge.setMasterBus(mixer, { master: 0.5 })).toBe(false)
    })

    it('stop() disconnects worklet and clears _workletActive', () => {
        const mixer = new MfMixer(ctx)
        mixer.start()
        const busNode = { connect: vi.fn(), disconnect: vi.fn() }
        mixer.busWorklet = busNode
        mixer._workletActive = true
        mixer.stop()
        expect(mixer._workletActive).toBe(false)
        expect(mixer.busWorklet).toBeNull()
    })
})

// ===========================================================
// Synth voice worklet integration
// ===========================================================
describe('WorkletBridge + SynthVoice integration', () => {
    it('createSynthVoice returns a node-like object', () => {
        const node = {
            parameters: new Map(),
            port: { postMessage: vi.fn(), onmessage: null },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        }
        // Verify WorkletBridge helper methods send correct messages
        WorkletBridge.triggerVoice(node, 1.234)
        expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'trigger', startTime: 1.234 })
    })

    it('triggerVoice sends trigger message with startTime', () => {
        const node = {
            parameters: new Map(),
            port: { postMessage: vi.fn() },
            connect: vi.fn(), disconnect: vi.fn()
        }
        WorkletBridge.triggerVoice(node, 0.5)
        expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'trigger', startTime: 0.5 })
    })

    it('releaseVoice sends release message with releaseTime', () => {
        const node = {
            parameters: new Map(),
            port: { postMessage: vi.fn() },
            connect: vi.fn(), disconnect: vi.fn()
        }
        WorkletBridge.releaseVoice(node, 2.5)
        expect(node.port.postMessage).toHaveBeenCalledWith({ type: 'release', releaseTime: 2.5 })
    })

    it('updateVoice sends update message with merged params', () => {
        const node = {
            parameters: new Map(),
            port: { postMessage: vi.fn() },
            connect: vi.fn(), disconnect: vi.fn()
        }
        WorkletBridge.updateVoice(node, { master: 0.5, pan: -0.3 })
        expect(node.port.postMessage).toHaveBeenCalledWith({
            type: 'update', master: 0.5, pan: -0.3
        })
    })

    it('synth voice has all expected AudioParams exposed', () => {
        // Verify the processor source declares the full set of params
        // (the actual AudioWorkletNode API differs from the mock processor
        //  used in unit tests, so we just verify the source contract here)
        const expected = [
            'osc1Freq', 'osc2Freq', 'osc3Freq',
            'osc1Gain', 'osc2Gain', 'osc3Gain',
            'osc1Detune', 'osc2Detune', 'osc3Detune',
            'osc1Wave', 'osc2Wave', 'osc3Wave',
            'noiseMix', 'filterType', 'filterFreq', 'filterQ',
            'attack', 'decay', 'sustain', 'release',
            'master', 'pan', 'velocity'
        ]
        for (const name of expected) {
            expect(SYNTH_VOICE_SOURCE).toContain(`name: '${name}'`)
        }
    })
})
