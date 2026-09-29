/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import SynthEditor from '../src/ui/synth_editor.js'
import PresetSection from '../src/ui/synth_editor/preset_section.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'

const makeGeneratedSound = () => ({
    masterVolume: 0.8,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1, filterEnvelopeAmount: 0 },
    envelope: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 },
})

describe('SynthEditor — import JSON calls the public persist API', () => {
    let editor
    let audioEngine

    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function boot() {
        document.body.innerHTML = '<div id="app-content"><div id="pattern-panel"></div><div id="te-panel"></div></div>'
        serviceRegistry.reset()
        soundRegistry.reset()
        soundRegistry.generatedSounds = { BASS1: makeGeneratedSound() }
        audioEngine = { updateGeneratedSounds: vi.fn(), invalidateCache: vi.fn() }
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
            fill: vi.fn(),
        })

        const host = {
            track: { synthSoundKey: 'BASS1' },
            container: document.getElementById('te-panel'),
            sync: vi.fn(),
        }
        editor = new SynthEditor(host, { playbackEvents, serviceRegistry, soundRegistry })
        editor.createDOM()
        document.getElementById('app-content').appendChild(editor.panel)
        await editor.openEditor()
    }

    it('persists generated sounds after a JSON import', async () => {
        await boot()

        const importBtn = editor.panel.querySelector('[data-action="synth-import"]')
        expect(importBtn).not.toBeNull()

        let fileInput = null
        const origCreate = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
            const el = origCreate(tag, options)
            if (String(tag).toLowerCase() === 'input') fileInput = el
            return el
        })
        const persistSpy = vi.spyOn(PresetSection.prototype, 'persist').mockImplementation(() => {})

        importBtn.click()

        expect(fileInput).not.toBeNull()
        expect(fileInput.type).toBe('file')

        Object.defineProperty(fileInput, 'files', {
            configurable: true,
            value: [{ text: async () => JSON.stringify({ NEW_SOUND: makeGeneratedSound() }) }],
        })
        fileInput.dispatchEvent(new Event('change'))

        await vi.waitFor(() => expect(persistSpy).toHaveBeenCalled())
        expect(audioEngine.updateGeneratedSounds).toHaveBeenCalled()
        expect(soundRegistry.generatedSounds.NEW_SOUND).toBeTruthy()
    })
})
