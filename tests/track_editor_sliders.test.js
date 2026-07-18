// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrackEditor from '../src/ui/track_editor.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'


function fireInput(el, value) {
    el.value = String(value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

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
        basic: true, levels: true, filters: true, effects: true, sound: false, loop: false,
    }
    // Patterns must include the editor's track so the onPatternChange
    // subscriber (which hides the editor when the track is missing) is
    // happy. We update the pattern in each test if needed.
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
    })

    it('renders GROUPS sliders as OrSlider rows (ne-row + data-key)', () => {
        editor._track = makeTrack()
        editor.sync()

        for (const key of ['velocity', 'pan', 'pitch', 'filterFreq', 'filterQ']) {
            const input = editor.container.querySelector(`input[data-key="${key}"]`)
            expect(input, `missing input for ${key}`).not.toBeNull()
            expect(input.type).toBe('range')
            const row = input.closest('.ne-row')
            expect(row).not.toBeNull()
        }
    })

    it('booleans stay as native buttons (not sliders)', () => {
        editor._track = makeTrack()
        editor.sync()
        const monoBtn = editor.container.querySelector('button[data-key="mono"]')
        expect(monoBtn).not.toBeNull()
        expect(editor.container.querySelector('input[type=range][data-key="mono"]')).toBeNull()
    })

    it('selects stay as native <select> (not sliders)', () => {
        // Reverb/delay/saturation selects are only rendered when their
        // respective FX is on (amount > 0). Enable them for this test.
        editor._track = makeTrack({
            reverbAmount: 0.5, delayDepth: 0.3, saturationAmount: 0.2,
        })
        editor.sync()
        for (const key of ['filterType', 'reverbType', 'delayType', 'saturationType']) {
            const sel = editor.container.querySelector(`select[data-key="${key}"]`)
            expect(sel, `missing select for ${key}`).not.toBeNull()
        }
    })

    it('filterFreq slider is normalized (0..1) and display shows Hz', () => {
        editor._track = makeTrack({ filterFreq: 0.5 })
        editor.sync()
        const input = editor.container.querySelector('input[data-key="filterFreq"]')
        expect(input.min).toBe('0')
        expect(input.max).toBe('1')
        expect(input.value).toBe('0.5')
        expect(input.nextElementSibling.textContent).toBe('632Hz')
    })

    it('changing a slider via input updates the track and fires onTrackParamChange', () => {
        editor._track = makeTrack({ velocity: 0.5 })
        editor.sync()
        const fn = vi.fn()
        playbackEvents.onTrackParamChange.push(fn)

        const input = editor.container.querySelector('input[data-key="velocity"]')
        fireInput(input, 0.3)
        expect(editor._track.velocity).toBeCloseTo(0.3, 5)
        expect(input.nextElementSibling.textContent).toBe('0.3')
        expect(fn).toHaveBeenCalled()
    })

    it('changing filterFreq via input keeps the track value in normalized space', () => {
        editor._track = makeTrack({ filterFreq: 0 })
        editor.sync()
        const input = editor.container.querySelector('input[data-key="filterFreq"]')
        fireInput(input, 0.7)
        expect(editor._track.filterFreq).toBeCloseTo(0.7, 5)
        // 0.7 → ~ 2511 Hz → display "2.5k" (per fmtFreq)
        expect(input.nextElementSibling.textContent).toBe('2.5k')
    })

    it('re-syncing destroys old OrSlider instances (no listener leak)', () => {
        editor._track = makeTrack({ velocity: 0.5 })
        editor.sync()
        const firstInput = editor.container.querySelector('input[data-key="velocity"]')

        editor._track = makeTrack({ velocity: 0.9 })
        editor.sync()
        const secondInput = editor.container.querySelector('input[data-key="velocity"]')
        expect(secondInput).not.toBe(firstInput)
        expect(secondInput.value).toBe('0.9')
    })

    it('keyboard arrow on a slider moves by exactly one step (no double-fire)', () => {
        editor._track = makeTrack({ velocity: 0.5 })
        editor.sync()
        const input = editor.container.querySelector('input[data-key="velocity"]')
        input.focus()
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }))
        expect(parseFloat(input.value)).toBeCloseTo(0.51, 5)
    })
})

