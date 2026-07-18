import { describe, it, expect, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import { PatternExporter } from '../src/patterns/exporter.js'

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
            nbBeats: 8,
            description: 'Test pattern',
            tags: ['techno', 'dark'],
            tracks: [
                {
                    name: 'KICK',
                    nbBeats: 8,
                    stepsPerBeat: 4,
                    loopAtStep: 32,
                    velocity: 0.9,
                    pan: 0,
                    notes: [
                        { beat: 0, beatStep: 0, velocity: 0.9, pitch: 0, every: 1, pos: 0 },
                        { beat: 2, beatStep: 2, velocity: 0.7, pitch: 2, every: 2, pos: 1 }
                    ]
                },
                {
                    name: 'SNARE',
                    nbBeats: 8,
                    stepsPerBeat: 4,
                    loopAtStep: 32,
                    notes: [
                        { beat: 1, beatStep: 0, velocity: 0.8, pitch: 0, arp: [0, 7], retriggerNum: 3 }
                    ]
                }
            ]
        }

        const imported = mfCmd.importPatternFromJson(sourcePattern)
        const exported = PatternExporter.export(imported)
        const reimported = mfCmd.importPatternFromJson(exported)

        expect(reimported.name).toBe(sourcePattern.name)
        expect(reimported.bpm).toBe(sourcePattern.bpm)
        expect(reimported.nbBeats).toBe(sourcePattern.nbBeats)
        expect(reimported.description).toBe(sourcePattern.description)
        expect(reimported.tags).toEqual(expect.objectContaining({ 0: 'techno', 1: 'dark' }))
        expect(reimported.tracks.length).toBe(sourcePattern.tracks.length)

        for (let i = 0; i < sourcePattern.tracks.length; i++) {
            const srcTrack = sourcePattern.tracks[i]
            const impTrack = reimported.tracks[i]
            expect(impTrack.name).toBe(srcTrack.name)
            expect(impTrack.nbBeats).toBe(srcTrack.nbBeats)
            expect(impTrack.stepsPerBeat).toBe(srcTrack.stepsPerBeat)
            expect(impTrack.notes.length).toBe(srcTrack.notes.length)

            for (let j = 0; j < srcTrack.notes.length; j++) {
                const srcNote = srcTrack.notes[j]
                const impNote = impTrack.notes[j]
                expect(impNote.beat).toBe(srcNote.beat)
                expect(impNote.beatStep).toBe(srcNote.beatStep)
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
            nbBeats: 4,
            tracks: []
        }

        const imported = mfCmd.importPatternFromJson(sourcePattern)
        const exported = PatternExporter.export(imported)
        const reimported = mfCmd.importPatternFromJson(exported)

        expect(reimported.name).toBe('Empty')
        expect(reimported.bpm).toBe(120)
        expect(reimported.nbBeats).toBe(4)
        expect(reimported.tracks).toEqual([])
    })



    it('import with missing optional fields uses defaults', () => {
        const sourcePattern = {
            name: 'Minimal',
            bpm: 120,
            nbBeats: 4,
            tracks: [{
                name: 'KICK',
                nbBeats: 4,
                stepsPerBeat: 4,
                notes: [
                    { beat: 0, beatStep: 0 }
                ]
            }]
        }

        const imported = mfCmd.importPatternFromJson(sourcePattern)
        const note = imported.tracks[0].notes[0]

        expect(note.velocity).toBe(0.8)
        expect(note.pitch).toBe(0)
        expect(note.every).toBe(1)
        expect(note.pos).toBe(0)
        expect(note.retriggerNum).toBe(1)
        expect(note.euclidianFill).toBe(0)
    })

    it('double export round-trip is stable', () => {
        const source = {
            name: 'Stable',
            bpm: 140,
            nbBeats: 4,
            description: 'Double export',
            tracks: [{
                name: 'KICK',
                nbBeats: 4,
                stepsPerBeat: 4,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.85, pitch: 1 },
                    { beat: 2, beatStep: 2, velocity: 0.75 }
                ]
            }]
        }
        const once = mfCmd.importPatternFromJson(source)
        const exportedOnce = PatternExporter.export(once)
        const twice = mfCmd.importPatternFromJson(exportedOnce)
        const exportedTwice = PatternExporter.export(twice)

        expect(exportedTwice.name).toBe(exportedOnce.name)
        expect(exportedTwice.bpm).toBe(exportedOnce.bpm)
        expect(exportedTwice.nbBeats).toBe(exportedOnce.nbBeats)
        expect(exportedTwice.description).toBe(exportedOnce.description)
        expect(exportedTwice.tracks).toEqual(exportedOnce.tracks)
    })

    it('track properties survive round-trip', () => {
        const source = {
            name: 'TrackProps',
            bpm: 120,
            nbBeats: 4,
            tracks: [{
                name: 'TOM',
                nbBeats: 4,
                stepsPerBeat: 4,
                mute: true,
                solo: true,
                auto: true,
                useSoftSynth: true,
                velocity: 0.8,
                loopAtStep: 16,
                notes: [{ beat: 0, beatStep: 0 }]
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
        expect(track.nbBeats).toBe(4)
    })

    it('notes with arp and retrigger survive round-trip', () => {
        const source = {
            name: 'ArpTest',
            bpm: 120,
            nbBeats: 4,
            tracks: [{
                name: 'SNARE',
                nbBeats: 4,
                stepsPerBeat: 4,
                notes: [
                    { beat: 1, beatStep: 0, arp: [0, 4, 7], retriggerNum: 3, rate: 2, euclidianFill: 5 }
                ]
            }]
        }
        const imported = mfCmd.importPatternFromJson(source)
        const note = imported.tracks[0].notes[0]

        expect(note.arp).toEqual([0, 4, 7])
        expect(note.retriggerNum).toBe(3)
        expect(note.rate).toBe(2)
        expect(note.euclidianFill).toBe(5)
    })

    it('round-trip preserves application and url metadata', () => {
        const source = {
            name: 'MetaTest',
            bpm: 120,
            nbBeats: 4,
            application: 'test-app',
            url: 'https://test.com',
            tracks: [{
                name: 'KICK',
                nbBeats: 4,
                stepsPerBeat: 4,
                notes: [{ beat: 0, beatStep: 0 }]
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
            nbBeats: 4,
            tracks: [{
                name: 'KICK',
                nbBeats: 4,
                stepsPerBeat: 4,
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
            nbBeats: 4,
            tracks: [{
                name: 'KICK',
                nbBeats: 4,
                stepsPerBeat: 4,
                filterType: 'lowpass',
                filterFreq: 800,
                filterQ: 1.5,
                saturationType: 'hard',
                saturationAmount: 0.3,
                notes: [{ beat: 0, beatStep: 0 }]
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
