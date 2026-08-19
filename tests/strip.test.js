import { describe, it, expect, beforeEach, vi } from 'vitest'
import Strip, { SATURATION_TYPES, REVERB_PRESETS } from '../src/audio/strip.js'
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

describe('Strip (Unified Worklet)', () => {
    let ctx, nodes

    beforeEach(() => {
        ctx   = makeAudioCtx()
        nodes = installWorkletMocks()
    })

    it('create() instantiates the unified strip worklet node', async () => {
        const strip = await Strip.create('KICK', ctx)
        expect(strip.stripNode).toBeDefined()
        expect(WorkletLoader.createNode).toHaveBeenCalledWith(ctx, 'strip', expect.any(Object))
    })

    it('output and pan are wrappers around stripNode parameters', async () => {
        const strip = await Strip.create('KICK', ctx)
        expect(strip.output.gain).toBe(strip.stripNode.parameters.get('volume'))
        expect(strip.pan.pan).toBe(strip.stripNode.parameters.get('pan'))
    })

    it('updateFilter sets cutoff, filterMode and allpass-high-cutoff', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        strip.updateFilter('highpass', 1000, 1)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))

        // allpass sets cutoff to 20000 (fully open).
        strip.updateFilter('allpass')
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(20000, expect.any(Number), expect.any(Number))
    })

    it('updateFilter skips cutoff when freq is undefined', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        params.get('cutoff').setTargetAtTime.mockClear()
        strip.updateFilter('lowpass', undefined, 1)
        expect(params.get('cutoff').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('q').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter skips q when q is undefined', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        params.get('q').setTargetAtTime.mockClear()
        strip.updateFilter('lowpass', 1000, undefined)
        expect(params.get('q').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter skips both cutoff and q when both are undefined', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters
        params.get('cutoff').setTargetAtTime.mockClear()
        params.get('q').setTargetAtTime.mockClear()
        strip.updateFilter('lowpass', undefined, undefined)
        expect(params.get('cutoff').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('q').setTargetAtTime).not.toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter passes physical Hz/Q directly to worklet', async () => {
        const strip = await Strip.create('KICK', ctx)
        const params = strip.stripNode.parameters

        strip.updateFilter('lowpass', 20, 0.707)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(20, expect.any(Number), expect.any(Number))
        expect(params.get('q').setTargetAtTime).toHaveBeenCalledWith(0.707, expect.any(Number), expect.any(Number))

        params.get('cutoff').setTargetAtTime.mockClear()
        params.get('q').setTargetAtTime.mockClear()

        strip.updateFilter('lowpass', 20000, 18.707)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(20000, expect.any(Number), expect.any(Number))
        expect(params.get('q').setTargetAtTime).toHaveBeenCalledWith(18.707, expect.any(Number), expect.any(Number))

        params.get('cutoff').setTargetAtTime.mockClear()
        params.get('q').setTargetAtTime.mockClear()

        strip.updateFilter('lowpass', 1000, 5)
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(1000, expect.any(Number), expect.any(Number))
        expect(params.get('q').setTargetAtTime).toHaveBeenCalledWith(5, expect.any(Number), expect.any(Number))
    })

    it('updateSaturation sets satMix and satDrive', async () => {
        const strip = await Strip.create('KICK', ctx)
        strip.updateSaturation('soft', 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('satMix').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
        expect(params.get('satDrive').setTargetAtTime).toHaveBeenCalledWith(4, expect.any(Number), expect.any(Number))
    })

    it('updateReverb sets revMix and roomSize', async () => {
        const strip = await Strip.create('KICK', ctx)
        strip.updateReverb('room', 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('revMix').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
        expect(params.get('revRoom').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateDelay sets dlyMix and delay times', async () => {
        const strip = await Strip.create('KICK', ctx)
        strip.updateDelay('tape', 1, 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('dlyMix').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
        expect(params.get('dlyTimeL').setTargetAtTime).toHaveBeenCalled()
    })

    it('delete disconnects the stripNode and cleans up', async () => {
        const strip = await Strip.create('KICK', ctx)
        const node = strip.stripNode
        strip.delete()
        expect(node.disconnect).toHaveBeenCalled()
        expect(strip.stripNode).toBeNull()
        expect(strip.voicesInput.disconnect).toHaveBeenCalled()
    })
})
