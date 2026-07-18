import { describe, it, expect } from 'vitest'
import Utils from '../src/core/utils.js'

describe('Utils – extended coverage', () => {

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
})
