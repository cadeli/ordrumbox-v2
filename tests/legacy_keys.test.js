import { describe, it, expect } from 'vitest'
import {
    migrateLegacyTrackKeys,
    migrateLegacyClipKeys,
    migrateLegacySongKeys,
} from '../src/core/legacy_keys.js'

describe('legacy key migration (read side)', () => {
    it('moves a legacy track key onto its current spelling', () => {
        const track = { soundId: 'kick.wav' }
        expect(migrateLegacyTrackKeys(track)).toBe(true)
        expect(track).toEqual({ sampleId: 'kick.wav' })
    })

    // The value is already the current one, but the record still carries a
    // legacy key MIGRATIONS[8] has to rewrite — without reporting it the
    // cursor is never updated and the stale key stays in the store.
    it('reports a change when only the stale legacy spelling must be dropped', () => {
        const track = { sampleId: 'kick.wav', soundId: 'old.wav' }
        expect(migrateLegacyTrackKeys(track)).toBe(true)
        expect(track).toEqual({ sampleId: 'kick.wav' })
    })

    it('leaves an already-current record untouched', () => {
        const track = { sampleId: 'kick.wav' }
        expect(migrateLegacyTrackKeys(track)).toBe(false)
        expect(track).toEqual({ sampleId: 'kick.wav' })
    })

    it('migrates clip keys, including the stale-legacy case', () => {
        const both = { startMeasure: 4, measureCount: 2, startBar: 9, bars: 7 }
        expect(migrateLegacyClipKeys(both)).toBe(true)
        expect(both).toEqual({ startMeasure: 4, measureCount: 2 })

        const legacyOnly = { startBar: 1 }
        expect(migrateLegacyClipKeys(legacyOnly)).toBe(true)
        expect(legacyOnly).toEqual({ startMeasure: 1 })

        const current = { startMeasure: 1, measureCount: 2 }
        expect(migrateLegacyClipKeys(current)).toBe(false)
    })

    it('migrates song keys and every clip it carries', () => {
        const song = {
            loopMeasureCount: 8,
            loopBars: 4,
            clips: [{ startBar: 1, bars: 2 }, { startMeasure: 3, measureCount: 1 }],
        }
        expect(migrateLegacySongKeys(song)).toBe(true)
        expect(song).toEqual({
            loopMeasureCount: 8,
            clips: [{ startMeasure: 1, measureCount: 2 }, { startMeasure: 3, measureCount: 1 }],
        })
    })

    it('leaves non-objects alone', () => {
        expect(migrateLegacyTrackKeys(null)).toBe(false)
        expect(migrateLegacyClipKeys(undefined)).toBe(false)
        expect(migrateLegacySongKeys('song')).toBe(false)
    })
})
