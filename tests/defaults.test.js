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
            const note = { bar: 2, barStep: 1 }
            const result = MfDefaults.normalizeNote(note)
            expect(result.bar).toBe(2)
            expect(result.barStep).toBe(1)
            expect(result.velocity).toBe(Utils.NOTE_DEFAULTS.velocity)
            expect(result.pitch).toBe(Utils.NOTE_DEFAULTS.pitch)
        })

        it('preserves all provided fields', () => {
            const note = { bar: 1, barStep: 2, pitch: 5, velocity: 0.6, pan: 0.3 }
            const result = MfDefaults.normalizeNote(note)
            expect(result.bar).toBe(1)
            expect(result.barStep).toBe(2)
            expect(result.pitch).toBe(5)
            expect(result.velocity).toBe(0.6)
            expect(result.pan).toBe(0.3)
        })

        it('uses note.step as fallback for barStep', () => {
            const note = { bar: 0, step: 3 }
            const result = MfDefaults.normalizeNote(note)
            expect(result.barStep).toBe(3)
        })

        it('barStep takes priority over step', () => {
            const note = { bar: 0, barStep: 2, step: 5 }
            const result = MfDefaults.normalizeNote(note)
            expect(result.barStep).toBe(2)
        })

        it('preserves extra custom fields via spread', () => {
            const note = { bar: 0, barStep: 0, customField: 'hello' }
            const result = MfDefaults.normalizeNote(note)
            expect(result.customField).toBe('hello')
        })

        it('handles arp: null correctly', () => {
            const note = { bar: 0, barStep: 0 }
            const result = MfDefaults.normalizeNote(note)
            expect(result.arp).toBeNull()
        })

        it('preserves arp when provided', () => {
            const arp = { steps: [0, 1, 2], pitch: 4 }
            const note = { bar: 0, barStep: 0, arp }
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
            const note = { bar: 0 }
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
            const track = { bars: 8 }
            expect(MfDefaults.getTrackProp(track, 'bars')).toBe(8)
        })

        it('returns default when property is missing', () => {
            const track = { name: 'KICK' }
            expect(MfDefaults.getTrackProp(track, 'bars')).toBe(Utils.TRACK_DEFAULTS.bars)
        })

        it('returns default when track is null', () => {
            expect(MfDefaults.getTrackProp(null, 'bars')).toBe(Utils.TRACK_DEFAULTS.bars)
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
            expect(MfDefaults.getPatternProp(null, 'nbBars')).toBe(Utils.PATTERN_DEFAULTS.nbBars)
        })
    })

    // ── normalizeTrack ───────────────────────────────────────────────

    describe('normalizeTrack', () => {
        it('returns TRACK_DEFAULTS with empty notes when called with null', () => {
            const result = MfDefaults.normalizeTrack(null)
            expect(result.notes).toEqual([])
            expect(result.bars).toBe(Utils.TRACK_DEFAULTS.bars)
            expect(result.barQuantize).toBe(Utils.TRACK_DEFAULTS.barQuantize)
        })

        it('returns TRACK_DEFAULTS when called with undefined', () => {
            const result = MfDefaults.normalizeTrack(undefined)
            expect(result.notes).toEqual([])
            expect(result.name).toBe(Utils.TRACK_DEFAULTS.name)
        })

        it('preserves provided track fields', () => {
            const track = { name: 'SNARE', bars: 2, notes: [{ bar: 0, barStep: 1 }] }
            const result = MfDefaults.normalizeTrack(track)
            expect(result.name).toBe('SNARE')
            expect(result.bars).toBe(2)
            expect(result.notes).toEqual(track.notes)
        })

        it('fills in missing fields with defaults', () => {
            const track = { name: 'KICK' }
            const result = MfDefaults.normalizeTrack(track)
            expect(result.bars).toBe(Utils.TRACK_DEFAULTS.bars)
            expect(result.barQuantize).toBe(Utils.TRACK_DEFAULTS.barQuantize)
            expect(result.swingAmount).toBe(Utils.TRACK_DEFAULTS.swingAmount)
            expect(result.mute).toBe(false)
            expect(result.solo).toBe(false)
        })

        it('keeps useSoftSynth when explicitly set to true', () => {
            const track = { name: 'KICK', useSoftSynth: true }
            const result = MfDefaults.normalizeTrack(track)
            expect(result.useSoftSynth).toBe(true)
        })

        it('defaults useSoftSynth to false', () => {
            const track = { name: 'KICK' }
            const result = MfDefaults.normalizeTrack(track)
            expect(result.useSoftSynth).toBe(false)
        })

        it('preserves custom extra fields via spread', () => {
            const track = { name: 'KICK', myCustomProp: 42 }
            const result = MfDefaults.normalizeTrack(track)
            expect(result.myCustomProp).toBe(42)
        })
    })

    // ── normalizePattern ─────────────────────────────────────────────

    describe('normalizePattern', () => {
        it('returns PATTERN_DEFAULTS with empty tracks when called with null', () => {
            const result = MfDefaults.normalizePattern(null)
            expect(result.tracks).toEqual([])
            expect(result.nbBars).toBe(Utils.PATTERN_DEFAULTS.nbBars)
            expect(result.bpm).toBe(Utils.PATTERN_DEFAULTS.bpm)
        })

        it('returns PATTERN_DEFAULTS when called with undefined', () => {
            const result = MfDefaults.normalizePattern(undefined)
            expect(result.tracks).toEqual([])
        })

        it('preserves provided fields', () => {
            const pattern = { nbBars: 8, bpm: 140, description: 'funky', tags: ['funk'], tracks: [] }
            const result = MfDefaults.normalizePattern(pattern)
            expect(result.nbBars).toBe(8)
            expect(result.bpm).toBe(140)
            expect(result.description).toBe('funky')
            expect(result.tags).toEqual(['funk'])
        })

        it('fills missing fields with defaults', () => {
            const pattern = { name: 'RockBeat' }
            const result = MfDefaults.normalizePattern(pattern)
            expect(result.nbBars).toBe(Utils.PATTERN_DEFAULTS.nbBars)
            expect(result.bpm).toBe(Utils.PATTERN_DEFAULTS.bpm)
        })

        it('preserves custom extra fields via spread', () => {
            const pattern = { nbBars: 4, customMeta: 'live' }
            const result = MfDefaults.normalizePattern(pattern)
            expect(result.customMeta).toBe('live')
        })
    })
})
