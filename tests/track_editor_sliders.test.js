// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrackEditor from '../src/ui/track_editor.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'


function makeTrack(overrides = {}) {
    return {
        name: 'KICK',
        velocity: 0.8, pan: 0, pitch: 0, sampleDecay: 0.5,
        filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.5,
        filterEnvelopeAmount: 0, filterLfo: 0,
        reverbAmount: 0, reverbType: 'none',
        delayDepth: 0, delayTime: 0.25, delayType: 'none',
        saturationAmount: 0, saturationType: 'soft',
        mute: false, mono: false,
        volumeLfo: 0, panLfo: 0, pitchLfo: 0, filterFreqLfo: 0, filterQLfo: 0,
        useAutoAssignSound: false, useSoftSynth: false, synthSoundKey: null,
        soundId: '', nbBeats: 4, stepsPerBeat: 4, loopAtStep: 16, swingAmount: 0,
        ...overrides,
    }
}

function setup() {
    document.body.innerHTML = ''
    appState.reset()
    serviceRegistry.reset()
    soundRegistry.reset()
    soundRegistry.drumkitList = [
        { name: 'real', instruments: [{ key: 'KICK', url: 'real/kick.wav' }] }
    ]
    soundRegistry.sounds = {
        'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: {} }
    }
    appState.trackEditorVisibility = {
        basic: true, filters: true, effects: true, sound: false, loop: false, lfo: true,
    }
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        fillRect: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn(),
        putImageData: vi.fn(), createImageData: vi.fn(), setTransform: vi.fn(),
        drawImage: vi.fn(), save: vi.fn(), fillText: vi.fn(), restore: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
        stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
        arc: vi.fn(), fill: vi.fn(), measureText: vi.fn().mockReturnValue({ width: 0 }),
        transform: vi.fn(), rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn()
    })
}

describe('TrackEditor — OrSlider integration', () => {
    let editor

    beforeEach(() => {
        setup()
        editor = new TrackEditor()
        editor.init()
        editor._activeTab = 'fx'
        editor._activeFxTab = 3
    })

    it('renders GROUPS sliders as OrSlider rows (ne-row + data-key)', () => {
        editor._track = makeTrack()
        editor.sync()

        for (const key of ['filterFreq', 'filterQ', 'reverbAmount']) {
            const knob = editor.container.querySelector(`.or-knob[data-or-knob="${key}"]`)
            expect(knob, `missing knob for ${key}`).not.toBeNull()
            const row = knob.closest('.ne-row')
            expect(row).not.toBeNull()
            expect(row.dataset.prop).toBe(key)
        }
    })

    it('booleans stay as native buttons (not sliders)', () => {
        editor._track = makeTrack()
        editor.sync()
        const monoBtn = editor.container.querySelector('button[data-key="mono"]')
        expect(monoBtn).not.toBeNull()
    })

    it('selects stay as native <select> (not sliders)', () => {
        editor._track = makeTrack({
            reverbAmount: 0.5, delayDepth: 0.3, saturationAmount: 0.2,
        })
        editor.sync()
        for (const key of ['filterType', 'reverbType', 'delayType', 'saturationType']) {
            const sel = editor.container.querySelector(`select[data-key="${key}"]`)
            expect(sel, `missing select for ${key}`).not.toBeNull()
        }
    })

    it('filterFreq knob displays Hz value', () => {
        editor._track = makeTrack({ filterFreq: 0.5 })
        editor.sync()
        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(valEl).not.toBeNull()
        expect(valEl.textContent).toBe('632Hz')
    })

    it('changing a knob value via setValue updates the track and fires onTrackParamChange', () => {
        editor._track = makeTrack({ filterFreq: 0.5 })
        editor.sync()
        const fn = vi.fn()
        playbackEvents.onTrackParamChange.push(fn)

        const knob = editor._fxKnobs.find(k => k._key === 'filterFreq')
        expect(knob).not.toBeNull()
        knob.setValue(0.7)
        knob._onChange?.(0.7, 'filterFreq')
        expect(editor._track.filterFreq).toBeCloseTo(0.7, 5)
        expect(fn).toHaveBeenCalled()
    })

    it('filterFreq knob shows formatted Hz display after value change', () => {
        editor._track = makeTrack({ filterFreq: 0 })
        editor.sync()
        const knob = editor._fxKnobs.find(k => k._key === 'filterFreq')
        expect(knob).not.toBeNull()
        knob.setValue(0.7)
        knob._onChange?.(0.7, 'filterFreq')
        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(valEl.textContent).toBe('2.5k')
    })

    it('re-syncing destroys old OrKnob instances (no listener leak)', () => {
        editor._track = makeTrack({ filterFreq: 0.5 })
        editor.sync()
        const firstKnob = editor.container.querySelector('.or-knob[data-or-knob="filterFreq"]')

        editor._track = makeTrack({ filterFreq: 0.9 })
        editor.sync()
        const secondKnob = editor.container.querySelector('.or-knob[data-or-knob="filterFreq"]')
        expect(secondKnob).not.toBe(firstKnob)
    })

    it('keyboard arrow on a knob changes its value', () => {
        editor._track = makeTrack({ filterFreq: 0.5 })
        editor.sync()
        const knobEl = editor.container.querySelector('.or-knob[data-or-knob="filterFreq"]')
        knobEl.focus()
        knobEl.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }))
        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(parseFloat(valEl.textContent)).toBeGreaterThan(0.5)
    })
})

