// tests/synth_editor_implicit.test.js
/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import SynthEditor from '../src/ui/synth_editor.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/event_bus.js'

const makeSound = (overrides = {}) => ({
    masterVolume: 0.8,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    vco2: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    vco3: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1, drive: 0 },
    filterEnv: { filterEnvelopeAmount: 0 },
    fm: { amount: 0, algo: 0 },
    lfo: { target: 'NOT', wave: 'sine', freq: 0, depth: 0, sync: 'off' },
    lfo2: { target: 'NOT', wave: 'sine', freq: 0, depth: 0, sync: 'off' },
    noise: { mix: 0, filterType: 'highpass', filterFreq: 1000, filterQ: 1 },
    envelope: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 },
    modEnvelope: { attack: 0, decay: 0.12, sustain: 0, release: 0.1, target: 'off' },
    ...overrides,
})

let editor
let audioEngine

async function setup(sound) {
    document.body.innerHTML = '<div id="app-content"></div>'
    serviceRegistry.reset()
    soundRegistry.reset()
    soundRegistry.generatedSounds = { BASS1: makeSound(sound) }
    audioEngine = { setGeneratedSounds: vi.fn(), invalidateCache: vi.fn() }
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

    editor = new SynthEditor(
        { track: { synthSoundKey: 'BASS1' }, container: null, sync: vi.fn() },
        {
            playbackEvents,
            serviceRegistry,
            soundRegistry,
        },
    )
    editor.createDOM()
    document.getElementById('app-content').appendChild(editor.panel)
    await editor.showPanel()
    return editor
}

const knob = (path) => editor.knobs.find((k) => k.key === path)

describe('implicit enable on interaction', () => {
    it('vco2: touching octave at gain 0 raises gain to 0.5 and drops _savedGain', async () => {
        await setup()
        editor.model.draft.vco2._savedGain = 0.42
        knob('vco2.octave').setValue(2, true)

        expect(editor.model.draft.vco2.gain).toBe(0.5)
        expect(editor.model.draft.vco2._savedGain).toBeUndefined()
        expect(knob('vco2.gain').getValue()).toBe(0.5)
    })

    it('vco2: leaves gain untouched when it is already live', async () => {
        await setup({ vco2: { gain: 0.7, octave: 0, detune: 0, wave: 'sine' } })
        knob('vco2.octave').setValue(2, true)

        expect(editor.model.draft.vco2.gain).toBe(0.7)
    })

    it('vco2: dragging the gain knob itself never overrides the user value', async () => {
        await setup()
        knob('vco2.gain').setValue(0.18, true)

        expect(editor.model.draft.vco2.gain).toBe(0.18)
    })

    it('fm: touching algo at amount 0 sets amount 0.3 and unbypasses', async () => {
        await setup({ bypassFm: true })
        const icon = editor.panel.querySelector('[data-synth-path="fm.algo"].ss-fm-icon')
        icon.click()

        expect(editor.model.draft.fm.amount).toBe(0.3)
        expect(editor.model.draft.bypassFm).toBe(false)
        expect(editor.model.cardBypassed.fm).toBe(false)
    })

    it('fm: touching algo with a live amount changes nothing but the algo', async () => {
        await setup({ fm: { amount: 0.8, algo: 0 } })
        const icon = editor.panel.querySelector('[data-synth-path="fm.algo"].ss-fm-icon')
        icon.click()

        expect(editor.model.draft.fm.amount).toBe(0.8)
    })

    it('noise: touching filterFreq at mix 0 sets mix 0.15 and unbypasses', async () => {
        await setup({ bypassNoise: true })
        knob('noise.filterFreq').setValue(5000, true)

        expect(editor.model.draft.noise.mix).toBe(0.15)
        expect(editor.model.draft.bypassNoise).toBe(false)
        expect(knob('noise.mix').getValue()).toBe(0.15)
    })

    it('lfo: touching freq at target NOT points to filter.freq, unbypasses and lifts depth', async () => {
        await setup({ bypassLfo1: true })
        knob('lfo.freq').setValue(2, true)

        expect(editor.model.draft.lfo.target).toBe('filter.freq')
        expect(editor.model.draft.bypassLfo1).toBe(false)
        expect(editor.model.draft.lfo.depth).toBe(0.5)
        expect(knob('lfo.depth').getValue()).toBe(0.5)
        const select = editor.panel.querySelector('select[data-synth-path="lfo.target"]')
        expect(select.value).toBe('filter.freq')
    })

    it('lfo: touching depth itself applies the user value without the 0.5 lift', async () => {
        await setup()
        knob('lfo.depth').setValue(0.2, true)

        expect(editor.model.draft.lfo.target).toBe('filter.freq')
        expect(editor.model.draft.lfo.depth).toBe(0.2)
    })

    it('modEnvelope: touching an ADSR at target off points to filter and unbypasses', async () => {
        await setup({ bypassModEnv: true })
        knob('modEnvelope.attack').setValue(0.1, true)

        expect(editor.model.draft.modEnvelope.target).toBe('filter')
        expect(editor.model.draft.bypassModEnv).toBe(false)
        const select = editor.panel.querySelector('select[data-synth-path="modEnvelope.target"]')
        expect(select.value).toBe('filter')
    })
})

