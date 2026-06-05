import { describe, it, expect } from 'vitest'
import LfoUpdater from '../src/patterns/lfo_updater.js'
import { TICK } from '../src/core/constants.js'

describe('LfoUpdater', () => {
    describe('computeLfoValue', () => {
        it('returns 0 when lfo is null', () => {
            expect(LfoUpdater.computeLfoValue(null, 100, 128)).toBe(0)
        })

        it('returns 0 when lfo is undefined', () => {
            expect(LfoUpdater.computeLfoValue(undefined, 100, 128)).toBe(0)
        })

        it('returns a number within [min, max] range', () => {
            const lfo = { freq: 1, phase: 0, min: 0.2, max: 0.8 }
            const baseTicks = TICK * 4
            for (let tick = 0; tick < 200; tick += 10) {
                const val = LfoUpdater.computeLfoValue(lfo, tick, baseTicks)
                expect(val).toBeGreaterThanOrEqual(0.2)
                expect(val).toBeLessThanOrEqual(0.8)
            }
        })

        it('uses default ticksPer4Bars (TICK * 4) when not provided', () => {
            const lfo = { freq: 1, phase: 0, min: 0, max: 1 }
            const withDefault = LfoUpdater.computeLfoValue(lfo, 0)
            const withExplicit = LfoUpdater.computeLfoValue(lfo, 0, TICK * 4)
            expect(withDefault).toBe(withExplicit)
        })

        it('returns value rounded to 2 decimal places', () => {
            const lfo = { freq: 2, phase: 0.25, min: 0.1, max: 0.9 }
            const val = LfoUpdater.computeLfoValue(lfo, 50, TICK * 4)
            const rounded = Math.round(100 * val) / 100
            expect(val).toBe(rounded)
        })

        it('phase offset shifts the waveform', () => {
            const lfoA = { freq: 1, phase: 0, min: 0, max: 1 }
            const lfoB = { freq: 1, phase: 0.5, min: 0, max: 1 }
            const valA = LfoUpdater.computeLfoValue(lfoA, 40, TICK * 4)
            const valB = LfoUpdater.computeLfoValue(lfoB, 40, TICK * 4)
            expect(valA).not.toBe(valB)
        })

        it('at tick 0 with phase 0, returns midpoint (sin(0) = 0 => (0+1)/2 = 0.5 mapped to range)', () => {
            const lfo = { freq: 1, phase: 0, min: 0, max: 1 }
            // sin(0) = 0 => (0+1)/2 = 0.5 => 0.5 * (1-0) + 0 = 0.5
            const val = LfoUpdater.computeLfoValue(lfo, 0, TICK * 4)
            expect(val).toBe(0.5)
        })

        it('min=max returns min value throughout', () => {
            const lfo = { freq: 1, phase: 0, min: 0.42, max: 0.42 }
            const val = LfoUpdater.computeLfoValue(lfo, 100, TICK * 4)
            expect(val).toBe(0.42)
        })

        it('handles string-typed freq and min/max (as stored in JSON)', () => {
            const lfo = { freq: '1', phase: 0, min: '0', max: '1' }
            const val = LfoUpdater.computeLfoValue(lfo, 0, TICK * 4)
            expect(typeof val).toBe('number')
            expect(val).toBeGreaterThanOrEqual(0)
            expect(val).toBeLessThanOrEqual(1)
        })
    })
})
