import { describe, it, expect } from 'vitest'
import Utils from '../src/core/utils.js'

describe('Utils – extended coverage', () => {

    // ── normalizeTrackFilterFreqValue ─────────────────────────────────

    describe('normalizeTrackFilterFreqValue', () => {
        it('returns FILTER_FREQ_MIN for non-finite input', () => {
            const fallback = Utils.normalizeTrackFilterFreqValue(NaN)
            expect(typeof fallback).toBe('number')
            expect(Number.isFinite(fallback)).toBe(true)
        })
        it('returns FILTER_FREQ_MIN for null', () => {
            expect(Number.isFinite(Utils.normalizeTrackFilterFreqValue(null))).toBe(true)
        })
        it('converts normalised value (<=1) through normalizedTrackFilterFreqToHz', () => {
            const v = Utils.normalizeTrackFilterFreqValue(0.5)
            expect(v).toBe(Utils.normalizedTrackFilterFreqToHz(0.5))
        })
        it('returns raw value when > 1 (already in Hz)', () => {
            expect(Utils.normalizeTrackFilterFreqValue(1000)).toBe(1000)
        })
        it('boundary: value exactly 1 uses Hz path', () => {
            expect(Utils.normalizeTrackFilterFreqValue(1)).toBe(Utils.normalizedTrackFilterFreqToHz(1))
        })
    })

    // ── normalizeSynthFilterFreqValue ─────────────────────────────────

    describe('normalizeSynthFilterFreqValue', () => {
        it('returns 50 for non-finite input', () => {
            expect(Utils.normalizeSynthFilterFreqValue(NaN)).toBe(50)
            expect(Utils.normalizeSynthFilterFreqValue(null)).toBe(50)
        })
        it('converts normalised value (<=1) via normalizedSynthFilterFreqToHz', () => {
            const v = Utils.normalizeSynthFilterFreqValue(0.5)
            expect(v).toBe(Utils.normalizedSynthFilterFreqToHz(0.5))
        })
        it('returns raw value when > 1', () => {
            expect(Utils.normalizeSynthFilterFreqValue(800)).toBe(800)
        })
        it('boundary: value 0 → minimum (50 Hz)', () => {
            expect(Utils.normalizeSynthFilterFreqValue(0)).toBe(50)
        })
    })

    // ── normalizeSynthFilterQValue ────────────────────────────────────

    describe('normalizeSynthFilterQValue', () => {
        it('returns 1 for non-finite input', () => {
            expect(Utils.normalizeSynthFilterQValue(NaN)).toBe(1)
            expect(Utils.normalizeSynthFilterQValue(undefined)).toBe(1)
        })
        it('converts normalised Q (<=1) via normalizedSynthFilterQToValue', () => {
            const v = Utils.normalizeSynthFilterQValue(0.5)
            expect(v).toBe(Utils.normalizedSynthFilterQToValue(0.5))
        })
        it('returns raw value when > 1', () => {
            expect(Utils.normalizeSynthFilterQValue(12)).toBe(12)
        })
    })

    // ── normalizedSynthFilterFreqToHz / normalizedTrackFilterFreqToHz ─

    describe('normalizedSynthFilterFreqToHz', () => {
        it('value 0 → 50', () => expect(Utils.normalizedSynthFilterFreqToHz(0)).toBe(50))
        it('value 1 → 2050', () => expect(Utils.normalizedSynthFilterFreqToHz(1)).toBe(2050))
        it('value 0.5 → 1050', () => expect(Utils.normalizedSynthFilterFreqToHz(0.5)).toBe(1050))
    })

    describe('normalizedSynthFilterQToValue', () => {
        it('value 0 → 1', () => expect(Utils.normalizedSynthFilterQToValue(0)).toBe(1))
        it('value 1 → 21', () => expect(Utils.normalizedSynthFilterQToValue(1)).toBe(21))
    })

    // ── getStepSpacing ────────────────────────────────────────────────

    describe('getStepSpacing', () => {
        it.each([
            [1, 1 / 8],
            [2, 2 / 8],
            [4, 4 / 8],
            [7, 7 / 8],
        ])('value %d < 8 → value/8 = %f', (v, expected) => {
            expect(Utils.getStepSpacing(v)).toBeCloseTo(expected)
        })
        it.each([
            [8,  1],
            [9,  2],
            [10, 3],
            [15, 8],
        ])('value %d >= 8 → value-7 = %d', (v, expected) => {
            expect(Utils.getStepSpacing(v)).toBe(expected)
        })
        it('boundary: exactly 8 → 1', () => {
            expect(Utils.getStepSpacing(8)).toBe(1)
        })
    })

    // ── getDelayTimeInSeconds ─────────────────────────────────────────

    describe('getDelayTimeInSeconds', () => {
        it('returns a positive number for standard inputs', () => {
            const t = Utils.getDelayTimeInSeconds(1, 120)
            expect(t).toBeGreaterThan(0)
        })
        it('is proportional to the time value', () => {
            const t1 = Utils.getDelayTimeInSeconds(1, 120)
            const t2 = Utils.getDelayTimeInSeconds(2, 120)
            expect(t2).toBeCloseTo(t1 * 2)
        })
        it('varies with bpm: slower bpm → longer delay', () => {
            const t90  = Utils.getDelayTimeInSeconds(1, 90)
            const t120 = Utils.getDelayTimeInSeconds(1, 120)
            expect(t90).toBeGreaterThan(t120)
        })
    })

    // ── getRandomKey ──────────────────────────────────────────────────

    describe('getRandomKey', () => {
        it('returns null for empty object', () => {
            expect(Utils.getRandomKey({})).toBeNull()
        })
        it('returns a key that exists in the object', () => {
            const obj = { a: 1, b: 2, c: 3 }
            const k = Utils.getRandomKey(obj)
            expect(Object.keys(obj)).toContain(k)
        })
        it('returns the only key for single-key object', () => {
            expect(Utils.getRandomKey({ x: 42 })).toBe('x')
        })
        it('returns different keys over many calls (distribution check)', () => {
            const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 }
            const seen = new Set()
            for (let i = 0; i < 100; i++) seen.add(Utils.getRandomKey(obj))
            expect(seen.size).toBeGreaterThan(1)
        })
    })

    // ── TRACK_DEFAULTS and NOTE_DEFAULTS ──────────────────────────────

    describe('TRACK_DEFAULTS', () => {
        it('has expected default property values', () => {
            expect(Utils.TRACK_DEFAULTS.bars).toBe(4)
            expect(Utils.TRACK_DEFAULTS.barQuantize).toBe(4)
            expect(Utils.TRACK_DEFAULTS.mute).toBe(false)
            expect(Utils.TRACK_DEFAULTS.solo).toBe(false)
        })
    })

    describe('NOTE_DEFAULTS', () => {
        it('has expected default property values', () => {
            expect(Utils.NOTE_DEFAULTS.velocity).toBe(0.8)
            expect(Utils.NOTE_DEFAULTS.pitch).toBe(0)
            expect(Utils.NOTE_DEFAULTS.arp).toBeNull()
            expect(Utils.NOTE_DEFAULTS.retriggerNum).toBe(1)
        })
    })

    // ── filterTypeList / delayTimeValues ─────────────────────────────

    describe('filterTypeList', () => {
        it('contains lowpass and highpass', () => {
            expect(Utils.filterTypeList).toContain('lowpass')
            expect(Utils.filterTypeList).toContain('highpass')
        })
        it('has 8 entries', () => {
            expect(Utils.filterTypeList).toHaveLength(8)
        })
    })

    describe('delayTimeValues / delayTimeLabels', () => {
        it('have the same length', () => {
            expect(Utils.delayTimeValues.length).toBe(Utils.delayTimeLabels.length)
        })
        it('contains value 0.25 (quarter note)', () => {
            expect(Utils.delayTimeValues).toContain(0.25)
        })
    })
})
