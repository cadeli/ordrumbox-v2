import { describe, it, expect, vi } from 'vitest'
import { applyTrackToStrip, applyParamsToStrip } from '../src/audio/strip_sync.js'
import { makeParam, makeNode } from './helpers/worklet_mocks.js'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeStrip() {
    return {
        output: { ...makeNode(), gain: makeParam(1) },
        pan: { ...makeNode(), pan: makeParam(0) },
        updateFilter: vi.fn(),
        updateSaturation: vi.fn(),
        updateReverb: vi.fn(),
        updateDelay: vi.fn(),
        updateLfo: vi.fn(),
    }
}

// ─── applyTrackToStrip ────────────────────────────────────────────────────────

describe('applyTrackToStrip', () => {
    it('returns early when strip is null', () => {
        expect(() => applyTrackToStrip(null, { name: 'KICK' }, 1.0)).not.toThrow()
    })

    it('returns early when track is null', () => {
        expect(() => applyTrackToStrip(makeStrip(), null, 1.0)).not.toThrow()
    })

    it('calls strip.updateFilter when filterType is set', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.7 }, 1.0)
        expect(strip.updateFilter).toHaveBeenCalledWith('lowpass', 0.5, 0.7)
    })

    it('skips strip.updateFilter when filterType is absent', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK' }, 1.0)
        expect(strip.updateFilter).not.toHaveBeenCalled()
    })

    it('calls updateSaturation with amount=0 when saturationOn=false', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', saturationType: 'soft', saturationOn: false, saturationAmount: 0.5 }, 1.0)
        expect(strip.updateSaturation).toHaveBeenCalledWith('soft', 0)
    })

    it('calls updateSaturation with amount when saturationOn=true', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', saturationType: 'hard', saturationOn: true, saturationAmount: 0.7 }, 1.0)
        expect(strip.updateSaturation).toHaveBeenCalledWith('hard', 0.7)
    })

    it('calls updateReverb with amount=0 when reverbOn=false', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', reverbType: 'room', reverbOn: false, reverbAmount: 0.5 }, 1.0)
        expect(strip.updateReverb).toHaveBeenCalledWith('room', 0)
    })

    it('calls updateReverb with amount when reverbOn=true', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', reverbType: 'hall', reverbOn: true, reverbAmount: 0.6 }, 1.0)
        expect(strip.updateReverb).toHaveBeenCalledWith('hall', 0.6)
    })

    it('calls updateDelay with amount=0 when delayOn=false', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', delayType: 'tape', delayOn: false, delayTime: 1, delayAmount: 0.4 }, 1.0)
        expect(strip.updateDelay).toHaveBeenCalledWith('tape', 1, 0)
    })

    it('calls updateDelay with amount when delayOn=true', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', delayType: 'pingpong', delayOn: true, delayTime: 2, delayAmount: 0.3 }, 1.0)
        expect(strip.updateDelay).toHaveBeenCalledWith('pingpong', 2, 0.3)
    })

    it('calls updateLfo for each LFO key present', () => {
        const strip = makeStrip()
        const pitchLfo = { freq: 2, min: 0, max: 0.5 }
        const velocityLfo = { freq: 1, min: 0.2, max: 0.8 }
        applyTrackToStrip(strip, { name: 'KICK', pitchLfo, velocityLfo }, 1.0)
        expect(strip.updateLfo).toHaveBeenCalledWith('pitchLfo', pitchLfo)
        expect(strip.updateLfo).toHaveBeenCalledWith('velocityLfo', velocityLfo)
    })

    it('always calls updateLfo for all LFO keys (clears disabled LFOs)', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.7 }, 1.0)
        expect(strip.updateLfo).toHaveBeenCalledTimes(5)
        expect(strip.updateLfo).toHaveBeenCalledWith('pitchLfo', undefined)
        expect(strip.updateLfo).toHaveBeenCalledWith('velocityLfo', undefined)
        expect(strip.updateLfo).toHaveBeenCalledWith('panLfo', undefined)
        expect(strip.updateLfo).toHaveBeenCalledWith('filterFreqLfo', undefined)
        expect(strip.updateLfo).toHaveBeenCalledWith('filterQLfo', undefined)
    })

    it('sets velocity on strip.output.gain', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', velocity: 0.8 }, 1.0)
        expect(strip.output.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, 1.0, expect.any(Number))
    })

    it('sets pan on strip.pan.pan', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', pan: 0.5 }, 1.0)
        expect(strip.pan.pan.setTargetAtTime).toHaveBeenCalledWith(0.5, 1.0, expect.any(Number))
    })

    it('skips velocity/pan when opts.skipVelocityPan=true', () => {
        const strip = makeStrip()
        applyTrackToStrip(strip, { name: 'KICK', velocity: 0.8, pan: 0.5 }, 1.0, { skipVelocityPan: true })
        expect(strip.output.gain.setTargetAtTime).not.toHaveBeenCalled()
        expect(strip.pan.pan.setTargetAtTime).not.toHaveBeenCalled()
    })
})

