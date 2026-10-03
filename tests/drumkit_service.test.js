import { describe, it, expect, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import drumkitService from '../src/logic/services/drumkit_service.js'

describe('drumkit service — sound lookups', () => {
    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        soundRegistry.drumkitList = [{ name: 'real' }, { name: '808' }]
        appState.selectedDrumkitIdx = 0
        soundRegistry.sounds = {
            'real/kick.wav': { kit_name: 'real', buffer: null },
            '808/kick.wav': { kit_name: '808', buffer: null },
        }
    })

    // getCurrentKitSounds() returned every kit's sounds, so the drumkit manager
    // listed foreign samples under the current kit and pre-selected one of them.
    it('current kit sounds exclude the other kits', () => {
        expect(drumkitService.getCurrentKitSounds().map((s) => s.url)).toEqual(['real/kick.wav'])
    })

    it('getAllSounds spans every kit', () => {
        expect(drumkitService.getAllSounds().map((s) => s.url)).toEqual(['real/kick.wav', '808/kick.wav'])
    })

    it('follows the selected kit', () => {
        appState.selectedDrumkitIdx = 1
        expect(drumkitService.getCurrentKitSounds().map((s) => s.url)).toEqual(['808/kick.wav'])
    })
})
