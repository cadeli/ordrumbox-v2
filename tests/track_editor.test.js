/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The panel render also draws the sample bar, whose fixtures carry dummy
// buffers ({}), so the analyzer must not run on them.
vi.mock('../src/audio/sample_analyzer.js', () => ({
    analyzeSample: vi.fn(() => ({ envelope: [0.1, 0.9, 0.4], noteInfo: null, length: 0.5, peakDb: -3 })),
    clearAnalysisCache: vi.fn(),
    drawEnvelope: vi.fn(),
    drawDecayMarker: vi.fn(),
}))

import TrackEditor from '../src/ui/track_editor.js'
import { getPreferredSampleForInstrument } from '../src/ui/track_editor/sound_queries.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { EVENTS } from '../src/core/events.js'

describe('TrackEditor sound panel', () => {
    beforeEach(() => {
        appState.reset()
        serviceRegistry.reset()
        soundRegistry.reset()
        document.body.innerHTML = ''
        soundRegistry.drumkitList = [
            { name: '8bits', instruments: [{ key: 'KICK', url: '8bits/kick.wav', display_name: 'Kick 8' }] },
            { name: 'real', instruments: [{ key: 'KICK', url: 'real/kick.wav', display_name: 'Kick Real' }] },
            { name: 'vintage', instruments: [{ key: 'KICK', url: 'vintage/kick.wav', display_name: 'Kick Vintage' }] },
        ]
        soundRegistry.sounds = {
            'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: {} },
        }
        appState.selectedDrumkitIdx = 1
    })

    it('prefers the sample from the selected drumkit when an instrument is chosen', () => {
        const editor = new TrackEditor()

        expect(getPreferredSampleForInstrument(editor, 'KICK').url).toBe('real/kick.wav')
    })

    function renderSoundPanelHtml(track) {
        const editor = new TrackEditor()
        editor.init()
        editor.track = track
        vi.spyOn(editor.synthEditor, 'getGeneratedSoundKeys').mockReturnValue([])
        editor.sync()
        return editor.container
    }

    it('renders selected-kit samples first in the sample dropdown', () => {
        const wrapper = renderSoundPanelHtml({
            name: 'KICK',
            sampleId: 'real/kick.wav',
            useAutoAssignSound: false,
            useSoftSynth: false,
        })
        const sampleOptions = [...wrapper.querySelectorAll('select[data-sound="sample"] option')]

        expect(sampleOptions.map((option) => option.value)).toEqual([
            'real/kick.wav',
            '8bits/kick.wav',
            'vintage/kick.wav',
        ])
        expect(sampleOptions[0].selected).toBe(true)
    })

    it('keeps the instrument dropdown aligned with the current sound key', () => {
        const wrapper = renderSoundPanelHtml({
            name: 'OLDNAME',
            sampleId: 'real/kick.wav',
            useAutoAssignSound: false,
            useSoftSynth: false,
        })
        const instrumentSelect = wrapper.querySelector('select[data-sound="instrument"]')

        expect(instrumentSelect.value).toBe('KICK')
    })
})

