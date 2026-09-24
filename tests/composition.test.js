import { describe, it, expect } from 'vitest'
import {
    CHORD_QUALITIES,
    SEQUENCES,
    BEATS_PER_MEASURE,
    getSequence,
    buildSequenceNotes,
} from '../src/logic/composition.js'

describe('composition sequences library', () => {
    it('exposes a non-empty standard sequence library', () => {
        expect(SEQUENCES.length).toBeGreaterThan(0)
        for (const seq of SEQUENCES) {
            expect(seq.id).toBeTruthy()
            expect(seq.name).toBeTruthy()
            expect(seq.chords.length).toBeGreaterThan(0)
            for (const chord of seq.chords) {
                expect(CHORD_QUALITIES[chord.quality]).toBeDefined()
                expect(Number.isInteger(chord.root)).toBe(true)
            }
        }
    })

    it('getSequence cycles with wrap-around and negatives', () => {
        expect(getSequence(0)).toBe(SEQUENCES[0])
        expect(getSequence(SEQUENCES.length)).toBe(SEQUENCES[0])
        expect(getSequence(-1)).toBe(SEQUENCES[SEQUENCES.length - 1])
        expect(getSequence(1)).toBe(SEQUENCES[1])
    })

    it('buildSequenceNotes places one chord per measure (every 4 beats)', () => {
        const notes = buildSequenceNotes(SEQUENCES[0], 0, 8)
        const beats = [...new Set(notes.map((n) => n.beat))].sort((a, b) => a - b)
        expect(beats).toEqual([0, 4])
        expect(notes.every((n) => n.beatStep === 0)).toBe(true)
        expect(notes.every((n) => Number.isInteger(n.pitch))).toBe(true)
        expect(BEATS_PER_MEASURE).toBe(4)
    })

    it('buildSequenceNotes places a single chord on a 4-beat pattern', () => {
        const notes = buildSequenceNotes(SEQUENCES[0], 0, 4)
        const beats = [...new Set(notes.map((n) => n.beat))]
        expect(beats).toEqual([0])
    })

    it('buildSequenceNotes uses tonic offset and cycles chords across measures', () => {
        const seq = SEQUENCES[0]
        const tonic = 5
        const notes = buildSequenceNotes(seq, tonic, 5 * BEATS_PER_MEASURE)
        const rel = (beat) =>
            notes
                .filter((n) => n.beat === beat)
                .map((n) => n.pitch - tonic)
                .sort((a, b) => a - b)
        const chordRel = (idx) => {
            const chord = seq.chords[idx]
            return CHORD_QUALITIES[chord.quality].map((i) => chord.root + i).sort((a, b) => a - b)
        }

        expect(rel(0)).toEqual(chordRel(0))
        expect(rel(BEATS_PER_MEASURE)).toEqual(chordRel(1))
        expect(rel(4 * BEATS_PER_MEASURE)).toEqual(chordRel(0))
    })

    it('buildSequenceNotes returns empty for invalid input', () => {
        expect(buildSequenceNotes(null, 0, 4)).toEqual([])
        expect(buildSequenceNotes({ chords: [] }, 0, 4)).toEqual([])
        expect(buildSequenceNotes(SEQUENCES[0], 0, 0)).toEqual([])
    })
})
