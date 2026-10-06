import { describe, it, expect } from 'vitest'
import { Exporter } from '../src/patterns/exporter.js'
import { NOTE_DEFAULTS } from '../src/core/note_schema.js'
import { PATTERN_DEFAULTS } from '../src/model/pattern_schema.js'
import { TRACK_DEFAULTS } from '../src/model/track_schema.js'
import { NOTE_RECALCULATED } from '../src/core/note_schema.js'

describe('Exporter', () => {
    // ── isDefaultValue ───────────────────────────────────────────────

    describe('isDefaultValue', () => {
        it('returns false for different primitive values', () => {
            expect(Exporter.isDefaultValue(140, 120)).toBe(false)
            expect(Exporter.isDefaultValue('KICK', '')).toBe(false)
        })

        it('returns true for two empty arrays', () => {
            expect(Exporter.isDefaultValue([], [])).toBe(true)
        })

        it('returns false for non-empty array vs empty array', () => {
            expect(Exporter.isDefaultValue([1, 2], [])).toBe(false)
        })

        it('returns false for null vs 0', () => {
            expect(Exporter.isDefaultValue(null, 0)).toBe(false)
        })
    })

    // ── cleanNote ───────────────────────────────────────────────────

    describe('cleanNote', () => {
        it('removes keys that match NOTE_DEFAULTS', () => {
            const note = { ...NOTE_DEFAULTS }
            const cleaned = Exporter.cleanNote(note)
            // All default-valued keys should be stripped
            for (const key of Object.keys(NOTE_DEFAULTS)) {
                if (!NOTE_RECALCULATED.includes(key)) {
                    expect(cleaned).not.toHaveProperty(key)
                }
            }
        })

        it('keeps keys that differ from NOTE_DEFAULTS', () => {
            const note = { ...NOTE_DEFAULTS, velocity: 0.4, pitch: 3 }
            const cleaned = Exporter.cleanNote(note)
            expect(cleaned.velocity).toBe(0.4)
            expect(cleaned.pitch).toBe(3)
        })

        it('strips NOTE_RECALCULATED keys regardless of value', () => {
            const note = { ...NOTE_DEFAULTS, stepPercent: 50 }
            const cleaned = Exporter.cleanNote(note)
            expect(cleaned).not.toHaveProperty('stepPercent')
        })

        it('keeps unknown keys (not in NOTE_DEFAULTS)', () => {
            const note = { ...NOTE_DEFAULTS, customTag: 'abc' }
            const cleaned = Exporter.cleanNote(note)
            expect(cleaned.customTag).toBe('abc')
        })

        it('fully strips a default note to empty object', () => {
            const note = { ...NOTE_DEFAULTS }
            const cleaned = Exporter.cleanNote(note)
            expect(Object.keys(cleaned).length).toBe(0)
        })
    })

    // ── cleanTrack ──────────────────────────────────────────────────

    describe('cleanTrack', () => {
        it('strips default track values', () => {
            const track = { ...TRACK_DEFAULTS, notes: [] }
            const cleaned = Exporter.cleanTrack(track)
            // Default fields that are also default-valued should be stripped
            expect(cleaned).not.toHaveProperty('beatCount') // beats=4 is default
            expect(cleaned).not.toHaveProperty('mute') // false is default
        })

        it('keeps non-default values', () => {
            const track = { ...TRACK_DEFAULTS, beatCount: 8, mute: true, notes: [] }
            const cleaned = Exporter.cleanTrack(track)
            expect(cleaned.beatCount).toBe(8)
            expect(cleaned.mute).toBe(true)
        })

        it('keeps unknown keys not in TRACK_DEFAULTS', () => {
            const track = { ...TRACK_DEFAULTS, notes: [], myMeta: 'session1' }
            const cleaned = Exporter.cleanTrack(track)
            expect(cleaned.myMeta).toBe('session1')
        })

        it('cleans notes inside the track (compact format)', () => {
            const track = {
                ...TRACK_DEFAULTS,
                beatCount: 2,
                notes: [{ ...NOTE_DEFAULTS, velocity: 0.5, pitch: 0 }],
            }
            const cleaned = Exporter.cleanTrack(track)
            // pitch=0 is default, velocity=0.5 is not
            // Compact format: noteKeys + notes as arrays
            expect(cleaned.noteKeys).toEqual(['velocity'])
            expect(cleaned.notes[0]).toEqual([0.5])
        })
    })

    // ── cleanPattern / export ────────────────────────────────────────

    describe('cleanPattern and export', () => {
        it('strips default pattern values', () => {
            const pattern = { ...PATTERN_DEFAULTS }
            const cleaned = Exporter.cleanPattern(pattern)
            // beatCount=4, bpm=120 are defaults, should be stripped
            expect(cleaned).not.toHaveProperty('beatCount')
            expect(cleaned).not.toHaveProperty('bpm')
        })

        it('keeps non-default pattern values', () => {
            const pattern = { ...PATTERN_DEFAULTS, bpm: 145, beatCount: 8, tracks: [] }
            const cleaned = Exporter.cleanPattern(pattern)
            expect(cleaned.bpm).toBe(145)
            expect(cleaned.beatCount).toBe(8)
        })

        it('strips the runtime _revision counter', () => {
            const pattern = { ...PATTERN_DEFAULTS, _revision: 7, tracks: [] }
            const cleaned = Exporter.cleanPattern(pattern)
            expect(cleaned).not.toHaveProperty('_revision')
        })

        it('cleans tracks inside the pattern', () => {
            const pattern = {
                ...PATTERN_DEFAULTS,
                bpm: 130,
                tracks: [{ ...TRACK_DEFAULTS, beatCount: 2, notes: [] }],
            }
            const cleaned = Exporter.cleanPattern(pattern)
            expect(cleaned.tracks[0].beatCount).toBe(2)
            expect(cleaned.tracks[0]).not.toHaveProperty('mute')
        })

        it('export adds application and url metadata', () => {
            const pattern = { ...PATTERN_DEFAULTS, bpm: 130, tracks: [] }
            const result = Exporter.export(pattern)
            expect(result.application).toBe('online-ordrumbox')
            expect(result.url).toBe('https://www.ordrumbox.com')
        })

        it('export preserves non-default pattern data', () => {
            const pattern = { ...PATTERN_DEFAULTS, bpm: 99, tracks: [] }
            const result = Exporter.export(pattern)
            expect(result.bpm).toBe(99)
        })
    })
})

// ── id ───────────────────────────────────────────────────────────────────────

describe('Exporter keeps the pattern id', () => {
    // `id` lives in PATTERN_DEFAULTS, so the default-only stripping would drop it
    // from every exported file and leave arrangements pointing at nothing.
    it('writes it even though the default is an empty string', () => {
        const out = Exporter.export({ id: 'rock', name: 'Rock', beatCount: 4, tracks: [] })
        expect(out.id).toBe('rock')
    })

    it('omits it when the pattern has none', () => {
        const out = Exporter.export({ name: 'Rock', beatCount: 4, tracks: [] })
        expect('id' in out).toBe(false)
    })

    it('survives a round trip through cleanPattern', () => {
        const cleaned = Exporter.cleanPattern({ id: 'a-1', name: 'x', beatCount: 8 })
        expect(cleaned.id).toBe('a-1')
    })
})