describe('card bypass hydration on preset load', () => {
    it('derives bypassed cards from draft flags', async () => {
        await setup({ bypassFilter: true, bypassLfo2: true })
        const filterCard = editor.panel.querySelector('[data-ss-card="filter"]')
        const lfo2Card = editor.panel.querySelector('[data-ss-card="lfo2"]')

        expect(filterCard.classList.contains('bypassed')).toBe(true)
        expect(lfo2Card.classList.contains('bypassed')).toBe(true)
        expect(editor.panel.querySelector('[data-power-card="filter"]').classList.contains('active')).toBe(false)
    })

    it('derives vco cards from gain (0 = bypassed, >0 = active)', async () => {
        await setup({ vco2: { gain: 0.6, octave: 0, detune: 0, wave: 'sine' } })

        expect(editor.panel.querySelector('[data-ss-card="vco2"]').classList.contains('bypassed')).toBe(false)
        expect(editor.panel.querySelector('[data-ss-card="vco3"]').classList.contains('bypassed')).toBe(true)
    })
})

describe('frame-coalesced preview commit', () => {
    it('does not commit a knob change synchronously but flushPreview does', async () => {
        await setup()
        knob('masterVolume').setValue(0.33, true)

        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.8)

        editor.flushPreview()
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.33)
    })

    it('coalesces a burst of knob changes into a single commit per flush', async () => {
        await setup()
        audioEngine.setGeneratedSounds.mockClear()

        knob('masterVolume').setValue(0.3, true)
        knob('masterVolume').setValue(0.5, true)
        knob('filter.freq').setValue(1200, true)
        expect(audioEngine.setGeneratedSounds).not.toHaveBeenCalled()

        editor.flushPreview()
        expect(audioEngine.setGeneratedSounds).toHaveBeenCalledTimes(1)
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.5)
        expect(soundRegistry.generatedSounds.BASS1.filter.freq).toBe(1200)
    })

    it('commits on the next animation frame without an explicit flush', async () => {
        await setup()
        knob('masterVolume').setValue(0.61, true)
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.8)

        await new Promise((resolve) => requestAnimationFrame(resolve))
        await new Promise((resolve) => requestAnimationFrame(resolve))
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.61)
    })

    it('clicks still commit synchronously (power button)', async () => {
        await setup()
        const filterBtn = editor.panel.querySelector('[data-power-card="filter"]')
        filterBtn.click()

        expect(soundRegistry.generatedSounds.BASS1.bypassFilter).toBe(true)
    })

    it('flushes a pending preview before switching preset', async () => {
        await setup()
        soundRegistry.generatedSounds = { ALPHA: makeSound(), BETA: makeSound() }
        editor.model.editKey = 'ALPHA'
        editor.model.original = structuredClone(soundRegistry.generatedSounds.ALPHA)
        editor.model.draft = structuredClone(soundRegistry.generatedSounds.ALPHA)
        editor.model.hydrate()

        knob('masterVolume').setValue(0.11, true)
        editor.presets.selectPreset('BETA')

        expect(soundRegistry.generatedSounds.ALPHA.masterVolume).toBe(0.11)
        expect(editor.model.editKey).toBe('BETA')
    })
})
