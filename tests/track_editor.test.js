/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrackEditor from '../src/ui/track_editor.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'

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

    function renderSoundPanelHtml(track) {
        const editor = new TrackEditor()
        editor._track = track
        vi.spyOn(editor.synthEditor, 'getGeneratedSoundKeys').mockReturnValue([])
        const wrapper = document.createElement('div')
        wrapper.innerHTML = editor._renderSoundPanel()
        return wrapper
    }

    it('renders selected-kit samples first in the sample dropdown', () => {
        const wrapper = renderSoundPanelHtml({
            name: 'KICK',
            soundId: 'real/kick.wav',
            useAutoAssignSound: false,
            useSoftSynth: false
        })
        const sampleOptions = [...wrapper.querySelectorAll('select[data-sound="sample"] option')]

        expect(sampleOptions.map(option => option.value)).toEqual([
            'real/kick.wav',
            '8bits/kick.wav',
            'vintage/kick.wav'
        ])
        expect(sampleOptions[0].selected).toBe(true)
    })

    it('keeps the instrument dropdown aligned with the current sound key', () => {
        const wrapper = renderSoundPanelHtml({
            name: 'OLDNAME',
            soundId: 'real/kick.wav',
            useAutoAssignSound: false,
            useSoftSynth: false
        })
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
        const sInput = wrapper.querySelector('input[data-loop="swingAmount"]')

        expect(qInput.value).toBe('4')
        expect(bInput.value).toBe('8')
        expect(lInput.value).toBe('16')
        expect(lInput.max).toBe('32') // 8 * 4
        expect(sInput).not.toBeNull()
    })
})

describe('TrackEditor onPatternChange', () => {
    it('rebinds to the same-named track in the new pattern and re-syncs', () => {
        const editor = new TrackEditor()
        editor.init()
        const oldTrack = { name: 'KICK', velocity: 0.7 }
        const newTrack = { name: 'KICK', velocity: 0.3 }
        editor._track = oldTrack
        editor._trackIdx = 0
        appState.patterns = [{ tracks: [newTrack] }]
        appState.selectedPatternNum = 0

        const syncSpy = vi.spyOn(editor, 'sync').mockImplementation(() => {})

        playbackEvents.onPatternChange.forEach(fn => fn())

        expect(editor._track).toBe(newTrack)
        expect(editor._trackIdx).toBe(0)
        expect(syncSpy).toHaveBeenCalled()
    })

    it('hides the editor when the track no longer exists in the new pattern', () => {
        const editor = new TrackEditor()
        editor.init()
        editor._track = { name: 'KICK', velocity: 0.7 }
        editor._trackIdx = 0
        appState.patterns = [{ tracks: [{ name: 'SNARE' }] }]
        appState.selectedPatternNum = 0

        const hideSpy = vi.spyOn(editor, 'hide').mockImplementation(() => {})

        playbackEvents.onPatternChange.forEach(fn => fn())

        expect(hideSpy).toHaveBeenCalled()
    })

    it('does nothing when no track is currently selected', () => {
        const editor = new TrackEditor()
        editor.init()
        const syncSpy = vi.spyOn(editor, 'sync').mockImplementation(() => {})

        playbackEvents.onPatternChange.forEach(fn => fn())

        expect(syncSpy).not.toHaveBeenCalled()
    })
})

describe('TrackEditor LFO row highlight', () => {
    it('marks the selected prop row with the "selected" class', () => {
        const editor = new TrackEditor()
        editor.init()
        editor._track = { name: 'KICK', velocity: 0.5, pitchLfo: null }
        editor._selectedPropKey = 'velocity'
        editor.sync()

        const selectedRow = editor.container.querySelector('.ne-row.selected')
        expect(selectedRow).not.toBeNull()
        expect(selectedRow.dataset.prop).toBe('velocity')
    })

    it('marks rows whose prop has an LFO configured with the "has-lfo" class', () => {
        const editor = new TrackEditor()
        editor.init()
        editor._track = {
            name: 'KICK',
            velocity: 0.5,
            pitchLfo: { freq: 1, min: 0, max: 0.5 },
            pan: 0,
        }
        editor._selectedPropKey = null
        editor.sync()

        const lfoRows = editor.container.querySelectorAll('.ne-row.has-lfo')
        // pitch is in the Levels group with lfo='pitchLfo' — it should be marked
        const lfoProp = [...lfoRows].find(r => r.dataset.prop === 'pitch')
        expect(lfoProp).toBeDefined()
    })
})
