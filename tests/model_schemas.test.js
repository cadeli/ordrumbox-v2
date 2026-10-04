// tests/model_schemas.test.js
// Model contracts: FlatNote, Instrument, track_schema.

import { describe, it, expect, vi, afterEach } from 'vitest'
import FlatNote from '../src/model/flatnote.js'
import Instrument from '../src/model/instrument.js'
import { logger } from '../src/core/logger.js'
import { TRACK_DEFAULTS, normalizeTrack, TRACK_VALUE_RANGES } from '../src/model/track_schema.js'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('FlatNote', () => {
    it('stores tick/track/note with default pan and fpitch', () => {
        const note = new FlatNote(128, 'KICK', { beat: 1, beatStep: 2, pitch: 36 })
        expect(note.tick).toBe(128)
        expect(note.track).toBe('KICK')
        expect(note.note).toEqual({ beat: 1, beatStep: 2, pitch: 36 })
        expect(note.pan).toBe(0)
        expect(note.fpitch).toBe(1)
    })

    it('exposes the FlatNote TAG', () => {
        expect(FlatNote.TAG).toBe('FlatNote')
    })
})

describe('Instrument', () => {
    it('falls back to NOT_FOUND defaults when constructed empty', () => {
        const inst = new Instrument()
        expect(inst.id).toBe('NOT_FOUND')
        expect(Instrument.NOT_FOUND).toBe('NOT_FOUND')
        expect(inst.drum).toBe(false)
        expect(inst.pan).toBe(0) // number, like track.pan
        expect(inst.synonyms).toEqual([])
        expect(inst.subst).toEqual({})
        expect(inst.midi).toEqual([])
    })

    it('maps data into fields and wraps midi entries with their own defaults', () => {
        const inst = new Instrument({
            id: 'kick',
            drum: true,
            pan: 1,
            synonyms: ['bd', 'sub'],
            subst: { alt: 'x' },
            midi: [{ channel: 1, name: 'C', key: 3 }, {}],
        })
        expect(inst.id).toBe('kick')
        expect(inst.drum).toBe(true)
        expect(inst.pan).toBe(1)
        expect(inst.synonyms).toEqual(['bd', 'sub'])
        expect(inst.subst).toEqual({ alt: 'x' })
        expect(inst.midi).toHaveLength(2)
        expect(inst.midi[0]).toMatchObject({ channel: 1, name: 'C', key: 3, program: null, keyBased: null })
        // channel defaults to the number 9 (it was the string '9')
        expect(inst.midi[1]).toMatchObject({ channel: 9, name: '', key: null, program: null, keyBased: null })
    })

    it('treats a non-array midi field as no midi mapping', () => {
        const inst = new Instrument({ midi: 'nope' })
        expect(inst.midi).toEqual([])
    })

    it('toString renders key, type, pan, synonyms and midi entries', () => {
        const drum = new Instrument({
            id: 'kick',
            drum: true,
            pan: 1,
            synonyms: ['bd', 'sub'],
            midi: [{ name: 'GM', key: 36 }],
        })
        const text = drum.toString()
        expect(text).toContain('key : kick')
        expect(text).toContain('type: Drum')
        expect(text).toContain('pan: 1')
        expect(text).toContain('synonyms: [bd|sub]')
        expect(text).toContain('[GM key:36]')

        const melo = new Instrument({ id: 'lead', drum: false })
        expect(melo.toString()).toContain('type: Melo')
        expect(melo.toString()).not.toContain('synonyms: [')
    })
})

describe('track_schema', () => {
    it('TRACK_DEFAULTS pins the canonical core defaults', () => {
        expect(TRACK_DEFAULTS.name).toBe('')
        expect(TRACK_DEFAULTS.beatCount).toBe(4)
        expect(TRACK_DEFAULTS.stepsPerBeat).toBe(4)
        expect(TRACK_DEFAULTS.loopAtStep).toBeNull()
        expect(TRACK_DEFAULTS.velocity).toBe(1)
        expect(TRACK_DEFAULTS.pan).toBe(0)
        expect(TRACK_DEFAULTS.soundId).toBe('NOT_DEFINED')
        expect(TRACK_DEFAULTS.useAutoAssignSound).toBe(true)
        expect(TRACK_DEFAULTS.synthSoundKey).toBeNull()
        expect(TRACK_DEFAULTS.notes).toEqual([])
    })

    it('normalizeTrack fills missing properties from defaults without mutating the input', () => {
        const input = { name: 'KICK', velocity: 0.5 }
        const normalized = normalizeTrack(input)

        expect(input).toEqual({ name: 'KICK', velocity: 0.5 })
        expect(normalized.name).toBe('KICK')
        expect(normalized.velocity).toBe(0.5)
        expect(normalized.beatCount).toBe(4)
        expect(normalized.filterQ).toBe(0.707)
        expect(normalized.notes).toEqual([])
    })

    it('normalizeTrack copies the notes array instead of sharing the reference', () => {
        const notes = [{ beat: 0, beatStep: 0 }]
        const normalized = normalizeTrack({ notes })
        expect(normalized.notes).toEqual(notes)
        expect(normalized.notes).not.toBe(notes)
    })

    it('normalizeTrack replaces a non-array notes field with an empty array', () => {
        expect(normalizeTrack({ notes: { 0: { beat: 0 } } }).notes).toEqual([])
    })

    it('normalizeTrack(null) falls back to defaults', () => {
        vi.spyOn(logger, 'warn').mockImplementation(() => {})
        const normalized = normalizeTrack(null)
        expect(normalized).toEqual(TRACK_DEFAULTS)
        expect(normalized.notes).toEqual([])
    })

    it('TRACK_VALUE_RANGES documents the clamp ranges used by updateTrack', () => {
        expect(TRACK_VALUE_RANGES.velocity).toEqual({ min: 0, max: 1 })
        expect(TRACK_VALUE_RANGES.pan).toEqual({ min: -1, max: 1 })
        expect(TRACK_VALUE_RANGES.beatCount).toEqual({ min: 1, max: 16 })
        expect(TRACK_VALUE_RANGES.stepsPerBeat).toEqual({ min: 1, max: 8 })
        expect(TRACK_VALUE_RANGES.filterQ).toEqual({ min: 0.707, max: 18.707 })
        expect(TRACK_VALUE_RANGES.variation).toEqual({ min: 0, max: 100 })
    })

    it('every range entry is a finite min <= max pair', () => {
        for (const [key, range] of Object.entries(TRACK_VALUE_RANGES)) {
            expect(Number.isFinite(range.min), `${key}.min`).toBe(true)
            expect(Number.isFinite(range.max), `${key}.max`).toBe(true)
            expect(range.min <= range.max, `${key} range order`).toBe(true)
        }
    })
})
