import { describe, it, expect } from 'vitest'
import { computeTrackLfoValues, LFO_MAP } from '../src/logic/lfo_engine.js'

describe('computeTrackLfoValues', () => {
    it('LFO_MAP has exactly 5 entries', () => {
        expect(LFO_MAP).toHaveLength(5)
        expect(LFO_MAP.map(e => e.resultKey)).toEqual(['velocity', 'pan', 'pitch', 'filterFreq', 'filterQ'])
    })

    it('returns all zeros when all LFOs are null', () => {
        const track = { velocityLfo: null, panLfo: null, pitchLfo: null, filterFreqLfo: null, filterQLfo: null }
        const result = computeTrackLfoValues(track, 0, 128, 120)
        expect(result).toEqual({ velocity: 0, pan: 0, pitch: 0, filterFreq: 0, filterQ: 0 })
    })

    it('returns non-zero for a track with velocityLfo set', () => {
        const lfo = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 }
        const track = { velocityLfo: lfo, panLfo: null, pitchLfo: null, filterFreqLfo: null, filterQLfo: null }
        const result = computeTrackLfoValues(track, 32, 128, 120)
        expect(result.velocity).not.toBe(0)
        expect(result.pan).toBe(0)
        expect(result.pitch).toBe(0)
    })

    it('returns non-zero for multiple LFOs set', () => {
        const lfo = { freq: 2, phase: 0, min: 0, max: 1, waveform: 0 }
        const track = { velocityLfo: lfo, panLfo: lfo, pitchLfo: lfo, filterFreqLfo: lfo, filterQLfo: lfo }
        const result = computeTrackLfoValues(track, 16, 128, 120)
        expect(result.velocity).not.toBe(0)
        expect(result.pan).not.toBe(0)
        expect(result.pitch).not.toBe(0)
        expect(result.filterFreq).not.toBe(0)
        expect(result.filterQ).not.toBe(0)
    })

    it('returns numeric values for all keys', () => {
        const lfo = { freq: 1, phase: 0.25, min: 0, max: 1, waveform: 0 }
        const track = { velocityLfo: lfo, panLfo: null, pitchLfo: lfo, filterFreqLfo: null, filterQLfo: null }
        const result = computeTrackLfoValues(track, 0, 128, 120)
        for (const key of Object.keys(result)) {
            expect(typeof result[key]).toBe('number')
            expect(Number.isFinite(result[key])).toBe(true)
        }
    })
})
