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
        velocity: 0.8, pan: 0, pitch: 0,
        filterType: 'lowpass', filterFreq: 632, filterQ: 1,
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
        for (const key of ['reverbType', 'delayType', 'saturationType']) {
            const sel = editor.container.querySelector(`select[data-key="${key}"]`)
            expect(sel, `missing select for ${key}`).not.toBeNull()
        }
    })

    it('switches FX subtabs without rebuilding the Track Editor', () => {
        editor._track = makeTrack()
        editor.sync()
        const syncSpy = vi.spyOn(editor, 'sync')

        editor.container.querySelector('[data-fx-tab="1"]').click()

        expect(syncSpy).not.toHaveBeenCalled()
        expect(editor.container.querySelector('[data-fx-panel="1"]').classList.contains('fx-tab-panel-hidden')).toBe(false)
        expect(editor.container.querySelector('[data-fx-panel="0"]').classList.contains('fx-tab-panel-hidden')).toBe(true)
        expect(editor.container.querySelector('[data-fx-tab="1"]').closest('.te-mod-btn').classList.contains('active')).toBe(true)
    })

    it('filterType renders as icon buttons', () => {
        editor._track = makeTrack()
        editor.sync()
        const row = editor.container.querySelector('.fx-icon-row[data-prop="filterType"]')
        expect(row).not.toBeNull()
        const btns = row.querySelectorAll('.fx-icon-btn')
        expect(btns.length).toBe(3)
    })

    it('filterFreq knob displays Hz value', () => {
        editor._track = makeTrack({ filterFreq: 632 })
        editor.sync()
        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(valEl).not.toBeNull()
        expect(valEl.textContent).toBe('632Hz')
    })

    it('changing a knob value via setValue updates the track and fires onTrackParamChange', () => {
        editor._track = makeTrack({ filterFreq: 632 })
        editor.sync()
        const fn = vi.fn()
        playbackEvents.on("trackParamChange", fn)

        const knob = editor._fxKnobs.find(k => k._key === 'filterFreq')
        expect(knob).not.toBeNull()
        knob.setValue(1000)
        knob._onChange?.(1000, 'filterFreq')
        expect(editor._track.filterFreq).toBeCloseTo(1000, 5)
        expect(fn).toHaveBeenCalled()
    })

    it('filterFreq knob shows formatted Hz display after value change', () => {
        editor._track = makeTrack({ filterFreq: 20 })
        editor.sync()
        const knob = editor._fxKnobs.find(k => k._key === 'filterFreq')
        expect(knob).not.toBeNull()
        knob.setValue(2500)
        knob._onChange?.(2500, 'filterFreq')
        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(valEl.textContent).toBe('2.5k')
    })

    it('re-syncing destroys old OrKnob instances (no listener leak)', () => {
        editor._track = makeTrack({ filterFreq: 632 })
        editor.sync()
        const firstKnob = editor.container.querySelector('.or-knob[data-or-knob="filterFreq"]')

        editor._track = makeTrack({ filterFreq: 5000 })
        editor.sync()
        const secondKnob = editor.container.querySelector('.or-knob[data-or-knob="filterFreq"]')
        expect(secondKnob).not.toBe(firstKnob)
    })

    it('keyboard arrow on a knob changes its value', () => {
        editor._track = makeTrack({ filterFreq: 1000 })
        editor.sync()
        const knobEl = editor.container.querySelector('.or-knob[data-or-knob="filterFreq"]')
        knobEl.focus()
        knobEl.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }))
        expect(editor._track.filterFreq).toBeGreaterThan(1000)
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
        editor._track = makeTrack({ filterFreq: 632, filterFreqLfo: { freq: 1, min: 0, max: 0.5 } })
        editor.sync()
        const freqRow = editor.container.querySelector('.ne-row[data-prop="filterFreq"]')
        expect(freqRow).not.toBeNull()
        expect(freqRow.classList.contains('has-lfo')).toBe(true)
    })

    it('row without an LFO prop does NOT get "has-lfo"', () => {
        editor._track = makeTrack({ filterFreq: 632, filterQ: 1 })
        editor.sync()
        const qRow = editor.container.querySelector('.ne-row[data-prop="filterQ"]')
        expect(qRow).not.toBeNull()
        expect(qRow.classList.contains('has-lfo')).toBe(false)
    })

    it('toggling the LFO on preserves the LFO mode (has-lfo re-applied after sync)', () => {
        const track = makeTrack({ filterFreq: 632 })
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
        playbackEvents.on("trackParamChange", fn)

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

describe('TrackEditor — modulation sub-tab selection & toggle', () => {
    let editor

    beforeEach(() => {
        setup()
        editor = new TrackEditor()
        editor.init()
    })

    function showModTab(track) {
        editor._track = track
        editor._tab.setActive('mod')
        editor.sync()
    }

    it('renders all LFO sub-tab buttons (filterFreq, filterQ, Vel, Pan, Pitch)', () => {
        showModTab(makeTrack())
        const btns = editor.container.querySelectorAll('[data-lfo-select-btn]')
        const keys = [...btns].map(b => b.dataset.lfoSelectBtn)
        expect(keys).toEqual(['filterFreq', 'filterQ', 'velocity', 'pan', 'pitch'])
    })

    it('clicking a sub-tab button selects it (active class moves)', () => {
        showModTab(makeTrack())
        editor.container.querySelector('[data-lfo-select-btn="pan"]').click()

        const panBtn = editor.container.querySelector('[data-lfo-select-btn="pan"]').closest('.te-mod-btn')
        expect(panBtn.classList.contains('active')).toBe(true)

        const velBtn = editor.container.querySelector('[data-lfo-select-btn="velocity"]').closest('.te-mod-btn')
        expect(velBtn.classList.contains('active')).toBe(false)
    })

    it('clicking a sub-tab button updates _selectedLfoTarget', () => {
        showModTab(makeTrack())
        editor.container.querySelector('[data-lfo-select-btn="pitch"]').click()
        expect(editor._selectedLfoTarget).toBe('pitch')
    })

    it('clicking a sub-tab shows that target LFO controls (freq, range, phase)', () => {
        const track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 1.5, min: 0.1, max: 0.9, phase: 0.5 } })
        showModTab(track)

        editor.container.querySelector('[data-lfo-select-btn="velocity"]').click()

        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        expect(freqInput).not.toBeNull()
        expect(freqInput.value).toBe('1.5')
    })

    it('clicking different sub-tabs switches the displayed controls', () => {
        const track = makeTrack({
            velocity: 0.5, velocityLfo: { freq: 1.8, min: 0, max: 1, phase: 0 },
            filterFreq: 632, filterFreqLfo: { freq: 0.5, min: 0.2, max: 0.8, phase: 0.3 },
        })
        showModTab(track)

        editor.container.querySelector('[data-lfo-select-btn="filterFreq"]').click()
        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        expect(freqInput.value).toBe('0.5')

        editor.container.querySelector('[data-lfo-select-btn="velocity"]').click()
        const freqInput2 = editor.container.querySelector('input[data-lfo-key="freq"]')
        expect(freqInput2.value).toBe('1.8')
    })

    it('clicking the toggle LED turns LFO on/off for the target', () => {
        const track = makeTrack({ velocity: 0.5 })
        showModTab(track)

        expect(track.velocityLfo).toBeUndefined()

        editor.container.querySelector('[data-lfo-toggle-btn="velocity"]').click()

        expect(track.velocityLfo).toBeDefined()
        expect(track.velocityLfo.type).toBe('sine')
        expect(track.velocityLfo.freq).toBe(1)

        editor.container.querySelector('[data-lfo-toggle-btn="velocity"]').click()
        expect(track.velocityLfo).toBeUndefined()
    })

    it('toggle button fires dispatchPatternChange', () => {
        const track = makeTrack({ velocity: 0.5 })
        showModTab(track)
        const fn = vi.fn()
        playbackEvents.on("patternChange", fn)

        editor.container.querySelector('[data-lfo-toggle-btn="velocity"]').click()
        expect(fn).toHaveBeenCalled()
    })

    it('toggle button also selects the target and shows its controls', () => {
        const track = makeTrack({
            velocity: 0.5,
            filterFreq: 632
        })
        showModTab(track)

        editor.container.querySelector('[data-lfo-toggle-btn="filterFreq"]').click()

        expect(editor._selectedLfoTarget).toBe('filterFreq')
        expect(track.filterFreqLfo).toBeDefined()
        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        expect(freqInput.value).toBe('1')
    })

    it('changing LFO freq via slider updates track data and display', () => {
        const track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 1, min: 0, max: 1, phase: 0 } })
        showModTab(track)

        editor.container.querySelector('[data-lfo-select-btn="velocity"]').click()
        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        freqInput.value = '1.5'
        freqInput.dispatchEvent(new Event('input', { bubbles: true }))

        expect(track.velocityLfo.freq).toBe(1.5)
        expect(freqInput.value).toBe('1.5')
        expect(freqInput.nextElementSibling.textContent).toBe('1.5')
    })

    it('changing LFO freq fires dispatchTrackParamChange', () => {
        const track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 1, min: 0, max: 1, phase: 0 } })
        showModTab(track)
        const fn = vi.fn()
        playbackEvents.on("trackParamChange", fn)

        editor.container.querySelector('[data-lfo-select-btn="velocity"]').click()
        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        freqInput.value = '1.2'
        freqInput.dispatchEvent(new Event('input', { bubbles: true }))

        expect(fn).toHaveBeenCalled()
    })

    it('changing LFO min/max range updates track data and display', () => {
        const track = makeTrack({ pan: 0, panLfo: { freq: 1, min: -0.5, max: 0.5, phase: 0 } })
        showModTab(track)

        editor.container.querySelector('[data-lfo-select-btn="pan"]').click()
        const minInput = editor.container.querySelector('input[data-lfo-key="min"]')
        minInput.value = '-0.8'
        minInput.dispatchEvent(new Event('input', { bubbles: true }))

        expect(track.panLfo.min).toBe(-0.8)
        const rangeRow = minInput.closest('.ne-row')
        const display = rangeRow.querySelector('.ne-val')
        expect(display.textContent).toBe('-0.8..0.5')
    })

    it('changing LFO phase via slider updates track data and display', () => {
        const track = makeTrack({ pitch: 0, pitchLfo: { freq: 1, min: 0, max: 1, phase: 0 } })
        showModTab(track)

        editor.container.querySelector('[data-lfo-select-btn="pitch"]').click()
        const phaseInput = editor.container.querySelector('input[data-lfo-key="phase"]')
        phaseInput.value = '0.75'
        phaseInput.dispatchEvent(new Event('input', { bubbles: true }))

        expect(track.pitchLfo.phase).toBe(0.75)
        expect(phaseInput.nextElementSibling.textContent).toBe('0.75')
    })

    it('LFO type select updates track data', () => {
        const track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 1, min: 0, max: 1, phase: 0 } })
        showModTab(track)

        editor.container.querySelector('[data-lfo-select-btn="velocity"]').click()
        const typeSelect = editor.container.querySelector('select[data-lfo-type-select]')
        typeSelect.value = 'square'
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }))

        expect(track.velocityLfo.type).toBe('square')

        const typeSelectAfter = editor.container.querySelector('select[data-lfo-type-select]')
        expect(typeSelectAfter.value).toBe('square')
    })

    it('LED shows "on" class when the LFO is active', () => {
        const track = makeTrack({ velocity: 0.5, velocityLfo: { freq: 1, min: 0, max: 1, phase: 0 } })
        showModTab(track)

        const led = editor.container.querySelector('[data-lfo-toggle-btn="velocity"]')
        expect(led.classList.contains('on')).toBe(true)

        const pitchLed = editor.container.querySelector('[data-lfo-toggle-btn="pitch"]')
        expect(pitchLed.classList.contains('on')).toBe(false)
    })

    it('full cycle: select sub-tab → toggle on → change freq → verify display → toggle off', () => {
        const track = makeTrack({ velocity: 0.5 })
        showModTab(track)

        editor.container.querySelector('[data-lfo-select-btn="velocity"]').click()
        expect(editor._selectedLfoTarget).toBe('velocity')

        editor.container.querySelector('[data-lfo-toggle-btn="velocity"]').click()
        expect(track.velocityLfo).toBeDefined()

        const freqInput = editor.container.querySelector('input[data-lfo-key="freq"]')
        freqInput.value = '1.8'
        freqInput.dispatchEvent(new Event('input', { bubbles: true }))
        expect(track.velocityLfo.freq).toBe(1.8)
        expect(freqInput.nextElementSibling.textContent).toBe('1.8')

        editor.container.querySelector('[data-lfo-toggle-btn="velocity"]').click()
        expect(track.velocityLfo).toBeUndefined()
    })
})

