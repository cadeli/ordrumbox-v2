import { describe, it, expect } from 'vitest'
import {
    getAudibleNoteSignature,
    getNoteAbsoluteStep,
    getStepSpacing,
    normalizeSignatureValue,
    semiToneToPitch,
} from '../src/core/notes.js'

describe('core/notes', () => {
    describe('pitch / semitone conversions', () => {
        it('semitoneToPitch: 0 → 1 (unisson)', () => {
            expect(semiToneToPitch(0)).toBe(1)
        })

        it('semitoneToPitch: 3 → ~1.1892 (minor third)', () => {
            expect(semiToneToPitch(3)).toBeCloseTo(Math.pow(2, 3 / 12), 4)
        })

        it('semitoneToPitch: 4 → ~1.2599 (major third)', () => {
            expect(semiToneToPitch(4)).toBeCloseTo(Math.pow(2, 4 / 12), 4)
        })

        it('semitoneToPitch: 7 → ~1.4983 (perfect fifth)', () => {
            expect(semiToneToPitch(7)).toBeCloseTo(Math.pow(2, 7 / 12), 4)
        })

        it('semitoneToPitch: 12 → 2 (octave)', () => {
            expect(semiToneToPitch(12)).toBe(2)
        })

        it('semitoneToPitch: -12 → 0.5 (one octave down)', () => {
            expect(semiToneToPitch(-12)).toBe(0.5)
        })
    })

    describe('getStepSpacing', () => {
        it('value < 8 → value/8', () => {
            expect(getStepSpacing(4)).toBe(0.5)
            expect(getStepSpacing(1)).toBe(0.125)
            expect(getStepSpacing(7)).toBe(7 / 8)
        })

        it('value >= 8 → value-7', () => {
            expect(getStepSpacing(8)).toBe(1)
            expect(getStepSpacing(16)).toBe(9)
            expect(getStepSpacing(23)).toBe(16)
        })
    })

    describe('getNoteAbsoluteStep', () => {
        it('beat 0 step 0 → 0', () => {
            expect(getNoteAbsoluteStep({ beat: 0, beatStep: 0 }, 4)).toBe(0)
        })

        it('beat 1 step 2 → 6', () => {
            expect(getNoteAbsoluteStep({ beat: 1, beatStep: 2 }, 4)).toBe(6)
        })

        it('defaults to 0 for missing values', () => {
            expect(getNoteAbsoluteStep({}, 4)).toBe(0)
        })
    })

    describe('getAudibleNoteSignature', () => {
        it('excludes position keys', () => {
            const note = { beat: 0, beatStep: 0, velocity: 0.8, pitch: 5 }
            const sig = getAudibleNoteSignature(note)
            expect(sig).not.toContain('beat')
            expect(sig).not.toContain('beatStep')
            expect(sig).toContain('velocity')
            expect(sig).toContain('pitch')
        })

        it('handles empty note', () => {
            expect(getAudibleNoteSignature({})).toBe('{}')
        })
    })

    describe('normalizeSignatureValue', () => {
        it('handles arrays', () => {
            expect(normalizeSignatureValue([2, 1, 3])).toEqual([2, 1, 3])
        })

        it('sorts object keys', () => {
            const result = normalizeSignatureValue({ c: 3, a: 1 })
            expect(Object.keys(result)).toEqual(['a', 'c'])
        })

        it('passes through primitives', () => {
            expect(normalizeSignatureValue(42)).toBe(42)
            expect(normalizeSignatureValue('test')).toBe('test')
            expect(normalizeSignatureValue(null)).toBeNull()
        })
    })
})
