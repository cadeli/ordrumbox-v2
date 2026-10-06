import { describe, it, expect } from 'vitest'
import { validatePatternJson, importPatternFromJson } from '../src/logic/commands/pattern_import.js'

describe('validatePatternJson', () => {
    it('accepts a valid minimal pattern', () => {
        const result = validatePatternJson({ name: 'Test', tracks: {} })
        expect(result).toEqual({ ok: true })
    })

    it('accepts a valid pattern with tracks array', () => {
        const result = validatePatternJson({
            name: 'Test',
            tracks: [{ name: 'KICK', notes: [] }],
        })
        expect(result).toEqual({ ok: true })
    })

    it('accepts null tracks (no tracks key)', () => {
        const result = validatePatternJson({ name: 'Empty' })
        expect(result).toEqual({ ok: true })
    })

    it('accepts empty tracks object', () => {
        const result = validatePatternJson({ tracks: {} })
        expect(result).toEqual({ ok: true })
    })

    it('rejects null', () => {
        const result = validatePatternJson(null)
        expect(result.ok).toBe(false)
        expect(result.error).toContain('JSON object')
    })

    it('rejects undefined', () => {
        const result = validatePatternJson(undefined)
        expect(result.ok).toBe(false)
    })

    it('rejects an array', () => {
        const result = validatePatternJson([])
        expect(result.ok).toBe(false)
        expect(result.error).toContain('JSON object')
    })

    it('rejects a string', () => {
        const result = validatePatternJson('hello')
        expect(result.ok).toBe(false)
    })

    it('rejects a number', () => {
        const result = validatePatternJson(42)
        expect(result.ok).toBe(false)
    })

    it('rejects tracks as a string', () => {
        const result = validatePatternJson({ tracks: 'bad' })
        expect(result.ok).toBe(false)
        expect(result.error).toContain('"tracks"')
    })

    it('rejects a non-object track entry', () => {
        const result = validatePatternJson({ tracks: { 0: 'bad' } })
        expect(result.ok).toBe(false)
        expect(result.error).toContain('track')
    })

    it('rejects an array track entry that is not an object', () => {
        const result = validatePatternJson({ tracks: [123] })
        expect(result.ok).toBe(false)
        expect(result.error).toContain('track')
    })

    it('rejects when track count exceeds limit', () => {
        const tracks = {}
        for (let i = 0; i < 65; i++) tracks[`t${i}`] = { name: `T${i}` }
        const result = validatePatternJson({ tracks })
        expect(result.ok).toBe(false)
        expect(result.error).toContain('Too many tracks')
    })

    it('rejects when note count exceeds limit', () => {
        const notes = {}
        for (let i = 0; i < 10_001; i++) notes[i] = { beat: 0, beatStep: 0, pitch: 0 }
        const result = validatePatternJson({ tracks: { t: { name: 'T', notes } } })
        expect(result.ok).toBe(false)
        expect(result.error).toContain('Too many notes')
    })

    it('accepts notes as array (compact format)', () => {
        const result = validatePatternJson({
            tracks: { t: { name: 'T', notes: [[0, 0, 0]] } },
        })
        expect(result).toEqual({ ok: true })
    })

    it('accepts tracks as array', () => {
        const result = validatePatternJson({
            tracks: [{ name: 'KICK', notes: [] }],
        })
        expect(result).toEqual({ ok: true })
    })

    it('accepts extra fields on the top-level object', () => {
        const result = validatePatternJson({
            name: 'Test',
            bpm: 120,
            beatCount: 4,
            tracks: {},
            unknownField: true,
        })
        expect(result).toEqual({ ok: true })
    })
})

// An import re-creates the pattern field by field. If the source id were not
// carried over, addPattern() would mint a fresh one from the name — so a
// renamed pattern would get a new id on every reload and every song clip
// referencing it would silently dangle.
describe('importPatternFromJson preserves the pattern id', () => {
    const importPattern = (source) => {
        const imported = importPatternFromJson(source, () => ({
            name: 'tmp',
            description: '',
            tracks: [],
            bpm: 120,
            beatCount: 4,
            id: 'minted-from-the-name',
        }))
        return imported
    }

    it('keeps the source id', () => {
        expect(importPattern({ name: 'A', id: 'stable-id', tracks: [] }).id).toBe('stable-id')
    })

    it('keeps an id that does not match the name', () => {
        expect(importPattern({ name: 'Renamed', id: 'original-slug', tracks: [] }).id).toBe('original-slug')
    })

    it('leaves the minted id alone when the source has none', () => {
        expect(importPattern({ name: 'A', tracks: [] }).id).toBe('minted-from-the-name')
    })
})

describe('importPatternFromJson maps legacy track keys', () => {
    const importPattern = (source) =>
        importPatternFromJson(
            source,
            () => ({ name: 'tmp', description: '', tracks: [], bpm: 120, beatCount: 4 }),
            (pattern, name) => {
                const track = { name, notes: [] }
                pattern.tracks.push(track)
                return track
            },
            (track, beat, beatStep, pitch) => {
                const note = { beat, beatStep, pitch }
                track.notes.push(note)
                return note
            },
        )

    it('renames soundId to sampleId on the imported track', () => {
        const imported = importPattern({ name: 'A', tracks: [{ name: 'KICK', soundId: 'kick01', notes: [] }] })
        expect(imported.tracks[0].sampleId).toBe('kick01')
        expect(imported.tracks[0]).not.toHaveProperty('soundId')
    })

    it('keeps a sampleId already present', () => {
        const imported = importPattern({
            name: 'A',
            tracks: [{ name: 'KICK', soundId: 'old', sampleId: 'new', notes: [] }],
        })
        expect(imported.tracks[0].sampleId).toBe('new')
        expect(imported.tracks[0]).not.toHaveProperty('soundId')
    })
})
