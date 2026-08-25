/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import DrumkitManager from '../src/ui/drumkit_manager.js'
import drumkitService from '../src/logic/services/drumkit_service.js'
import AutoAssign from '../src/logic/services/auto_assign.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'

const SOUND_ID = 'custom/one-shot.wav'

function setupRegistry() {
    appState.reset()
    soundRegistry.reset()
    appState.selectedDrumkitNum = 0
    soundRegistry.sounds = {
        [SOUND_ID]: {
            url: SOUND_ID,
            display_name: 'one-shot.wav',
            kit_name: 'custom',
            key: 'CLAP',
        },
    }
    soundRegistry.drumkits = {
        custom: { instruments: [{ url: SOUND_ID, key: 'CLAP' }] },
    }
    soundRegistry.drumkitList = [
        { name: 'custom', instruments: [{ url: SOUND_ID, key: 'CLAP' }] },
    ]
}

describe('DrumkitManager instrument mapping', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        setupRegistry()
    })

    it('persists the selected instrument for a subsequent auto-assign', () => {
        const manager = new DrumkitManager()
        manager.init()
        manager._selectSound(SOUND_ID)

        const instrumentSelect = manager.container.querySelector('#dm-inst-select')
        expect(instrumentSelect.value).toBe('CLAP')

        instrumentSelect.value = 'KICK'
        instrumentSelect.dispatchEvent(new Event('change'))

        expect(soundRegistry.sounds[SOUND_ID].key).toBe('KICK')
        expect(soundRegistry.drumkits.custom.instruments[0].key).toBe('KICK')
        expect(soundRegistry.drumkitList[0].instruments[0].key).toBe('KICK')

        const track = { name: 'KICK', soundId: null, useAutoAssignSound: true, useSoftSynth: false }
        const autoAssign = new AutoAssign({ appState, soundRegistry })
        autoAssign.autoAssignSounds({ name: 'test', tracks: [track] })

        expect(track.soundId).toBe(SOUND_ID)
    })

    it('persists per-sample gain, tune, and decay settings', () => {
        const manager = new DrumkitManager()
        manager.init()
        manager._selectSound(SOUND_ID)

        const updateControl = (id, value) => {
            const control = manager.container.querySelector(id)
            control.value = value
            control.dispatchEvent(new Event('input'))
            control.dispatchEvent(new Event('change'))
        }

        updateControl('#dm-gain', '-3.5')
        updateControl('#dm-tune', '2')
        updateControl('#dm-decay', '750')

        expect(soundRegistry.sounds[SOUND_ID]).toMatchObject({
            gainDb: -3.5,
            tune: 2,
            decay: 750,
        })
    })

    it('exports and restores a drumkit mapping with sample settings', async () => {
        soundRegistry.sounds[SOUND_ID].gainDb = -3.5
        soundRegistry.sounds[SOUND_ID].tune = 2
        soundRegistry.sounds[SOUND_ID].decay = 750
        const manager = new DrumkitManager()
        manager.init()

        const exported = drumkitService.exportCurrentKit()
        expect(exported).toMatchObject({
            version: 1,
            name: 'custom',
            instruments: [{ url: SOUND_ID, key: 'CLAP', gainDb: -3.5, tune: 2, decay: 750 }],
        })

        soundRegistry.sounds[SOUND_ID].key = 'KICK'
        soundRegistry.sounds[SOUND_ID].gainDb = 0
        soundRegistry.sounds[SOUND_ID].tune = 0
        soundRegistry.sounds[SOUND_ID].decay = null
        await drumkitService.restoreDrumkit(exported)

        expect(appState.selectedDrumkit).toBe('custom')
        expect(soundRegistry.sounds[SOUND_ID]).toMatchObject({
            key: 'CLAP',
            gainDb: -3.5,
            tune: 2,
            decay: 750,
        })
    })
})
