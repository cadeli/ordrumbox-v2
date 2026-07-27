import { describe, it, expect, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import { PatternExporter } from '../src/patterns/exporter.js'
import { computeFlatNotesFromPattern, computeNbTickForPattern } from '../src/patterns/engine.js'
import MidiExporter from '../src/logic/midi/midi_exporter.js'
import InstrumentsManager from '../src/logic/services/instruments_manager.js'
import Utils from '../src/core/utils.js'
import { TICK } from '../src/core/constants.js'
import { parseMidi, findAllNotes } from './helpers/midi_reader.js'

const MIDI_RATIO = 96 / TICK

describe('Multiple notes at the same step', () => {
    let mfCmd

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
    })

    // ── FlatNotes engine ────────────────────────────────────────────────────

    describe('engine: computeFlatNotesFromPattern', () => {
        it('two notes at beat 0 step 0 produce two flatnotes at the same tick', () => {
            const pattern = {
                name: 'MultiNote', bpm: 120, nbBeats: 4,
                tracks: [{
                    name: 'KICK', nbBeats: 4, stepsPerBeat: 4,
                    loopAtStep: 16, velocity: 0.8, pan: 0,
                    notes: [
                        { beat: 0, beatStep: 0, velocity: 0.9, pitch: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 0, beatStep: 0, velocity: 0.5, pitch: 2, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                    ]
                }]
            }

            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const tick0 = flatMap.get(0)
            expect(tick0).toBeDefined()
            expect(tick0.length).toBe(2)
            expect(tick0[0].note.velocity).toBe(0.9)
            expect(tick0[0].note.pitch).toBe(0)
            expect(tick0[1].note.velocity).toBe(0.5)
            expect(tick0[1].note.pitch).toBe(2)
        })

        it('three notes at the same step produce three flatnotes', () => {
            const pattern = {
                name: 'TriNote', bpm: 120, nbBeats: 4,
                tracks: [{
                    name: 'SNARE', nbBeats: 4, stepsPerBeat: 4,
                    loopAtStep: 16, velocity: 0.8, pan: 0,
                    notes: [
                        { beat: 1, beatStep: 2, velocity: 1.0, pitch: -1, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 1, beatStep: 2, velocity: 0.7, pitch: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 1, beatStep: 2, velocity: 0.3, pitch: 3, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                    ]
                }]
            }

            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const tick = computeNbTickForPattern(4, TICK) / 4 + 2 * (TICK / 4)
            const flatNotes = flatMap.get(tick)
            expect(flatNotes).toBeDefined()
            expect(flatNotes.length).toBe(3)
            expect(flatNotes.map(fn => fn.note.pitch)).toEqual([-1, 0, 3])
        })

        it('multi-note step does not interfere with other steps', () => {
            const pattern = {
                name: 'Mixed', bpm: 120, nbBeats: 4,
                tracks: [{
                    name: 'KICK', nbBeats: 4, stepsPerBeat: 4,
                    loopAtStep: 16, velocity: 0.8, pan: 0,
                    notes: [
                        { beat: 0, beatStep: 0, velocity: 0.9, pitch: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 0, beatStep: 0, velocity: 0.5, pitch: 2, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 2, beatStep: 0, velocity: 0.8, pitch: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                    ]
                }]
            }

            const flatMap = computeFlatNotesFromPattern(pattern, 0)
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
            const source = {
                name: 'MultiJSON', bpm: 120, nbBeats: 4,
                tracks: [{
                    name: 'KICK', nbBeats: 4, stepsPerBeat: 4,
                    notes: [
                        { beat: 0, beatStep: 0, velocity: 0.9, pitch: -3 },
                        { beat: 0, beatStep: 0, velocity: 0.5, pitch: 5 },
                    ]
                }]
            }

            const imported = mfCmd.importPatternFromJson(source)
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
            const source = {
                name: 'RoundTripMulti', bpm: 140, nbBeats: 4,
                tracks: [{
                    name: 'SNARE', nbBeats: 4, stepsPerBeat: 4,
                    notes: [
                        { beat: 1, beatStep: 2, velocity: 1.0, pitch: -2, every: 1 },
                        { beat: 1, beatStep: 2, velocity: 0.6, pitch: 4, every: 1 },
                        { beat: 3, beatStep: 0, velocity: 0.8, pitch: 0, every: 1 },
                    ]
                }]
            }

            const imported = mfCmd.importPatternFromJson(source)
            const exported = PatternExporter.export(imported)
            const reimported = mfCmd.importPatternFromJson(exported)
            const track = reimported.tracks[0]

            expect(track.notes.length).toBe(3)

            const step1Notes = track.notes.filter(n => n.beat === 1 && n.beatStep === 2)
            expect(step1Notes.length).toBe(2)
            expect(step1Notes[0].pitch).toBe(-2)
            expect(step1Notes[1].pitch).toBe(4)
            expect(step1Notes[0].velocity).toBe(1.0)
            expect(step1Notes[1].velocity).toBe(0.6)

            const step3Notes = track.notes.filter(n => n.beat === 3 && n.beatStep === 0)
            expect(step3Notes.length).toBe(1)
        })

        it('double export is stable with multi-note steps', () => {
            const source = {
                name: 'StableMulti', bpm: 120, nbBeats: 4,
                tracks: [{
                    name: 'KICK', nbBeats: 4, stepsPerBeat: 4,
                    notes: [
                        { beat: 0, beatStep: 0, velocity: 0.9, pitch: 0 },
                        { beat: 0, beatStep: 0, velocity: 0.4, pitch: 3 },
                    ]
                }]
            }

            const once = mfCmd.importPatternFromJson(source)
            const exportedOnce = PatternExporter.export(once)
            const twice = mfCmd.importPatternFromJson(exportedOnce)
            const exportedTwice = PatternExporter.export(twice)

            expect(exportedTwice.tracks).toEqual(exportedOnce.tracks)
        })
    })

    // ── MIDI export ─────────────────────────────────────────────────────────

    describe('MIDI: multi-note steps produce separate Note On events', () => {
        it('two notes at same step → two Note Ons at same MIDI tick', () => {
            const pattern = {
                name: 'MIDIMulti', bpm: 120, nbBeats: 1,
                tracks: [{
                    name: 'KICK', nbBeats: 1, stepsPerBeat: 4,
                    loopAtStep: 4, velocity: 0.8, pan: 0,
                    notes: [
                        { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 0, beatStep: 0, velocity: 0.5, pitch: 3, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                    ]
                }]
            }

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
            const pattern = {
                name: 'MIDITri', bpm: 120, nbBeats: 1,
                tracks: [{
                    name: 'SNARE', nbBeats: 1, stepsPerBeat: 4,
                    loopAtStep: 4, velocity: 0.8, pan: 0,
                    notes: [
                        { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 0, beatStep: 0, velocity: 0.7, pitch: 2, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 0, beatStep: 0, velocity: 0.4, pitch: -1, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                    ]
                }]
            }

            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = exporter.export(pattern, { loops: 1 })
            const noteOns = findAllNotes(parseMidi(midiBytes))

            expect(noteOns.length).toBe(3)
            const ticks = noteOns.map(n => n.absTick)
            expect(ticks[0]).toBe(ticks[1])
            expect(ticks[1]).toBe(ticks[2])
        })

        it('multi-note step combined with single-note step in MIDI', () => {
            const pattern = {
                name: 'MIDIMixed', bpm: 120, nbBeats: 2,
                tracks: [{
                    name: 'KICK', nbBeats: 2, stepsPerBeat: 4,
                    loopAtStep: 8, velocity: 0.8, pan: 0,
                    notes: [
                        { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 0, beatStep: 0, velocity: 0.5, pitch: 5, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                        { beat: 1, beatStep: 0, velocity: 0.8, pitch: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 },
                    ]
                }]
            }

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
