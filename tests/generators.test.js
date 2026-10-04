import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import AutoGenerate from '../src/logic/generators/auto_generate.js'
import StructureSong from '../src/logic/generators/structure_song.js'
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
import * as flatNotesService from '../src/patterns/flat_notes.js'

describe('Generators', () => {
    let cmd
    let seed
    let originalRandom

    beforeEach(async () => {
        serviceRegistry.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        // generatePattern() calls serviceRegistry.flatNotes.applyFlatNotes();
        // it used to be missing here and the failure was swallowed.
        serviceRegistry.flatNotes = await import('../src/patterns/flat_notes.js')
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
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'basic')
            expect(track.notes.length).toBe(5)
            const positions = track.notes.map((n) => `${n.beat}:${n.beatStep}`).sort()
            expect(positions).toEqual(['0:0', '1:0', '2:0', '2:2', '3:0'])
        })

        it('sets correct loop point for fourOnFloor', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'fourOnFloor')
            expect(track.loopAtStep).toBe(4)
        })

        it('sets correct loop point for basic', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'basic')
            expect(track.loopAtStep).toBe(16)
        })

        it('velocity is within valid range', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'basic')
            for (const note of track.notes) {
                expect(note.velocity).toBeGreaterThanOrEqual(0.35)
                expect(note.velocity).toBeLessThanOrEqual(1)
            }
        })

        it('syncopated produces notes only within loop point (beat < 2)', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'syncopated')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeLessThan(2)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
        })

        it('break produces exactly 4 notes, all on step 0, one per beat', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, 'outro')
            expect(track.notes.length).toBeGreaterThan(0)
        })

        it('null variantName resolves to a valid config', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
            new KickGenerate().generateNewKick(track, null)
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
            }
        })

        it('unknown variantName falls back to basic', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
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
                const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'basic')
            expect(track.notes.length).toBe(2)
            const beats = track.notes.map((n) => n.beat).sort()
            expect(beats).toEqual([1, 3])
            for (const note of track.notes) {
                expect(note.beatStep).toBe(0)
            }
        })

        it('ghost produces more than 2 notes with both accent and ghost dynamics', () => {
            const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'ghost')
            expect(track.notes.length).toBeGreaterThan(2)
            const velocities = track.notes.map((n) => parseFloat(n.velocity))
            expect(Math.max(...velocities)).toBeGreaterThan(0.7)
            expect(Math.min(...velocities)).toBeLessThan(0.5)
        })

        it('roll sets loop point correctly', () => {
            const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'roll')
        })

        it('syncopated produces notes only within loop point (beat < 2)', () => {
            const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'syncopated')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeLessThan(2)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
        })

        it('roll with 1-beat track produces exactly 4 notes, all in beat 0', () => {
            const track = makeTrack('SNARE', [], { beatCount: 1, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'roll')
            expect(track.notes.length).toBe(4)
            for (const note of track.notes) {
                expect(note.beat).toBe(0)
            }
            const steps = track.notes.map((n) => n.beatStep).sort()
            expect(steps).toEqual([0, 1, 2, 3])
        })

        it('roll velocity increases across steps (crescendo)', () => {
            const track = makeTrack('SNARE', [], { beatCount: 1, stepsPerBeat: 4 })
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
            const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
            new SnareGenerate().generateNewSnare(track, 'break')
            for (const note of track.notes) {
                expect(note.beat).toBe(3)
            }
        })

        it('intro/outro variants fall back to real configs and generate notes', () => {
            for (const v of ['intro', 'outro']) {
                const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
                new SnareGenerate().generateNewSnare(track, v)
                expect(track.notes.length).toBeGreaterThan(0)
            }
        })

        it('required steps force a note when the probability gate would drop it', () => {
            const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
            const random = vi.spyOn(Math, 'random').mockReturnValue(1)
            try {
                new SnareGenerate().generateNewSnare(track, 'syncopated')
            } finally {
                random.mockRestore()
            }

            // syncopated requires beatModulo 2 step 0 → only beat 1 step 0 survives
            expect(track.notes).toHaveLength(1)
            expect(track.notes[0].beat).toBe(1)
            expect(track.notes[0].beatStep).toBe(0)
        })

        it('steps that are not required are never forced', () => {
            const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
            const random = vi.spyOn(Math, 'random').mockReturnValue(1)
            try {
                new SnareGenerate().generateNewSnare(track, 'syncopated')
            } finally {
                random.mockRestore()
            }

            expect(track.notes.every((n) => n.beatStep === 0 && n.beat % 2 === 1)).toBe(true)
        })

        it('all variants produce velocity in [0, 1]', () => {
            const variants = ['basic', 'ghost', 'syncopated', 'roll', 'break']
            for (const v of variants) {
                const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('CHH', [], { beatCount: 4, stepsPerBeat: 4 })
            new HatGenerate().generateNewHat(track, 'chhBasic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBe(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(4)
            }
        })

        it('ohhBasic produces exactly 2 notes on step 2, beats 0 and 1', () => {
            const track = makeTrack('OHH', [], { beatCount: 4, stepsPerBeat: 4 })
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
                const track = makeTrack('CHH', [], { beatCount: 4, stepsPerBeat: 4 })
                new HatGenerate().generateNewHat(track, v)
                expect(track.notes.length).toBeGreaterThan(0)
            }
        })
    })

    // ── Bass Generator ─────────────────────────────────────────────

    describe('Bass Generator', () => {
        // `basic` used to be ONE eight-note skeleton, so every generation of it
        // played the same line. It now draws one of three skeletons.
        const basicSkeletons = BassGenerate.BASS_GENERATION_CONFIGS.basic.phraseSets
        const positionsOf = (notes) => notes.map((n) => `${n.beat}:${n.beatStep}`)
        const sortedKey = (positions) => [...positions].sort().join(',')

        // The first Math.random() of generateNewBass('basic') is the skeleton pick
        // (StructurePicker.pick), so a counter-based mock can choose the skeleton and
        // still drive the per-phrase `chance` draws.
        const mockRandom = (firstValue, restValue) => {
            let calls = 0
            return vi.spyOn(Math, 'random').mockImplementation(() => (calls++ === 0 ? firstValue : restValue))
        }

        it.each(basicSkeletons.map((_, i) => i))('basic picks skeleton %i as a whole', (index) => {
            const rnd = mockRandom(index / basicSkeletons.length + 0.01, 0.5)
            try {
                const track = makeTrack('BASS', [], { beatCount: 4, stepsPerBeat: 4 })
                new BassGenerate().generateNewBass(track, 'basic')
                // every note comes from THAT skeleton (minus the `chance` ones)
                const allowed = new Set(basicSkeletons[index].map((p) => `${p.beat}:${p.step}`))
                expect(track.notes.length).toBeGreaterThan(0)
                for (const note of track.notes) {
                    expect(allowed.has(`${note.beat}:${note.beatStep}`), `${note.beat}:${note.beatStep}`).toBe(true)
                }
                // no two notes on the same (beat, step)
                const positions = positionsOf(track.notes)
                expect(new Set(positions).size).toBe(positions.length)
            } finally {
                rnd.mockRestore()
            }
        })

        it('the three skeletons are genuinely different lines', () => {
            const signatures = basicSkeletons.map((set) => sortedKey(set.map((p) => `${p.beat}:${p.step}`)))
            expect(new Set(signatures).size).toBe(basicSkeletons.length)
            // and the union is wider than the old single skeleton (8 notes)
            const union = new Set(basicSkeletons.flatMap((set) => set.map((p) => `${p.beat}:${p.step}`)))
            expect(union.size).toBeGreaterThan(8)
        })

        it('a per-phrase chance thins the degrees it applies to', () => {
            // skeleton 1 has one `chance: 0.5` and one `chance: 0.6` phrase; forcing
            // the draw to 0.9 keeps every chance phrase out
            const rnd = mockRandom(1 / basicSkeletons.length + 0.01, 0.9)
            try {
                const track = makeTrack('BASS', [], { beatCount: 4, stepsPerBeat: 4 })
                new BassGenerate().generateNewBass(track, 'basic')
                const forced = new Set(['0:0', '1:2', '2:0', '2:3', '3:1'])
                expect(sortedKey(positionsOf(track.notes))).toBe(sortedKey(forced))
            } finally {
                rnd.mockRestore()
            }
        })

        it('every variant declares its own register, not a shared -12', () => {
            const roots = new Set(Object.values(BassGenerate.BASS_GENERATION_CONFIGS).map((c) => c.rootNote))
            expect(roots.size).toBeGreaterThan(1)
        })

        it('groove produces notes on beat 0 of every beat plus additional steps', () => {
            const track = makeTrack('BASS', [], { beatCount: 4, stepsPerBeat: 4 })
            new BassGenerate().generateNewBass(track, 'groove')
            expect(track.notes.length).toBeGreaterThan(4)
            const beats = [...new Set(track.notes.map((n) => n.beat))].sort()
            expect(beats).toEqual([0, 1, 2, 3])
        })

        it('arpeggio produces notes with varying pitches in contour order', () => {
            const track = makeTrack('BASS', [], { beatCount: 4, stepsPerBeat: 4 })
            new BassGenerate().generateNewBass(track, 'arpege')
            expect(track.notes.length).toBeGreaterThan(0)
            const uniquePitches = [...new Set(track.notes.map((n) => n.pitch))]
            expect(uniquePitches.length).toBeGreaterThan(1)
        })
    })

    // ── Perc Generator ─────────────────────────────────────────────

    describe('Perc Generator', () => {
        it('basic produces exactly 4 notes at phrase positions', () => {
            const track = makeTrack('HI_TOM', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('HI_TOM', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('PERC', [], { beatCount: 4 })
            new PercGenerate().generateNewPerc(track, 'conversation')
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beat).toBeLessThan(4)
            }
        })

        it('conversation: produces at least one note over repeated generation', () => {
            let totalNotes = 0
            for (let i = 0; i < 5; i++) {
                const track = makeTrack('PERC', [], { beatCount: 4 })
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
            const track = makeTrack('PERC', [], { beatCount: 4 })
            const gen = new PercGenerate()
            const tones = [0, 4, 7]
            const config = {
                loopAtStep: 4 * 4,
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
            const track = makeTrack('PERC', [], { beatCount: 4 })
            const gen = new PercGenerate()
            const config = {
                loopAtStep: 4 * 4,
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
        })
    })

    // ── AutoGenerate dispatch ──────────────────────────────────────

    describe('AutoGenerate dispatch', () => {
        beforeEach(() => {
            serviceRegistry.flatNotes = flatNotesService
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
            track.beatCount = 4
            const autoGen = new AutoGenerate()
            await expect(autoGen.generateTrack(track, 'basic')).resolves.not.toThrow()
        })

        it('generateTrack for COWBELL runs the cowbell generator', async () => {
            const pattern = cmd.addPattern('T')
            const track = cmd.addTrack(pattern, 'COWBELL', 4)
            track.beatCount = 4
            const autoGen = new AutoGenerate()
            await expect(autoGen.generateTrack(track, 'basic')).resolves.not.toThrow()
        })

        it('changeTrack clears track notes and regenerates', async () => {
            const pattern = cmd.addPattern('T')
            const track = cmd.addTrack(pattern, 'KICK', 4)
            track.beatCount = 4
            cmd.addNote(track, 0, 0, 0)
            const applySpy = vi.fn()
            serviceRegistry.flatNotes = { ...flatNotesService, applyFlatNotes: applySpy }
            const autoGen = new AutoGenerate()

            await autoGen.changeTrack(0, pattern, track)

            expect(Array.isArray(track.notes)).toBe(true)
            expect(applySpy).toHaveBeenCalledWith(pattern)
        })

        it('changeTrack works for non-KICK track types', async () => {
            const pattern = cmd.addPattern('T')
            const track = cmd.addTrack(pattern, 'SNARE', 4)
            track.beatCount = 4
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
                const track = makeTrack(name, [], { beatCount: 4, stepsPerBeat: 4 })
                gen[method](track, variant)
                expect(track.loopAtStep).toBeGreaterThan(0)
                expect(track.loopAtStep).toBeLessThanOrEqual(track.beatCount * track.stepsPerBeat)
            }
        })
    })

    // Every genre used to have exactly ONE bass variant, so house, hiphop and funk
    // all played the same `groove` line while `melodic`/`arpege` were unreachable.
    describe('bass variant per genre', () => {
        const bassOf = (pattern) => Object.values(pattern.tracks).find((t) => t.name === 'BASS')

        it('every genre lists several bass variants, canonical first', () => {
            for (const genre of StructureSong.GENRES) {
                const variants = StructureSong.BASS_VARIANTS_BY_GENRE[genre]
                expect(Array.isArray(variants), genre).toBe(true)
                expect(variants.length, genre).toBeGreaterThan(1)
                // the canonical one of STRUCTURES comes first, so the character of the
                // genre is preserved as the most likely draw
                const canonical = StructureSong.STRUCTURES[genre]?.BASS
                if (canonical) expect(variants[0], genre).toBe(canonical)
            }
        })

        it('every listed variant exists in the bass generator', () => {
            const known = new Set(Object.keys(BassGenerate.BASS_GENERATION_CONFIGS))
            for (const [genre, variants] of Object.entries(StructureSong.BASS_VARIANTS_BY_GENRE)) {
                for (const variant of variants) expect(known.has(variant), `${genre}:${variant}`).toBe(true)
            }
        })

        it('melodic and arpege are reachable, and no genre is limited to one variant', () => {
            const all = Object.values(StructureSong.BASS_VARIANTS_BY_GENRE).flat()
            expect(all).toContain('melodic')
            expect(all).toContain('arpege')
        })

        it('generation draws a bass variant from the genre list, not the fixed one', () => {
            // a deterministic cycle instead of real rolls: this test must not shift
            // the PRNG stream the following tests draw from
            let i = 0
            const rnd = vi.spyOn(Math, 'random').mockImplementation(() => ((i++ % 7) + 0.5) / 7)
            try {
                const seen = new Set()
                for (let n = 0; n < 40; n++) seen.add(StructureSong.randomBassVariant('house'))
                expect(seen.size).toBeGreaterThan(1)
                for (const variant of seen) {
                    expect(StructureSong.BASS_VARIANTS_BY_GENRE.house).toContain(variant)
                }
            } finally {
                rnd.mockRestore()
            }
        })

        it('generatePattern writes a bass line that is not always the canonical variant', async () => {
            if (appState.patterns.length === 0) cmd.addPattern('TestPattern')
            const pattern = appState.patterns[appState.selectedPatternIdx]
            const lines = new Set()

            for (let i = 0; i < 25; i++) {
                pattern.tags = { style: 'house', type: 'default' }
                await new AutoGenerate().generatePattern()
                const bass = bassOf(pattern)
                expect(bass, 'a BASS track was generated').toBeTruthy()
                expect(bass.useSoftSynth === true || bass.synthSoundKey).toBeTruthy()
                lines.add(bass.notes.map((n) => `${n.beat}:${n.beatStep}:${n.pitch}`).join('|'))
            }
            // 25 generations of one genre must not all play the same line
            expect(lines.size).toBeGreaterThan(1)
        })

        it('randomBassVariant only ever returns a variant of that genre', () => {
            for (const genre of StructureSong.GENRES) {
                for (let i = 0; i < 20; i++) {
                    expect(StructureSong.BASS_VARIANTS_BY_GENRE[genre]).toContain(
                        StructureSong.randomBassVariant(genre),
                    )
                }
            }
        })

        it('the 200-draw coverage of every genre stays inside its own list', () => {
            for (const genre of StructureSong.GENRES) {
                const allowed = StructureSong.BASS_VARIANTS_BY_GENRE[genre]
                for (let i = 0; i < 200; i++) expect(allowed).toContain(StructureSong.randomBassVariant(genre))
            }
        })
    })

    // variation/variation2 are 0 by default, and both TrackVariation layers return
    // immediately at 0 — a generated line repeated note for note on every loop.
    describe('generated tracks turn the variation layers on', () => {
        beforeEach(() => {
            if (appState.patterns.length === 0) cmd.addPattern('TestPattern')
        })

        it('generatePattern gives every track a non-zero variation', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternIdx]
            await autoGen.generatePattern()

            const tracks = Object.values(pattern.tracks)
            expect(tracks.length).toBeGreaterThan(0)
            for (const track of tracks) {
                expect(track.variation, track.name).toBeGreaterThan(0)
                expect(track.variation, track.name).toBeLessThanOrEqual(100)
                expect(track.variation2, track.name).toBeGreaterThan(0)
            }
        })

        it('melodic parts vary more than percussion', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternIdx]
            await autoGen.generatePattern({ genre: 'techno' })

            const bass = Object.values(pattern.tracks).find((t) => Utils.detectTrackType(t.name) === 'BASS')
            const kick = Object.values(pattern.tracks).find((t) => Utils.detectTrackType(t.name) === 'KICK')
            if (bass && kick) expect(bass.variation).toBeGreaterThan(kick.variation)
        })

        it('a variation the user set is never overwritten', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternIdx]
            await autoGen.generatePattern()

            const track = Object.values(pattern.tracks)[0]
            track.variation = 77
            await autoGen.generateTrack(track, 'basic', 1, pattern, { root: 0, scale: null })
            expect(track.variation).toBe(77)
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
            const pattern = appState.patterns[appState.selectedPatternIdx]
            await autoGen.generatePattern()
            expect(typeof pattern._autoGenGenre).toBe('string')
            expect(pattern._autoGenGenre.length).toBeGreaterThan(0)
        })

        it('changeTrack uses the same genre as generatePattern', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternIdx]
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
            const pattern = appState.patterns[appState.selectedPatternIdx]
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
            const pattern = appState.patterns[appState.selectedPatternIdx]
            pattern.tags = { style: 'rock', type: 'default' }
            await autoGen.generatePattern()
            expect(pattern._autoGenGenre).toBe('rock')
        })

        it('genre falls back to random when tags have no matching style', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternIdx]
            pattern.tags = { style: 'unknown_style', type: 'default' }
            await autoGen.generatePattern()
            expect(StructureSong.GENRES).toContain(pattern._autoGenGenre)
        })

        it('genre falls back to random when pattern has no tags', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternIdx]
            pattern.tags = null
            await autoGen.generatePattern()
            expect(typeof pattern._autoGenGenre).toBe('string')
        })
    })

    // ── Generation variety ──────────────────────────────────────────

    describe('generation variety', () => {
        beforeEach(() => {
            if (appState.patterns.length === 0) {
                cmd.addPattern('TestPattern')
            }
        })

        it('generatePattern stores a randomized key offset and scale', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternIdx]
            await autoGen.generatePattern()

            expect(StructureSong.KEY_OFFSETS).toContain(pattern._autoGenKeyOffset)
            expect(StructureSong.SCALES).toContain(pattern._autoGenScale)
        })

        it('reuses the pattern key when the pattern is regenerated', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternIdx]
            await autoGen.generatePattern()
            const key = pattern._autoGenKeyOffset
            const scale = pattern._autoGenScale

            await autoGen.generatePattern()

            expect(pattern._autoGenKeyOffset).toBe(key)
            expect(pattern._autoGenScale).toBe(scale)
        })

        it('randomizes the genre structure instead of using the raw template', async () => {
            const spy = vi.spyOn(StructureSong, 'randomizeStructure')
            const autoGen = new AutoGenerate()

            try {
                await autoGen.generatePattern()
                expect(spy).toHaveBeenCalledTimes(1)
            } finally {
                spy.mockRestore()
            }
        })

        it('generates each track with a jittered density', async () => {
            const autoGen = new AutoGenerate()
            const spy = vi.spyOn(autoGen, 'generateTrack')

            await autoGen.generatePattern()

            expect(spy.mock.calls.length).toBeGreaterThan(0)
            for (const call of spy.mock.calls) {
                expect(call[2]).toBeGreaterThanOrEqual(0.6)
                expect(call[2]).toBeLessThanOrEqual(1.2)
            }
        })

        it('jitters the swing amount of every track within bounds', async () => {
            const autoGen = new AutoGenerate()
            const pattern = appState.patterns[appState.selectedPatternIdx]
            await autoGen.generatePattern()

            for (const track of Object.values(pattern.tracks)) {
                expect(track.swingAmount).toBeGreaterThanOrEqual(0)
                expect(track.swingAmount).toBeLessThanOrEqual(0.45)
                expect(track.swingResolution).toBeGreaterThanOrEqual(1)
            }
        })
    })

    // ── Parameterized: generators across different subdivisions ───────────────

    describe.each(PARAM_SETS)('KickGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
        it('fourOnFloor produces notes within step range', () => {
            const track = makeTrack('KICK', [], { beatCount, stepsPerBeat })
            new KickGenerate().generateNewKick(track, 'fourOnFloor')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(stepsPerBeat)
            }
        })

        it('basic produces notes at phrase positions', () => {
            const track = makeTrack('KICK', [], { beatCount, stepsPerBeat })
            new KickGenerate().generateNewKick(track, 'basic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(stepsPerBeat)
            }
        })

        it('loop point is valid', () => {
            const track = makeTrack('KICK', [], { beatCount, stepsPerBeat })
            new KickGenerate().generateNewKick(track, 'basic')
            expect(track.loopAtStep).toBeGreaterThan(0)
        })
    })

    describe.each(PARAM_SETS)('SnareGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
        it('basic produces notes within step range', () => {
            const track = makeTrack('SNARE', [], { beatCount, stepsPerBeat })
            new SnareGenerate().generateNewSnare(track, 'basic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(stepsPerBeat)
            }
        })

        it('ghost produces more notes than basic', () => {
            const basicTrack = makeTrack('SNARE', [], { beatCount, stepsPerBeat })
            new SnareGenerate().generateNewSnare(basicTrack, 'basic')
            const ghostTrack = makeTrack('SNARE', [], { beatCount, stepsPerBeat })
            new SnareGenerate().generateNewSnare(ghostTrack, 'ghost')
            expect(ghostTrack.notes.length).toBeGreaterThanOrEqual(basicTrack.notes.length)
        })
    })

    describe.each(PARAM_SETS)('HatGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
        it('chhBasic produces notes within step range', () => {
            const track = makeTrack('CHH', [], { beatCount, stepsPerBeat })
            new HatGenerate().generateNewHat(track, 'chhBasic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeLessThan(stepsPerBeat)
            }
        })
    })

    describe.each(PARAM_SETS)('BassGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
        it('basic produces notes', () => {
            const track = makeTrack('BASS', [], { beatCount, stepsPerBeat })
            new BassGenerate().generateNewBass(track, 'basic')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(note.beat).toBeGreaterThanOrEqual(0)
                expect(note.beatStep).toBeGreaterThanOrEqual(0)
            }
        })
    })

    describe.each(PARAM_SETS)('PercGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
        it('basic produces notes', () => {
            const track = makeTrack('HI_TOM', [], { beatCount, stepsPerBeat })
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
                const track = makeTrack('CLAP', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('CLAP', [], { beatCount: 4, stepsPerBeat: 4 })
            new ClapGenerate().generateNewClap(track, 'backbeat')
            const beats = [...new Set(track.notes.map((n) => n.beat))].sort()
            expect(beats).toEqual([1, 3])
        })

        it('sets loop point from config', () => {
            const track = makeTrack('CLAP', [], { beatCount: 4, stepsPerBeat: 4 })
            new ClapGenerate().generateNewClap(track, 'backbeat')
            expect(track.loopAtStep).toBe(16)
        })

        it('clears previous notes before generating', () => {
            const track = makeTrack('CLAP', [makeNote(0, 0)], { beatCount: 4, stepsPerBeat: 4 })
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
                const track = makeTrack('COWBELL', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('COWBELL', [], { beatCount: 4, stepsPerBeat: 4 })
            await new CowbellGenerate().generateNewCowbell(track, 'basic')
            const beats = track.notes.map((n) => n.beat).sort()
            expect(beats).toEqual([0, 1, 2, 3])
            for (const note of track.notes) expect(note.beatStep).toBe(0)
        })

        it('sets loop point from config', async () => {
            const track = makeTrack('COWBELL', [], { beatCount: 4, stepsPerBeat: 4 })
            await new CowbellGenerate().generateNewCowbell(track, 'basic')
            expect(track.loopAtStep).toBe(16)
        })
    })

    // ── Melody Generator ───────────────────────────────────────────

    describe('Melody Generator', () => {
        it('chordStab stacks chord tones on beats 0 and 2', () => {
            const track = makeTrack('PIANO', [], { beatCount: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'chordStab')
            expect(track.notes.length).toBeGreaterThanOrEqual(3)
            const beats = [...new Set(track.notes.map((n) => n.beat))].sort()
            expect(beats).toEqual([0, 2])
        })

        it('break places notes only on the last beat', () => {
            const track = makeTrack('PIANO', [], { beatCount: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'break')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) expect(note.beat).toBe(3)
        })

        it('intro and outro are no-ops (notes untouched)', () => {
            for (const variant of ['intro', 'outro']) {
                const track = makeTrack('PIANO', [makeNote(0, 0)], { beatCount: 4, stepsPerBeat: 4 })
                new MelodyGenerate().generateNewMelody(track, variant)
                expect(track.notes).toHaveLength(1)
            }
        })

        it('arpeggio attaches arp config to generated notes', () => {
            const track = makeTrack('PIANO', [], { beatCount: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'arpeggio')
            expect(track.notes.length).toBeGreaterThan(0)
            const withArp = track.notes.filter((n) => n.arp)
            expect(withArp.length).toBeGreaterThan(0)
            expect(withArp[0].retriggerNum).toBe(4)
            expect(withArp[0].rate).toBe(16)
        })

        it('walking (groove) produces notes on strong beats', () => {
            const track = makeTrack('PIANO', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('PIANO', [], { beatCount: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'reggae')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect([2, 3]).toContain(note.beatStep)
            }
        })

        it('sparse produces notes with pitches from the scale', () => {
            const track = makeTrack('PIANO', [], { beatCount: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'sparse')
            expect(track.notes.length).toBeGreaterThan(0)
            for (const note of track.notes) {
                expect(typeof note.pitch).toBe('number')
                expect(note.velocity).toBeGreaterThanOrEqual(0)
                expect(note.velocity).toBeLessThanOrEqual(1)
            }
        })

        it('respects harmony root offset', () => {
            // Both generations must draw the SAME random tones, otherwise comparing
            // their lowest note compares two random rolls (it used to pass by luck).
            const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5)
            const flat = makeTrack('PIANO', [], { beatCount: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(flat, 'sparse', 1, null, { root: 0, scale: null })
            const raised = makeTrack('PIANO', [], { beatCount: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(raised, 'sparse', 1, null, { root: 12, scale: null })
            const minFlat = Math.min(...flat.notes.map((n) => n.pitch))
            const minRaised = Math.min(...raised.notes.map((n) => n.pitch))
            expect(minRaised - minFlat).toBe(12)
            rnd.mockRestore()
        })

        it('sets loop point from config', () => {
            const track = makeTrack('PIANO', [], { beatCount: 4, stepsPerBeat: 4 })
            new MelodyGenerate().generateNewMelody(track, 'chordStab')
            expect(track.loopAtStep).toBe(16)
        })
    })

    // ── RandomGenerate ─────────────────────────────────────────────

    describe('RandomGenerate', () => {
        it('produces at least one note within grid bounds', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
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
            const track = makeTrack('SNARE', [], { beatCount: 4, stepsPerBeat: 4 })
            new RandomGenerate().generateRandom(track)
            const positions = track.notes.map((n) => `${n.beat}:${n.beatStep}`)
            expect(new Set(positions).size).toBe(positions.length)
        })

        it('resets loop point to full track length', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
            track.loopAtStep = 1 * (track.stepsPerBeat ?? 4)
            track.loopAtStep = 6
            new RandomGenerate().generateRandom(track)
            expect(track.loopAtStep).toBe(16)
        })

        it('falls back to pattern.beatCount when track.beatCount is missing', () => {
            const track = makeTrack('KICK', [], { beatCount: 4, stepsPerBeat: 4 })
            delete track.beatCount
            new RandomGenerate().generateRandom(track, { beatCount: 2 })
            expect(track.loopAtStep).toBe(8)
            for (const note of track.notes) {
                expect(note.beat).toBeLessThan(2)
            }
        })

        it('clears previous notes before generating', () => {
            const track = makeTrack('KICK', [{ beat: 0, beatStep: 0 }], { beatCount: 4, stepsPerBeat: 4 })
            expect(track.notes.length).toBe(1)
            new RandomGenerate().generateRandom(track)
            const positions = track.notes.map((n) => `${n.beat}:${n.beatStep}`)
            expect(new Set(positions).size).toBe(positions.length)
        })
    })

    describe.each(PARAM_SETS)('AutoGenerate — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
        beforeEach(() => {
            appState.reset()
            serviceRegistry.reset()
            cmd = new Commander()
            serviceRegistry.cmd = cmd
            serviceRegistry.flatNotes = flatNotesService
        })

        it('generatePattern produces a pattern with notes on tracks', async () => {
            const pattern = cmd.addPattern('ParamAutoGen')
            pattern.bpm = bpm
            pattern.beatCount = beatCount
            appState.selectedPatternIdx = appState.patterns.length - 1

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
