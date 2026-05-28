import { describe, it, expect, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import BaseGenerator from '../src/logic/generators/base_generator.js'

describe('BaseGenerator', () => {
    let generator, mfCmd

    const testConfigs = {
        basic: {
            mode: 'phrases',
            loopPointBar: 4,
            loopPointStep: 0,
            phrases: [
                { bar: 0, step: 0, accent: true },
                { bar: 1, step: 2 }
            ],
            velocity: {
                base: 0.8,
                accentOnBeat: 0.15,
                ghost: -0.3,
                randomSpread: 0.05,
                clampMin: 0.4,
                clampMax: 1
            }
        },
        grid: {
            mode: 'grid',
            loopPointBar: 2,
            loopPointStep: 0,
            probabilities: [1, 0.5, 0.8, 0.3],
            velocity: {
                base: 0.7,
                accentOnBeat: 0.2,
                ghost: -0.2,
                randomSpread: 0.1,
                clampMin: 0.3,
                clampMax: 1
            }
        }
    }

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
        generator = new BaseGenerator('TEST', testConfigs)
    })

    describe('clearTrackNotes', () => {
        it('empties track notes', () => {
            const track = { notes: [{}, {}] }
            generator.clearTrackNotes(track)
            expect(track.notes).toEqual([])
        })
    })

    describe('computeVelocity', () => {
        it('returns base velocity', () => {
            const v = generator.computeVelocity({ base: 0.8 }, {})
            expect(v).toBeCloseTo(0.8, 2)
        })

        it('adds accent', () => {
            const v = generator.computeVelocity({ base: 0.8, accentOnBeat: 0.15 }, { accent: true })
            expect(v).toBeGreaterThan(0.8)
        })

        it('adds ghost reduction', () => {
            const v = generator.computeVelocity({ base: 0.8, ghost: -0.3 }, { ghost: true })
            expect(v).toBeLessThan(0.8)
        })

        it('clamps to min/max', () => {
            const v = generator.computeVelocity({ base: 0.5, ghost: -0.4, clampMin: 0.3, clampMax: 1 }, { ghost: true })
            expect(v).toBeGreaterThanOrEqual(0.3)
        })

        it('uses velocityBase from context when provided', () => {
            const v = generator.computeVelocity({ base: 0.8 }, { velocityBase: 0.5 })
            expect(v).toBeCloseTo(0.5, 2)
        })

        it('returns number when toFixed is false', () => {
            const v = generator.computeVelocity({ base: 0.8 }, { toFixed: false })
            expect(typeof v).toBe('number')
        })
    })

    describe('applyLoopPoint', () => {
        it('sets loop point from config', () => {
            const track = { barQuantize: 4, bars: 4 }
            generator.applyLoopPoint(track, { loopPointBar: 2, loopPointStep: 0 })
            expect(track.loopPointBar).toBe(2)
            expect(track.loopPointStep).toBe(0)
            expect(track.loopAtStep).toBe(8)
        })

        it('falls back to track bars when no config loop point', () => {
            const track = { barQuantize: 4, bars: 4 }
            generator.applyLoopPoint(track, {})
            expect(track.loopPointBar).toBe(4)
            expect(track.loopAtStep).toBe(16)
        })
    })

    describe('addNote', () => {
        it('creates note via mfCmd', () => {
            const track = { name: 'TEST', barQuantize: 4, bars: 4, notes: [] }
            const note = generator.addNote(track, 0, 2, 0, 0.8)
            expect(note).toBeDefined()
            expect(track.notes.length).toBe(1)
        })
    })

    describe('formatCompactVelocity', () => {
        it('formats velocity config as string', () => {
            const result = generator.formatCompactVelocity({
                base: 0.8,
                accentOnBeat: 0.15,
                ghost: -0.3,
                randomSpread: 0.05,
                clampMin: 0.4,
                clampMax: 1
            })
            expect(result).toContain('b0.8')
            expect(result).toContain('a0.15')
            expect(result).toContain('g-0.3')
            expect(result).toContain('r0.05')
            expect(result).toContain('c0.4-1')
        })
    })

    describe('resolveVariantName', () => {
        it('returns valid variant name', () => {
            expect(generator.resolveVariantName('basic')).toBe('basic')
        })

        it('returns random variant when name is invalid', () => {
            const result = generator.resolveVariantName('nonexistent')
            expect(['basic', 'grid']).toContain(result)
        })
    })

    describe('generateGridVariant', () => {
        it('generates notes based on probabilities', () => {
            const track = { name: 'TEST', barQuantize: 4, bars: 1, notes: [] }
            // Use deterministic probabilities
            const originalRandom = Math.random
            let callCount = 0
            Math.random = () => {
                callCount++
                // Return values that will trigger some notes
                return callCount % 2 === 0 ? 0.2 : 0.9
            }

            generator.generateGridVariant(track, testConfigs.grid,
                (bar, step) => step === 0,
                (bar, step) => step !== 0
            )

            Math.random = originalRandom
            expect(track.notes.length).toBeGreaterThan(0)
        })
    })

    describe('generatePhraseVariant', () => {
        it('generates notes from phrases', () => {
            const track = { name: 'TEST', barQuantize: 4, bars: 4, notes: [] }
            generator.generatePhraseVariant(track, testConfigs.basic,
                () => 0,
                (phrase) => phrase.accent === true,
                (phrase) => phrase.ghost === true
            )
            expect(track.notes.length).toBe(2)
        })
    })
})
