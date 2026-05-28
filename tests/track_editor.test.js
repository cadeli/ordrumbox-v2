/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrackEditor from '../src/ui/track_editor.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

describe('TrackEditor sound panel', () => {
    beforeEach(() => {
        appState.reset()
        serviceRegistry.reset()
        soundRegistry.reset()
        document.body.innerHTML = ''
        soundRegistry.drumkitList = [
            { name: '8bits', instruments: [{ key: 'KICK', url: '8bits/kick.wav', display_name: 'Kick 8' }] },
            { name: 'real', instruments: [{ key: 'KICK', url: 'real/kick.wav', display_name: 'Kick Real' }] },
            { name: 'vintage', instruments: [{ key: 'KICK', url: 'vintage/kick.wav', display_name: 'Kick Vintage' }] }
        ]
        soundRegistry.sounds = {
            'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: {} }
        }
        appState.selectedDrumkitNum = 1
    })

    it('prefers the sample from the selected drumkit when an instrument is chosen', () => {
        const editor = new TrackEditor()

        expect(editor._getPreferredSampleForInstrument('KICK').url).toBe('real/kick.wav')
    })

    it('renders selected-kit samples first in the sample dropdown', () => {
        const editor = new TrackEditor()
        editor._track = {
            name: 'KICK',
            soundId: 'real/kick.wav',
            useAutoAssignSound: false,
            useSoftSynth: false
        }
        vi.spyOn(editor.synthEditor, 'getGeneratedSoundKeys').mockReturnValue([])

        const wrapper = document.createElement('div')
        wrapper.innerHTML = editor._renderSoundPanel()
        const sampleOptions = [...wrapper.querySelectorAll('select[data-sound="sample"] option')]

        expect(sampleOptions.map(option => option.value)).toEqual([
            'real/kick.wav',
            '8bits/kick.wav',
            'vintage/kick.wav'
        ])
        expect(sampleOptions[0].selected).toBe(true)
    })

    it('keeps the instrument dropdown aligned with the current sound key', () => {
        const editor = new TrackEditor()
        editor._track = {
            name: 'OLDNAME',
            soundId: 'real/kick.wav',
            useAutoAssignSound: false,
            useSoftSynth: false
        }
        vi.spyOn(editor.synthEditor, 'getGeneratedSoundKeys').mockReturnValue([])

        const wrapper = document.createElement('div')
        wrapper.innerHTML = editor._renderSoundPanel()
        const instrumentSelect = wrapper.querySelector('select[data-sound="instrument"]')

        expect(instrumentSelect.value).toBe('KICK')
    })
})

describe('TrackEditor loop panel', () => {
    it('renders loop properties correctly', () => {
        const editor = new TrackEditor()
        editor._track = {
            bars: 8,
            barQuantize: 4,
            loopAtStep: 16
        }

        const html = editor._renderLoopPanel()
        const wrapper = document.createElement('div')
        wrapper.innerHTML = html

        const qInput = wrapper.querySelector('input[data-loop="barQuantize"]')
        const bInput = wrapper.querySelector('input[data-loop="bars"]')
        const lInput = wrapper.querySelector('input[data-loop="loopAtStep"]')

        expect(qInput.value).toBe('4')
        expect(bInput.value).toBe('8')
        expect(lInput.value).toBe('16')
        expect(lInput.max).toBe('32') // 8 * 4
    })
})
