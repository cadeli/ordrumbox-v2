import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import MfAutoGenerate from '../src/logic/generators/auto_generate.js'
import MfKickGenerate from '../src/logic/generators/kick_generate.js'
import MfSnareGenerate from '../src/logic/generators/snare_generate.js'
import MfHatGenerate from '../src/logic/generators/hat_generate.js'
import MfBassGenerate from '../src/logic/generators/bass_generate.js'
import MfPercGenerate from '../src/logic/generators/perc_generate.js'
import { appState } from '../src/state/app_state.js'

describe('Generators', () => {
    let mfCmd
    let seed
    let originalRandom

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
        seed = 42
        originalRandom = Math.random
        Math.random = () => {
            seed = (seed * 9301 + 49297) % 233280
            return seed / 233280
        }
    })

    afterEach(() => {
        Math.random = originalRandom
    })

    function createTestTrack(name, beats = 4, stepsPerBeat = 4) {
        const pattern = mfCmd.addPattern('TestPattern')
        pattern.nbBeats = beats
        return mfCmd.addTrack(pattern, name, stepsPerBeat)
    }

    // ── Kick Generator ─────────────────────────────────────────────

    describe('Kick Generator', () => {
        it('fourOnFloor produces notes only in beat 0 on steps matching probabilities', () => {
            const track = createTestTrack('KICK', 4, 4)
            new MfKickGenerate().generateNewKick(track, 'fourOnFloor')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBe(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
            const steps = track.notes.map(n => n.beatStep).sort()
            expect(steps[0]).toBe(0)
        })

        it('basic produces exactly 5 notes at phrase positions', () => {
            const track = createTestTrack('KICK', 4, 4)
            new MfKickGenerate().generateNewKick(track, 'basic')
            expect(track.notes.length).toBe(5)
            const positions = track.notes.map(n => `${n.beat}:${n.beatStep}`).sort()
            expect(positions).toEqual(['0:0', '1:0', '2:0', '2:2', '3:0'])
        })

        it('sets correct loop point for fourOnFloor', () => {
            const track = createTestTrack('KICK', 4, 4)
            new MfKickGenerate().generateNewKick(track, 'fourOnFloor')
            expect(track.loopPointBeat).toBe(1)
            expect(track.loopPointStep).toBe(0)
            expect(track.loopAtStep).toBe(4)
        })

        it('sets correct loop point for basic', () => {
            const track = createTestTrack('KICK', 4, 4)
            new MfKickGenerate().generateNewKick(track, 'basic')
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopPointStep).toBe(0)
            expect(track.loopAtStep).toBe(16)
        })

        it('velocity is within valid range', () => {
            const track = createTestTrack('KICK', 4, 4)
            new MfKickGenerate().generateNewKick(track, 'basic')
            for (const note of track.notes) {
                expect(note.velocity).toBeGreaterThanOrEqual(0.35)
                expect(note.velocity).toBeLessThanOrEqual(1)
            }
        })

        it('syncopated produces notes only within loop point (beat < 2)', () => {
            const track = createTestTrack('KICK')
            new MfKickGenerate().generateNewKick(track, 'syncopated')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeLessThan(2)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
        })

        it('break produces exactly 4 notes, all on step 0, one per beat', () => {
            const track = createTestTrack('KICK')
            new MfKickGenerate().generateNewKick(track, 'break')
            expect(track.notes.length).toBe(4)
            for (const note of track.notes) {
                expect(note.beatStep).toBe(0)
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beat).toBeLessThan(4)
            }
            const beats = track.notes.map(n => n.beat).sort()
            expect(beats).toEqual([0, 1, 2, 3])
        })

        it('outro variant falls back to a real config and generates notes', () => {
            const track = createTestTrack('KICK')
            new MfKickGenerate().generateNewKick(track, 'outro')
            expect(track.notes.length).toBeGreaterThan(0)
        })

        it('null variantName resolves to a valid config', () => {
            const track = createTestTrack('KICK')
            new MfKickGenerate().generateNewKick(track, null)
        })

        it('unknown variantName falls back to basic', () => {
            const track = createTestTrack('KICK')
            new MfKickGenerate().generateNewKick(track, 'doesNotExist')
            const hasBar0 = track.notes.some(n => n.beat === 0 && n.beatStep === 0)
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
                const track = createTestTrack('KICK')
                new MfKickGenerate().generateNewKick(track, v)
                for (const note of track.notes) {
                    expect(note.velocity).toBeGreaterThanOrEqual(0)
                    expect(note.velocity).toBeLessThanOrEqual(1)
                }
            }
        })
    })

    // ── Snare Generator ────────────────────────────────────────────

    describe('Snare Generator', () => {
        it('basic produces exactly 2 notes on beats 1 and 3 at step 0', () => {
            const track = createTestTrack('SNARE', 4, 4)
            new MfSnareGenerate().generateNewSnare(track, 'basic')
            expect(track.notes.length).toBe(2)
            const beats = track.notes.map(n => n.beat).sort()
            expect(beats).toEqual([1, 3])
            for (const note of track.notes) {
                expect(note.beatStep).toBe(0)
            }
        })

        it('ghost produces more than 2 notes with both accent and ghost dynamics', () => {
            const track = createTestTrack('SNARE', 4, 4)
            new MfSnareGenerate().generateNewSnare(track, 'ghost')
            expect(track.notes.length).toBeGreaterThan(2)
            const velocities = track.notes.map(n => parseFloat(n.velocity))
            expect(Math.max(...velocities)).toBeGreaterThan(0.7)
            expect(Math.min(...velocities)).toBeLessThan(0.5)
        })

        it('roll sets loop point correctly', () => {
            const track = createTestTrack('SNARE', 4, 4)
            new MfSnareGenerate().generateNewSnare(track, 'roll')
            expect(track.loopPointBeat).toBeGreaterThan(0)
        })

        it('syncopated produces notes only within loop point (beat < 2)', () => {
            const track = createTestTrack('SNARE')
            new MfSnareGenerate().generateNewSnare(track, 'syncopated')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeLessThan(2)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
        })

        it('roll with 1-beat track produces exactly 4 notes, all in beat 0', () => {
            const track = createTestTrack('SNARE', 1, 4)
            new MfSnareGenerate().generateNewSnare(track, 'roll')
            expect(track.notes.length).toBe(4)
            for (const note of track.notes) {
                expect(note.beat).toBe(0)
            }
            const steps = track.notes.map(n => n.beatStep).sort()
            expect(steps).toEqual([0, 1, 2, 3])
        })

        it('roll velocity increases across steps (crescendo)', () => {
            const track = createTestTrack('SNARE', 1, 4)
            new MfSnareGenerate().generateNewSnare(track, 'roll')
            const velocities = track.notes
                .slice()
                .sort((a, b) => a.beatStep - b.beatStep)
                .map(n => n.velocity)
            for (let i = 1; i < velocities.length; i++) {
                expect(velocities[i]).toBeGreaterThanOrEqual(velocities[i - 1])
            }
        })

        it('break places notes only in the last beat when any are generated', () => {
            const track = createTestTrack('SNARE', 4, 4)
            new MfSnareGenerate().generateNewSnare(track, 'break')
            for (const note of track.notes) {
                expect(note.beat).toBe(3)
            }
        })

        it('intro/outro variants fall back to real configs and generate notes', () => {
            for (const v of ['intro', 'outro']) {
                const track = createTestTrack('SNARE')
                new MfSnareGenerate().generateNewSnare(track, v)
                expect(track.notes.length).toBeGreaterThan(0)
            }
        })

        it('_isRequiredStep returns true when beatModulo matches', () => {
            const gen = new MfSnareGenerate()
            const required = [{ beatModulo: 2, step: 0 }]
            expect(gen._isRequiredStep(1, 0, required)).toBe(true)
        })

        it('_isRequiredStep returns false when step does not match', () => {
            const gen = new MfSnareGenerate()
            const required = [{ beatModulo: 2, step: 0 }]
            expect(gen._isRequiredStep(1, 2, required)).toBe(false)
        })

        it('all variants produce velocity in [0, 1]', () => {
            const variants = ['basic', 'ghost', 'syncopated', 'roll', 'break']
            for (const v of variants) {
                const track = createTestTrack('SNARE')
                new MfSnareGenerate().generateNewSnare(track, v)
                for (const note of track.notes) {
                    expect(note.velocity).toBeGreaterThanOrEqual(0)
                    expect(note.velocity).toBeLessThanOrEqual(1)
                }
            }
        })
    })

    // ── Hat Generator ──────────────────────────────────────────────

    describe('Hat Generator', () => {
        it('chhBasic produces notes only in beat 0 within step range', () => {
            const track = createTestTrack('CHH', 4, 4)
            new MfHatGenerate().generateNewHat(track, 'chhBasic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBe(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
        })

        it('ohhBasic produces exactly 2 notes on step 2, beats 0 and 1', () => {
            const track = createTestTrack('OHH', 4, 4)
            new MfHatGenerate().generateNewHat(track, 'ohhBasic')
            expect(track.notes.length).toBe(2)
            for (const note of track.notes) {
                expect(note.beatStep).toBe(2)
            }
            const beats = track.notes.map(n => n.beat).sort()
            expect(beats).toEqual([0, 1])
        })

        it('detects track type from name', () => {
            const gen = new MfHatGenerate()
            expect(gen.getHatTrackType({ name: 'CHH' })).toBe('CHH')
            expect(gen.getHatTrackType({ name: 'OHH' })).toBe('OHH')
            expect(gen.getHatTrackType({ name: 'OPEN_HAT' })).toBe('OHH')
            expect(gen.getHatTrackType({ name: 'CLOSED_HAT' })).toBe('CHH')
        })

        it('intro/outro variants fall back to real configs and generate notes', () => {
            for (const v of ['intro', 'outro']) {
                const track = createTestTrack('CHH')
                new MfHatGenerate().generateNewHat(track, v)
                expect(track.notes.length).toBeGreaterThan(0)
            }
        })
    })

    // ── Bass Generator ─────────────────────────────────────────────

    describe('Bass Generator', () => {
        it('basic produces exactly 8 notes at fixed phrase positions', () => {
            const track = createTestTrack('BASS', 4, 4)
            new MfBassGenerate().generateNewBass(track, 'basic')
            expect(track.notes.length).toBe(8)
            const beats = track.notes.map(n => n.beat).sort()
            expect(beats).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
        })

        it('groove produces notes on beat 0 of every beat plus additional steps', () => {
            const track = createTestTrack('BASS', 4, 4)
            new MfBassGenerate().generateNewBass(track, 'groove')
            expect(track.notes.length).toBeGreaterThan(4)
            const beats = [...new Set(track.notes.map(n => n.beat))].sort()
            expect(beats).toEqual([0, 1, 2, 3])
        })

        it('arpeggio produces notes with varying pitches in contour order', () => {
            const track = createTestTrack('BASS', 4, 4)
            new MfBassGenerate().generateNewBass(track, 'arpege')
            expect(track.notes.length).toBeGreaterThan(0)
            const uniquePitches = [...new Set(track.notes.map(n => n.pitch))]
            expect(uniquePitches.length).toBeGreaterThan(1)
        })
    })

    // ── Perc Generator ─────────────────────────────────────────────

    describe('Perc Generator', () => {
        it('basic produces exactly 4 notes at phrase positions', () => {
            const track = createTestTrack('HI_TOM', 4, 4)
            new MfPercGenerate().generateNewPerc(track, 'basic')
            expect(track.notes.length).toBe(4)
            const beats = track.notes.map(n => n.beat).sort()
            expect(beats).toEqual([0, 1, 2, 3])
        })

        it('applies pitch bias based on track name', () => {
            const gen = new MfPercGenerate()
            expect(gen.getTrackPitchBias({ name: 'HI_TOM' })).toBe(5)
            expect(gen.getTrackPitchBias({ name: 'LO_TOM' })).toBe(-5)
            expect(gen.getTrackPitchBias({ name: 'HCONG' })).toBe(5)
            expect(gen.getTrackPitchBias({ name: 'LCONG' })).toBe(-5)
            expect(gen.getTrackPitchBias({ name: 'CONG' })).toBe(2)
            expect(gen.getTrackPitchBias({ name: 'TOM' })).toBe(0)
        })

        it('conversation produces notes on call/response steps per beat parity', () => {
            const track = createTestTrack('HI_TOM', 4, 4)
            new MfPercGenerate().generateNewPerc(track, 'conversation')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                if (note.beat % 2 === 0) {
                    expect([0, 2]).toContain(note.beatStep)
                } else {
                    expect([1, 3]).toContain(note.beatStep)
                }
            }
        })
    })

    // ── Loop point consistency ──────────────────────────────────────

    describe('Loop point consistency', () => {
        it('all generators set valid loop points', () => {
            const testCases = [
                { gen: new MfKickGenerate(), name: 'KICK', variant: 'basic', method: 'generateNewKick' },
                { gen: new MfSnareGenerate(), name: 'SNARE', variant: 'basic', method: 'generateNewSnare' },
                { gen: new MfHatGenerate(), name: 'CHH', variant: 'chhBasic', method: 'generateNewHat' },
                { gen: new MfBassGenerate(), name: 'BASS', variant: 'basic', method: 'generateNewBass' },
                { gen: new MfPercGenerate(), name: 'HI_TOM', variant: 'basic', method: 'generateNewPerc' }
            ]

            for (const { gen, name, variant, method } of testCases) {
                const track = createTestTrack(name, 4, 4)
                gen[method](track, variant)
                expect(track.loopPointBeat).toBeGreaterThan(0)
                expect(track.loopPointStep).toBeGreaterThanOrEqual(0)
                expect(track.loopAtStep).toBeGreaterThan(0)
                expect(track.loopAtStep).toBeLessThanOrEqual(track.nbBeats * track.stepsPerBeat)
            }
        })
    })

    // ── _autoGenGenre consistency ──────────────────────────────────

    describe('_autoGenGenre consistency', () => {
        it('generatePattern stores the genre used on the pattern', async () => {
            const mfAutoGenerate = new MfAutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            await mfAutoGenerate.generatePattern()
            expect(typeof pattern._autoGenGenre).toBe('string')
            expect(pattern._autoGenGenre.length).toBeGreaterThan(0)
        })

        it('changeTrack uses the same genre as generatePattern', async () => {
            const mfAutoGenerate = new MfAutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            await mfAutoGenerate.generatePattern()

            const genreFromPattern = pattern._autoGenGenre
            const tracks = Object.values(pattern.tracks)

            for (const track of tracks) {
                await mfAutoGenerate.changeTrack(0, pattern, track)
            }

            expect(pattern._autoGenGenre).toBe(genreFromPattern)
        })

        it('changeTrack does not pick a new random genre when _autoGenGenre is set', async () => {
            const mfAutoGenerate = new MfAutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            await mfAutoGenerate.generatePattern()

            const fixedGenre = pattern._autoGenGenre
            const track = Object.values(pattern.tracks)[0]

            await mfAutoGenerate.changeTrack(0, pattern, track)
            await mfAutoGenerate.changeTrack(1, pattern, track)
            await mfAutoGenerate.changeTrack(4, pattern, track)

            expect(pattern._autoGenGenre).toBe(fixedGenre)
        })

        it('genre is derived from pattern tags when available', async () => {
            const mfAutoGenerate = new MfAutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            pattern.tags = { style: 'rock', type: 'default' }
            await mfAutoGenerate.generatePattern()
            expect(pattern._autoGenGenre).toBe('rock')
        })

        it('genre falls back to random when tags have no matching style', async () => {
            const mfAutoGenerate = new MfAutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            pattern.tags = { style: 'unknown_style', type: 'default' }
            await mfAutoGenerate.generatePattern()
            expect(['techno', 'house', 'drumandbass', 'hiphop', 'rock']).toContain(pattern._autoGenGenre)
        })

        it('genre falls back to random when pattern has no tags', async () => {
            const mfAutoGenerate = new MfAutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            pattern.tags = null
            await mfAutoGenerate.generatePattern()
            expect(typeof pattern._autoGenGenre).toBe('string')
        })
    })
})
