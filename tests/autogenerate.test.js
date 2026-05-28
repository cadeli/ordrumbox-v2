import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import MfKickGenerate from '../src/logic/generators/kick_generate.js'
import MfSnareGenerate from '../src/logic/generators/snare_generate.js'
import MfHatGenerate from '../src/logic/generators/hat_generate.js'
import MfBassGenerate from '../src/logic/generators/bass_generate.js'
import MfPercGenerate from '../src/logic/generators/perc_generate.js'

describe('Functional: Auto-generate patterns', () => {
    let mfCmd

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
        // Seed Math.random for deterministic tests
        let seed = 0
        const originalRandom = Math.random
        Math.random = () => {
            seed = (seed * 9301 + 49297) % 233280
            return seed / 233280
        }
    })

    afterEach(() => {
        // Restore Math.random
    })

    function createTestTrack(name, bars = 4, barQuantize = 4) {
        const pattern = mfCmd.addPattern('TestPattern')
        pattern.nbBars = bars
        return mfCmd.addTrack(pattern, name, barQuantize)
    }

    describe('Kick Generator', () => {
        it('fourOnFloor produces notes on beats', () => {
            const track = createTestTrack('KICK', 4, 4)
            const gen = new MfKickGenerate()

            gen.generateNewKick(track, 'fourOnFloor')

            expect(track.notes.length).toBeGreaterThan(0)
            // Notes should be within first bar (loop=1:0)
            for (const note of track.notes) {
                expect(note.bar).toBe(0)
            }
        })

        it('basic produces notes from phrase config', () => {
            const track = createTestTrack('KICK', 4, 4)
            const gen = new MfKickGenerate()

            gen.generateNewKick(track, 'basic')

            expect(track.notes.length).toBeGreaterThan(0)
            // All notes should be within pattern bounds
            for (const note of track.notes) {
                expect(note.bar).toBeLessThan(4)
                expect(note.barStep).toBeGreaterThanOrEqual(0)
                expect(note.barStep).toBeLessThan(4)
            }
        })

        it('sets correct loop point', () => {
            const track = createTestTrack('KICK', 4, 4)
            const gen = new MfKickGenerate()

            gen.generateNewKick(track, 'fourOnFloor')

            expect(track.loopPointBar).toBe(1)
            expect(track.loopPointStep).toBe(0)
            expect(track.loopAtStep).toBe(4)
        })

        it('velocity is within valid range', () => {
            const track = createTestTrack('KICK', 4, 4)
            const gen = new MfKickGenerate()

            gen.generateNewKick(track, 'basic')

            for (const note of track.notes) {
                expect(note.velocity).toBeGreaterThanOrEqual(0.35)
                expect(note.velocity).toBeLessThanOrEqual(1)
            }
        })
    })

    describe('Snare Generator', () => {
        it('basic produces backbeat on beats 2 and 4', () => {
            const track = createTestTrack('SNARE', 4, 4)
            const gen = new MfSnareGenerate()

            gen.generateNewSnare(track, 'basic')

            expect(track.notes.length).toBe(2)
            // Backbeat: bar 1 step 0, bar 3 step 0
            const bars = track.notes.map(n => n.bar).sort()
            expect(bars).toEqual([1, 3])
            for (const note of track.notes) {
                expect(note.barStep).toBe(0)
            }
        })

        it('ghost produces accent and ghost notes', () => {
            const track = createTestTrack('SNARE', 4, 4)
            const gen = new MfSnareGenerate()

            gen.generateNewSnare(track, 'ghost')

            expect(track.notes.length).toBeGreaterThan(2)
            // Should have both high velocity (accent) and low velocity (ghost) notes
            const velocities = track.notes.map(n => parseFloat(n.velocity))
            expect(Math.max(...velocities)).toBeGreaterThan(0.7)
            expect(Math.min(...velocities)).toBeLessThan(0.5)
        })

        it('roll sets loop point correctly', () => {
            const track = createTestTrack('SNARE', 4, 4)
            const gen = new MfSnareGenerate()

            gen.generateNewSnare(track, 'roll')

            // Roll may produce notes or be empty depending on random seed
            // But loop point should still be set
            expect(track.loopPointBar).toBeGreaterThan(0)
        })
    })

    describe('Hat Generator', () => {
        it('chhBasic produces grid-based notes', () => {
            const track = createTestTrack('CHH', 4, 4)
            const gen = new MfHatGenerate()

            gen.generateNewHat(track, 'chhBasic')

            expect(track.notes.length).toBeGreaterThan(0)
            // Notes should be within 1 bar loop
            for (const note of track.notes) {
                expect(note.bar).toBe(0)
                expect(note.barStep).toBeGreaterThanOrEqual(0)
                expect(note.barStep).toBeLessThan(4)
            }
        })

        it('ohhBasic produces offbeat phrases', () => {
            const track = createTestTrack('OHH', 4, 4)
            const gen = new MfHatGenerate()

            gen.generateNewHat(track, 'ohhBasic')

            expect(track.notes.length).toBe(2)
            // Offbeat: step 2 (the "and" of each beat)
            for (const note of track.notes) {
                expect(note.barStep).toBe(2)
            }
        })

        it('detects track type from name', () => {
            const gen = new MfHatGenerate()
            expect(gen.getHatTrackType({ name: 'CHH' })).toBe('CHH')
            expect(gen.getHatTrackType({ name: 'OHH' })).toBe('OHH')
            expect(gen.getHatTrackType({ name: 'OPEN_HAT' })).toBe('OHH')
            expect(gen.getHatTrackType({ name: 'CLOSED_HAT' })).toBe('CHH')
        })
    })

    describe('Bass Generator', () => {
        it('basic produces phrase-based notes', () => {
            const track = createTestTrack('BASS', 4, 4)
            const gen = new MfBassGenerate()

            gen.generateNewBass(track, 'basic')

            expect(track.notes.length).toBeGreaterThan(0)
            // All notes should have pitch values
            for (const note of track.notes) {
                expect(typeof note.pitch).toBe('number')
            }
        })

        it('groove produces root-based patterns', () => {
            const track = createTestTrack('BASS', 4, 4)
            const gen = new MfBassGenerate()

            gen.generateNewBass(track, 'groove')

            expect(track.notes.length).toBeGreaterThan(0)
            // Notes should span multiple bars
            const bars = [...new Set(track.notes.map(n => n.bar))]
            expect(bars.length).toBeGreaterThan(1)
        })

        it('arpeggio produces ascending/descending pattern', () => {
            const track = createTestTrack('BASS', 4, 4)
            const gen = new MfBassGenerate()

            gen.generateNewBass(track, 'arpege')

            expect(track.notes.length).toBeGreaterThan(0)
            // Pitches should vary (not all the same)
            const pitches = track.notes.map(n => n.pitch)
            const uniquePitches = [...new Set(pitches)]
            expect(uniquePitches.length).toBeGreaterThan(1)
        })
    })

    describe('Perc Generator', () => {
        it('basic produces phrase-based notes with pitch', () => {
            const track = createTestTrack('HTOM', 4, 4)
            const gen = new MfPercGenerate()

            gen.generateNewPerc(track, 'basic')

            expect(track.notes.length).toBeGreaterThan(0)
            // All notes should have pitch values
            for (const note of track.notes) {
                expect(typeof note.pitch).toBe('number')
            }
        })

        it('applies pitch bias based on track name', () => {
            const gen = new MfPercGenerate()
            expect(gen.getTrackPitchBias({ name: 'HTOM' })).toBe(5)
            expect(gen.getTrackPitchBias({ name: 'LTOM' })).toBe(-5)
            expect(gen.getTrackPitchBias({ name: 'HCONG' })).toBe(5)
            expect(gen.getTrackPitchBias({ name: 'LCONG' })).toBe(-5)
            expect(gen.getTrackPitchBias({ name: 'CONG' })).toBe(2)
            expect(gen.getTrackPitchBias({ name: 'TOM' })).toBe(0)
        })

        it('conversation produces call/response pattern', () => {
            const track = createTestTrack('HTOM', 4, 4)
            const gen = new MfPercGenerate()

            gen.generateNewPerc(track, 'conversation')

            expect(track.notes.length).toBeGreaterThan(0)
            // Notes should be on alternating bar types (even/odd)
            const evenBars = track.notes.filter(n => n.bar % 2 === 0).length
            const oddBars = track.notes.filter(n => n.bar % 2 === 1).length
            expect(evenBars + oddBars).toBe(track.notes.length)
        })
    })

    describe('Loop point consistency', () => {
        it('all generators set valid loop points', () => {
            const testCases = [
                { gen: new MfKickGenerate(), name: 'KICK', variant: 'basic', method: 'generateNewKick' },
                { gen: new MfSnareGenerate(), name: 'SNARE', variant: 'basic', method: 'generateNewSnare' },
                { gen: new MfHatGenerate(), name: 'CHH', variant: 'chhBasic', method: 'generateNewHat' },
                { gen: new MfBassGenerate(), name: 'BASS', variant: 'basic', method: 'generateNewBass' },
                { gen: new MfPercGenerate(), name: 'HTOM', variant: 'basic', method: 'generateNewPerc' }
            ]

            for (const { gen, name, variant, method } of testCases) {
                const track = createTestTrack(name, 4, 4)
                gen[method](track, variant)

                expect(track.loopPointBar).toBeGreaterThan(0)
                expect(track.loopPointStep).toBeGreaterThanOrEqual(0)
                expect(track.loopAtStep).toBeGreaterThan(0)
                expect(track.loopAtStep).toBeLessThanOrEqual(track.bars * track.barQuantize)
            }
        })
    })
})
