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
    slide: 0,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    vco2: { gain: 0, octave: 0, detune: 0, wave: 'sawtooth' },
    vco3: { gain: 0, octave: 0, detune: 0, wave: 'square' },
    filter: { type: 'lowpass', freq: 1200, Q: 2, filterEnvelopeAmount: 0.3 },
    lfo: { target: 'NOT', wave: 'sine', freq: 4, depth: 0.1 },
    noise: { mix: 0.05, filterType: 'highpass', filterFreq: 2000, filterQ: 1 },
    enveloppe: { attack: 0.01, decay: 0.12, sustain: 0.7, release: 0.1 }
}

function fireInput(el, value) {
    el.value = String(value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('SynthEditor — OrSlider integration', () => {
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
        serviceRegistry.mfCmd = { changeTrackSound: vi.fn() }

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

    it('renders each numeric parameter as a range input inside an OrSlider row', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')

        // Spot-check a few parameters
        for (const path of ['masterVolume', 'vco1.gain', 'filter.freq', 'enveloppe.attack', 'lfo.depth']) {
            const input = panel.querySelector(`input[data-synth-path="${path}"]`)
            expect(input, `missing input for ${path}`).not.toBeNull()
            expect(input.type).toBe('range')
            const row = input.closest('.ne-row')
            expect(row, `OrSlider row missing for ${path}`).not.toBeNull()
            // The row should also carry ss-row (panel-specific styling hook)
            expect(row.classList.contains('ss-row')).toBe(true)
            // The slider's own label is the ONLY label for this control
            // (no duplicated label from the panel's ss-row wrapper)
            const labelsInRow = row.querySelectorAll('label')
            expect(labelsInRow.length, `expected exactly one label in row for ${path}`).toBe(1)
        }
    })

    it('displays the initial value with the 2-decimal format', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')

        const v = panel.querySelector('input[data-synth-path="masterVolume"]')
        const span = v.nextElementSibling
        expect(span.textContent).toBe('0.9')

        const freq = panel.querySelector('input[data-synth-path="filter.freq"]')
        const freqSpan = freq.nextElementSibling
        expect(freqSpan.textContent).toBe('1200')
    })

    it('keeps select controls as native <select> (not sliders)', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')

        for (const path of ['vco1.wave', 'filter.type', 'lfo.target', 'noise.filterType']) {
            const sel = panel.querySelector(`select[data-synth-path="${path}"]`)
            expect(sel, `missing select for ${path}`).not.toBeNull()
            expect(panel.querySelector(`input[type=range][data-synth-path="${path}"]`)).toBeNull()
        }
    })

    it('changing a slider updates the draft and calls updateGeneratedSounds', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')
        const masterVol = panel.querySelector('input[data-synth-path="masterVolume"]')

        fireInput(masterVol, 0.42)
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBeCloseTo(0.42, 5)
        expect(masterVol.nextElementSibling.textContent).toBe('0.42')
        expect(serviceRegistry.audioEngine.updateGeneratedSounds).toHaveBeenCalled()
    })

    it('changing a deep path slider (filter.freq) updates the nested draft value', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')
        const freq = panel.querySelector('input[data-synth-path="filter.freq"]')

        fireInput(freq, 2500)
        expect(soundRegistry.generatedSounds.BASS1.filter.freq).toBe(2500)
        expect(freq.nextElementSibling.textContent).toBe('2500')
    })

    it('re-opening the editor destroys old sliders and renders fresh ones', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')
        const firstMasterVol = panel.querySelector('input[data-synth-path="masterVolume"]')

        await trackEditor.synthEditor.openEditor()
        const secondMasterVol = panel.querySelector('input[data-synth-path="masterVolume"]')
        expect(secondMasterVol).not.toBe(firstMasterVol)
    })

    it('keyboard arrow on a slider moves by exactly one step (no double-fire)', async () => {
        await trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')
        const input = panel.querySelector('input[data-synth-path="filter.Q"]')
        input.focus()

        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }))

        // Q: min=0.1, max=24, step=0.1, value=2 → after one step: 2.1
        expect(parseFloat(input.value)).toBeCloseTo(2.1, 5)
    })

    it('a focused slider has a visible selection indicator (CSS rule applied)', async () => {
        // jsdom does not parse <link rel="stylesheet">, so we read the CSS
        // file directly to verify the focus rules exist.
        const fs = await import('fs')
        const path = await import('path')
        const cssPath = path.resolve(__dirname, '../src/ui/styles.css')
        const css = fs.readFileSync(cssPath, 'utf-8')

        // 1. The shared focus outline rule must include #soft-synth-panel
        const focusOutlineRe = /#soft-synth-panel[^{]*input\[type=range\]:focus\s*\{[^}]*outline:\s*1px\s+solid\s+#00fff5/s
        expect(css, 'missing :focus rule for soft-synth slider').toMatch(focusOutlineRe)

        // 2. A row-level :focus-within rule gives a clear visual indicator
        //    (background + left beat) so the user sees which control is active.
        const focusWithinRe = /#soft-synth-panel\s+\.ne-row:focus-within\s*\{[^}]*#00fff5/s
        expect(css, 'missing :focus-within rule for soft-synth slider row').toMatch(focusWithinRe)
    })

    it('boolean buttons still work (toggle on click)', async () => {
        // Open the editor once to create the draft, then mutate it and re-render
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
