import { describe, it, expect } from 'vitest'
import { hzToNote, formatNote } from '../src/core/hz_to_note.js'

describe('hzToNote', () => {
    it('converts A4 (440 Hz) to A4 midi 69', () => {
        expect(hzToNote(440)).toEqual({ note: 'A', octave: 4, cents: 0, midi: 69 })
    })

    it.each([[0], [-1], [NaN], [Infinity], [-Infinity], ['440'], [null], [undefined]])(
        'returns null for invalid input %s',
        (hz) => {
            expect(hzToNote(hz)).toBeNull()
        },
    )

    it('converts C4 (261.63 Hz)', () => {
        const r = hzToNote(261.63)
        expect(r.note).toBe('C')
        expect(r.octave).toBe(4)
        expect(r.midi).toBe(60)
        expect(Math.abs(r.cents)).toBeLessThanOrEqual(50)
    })

    it('converts A5 (880 Hz)', () => {
        const r = hzToNote(880)
        expect(r).toEqual({ note: 'A', octave: 5, cents: 0, midi: 81 })
    })

    it('converts A2 (110 Hz)', () => {
        const r = hzToNote(110)
        expect(r).toEqual({ note: 'A', octave: 2, cents: 0, midi: 45 })
    })

    it('rounds half-semitones with cents -50', () => {
        const half = 440 * 2 ** (0.5 / 12)
        const r = hzToNote(half)
        expect(r.midi).toBe(70)
        expect(r.cents).toBe(-50)
    })

    it('handles very low frequencies with negative octave', () => {
        const r = hzToNote(1)
        expect(r.note).toBe('C')
        expect(r.octave).toBeLessThan(0)
        expect(r.midi).toBeLessThan(0)
    })
})

describe('formatNote', () => {
    it('returns em dash for null/undefined', () => {
        expect(formatNote(null)).toBe('—')
        expect(formatNote(undefined)).toBe('—')
    })

    it('formats zero cents without plus sign', () => {
        expect(formatNote({ note: 'A', octave: 4, cents: 0 })).toBe('A4 0ct')
    })

    it('formats positive cents with plus sign', () => {
        expect(formatNote({ note: 'A', octave: 4, cents: 12 })).toBe('A4 +12ct')
    })

    it('formats negative cents without plus sign', () => {
        expect(formatNote({ note: 'A', octave: 4, cents: -12 })).toBe('A4 -12ct')
    })

    it('round-trips all 12 pitch classes', () => {
        for (let i = 0; i < 12; i++) {
            const hz = 440 * 2 ** ((i - 9) / 12)
            const formatted = formatNote(hzToNote(hz))
            expect(formatted).toMatch(/^[A-G]#?-?\d+ [+-]?\d+ct$/)
        }
    })
})
