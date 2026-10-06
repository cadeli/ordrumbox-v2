/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/event_bus.js'

const { mocks } = vi.hoisted(() => ({
    mocks: {
        setBpm: vi.fn(),
        loadMissingSamplesFromDrumkits: vi.fn().mockResolvedValue(undefined),
        loadSamplesForPatterns: vi.fn().mockResolvedValue([]),
        autoAssignSounds: vi.fn(),
        applyFlatNotes: vi.fn(),
        invalidateCache: vi.fn(),
    },
}))

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        seq: { setBpm: mocks.setBpm },
        patterns: { applyFlatNotes: mocks.applyFlatNotes },
        audioEngine: { invalidateCache: mocks.invalidateCache },
        resourcesLoader: {
            loadMissingSamplesFromDrumkits: mocks.loadMissingSamplesFromDrumkits,
            loadSamplesForPatterns: mocks.loadSamplesForPatterns,
        },
    },
}))

vi.mock('../src/state/service_loader.js', () => ({
    getAutoAssignService: vi.fn().mockResolvedValue({
        autoAssignSounds: mocks.autoAssignSounds,
    }),
}))

vi.mock('../src/core/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import Commander from '../src/logic/commands/commander.js'
import { EVENTS } from '../src/core/events.js'

describe('commands/selection_commands', () => {
    let cmd

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        Object.values(mocks).forEach((m) => m.mockClear())

        serviceRegistry.seq = { setBpm: mocks.setBpm }
        serviceRegistry.flatNotes = { applyFlatNotes: mocks.applyFlatNotes }
        serviceRegistry.audioEngine = { invalidateCache: mocks.invalidateCache }
        serviceRegistry.resourcesLoader = {
            loadMissingSamplesFromDrumkits: mocks.loadMissingSamplesFromDrumkits,
            loadSamplesForPatterns: mocks.loadSamplesForPatterns,
        }

        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    describe('setSelectedPatternIdx', () => {
        it('sets appState.selectedPatternIdx', async () => {
            appState.patterns = [
                { name: 'A', bpm: 120 },
                { name: 'B', bpm: 140 },
            ]
            await cmd.setSelectedPatternIdx(1)
            expect(appState.selectedPatternIdx).toBe(1)
        })

        it('calls seq.setBpm with pattern bpm', async () => {
            appState.patterns = [{ name: 'A', bpm: 130 }]
            await cmd.setSelectedPatternIdx(0)
            expect(mocks.setBpm).toHaveBeenCalledWith(130)
        })

        it('auto-assigns sounds when sounds are loaded', async () => {
            appState.patterns = [{ name: 'A', bpm: 120 }]
            soundRegistry.sounds = { KICK: {} }
            await cmd.setSelectedPatternIdx(0)
            expect(mocks.autoAssignSounds).toHaveBeenCalled()
        })

        it('skips auto-assign when no sounds loaded', async () => {
            appState.patterns = [{ name: 'A', bpm: 120 }]
            await cmd.setSelectedPatternIdx(0)
            expect(mocks.autoAssignSounds).not.toHaveBeenCalled()
        })

        it('computes flat notes after selection', async () => {
            appState.patterns = [{ name: 'A', bpm: 120 }]
            await cmd.setSelectedPatternIdx(0)
            expect(mocks.applyFlatNotes).toHaveBeenCalled()
        })

        it('loads the samples referenced by the selected pattern', async () => {
            const pattern = { name: 'A', bpm: 120, tracks: [{ sampleId: 'real/bass-c2.wav' }] }
            appState.patterns = [pattern]
            await cmd.setSelectedPatternIdx(0)
            expect(mocks.loadSamplesForPatterns).toHaveBeenCalledWith([pattern])
        })

        it('emits selectedPatternChange', async () => {
            appState.patterns = [{ name: 'A', bpm: 120 }]
            const spy = vi.fn()
            playbackEvents.on(EVENTS.SELECTED_PATTERN_CHANGE, spy)
            await cmd.setSelectedPatternIdx(0)
            expect(spy).toHaveBeenCalled()
        })

        it('does nothing when patterns is empty', async () => {
            appState.patterns = []
            await cmd.setSelectedPatternIdx(0)
            expect(mocks.setBpm).not.toHaveBeenCalled()
        })
    })

    describe('setSelectedDrumkitIdx', () => {
        it('sets appState.selectedDrumkitIdx', async () => {
            soundRegistry.drumkitList = [{ name: 'kit1' }, { name: 'kit2' }]
            await cmd.setSelectedDrumkitIdx(1)
            expect(appState.selectedDrumkitIdx).toBe(1)
        })

        it('loads missing samples for the drumkit', async () => {
            soundRegistry.drumkitList = [{ name: 'kit1' }]
            await cmd.setSelectedDrumkitIdx(0)
            expect(mocks.loadMissingSamplesFromDrumkits).toHaveBeenCalledWith([soundRegistry.drumkitList[0]])
        })

        it('emits drumkitChange', async () => {
            soundRegistry.drumkitList = [{ name: 'kit1' }]
            const spy = vi.fn()
            playbackEvents.on(EVENTS.DRUMKIT_CHANGE, spy)
            await cmd.setSelectedDrumkitIdx(0)
            expect(spy).toHaveBeenCalled()
        })
    })
})
