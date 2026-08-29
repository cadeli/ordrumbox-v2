/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'

const { mocks } = vi.hoisted(() => ({
    mocks: {
        setBpm: vi.fn(),
        loadMissingSamplesFromDrumkits: vi.fn().mockResolvedValue(undefined),
        autoAssignSounds: vi.fn(),
        computeFlatNotesFromPattern: vi.fn(),
        invalidateCache: vi.fn(),
    },
}))

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        seq: { setBpm: mocks.setBpm },
        patterns: { computeFlatNotesFromPattern: mocks.computeFlatNotesFromPattern },
        audioEngine: { invalidateCache: mocks.invalidateCache },
        resourcesLoader: { loadMissingSamplesFromDrumkits: mocks.loadMissingSamplesFromDrumkits },
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

import Commander from '../src/logic/commands/cmd.js'

describe('cmd_selection', () => {
    let cmd

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        Object.values(mocks).forEach(m => m.mockClear())

        serviceRegistry.seq = { setBpm: mocks.setBpm }
        serviceRegistry.patterns = { computeFlatNotesFromPattern: mocks.computeFlatNotesFromPattern }
        serviceRegistry.audioEngine = { invalidateCache: mocks.invalidateCache }
        serviceRegistry.resourcesLoader = { loadMissingSamplesFromDrumkits: mocks.loadMissingSamplesFromDrumkits }

        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    describe('setSelectedPatternNum', () => {
        it('sets appState.selectedPatternNum', async () => {
            appState.patterns = [{ name: 'A', bpm: 120 }, { name: 'B', bpm: 140 }]
            await cmd.setSelectedPatternNum(1)
            expect(appState.selectedPatternNum).toBe(1)
        })

        it('calls seq.setBpm with pattern bpm', async () => {
            appState.patterns = [{ name: 'A', bpm: 130 }]
            await cmd.setSelectedPatternNum(0)
            expect(mocks.setBpm).toHaveBeenCalledWith(130)
        })

        it('auto-assigns sounds when sounds are loaded', async () => {
            appState.patterns = [{ name: 'A', bpm: 120 }]
            soundRegistry.sounds = { KICK: {} }
            await cmd.setSelectedPatternNum(0)
            expect(mocks.autoAssignSounds).toHaveBeenCalled()
        })

        it('skips auto-assign when no sounds loaded', async () => {
            appState.patterns = [{ name: 'A', bpm: 120 }]
            await cmd.setSelectedPatternNum(0)
            expect(mocks.autoAssignSounds).not.toHaveBeenCalled()
        })

        it('computes flat notes after selection', async () => {
            appState.patterns = [{ name: 'A', bpm: 120 }]
            await cmd.setSelectedPatternNum(0)
            expect(mocks.computeFlatNotesFromPattern).toHaveBeenCalled()
        })

        it('emits selectedPatternChange', async () => {
            appState.patterns = [{ name: 'A', bpm: 120 }]
            const spy = vi.fn()
            playbackEvents.on('selectedPatternChange', spy)
            await cmd.setSelectedPatternNum(0)
            expect(spy).toHaveBeenCalled()
        })

        it('does nothing when patterns is empty', async () => {
            appState.patterns = []
            await cmd.setSelectedPatternNum(0)
            expect(mocks.setBpm).not.toHaveBeenCalled()
        })
    })

    describe('setSelectedDrumkitNum', () => {
        it('sets appState.selectedDrumkitNum', async () => {
            soundRegistry.drumkitList = [{ name: 'kit1' }, { name: 'kit2' }]
            await cmd.setSelectedDrumkitNum(1)
            expect(appState.selectedDrumkitNum).toBe(1)
        })

        it('loads missing samples for the drumkit', async () => {
            soundRegistry.drumkitList = [{ name: 'kit1' }]
            await cmd.setSelectedDrumkitNum(0)
            expect(mocks.loadMissingSamplesFromDrumkits).toHaveBeenCalledWith([soundRegistry.drumkitList[0]])
        })

        it('emits drumkitChange', async () => {
            soundRegistry.drumkitList = [{ name: 'kit1' }]
            const spy = vi.fn()
            playbackEvents.on('drumkitChange', spy)
            await cmd.setSelectedDrumkitNum(0)
            expect(spy).toHaveBeenCalled()
        })
    })
})
