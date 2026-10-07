// tests/pattern_auto_gen.test.js
//
// The orchestration formerly copy-pasted between ViewSwitch (toolbar) and
// PatternSettingsPanel: the toggle shell, the drum flow and the melodic
// track-creation flow all live in logic/services/pattern_auto_gen.js now.

/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeAppStateMock } from './helpers/app_state_mock.js'

vi.mock('../src/state/event_bus.js', () => ({
    playbackEvents: {
        emit: vi.fn(),
        batch: vi.fn((fn) => fn()),
    },
}))

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        cmd: {
            beginGenerationUndo: vi.fn(),
            commitGenerationUndo: vi.fn(),
            cancelGenerationUndo: vi.fn(),
            addTrack: vi.fn(),
        },
        flatNotes: { applyFlatNotes: vi.fn() },
    },
}))

vi.mock('../src/state/app_state.js', () => ({
    appState: makeAppStateMock({ patterns: [{ tracks: [] }] }),
}))

vi.mock('../src/core/drum_taxonomy.js', () => ({
    DRUM_TYPES: new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC']),
    detectTrackType: vi.fn((name) => {
        const n = (name ?? '').toUpperCase()
        if (n.includes('KICK') || n.includes('BD')) return 'KICK'
        if (n.includes('SNARE') || n.includes('SD')) return 'SNARE'
        if (n.includes('OHH') || n.includes('HAT') || n.includes('CHH')) return 'HAT'
        if (n.includes('CLAP') || n.includes('CLP') || n.includes('CP')) return 'CLAP'
        if (n.includes('BASS')) return 'BASS'
        if (n.includes('PIANO')) return 'PIANO'
        if (n.includes('COWBELL') || n.includes('COW')) return 'COWBELL'
        if (n.includes('ORGAN')) return 'ORGAN'
        if (n.includes('SYNTH')) return 'BASS'
        return 'PERC'
    }),
}))

vi.mock('../src/core/tracks.js', () => ({
    filterEmptyMelodicTracks: vi.fn((tracks) => tracks),
}))

vi.mock('../src/state/service_loader.js', () => ({
    getAutoGeneratorService: vi.fn(),
}))

vi.mock('../src/core/notify.js', () => ({
    showToast: vi.fn(),
}))

import patternAutoGen from '../src/logic/services/pattern_auto_gen.js'
import { playbackEvents } from '../src/state/event_bus.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { appState } from '../src/state/app_state.js'
import { getAutoGeneratorService } from '../src/state/service_loader.js'
import { DRUM_TYPES } from '../src/core/drum_taxonomy.js'
import { showToast } from '../src/core/notify.js'
import { EVENTS } from '../src/core/events.js'

function setPattern(tracks) {
    appState.patterns = [{ tracks }]
    appState.selectedPatternIdx = 0
    return appState.selectedPattern
}

