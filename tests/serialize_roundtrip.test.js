import { describe, it, expect, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import { PatternExporter } from '../src/patterns/exporter.js'
import { makeNote, makeTrack, makePattern, PARAM_SETS } from './helpers/make_pattern.js'

describe('Functional: Pattern serialization round-trip', () => {
    let cmd

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    it('full pattern round-trip preserves all properties', () => {
        const sourcePattern = makePattern({
            name: 'RoundTrip',
            bpm: 130,
            nbBeats: 8,
            tracks: [
                makeTrack(
                    'KICK',
                    [
                        makeNote(0, 0, { velocity: 0.9, pitch: 0, every: 1, pos: 0 }),
                        makeNote(2, 2, { velocity: 0.7, pitch: 2, every: 2, pos: 1 }),
                    ],
                    { nbBeats: 8, stepsPerBeat: 4, loopAtStep: 32, velocity: 0.9, pan: 0 },
                ),
                makeTrack('SNARE', [makeNote(1, 0, { velocity: 0.8, pitch: 0, arp: [0, 7], retriggerNum: 3 })], {
                    nbBeats: 8,
                    stepsPerBeat: 4,
                    loopAtStep: 32,
                }),
            ],
        })
        sourcePattern.description = 'Test pattern'
        sourcePattern.tags = ['techno', 'dark']

        const imported = cmd.importPatternFromJson(sourcePattern)
        const exported = PatternExporter.export(imported)
        const reimported = cmd.importPatternFromJson(exported)

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
        const pattern = cmd.addPattern('Test')
        const exported = PatternExporter.export(pattern)

        expect(exported.application).toBe('online-ordrumbox')
        expect(exported.url).toBe('https://www.ordrumbox.com')
        expect(exported.name).toBe('Test')
    })

    it('empty pattern round-trip', () => {
        const sourcePattern = makePattern({
            name: 'Empty',
            bpm: 120,
            nbBeats: 4,
            tracks: [],
        })

        const imported = cmd.importPatternFromJson(sourcePattern)
        const exported = PatternExporter.export(imported)
        const reimported = cmd.importPatternFromJson(exported)

        expect(reimported.name).toBe('Empty')
        expect(reimported.bpm).toBe(120)
        expect(reimported.nbBeats).toBe(4)
        expect(reimported.tracks).toEqual([])
    })

    it('import with missing optional fields uses defaults', () => {
        const sourcePattern = makePattern({
            name: 'Minimal',
            bpm: 120,
            nbBeats: 4,
            tracks: [makeTrack('KICK', [makeNote(0, 0)], { nbBeats: 4, stepsPerBeat: 4 })],
        })

        const imported = cmd.importPatternFromJson(sourcePattern)
        const note = imported.tracks[0].notes[0]

        expect(note.velocity).toBe(0.8)
        expect(note.pitch).toBe(0)
        expect(note.every).toBe(1)
        expect(note.pos).toBe(0)
        expect(note.retriggerNum).toBe(1)
        expect(note.euclidianFill).toBe(0)
    })

    it('double export round-trip is stable', () => {
        const source = makePattern({
            name: 'Stable',
            bpm: 140,
            nbBeats: 4,
            tracks: [
                makeTrack('KICK', [makeNote(0, 0, { velocity: 0.85, pitch: 1 }), makeNote(2, 2, { velocity: 0.75 })], {
                    nbBeats: 4,
                    stepsPerBeat: 4,
                }),
            ],
        })
        source.description = 'Double export'

        const once = cmd.importPatternFromJson(source)
        const exportedOnce = PatternExporter.export(once)
        const twice = cmd.importPatternFromJson(exportedOnce)
        const exportedTwice = PatternExporter.export(twice)

        expect(exportedTwice.name).toBe(exportedOnce.name)
        expect(exportedTwice.bpm).toBe(exportedOnce.bpm)
        expect(exportedTwice.nbBeats).toBe(exportedOnce.nbBeats)
        expect(exportedTwice.description).toBe(exportedOnce.description)
        expect(exportedTwice.tracks).toEqual(exportedOnce.tracks)
    })

    it('track properties survive round-trip', () => {
        const source = makePattern({
            name: 'TrackProps',
            bpm: 120,
            nbBeats: 4,
            tracks: [
                makeTrack('TOM', [makeNote(0, 0)], {
                    nbBeats: 4,
                    stepsPerBeat: 4,
                    mute: true,
                    solo: true,
                    auto: true,
                    useSoftSynth: true,
                    velocity: 0.8,
                    loopAtStep: 16,
                }),
            ],
        })
        const imported = cmd.importPatternFromJson(source)
        const exported = PatternExporter.export(imported)
        const reimported = cmd.importPatternFromJson(exported)
        const track = reimported.tracks[0]

        expect(track.name).toBe('TOM')
        expect(track.mute).toBe(true)
        expect(track.solo).toBe(true)
        expect(track.auto).toBe(true)
        expect(track.useSoftSynth).toBe(true)
        expect(track.nbBeats).toBe(4)
    })

    it('notes with arp and retrigger survive round-trip', () => {
        const source = makePattern({
            name: 'ArpTest',
            bpm: 120,
            nbBeats: 4,
            tracks: [
                makeTrack('SNARE', [makeNote(1, 0, { arp: [0, 4, 7], retriggerNum: 3, rate: 2, euclidianFill: 5 })], {
                    nbBeats: 4,
                    stepsPerBeat: 4,
                }),
            ],
        })
        const imported = cmd.importPatternFromJson(source)
        const exported = PatternExporter.export(imported)
        const reimported = cmd.importPatternFromJson(exported)
        const note = reimported.tracks[0].notes[0]

        expect(note.arp).toEqual([0, 4, 7])
        expect(note.retriggerNum).toBe(3)
        expect(note.rate).toBe(2)
        expect(note.euclidianFill).toBe(5)
    })

    it('round-trip preserves application and url metadata', () => {
        const source = makePattern({
            name: 'MetaTest',
            bpm: 120,
            nbBeats: 4,
            tracks: [makeTrack('KICK', [makeNote(0, 0)], { nbBeats: 4, stepsPerBeat: 4 })],
        })
        source.application = 'test-app'
        source.url = 'https://test.com'

        const imported = cmd.importPatternFromJson(source)
        expect(imported.application).toBe('test-app')
        expect(imported.url).toBe('https://test.com')

        const exported = PatternExporter.export(imported)
        expect(exported.application).toBe('test-app')
        expect(exported.url).toBe('https://test.com')

        const reimported = cmd.importPatternFromJson(exported)
        expect(reimported.application).toBe('test-app')
        expect(reimported.url).toBe('https://test.com')
    })

    it('track with no notes round-trips', () => {
        const source = makePattern({
            name: 'NoNotes',
            bpm: 120,
            nbBeats: 4,
            tracks: [makeTrack('KICK', [], { nbBeats: 4, stepsPerBeat: 4 })],
        })
        const imported = cmd.importPatternFromJson(source)
        const exported = PatternExporter.export(imported)
        const reimported = cmd.importPatternFromJson(exported)

        expect(reimported.tracks).toHaveLength(1)
        expect(reimported.tracks[0].notes).toEqual([])
    })

    it('pattern with all-default track strips to minimal export', () => {
        const pattern = cmd.addPattern('DefaultTrack')
        const track = cmd.addTrack(pattern, 'KICK')
        cmd.addNote(track, 0, 0, 0)

        const exported = PatternExporter.export(pattern)
        expect(exported.application).toBe('online-ordrumbox')
        expect(exported.url).toBe('https://www.ordrumbox.com')
        expect(exported.name).toBe('DefaultTrack')
        expect(exported.tracks).toHaveLength(1)
        expect(exported.tracks[0].name).toBe('KICK')

        const reimported = cmd.importPatternFromJson(exported)
        expect(reimported.name).toBe('DefaultTrack')
        expect(reimported.tracks).toHaveLength(1)
    })

    it('filter settings survive round-trip', () => {
        const source = makePattern({
            name: 'FilterTest',
            bpm: 120,
            nbBeats: 4,
            tracks: [
                makeTrack('KICK', [makeNote(0, 0)], {
                    nbBeats: 4,
                    stepsPerBeat: 4,
                    filterType: 'lowpass',
                    filterFreq: 800,
                    filterQ: 1.5,
                    saturationType: 'hard',
                    saturationAmount: 0.3,
                }),
            ],
        })
        const imported = cmd.importPatternFromJson(source)
        const exported = PatternExporter.export(imported)
        const reimported = cmd.importPatternFromJson(exported)
        const track = reimported.tracks[0]

        expect(track.filterType).toBe('lowpass')
        expect(track.filterFreq).toBe(800)
        expect(track.filterQ).toBe(1.5)
        expect(track.saturationType).toBe('hard')
        expect(track.saturationAmount).toBe(0.3)
    })

    // ── Parameterized: round-trip across different subdivisions ───────────────────

    describe.each(PARAM_SETS)('Round-trip — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, nbBeats) => {
        it('preserves all properties through export → reimport', () => {
            const source = makePattern({
                name: 'ParamRoundTrip',
                bpm,
                nbBeats,
                tracks: [
                    makeTrack(
                        'KICK',
                        [
                            makeNote(0, 0, { velocity: 0.9, pitch: 1 }),
                            makeNote(Math.min(2, nbBeats - 1), 0, { velocity: 0.7 }),
                        ],
                        { stepsPerBeat, nbBeats },
                    ),
                ],
            })
            const imported = cmd.importPatternFromJson(source)
            const exported = PatternExporter.export(imported)
            const reimported = cmd.importPatternFromJson(exported)

            expect(reimported.name).toBe(source.name)
            expect(reimported.bpm).toBe(source.bpm)
            expect(reimported.nbBeats).toBe(source.nbBeats)
            expect(reimported.tracks.length).toBe(1)
            expect(reimported.tracks[0].notes.length).toBe(2)
        })

        it('double export is stable', () => {
            const source = makePattern({
                name: 'ParamStable',
                bpm,
                nbBeats,
                tracks: [makeTrack('KICK', [makeNote(0, 0, { velocity: 0.8, pitch: 3 })], { stepsPerBeat, nbBeats })],
            })
            const once = cmd.importPatternFromJson(source)
            const exportedOnce = PatternExporter.export(once)
            const twice = cmd.importPatternFromJson(exportedOnce)
            const exportedTwice = PatternExporter.export(twice)

            expect(exportedTwice.tracks).toEqual(exportedOnce.tracks)
        })
    })
})