// ─── applyParamsToStrip ───────────────────────────────────────────────────────

describe('applyParamsToStrip', () => {
    it('returns early when strip is null', () => {
        expect(() => applyParamsToStrip(null, { filterType: 'lowpass' }, 1.0)).not.toThrow()
    })

    it('returns early when params is null', () => {
        expect(() => applyParamsToStrip(makeStrip(), null, 1.0)).not.toThrow()
    })

    it('calls updateFilter when filterType is set', () => {
        const strip = makeStrip()
        applyParamsToStrip(strip, { filterType: 'highpass', filterFreq: 0.3, filterQ: 0.5 }, 1.0)
        expect(strip.updateFilter).toHaveBeenCalledWith('highpass', 0.3, 0.5)
    })

    it('calls updateReverb with 0 when reverbOn=false', () => {
        const strip = makeStrip()
        applyParamsToStrip(strip, { reverbType: 'room', reverbOn: false, reverbAmount: 0.5 }, 1.0)
        expect(strip.updateReverb).toHaveBeenCalledWith('room', 0)
    })

    it('calls updateDelay with 0 when delayOn=false', () => {
        const strip = makeStrip()
        applyParamsToStrip(strip, { delayType: 'tape', delayTime: 1, delayOn: false, delayAmount: 0.3 }, 1.0)
        expect(strip.updateDelay).toHaveBeenCalledWith('tape', 1, 0)
    })

    it('calls updateSaturation with 0 when saturationOn=false', () => {
        const strip = makeStrip()
        applyParamsToStrip(strip, { saturationType: 'soft', saturationOn: false, saturationAmount: 0.5 }, 1.0)
        expect(strip.updateSaturation).toHaveBeenCalledWith('soft', 0)
    })

    it('sets velocity on strip.output.gain', () => {
        const strip = makeStrip()
        applyParamsToStrip(strip, { velocity: 0.7 }, 2.0)
        expect(strip.output.gain.setTargetAtTime).toHaveBeenCalledWith(0.7, 2.0, expect.any(Number))
    })

    it('sets pan on strip.pan.pan', () => {
        const strip = makeStrip()
        applyParamsToStrip(strip, { pan: -0.3 }, 2.0)
        expect(strip.pan.pan.setTargetAtTime).toHaveBeenCalledWith(-0.3, 2.0, expect.any(Number))
    })

    it('mute=true forces gain to 0', () => {
        const strip = makeStrip()
        applyParamsToStrip(strip, { velocity: 0.8, mute: true }, 1.0)
        expect(strip.output.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1.0, expect.any(Number))
    })

    it('mute=false restores gain to velocity value', () => {
        const strip = makeStrip()
        applyParamsToStrip(strip, { velocity: 0.6, mute: false }, 1.0)
        expect(strip.output.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.6, 1.0, expect.any(Number))
    })

    it('mute=false without velocity restores gain to 1.0', () => {
        const strip = makeStrip()
        applyParamsToStrip(strip, { mute: false }, 1.0)
        expect(strip.output.gain.setTargetAtTime).toHaveBeenLastCalledWith(1.0, 1.0, expect.any(Number))
    })

    it('calls updateLfo for each LFO key present', () => {
        const strip = makeStrip()
        const pitchLfo = { freq: 2, min: 0, max: 0.5 }
        applyParamsToStrip(strip, { pitchLfo, filterFreqLfo: { freq: 1, min: 0, max: 1 } }, 1.0)
        expect(strip.updateLfo).toHaveBeenCalledWith('pitchLfo', pitchLfo)
        expect(strip.updateLfo).toHaveBeenCalledWith('filterFreqLfo', { freq: 1, min: 0, max: 1 })
    })
})
