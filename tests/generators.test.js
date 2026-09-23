import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import AutoGenerate from '../src/logic/generators/auto_generate.js'
import KickGenerate from '../src/logic/generators/kick_generate.js'
import SnareGenerate from '../src/logic/generators/snare_generate.js'
import HatGenerate from '../src/logic/generators/hat_generate.js'
import BassGenerate from '../src/logic/generators/bass_generate.js'
import PercGenerate from '../src/logic/generators/perc_generate.js'
import RandomGenerate from '../src/logic/generators/random_generate.js'
import ClapGenerate from '../src/logic/generators/clap_generate.js'
import CowbellGenerate from '../src/logic/generators/cowbell_generate.js'
import MelodyGenerate from '../src/logic/generators/melody_generate.js'
import Utils from '../src/core/utils.js'
import { appState } from '../src/state/app_state.js'
import { makeTrack, makeNote, PARAM_SETS } from './helpers/make_pattern.js'
import * as patternsManager from '../src/patterns/manager.js'

describe('Generators', () => {
    let cmd
    let seed
    let originalRandom

    beforeEach(() => {
        serviceRegistry.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
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

    // ── Kick Generator ─────────────────────────────────────────────

    describe('Kick Generator', () => {
        it('fourOnFloor produces notes only in beat 0 on steps matching probabilities', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'fourOnFloor')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBe(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
            const steps = track.notes.map((n) => n.beatStep).sort()
            expect(steps[0]).toBe(0)
        })

        it('basic produces exactly 5 notes at phrase positions', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'basic')
            expect(track.notes.length).toBe(5)
            const positions = track.notes.map((n) => `${n.beat}:${n.beatStep}`).sort()
            expect(positions).toEqual(['0:0', '1:0', '2:0', '2:2', '3:0'])
        })

        it('sets correct loop point for fourOnFloor', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'fourOnFloor')
            expect(track.loopPointBeat).toBe(1)
            expect(track.loopPointStep).toBe(0)
            expect(track.loopAtStep).toBe(4)
        })

        it('sets correct loop point for basic', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'basic')
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopPointStep).toBe(0)
            expect(track.loopAtStep).toBe(16)
        })

        it('velocity is within valid range', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'basic')
            for (const note of track.notes) {
                expect(note.velocity).toBeGreaterThanOrEqual(0.35)
                expect(note.velocity).toBeLessThanOrEqual(1)
            }
        })

        it('syncopated produces notes only within loop point (beat < 2)', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'syncopated')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeLessThan(2)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
        })

        it('break produces exactly 4 notes, all on step 0, one per beat', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'break')
            expect(track.notes.length).toBe(4)
            for (const note of track.notes) {
                expect(note.beatStep).toBe(0)
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beat).toBeLessThan(4)
            }
            const beats = track.notes.map((n) => n.beat).sort()
            expect(beats).toEqual([0, 1, 2, 3])
        })

        it('outro variant falls back to a real config and generates notes', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'outro')
            expect(track.notes.length).toBeGreaterThan(0)
        })

        it('null variantName resolves to a valid config', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, null)
        })

        it('unknown variantName falls back to basic', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'doesNotExist')
            const hasBar0 = track.notes.some((n) => n.beat === 0 && n.beatStep === 0)
            expect(hasBar0).toBe(true)
        })

        it('getRndVariantName excludes break variant', () => {
            const gen = new KickGenerate()
            for (let i = 0; i < 20; i++) {
                expect(gen.getRndVariantName()).not.toBe('break')
            }
        })

        it('all variants produce notes with velocity in [0, 1]', () => {
            const variants = ['fourOnFloor', 'basic', 'syncopated', 'break']
            for (const v of variants) {
                const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
                new KickGenerate().generateNewKick(track, v)
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
            const track = makeTrack('SNARE', [], { nbBeats: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'basic')
            expect(track.notes.length).toBe(2)
            const beats = track.notes.map((n) => n.beat).sort()
            expect(beats).toEqual([1, 3])
            for (const note of track.notes) {
                expect(note.beatStep).toBe(0)
            }
        })

        it('ghost produces more than 2 notes with both accent and ghost dynamics', () => {
            const track = makeTrack('SNARE', [], { nbBeats: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'ghost')
            expect(track.notes.length).toBeGreaterThan(2)
            const velocities = track.notes.map((n) => parseFloat(n.velocity))
            expect(Math.max(...velocities)).toBeGreaterThan(0.7)
            expect(Math.min(...velocities)).toBeLessThan(0.5)
        })

        it('roll sets loop point correctly', () => {
            const track = makeTrack('SNARE', [], { nbBeats: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'roll')
            expect(track.loopPointBeat).toBeGreaterThan(0)
        })

        it('syncopated produces notes only within loop point (beat < 2)', () => {
            const track = makeTrack('SNARE', [], { nbBeats: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'syncopated')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeLessThan(2)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
        })

        it('roll with 1-beat track produces exactly 4 notes, all in beat 0', () => {
            const track = makeTrack('SNARE', [], { nbBeats: 1, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'roll')
            expect(track.notes.length).toBe(4)
            for (const note of track.notes) {
                expect(note.beat).toBe(0)
            }
            const steps = track.notes.map((n) => n.beatStep).sort()
            expect(steps).toEqual([0, 1, 2, 3])
        })

        it('roll velocity increases across steps (crescendo)', () => {
            const track = makeTrack('SNARE', [], { nbBeats: 1, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'roll')
            const velocities = track.notes
                .slice()
                .sort((a, b) => a.beatStep - b.beatStep)
                .map((n) => n.velocity)
            for (let i = 1; i < velocities.length; i++) {
                expect(velocities[i]).toBeGreaterThanOrEqual(velocities[i - 1])
            }
        })

        it('break places notes only in the last beat when any are generated', () => {
            const track = makeTrack('SNARE', [], { nbBeats: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'break')
            for (const note of track.notes) {
                expect(note.beat).toBe(3)
            }
        })

        it('intro/outro variants fall back to real configs and generate notes', () => {
            for (const v of ['intro', 'outro']) {
                const track = makeTrack('SNARE', [], { nbBeats: 4, stepsPerBeat: 4 })
                new SnareGenerate().generateNewSnare(track, v)
                expect(track.notes.length).toBeGreaterThan(0)
            }
        })

        it('_isRequiredStep returns true when beatModulo matches', () => {
            const gen = new SnareGenerate()
            const required = [{ beatModulo: 2, step: 0 }]
            expect(gen._isRequiredStep(1, 0, required)).toBe(true)
        })

        it('_isRequiredStep returns false when step does not match', () => {
            const gen = new SnareGenerate()
            const required = [{ beatModulo: 2, step: 0 }]
            expect(gen._isRequiredStep(1, 2, required)).toBe(false)
        })

        it('all variants produce velocity in [0, 1]', () => {
            const variants = ['basic', 'ghost', 'syncopated', 'roll', 'break']
            for (const v of variants) {
                const track = makeTrack('SNARE', [], { nbBeats: 4, stepsPerBeat: 4 })
                new SnareGenerate().generateNewSnare(track, v)
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
            const track = makeTrack('CHH', [], { nbBeats: 4, stepsPerBeat: 4 })
            new HatGenerate().generateNewHat(track, 'chhBasic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBe(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
        })

        it('ohhBasic produces exactly 2 notes on step 2, beats 0 and 1', () => {
            const track = makeTrack('OHH', [], { nbBeats: 4, stepsPerBeat: 4 })
            new HatGenerate().generateNewHat(track, 'ohhBasic')
            expect(track.notes.length).toBe(2)
            for (const note of track.notes) {
                expect(note.beatStep).toBe(2)
            }
            const beats = track.notes.map((n) => n.beat).sort()
            expect(beats).toEqual([0, 1])
        })

        it('detects track type from name', () => {
            const gen = new HatGenerate()
            expect(gen.getHatTrackType({ name: 'CHH' })).toBe('CHH')
            expect(gen.getHatTrackType({ name: 'OHH' })).toBe('OHH')
            expect(gen.getHatTrackType({ name: 'OPEN_HAT' })).toBe('OHH')
            expect(gen.getHatTrackType({ name: 'CLOSED_HAT' })).toBe('CHH')
        })

        it('intro/outro variants fall back to real configs and generate notes', () => {
            for (const v of ['intro', 'outro']) {
                const track = makeTrack('CHH', [], { nbBeats: 4, stepsPerBeat: 4 })
                new HatGenerate().generateNewHat(track, v)
                expect(track.notes.length).toBeGreaterThan(0)
            }
        })
    })

    // ── Bass Generator ─────────────────────────────────────────────

    describe('Bass Generator', () => {
        it('basic produces exactly 8 notes at fixed phrase positions', () => {
            const track = makeTrack('BASS', [], { nbBeats: 4, stepsPerBeat: 4 })
            new BassGenerate().generateNewBass(track, 'basic')
            expect(track.notes.length).toBe(8)
            const beats = track.notes.map((n) => n.beat).sort()
            expect(beats).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
        })

        it('groove produces notes on beat 0 of every beat plus additional steps', () => {
            const track = makeTrack('BASS', [], { nbBeats: 4, stepsPerBeat: 4 })
            new BassGenerate().generateNewBass(track, 'groove')
            expect(track.notes.length).toBeGreaterThan(4)
            const beats = [...new Set(track.notes.map((n) => n.beat))].sort()
            expect(beats).toEqual([0, 1, 2, 3])
        })

        it('arpeggio produces notes with varying pitches in contour order', () => {
            const track = makeTrack('BASS', [], { nbBeats: 4, stepsPerBeat: 4 })
            new BassGenerate().generateNewBass(track, 'arpege')
            expect(track.notes.length).toBeGreaterThan(0)
            const uniquePitches = [...new Set(track.notes.map((n) => n.pitch))]
            expect(uniquePitches.length).toBeGreaterThan(1)
        })
    })

    // ── Perc Generator ─────────────────────────────────────────────

    describe('Perc Generator', () => {
        it('basic produces exactly 4 notes at phrase positions', () => {
            const track = makeTrack('HI_TOM', [], { nbBeats: 4, stepsPerBeat: 4 })
            new PercGenerate().generateNewPerc(track, 'basic')
            expect(track.notes.length).toBe(4)
            const beats = track.notes.map((n) => n.beat).sort()
            expect(beats).toEqual([0, 1, 2, 3])
        })

        it('applies pitch bias based on track name', () => {
            const gen = new PercGenerate()
            expect(gen.getTrackPitchBias({ name: 'HI_TOM' })).toBe(5)
            expect(gen.getTrackPitchBias({ name: 'LO_TOM' })).toBe(-5)
            expect(gen.getTrackPitchBias({ name: 'HCONG' })).toBe(5)
            expect(gen.getTrackPitchBias({ name: 'LCONG' })).toBe(-5)
            expect(gen.getTrackPitchBias({ name: 'CONG' })).toBe(2)
            expect(gen.getTrackPitchBias({ name: 'TOM' })).toBe(0)
        })

        it('conversation produces notes on call/response steps per beat parity', () => {
            const track = makeTrack('HI_TOM', [], { nbBeats: 4, stepsPerBeat: 4 })
            new PercGenerate().generateNewPerc(track, 'conversation')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                if (note.beat % 2 === 0) {
                    expect([0, 2]).toContain(note.beatStep)
                } else {
                    expect([1, 3]).toContain(note.beatStep)
                }
            }
        })

        it('conversation: all notes land within beats 0..3', () => {
            const track = makeTrack('PERC', [], { nbBeats: 4 })
            new PercGenerate().generateNewPerc(track, 'conversation')
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beat).toBeLessThan(4)
            }
        })

        it('conversation: produces at least one note over repeated generation', () => {
            let totalNotes = 0
            for (let i = 0; i < 5; i++) {
                const track = makeTrack('PERC', [], { nbBeats: 4 })
                new PercGenerate().generateNewPerc(track, 'conversation')
                totalNotes += track.notes.length
            }
            expect(totalNotes).toBeGreaterThan(0)
        })

        it('all variants produce notes with velocity in [0,1]', () => {
            for (const variant of ['basic', 'conversation']) {
                const track = makeTrack('PERC')
                new PercGenerate().generateNewPerc(track, variant)
                for (const note of track.notes) {
                    expect(note.velocity).toBeGreaterThanOrEqual(0)
                    expect(note.velocity).toBeLessThanOrEqual(1)
                }
            }
        })

        it('resolvePhrasePitch: returns pitch+pitchBias for numeric phrase.pitch', () => {
            const gen = new PercGenerate()
            const result = gen.resolvePhrasePitch({ pitch: 5 }, [0, 4, 7], {}, 3)
            expect(result).toBe(8)
        })

        it('resolvePhrasePitch: reuse returns cached pitch', () => {
            const gen = new PercGenerate()
            const cached = { 0: 12 }
            const result = gen.resolvePhrasePitch({ source: 'reuse', reuseIndex: 0 }, [0, 4, 7], cached, 0)
            expect(result).toBe(12)
        })

        it('resolvePhrasePitch: root returns pitchBias', () => {
            const gen = new PercGenerate()
            const result = gen.resolvePhrasePitch({ source: 'root' }, [0, 4, 7], {}, 5)
            expect(result).toBe(5)
        })

        it('resolvePhrasePitch: randomScale picks from tones + pitchBias', () => {
            const gen = new PercGenerate()
            const tones = [0, 4, 7]
            const result = gen.resolvePhrasePitch({ source: 'randomScale' }, tones, {}, 3)
            const allPossible = tones.map((t) => (t > 6 ? t - 12 : t) + 3)
            expect(allPossible).toContain(result)
        })

        it('generatePercCallResponseVariant produces notes within loopPointAbsolute', () => {
            const track = makeTrack('PERC', [], { nbBeats: 4 })
            const gen = new PercGenerate()
            const tones = [0, 4, 7]
            const config = {
                loopPointBeat: 4,
                loopPointStep: 0,
                callSteps: [0, 2],
                responseSteps: [1, 3],
                density: 1.0,
                velocity: {
                    base: 0.6,
                    accentOnBeat: 0.1,
                    variationBoost: 0.05,
                    randomSpread: 0.05,
                    clampMin: 0.2,
                    clampMax: 1,
                },
            }
            gen.generatePercCallResponseVariant(track, tones, 0, config)
            for (const note of track.notes) {
                const abs = note.beat * 4 + note.beatStep
                expect(abs).toBeLessThan(16)
            }
        })

        it('generatePercFillVariant places notes at startBar', () => {
            const track = makeTrack('PERC', [], { nbBeats: 4 })
            const gen = new PercGenerate()
            const config = {
                loopPointBeat: 4,
                loopPointStep: 0,
                startBarOffset: 1,
                steps: [0, 1, 2],
                velocity: {
                    base: 0.6,
                    accentOnBeat: 0.1,
                    variationBoost: 0.05,
                    randomSpread: 0.05,
                    clampMin: 0.2,
                    clampMax: 1,
                },
            }
            gen.generatePercFillVariant(track, [0, 4, 7], 0, config)
            for (const note of track.notes) {
                expect(note.beat).toBe(3)
            }
        })

        it('loop point is set after generation', () => {
            const track = makeTrack('PERC')
            new PercGenerate().generateNewPerc(track, 'basic')
            expect(track.loopPointBeat).toBeGreaterThan(0)
        })
    })

    // ── AutoGenerate dispatch ──────────────────────────────────────

    describe('AutoGenerate dispatch', () => {
        beforeEach(() => {
            serviceRegistry.patterns = patternsManager
            soundRegistry.scales = { 'pentatonic minor': [0, 3, 5, 7, 10] }
        })

        it.each([
            ['KICK', 'KICK'],
            ['KICK2', 'KICK'],
            ['BD', 'KICK'],
            ['SNARE', 'SNARE'],
            ['SD', 'SNARE'],
            ['CHH', 'HAT'],
            ['OHH', 'HAT'],
            ['HAT_TOP', 'HAT'],
            ['BASS', 'BASS'],
            ['SYNTH1', 'BASS'],
            ['PERC', 'PERC'],
            ['COWBELL', 'COWBELL'],
            ['CLAP', 'CLAP'],
        ])('detectTrackType("%s") → "%s"', (name, expected) => {
            expect(Utils.detectTrackType(name)).toBe(expected)
        })

        it.each(['KICK', 'SNARE', 'CHH', 'BASS', 'PERC'])('generateTrack for %s does not throw', async (name) => {
            const pattern = cmd.addPattern('T')
            const track = cmd.addTrack(pattern, name, 4)
            track.nbBeats = 4
            const autoGen = new AutoGenerate()
            await expect(autoGen.generateTrack(track, 'basic')).resolves.not.toThrow()
        })

        it('generateTrack for COWBELL runs the cowbell generator', async () => {
            const pattern = cmd.addPattern('T')
            const track = cmd.addTrack(pattern, 'COWBELL', 4)
            track.nbBeats = 4
            const autoGen = new AutoGenerate()
            await expect(autoGen.generateTrack(track, 'basic')).resolves.not.toThrow()
        })

        it('changeTrack clears track notes and regenerates', async () => {
            const pattern = cmd.addPattern('T')
            const track = cmd.addTrack(pattern, 'KICK', 4)
            track.nbBeats = 4
            cmd.addNote(track, 0, 0, 0)
            const applySpy = vi.fn()
            serviceRegistry.patterns = { ...patternsManager, applyFlatNotes: applySpy }
            const autoGen = new AutoGenerate()

            await autoGen.changeTrack(0, pattern, track)

            expect(Array.isArray(track.notes)).toBe(true)
            expect(applySpy).toHaveBeenCalledWith(pattern)
        })

        it('changeTrack works for non-KICK track types', async () => {
            const pattern = cmd.addPattern('T')
            const track = cmd.addTrack(pattern, 'SNARE', 4)
            track.nbBeats = 4
            const autoGen = new AutoGenerate()
            await expect(autoGen.changeTrack(0, pattern, track)).resolves.not.toThrow()
        })
    })

    // ── Loop point consistency ──────────────────────────────────────

    describe('Loop point consistency', () => {
        it('all generators set valid loop points', () => {
            const testCases = [
                { gen: new KickGenerate(), name: 'KICK', variant: 'basic', method: 'generateNewKick' },
                { gen: new SnareGenerate(), name: 'SNARE', variant: 'basic', method: 'generateNewSnare' },
                { gen: new HatGenerate(), name: 'CHH', variant: 'chhBasic', method: 'generateNewHat' },
                { gen: new BassGenerate(), name: 'BASS', variant: 'basic', method: 'generateNewBass' },
                { gen: new PercGenerate(), name: 'HI_TOM', variant: 'basic', method: 'generateNewPerc' },
            ]

            for (const { gen, name, variant, method } of testCases) {
                const track = makeTrack(name, [], { nbBeats: 4, stepsPerBeat: 4 })
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
        beforeEach(() => {
            if (appState.patterns.length === 0) {
                cmd.addPattern('TestPattern')
            }
        })

        it('generatePattern stores the genre used on the pattern', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            await autoGen.generatePattern()
            expect(typeof pattern._autoGenGenre).toBe('string')
            expect(pattern._autoGenGenre.length).toBeGreaterThan(0)
        })

        it('changeTrack uses the same genre as generatePattern', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            await autoGen.generatePattern()

            const genreFromPattern = pattern._autoGenGenre
            const tracks = Object.values(pattern.tracks)

            for (const track of tracks) {
                await autoGen.changeTrack(0, pattern, track)
            }

            expect(pattern._autoGenGenre).toBe(genreFromPattern)
        })

        it('changeTrack does not pick a new random genre when _autoGenGenre is set', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            await autoGen.generatePattern()

            const fixedGenre = pattern._autoGenGenre
            const track = Object.values(pattern.tracks)[0]

            await autoGen.changeTrack(0, pattern, track)
            await autoGen.changeTrack(1, pattern, track)
            await autoGen.changeTrack(4, pattern, track)

            expect(pattern._autoGenGenre).toBe(fixedGenre)
        })

        it('genre is derived from pattern tags when available', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            pattern.tags = { style: 'rock', type: 'default' }
            await autoGen.generatePattern()
            expect(pattern._autoGenGenre).toBe('rock')
        })

        it('genre falls back to random when tags have no matching style', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            pattern.tags = { style: 'unknown_style', type: 'default' }
            await autoGen.generatePattern()
            expect(['techno', 'house', 'drumandbass', 'hiphop', 'rock']).toContain(pattern._autoGenGenre)
        })

        it('genre falls back to random when pattern has no tags', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternNum]
            pattern.tags = null
            await autoGen.generatePattern()
            expect(typeof pattern._autoGenGenre).toBe('string')
        })
    })

    // ── Parameterized: generators across different subdivisions ───────────────

    describe.each(PARAM_SETS)('KickGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        it('fourOnFloor produces notes within step range', () => {
            const track = makeTrack('KICK', [], { nbBeats, stepsPerBeat })
            new KickGenerate().generateNewKick(track, 'fourOnFloor')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(stepsPerBeat)
            }
        })

        it('basic produces notes at phrase positions', () => {
            const track = makeTrack('KICK', [], { nbBeats, stepsPerBeat })
            new KickGenerate().generateNewKick(track, 'basic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(stepsPerBeat)
            }
        })

        it('loop point is valid', () => {
            const track = makeTrack('KICK', [], { nbBeats, stepsPerBeat })
            new KickGenerate().generateNewKick(track, 'basic')
            expect(track.loopPointBeat).toBeGreaterThan(0)
            expect(track.loopAtStep).toBeGreaterThan(0)
        })
    })

    describe.each(PARAM_SETS)('SnareGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        it('basic produces notes within step range', () => {
            const track = makeTrack('SNARE', [], { nbBeats, stepsPerBeat })
            new SnareGenerate().generateNewSnare(track, 'basic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(stepsPerBeat)
            }
        })

        it('ghost produces more notes than basic', () => {
            const basicTrack = makeTrack('SNARE', [], { nbBeats, stepsPerBeat })
            new SnareGenerate().generateNewSnare(basicTrack, 'basic')
            const ghostTrack = makeTrack('SNARE', [], { nbBeats, stepsPerBeat })
            new SnareGenerate().generateNewSnare(ghostTrack, 'ghost')
            expect(ghostTrack.notes.length).toBeGreaterThanOrEqual(basicTrack.notes.length)
        })
    })

    describe.each(PARAM_SETS)('HatGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        it('chhBasic produces notes within step range', () => {
            const track = makeTrack('CHH', [], { nbBeats, stepsPerBeat })
            new HatGenerate().generateNewHat(track, 'chhBasic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(stepsPerBeat)
            }
        })
    })

    describe.each(PARAM_SETS)('BassGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        it('basic produces notes', () => {
            const track = makeTrack('BASS', [], { nbBeats, stepsPerBeat })
            new BassGenerate().generateNewBass(track, 'basic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
            }
        })
    })

    describe.each(PARAM_SETS)('PercGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        it('basic produces notes', () => {
            const track = makeTrack('HI_TOM', [], { nbBeats, stepsPerBeat })
            new PercGenerate().generateNewPerc(track, 'basic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
            }
        })
    })

    // ── Clap Generator ─────────────────────────────────────────────

    describe('Clap Generator', () => {
        it.each(['backbeat', 'offbeat', 'sparse', 'fourOnFloor', 'syncopated', 'dense'])(
            'variant %s produces notes within grid bounds',
            (variant) => {
                Math.random = () => 0
                const track = makeTrack('CLAP', [], { nbBeats: 4, stepsPerBeat: 4 })
                new ClapGenerate().generateNewClap(track, variant)
                expect(track.notes.length).toBeGreaterThan(0)
                for (const note of track.notes) {
                    expect(note.beat).toBeGreaterThanOrEqual(0)
                    expect(note.beat).toBeLessThan(4)
                    expect(note.beatStep).toBeGreaterThanOrEqual(0)
                    expect(note.beatStep).toBeLessThan(4)
                    expect(note.velocity).toBeGreaterThanOrEqual(0)
                    expect(note.velocity).toBeLessThanOrEqual(1)
                }
            },
        )

        it('backbeat places notes on beats 1 and 3', () => {
            const track = makeTrack('CLAP', [], { nbBeats: 4, stepsPerBeat: 4 })
            new ClapGenerate().generateNewClap(track, 'backbeat')
            const beats = [...new Set(track.notes.map((n) => n.beat))].sort()
            expect(beats).toEqual([1, 3])
        })

        it('sets loop point from config', () => {
            const track = makeTrack('CLAP', [], { nbBeats: 4, stepsPerBeat: 4 })
            new ClapGenerate().generateNewClap(track, 'backbeat')
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopAtStep).toBe(16)
        })

        it('clears previous notes before generating', () => {
            const track = makeTrack('CLAP', [makeNote(0, 0)], { nbBeats: 4, stepsPerBeat: 4 })
            new ClapGenerate().generateNewClap(track, 'backbeat')
            const positions = track.notes.map((n) => `${n.beat}:${n.beatStep}`)
            expect(new Set(positions).size).toBe(positions.length)
            expect(track.notes.some((n) => n.beat === 0 && n.beatStep === 0)).toBe(false)
        })
    })

    // ── Cowbell Generator ──────────────────────────────────────────

    describe('Cowbell Generator', () => {
        it.each(['basic', 'offbeat', 'dense', 'sparse', 'syncopated'])(
            'variant %s produces notes within grid bounds',
            async (variant) => {
                Math.random = () => 0
                const track = makeTrack('COWBELL', [], { nbBeats: 4, stepsPerBeat: 4 })
                await new CowbellGenerate().generateNewCowbell(track, variant)
                expect(track.notes.length).toBeGreaterThan(0)
                for (const note of track.notes) {
                    expect(note.beat).toBeGreaterThanOrEqual(0)
                    expect(note.beat).toBeLessThan(4)
                    expect(note.beatStep).toBeGreaterThanOrEqual(0)
                    expect(note.beatStep).toBeLessThan(4)
                    expect(note.velocity).toBeGreaterThanOrEqual(0)
                    expect(note.velocity).toBeLessThanOrEqual(1)
                }
            },
        )

        it('basic places a note on each beat step 0', async () => {
            const track = makeTrack('COWBELL', [], { nbBeats: 4, stepsPerBeat: 4 })
            await new CowbellGenerate().generateNewCowbell(track, 'basic')
            const beats = track.notes.map((n) => n.beat).sort()
            expect(beats).toEqual([0, 1, 2, 3])
            for (const note of track.notes) expect(note.beatStep).toBe(0)
        })

        it('sets loop point from config', async () => {
            const track = makeTrack('COWBELL', [], { nbBeats: 4, stepsPerBeat: 4 })
            await new CowbellGenerate().generateNewCowbell(track, 'basic')
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopAtStep).toBe(16)
        })
    })

    // ── Melody Generator ───────────────────────────────────────────

    describe('Melody Generator', () => {
        it('chordStab stacks chord tones on beats 0 and 2', () => {
            const track = makeTrack('PIANO', [], { nbBeats: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'chordStab')
            expect(track.notes.length).toBeGreaterThanOrEqual(3)
            const beats = [...new Set(track.notes.map((n) => n.beat))].sort()
            expect(beats).toEqual([0, 2])
        })

        it('break places notes only on the last beat', () => {
            const track = makeTrack('PIANO', [], { nbBeats: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'break')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) expect(note.beat).toBe(3)
        })

        it('intro and outro are no-ops (notes untouched)', () => {
            for (const variant of ['intro', 'outro']) {
                const track = makeTrack('PIANO', [makeNote(0, 0)], { nbBeats: 4, stepsPerBeat: 4 })
                new MelodyGenerate().generateNewMelody(track, variant)
                expect(track.notes).toHaveLength(1)
            }
        })

        it('arpeggio attaches arp config to generated notes', () => {
            const track = makeTrack('PIANO', [], { nbBeats: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'arpeggio')
            expect(track.notes.length).toBeGreaterThan(0)
            const withArp = track.notes.filter((n) => n.arp)
            expect(withArp.length).toBeGreaterThan(0)
            expect(withArp[0].retriggerNum).toBe(4)
            expect(withArp[0].rate).toBe(16)
        })

        it('walking (groove) produces notes on strong beats', () => {
            const track = makeTrack('PIANO', [], { nbBeats: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'walking')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
            expect(track.notes.some((n) => n.beatStep === 0)).toBe(true)
        })

        it('reggae places notes on offbeat steps 2 and 3', () => {
            const track = makeTrack('PIANO', [], { nbBeats: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'reggae')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect([2, 3]).toContain(note.beatStep)
            }
        })

        it('sparse produces notes with pitches from the scale', () => {
            const track = makeTrack('PIANO', [], { nbBeats: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'sparse')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(typeof note.pitch).toBe('number')
                expect(note.velocity).toBeGreaterThanOrEqual(0)
                expect(note.velocity).toBeLessThanOrEqual(1)
            }
        })

        it('respects harmony root offset', () => {
            const flat = makeTrack('PIANO', [], { nbBeats: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(flat, 'sparse', 1, null, { root: 0, scale: null })
            const raised = makeTrack('PIANO', [], { nbBeats: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(raised, 'sparse', 1, null, { root: 12, scale: null })
            const minFlat = Math.min(...flat.notes.map((n) => n.pitch))
            const minRaised = Math.min(...raised.notes.map((n) => n.pitch))
            expect(minRaised).toBeGreaterThanOrEqual(minFlat + 12)
        })

        it('sets loop point from config', () => {
            const track = makeTrack('PIANO', [], { nbBeats: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'chordStab')
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopAtStep).toBe(16)
        })
    })

    // ── RandomGenerate ─────────────────────────────────────────────

    describe('RandomGenerate', () => {
        it('produces at least one note within grid bounds', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            new RandomGenerate().generateRandom(track)
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beat).toBeLessThan(4)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
                expect(note.velocity).toBeGreaterThanOrEqual(0.5)
                expect(note.velocity).toBeLessThanOrEqual(1)
                expect(note.pitch).toBeGreaterThanOrEqual(-6)
                expect(note.pitch).toBeLessThanOrEqual(6)
            }
        })

        it('does not place two notes at the same step', () => {
            const track = makeTrack('SNARE', [], { nbBeats: 4, stepsPerBeat: 4 })
            new RandomGenerate().generateRandom(track)
            const positions = track.notes.map((n) => `${n.beat}:${n.beatStep}`)
            expect(new Set(positions).size).toBe(positions.length)
        })

        it('resets loop point to full track length', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            track.loopPointBeat = 1
            track.loopPointStep = 2
            track.loopAtStep = 6
            new RandomGenerate().generateRandom(track)
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopPointStep).toBe(0)
            expect(track.loopAtStep).toBe(16)
        })

        it('falls back to pattern.nbBeats when track.nbBeats is missing', () => {
            const track = makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })
            delete track.nbBeats
            new RandomGenerate().generateRandom(track, { nbBeats: 2 })
            expect(track.loopPointBeat).toBe(2)
            expect(track.loopAtStep).toBe(8)
            for (const note of track.notes) {
                expect(note.beat).toBeLessThan(2)
            }
        })

        it('clears previous notes before generating', () => {
            const track = makeTrack('KICK', [{ beat: 0, beatStep: 0 }], { nbBeats: 4, stepsPerBeat: 4 })
            expect(track.notes.length).toBe(1)
            new RandomGenerate().generateRandom(track)
            const positions = track.notes.map((n) => `${n.beat}:${n.beatStep}`)
            expect(new Set(positions).size).toBe(positions.length)
        })
    })

    describe.each(PARAM_SETS)('AutoGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        beforeEach(() => {
            appState.reset()
            serviceRegistry.reset()
            cmd = new Commander()
            serviceRegistry.cmd = cmd
            serviceRegistry.patterns = patternsManager
        })

        it('generatePattern produces a pattern with notes on tracks', async () => {
            const pattern = cmd.addPattern('ParamAutoGen')
            pattern.bpm = bpm
            pattern.nbBeats = nbBeats
            appState.selectedPatternNum = appState.patterns.length - 1

            const autoGen = new AutoGenerate()
            const result = await autoGen.generatePattern()

            expect(result).not.toBeNull()
            expect(result.tracks.length).toBeGreaterThan(0)
            const tracksWithNotes = result.tracks.filter((t) => t.notes.length > 0)
            expect(tracksWithNotes.length).toBeGreaterThan(0)
            for (const track of tracksWithNotes) {
                for (const note of track.notes) {
                    expect(note.beatStep).toBeGreaterThanOrEqual(0)
                }
            }
        })
    })
})
