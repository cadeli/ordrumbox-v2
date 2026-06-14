import { describe, it, expect, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import { PatternExporter } from '../src/patterns/exporter.js'
import Utils from '../src/core/utils.js'

describe('PatternExporter - cleanNote', () => {
    it('strips recalculated fields', () => {
        const cleaned = PatternExporter.cleanNote({
            bar: 0, barStep: 0, velocity: 0.8,
            steppc: 50, stepPercent: 0.5
        })
        expect(cleaned).not.toHaveProperty('steppc')
        expect(cleaned).not.toHaveProperty('stepPercent')
    })

    it('strips default-valued fields', () => {
        const cleaned = PatternExporter.cleanNote({
            bar: 0, barStep: 0, velocity: 0.8, pitch: 0,
            pan: 0, arp: null, triggerFreq: 1, triggerPhase: 0,
            triggerProbability: 1, arpTriggerProbability: 1,
            retriggerNum: 1, retriggerStep: 1, euclidianFill: 0
        })
        expect(Object.keys(cleaned).length).toBe(0)
    })

    it('preserves non-default values', () => {
        const cleaned = PatternExporter.cleanNote({
            bar: 0, barStep: 0, velocity: 0.9, pitch: 3, arp: [0, 7],
            triggerFreq: 2, pan: -0.5, retriggerNum: 4
        })
        expect(cleaned.velocity).toBe(0.9)
        expect(cleaned.pitch).toBe(3)
        expect(cleaned.arp).toEqual([0, 7])
        expect(cleaned.triggerFreq).toBe(2)
        expect(cleaned.pan).toBe(-0.5)
        expect(cleaned.retriggerNum).toBe(4)
    })
})

describe('PatternExporter - cleanTrack', () => {
    it('strips recalculated fields', () => {
        const cleaned = PatternExporter.cleanTrack({
            name: 'KICK', loopPointBar: 2, loopPointStep: 0
        })
        expect(cleaned).not.toHaveProperty('loopPointBar')
        expect(cleaned).not.toHaveProperty('loopPointStep')
    })

    it('strips default-valued fields and keeps non-default', () => {
        const cleaned = PatternExporter.cleanTrack({
            name: 'KICK', bars: 8, barQuantize: 4, velocity: 1,
            pan: 0.5, mute: false, solo: false, auto: false,
            useSoftSynth: true, useAutoAssignSound: true,
            notes: []
        })
        expect(cleaned.name).toBe('KICK')
        expect(cleaned.bars).toBe(8)
        expect(cleaned.pan).toBe(0.5)
        expect(cleaned.useSoftSynth).toBe(true)
        expect(cleaned).not.toHaveProperty('mute')
        expect(cleaned).not.toHaveProperty('solo')
        expect(cleaned).not.toHaveProperty('velocity')
        expect(cleaned).not.toHaveProperty('auto')
        expect(cleaned).not.toHaveProperty('useAutoAssignSound')
    })

    it('cleans notes recursively', () => {
        const cleaned = PatternExporter.cleanTrack({
            name: 'KICK',
            notes: [
                { bar: 0, barStep: 0, velocity: 0.8, pitch: 0, steppc: 50 },
                { bar: 1, barStep: 2, velocity: 0.9, pitch: 2 }
            ]
        })
        expect(cleaned.notes).toHaveLength(2)
        expect(cleaned.notes[0]).not.toHaveProperty('steppc')
        expect(Object.keys(cleaned.notes[0]).length).toBe(0)
        expect(cleaned.notes[1].velocity).toBe(0.9)
        expect(cleaned.notes[1].pitch).toBe(2)
    })
})

describe('PatternExporter - cleanPattern', () => {
    it('strips default-valued pattern fields', () => {
        const cleaned = PatternExporter.cleanPattern({
            name: 'Test', nbBars: 4, bpm: 120, description: '',
            tags: [], tracks: []
        })
        expect(cleaned.name).toBe('Test')
        expect(cleaned).not.toHaveProperty('nbBars')
        expect(cleaned).not.toHaveProperty('bpm')
        expect(cleaned).not.toHaveProperty('description')
        expect(cleaned).not.toHaveProperty('tags')
    })

    it('preserves non-default pattern fields', () => {
        const cleaned = PatternExporter.cleanPattern({
            name: 'Test', nbBars: 8, bpm: 140,
            description: 'A pattern', tags: ['techno'],
            tracks: []
        })
        expect(cleaned.name).toBe('Test')
        expect(cleaned.nbBars).toBe(8)
        expect(cleaned.bpm).toBe(140)
        expect(cleaned.description).toBe('A pattern')
        expect(cleaned.tags).toEqual(['techno'])
    })
})

describe('PatternExporter - export', () => {
    it('includes metadata', () => {
        const result = PatternExporter.export({ name: 'Test' })
        expect(result.application).toBe('online-ordrumbox')
        expect(result.url).toBe('https://www.ordrumbox.com')
        expect(result.name).toBe('Test')
    })

    it('metadata is always first keys', () => {
        const result = PatternExporter.export({ name: 'Test' })
        const keys = Object.keys(result)
        expect(keys[0]).toBe('application')
        expect(keys[1]).toBe('url')
    })
})

describe('PatternExporter - isDefaultValue', () => {
    it('exact match returns true', () => {
        expect(PatternExporter.isDefaultValue(4, 4)).toBe(true)
        expect(PatternExporter.isDefaultValue('test', 'test')).toBe(true)
        expect(PatternExporter.isDefaultValue(false, false)).toBe(true)
    })

    it('null matches null', () => {
        expect(PatternExporter.isDefaultValue(null, null)).toBe(true)
    })

    it('empty arrays match', () => {
        expect(PatternExporter.isDefaultValue([], [])).toBe(true)
    })

    it('non-empty arrays do not match empty arrays', () => {
        expect(PatternExporter.isDefaultValue([1], [])).toBe(false)
    })

    it('different values return false', () => {
        expect(PatternExporter.isDefaultValue(8, 4)).toBe(false)
        expect(PatternExporter.isDefaultValue(true, false)).toBe(false)
    })
})

describe('Functional: Pattern serialization round-trip', () => {
    let mfCmd

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
    })

    it('full pattern round-trip preserves all properties', () => {
        const sourcePattern = {
            name: 'RoundTrip',
            bpm: 130,
            nbBars: 8,
            description: 'Test pattern',
            tags: ['techno', 'dark'],
            tracks: [
                {
                    name: 'KICK',
                    bars: 8,
                    barQuantize: 4,
                    loopAtStep: 32,
                    velocity: 0.9,
                    pan: 0,
                    notes: [
                        { bar: 0, barStep: 0, velocity: 0.9, pitch: 0, triggerFreq: 1, triggerPhase: 0 },
                        { bar: 2, barStep: 2, velocity: 0.7, pitch: 2, triggerFreq: 2, triggerPhase: 1 }
                    ]
                },
                {
                    name: 'SNARE',
                    bars: 8,
                    barQuantize: 4,
                    loopAtStep: 32,
                    notes: [
                        { bar: 1, barStep: 0, velocity: 0.8, pitch: 0, arp: [0, 7], retriggerNum: 3 }
                    ]
                }
            ]
        }

        const imported = mfCmd.importPatternFromJson(sourcePattern)
        const exported = PatternExporter.export(imported)
        const reimported = mfCmd.importPatternFromJson(exported)

        expect(reimported.name).toBe(sourcePattern.name)
        expect(reimported.bpm).toBe(sourcePattern.bpm)
        expect(reimported.nbBars).toBe(sourcePattern.nbBars)
        expect(reimported.description).toBe(sourcePattern.description)
        expect(reimported.tags).toEqual(expect.objectContaining({ 0: 'techno', 1: 'dark' }))
        expect(reimported.tracks.length).toBe(sourcePattern.tracks.length)

        for (let i = 0; i < sourcePattern.tracks.length; i++) {
            const srcTrack = sourcePattern.tracks[i]
            const impTrack = reimported.tracks[i]
            expect(impTrack.name).toBe(srcTrack.name)
            expect(impTrack.bars).toBe(srcTrack.bars)
            expect(impTrack.barQuantize).toBe(srcTrack.barQuantize)
            expect(impTrack.notes.length).toBe(srcTrack.notes.length)

            for (let j = 0; j < srcTrack.notes.length; j++) {
                const srcNote = srcTrack.notes[j]
                const impNote = impTrack.notes[j]
                expect(impNote.bar).toBe(srcNote.bar)
                expect(impNote.barStep).toBe(srcNote.barStep)
                if (srcNote.velocity !== undefined) expect(impNote.velocity).toBe(srcNote.velocity)
                if (srcNote.pitch !== undefined) expect(impNote.pitch).toBe(srcNote.pitch)
                if (srcNote.arp !== undefined) expect(impNote.arp).toEqual(srcNote.arp)
                if (srcNote.retriggerNum !== undefined) expect(impNote.retriggerNum).toBe(srcNote.retriggerNum)
            }
        }
    })

    it('export includes metadata', () => {
        const pattern = mfCmd.addPattern('Test')
        const exported = PatternExporter.export(pattern)

        expect(exported.application).toBe('online-ordrumbox')
        expect(exported.url).toBe('https://www.ordrumbox.com')
        expect(exported.name).toBe('Test')
    })

    it('empty pattern round-trip', () => {
        const sourcePattern = {
            name: 'Empty',
            bpm: 120,
            nbBars: 4,
            tracks: []
        }

        const imported = mfCmd.importPatternFromJson(sourcePattern)
        const exported = PatternExporter.export(imported)
        const reimported = mfCmd.importPatternFromJson(exported)

        expect(reimported.name).toBe('Empty')
        expect(reimported.bpm).toBe(120)
        expect(reimported.nbBars).toBe(4)
        expect(reimported.tracks).toEqual([])
    })



    it('import with missing optional fields uses defaults', () => {
        const sourcePattern = {
            name: 'Minimal',
            bpm: 120,
            nbBars: 4,
            tracks: [{
                name: 'KICK',
                bars: 4,
                barQuantize: 4,
                notes: [
                    { bar: 0, barStep: 0 }
                ]
            }]
        }

        const imported = mfCmd.importPatternFromJson(sourcePattern)
        const note = imported.tracks[0].notes[0]

        expect(note.velocity).toBe(0.8)
        expect(note.pitch).toBe(0)
        expect(note.triggerFreq).toBe(1)
        expect(note.triggerPhase).toBe(0)
        expect(note.retriggerNum).toBe(1)
        expect(note.euclidianFill).toBe(0)
    })

    it('double export round-trip is stable', () => {
        const source = {
            name: 'Stable',
            bpm: 140,
            nbBars: 4,
            description: 'Double export',
            tracks: [{
                name: 'KICK',
                bars: 4,
                barQuantize: 4,
                notes: [
                    { bar: 0, barStep: 0, velocity: 0.85, pitch: 1 },
                    { bar: 2, barStep: 2, velocity: 0.75 }
                ]
            }]
        }
        const once = mfCmd.importPatternFromJson(source)
        const exportedOnce = PatternExporter.export(once)
        const twice = mfCmd.importPatternFromJson(exportedOnce)
        const exportedTwice = PatternExporter.export(twice)

        expect(exportedTwice.name).toBe(exportedOnce.name)
        expect(exportedTwice.bpm).toBe(exportedOnce.bpm)
        expect(exportedTwice.nbBars).toBe(exportedOnce.nbBars)
        expect(exportedTwice.description).toBe(exportedOnce.description)
        expect(exportedTwice.tracks).toEqual(exportedOnce.tracks)
    })

    it('track properties survive round-trip', () => {
        const source = {
            name: 'TrackProps',
            bpm: 120,
            nbBars: 4,
            tracks: [{
                name: 'TOM',
                bars: 4,
                barQuantize: 4,
                mute: true,
                solo: true,
                auto: true,
                useSoftSynth: true,
                velocity: 0.8,
                loopAtStep: 16,
                notes: [{ bar: 0, barStep: 0 }]
            }]
        }
        const imported = mfCmd.importPatternFromJson(source)
        const exported = PatternExporter.export(imported)
        const reimported = mfCmd.importPatternFromJson(exported)
        const track = reimported.tracks[0]

        expect(track.name).toBe('TOM')
        expect(track.mute).toBe(true)
        expect(track.solo).toBe(true)
        expect(track.auto).toBe(true)
        expect(track.useSoftSynth).toBe(true)
        expect(track.bars).toBe(4)
    })

    it('notes with arp and retrigger survive round-trip', () => {
        const source = {
            name: 'ArpTest',
            bpm: 120,
            nbBars: 4,
            tracks: [{
                name: 'SNARE',
                bars: 4,
                barQuantize: 4,
                notes: [
                    { bar: 1, barStep: 0, arp: [0, 4, 7], retriggerNum: 3, retriggerStep: 2, euclidianFill: 5 }
                ]
            }]
        }
        const imported = mfCmd.importPatternFromJson(source)
        const note = imported.tracks[0].notes[0]

        expect(note.arp).toEqual([0, 4, 7])
        expect(note.retriggerNum).toBe(3)
        expect(note.retriggerStep).toBe(2)
        expect(note.euclidianFill).toBe(5)
    })

    it('round-trip preserves application and url metadata', () => {
        const source = {
            name: 'MetaTest',
            bpm: 120,
            nbBars: 4,
            application: 'test-app',
            url: 'https://test.com',
            tracks: [{
                name: 'KICK',
                bars: 4,
                barQuantize: 4,
                notes: [{ bar: 0, barStep: 0 }]
            }]
        }
        const imported = mfCmd.importPatternFromJson(source)
        expect(imported.application).toBe('test-app')
        expect(imported.url).toBe('https://test.com')

        const exported = PatternExporter.export(imported)
        expect(exported.application).toBe('test-app')
        expect(exported.url).toBe('https://test.com')

        const reimported = mfCmd.importPatternFromJson(exported)
        expect(reimported.application).toBe('test-app')
        expect(reimported.url).toBe('https://test.com')
    })

    it('track with no notes round-trips', () => {
        const source = {
            name: 'NoNotes',
            bpm: 120,
            nbBars: 4,
            tracks: [{
                name: 'KICK',
                bars: 4,
                barQuantize: 4,
                notes: []
            }]
        }
        const imported = mfCmd.importPatternFromJson(source)
        const exported = PatternExporter.export(imported)
        const reimported = mfCmd.importPatternFromJson(exported)

        expect(reimported.tracks).toHaveLength(1)
        expect(reimported.tracks[0].notes).toEqual([])
    })

    it('pattern with all-default track strips to minimal export', () => {
        const pattern = mfCmd.addPattern('DefaultTrack')
        const track = mfCmd.addTrack(pattern, 'KICK')
        mfCmd.addNote(track, 0, 0, 0)

        const exported = PatternExporter.export(pattern)
        expect(exported.application).toBe('online-ordrumbox')
        expect(exported.url).toBe('https://www.ordrumbox.com')
        expect(exported.name).toBe('DefaultTrack')
        expect(exported.tracks).toHaveLength(1)
        expect(exported.tracks[0].name).toBe('KICK')

        const reimported = mfCmd.importPatternFromJson(exported)
        expect(reimported.name).toBe('DefaultTrack')
        expect(reimported.tracks).toHaveLength(1)
    })

    it('filter settings survive round-trip', () => {
        const source = {
            name: 'FilterTest',
            bpm: 120,
            nbBars: 4,
            tracks: [{
                name: 'KICK',
                bars: 4,
                barQuantize: 4,
                filterType: 'lowpass',
                filterFreq: 800,
                filterQ: 1.5,
                saturationType: 'hard',
                saturationAmount: 0.3,
                notes: [{ bar: 0, barStep: 0 }]
            }]
        }
        const imported = mfCmd.importPatternFromJson(source)
        const track = imported.tracks[0]

        expect(track.filterType).toBe('lowpass')
        expect(track.filterFreq).toBe(800)
        expect(track.filterQ).toBe(1.5)
        expect(track.saturationType).toBe('hard')
        expect(track.saturationAmount).toBe(0.3)
    })
})