describe('TrackEditor — LFO mode preservation with OrSlider', () => {
    let editor

    beforeEach(() => {
        setup()
        editor = new TrackEditor()
        editor.init()
    })

    it('row with an LFO prop gets the "has-lfo" class', () => {
        editor._track = makeTrack({ velocity: 0.5, pitchLfo: { freq: 1, min: 0, max: 0.5 } })
        editor.sync()
        const pitchRow = editor.container.querySelector('.ne-row[data-prop="pitch"]')
        expect(pitchRow).not.toBeNull()
        expect(pitchRow.classList.contains('has-lfo')).toBe(true)
    })

    it('row without an LFO prop does NOT get "has-lfo"', () => {
        editor._track = makeTrack({ velocity: 0.5, pan: 0 })
        editor.sync()
        const panRow = editor.container.querySelector('.ne-row[data-prop="pan"]')
        expect(panRow).not.toBeNull()
        expect(panRow.classList.contains('has-lfo')).toBe(false)
    })

    it('toggling the LFO on preserves the LFO mode (has-lfo re-applied after sync)', () => {
        const track = makeTrack({ velocity: 0.5 })
        appState.patterns = [{ tracks: [track] }]
        appState.selectedPatternNum = 0
        editor._track = track
        editor._trackIdx = 0
        editor._selectedPropKey = 'velocity'
        editor.sync()

        // No LFO yet → no has-lfo
        let velRow = editor.container.querySelector('.ne-row[data-prop="velocity"]')
        expect(velRow.classList.contains('has-lfo')).toBe(false)

        // Toggle LFO on
        editor._toggleLfo()
        velRow = editor.container.querySelector('.ne-row[data-prop="velocity"]')
        expect(velRow).not.toBeNull()
        expect(velRow.classList.contains('has-lfo')).toBe(true)
        expect(editor._track.velocityLfo).toBeDefined()

        // Toggle LFO off
        editor._toggleLfo()
        velRow = editor.container.querySelector('.ne-row[data-prop="velocity"]')
        expect(velRow.classList.contains('has-lfo')).toBe(false)
        expect(editor._track.velocityLfo).toBeUndefined()
    })

    it('LFO sub-panel: freq/phase are managed by OrSlider with data-lfo-key', () => {
        editor._track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 2, min: 0, max: 1, phase: 0.3 } })
        editor._selectedPropKey = 'velocity'
        editor.sync()

        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        const phaseInput = editor.container.querySelector('input[data-lfo-key="phase"]')
        expect(freqInput).not.toBeNull()
        expect(freqInput.value).toBe('2')
        expect(phaseInput).not.toBeNull()
        expect(phaseInput.value).toBe('0.3')

        // Dual-range min/max are still plain inputs
        const minInput = editor.container.querySelector('input[data-lfo-key="min"]')
        const maxInput = editor.container.querySelector('input[data-lfo-key="max"]')
        expect(minInput).not.toBeNull()
        expect(maxInput).not.toBeNull()
    })

    it('LFO sub-panel: changing freq via the OrSlider updates track.velocityLfo.freq', () => {
        editor._track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 1, min: 0, max: 1, phase: 0 } })
        editor._selectedPropKey = 'velocity'
        editor.sync()
        const fn = vi.fn()
        playbackEvents.onTrackParamChange.push(fn)

        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        fireInput(freqInput, 1.5)
        expect(editor._track.velocityLfo.freq).toBe(1.5)
        expect(freqInput.nextElementSibling.textContent).toBe('1.5')
        expect(fn).toHaveBeenCalled()
    })

    it('LFO sub-panel: changing min in the dual-range updates the shared "min..max" display', () => {
        editor._track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 1, min: 0.1, max: 0.9, phase: 0 } })
        editor._selectedPropKey = 'velocity'
        editor.sync()

        const minInput = editor.container.querySelector('input[data-lfo-key="min"]')
        fireInput(minInput, 0.25)
        expect(editor._track.velocityLfo.min).toBe(0.25)

        // The dual-range is followed by a "min..max" display span in the same row.
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

        const input = editor.container.querySelector('input[data-key="filterFreq"]')
        const valEl = input.nextElementSibling
        expect(parseFloat(input.value)).toBeCloseTo(0.3, 5)
        // 0.3 normalized → 158 Hz
        expect(valEl.textContent).toBe('158Hz')
    })

    it('LFO live update: writes the value to the track (displayed), not the base', () => {
        serviceRegistry.transport = { isRunning: true, tick: 0 }
        editor._track = makeTrack({
            velocity: 0.5,
            velocityLfo: { freq: 0, min: 0.8, max: 0.8, phase: 0 },
        })
        appState.patterns = [{ tracks: [editor._track], nbBeats: 4 }]
        appState.selectedPatternNum = 0
        editor.sync()

        editor._updateLfoSliders()

        const input = editor.container.querySelector('input[data-key="velocity"]')
        expect(parseFloat(input.value)).toBeCloseTo(0.8, 5)
        expect(input.nextElementSibling.textContent).toBe('0.8')
        // Editor does not mutate the track on LFO update (audio engine does)
        expect(editor._track.velocity).toBe(0.5)
    })
})
