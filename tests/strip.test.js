import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfStrip, { SATURATION_TYPES, REVERB_PRESETS } from '../src/audio/strip.js'

// ─── Mock AudioContext ────────────────────────────────────────────────────────

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

function makeAudioCtx() {
    const sampleRate = 44100
    return {
        currentTime: 1.0,
        sampleRate,
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createBiquadFilter: vi.fn(() => ({ ...makeNode(), type: 'lowpass', frequency: makeParam(350), Q: makeParam(1) })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
        createOscillator: vi.fn(() => ({ ...makeNode(), type: 'sine', frequency: makeParam(440), start: vi.fn() })),
        createBufferSource: vi.fn(() => ({ ...makeNode(), buffer: null })),
        createBuffer: vi.fn((ch, len, sr) => ({
            numberOfChannels: ch, length: len, sampleRate: sr,
            getChannelData: vi.fn(() => new Float32Array(len)),
        })),
        createWaveShaper: vi.fn(() => ({ ...makeNode(), curve: null, oversample: '4x' })),
        createConvolver: vi.fn(() => ({ ...makeNode(), buffer: null })),
        createDelay: vi.fn(() => ({ ...makeNode(), delayTime: makeParam(0.25) })),
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MfStrip', () => {
    let ctx, strip

    beforeEach(() => {
        ctx   = makeAudioCtx()
        strip = new MfStrip('KICK', ctx)
    })

    // ── Constructor ───────────────────────────────────────────────────

    it('initialises with all node references set', () => {
        expect(strip.filter1).toBeDefined()
        expect(strip.filter2).toBeDefined()
        expect(strip.output).toBeDefined()
        expect(strip.pan).toBeDefined()
        expect(strip.delay).toBeDefined()
        expect(strip.reverb).toBeDefined()
    })

    it('initialises currentFilterType as allpass', () => {
        expect(strip.currentFilterType).toBe('allpass')
    })

    it('has an impulseCache Map', () => {
        expect(strip.impulseCache).toBeInstanceOf(Map)
    })

    it('has all 5 LFO entries', () => {
        expect(Object.keys(strip.lfos)).toEqual(
            expect.arrayContaining(['pitchLfo', 'velocityLfo', 'panLfo', 'filterFreqLfo', 'filterQLfo'])
        )
    })

    // ── setBpm ────────────────────────────────────────────────────────

    it('setBpm updates the bpm property', () => {
        strip.setBpm(140)
        expect(strip.bpm).toBe(140)
    })

    // ── updateFilter ──────────────────────────────────────────────────

    it('updateFilter with allpass sets both filters to allpass', () => {
        strip.updateFilter('allpass', 0.5, 0.5)
        expect(strip.filter1.type).toBe('allpass')
        expect(strip.filter2.type).toBe('allpass')
    })

    it('updateFilter with lowpass sets type and schedules freq/Q', () => {
        strip.updateFilter('lowpass', 0.5, 0.3)
        expect(strip.filter1.type).toBe('lowpass')
        expect(strip.filter2.type).toBe('lowpass')
        expect(strip.filter1.frequency.setTargetAtTime).toHaveBeenCalled()
        expect(strip.filter1.Q.setTargetAtTime).toHaveBeenCalled()
    })

    it('updateFilter with null type defaults to allpass', () => {
        strip.updateFilter(null, 0.5, 0.5)
        expect(strip.currentFilterType).toBe('allpass')
    })

    it('updateFilter applies to both filter1 and filter2', () => {
        strip.updateFilter('highpass', 0.6, 0.4)
        expect(strip.filter1.type).toBe('highpass')
        expect(strip.filter2.type).toBe('highpass')
        expect(strip.filter2.frequency.setTargetAtTime).toHaveBeenCalled()
    })

    // ── updateReverb ──────────────────────────────────────────────────

    it('updateReverb with type=none sets reverbInput.gain to 0', () => {
        strip.updateReverb('none', 0)
        expect(strip.reverbInput.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
    })

    it('updateReverb with amount=0 sets reverbInput.gain to 0', () => {
        strip.updateReverb('room', 0)
        expect(strip.reverbInput.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
    })

    it('updateReverb with valid type and amount > 0 sets impulse buffer', () => {
        const validType = Object.keys(REVERB_PRESETS).find(k => k !== 'none')
        if (!validType) return // no preset available
        strip.updateReverb(validType, 0.5)
        expect(strip.reverb.buffer).not.toBeNull()
        expect(strip.reverbInput.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number))
    })

    it('updateReverb caches impulse responses (second call reuses cached)', () => {
        const validType = Object.keys(REVERB_PRESETS).find(k => k !== 'none')
        if (!validType) return
        strip.updateReverb(validType, 0.4)
        strip.updateReverb(validType, 0.6)
        // createBuffer called only once for the same preset
        const bufferCallsBefore = ctx.createBuffer.mock.calls.length
        strip.updateReverb(validType, 0.3)
        expect(ctx.createBuffer.mock.calls.length).toBe(bufferCallsBefore)
    })

    it('updateReverb with unknown type falls back to none', () => {
        strip.updateReverb('NONEXISTENT', 0.5)
        expect(strip.currentReverbType).toBe('none')
    })

    it('updateReverb clamps amount to [0, 1]', () => {
        strip.updateReverb('none', -1)
        expect(strip.currentReverbAmount).toBe(0) // negative clamped to 0
        strip.updateReverb('none', 5)
        expect(strip.currentReverbAmount).toBe(1) // 5 clamped to 1
    })

    // ── updateDelay ───────────────────────────────────────────────────

    it('updateDelay with amount=0 disables delay', () => {
        strip.updateDelay('tape', 1, 0)
        expect(strip.delayInput.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
    })

    it('updateDelay with valid type and amount > 0 sets delayInput.gain', () => {
        strip.updateDelay('tape', 1, 0.5)
        expect(strip.delayInput.gain.setValueAtTime).toHaveBeenCalledWith(0.5, expect.any(Number))
    })

    it('updateDelay with unknown type falls back to tape', () => {
        strip.updateDelay('unknown_type', 1, 0.3)
        expect(strip.currentDelayType).toBe('tape')
    })

    it('updateDelay clamps amount to [0, 1]', () => {
        strip.updateDelay('tape', 1, 2.0)
        expect(strip.currentDelayAmount).toBe(1)
    })

    it.each(['none', 'slap', 'tape', 'pingpong'])('updateDelay type=%s does not throw', (type) => {
        expect(() => strip.updateDelay(type, 1, 0.4)).not.toThrow()
        expect(strip.currentDelayType).toBe(type)
    })

    it('updateDelay re-configures routing when type changes', () => {
        strip.updateDelay('tape', 1, 0.4)
        const routingBefore = strip.delayRoutingType
        strip.updateDelay('slap', 1, 0.4)
        expect(strip.delayRoutingType).not.toBe(routingBefore)
    })

    it('updateDelay does not reconfigure routing when type is unchanged', () => {
        strip.updateDelay('tape', 1, 0.4)
        const routingBefore = strip.delayRoutingType
        strip.updateDelay('tape', 0.5, 0.3) // same type
        expect(strip.delayRoutingType).toBe(routingBefore)
    })

    // ── updateSaturation ──────────────────────────────────────────────

    it('updateSaturation with amount=0 does not throw', () => {
        expect(() => strip.updateSaturation('soft', 0)).not.toThrow()
    })

    it('updateSaturation with amount > 0 sets saturDrive gain', () => {
        strip.updateSaturation('soft', 0.5)
        expect(strip.saturDrive.gain.setTargetAtTime).toHaveBeenCalled()
    })

    it.each(SATURATION_TYPES)('updateSaturation type=%s is accepted', (type) => {
        expect(() => strip.updateSaturation(type, 0.3)).not.toThrow()
        expect(strip.currentSaturationType).toBe(type)
    })

    it('updateSaturation with unknown type falls back to soft', () => {
        strip.updateSaturation('UNKNOWN', 0.3)
        expect(strip.currentSaturationType).toBe('soft')
    })

    it('updateSaturation sets saturator.curve', () => {
        strip.updateSaturation('soft', 0.5)
        expect(strip.saturator.curve).not.toBeNull()
    })

    // ── updateLfo ─────────────────────────────────────────────────────

    it('updateLfo with null config sets gain to 0', () => {
        strip.updateLfo('pitchLfo', null)
        expect(strip.lfos.pitchLfo.gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
    })

    it('updateLfo with config sets frequency and depth', () => {
        strip.updateLfo('pitchLfo', { freq: 2, min: 0, max: 0.5 })
        expect(strip.lfos.pitchLfo.osc.frequency.setTargetAtTime).toHaveBeenCalled()
        expect(strip.lfos.pitchLfo.gain.gain.setTargetAtTime).toHaveBeenCalled()
    })

    it('updateLfo with unknown key is a no-op', () => {
        expect(() => strip.updateLfo('unknownLfo', { freq: 1, min: 0, max: 1 })).not.toThrow()
    })

    it('updateLfo affects all 5 LFO channels without throwing', () => {
        const cfg = { freq: 1, min: 0, max: 0.5 }
        for (const key of Object.keys(strip.lfos)) {
            expect(() => strip.updateLfo(key, cfg)).not.toThrow()
        }
    })

    // ── getImpulseResponse ────────────────────────────────────────────

    it('getImpulseResponse returns an AudioBuffer-like object', () => {
        const validType = Object.keys(REVERB_PRESETS).find(k => k !== 'none') ?? 'none'
        const buf = strip.getImpulseResponse(validType)
        expect(buf).toBeDefined()
    })

    it('getImpulseResponse caches result for same type', () => {
        const validType = Object.keys(REVERB_PRESETS).find(k => k !== 'none') ?? 'none'
        const b1 = strip.getImpulseResponse(validType)
        const b2 = strip.getImpulseResponse(validType)
        expect(b1).toBe(b2)
    })

    // ── disconnectNode ────────────────────────────────────────────────

    it('disconnectNode does not throw when node is null', () => {
        expect(() => strip.disconnectNode(null)).not.toThrow()
    })

    it('disconnectNode does not throw when node.disconnect throws', () => {
        const badNode = { disconnect: vi.fn(() => { throw new Error('disconnected') }) }
        expect(() => strip.disconnectNode(badNode)).not.toThrow()
    })

    // ── delete ────────────────────────────────────────────────────────

    it('delete sets all node references to null', () => {
        strip.delete()
        expect(strip.filter1).toBeNull()
        expect(strip.filter2).toBeNull()
        expect(strip.output).toBeNull()
        expect(strip.reverb).toBeNull()
        expect(strip.delay).toBeNull()
        expect(strip.pan).toBeNull()
    })

    it('delete clears the impulseCache', () => {
        strip.delete()
        expect(strip.impulseCache).toBeNull()
    })

    it('delete does not throw even when called twice', () => {
        strip.delete()
        expect(() => strip.delete()).not.toThrow()
    })
})
