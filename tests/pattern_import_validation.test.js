import { describe, it, expect } from 'vitest'
import { validatePatternJson } from '../src/logic/commands/pattern_import.js'

describe('validatePatternJson', () => {
    it('accepts a valid minimal pattern', () => {
        const result = validatePatternJson({ name: 'Test', tracks: {} })
        expect(result).toEqual({ ok: true })
    })

    it('accepts a valid pattern with tracks array', () => {
        const result = validatePatternJson({
            name: 'Test',
            tracks: [{ name: 'KICK', notes: [] }]
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
            tracks: { t: { name: 'T', notes: [[0, 0, 0]] } }
        })
        expect(result).toEqual({ ok: true })
    })

    it('accepts tracks as array', () => {
        const result = validatePatternJson({
            tracks: [{ name: 'KICK', notes: [] }]
        })
        expect(result).toEqual({ ok: true })
    })

    it('accepts extra fields on the top-level object', () => {
        const result = validatePatternJson({
            name: 'Test',
            bpm: 120,
            nbBeats: 4,
            tracks: {},
            unknownField: true
        })
        expect(result).toEqual({ ok: true })
    })
})
