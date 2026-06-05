import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfStrip, { SATURATION_TYPES, REVERB_PRESETS } from '../src/audio/strip.js'
import WorkletLoader from '../src/audio/worklets/loader.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeParam(v = 0) {
    return {
        value: v,
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        connect: vi.fn(),
    }
}

function makeNode(extra = {}) {
    return { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), ...extra }
}

function makeWorkletNode(paramNames = []) {
    const params = new Map()
    for (const name of paramNames) params.set(name, makeParam())
    return {
        ...makeNode(),
        parameters: params,
    }
}

function installWorkletMocks() {
    const nodes = {}
    vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
    vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
    vi.spyOn(WorkletLoader, 'createNode').mockImplementation((_ctx, name) => {
        if (!nodes[name]) {
            const paramNames = STRIP_PARAM_NAMES;
            nodes[name] = makeWorkletNode(paramNames)
        }
        return nodes[name]
    })
    return nodes
}

const STRIP_PARAM_NAMES = [
    'cutoff', 'q', 'filterMode',
    'satType', 'satDrive', 'satOut', 'satMix',
    'revRoom', 'revDamp', 'revWidth', 'revMix',
    'dlyTimeL', 'dlyTimeR', 'dlyFb', 'dlyMix', 'dlyMode',
    'volume', 'pan',
    'lfoPitchFreq', 'lfoPitchWave', 'lfoPitchDepth',
    'lfoVeloFreq', 'lfoVeloWave', 'lfoVeloDepth',
    'lfoPanFreq', 'lfoPanWave', 'lfoPanDepth',
    'lfoCutFreq', 'lfoCutWave', 'lfoCutDepth',
    'lfoQFreq', 'lfoQWave', 'lfoQDepth'
];

function makeAudioCtx() {
    return {
        currentTime: 1.0,
        sampleRate: 44100,
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MfStrip (Unified Worklet)', () => {
    let ctx, nodes

    beforeEach(() => {
        ctx   = makeAudioCtx()
        nodes = installWorkletMocks()
    })

    it('constructor initialises routing and LFO gain for pitch', () => {
        const strip = new MfStrip('KICK', ctx)
        expect(strip.name).toBe('KICK')
        expect(strip.voicesInput).toBeDefined()
        expect(strip.stripNode).toBeNull()
        expect(strip._lfoGains.pitchLfo).toBeDefined()
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

    it('updateFilter sets cutoff and filterMode', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateFilter('highpass', 0.5, 0.5)
        const params = strip.stripNode.parameters
        expect(params.get('cutoff').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('filterMode').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
    })

    it('updateFilter allpass sets high cutoff', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateFilter('allpass')
        expect(strip.stripNode.parameters.get('cutoff').setTargetAtTime).toHaveBeenCalledWith(20000, expect.any(Number), expect.any(Number))
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

    it('updateLfo sets worklet LFO parameters', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateLfo('pitchLfo', { freq: 2, min: 0, max: 0.5 })
        const params = strip.stripNode.parameters
        expect(params.get('lfoPitchFreq').setTargetAtTime).toHaveBeenCalled()
        expect(params.get('lfoPitchDepth').setTargetAtTime).toHaveBeenCalled()
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