describe('TrackEditor — filter bypass (allpass) via LED and icons', () => {
    let editor

    beforeEach(() => {
        setup()
        editor = new TrackEditor()
        editor.init()
    })

    function showFxTab(track) {
        editor._track = track
        editor._tab.setActive('fx')
        editor._fxTab.setActive('3')
        editor.sync()
    }

    it('filter LED is off when filterType is allpass', () => {
        showFxTab(makeTrack({ filterType: 'allpass' }))
        const led = editor.container.querySelector('[data-fx-toggle-btn="filterFreq"]')
        expect(led.classList.contains('on')).toBe(false)
    })

    it('filter LED is on when filterType is lowpass', () => {
        showFxTab(makeTrack({ filterType: 'lowpass' }))
        const led = editor.container.querySelector('[data-fx-toggle-btn="filterFreq"]')
        expect(led.classList.contains('on')).toBe(true)
    })

    it('clicking the filter LED toggles filterType to allpass when active', () => {
        const track = makeTrack({ filterType: 'lowpass', filterFreq: 632, filterQ: 1 })
        showFxTab(track)

        editor.container.querySelector('[data-fx-toggle-btn="filterFreq"]').click()
        expect(track.filterType).toBe('allpass')
    })

    it('clicking the filter LED restores previous type when off', () => {
        const track = makeTrack({ filterType: 'allpass', filterFreq: 632, filterQ: 1 })
        showFxTab(track)

        editor._prevFilterType = 'highpass'
        editor.container.querySelector('[data-fx-toggle-btn="filterFreq"]').click()
        expect(track.filterType).toBe('highpass')
    })

    it('clicking the filter LED restores lowpass as default when no previous type', () => {
        const track = makeTrack({ filterType: 'allpass', filterFreq: 632, filterQ: 1 })
        showFxTab(track)

        editor.container.querySelector('[data-fx-toggle-btn="filterFreq"]').click()
        expect(track.filterType).toBe('lowpass')
    })

    it('LED toggles on → off → on cycle', () => {
        const track = makeTrack({ filterType: 'lowpass', filterFreq: 632, filterQ: 1 })
        showFxTab(track)

        const toggle = () => editor.container.querySelector('[data-fx-toggle-btn="filterFreq"]')

        expect(track.filterType).toBe('lowpass')
        toggle().click()
        expect(track.filterType).toBe('allpass')
        toggle().click()
        expect(track.filterType).toBe('lowpass')
    })

    it('filter icon click sets filterType', () => {
        const track = makeTrack({ filterType: 'allpass', filterFreq: 632, filterQ: 1 })
        showFxTab(track)

        const hpIcon = editor.container.querySelector('[data-fx-icon-val="highpass"]')
        hpIcon.click()
        expect(track.filterType).toBe('highpass')
    })

    it('clicking the same filter icon toggles to allpass', () => {
        const track = makeTrack({ filterType: 'bandpass', filterFreq: 632, filterQ: 1 })
        showFxTab(track)

        const bpIcon = editor.container.querySelector('[data-fx-icon-val="bandpass"]')
        bpIcon.click()
        expect(track.filterType).toBe('allpass')
    })

    it('filter icon click fires dispatchPatternChange', () => {
        const track = makeTrack({ filterType: 'allpass', filterFreq: 632, filterQ: 1 })
        showFxTab(track)
        const fn = vi.fn()
        playbackEvents.on("patternChange", fn)

        editor.container.querySelector('[data-fx-icon-val="lowpass"]').click()
        expect(fn).toHaveBeenCalled()
    })

    it('filter icon selected class reflects current type', () => {
        const track = makeTrack({ filterType: 'highpass', filterFreq: 632, filterQ: 1 })
        showFxTab(track)

        const hpIcon = editor.container.querySelector('[data-fx-icon-val="highpass"]')
        expect(hpIcon.classList.contains('selected')).toBe(true)

        const lpIcon = editor.container.querySelector('[data-fx-icon-val="lowpass"]')
        expect(lpIcon.classList.contains('selected')).toBe(false)
    })

    it('no icon is selected when filter is allpass', () => {
        const track = makeTrack({ filterType: 'allpass', filterFreq: 632, filterQ: 1 })
        showFxTab(track)

        const icons = editor.container.querySelectorAll('[data-fx-icon-val]')
        icons.forEach(icon => {
            expect(icon.classList.contains('selected')).toBe(false)
        })
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
            filterFreq: 632,
            filterFreqLfo: { freq: 0, min: 158, max: 158, phase: 0 },
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
            filterFreq: 632,
            filterFreqLfo: { freq: 0, min: 5000, max: 5000, phase: 0 },
        })
        appState.patterns = [{ tracks: [editor._track], nbBeats: 4 }]
        appState.selectedPatternNum = 0
        editor.sync()

        editor._updateLfoSliders()

        const valEl = editor.container.querySelector('.ne-val[data-key="filterFreq"]')
        expect(valEl.textContent).toBe('5.0k')
        expect(editor._track.filterFreq).toBe(632)
    })
})
