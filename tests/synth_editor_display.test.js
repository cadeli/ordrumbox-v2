/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
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

describe('Soft Synth Editor display', () => {
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
            name: 'BASS_1',
            notes: [],
            mute: false, solo: false,
            useAutoAssignSound: false,
            useSoftSynth: true,
            synthSoundKey: 'BASS1',
            soundId: '',
            velocity: 0.8, pan: 0, pitch: 0,
            filterCutoff: 12000, filterResonance: 1, filterType: 'lowpass',
            filterLfo: 0, filterEnvelopeAmount: 0,
            lfoPitch: 0, lfoVolume: 0, lfoPan: 0, lfoFilter: 0,
            pitchLfo: 0.2, volumeLfo: 0.1, panLfo: 0.05, filterLfoValue: 0.15,
            pitchEnv: 0,
            delaySend: 0, reverbSend: 0, saturationDrive: 0,
            delayActive: false, reverbActive: false, saturationActive: false,
            swingAmount: 0, swingMode: 'off',
            bars: 4, barQuantize: 4, loopLength: 4, loopEnabled: false
        }

        trackEditor = new TrackEditor()
        trackEditor.init()
        trackEditor._track = mockTrack
    })

    it('creates the soft-synth-panel in document.body (hidden by default)', () => {
        const panel = document.getElementById('soft-synth-panel')
        expect(panel).not.toBeNull()
        expect(panel.style.display).toBe('none')
        expect(panel.parentElement).toBe(document.body)
    })

    it('opens the editor, shows the panel, and hides the track editor', () => {
        trackEditor.synthEditor.openEditor()

        const panel = document.getElementById('soft-synth-panel')
        expect(panel.style.display).toBe('block')
        expect(trackEditor.container.style.display).toBe('none')
    })

    it('renders the title with the synth sound key', () => {
        trackEditor.synthEditor.openEditor()
        const title = document.querySelector('#soft-synth-panel .ss-title')
        expect(title).not.toBeNull()
        expect(title.textContent).toContain('BASS1')
    })

    it('renders the group toggle toolbar (one button per group)', () => {
        trackEditor.synthEditor.openEditor()
        const toggles = document.querySelectorAll('#soft-synth-panel .ss-toggles .ne-toggle')
        expect(toggles.length).toBeGreaterThanOrEqual(Object.keys(SAMPLE_DRAFT).length)

        const labels = Array.from(toggles).map(t => t.textContent.trim())
        expect(labels).toContain('Master')
        expect(labels).toContain('Flt')
        expect(labels).toContain('Env')
    })

    it('renders the OK and Cancel action buttons', () => {
        trackEditor.synthEditor.openEditor()
        const okBtn = document.querySelector('#soft-synth-panel [data-action="synth-ok"]')
        const cancelBtn = document.querySelector('#soft-synth-panel [data-action="synth-cancel"]')
        expect(okBtn).not.toBeNull()
        expect(okBtn.textContent.trim()).toBe('OK')
        expect(cancelBtn).not.toBeNull()
        expect(cancelBtn.textContent.trim()).toBe('Cancel')
    })

    it('renders the waveform canvas', () => {
        trackEditor.synthEditor.openEditor()
        const canvas = document.querySelector('#soft-synth-panel #ss-waveform')
        expect(canvas).not.toBeNull()
        expect(canvas.tagName).toBe('CANVAS')
        expect(canvas.width).toBe(600)
        expect(canvas.height).toBe(120)
    })

    it('renders one group block per draft key', () => {
        trackEditor.synthEditor.openEditor()
        const groups = document.querySelectorAll('#soft-synth-panel .ss-group')
        expect(groups.length).toBeGreaterThanOrEqual(Object.keys(SAMPLE_DRAFT).length)
    })

    it('renders an input control for every parameter path', () => {
        trackEditor.synthEditor.openEditor()
        const inputs = document.querySelectorAll('#soft-synth-panel .ss-row input, #soft-synth-panel .ss-row select')
        const paths = Array.from(inputs).map(i => i.dataset.synthPath)
        expect(paths).toContain('masterVolume')
        expect(paths).toContain('vco1.gain')
        expect(paths).toContain('vco1.wave')
        expect(paths).toContain('filter.freq')
        expect(paths).toContain('enveloppe.attack')
        expect(paths).toContain('lfo.target')
        expect(paths.length).toBeGreaterThanOrEqual(20)
    })

    it('keeps the softsynth visible when onPatternChange fires (play pressed)', () => {
        trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')
        expect(panel.style.display).toBe('block')

        playbackEvents.dispatchPatternChange()

        expect(panel.style.display).toBe('block')
        expect(trackEditor.container.style.display).toBe('none')
    })

    it('closes the panel and re-shows the track editor on Cancel', () => {
        trackEditor.synthEditor.openEditor()
        const panel = document.getElementById('soft-synth-panel')
        expect(panel.style.display).toBe('block')

        trackEditor.synthEditor._closeEditor(false)

        expect(panel.style.display).toBe('none')
        expect(trackEditor.container.style.display).toBe('block')
    })
})
