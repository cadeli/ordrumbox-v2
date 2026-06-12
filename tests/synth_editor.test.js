/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SynthEditor from '../src/ui/synth_editor.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

const makeGeneratedSound = () => ({
    masterVolume: 0.8,
    slide: 0,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1, filterEnvelopeAmount: 0 },
    enveloppe: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 }
})

describe('SynthEditor sub-panel toolbar', () => {
    let editor
    let host
    let audioEngine

    beforeEach(() => {
        document.body.innerHTML = '<div id="pattern-panel"></div><div id="te-panel"></div>'
        serviceRegistry.reset()
        soundRegistry.reset()
        soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
        audioEngine = {
            updateGeneratedSounds: vi.fn(),
            invalidateCache: vi.fn()
        }
        serviceRegistry.audioEngine = audioEngine

        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            setLineDash: vi.fn(),
            closePath: vi.fn(),
            fill: vi.fn()
        })

        host = {
            _track: { synthSoundKey: 'BASS1' },
            container: document.getElementById('te-panel'),
            sync: vi.fn()
        }
        editor = new SynthEditor(host)
        editor.createDOM()
    })

    it('renders one toggle per synth group and collapses on click', () => {
        editor.openEditor()

        const toggles = Array.from(document.querySelectorAll('#soft-synth-panel .ne-group-accordion-toggle[data-toggle]'))
        expect(toggles.map(toggle => toggle.dataset.toggle)).toEqual([
            'master',
            'vco1',
            'vco2',
            'vco3',
            'filter',
            'lfo',
            'lfo2',
            'noise',
            'enveloppe'
        ])

        const masterGroup = document.querySelector('#soft-synth-panel [data-synth-group="master"]')
        expect(masterGroup.classList.contains('expanded')).toBe(true)

        const masterToggle = toggles.find(t => t.dataset.toggle === 'master')
        masterToggle.click()
        expect(masterToggle.classList.contains('active')).toBe(false)
        expect(masterGroup.classList.contains('collapsed')).toBe(true)
    })

    it('keeps OK and Cancel in the toolbar and preserves save/cancel behavior', () => {
        editor.openEditor()

        const header = document.querySelector('#soft-synth-panel .ss-header')
        const okButton = header.querySelector('[data-action="synth-ok"]')
        const cancelButton = header.querySelector('[data-action="synth-cancel"]')
        expect(okButton).not.toBeNull()
        expect(cancelButton).not.toBeNull()

        const volume = document.querySelector('#soft-synth-panel input[data-synth-path="masterVolume"]')
        volume.value = '0.25'
        volume.dispatchEvent(new Event('input', { bubbles: true }))
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.25)

        cancelButton.click()
        expect(document.getElementById('soft-synth-panel').style.display).toBe('none')
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.8)

        editor.openEditor()
        const nextVolume = document.querySelector('#soft-synth-panel input[data-synth-path="masterVolume"]')
        nextVolume.value = '0.3'
        nextVolume.dispatchEvent(new Event('input', { bubbles: true }))
        document.querySelector('#soft-synth-panel [data-action="synth-ok"]').click()

        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.3)
        expect(audioEngine.invalidateCache).toHaveBeenCalled()
    })
})