describe('TrackEditor filterFreq display', () => {
    function getFreqDisplay(track) {
        const editor = new TrackEditor()
        editor.init()
        editor.track = track
        editor.fxTab.setActive('3')
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

    it('20 kHz is rendered as "20.0k"', () => {
        expect(getFreqDisplay({ name: 'KICK', filterFreq: 20000 })).toBe('20.0k')
    })
})

describe('TrackEditor loop panel', () => {
    it('renders loop properties correctly', () => {
        const editor = new TrackEditor()
        editor.init()
        editor.track = {
            beatCount: 8,
            stepsPerBeat: 4,
            loopAtStep: 16,
        }
        editor.sync()

        const qInput = editor.container.querySelector('input[data-loop="stepsPerBeat"]')
        const lInput = editor.container.querySelector('input[data-loop="loopAtStep"]')
        const sInput = editor.container.querySelector('input[data-loop="swingAmount"]')

        expect(qInput.value).toBe('4')
        expect(lInput).not.toBeNull()
        expect(lInput.value).toBe('16')
        expect(lInput.max).toBe('32') // 8 * 4
        expect(sInput).not.toBeNull()
    })
})

describe('TrackEditor PATTERN_CHANGE handling', () => {
    it('rebinds to the same-named track in the new pattern and re-syncs', () => {
        const editor = new TrackEditor()
        editor.init()
        const oldTrack = { name: 'KICK', velocity: 0.7 }
        const newTrack = { name: 'KICK', velocity: 0.3 }
        editor.track = oldTrack
        editor.selectedTrackIdx = 0
        appState.patterns = [{ tracks: [newTrack] }]
        appState.selectedPatternIdx = 0
        editor.show({ track: oldTrack, trackIdx: 0 })

        const syncSpy = vi.spyOn(editor, 'sync').mockImplementation(() => {})

        playbackEvents.emit(EVENTS.PATTERN_CHANGE)

        expect(editor.track).toBe(newTrack)
        expect(editor.selectedTrackIdx).toBe(0)
        expect(syncSpy).toHaveBeenCalled()
    })

    it('clears the track and re-syncs when the track no longer exists in the new pattern (does not auto-hide)', () => {
        const editor = new TrackEditor()
        editor.init()
        editor.track = { name: 'KICK', velocity: 0.7 }
        editor.selectedTrackIdx = 0
        appState.patterns = [{ tracks: [{ name: 'SNARE' }] }]
        appState.selectedPatternIdx = 0
        editor.show({ track: editor.track, trackIdx: 0 })

        const syncSpy = vi.spyOn(editor, 'sync').mockImplementation(() => {})

        playbackEvents.emit(EVENTS.PATTERN_CHANGE)

        expect(editor.track).toBeNull()
        expect(editor.selectedTrackIdx).toBe(-1)
        expect(syncSpy).toHaveBeenCalled()
    })

    it('does nothing when no track is currently selected', () => {
        const editor = new TrackEditor()
        editor.init()
        const syncSpy = vi.spyOn(editor, 'sync').mockImplementation(() => {})

        playbackEvents.emit(EVENTS.PATTERN_CHANGE)

        expect(syncSpy).not.toHaveBeenCalled()
    })
})

describe('TrackEditor loop slider events', () => {
    beforeEach(() => {
        serviceRegistry.cmd = {
            updateTrack: vi.fn((track, updates) => Object.assign(track, updates)),
            setStepsPerBeat: vi.fn((track, value) => {
                track.stepsPerBeat = value
                const maxSteps = (track.beatCount ?? 4) * value
                if (track.loopAtStep > maxSteps) track.loopAtStep = maxSteps
            }),
        }
    })

    it('should fire onLoopPointChange when loopAtStep changes without throwing', () => {
        const track = {
            name: 'Test Track',
            beatCount: 4,
            stepsPerBeat: 16,
            loopAtStep: 16,
            notes: [],
        }
        const pattern = {
            name: 'Test Pattern',
            tracks: [track],
            beatCount: 4,
        }
        appState.patterns = [pattern]
        appState.selectedPatternIdx = 0

        const editor = new TrackEditor()
        editor.init()
        editor.show({ track, trackIdx: 0 })

        const onLoopPointChangeSpy = vi.fn()
        playbackEvents.on(EVENTS.LOOP_POINT_CHANGE, onLoopPointChangeSpy)

        // Simulate the onChange call that happens during drag/input
        // This is what _renderLoopPanel does:
        // onChange: (v, key) => editor.onLoopSlider({ dataset: { loop: key }, value: v })

        expect(() => {
            editor.onLoopSlider({ dataset: { loop: 'loopAtStep' }, value: 32 })
        }).not.toThrow()

        expect(track.loopAtStep).toBe(32)
        expect(onLoopPointChangeSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                loopAtStep: 32,
                trackIdx: 0,
            }),
        )
    })

    it('emits PATTERN_META_CHANGE when stepsPerBeat changes', () => {
        const track = {
            name: 'Test Track',
            beatCount: 4,
            stepsPerBeat: 4,
            loopAtStep: 16,
            notes: [],
        }
        const pattern = {
            name: 'Test Pattern',
            tracks: [track],
            beatCount: 4,
        }
        appState.patterns = [pattern]
        appState.selectedPatternIdx = 0

        const editor = new TrackEditor()
        editor.init()
        editor.show({ track, trackIdx: 0 })

        const metaSpy = vi.fn()
        const paramSpy = vi.fn()
        const offMeta = playbackEvents.on(EVENTS.PATTERN_META_CHANGE, metaSpy)
        const offParam = playbackEvents.on(EVENTS.TRACK_PARAM_CHANGE, paramSpy)

        editor.onLoopSlider({ dataset: { loop: 'stepsPerBeat' }, value: 8 })

        expect(track.stepsPerBeat).toBe(8)
        expect(metaSpy).toHaveBeenCalled()
        expect(paramSpy).toHaveBeenCalled()

        offMeta()
        offParam()
    })

    it('does not emit PATTERN_META_CHANGE for non-structural loop keys', () => {
        const track = {
            name: 'Test Track',
            beatCount: 4,
            stepsPerBeat: 4,
            loopAtStep: 16,
            swingAmount: 0,
            notes: [],
        }
        const pattern = {
            name: 'Test Pattern',
            tracks: [track],
            beatCount: 4,
        }
        appState.patterns = [pattern]
        appState.selectedPatternIdx = 0

        const editor = new TrackEditor()
        editor.init()
        editor.show({ track, trackIdx: 0 })

        const metaSpy = vi.fn()
        const offMeta = playbackEvents.on(EVENTS.PATTERN_META_CHANGE, metaSpy)

        editor.onLoopSlider({ dataset: { loop: 'swingAmount' }, value: 0.5 })

        expect(track.swingAmount).toBe(0.5)
        expect(metaSpy).not.toHaveBeenCalled()

        offMeta()
    })
})
