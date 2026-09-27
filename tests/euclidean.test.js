import { describe, it, expect } from 'vitest'
import { bjorklund, computeEuclideanFillPositions } from '../src/core/euclidean.js'

const toBits = (pattern) => pattern.map((on) => (on ? '1' : '0')).join('')

describe('bjorklund', () => {
    it('returns an empty array for a non-positive step count', () => {
        expect(bjorklund(3, 0)).toEqual([])
        expect(bjorklund(3, -4)).toEqual([])
    })

    it('returns all-off for zero pulses', () => {
        expect(toBits(bjorklund(0, 8))).toBe('00000000')
    })

    it('returns all-on when pulses reach the step count', () => {
        expect(toBits(bjorklund(8, 8))).toBe('11111111')
        expect(toBits(bjorklund(12, 8))).toBe('11111111')
    })

    it('matches the canonical Euclidean rhythms', () => {
        expect(toBits(bjorklund(1, 4))).toBe('1000')
        expect(toBits(bjorklund(2, 4))).toBe('1010')
        expect(toBits(bjorklund(3, 8))).toBe('10010010')
        expect(toBits(bjorklund(5, 8))).toBe('10110110')
        expect(toBits(bjorklund(4, 16))).toBe('1000100010001000')
        expect(toBits(bjorklund(7, 16))).toBe('1001010100101010')
    })

    it('always returns exactly `steps` slots and `pulses` onsets', () => {
        for (let steps = 1; steps <= 24; steps++) {
            for (let pulses = 0; pulses <= steps + 3; pulses++) {
                const pattern = bjorklund(pulses, steps)
                expect(pattern).toHaveLength(steps)
                expect(pattern.filter(Boolean).length).toBe(Math.min(pulses, steps))
            }
        }
    })

    it('always anchors the first onset at index 0', () => {
        for (let steps = 1; steps <= 24; steps++) {
            for (let pulses = 1; pulses <= steps; pulses++) {
                expect(bjorklund(pulses, steps)[0]).toBe(true)
            }
        }
    })

    it('is maximally even: cyclic gaps differ by at most one step', () => {
        for (let steps = 2; steps <= 32; steps++) {
            for (let pulses = 2; pulses < steps; pulses++) {
                const pattern = bjorklund(pulses, steps)
                const onsets = []
                for (let i = 0; i < steps; i++) if (pattern[i]) onsets.push(i)

                const gaps = onsets.map((onset, i) => {
                    const next = onsets[(i + 1) % onsets.length] + (i + 1 === onsets.length ? steps : 0)
                    return next - onset
                })
                expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1)
            }
        }
    })
})

describe('computeEuclideanFillPositions', () => {
    it('returns nothing when the base note is the only pulse', () => {
        expect(computeEuclideanFillPositions(0, 8, 0)).toEqual([])
        expect(computeEuclideanFillPositions(0, 8, 1)).toEqual([])
        expect(computeEuclideanFillPositions(0, 8, 1, 4)).toEqual([])
    })

    it('returns nothing when the span has no room after the base note', () => {
        expect(computeEuclideanFillPositions(4, 1, 4)).toEqual([])
        expect(computeEuclideanFillPositions(4, 0, 4)).toEqual([])
        expect(computeEuclideanFillPositions(4, -3, 4)).toEqual([])
    })

    it('adds pulses - 1 positions inside the span', () => {
        expect(computeEuclideanFillPositions(10, 8, 4)).toEqual([12, 14, 16])
        expect(computeEuclideanFillPositions(10, 8, 3)).toEqual([13, 16])
        expect(computeEuclideanFillPositions(10, 8, 2)).toEqual([14])
    })

    it('clamps k >= span to a full roll of the span', () => {
        const positions = computeEuclideanFillPositions(0, 4, 16)
        expect(positions).toEqual([1, 2, 3])
        expect(new Set(positions).size).toBe(positions.length)
    })

    it('never returns the base position itself', () => {
        for (let k = 2; k <= 9; k++) {
            for (const pos of computeEuclideanFillPositions(7, 8, k)) {
                expect(pos).toBeGreaterThan(7)
                expect(pos).toBeLessThan(15)
            }
        }
    })

    it('rotation keeps the pulse count and moves the phase', () => {
        const base = computeEuclideanFillPositions(0, 8, 4)
        const rotated = computeEuclideanFillPositions(0, 8, 4, 1)

        expect(base).toEqual([2, 4, 6])
        expect(rotated).toEqual([3, 5, 7])
        expect(rotated).toHaveLength(base.length)
    })

    it('rotation wraps around the non-anchor slots', () => {
        const span = 8
        const patterns = []
        for (let rotation = 0; rotation < span; rotation++) {
            patterns.push(JSON.stringify(computeEuclideanFillPositions(0, span, 3, rotation)))
        }
        // every rotation yields the same number of pulses
        for (const p of patterns) {
            expect(JSON.parse(p)).toHaveLength(2)
        }
        // the rotation period is the non-anchor part of the span
        expect(JSON.stringify(computeEuclideanFillPositions(0, span, 3, span - 1))).toBe(
            JSON.stringify(computeEuclideanFillPositions(0, span, 3, 0)),
        )
    })

    it('stays deterministic across repeated calls', () => {
        const first = computeEuclideanFillPositions(5, 12, 5, 3)
        const second = computeEuclideanFillPositions(5, 12, 5, 3)
        expect(second).toEqual(first)
    })
})
