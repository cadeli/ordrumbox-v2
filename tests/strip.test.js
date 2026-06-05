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

// Build a fake AudioWorkletNode: a regular object whose `parameters` is a Map
// of mock AudioParams. We pass this as the value returned by WorkletLoader.createNode.
function makeWorkletNode(paramNames = []) {
    const params = new Map()
    for (const name of paramNames) params.set(name, makeParam())
    return {
        ...makeNode(),
        parameters: params,
    }
}

// Patch WorkletLoader so it always reports the audioCtx as supported AND
// returns a fresh mock worklet node for each registered processor name.
function installWorkletMocks() {
    const nodes = {}
    vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
    vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
    vi.spyOn(WorkletLoader, 'createNode').mockImplementation((_ctx, name) => {
        if (!nodes[name]) {
            const paramNames = WORKLET_PARAM_NAMES[name] ?? []
            nodes[name] = makeWorkletNode(paramNames)
        }
        return nodes[name]
    })
    return nodes
}

const WORKLET_PARAM_NAMES = {
    filter:     ['cutoff', 'q', 'mode'],
    saturation: ['drive', 'mix', 'output', 'type'],
    reverb:     ['roomSize', 'damping', 'width', 'mix', 'preDelay'],
    delay:      ['timeL', 'timeR', 'feedback', 'mix', 'filter', 'saturation', 'saturationType', 'mode', 'width'],
    lfo:        ['freq', 'waveform', 'phase', 'bias'],
}

