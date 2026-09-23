import { describe, it, expect, beforeEach } from 'vitest'
import { serviceRegistry } from '../src/state/service_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import { PatternExporter } from '../src/patterns/exporter.js'
import { recomputeFlatNotes, computeNbTickForPattern } from '../src/patterns/engine.js'
import MidiExporter from '../src/logic/midi/midi_exporter.js'
import InstrumentsManager from '../src/logic/services/instrument_manager/index.js'
import { TICK } from '../src/core/constants.js'
import { parseMidi, findAllNotes } from './helpers/midi_reader.js'
import { makeNote, makeTrack, makePattern, PARAM_SETS } from './helpers/make_pattern.js'

describe('Multiple notes at the same step', () => {
    let cmd

    beforeEach(() => {
        serviceRegistry.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    // ── FlatNotes engine ────────────────────────────────────────────────────

    describe('engine: recomputeFlatNotes', () => {
        it('two notes at beat 0 step 0 produce two flatnotes at the same tick', () => {
            const pattern = makePattern({
                name: 'MultiNote',
                tracks: [
                    makeTrack('KICK', [
                        makeNote(0, 0, { velocity: 0.9, pitch: 0 }),
                        makeNote(0, 0, { velocity: 0.5, pitch: 2 }),
                    ]),
                ],
            })

            const flatMap = recomputeFlatNotes(pattern, 0)
            const tick0 = flatMap.get(0)
            expect(tick0).toBeDefined()
            expect(tick0.length).toBe(2)
            expect(tick0[0].note.velocity).toBe(0.9)
            expect(tick0[0].note.pitch).toBe(0)
            expect(tick0[1].note.velocity).toBe(0.5)
            expect(tick0[1].note.pitch).toBe(2)
        })

        it('three notes at the same step produce three flatnotes', () => {
            const pattern = makePattern({
                name: 'TriNote',
                tracks: [
                    makeTrack('SNARE', [
                        makeNote(1, 2, { velocity: 1.0, pitch: -1 }),
                        makeNote(1, 2, { velocity: 0.7, pitch: 0 }),
                        makeNote(1, 2, { velocity: 0.3, pitch: 3 }),
                    ]),
                ],
            })

            const flatMap = recomputeFlatNotes(pattern, 0)
            const tick = computeNbTickForPattern(4, TICK) / 4 + 2 * (TICK / 4)
            const flatNotes = flatMap.get(tick)
            expect(flatNotes).toBeDefined()
            expect(flatNotes.length).toBe(3)
            expect(flatNotes.map((fn) => fn.note.pitch)).toEqual([-1, 0, 3])
        })

        it('multi-note step does not interfere with other steps', () => {
            const pattern = makePattern({
                name: 'Mixed',
                tracks: [
                    makeTrack('KICK', [
                        makeNote(0, 0, { velocity: 0.9, pitch: 0 }),
                        makeNote(0, 0, { velocity: 0.5, pitch: 2 }),
                        makeNote(2, 0, { velocity: 0.8, pitch: 0 }),
                    ]),
                ],
            })

            const flatMap = recomputeFlatNotes(pattern, 0)
            const tick0 = flatMap.get(0)
            expect(tick0.length).toBe(2)

            const tick2 = flatMap.get(2 * TICK)
            expect(tick2).toBeDefined()
            expect(tick2.length).toBe(1)
        })
    })

    // ── JSON round-trip ─────────────────────────────────────────────────────

    describe('JSON: serialize / deserialize preserves multi-note steps', () => {
        it('two notes at same step survive export → reimport', () => {
            const source = makePattern({
                name: 'MultiJSON',
                tracks: [
                    makeTrack('KICK', [
                        makeNote(0, 0, { velocity: 0.9, pitch: -3 }),
                        makeNote(0, 0, { velocity: 0.5, pitch: 5 }),
                    ]),
                ],
            })

            const imported = cmd.importPatternFromJson(source)
            const track = imported.tracks[0]

            expect(track.notes.length).toBe(2)
            expect(track.notes[0].beat).toBe(0)
            expect(track.notes[0].beatStep).toBe(0)
            expect(track.notes[0].velocity).toBe(0.9)
            expect(track.notes[0].pitch).toBe(-3)
            expect(track.notes[1].beat).toBe(0)
            expect(track.notes[1].beatStep).toBe(0)
            expect(track.notes[1].velocity).toBe(0.5)
            expect(track.notes[1].pitch).toBe(5)
        })

        it('export → reimport round-trip preserves all notes at same step', () => {
            const source = makePattern({
                name: 'RoundTripMulti',
                bpm: 140,
                tracks: [
                    makeTrack('SNARE', [
                        makeNote(1, 2, { velocity: 1.0, pitch: -2 }),
                        makeNote(1, 2, { velocity: 0.6, pitch: 4 }),
                        makeNote(3, 0, { velocity: 0.8, pitch: 0 }),
                    ]),
                ],
            })

            const imported = cmd.importPatternFromJson(source)
            const exported = PatternExporter.export(imported)
            const reimported = cmd.importPatternFromJson(exported)
            const track = reimported.tracks[0]

            expect(track.notes.length).toBe(3)

            const step1Notes = track.notes.filter((n) => n.beat === 1 && n.beatStep === 2)
            expect(step1Notes.length).toBe(2)
            expect(step1Notes[0].pitch).toBe(-2)
            expect(step1Notes[1].pitch).toBe(4)
            expect(step1Notes[0].velocity).toBe(1.0)
            expect(step1Notes[1].velocity).toBe(0.6)

            const step3Notes = track.notes.filter((n) => n.beat === 3 && n.beatStep === 0)
            expect(step3Notes.length).toBe(1)
        })

        it('double export is stable with multi-note steps', () => {
            const source = makePattern({
                name: 'StableMulti',
                tracks: [
                    makeTrack('KICK', [
                        makeNote(0, 0, { velocity: 0.9, pitch: 0 }),
                        makeNote(0, 0, { velocity: 0.4, pitch: 3 }),
                    ]),
                ],
            })

            const once = cmd.importPatternFromJson(source)
            const exportedOnce = PatternExporter.export(once)
            const twice = cmd.importPatternFromJson(exportedOnce)
            const exportedTwice = PatternExporter.export(twice)

            expect(exportedTwice.tracks).toEqual(exportedOnce.tracks)
        })
    })

    // ── MIDI export ─────────────────────────────────────────────────────────

    describe('MIDI: multi-note steps produce separate Note On events', () => {
        it('two notes at same step → two Note Ons at same MIDI tick', () => {
            const pattern = makePattern({
                name: 'MIDIMulti',
                nbBeats: 1,
                tracks: [
                    makeTrack(
                        'KICK',
                        [makeNote(0, 0, { velocity: 1.0, pitch: 0 }), makeNote(0, 0, { velocity: 0.5, pitch: 3 })],
                        { nbBeats: 1 },
                    ),
                ],
            })

            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = exporter.export(pattern, { loops: 1 })
            const noteOns = findAllNotes(parseMidi(midiBytes))

            expect(noteOns.length).toBe(2)
            expect(noteOns[0].absTick).toBe(noteOns[1].absTick)
            expect(noteOns[0].note).toBe(36)
            expect(noteOns[1].note).toBe(39)
            expect(noteOns[0].velocity).toBe(127)
            expect(noteOns[1].velocity).toBe(64)
        })

        it('three notes at same step → three Note Ons', () => {
            const pattern = makePattern({
                name: 'MIDITri',
                nbBeats: 1,
                tracks: [
                    makeTrack(
                        'SNARE',
                        [
                            makeNote(0, 0, { velocity: 1.0, pitch: 0 }),
                            makeNote(0, 0, { velocity: 0.7, pitch: 2 }),
                            makeNote(0, 0, { velocity: 0.4, pitch: -1 }),
                        ],
                        { nbBeats: 1 },
                    ),
                ],
            })

            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = exporter.export(pattern, { loops: 1 })
            const noteOns = findAllNotes(parseMidi(midiBytes))

            expect(noteOns.length).toBe(3)
            const ticks = noteOns.map((n) => n.absTick)
            expect(ticks[0]).toBe(ticks[1])
            expect(ticks[1]).toBe(ticks[2])
        })

        it('multi-note step combined with single-note step in MIDI', () => {
            const pattern = makePattern({
                name: 'MIDIMixed',
                nbBeats: 2,
                tracks: [
                    makeTrack(
                        'KICK',
                        [
                            makeNote(0, 0, { velocity: 1.0, pitch: 0 }),
                            makeNote(0, 0, { velocity: 0.5, pitch: 5 }),
                            makeNote(1, 0, { velocity: 0.8, pitch: 0 }),
                        ],
                        { nbBeats: 2 },
                    ),
                ],
            })

            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = exporter.export(pattern, { loops: 1 })
            const noteOns = findAllNotes(parseMidi(midiBytes))

            expect(noteOns.length).toBe(3)
            expect(noteOns[0].absTick).toBe(noteOns[1].absTick)
            expect(noteOns[2].absTick).toBeGreaterThan(noteOns[1].absTick)
        })
    })

    // ── Parameterized: FlatNotes across different subdivisions ────────────────

    describe.each(PARAM_SETS)('FlatNotes — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        it('two notes at beat 0 step 0 produce two flatnotes at tick 0', () => {
            const pattern = makePattern({
                name: 'ParamMulti',
                bpm,
                nbBeats,
                tracks: [
                    makeTrack(
                        'KICK',
                        [makeNote(0, 0, { velocity: 0.9, pitch: 0 }), makeNote(0, 0, { velocity: 0.5, pitch: 2 })],
                        { stepsPerBeat, nbBeats },
                    ),
                ],
            })

            const flatMap = recomputeFlatNotes(pattern, 0)
            const tick0 = flatMap.get(0)
            expect(tick0).toBeDefined()
            expect(tick0.length).toBe(2)
            expect(tick0[0].note.velocity).toBe(0.9)
            expect(tick0[1].note.velocity).toBe(0.5)
        })

        it('three notes at same step produce three flatnotes at correct tick', () => {
            const b = Math.min(1, nbBeats - 1)
            const pattern = makePattern({
                name: 'ParamTri',
                bpm,
                nbBeats,
                tracks: [
                    makeTrack(
                        'SNARE',
                        [
                            makeNote(b, 0, { velocity: 1.0, pitch: -1 }),
                            makeNote(b, 0, { velocity: 0.7, pitch: 0 }),
                            makeNote(b, 0, { velocity: 0.3, pitch: 3 }),
                        ],
                        { stepsPerBeat, nbBeats },
                    ),
                ],
            })

            const flatMap = recomputeFlatNotes(pattern, 0)
            const tick = (computeNbTickForPattern(nbBeats, TICK) / (nbBeats * stepsPerBeat)) * (b * stepsPerBeat + 0)
            const flatNotes = flatMap.get(tick)
            expect(flatNotes).toBeDefined()
            expect(flatNotes.length).toBe(3)
            expect(flatNotes.map((fn) => fn.note.pitch)).toEqual([-1, 0, 3])
        })

        it('multi-note step does not interfere with other steps', () => {
            if (nbBeats < 2) return
            const pattern = makePattern({
                name: 'ParamMixed',
                bpm,
                nbBeats,
                tracks: [
                    makeTrack(
                        'KICK',
                        [
                            makeNote(0, 0, { velocity: 0.9 }),
                            makeNote(0, 0, { velocity: 0.5 }),
                            makeNote(1, 0, { velocity: 0.8 }),
                        ],
                        { stepsPerBeat, nbBeats },
                    ),
                ],
            })

            const flatMap = recomputeFlatNotes(pattern, 0)
            expect(flatMap.get(0).length).toBe(2)

            const tick1 = (computeNbTickForPattern(nbBeats, TICK) / (nbBeats * stepsPerBeat)) * stepsPerBeat
            const tickN = flatMap.get(tick1)
            expect(tickN).toBeDefined()
            expect(tickN.length).toBe(1)
        })
    })

    // ── Parameterized: JSON round-trip across different params ────────────────

    describe.each(PARAM_SETS)('JSON round-trip — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        it('export → reimport preserves multi-note steps', () => {
            const source = makePattern({
                name: 'ParamRoundTrip',
                bpm,
                nbBeats,
                tracks: [
                    makeTrack(
                        'KICK',
                        [makeNote(0, 0, { velocity: 0.9, pitch: -3 }), makeNote(0, 0, { velocity: 0.5, pitch: 5 })],
                        { stepsPerBeat, nbBeats },
                    ),
                ],
            })

            const imported = cmd.importPatternFromJson(source)
            const exported = PatternExporter.export(imported)
            const reimported = cmd.importPatternFromJson(exported)
            const track = reimported.tracks[0]

            expect(track.notes.length).toBe(2)
            expect(track.notes[0].velocity).toBe(0.9)
            expect(track.notes[0].pitch).toBe(-3)
            expect(track.notes[1].velocity).toBe(0.5)
            expect(track.notes[1].pitch).toBe(5)
        })

        it('double export is stable', () => {
            const source = makePattern({
                name: 'ParamStable',
                bpm,
                nbBeats,
                tracks: [
                    makeTrack(
                        'KICK',
                        [makeNote(0, 0, { velocity: 0.9, pitch: 0 }), makeNote(0, 0, { velocity: 0.4, pitch: 3 })],
                        { stepsPerBeat, nbBeats },
                    ),
                ],
            })

            const once = cmd.importPatternFromJson(source)
            const exportedOnce = PatternExporter.export(once)
            const twice = cmd.importPatternFromJson(exportedOnce)
            const exportedTwice = PatternExporter.export(twice)

            expect(exportedTwice.tracks).toEqual(exportedOnce.tracks)
        })
    })

    // ── Parameterized: MIDI multi-note across different params ────────────────

    describe.each(PARAM_SETS)('MIDI multi-note — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        it('two notes at same step → two Note Ons at same tick', () => {
            const pattern = makePattern({
                name: 'ParamMIDI',
                bpm,
                nbBeats: 1,
                tracks: [
                    makeTrack(
                        'KICK',
                        [makeNote(0, 0, { velocity: 1.0, pitch: 0 }), makeNote(0, 0, { velocity: 0.5, pitch: 3 })],
                        { stepsPerBeat, nbBeats: 1 },
                    ),
                ],
            })

            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = exporter.export(pattern, { loops: 1 })
            const noteOns = findAllNotes(parseMidi(midiBytes))

            expect(noteOns.length).toBe(2)
            expect(noteOns[0].absTick).toBe(noteOns[1].absTick)
            expect(noteOns[0].note).toBe(36)
            expect(noteOns[1].note).toBe(39)
        })

        it('multi-note step combined with single-note step', () => {
            const nBeats = Math.max(2, nbBeats)
            const b = Math.min(1, nBeats - 1)
            const pattern = makePattern({
                name: 'ParamMIDIMixed',
                bpm,
                nbBeats: nBeats,
                tracks: [
                    makeTrack(
                        'KICK',
                        [
                            makeNote(0, 0, { velocity: 1.0, pitch: 0 }),
                            makeNote(0, 0, { velocity: 0.5, pitch: 5 }),
                            makeNote(b, 0, { velocity: 0.8, pitch: 0 }),
                        ],
                        { stepsPerBeat, nbBeats: nBeats },
                    ),
                ],
            })

            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = exporter.export(pattern, { loops: 1 })
            const noteOns = findAllNotes(parseMidi(midiBytes))

            expect(noteOns.length).toBe(3)
            expect(noteOns[0].absTick).toBe(noteOns[1].absTick)
            expect(noteOns[2].absTick).toBeGreaterThan(noteOns[1].absTick)
        })
    })
})
