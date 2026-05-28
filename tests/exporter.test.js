import { describe, it, expect, beforeEach } from 'vitest'
import { PatternExporter } from '../src/patterns/exporter.js'
import Utils from '../src/core/utils.js'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'

describe('PatternExporter', () => {
    // ── isDefaultValue ───────────────────────────────────────────────

    describe('isDefaultValue', () => {
        it('returns true for identical primitive values', () => {
            expect(PatternExporter.isDefaultValue(120, 120)).toBe(true)
            expect(PatternExporter.isDefaultValue('', '')).toBe(true)
            expect(PatternExporter.isDefaultValue(false, false)).toBe(true)
        })

        it('returns false for different primitive values', () => {
            expect(PatternExporter.isDefaultValue(140, 120)).toBe(false)
            expect(PatternExporter.isDefaultValue('KICK', '')).toBe(false)
        })

        it('returns true for null === null', () => {
            expect(PatternExporter.isDefaultValue(null, null)).toBe(true)
        })

        it('returns true for two empty arrays', () => {
            expect(PatternExporter.isDefaultValue([], [])).toBe(true)
        })

        it('returns false for non-empty array vs empty array', () => {
            expect(PatternExporter.isDefaultValue([1, 2], [])).toBe(false)
        })

        it('returns false for null vs 0', () => {
            expect(PatternExporter.isDefaultValue(null, 0)).toBe(false)
        })
    })

    // ── cleanNote ───────────────────────────────────────────────────

    describe('cleanNote', () => {
        it('removes keys that match NOTE_DEFAULTS', () => {
            const note = { ...Utils.NOTE_DEFAULTS }
            const cleaned = PatternExporter.cleanNote(note)
            // All default-valued keys should be stripped
            for (const key of Object.keys(Utils.NOTE_DEFAULTS)) {
                if (!Utils.NOTE_RECALCULATED.includes(key)) {
                    expect(cleaned).not.toHaveProperty(key)
                }
            }
        })

        it('keeps keys that differ from NOTE_DEFAULTS', () => {
            const note = { ...Utils.NOTE_DEFAULTS, velocity: 0.4, pitch: 3 }
            const cleaned = PatternExporter.cleanNote(note)
            expect(cleaned.velocity).toBe(0.4)
            expect(cleaned.pitch).toBe(3)
        })

        it('strips NOTE_RECALCULATED keys regardless of value', () => {
            const note = { ...Utils.NOTE_DEFAULTS, steppc: 50, stepPercent: 0.5 }
            const cleaned = PatternExporter.cleanNote(note)
            expect(cleaned).not.toHaveProperty('steppc')
            expect(cleaned).not.toHaveProperty('stepPercent')
        })

        it('keeps unknown keys (not in NOTE_DEFAULTS)', () => {
            const note = { ...Utils.NOTE_DEFAULTS, customTag: 'abc' }
            const cleaned = PatternExporter.cleanNote(note)
            expect(cleaned.customTag).toBe('abc')
        })

        it('fully strips a default note to empty object', () => {
            const note = { ...Utils.NOTE_DEFAULTS }
            const cleaned = PatternExporter.cleanNote(note)
            expect(Object.keys(cleaned).length).toBe(0)
        })
    })

    // ── cleanTrack ──────────────────────────────────────────────────

    describe('cleanTrack', () => {
        it('strips default track values', () => {
            const track = { ...Utils.TRACK_DEFAULTS, notes: [] }
            const cleaned = PatternExporter.cleanTrack(track)
            // Default fields that are also default-valued should be stripped
            expect(cleaned).not.toHaveProperty('bars')       // bars=4 is default
            expect(cleaned).not.toHaveProperty('mute')       // false is default
        })

        it('keeps non-default values', () => {
            const track = { ...Utils.TRACK_DEFAULTS, bars: 8, mute: true, notes: [] }
            const cleaned = PatternExporter.cleanTrack(track)
            expect(cleaned.bars).toBe(8)
            expect(cleaned.mute).toBe(true)
        })

        it('strips TRACK_RECALCULATED keys', () => {
            const track = { ...Utils.TRACK_DEFAULTS, loopPointBar: 2, loopPointStep: 0, notes: [] }
            const cleaned = PatternExporter.cleanTrack(track)
            expect(cleaned).not.toHaveProperty('loopPointBar')
            expect(cleaned).not.toHaveProperty('loopPointStep')
        })

        it('keeps unknown keys not in TRACK_DEFAULTS', () => {
            const track = { ...Utils.TRACK_DEFAULTS, notes: [], myMeta: 'session1' }
            const cleaned = PatternExporter.cleanTrack(track)
            expect(cleaned.myMeta).toBe('session1')
        })

        it('cleans notes inside the track', () => {
            const track = {
                ...Utils.TRACK_DEFAULTS,
                bars: 2,
                notes: [{ ...Utils.NOTE_DEFAULTS, velocity: 0.5, pitch: 0 }]
            }
            const cleaned = PatternExporter.cleanTrack(track)
            // pitch=0 is default, velocity=0.5 is not
            expect(cleaned.notes[0].velocity).toBe(0.5)
            expect(cleaned.notes[0]).not.toHaveProperty('pitch')
        })
    })

    // ── cleanPattern / export ────────────────────────────────────────

    describe('cleanPattern and export', () => {
        it('strips default pattern values', () => {
            const pattern = { ...Utils.PATTERN_DEFAULTS }
            const cleaned = PatternExporter.cleanPattern(pattern)
            // nbBars=4, bpm=120 are defaults, should be stripped
            expect(cleaned).not.toHaveProperty('nbBars')
            expect(cleaned).not.toHaveProperty('bpm')
        })

        it('keeps non-default pattern values', () => {
            const pattern = { ...Utils.PATTERN_DEFAULTS, bpm: 145, nbBars: 8, tracks: [] }
            const cleaned = PatternExporter.cleanPattern(pattern)
            expect(cleaned.bpm).toBe(145)
            expect(cleaned.nbBars).toBe(8)
        })

        it('cleans tracks inside the pattern', () => {
            const pattern = {
                ...Utils.PATTERN_DEFAULTS,
                bpm: 130,
                tracks: [{ ...Utils.TRACK_DEFAULTS, bars: 2, notes: [] }]
            }
            const cleaned = PatternExporter.cleanPattern(pattern)
            expect(cleaned.tracks[0].bars).toBe(2)
            expect(cleaned.tracks[0]).not.toHaveProperty('mute')
        })

        it('export adds application and url metadata', () => {
            const pattern = { ...Utils.PATTERN_DEFAULTS, bpm: 130, tracks: [] }
            const result = PatternExporter.export(pattern)
            expect(result.application).toBe('online-ordrumbox')
            expect(result.url).toBe('https://www.ordrumbox.com')
        })

        it('export preserves non-default pattern data', () => {
            const pattern = { ...Utils.PATTERN_DEFAULTS, bpm: 99, tracks: [] }
            const result = PatternExporter.export(pattern)
            expect(result.bpm).toBe(99)
        })
    })

    // ── toLegacyFormat ───────────────────────────────────────────────

    describe('toLegacyFormat', () => {
        let mfCmd

        beforeEach(() => {
            MfGlobals.resetAll()
            mfCmd = new MfCmd()
            MfGlobals.mfCmd = mfCmd
        })

        it('returns an object with data and string keys', () => {
            const pattern = mfCmd.addPattern('Rock')
            const result = PatternExporter.toLegacyFormat({ Rock: pattern }, mfCmd)
            expect(result).toHaveProperty('data')
            expect(result).toHaveProperty('string')
        })

        it('string output starts with { and ends with }', () => {
            const pattern = mfCmd.addPattern('Rock')
            const result = PatternExporter.toLegacyFormat({ Rock: pattern }, mfCmd)
            expect(result.string.trim()).toMatch(/^\{/)
            expect(result.string.trim()).toMatch(/\}$/)
        })

        it('includes pattern name in the legacy string', () => {
            const pattern = mfCmd.addPattern('Funk')
            const result = PatternExporter.toLegacyFormat({ Funk: pattern }, mfCmd)
            expect(result.string).toContain('"Funk"')
        })

        it('encodes notes with velocity, pitch and pan', () => {
            const pattern = mfCmd.addPattern('Beat')
            const track = mfCmd.addTrack(pattern, 'KICK', 4)
            mfCmd.addNote(track, 0, 0, 0)
            // Manually set velocity on the note to test encoding
            track.notes[0].velocity = 0.9
            const result = PatternExporter.toLegacyFormat({ Beat: pattern }, mfCmd)
            expect(result.string).toContain('_KICK-')
            expect(result.string).toContain('V0.9')
        })

        it('marks loop point in legacy string', () => {
            const pattern = mfCmd.addPattern('Beat')
            const track = mfCmd.addTrack(pattern, 'KICK', 4)
            track.loopAtStep = 8
            const result = PatternExporter.toLegacyFormat({ Beat: pattern }, mfCmd)
            expect(result.string).toContain('-L0-')
        })

        it('marks non-4/4 bars with -stop- marker', () => {
            const pattern = mfCmd.addPattern('Odd')
            mfCmd.addTrack(pattern, 'KICK', 3) // barQuantize=3 ≠ 4
            const result = PatternExporter.toLegacyFormat({ Odd: pattern }, mfCmd)
            expect(result.string).toContain('-stop-')
        })

        it('handles multiple patterns', () => {
            const p1 = mfCmd.addPattern('Alpha')
            const p2 = mfCmd.addPattern('Beta')
            const result = PatternExporter.toLegacyFormat({ Alpha: p1, Beta: p2 }, mfCmd)
            expect(result.string).toContain('"Alpha"')
            expect(result.string).toContain('"Beta"')
        })

        it('data.patterns contains all pattern names', () => {
            const p1 = mfCmd.addPattern('One')
            const p2 = mfCmd.addPattern('Two')
            const result = PatternExporter.toLegacyFormat({ One: p1, Two: p2 }, mfCmd)
            expect(result.data.patterns).toHaveProperty('One')
            expect(result.data.patterns).toHaveProperty('Two')
        })
    })
})
