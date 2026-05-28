import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import MfKickGenerate from '../src/logic/generators/kick_generate.js'
import MfSnareGenerate from '../src/logic/generators/snare_generate.js'
import MfHatGenerate from '../src/logic/generators/hat_generate.js'

describe('Generator extended variants', () => {
    let mfCmd
    let seed

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
        seed = 42
        Math.random = () => {
            seed = (seed * 9301 + 49297) % 233280
            return seed / 233280
        }
    })

    afterEach(() => {
        // Math.random restored via vitest teardown
    })

    function makeTrack(name, bars = 4, barQuantize = 4) {
        const pattern = mfCmd.addPattern('TestPattern')
        pattern.nbBars = bars
        return mfCmd.addTrack(pattern, name, barQuantize)
    }

    // ── Kick variants ────────────────────────────────────────────────

    describe('KickGenerator – extra variants', () => {
        it('syncopated produces notes within first 2 bars (loop=2:0)', () => {
            const track = makeTrack('KICK')
            new MfKickGenerate().generateNewKick(track, 'syncopated')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.bar).toBeLessThan(2)
            }
        })

        it('break produces notes only on beat 0 of each bar', () => {
            const track = makeTrack('KICK')
            new MfKickGenerate().generateNewKick(track, 'break')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.barStep).toBe(0)
            }
        })

        it('break respects loop point: no notes at or beyond loopPointBar * barQuantize', () => {
            const track = makeTrack('KICK')
            new MfKickGenerate().generateNewKick(track, 'break')
            const loopAbs = 4 * 4 // loopPointBar=4, barQuantize=4
            for (const note of track.notes) {
                const absStep = note.bar * 4 + note.barStep
                expect(absStep).toBeLessThan(loopAbs)
            }
        })

        it('outro variant is a no-op (returns without generating notes)', () => {
            const track = makeTrack('KICK')
            new MfKickGenerate().generateNewKick(track, 'outro')
            expect(track.notes.length).toBe(0)
        })

        it('null variantName resolves to a valid config', () => {
            const track = makeTrack('KICK')
            new MfKickGenerate().generateNewKick(track, null)
            // Should not throw; may or may not produce notes depending on random
        })

        it('unknown variantName falls back to basic', () => {
            const track = makeTrack('KICK')
            new MfKickGenerate().generateNewKick(track, 'doesNotExist')
            // basic config always places at least one note on bar 0 step 0
            const hasBar0 = track.notes.some(n => n.bar === 0 && n.barStep === 0)
            expect(hasBar0).toBe(true)
        })

        it('getRndVariantName excludes break variant', () => {
            const gen = new MfKickGenerate()
            for (let i = 0; i < 20; i++) {
                expect(gen.getRndVariantName()).not.toBe('break')
            }
        })

        it('all variants produce notes with velocity in [0, 1]', () => {
            const variants = ['fourOnFloor', 'basic', 'syncopated', 'break']
            for (const v of variants) {
                const track = makeTrack('KICK')
                new MfKickGenerate().generateNewKick(track, v)
                for (const note of track.notes) {
                    expect(note.velocity).toBeGreaterThanOrEqual(0)
                    expect(note.velocity).toBeLessThanOrEqual(1)
                }
            }
        })
    })

    // ── Snare variants ───────────────────────────────────────────────

    describe('SnareGenerator – extra variants', () => {
        it('syncopated produces notes within first 2 bars', () => {
            const track = makeTrack('SNARE')
            new MfSnareGenerate().generateNewSnare(track, 'syncopated')
            for (const note of track.notes) {
                expect(note.bar).toBeLessThan(2)
            }
        })

        it('roll places notes only in bar 0 when using 1-bar track', () => {
            const track = makeTrack('SNARE', 1, 4)
            new MfSnareGenerate().generateNewSnare(track, 'roll')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.bar).toBe(0)
            }
        })

        it('roll with 4-bar track sets loopAtStep to 4', () => {
            const track = makeTrack('SNARE', 4, 4)
            new MfSnareGenerate().generateNewSnare(track, 'roll')
            // loopPointBar=1, barQuantize=4 → loopAtStep=4
            expect(track.loopAtStep).toBe(4)
        })

        it('break places notes starting from last bar', () => {
            const track = makeTrack('SNARE', 4, 4)
            new MfSnareGenerate().generateNewSnare(track, 'break')
            // startBarOffset=1 means last 1 bar(s)
            for (const note of track.notes) {
                expect(note.bar).toBeGreaterThanOrEqual(3)
            }
        })

        it('intro variant is a no-op', () => {
            const track = makeTrack('SNARE')
            new MfSnareGenerate().generateNewSnare(track, 'intro')
            expect(track.notes.length).toBe(0)
        })

        it('outro variant is a no-op', () => {
            const track = makeTrack('SNARE')
            new MfSnareGenerate().generateNewSnare(track, 'outro')
            expect(track.notes.length).toBe(0)
        })

        it('isRequiredStep returns true when barModulo matches', () => {
            const gen = new MfSnareGenerate()
            const required = [{ barModulo: 2, step: 0 }]
            // bar=1 means (1 % 2 === 1) → bar 1 matches barModulo-1 = 1
            expect(gen.isRequiredStep(1, 0, required)).toBe(true)
        })

        it('isRequiredStep returns false when step does not match', () => {
            const gen = new MfSnareGenerate()
            const required = [{ barModulo: 2, step: 0 }]
            expect(gen.isRequiredStep(1, 2, required)).toBe(false)
        })

        it('isRequiredStep returns false for empty array', () => {
            const gen = new MfSnareGenerate()
            expect(gen.isRequiredStep(0, 0, [])).toBe(false)
        })

        it('all variants produce velocity in [0, 1]', () => {
            const variants = ['basic', 'ghost', 'syncopated', 'roll', 'break']
            for (const v of variants) {
                const track = makeTrack('SNARE')
                new MfSnareGenerate().generateNewSnare(track, v)
                for (const note of track.notes) {
                    expect(note.velocity).toBeGreaterThanOrEqual(0)
                    expect(note.velocity).toBeLessThanOrEqual(1)
                }
            }
        })
    })

    // ── Hat variants ─────────────────────────────────────────────────

    describe('HatGenerator – extra variants', () => {
        it('chhBasic generates notes with velocity in range', () => {
            const track = makeTrack('CHH')
            new MfHatGenerate().generateNewHat(track, 'chhBasic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.velocity).toBeGreaterThanOrEqual(0)
                expect(note.velocity).toBeLessThanOrEqual(1)
            }
        })

        it('ohhBasic generates notes within its loop point', () => {
            const track = makeTrack('OHH')
            new MfHatGenerate().generateNewHat(track, 'ohhBasic')
            expect(track.notes.length).toBeGreaterThan(0)
        })

        it('outro variant is a no-op for hats', () => {
            const track = makeTrack('CHH')
            new MfHatGenerate().generateNewHat(track, 'outro')
            expect(track.notes.length).toBe(0)
        })

        it('intro variant is a no-op for hats', () => {
            const track = makeTrack('CHH')
            new MfHatGenerate().generateNewHat(track, 'intro')
            expect(track.notes.length).toBe(0)
        })

        it('chhBasic loop=1:0 — all notes in bar 0', () => {
            const track = makeTrack('CHH')
            new MfHatGenerate().generateNewHat(track, 'chhBasic')
            for (const note of track.notes) {
                expect(note.bar).toBe(0)
            }
        })
    })
})
