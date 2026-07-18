import { describe, it, expect } from 'vitest'
import MfDefaults from '../src/patterns/defaults.js'
import Utils from '../src/core/utils.js'

describe('MfDefaults', () => {
    // ── normalizeNote ────────────────────────────────────────────────

    describe('normalizeNote', () => {
        it('returns NOTE_DEFAULTS when called with null', () => {
            const result = MfDefaults.normalizeNote(null)
            expect(result).toEqual(Utils.NOTE_DEFAULTS)
        })

        it('returns NOTE_DEFAULTS when called with undefined', () => {
            const result = MfDefaults.normalizeNote(undefined)
            expect(result).toEqual(Utils.NOTE_DEFAULTS)
        })

        it('fills missing fields with defaults', () => {
            const note = { beat: 2, beatStep: 1 }
            const result = MfDefaults.normalizeNote(note)
            expect(result.beat).toBe(2)
            expect(result.beatStep).toBe(1)
            expect(result.velocity).toBe(Utils.NOTE_DEFAULTS.velocity)
            expect(result.pitch).toBe(Utils.NOTE_DEFAULTS.pitch)
        })

        it('preserves all provided fields', () => {
            const note = { beat: 1, beatStep: 2, pitch: 5, velocity: 0.6, pan: 0.3 }
            const result = MfDefaults.normalizeNote(note)
            expect(result.beat).toBe(1)
            expect(result.beatStep).toBe(2)
            expect(result.pitch).toBe(5)
            expect(result.velocity).toBe(0.6)
            expect(result.pan).toBe(0.3)
        })



        it('preserves extra custom fields via spread', () => {
            const note = { beat: 0, beatStep: 0, customField: 'hello' }
            const result = MfDefaults.normalizeNote(note)
            expect(result.customField).toBe('hello')
        })

        it('handles arp: null correctly', () => {
            const note = { beat: 0, beatStep: 0 }
            const result = MfDefaults.normalizeNote(note)
            expect(result.arp).toBeNull()
        })

        it('preserves arp when provided', () => {
            const arp = { steps: [0, 1, 2], pitch: 4 }
            const note = { beat: 0, beatStep: 0, arp }
            const result = MfDefaults.normalizeNote(note)
            expect(result.arp).toBe(arp)
        })
    })

    // ── getNoteProp ─────────────────────────────────────────────────

    describe('getNoteProp', () => {
        it('returns note property when present', () => {
            const note = { velocity: 0.5 }
            expect(MfDefaults.getNoteProp(note, 'velocity')).toBe(0.5)
        })

        it('returns default when property is missing', () => {
            const note = { beat: 0 }
            expect(MfDefaults.getNoteProp(note, 'velocity')).toBe(Utils.NOTE_DEFAULTS.velocity)
        })

        it('returns default when note is null', () => {
            expect(MfDefaults.getNoteProp(null, 'velocity')).toBe(Utils.NOTE_DEFAULTS.velocity)
        })

        it('returns default when note is undefined', () => {
            expect(MfDefaults.getNoteProp(undefined, 'pitch')).toBe(Utils.NOTE_DEFAULTS.pitch)
        })
    })

    // ── getTrackProp ─────────────────────────────────────────────────

    describe('getTrackProp', () => {
        it('returns track property when present', () => {
            const track = { nbBeats: 8 }
            expect(MfDefaults.getTrackProp(track, 'nbBeats')).toBe(8)
        })

        it('returns default when property is missing', () => {
            const track = { name: 'KICK' }
            expect(MfDefaults.getTrackProp(track, 'nbBeats')).toBe(Utils.TRACK_DEFAULTS.nbBeats)
        })

        it('returns default when track is null', () => {
            expect(MfDefaults.getTrackProp(null, 'nbBeats')).toBe(Utils.TRACK_DEFAULTS.nbBeats)
        })
    })

    // ── getPatternProp ───────────────────────────────────────────────

    describe('getPatternProp', () => {
        it('returns pattern property when present', () => {
            const pattern = { bpm: 140 }
            expect(MfDefaults.getPatternProp(pattern, 'bpm')).toBe(140)
        })

        it('returns default when property is missing', () => {
            const pattern = { name: 'Rock' }
            expect(MfDefaults.getPatternProp(pattern, 'bpm')).toBe(Utils.PATTERN_DEFAULTS.bpm)
        })

        it('returns default when pattern is null', () => {
            expect(MfDefaults.getPatternProp(null, 'nbBeats')).toBe(Utils.PATTERN_DEFAULTS.nbBeats)
        })
    })
})