function makeAudioCtx() {
    const sampleRate = 44100
    return {
        currentTime: 1.0,
        sampleRate,
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MfStrip', () => {
    let ctx, nodes

    beforeEach(() => {
        ctx   = makeAudioCtx()
        nodes = installWorkletMocks()
    })

    // ── constructor (sync, worklet nodes still null) ───────────────

    it('constructor initialises native routing nodes and zero-gain LFO gains', () => {
        const strip = new MfStrip('KICK', ctx)
        expect(strip.name).toBe('KICK')
        expect(strip.voicesInput).toBeDefined()
        expect(strip.output).toBeDefined()
        expect(strip.pan).toBeDefined()
        // Worklet effect nodes are not created until create()
        expect(strip.filterNode).toBeNull()
        expect(strip.saturationNode).toBeNull()
        expect(strip.reverbNode).toBeNull()
        expect(strip.delayNode).toBeNull()
        // LFO gain nodes exist as native sources
        expect(Object.keys(strip._lfoGains)).toEqual(
            expect.arrayContaining(['pitchLfo', 'velocityLfo', 'panLfo', 'filterFreqLfo', 'filterQLfo'])
        )
        // All LFO gain gains start at 0
        for (const g of Object.values(strip._lfoGains)) {
            expect(g.gain.value).toBe(0)
        }
    })

    it('currentFilterType defaults to allpass', () => {
        const strip = new MfStrip('KICK', ctx)
        expect(strip.currentFilterType).toBe('allpass')
    })

    // ── async factory create() ─────────────────────────────────────

    it('create() instantiates all 4 effect worklet nodes', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        expect(strip.filterNode).toBeDefined()
        expect(strip.saturationNode).toBeDefined()
        expect(strip.reverbNode).toBeDefined()
        expect(strip.delayNode).toBeDefined()
    })

    it('create() instantiates 5 LFO worklet nodes', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        expect(Object.keys(strip.lfoNodes)).toEqual(
            expect.arrayContaining(['pitchLfo', 'velocityLfo', 'panLfo', 'filterFreqLfo', 'filterQLfo'])
        )
    })

    it('create() snaps worklet AudioParams to no-effect state (mix=0, allpass, passthrough)', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        const t = ctx.currentTime

        // Reverb must start silent
        expect(strip.reverbNode.parameters.get('mix').setValueAtTime)
            .toHaveBeenCalledWith(0, t)
        // Delay must start silent
        expect(strip.delayNode.parameters.get('mix').setValueAtTime)
            .toHaveBeenCalledWith(0, t)
        // Filter must start as allpass (cutoff=20000, q=0.1, mode=0)
        expect(strip.filterNode.parameters.get('cutoff').setValueAtTime)
            .toHaveBeenCalledWith(20000, t)
        expect(strip.filterNode.parameters.get('q').setValueAtTime)
            .toHaveBeenCalledWith(0.1, t)
        expect(strip.filterNode.parameters.get('mode').setValueAtTime)
            .toHaveBeenCalledWith(0, t)
        // Saturation must start as passthrough (drive=1, output=1, mix=1)
        expect(strip.saturationNode.parameters.get('drive').setValueAtTime)
            .toHaveBeenCalledWith(1, t)
        expect(strip.saturationNode.parameters.get('output').setValueAtTime)
            .toHaveBeenCalledWith(1, t)
    })

    // ── setBpm ──────────────────────────────────────────────────────

    it('setBpm updates the bpm property', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.setBpm(140)
        expect(strip.bpm).toBe(140)
    })

    // ── updateFilter ────────────────────────────────────────────────

    it('updateFilter with allpass sets cutoff to 20000 and mode to 0 (LP)', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateFilter('allpass', 0.5, 0.5)
        const cutoff = strip.filterNode.parameters.get('cutoff')
        const q      = strip.filterNode.parameters.get('q')
        const mode   = strip.filterNode.parameters.get('mode')
        expect(cutoff.setTargetAtTime).toHaveBeenCalledWith(20000, expect.any(Number), expect.any(Number))
        expect(q.setTargetAtTime).toHaveBeenCalledWith(0.1, expect.any(Number), expect.any(Number))
        expect(mode.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
        expect(strip.currentFilterType).toBe('allpass')
    })

    it('updateFilter with lowpass sets cutoff, q, and mode=0', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateFilter('lowpass', 0.5, 0.3)
        const cutoff = strip.filterNode.parameters.get('cutoff')
        const q      = strip.filterNode.parameters.get('q')
        const mode   = strip.filterNode.parameters.get('mode')
        expect(cutoff.setTargetAtTime).toHaveBeenCalled()
        expect(q.setTargetAtTime).toHaveBeenCalled()
        expect(mode.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
        expect(strip.currentFilterType).toBe('lowpass')
    })

    it('updateFilter with highpass sets mode=1', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateFilter('highpass', 0.5, 0.5)
        expect(strip.filterNode.parameters.get('mode').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
    })

    it('updateFilter with bandpass sets mode=2', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateFilter('bandpass', 0.5, 0.5)
        expect(strip.filterNode.parameters.get('mode').setTargetAtTime).toHaveBeenCalledWith(2, expect.any(Number), expect.any(Number))
    })

    it('updateFilter with notch sets mode=3', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateFilter('notch', 0.5, 0.5)
        expect(strip.filterNode.parameters.get('mode').setTargetAtTime).toHaveBeenCalledWith(3, expect.any(Number), expect.any(Number))
    })

    it('updateFilter with null type defaults to allpass', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateFilter(null, 0.5, 0.5)
        expect(strip.currentFilterType).toBe('allpass')
    })

    // ── updateReverb ────────────────────────────────────────────────

    it('updateReverb with type=none sets reverb mix to 0 (worklet handles dry/wet)', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateReverb('none', 0)
        expect(strip.reverbNode.parameters.get('mix').setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
    })

    it('updateReverb with amount=0 sets reverb mix to 0', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateReverb('room', 0)
        expect(strip.reverbNode.parameters.get('mix').setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
    })

    it('updateReverb with valid type and amount>0 sets reverb mix to amount', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateReverb('room', 0.5)
        expect(strip.reverbNode.parameters.get('mix').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
        // All reverb worklet params should be set
        const p = strip.reverbNode.parameters
        expect(p.get('roomSize').setTargetAtTime).toHaveBeenCalled()
        expect(p.get('damping').setTargetAtTime).toHaveBeenCalled()
        expect(p.get('width').setTargetAtTime).toHaveBeenCalled()
        expect(p.get('preDelay').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateReverb with unknown type falls back to none', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateReverb('NONEXISTENT', 0.5)
        expect(strip.currentReverbType).toBe('none')
    })

    it('updateReverb clamps amount to [0, 1]', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateReverb('none', -1)
        expect(strip.currentReverbAmount).toBe(0)
        strip.updateReverb('none', 5)
        expect(strip.currentReverbAmount).toBe(1)
    })

    it.each(['room', 'hall', 'plate', 'spring', 'gated'])('updateReverb preset %s is accepted', async (type) => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateReverb(type, 0.4)
        expect(strip.currentReverbType).toBe(type)
    })

    // ── updateDelay ─────────────────────────────────────────────────

    it('updateDelay with amount=0 disables delay (mix=0)', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateDelay('tape', 1, 0)
        expect(strip.delayNode.parameters.get('mix').setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
    })

    it('updateDelay with valid type and amount>0 sets mix=amount and configures worklet', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateDelay('tape', 1, 0.5)
        expect(strip.delayNode.parameters.get('mix').setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
        const p = strip.delayNode.parameters
        expect(p.get('timeL').setTargetAtTime).toHaveBeenCalled()
        expect(p.get('timeR').setTargetAtTime).toHaveBeenCalled()
        expect(p.get('mode').setTargetAtTime).toHaveBeenCalled()
        expect(p.get('feedback').setTargetAtTime).toHaveBeenCalled()
    })

    it('updateDelay with unknown type falls back to tape', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateDelay('unknown_type', 1, 0.3)
        expect(strip.currentDelayType).toBe('tape')
    })

    it('updateDelay clamps amount to [0, 1]', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateDelay('tape', 1, 2.0)
        expect(strip.currentDelayAmount).toBe(1)
    })

    it.each(['none', 'slap', 'tape', 'pingpong'])('updateDelay type=%s does not throw', async (type) => {
        const strip = await MfStrip.create('KICK', ctx)
        expect(() => strip.updateDelay(type, 1, 0.4)).not.toThrow()
        expect(strip.currentDelayType).toBe(type)
    })

    // ── updateSaturation ────────────────────────────────────────────

    it('updateSaturation with amount=0 sets drive=1 (passthrough) and output=1', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateSaturation('soft', 0)
        const p = strip.saturationNode.parameters
        expect(p.get('drive').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
        expect(p.get('output').setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
    })

    it('updateSaturation with amount>0 raises drive and lowers output', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateSaturation('soft', 0.5)
        const p = strip.saturationNode.parameters
        // drive = 1 + 0.5 * 6 = 4
        expect(p.get('drive').setTargetAtTime).toHaveBeenCalledWith(4, expect.any(Number), expect.any(Number))
        // output = 1 - 0.5 * 0.15 ≈ 0.925
        expect(p.get('output').setTargetAtTime).toHaveBeenCalled()
    })

    it.each(SATURATION_TYPES)('updateSaturation type=%s is accepted', async (type) => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateSaturation(type, 0.3)
        expect(strip.currentSaturationType).toBe(type)
    })

    it('updateSaturation with unknown type falls back to soft', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateSaturation('UNKNOWN', 0.3)
        expect(strip.currentSaturationType).toBe('soft')
    })

    // ── updateLfo ───────────────────────────────────────────────────

    it('updateLfo with null config zeroes the depth gain', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateLfo('pitchLfo', null)
        expect(strip._lfoGains.pitchLfo.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
    })

    it('updateLfo with config sets worklet frequency, waveform, and depth', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.updateLfo('pitchLfo', { freq: 2, min: 0, max: 0.5 })
        const lfoNode = strip.lfoNodes.pitchLfo
        expect(lfoNode.parameters.get('freq').setTargetAtTime).toHaveBeenCalled()
        expect(lfoNode.parameters.get('waveform').setTargetAtTime).toHaveBeenCalled()
        expect(strip._lfoGains.pitchLfo.gain.setTargetAtTime).toHaveBeenCalled()
    })

    it('updateLfo with unknown key is a no-op', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        expect(() => strip.updateLfo('unknownLfo', { freq: 1, min: 0, max: 1 })).not.toThrow()
    })

    it('updateLfo affects all 5 LFO channels without throwing', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        const cfg = { freq: 1, min: 0, max: 0.5 }
        for (const key of Object.keys(strip._lfoGains)) {
            expect(() => strip.updateLfo(key, cfg)).not.toThrow()
        }
    })

    // ── delete ──────────────────────────────────────────────────────

    it('delete sets all node references to null', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.delete()
        expect(strip.filterNode).toBeNull()
        expect(strip.saturationNode).toBeNull()
        expect(strip.reverbNode).toBeNull()
        expect(strip.delayNode).toBeNull()
        expect(strip.voicesInput).toBeNull()
        expect(strip.output).toBeNull()
        expect(strip.pan).toBeNull()
        expect(strip._lfoGains).toEqual({})
        expect(strip.lfoNodes).toEqual({})
    })

    it('delete does not throw even when called twice', async () => {
        const strip = await MfStrip.create('KICK', ctx)
        strip.delete()
        expect(() => strip.delete()).not.toThrow()
    })
})
