import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfStrip, { SATURATION_TYPES, REVERB_PRESETS } from '../src/audio/strip.js'
import WorkletLoader from '../src/audio/worklets/loader.js'
import { makeParam, makeNode, installWorkletMocks } from './helpers/worklet_mocks.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAudioCtx() {
    return {
        currentTime: 1.0,
        sampleRate: 44100,
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
        createAnalyser: vi.fn(() => ({
            fftSize: 256,
            frequencyBinCount: 128,
            connect: vi.fn(() => {}),
            disconnect: vi.fn(() => {}),
            getByteTimeDomainData: vi.fn(() => {}),
        })),
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MfStrip (Unified Worklet)', () => {
    let ctx, nodes

    beforeEach(() => {
        ctx   = makeAudioCtx()
        nodes = installWorkletMocks()
    })

    it('create() instantiates the unified strip worklet node', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        expect(strip.stripNode).toBeDefined()
        expect(WorkletLoader.createNode).toHaveBeenCalledWith(ctx, 'strip', expect.any(Object))
    })

    it('output and pan are wrappers around stripNode parameters', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        expect(strip.output.gain).toBe(strip.stripNode.parameters.get('volume'))
        expect(strip.pan.pan).toBe(strip.stripNode.parameters.get('pan'))
    })

    it('updateFilter sets cutoff, filterMode and allpass-high-cutoff', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        strip.updateFilter('highpass', 1000, 1)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))

        // allpass sets cutoff to 1 (normalized), which maps to 20kHz in the worklet.
        strip.updateFilter('allpass')
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
    })

    it('updateFilter skips cutoff when freq is undefined', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        params.get('cutoff').setTargetAtTime.mockClear()
        strip.updateFilter('lowpass', undefined, 1)
        expect(params.get('cutoff').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('q').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter skips q when q is undefined', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        params.get('q').setTargetAtTime.mockClear()
        strip.updateFilter('lowpass', 1000, undefined)
        expect(params.get('q').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter skips both cutoff and q when both are undefined', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        params.get('cutoff').setTargetAtTime.mockClear()
        params.get('q').setTargetAtTime.mockClear()
        strip.updateFilter('lowpass', undefined, undefined)
        expect(params.get('cutoff').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('q').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter normalizes physical Hz/Q to 0..1 for worklet', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        const params = strip.stripNode.parameters

        // freq=20 Hz → normalized 0 (log10(20/20)/3 = 0)
        strip.updateFilter('lowpass', 20, 0.707)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
        // Q=0.707 → normalized 0 ((0.707 - 0.707) / 18 = 0)
        expect(params.get('q').setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))

        params.get('cutoff').setTargetAtTime.mockClear()
        params.get('q').setTargetAtTime.mockClear()

        // freq=20000 Hz → normalized 1
        strip.updateFilter('lowpass', 20000, 18.707)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
        // Q=18.707 → normalized 1
        expect(params.get('q').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))

        params.get('cutoff').setTargetAtTime.mockClear()
        params.get('q').setTargetAtTime.mockClear()

        // mid values: freq → exactly 0.5 norm, Q=9.707 → exactly 0.5 norm
        const midHz = 20 * Math.pow(1000, 0.5)
        strip.updateFilter('lowpass', midHz, 9.707)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
        expect(params.get('q').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
    })

    it('updateSaturation sets satMix and satDrive', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateSaturation('soft', 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('satMix').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
        expect(params.get('satDrive').setTargetAtTime).toHaveBeenCalledWith(4, expect.any(Number), expect.any(Number))
    })

    it('updateReverb sets revMix and roomSize', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateReverb('room', 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('revMix').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
        expect(params.get('revRoom').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateDelay sets dlyMix and delay times', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateDelay('tape', 1, 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('dlyMix').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
        expect(params.get('dlyTimeL').setTargetAtTime).toHaveBeenCalled()
    })

    it('delete disconnects the stripNode and cleans up', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        const node = strip.stripNode
        strip.delete()
        expect(node.disconnect).toHaveBeenCalled()
        expect(strip.stripNode).toBeNull()
        expect(strip.voicesInput.disconnect).toHaveBeenCalled()
    })
})
