import { describe, it, expect } from 'vitest'
import Defaults from '../src/patterns/defaults.js'
import { NOTE_DEFAULTS } from '../src/core/note_schema.js'
import { PATTERN_DEFAULTS } from '../src/model/pattern_schema.js'
import { TRACK_DEFAULTS } from '../src/model/track_schema.js'

describe('Defaults', () => {
    // ── normalizeNote ────────────────────────────────────────────────

    describe('normalizeNote', () => {
        it('returns NOTE_DEFAULTS when called with null', () => {
            const result = Defaults.normalizeNote(null)
            expect(result).toEqual(NOTE_DEFAULTS)
        })

        it('fills missing fields with defaults', () => {
            const note = { beat: 2, beatStep: 1 }
            const result = Defaults.normalizeNote(note)
            expect(result.beat).toBe(2)
            expect(result.beatStep).toBe(1)
            expect(result.velocity).toBe(NOTE_DEFAULTS.velocity)
            expect(result.pitch).toBe(NOTE_DEFAULTS.pitch)
        })

        it('preserves all provided fields', () => {
            const note = { beat: 1, beatStep: 2, pitch: 5, velocity: 0.6, pan: 0.3 }
            const result = Defaults.normalizeNote(note)
            expect(result.beat).toBe(1)
            expect(result.beatStep).toBe(2)
            expect(result.pitch).toBe(5)
            expect(result.velocity).toBe(0.6)
            expect(result.pan).toBe(0.3)
        })

        it('preserves extra custom fields via spread', () => {
            const note = { beat: 0, beatStep: 0, customField: 'hello' }
            const result = Defaults.normalizeNote(note)
            expect(result.customField).toBe('hello')
        })

        it('handles arp: null correctly', () => {
            const note = { beat: 0, beatStep: 0 }
            const result = Defaults.normalizeNote(note)
            expect(result.arp).toBeNull()
        })

        it('preserves arp when provided', () => {
            const arp = { steps: [0, 1, 2], pitch: 4 }
            const note = { beat: 0, beatStep: 0, arp }
            const result = Defaults.normalizeNote(note)
            expect(result.arp).toBe(arp)
        })
    })

    // ── getNoteProp ─────────────────────────────────────────────────

    describe('getNoteProp', () => {
        it('returns default when property is missing', () => {
            const note = { beat: 0 }
            expect(Defaults.getNoteProp(note, 'velocity')).toBe(NOTE_DEFAULTS.velocity)
        })

        it('returns default when note is null', () => {
            expect(Defaults.getNoteProp(null, 'velocity')).toBe(NOTE_DEFAULTS.velocity)
        })

        it('returns default when note is undefined', () => {
            expect(Defaults.getNoteProp(undefined, 'pitch')).toBe(NOTE_DEFAULTS.pitch)
        })
    })

    // ── getTrackProp ─────────────────────────────────────────────────

    describe('getTrackProp', () => {
        it('returns default when property is missing', () => {
            const track = { name: 'KICK' }
            expect(Defaults.getTrackProp(track, 'beatCount')).toBe(TRACK_DEFAULTS.beatCount)
        })

        it('returns default when track is null', () => {
            expect(Defaults.getTrackProp(null, 'beatCount')).toBe(TRACK_DEFAULTS.beatCount)
        })
    })

    // ── getPatternProp ───────────────────────────────────────────────

    describe('getPatternProp', () => {
        it('returns default when property is missing', () => {
            const pattern = { name: 'Rock' }
            expect(Defaults.getPatternProp(pattern, 'bpm')).toBe(PATTERN_DEFAULTS.bpm)
        })

        it('returns default when pattern is null', () => {
            expect(Defaults.getPatternProp(null, 'beatCount')).toBe(PATTERN_DEFAULTS.beatCount)
        })
    })
})
