// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrackEditor from '../src/ui/track_editor.js'
import SynthEditor from '../src/ui/synth_editor.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'

const SAMPLE_DRAFT = {
    masterVolume: 0.9,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    vco2: { gain: 0, octave: 0, detune: 0, wave: 'sawtooth' },
    vco3: { gain: 0, octave: 0, detune: 0, wave: 'square' },
    filter: { type: 'lowpass', freq: 1200, Q: 2, filterEnvelopeAmount: 0.3 },
    lfo: { target: 'NOT', wave: 'sine', freq: 4, depth: 0.1 },
    noise: { mix: 0.05, filterType: 'highpass', filterFreq: 2000, filterQ: 1 },
    enveloppe: { attack: 0.01, decay: 0.12, sustain: 0.7, release: 0.1 }
}

describe('SynthEditor — OrKnob integration', () => {
    let trackEditor
    let mockTrack

    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        soundRegistry.drumkitList = [
            { name: 'real', instruments: [{ key: 'KICK', url: 'real/kick.wav' }] }
        ]
        soundRegistry.sounds = {
            'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: { duration: 0.5, sampleRate: 44100, getChannelData: () => new Float32Array(1024) } }
        }
        soundRegistry.generatedSounds = {
            BASS1: { ...SAMPLE_DRAFT, _key: 'BASS1' }
        }

        serviceRegistry.audioEngine = {
            updateGeneratedSounds: vi.fn(),
            invalidateCache: vi.fn()
        }
        serviceRegistry.cmd = { changeTrackSound: vi.fn() }

        document.body.innerHTML = ''

        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ major: { scaleSteps: [0, 2, 4, 5, 7, 9, 11] } })
        })
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn(),
            putImageData: vi.fn(), createImageData: vi.fn(), setTransform: vi.fn(),
            drawImage: vi.fn(), save: vi.fn(), fillText: vi.fn(), restore: vi.fn(),
            beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
            stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
            arc: vi.fn(), fill: vi.fn(), measureText: vi.fn().mockReturnValue({ width: 0 }),
            transform: vi.fn(), rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn()
        })

        mockTrack = {
            name: 'BASS_1', notes: [],
            useAutoAssignSound: false, useSoftSynth: true,
            synthSoundKey: 'BASS1', soundId: '',
            velocity: 0.8, pan: 0, pitch: 0,
            filterCutoff: 12000, filterResonance: 1, filterType: 'lowpass',
            lfoPitch: 0, lfoVolume: 0, lfoPan: 0, lfoFilter: 0,
            pitchLfo: 0, volumeLfo: 0, panLfo: 0, filterLfoValue: 0,
            pitchEnv: 0, filterEnvelopeAmount: 0, filterLfo: 0,
            delaySend: 0, reverbSend: 0, saturationDrive: 0,
            delayActive: false, reverbActive: false, saturationActive: false,
            swingAmount: 0, swingMode: 'off',
            nbBeats: 4, stepsPerBeat: 4, loopLength: 4, loopEnabled: false,
            mute: false, solo: false,
        }

        trackEditor = new TrackEditor()
        trackEditor.init()
        trackEditor._track = mockTrack
    })

    it('renders each numeric parameter as an OrKnob row', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')

        for (const path of ['masterVolume', 'vco1.gain', 'filter.freq', 'enveloppe.attack', 'lfo.depth']) {
            const knob = panel.querySelector(`.or-knob[data-or-knob="${path}"]`)
            expect(knob, `missing knob for ${path}`).not.toBeNull()
            const row = knob.closest('.ne-row')
            expect(row, `OrKnob row missing for ${path}`).not.toBeNull()
            expect(row.classList.contains('ne-row-knob')).toBe(true)
            const labels = row.querySelectorAll('.or-knob-label')
            expect(labels.length, `expected exactly one label in row for ${path}`).toBe(1)
        }
    })

    it('displays the initial value with the default format', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')

        const masterRow = panel.querySelector(`[data-or-slider="masterVolume"]`)
        const masterVal = masterRow.querySelector('.ne-val')
        expect(masterVal.textContent).toBe('0.9')

        const freqRow = panel.querySelector(`[data-or-slider="filter.freq"]`)
        const freqVal = freqRow.querySelector('.ne-val')
        expect(freqVal.textContent).toBe('1200 Hz')
    })

    it('keeps select controls as native <select> (not knobs)', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')

        for (const path of ['lfo.target']) {
            const sel = panel.querySelector(`select[data-synth-path="${path}"]`)
            expect(sel, `missing select for ${path}`).not.toBeNull()
            expect(panel.querySelector(`.or-knob[data-or-knob="${path}"]`)).toBeNull()
        }

        for (const path of ['vco1.wave', 'filter.type', 'noise.filterType']) {
            expect(panel.querySelector(`select[data-synth-path="${path}"]`)).toBeNull()
            expect(panel.querySelector(`.or-knob[data-or-knob="${path}"]`)).toBeNull()
        }
    })

    it('changing a knob updates the draft and calls updateGeneratedSounds', async () => {
        await trackEditor.synthEditor.openEditor()
        const knob = trackEditor.synthEditor._knobs.find(k => k._key === 'masterVolume')
        expect(knob).not.toBeNull()

        knob.setValue(0.42, true)
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBeCloseTo(0.42, 5)
        const panel = document.getElementById('soft-synth-panel')
        const valSpan = panel.querySelector(`[data-or-slider="masterVolume"] .ne-val`)
        expect(valSpan.textContent).toBe('0.42')
        expect(serviceRegistry.audioEngine.updateGeneratedSounds).toHaveBeenCalled()
    })

    it('changing a deep path knob (filter.freq) updates the nested draft value', async () => {
        await trackEditor.synthEditor.openEditor()
        const knob = trackEditor.synthEditor._knobs.find(k => k._key === 'filter.freq')
        expect(knob).not.toBeNull()

        knob.setValue(2500, true)
        expect(soundRegistry.generatedSounds.BASS1.filter.freq).toBe(2500)
        const panel = document.getElementById('soft-synth-panel')
        const valSpan = panel.querySelector(`[data-or-slider="filter.freq"] .ne-val`)
        expect(valSpan.textContent).toBe('2500 Hz')
    })

    it('re-opening the editor destroys old knobs and renders fresh ones', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')
        const firstKnob = panel.querySelector('.or-knob[data-or-knob="masterVolume"]')

        await trackEditor.synthEditor.openEditor()
        const secondKnob = panel.querySelector('.or-knob[data-or-knob="masterVolume"]')
        expect(secondKnob).not.toBe(firstKnob)
    })

    it('keyboard arrow on a knob moves by exactly one step', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')
        const knobEl = panel.querySelector('.or-knob[data-or-knob="filter.Q"]')
        knobEl.focus()

        knobEl.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }))

        const knob = trackEditor.synthEditor._knobs.find(k => k._key === 'filter.Q')
        expect(knob.getValue()).toBeCloseTo(2.1, 5)
    })

    it('the knob has a focus rule in CSS', async () => {
        const fs = await import('fs')
        const path = await import('path')
        const cssPath = path.resolve(__dirname, '../src/ui/styles.css')
        const css = fs.readFileSync(cssPath, 'utf-8')

        const focusRe = /\.or-knob:focus\s*\{[^}]*outline/
        expect(css, 'missing :focus rule for .or-knob').toMatch(focusRe)

        const focusWithinRe = /#soft-synth-panel\s+\.ne-row:focus-within\s*\{[^}]*(?:#00fff5|var\(--cyan\)|var\(--color-info\))/s
        expect(css, 'missing :focus-within rule for soft-synth knob row').toMatch(focusWithinRe)
    })

    it('boolean buttons still work (toggle on click)', async () => {
        await trackEditor.synthEditor.openEditor()
        trackEditor.synthEditor._draft.someFlag = false
        soundRegistry.generatedSounds.BASS1.someFlag = false
        trackEditor.synthEditor._renderEditor()

        const panel = document.getElementById('soft-synth-panel')
        const btn = panel.querySelector('button[data-synth-type="boolean"][data-synth-path="someFlag"]')
        expect(btn).not.toBeNull()
        expect(btn.textContent).toBe('OFF')

        btn.click()
        expect(trackEditor.synthEditor._draft.someFlag).toBe(true)
        expect(btn.textContent).toBe('ON')
    })
})
