/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

        expect(editor._sndSection._getPreferredSampleForInstrument('KICK').url).toBe('real/kick.wav')
    })

    function renderSoundPanelHtml(track) {
        const editor = new TrackEditor()
        editor._track = track
        vi.spyOn(editor.synthEditor, 'getGeneratedSoundKeys').mockReturnValue([])
        const wrapper = document.createElement('div')
        wrapper.innerHTML = editor._sndSection.render()
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

describe('TrackEditor filterFreq display', () => {
    function getFreqDisplay(track) {
        const editor = new TrackEditor()
        editor.init()
        editor._track = track
        editor._tab.setActive('fx')
        editor._fxTab.setActive('3')
        editor.sync()
        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        return valEl?.textContent
    }

    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('20 Hz is rendered as "20Hz"', () => {
        expect(getFreqDisplay({ name: 'KICK', filterFreq: 20 })).toBe('20Hz')
    })

    it('632 Hz is rendered as "632Hz"', () => {
        expect(getFreqDisplay({ name: 'KICK', filterFreq: 632 })).toBe('632Hz')
    })

    it('20 kHz is rendered as "20.0k"', () => {
        expect(getFreqDisplay({ name: 'KICK', filterFreq: 20000 })).toBe('20.0k')
    })

    it('_onSlider formats the display in Hz while dragging', () => {
        const editor = new TrackEditor()
        editor.init()
        editor._track = { name: 'KICK', filterFreq: 20 }
        editor._tab.setActive('fx')
        editor._fxTab.setActive('3')
        editor.sync()
        const knob = editor._fxKnobs.find(k => k.key === 'filterFreq')
        knob.setValue(632)
        knob.onChange?.(632, 'filterFreq')
        expect(editor._track.filterFreq).toBe(632)
        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(valEl.textContent).toBe('632Hz')
    })

    it('_updateLfoSliders replaces base with the LFO value (Hz)', () => {
        serviceRegistry.transport = { isRunning: true, tick: 0 }
        const editor = new TrackEditor()
        editor.init()
        // LFO with freq=0 → fixed output = min value = 158 Hz
        editor._track = {
            name: 'KICK',
            filterFreq: 632,
            filterFreqLfo: { freq: 0, min: 158, max: 158, phase: 0 },
        }
        editor._tab.setActive('fx')
        editor._fxTab.setActive('3')
        appState.patterns = [{ tracks: [editor._track], nbBeats: 4 }]
        appState.selectedPatternNum = 0
        editor.sync()
        editor._updateLfoSliders()
        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(valEl.textContent).toBe('158Hz')
    })
})

describe('TrackEditor loop panel', () => {
    it('renders loop properties correctly', () => {
        const editor = new TrackEditor()
        editor._track = {
            nbBeats: 8,
            stepsPerBeat: 4,
            loopAtStep: 16
        }

        const html = editor._loopSection.render()
        const wrapper = document.createElement('div')
        wrapper.innerHTML = html

        const qInput = wrapper.querySelector('input[data-loop="stepsPerBeat"]')
        const lInput = wrapper.querySelector('input[data-loop="loopAtStep"]')
        const sInput = wrapper.querySelector('input[data-loop="swingAmount"]')

        expect(qInput.value).toBe('4')
        expect(lInput).not.toBeNull()
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
        editor.show({ track: oldTrack, trackIdx: 0 })

        const syncSpy = vi.spyOn(editor, 'sync').mockImplementation(() => {})

        playbackEvents.emit("patternChange")

        expect(editor._track).toBe(newTrack)
        expect(editor._trackIdx).toBe(0)
        expect(syncSpy).toHaveBeenCalled()
    })

    it('clears the track and re-syncs when the track no longer exists in the new pattern (does not auto-hide)', () => {
        const editor = new TrackEditor()
        editor.init()
        editor._track = { name: 'KICK', velocity: 0.7 }
        editor._trackIdx = 0
        appState.patterns = [{ tracks: [{ name: 'SNARE' }] }]
        appState.selectedPatternNum = 0
        editor.show({ track: editor._track, trackIdx: 0 })

        const syncSpy = vi.spyOn(editor, 'sync').mockImplementation(() => {})

        playbackEvents.emit("patternChange")

        expect(editor._track).toBeNull()
        expect(editor._trackIdx).toBe(-1)
        expect(syncSpy).toHaveBeenCalled()
    })

    it('does nothing when no track is currently selected', () => {
        const editor = new TrackEditor()
        editor.init()
        const syncSpy = vi.spyOn(editor, 'sync').mockImplementation(() => {})

        playbackEvents.emit("patternChange")

        expect(syncSpy).not.toHaveBeenCalled()
    })
})

describe('TrackEditor loop slider events', () => {
    it('should fire onLoopPointChange when loopAtStep changes without throwing', () => {
        const track = {
            name: 'Test Track',
            nbBeats: 4,
            stepsPerBeat: 16,
            loopAtStep: 16,
            notes: []
        }
        const pattern = {
            name: 'Test Pattern',
            tracks: [track],
            nbBeats: 4
        }
        appState.patterns = [pattern]
        appState.selectedPatternNum = 0

        const editor = new TrackEditor()
        editor.init()
        editor.show({ track, trackIdx: 0 })

        const onLoopPointChangeSpy = vi.fn()
        playbackEvents.on("loopPointChange", onLoopPointChangeSpy)

        // Simulate the onChange call that happens during drag/input
        // This is what _renderLoopPanel does: 
        // onChange: (v, key) => this._onLoopSlider({ dataset: { loop: key }, value: v })
        
        expect(() => {
            editor._onLoopSlider({ dataset: { loop: 'loopAtStep' }, value: 32 })
        }).not.toThrow()

        expect(track.loopAtStep).toBe(32)
        expect(onLoopPointChangeSpy).toHaveBeenCalledWith(expect.objectContaining({
            loopAtStep: 32,
            trackIdx: 0
        }))
    })
})

describe('TrackEditor LFO row highlight', () => {
    it('marks the selected prop row with the "selected" class', () => {
        const editor = new TrackEditor()
        editor.init()
        editor._track = { name: 'KICK', filterFreq: 0.5, filterFreqLfo: null }
        editor._selectedPropKey = 'filterFreq'
        editor._tab.setActive('fx')
        editor._fxTab.setActive('3')
        editor.sync()

        const selectedRow = editor.container.querySelector('.ne-row.selected')
        expect(selectedRow).not.toBeNull()
        expect(selectedRow.dataset.prop).toBe('filterFreq')
    })

    it('marks rows whose prop has an LFO configured with the "has-lfo" class', () => {
        const editor = new TrackEditor()
        editor.init()
        editor._track = {
            name: 'KICK',
            filterFreq: 0.5,
            filterFreqLfo: { freq: 1, min: 0, max: 0.5 },
        }
        editor._selectedPropKey = null
        editor._tab.setActive('fx')
        editor._fxTab.setActive('3')
        editor.sync()

        const lfoRows = editor.container.querySelectorAll('.ne-row.has-lfo')
        const lfoProp = [...lfoRows].find(r => r.dataset.prop === 'filterFreq')
        expect(lfoProp).toBeDefined()
    })
})