describe('PatternAutoGen', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        serviceRegistry.cmd.beginGenerationUndo.mockReturnValue(true)
    })

    describe('toggleAutoGeneration() — the toggle shell', () => {
        it('toggle-off: clears auto and _toolbarAuto on the matching types only', async () => {
            const track1 = { name: 'KICK', auto: true, _toolbarAuto: true }
            const track2 = { name: 'SNARE', auto: true, _toolbarAuto: true }
            const track3 = { name: 'BASS', auto: true, _toolbarAuto: true }
            setPattern([track1, track2, track3])

            await patternAutoGen.toggleAutoGeneration(DRUM_TYPES, vi.fn())

            expect(track1.auto).toBe(false)
            expect(track1._toolbarAuto).toBe(false)
            expect(track2.auto).toBe(false)
            expect(track2._toolbarAuto).toBe(false)
            expect(track3.auto).toBe(true)
            expect(track3._toolbarAuto).toBe(true)
            expect(playbackEvents.batch).toHaveBeenCalled()
        })

        it('toggle-off: turns a track generated from the settings panel off too (auto without _toolbarAuto)', async () => {
            const panelTrack = { name: 'BASS', auto: true }
            setPattern([panelTrack])

            await patternAutoGen.toggleAutoGeneration('BASS', vi.fn())

            expect(panelTrack.auto).toBe(false)
        })

        it('toggle-off: handles empty tracks array', async () => {
            setPattern([])
            const generate = vi.fn()

            await patternAutoGen.toggleAutoGeneration(DRUM_TYPES, generate)

            expect(generate).toHaveBeenCalled()
        })

        it('toggle-on: loads the generator service and calls generate with (pattern, autoGen)', async () => {
            setPattern([])
            const generate = vi.fn()
            const mockAutoGen = { structureGen: {} }
            getAutoGeneratorService.mockResolvedValue(mockAutoGen)

            await patternAutoGen.toggleAutoGeneration(DRUM_TYPES, generate)

            expect(getAutoGeneratorService).toHaveBeenCalled()
            expect(generate).toHaveBeenCalledWith(appState.patterns[0], mockAutoGen)
        })

        it('toggle-on: converts a string type to a Set', async () => {
            setPattern([])
            const generate = vi.fn()
            getAutoGeneratorService.mockResolvedValue({})

            await patternAutoGen.toggleAutoGeneration('BASS', generate)

            expect(generate).toHaveBeenCalledWith(appState.patterns[0], {})
        })

        it('toggle-on: converts an array type to a Set', async () => {
            setPattern([])
            const generate = vi.fn()
            getAutoGeneratorService.mockResolvedValue({})

            await patternAutoGen.toggleAutoGeneration(['BASS', 'PIANO'], generate)

            expect(generate).toHaveBeenCalledWith(appState.patterns[0], {})
        })

        it('returns early when pattern is undefined', async () => {
            appState.patterns = []
            appState.selectedPatternIdx = 5
            const generate = vi.fn()

            await patternAutoGen.toggleAutoGeneration(DRUM_TYPES, generate)

            expect(generate).not.toHaveBeenCalled()
        })

        it('toggle-off: only toggles matching type tracks when mixed types exist', async () => {
            const drumTrack = { name: 'HAT', auto: true, _toolbarAuto: true }
            const bassTrack = { name: 'BASS1', auto: true, _toolbarAuto: true }
            setPattern([drumTrack, bassTrack])

            await patternAutoGen.toggleAutoGeneration(DRUM_TYPES, vi.fn())

            expect(drumTrack.auto).toBe(false)
            expect(drumTrack._toolbarAuto).toBe(false)
            expect(bassTrack.auto).toBe(true)
            expect(bassTrack._toolbarAuto).toBe(true)
        })

        it('cancels the undo transaction and toasts when generation throws', async () => {
            setPattern([])
            getAutoGeneratorService.mockResolvedValue({
                generatePattern: vi.fn(() => {
                    throw new Error('boom')
                }),
            })

            await patternAutoGen.toggleAutoGeneration(DRUM_TYPES, async (pattern, autoGen) => {
                if (!serviceRegistry.cmd.beginGenerationUndo(pattern)) return
                await autoGen.generatePattern()
                serviceRegistry.cmd.commitGenerationUndo()
            })

            expect(serviceRegistry.cmd.cancelGenerationUndo).toHaveBeenCalled()
            expect(serviceRegistry.cmd.commitGenerationUndo).not.toHaveBeenCalled()
            expect(showToast).toHaveBeenCalledWith('Auto-generation failed: boom', 'error')
        })

        it('always publishes NOTE_CHANGE + PATTERN_CHANGE as one batch', async () => {
            setPattern([])
            getAutoGeneratorService.mockResolvedValue({})
            const generate = vi.fn()

            await patternAutoGen.toggleAutoGeneration(DRUM_TYPES, generate)

            expect(playbackEvents.batch).toHaveBeenCalledTimes(1)
            expect(playbackEvents.emit).toHaveBeenCalledWith(EVENTS.NOTE_CHANGE)
            expect(playbackEvents.emit).toHaveBeenCalledWith(EVENTS.PATTERN_CHANGE)
        })
    })

    describe('toggleDrums()', () => {
        it('generates the percussion family inside an undo transaction', async () => {
            const kick = { name: 'KICK', auto: false }
            const bass = { name: 'BASS', auto: false }
            const pattern = setPattern([kick, bass])
            const generatePattern = vi.fn()
            getAutoGeneratorService.mockResolvedValue({ generatePattern })

            await patternAutoGen.toggleDrums()

            expect(serviceRegistry.cmd.beginGenerationUndo).toHaveBeenCalledWith(pattern)
            expect(generatePattern).toHaveBeenCalled()
            expect(kick.auto).toBe(true)
            expect(kick._toolbarAuto).toBe(true)
            expect(bass.auto).toBe(false)
            expect(serviceRegistry.cmd.commitGenerationUndo).toHaveBeenCalled()
        })

        it('turns the percussion family off without regenerating', async () => {
            const kick = { name: 'KICK', auto: true, _toolbarAuto: true }
            setPattern([kick])
            const generatePattern = vi.fn()
            getAutoGeneratorService.mockResolvedValue({ generatePattern })

            await patternAutoGen.toggleDrums()

            expect(kick.auto).toBe(false)
            expect(kick._toolbarAuto).toBe(false)
            expect(generatePattern).not.toHaveBeenCalled()
            expect(serviceRegistry.cmd.beginGenerationUndo).not.toHaveBeenCalled()
        })
    })

    describe('toggleMelodic()', () => {
        function mockStructureGen(structure = { BASS: 'walking' }) {
            return {
                structureGen: {
                    getRandomGenre: vi.fn(() => 'rock'),
                    getElement: vi.fn(() => ({ name: 'verse', loopInElement: 0 })),
                    resolveHarmony: vi.fn(() => 'E-minor'),
                    generateStructure: vi.fn(() => structure),
                },
                generateTrack: vi.fn(),
            }
        }

        it('creates the BASS track from the genre structure with the BASS1 preset', async () => {
            const pattern = setPattern([])
            const autoGen = mockStructureGen()
            getAutoGeneratorService.mockResolvedValue(autoGen)
            const added = { name: 'BASS' }
            serviceRegistry.cmd.addTrack.mockReturnValue(added)

            await patternAutoGen.toggleMelodic('BASS')

            expect(serviceRegistry.cmd.beginGenerationUndo).toHaveBeenCalledWith(pattern)
            expect(pattern._autoGenGenre).toBe('rock')
            expect(serviceRegistry.cmd.addTrack).toHaveBeenCalledWith(pattern, 'BASS')
            expect(added.useSoftSynth).toBe(true)
            expect(added.useAutoAssignSound).toBe(false)
            expect(added.synthSoundKey).toBe('BASS1')
            expect(added.velocity).toBe(0.8)
            expect(autoGen.generateTrack).toHaveBeenCalledWith(added, 'walking', 1, pattern, 'E-minor')
            expect(serviceRegistry.flatNotes.applyFlatNotes).toHaveBeenCalledWith(pattern)
            expect(added.auto).toBe(true)
            expect(added._toolbarAuto).toBe(true)
            expect(serviceRegistry.cmd.commitGenerationUndo).toHaveBeenCalled()
        })

        it('uses the chordStab fallback and the PIANO preset when the structure has no PIANO entry', async () => {
            const pattern = setPattern([])
            const autoGen = mockStructureGen({})
            getAutoGeneratorService.mockResolvedValue(autoGen)
            const added = { name: 'PIANO' }
            serviceRegistry.cmd.addTrack.mockReturnValue(added)

            await patternAutoGen.toggleMelodic('PIANO')

            expect(added.synthSoundKey).toBe('PIANO')
            expect(autoGen.generateTrack).toHaveBeenCalledWith(added, 'chordStab', 1, pattern, 'E-minor')
            expect(serviceRegistry.cmd.commitGenerationUndo).toHaveBeenCalled()
        })

        it('reuses an existing track instead of creating a second one', async () => {
            const existing = { name: 'BASS', auto: false }
            setPattern([existing])
            const autoGen = mockStructureGen()
            getAutoGeneratorService.mockResolvedValue(autoGen)

            await patternAutoGen.toggleMelodic('BASS')

            expect(serviceRegistry.cmd.addTrack).not.toHaveBeenCalled()
            expect(autoGen.generateTrack).not.toHaveBeenCalled()
            expect(existing.auto).toBe(true)
            expect(existing._toolbarAuto).toBe(true)
            expect(serviceRegistry.cmd.commitGenerationUndo).toHaveBeenCalled()
        })

        it('rejects an unknown track type loudly', async () => {
            await expect(patternAutoGen.toggleMelodic('SYNTH')).rejects.toThrow('No auto-generation preset')
        })
    })
})