describe('TrackEditor — LFO mode preservation with OrKnob', () => {
    let editor

    beforeEach(() => {
        setup()
        editor = new TrackEditor()
        editor.init()
        editor._activeTab = 'fx'
        editor._activeFxTab = 3
    })

    it('row with an LFO prop gets the "has-lfo" class', () => {
        editor._track = makeTrack({ filterFreq: 0.5, filterFreqLfo: { freq: 1, min: 0, max: 0.5 } })
        editor.sync()
        const freqRow = editor.container.querySelector('.ne-row[data-prop="filterFreq"]')
        expect(freqRow).not.toBeNull()
        expect(freqRow.classList.contains('has-lfo')).toBe(true)
    })

    it('row without an LFO prop does NOT get "has-lfo"', () => {
        editor._track = makeTrack({ filterFreq: 0.5, filterQ: 0.5 })
        editor.sync()
        const qRow = editor.container.querySelector('.ne-row[data-prop="filterQ"]')
        expect(qRow).not.toBeNull()
        expect(qRow.classList.contains('has-lfo')).toBe(false)
    })

    it('toggling the LFO on preserves the LFO mode (has-lfo re-applied after sync)', () => {
        const track = makeTrack({ filterFreq: 0.5 })
        appState.patterns = [{ tracks: [track] }]
        appState.selectedPatternNum = 0
        editor._track = track
        editor._trackIdx = 0
        editor._selectedLfoTarget = 'filterFreq'
        editor.sync()

        let freqRow = editor.container.querySelector('.ne-row[data-prop="filterFreq"]')
        expect(freqRow.classList.contains('has-lfo')).toBe(false)

        editor._toggleLfo()
        freqRow = editor.container.querySelector('.ne-row[data-prop="filterFreq"]')
        expect(freqRow).not.toBeNull()
        expect(freqRow.classList.contains('has-lfo')).toBe(true)
        expect(editor._track.filterFreqLfo).toBeDefined()

        editor._toggleLfo()
        freqRow = editor.container.querySelector('.ne-row[data-prop="filterFreq"]')
        expect(freqRow.classList.contains('has-lfo')).toBe(false)
        expect(editor._track.filterFreqLfo).toBeUndefined()
    })

    it('LFO sub-panel: freq/phase are managed by OrSlider with data-lfo-key', () => {
        editor._track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 2, min: 0, max: 1, phase: 0.3 } })
        editor._selectedLfoTarget = 'velocity'
        editor.sync()

        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        const phaseInput = editor.container.querySelector('input[data-lfo-key="phase"]')
        expect(freqInput).not.toBeNull()
        expect(freqInput.value).toBe('2')
        expect(phaseInput).not.toBeNull()
        expect(phaseInput.value).toBe('0.3')

        const minInput = editor.container.querySelector('input[data-lfo-key="min"]')
        const maxInput = editor.container.querySelector('input[data-lfo-key="max"]')
        expect(minInput).not.toBeNull()
        expect(maxInput).not.toBeNull()
    })

    it('LFO sub-panel: changing freq via the OrSlider updates track.velocityLfo.freq', () => {
        editor._track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 1, min: 0, max: 1, phase: 0 } })
        editor._selectedLfoTarget = 'velocity'
        editor.sync()
        const fn = vi.fn()
        playbackEvents.onTrackParamChange.push(fn)

        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        freqInput.value = '1.5'
        freqInput.dispatchEvent(new Event('input', { bubbles: true }))
        expect(editor._track.velocityLfo.freq).toBe(1.5)
        expect(freqInput.nextElementSibling.textContent).toBe('1.5')
        expect(fn).toHaveBeenCalled()
    })

    it('LFO sub-panel: changing min in the dual-range updates the shared "min..max" display', () => {
        editor._track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 1, min: 0.1, max: 0.9, phase: 0 } })
        editor._selectedLfoTarget = 'velocity'
        editor.sync()

        const minInput = editor.container.querySelector('input[data-lfo-key="min"]')
        minInput.value = '0.25'
        minInput.dispatchEvent(new Event('input', { bubbles: true }))
        expect(editor._track.velocityLfo.min).toBe(0.25)

        const rangeRow = minInput.closest('.ne-row')
        const display = rangeRow.querySelector('.ne-val')
        expect(display).not.toBeNull()
        expect(display.textContent).toBe('0.25..0.9')
    })
})

describe('TrackEditor — _updateLfoSliders uses setValue', () => {
    let editor

    beforeEach(() => {
        setup()
        editor = new TrackEditor()
        editor.init()
        editor._activeTab = 'fx'
        editor._activeFxTab = 3
    })

    it('LFO live update: replace semantics via setValue (Hz display)', () => {
        serviceRegistry.transport = { isRunning: true, tick: 0 }
        editor._track = makeTrack({
            filterFreq: 0.5,
            filterFreqLfo: { freq: 0, min: 0.3, max: 0.3, phase: 0 },
        })
        appState.patterns = [{ tracks: [editor._track], nbBeats: 4 }]
        appState.selectedPatternNum = 0
        editor.sync()

        editor._updateLfoSliders()

        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(valEl).not.toBeNull()
        expect(valEl.textContent).toBe('158Hz')
    })

    it('LFO live update: writes the value to the track (displayed), not the base', () => {
        serviceRegistry.transport = { isRunning: true, tick: 0 }
        editor._track = makeTrack({
            filterFreq: 0.5,
            filterFreqLfo: { freq: 0, min: 0.8, max: 0.8, phase: 0 },
        })
        appState.patterns = [{ tracks: [editor._track], nbBeats: 4 }]
        appState.selectedPatternNum = 0
        editor.sync()

        editor._updateLfoSliders()

        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(valEl.textContent).toBe('5.0k')
        expect(editor._track.filterFreq).toBe(0.5)
    })
})
