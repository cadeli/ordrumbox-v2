/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SynthEditor from '../src/ui/synth_editor.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

const makeGeneratedSound = () => ({
    masterVolume: 0.8,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1, filterEnvelopeAmount: 0 },
    enveloppe: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 }
})

describe('SynthEditor sub-panel toolbar', () => {
    let editor
    let host
    let audioEngine

    beforeEach(() => {
        document.body.innerHTML = '<div id="app-content"><div id="pattern-panel"></div><div id="te-panel"></div></div>'
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
        // Attach panel to app-content
        document.getElementById('app-content').appendChild(editor.panel)
    })

    it('renders one block per synth group with bypass button', async () => {
        await editor.openEditor()

        const blocks = Array.from(document.querySelectorAll('#soft-synth-panel [data-ss-card]'))
        expect(blocks.map(b => b.dataset.ssCard)).toEqual([
            'master',
            'vco1',
            'vco2',
            'vco3',
            'filter',
            'fm',
            'lfo',
            'lfo2',
            'noise',
            'enveloppe'
        ])

        const bypassBtns = document.querySelectorAll('#soft-synth-panel .ss-bypass-btn[data-power-card]')
        expect(bypassBtns.length).toBe(blocks.length)

        const masterBlock = document.querySelector('#soft-synth-panel [data-ss-card="master"]')
        const masterBtn = masterBlock.querySelector('.ss-bypass-btn')
        expect(masterBtn.classList.contains('active')).toBe(true)

        masterBtn.click()
        expect(masterBtn.classList.contains('active')).toBe(false)
        expect(masterBlock.classList.contains('bypassed')).toBe(true)
    })

it('keeps Revert in the toolbar and preserves revert behavior', async () => {
         await editor.openEditor()

         const panel = document.querySelector('#soft-synth-panel')
         const revertButton = panel.querySelector('[data-action="synth-revert"]')
         expect(revertButton).not.toBeNull()

         const masterKnob = editor._knobs.find(k => k._key === 'masterVolume')
         masterKnob.setValue(0.25, true)
         expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.25)

         revertButton.click()
         expect(document.getElementById('soft-synth-panel').style.display).toBe('flex')
         expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.8)
     })

    it('sets bypassFilter flag on draft when toggling filter bypass', async () => {
        await editor.openEditor()

        const filterCard = document.querySelector('#soft-synth-panel [data-ss-card="filter"]')
        const filterBtn = filterCard.querySelector('.ss-bypass-btn')

        expect(editor._draft.bypassFilter).toBeFalsy()
        filterBtn.click()
        expect(editor._draft.bypassFilter).toBe(true)
        expect(filterCard.classList.contains('bypassed')).toBe(true)

        filterBtn.click()
        expect(editor._draft.bypassFilter).toBe(false)
        expect(filterCard.classList.contains('bypassed')).toBe(false)
    })

    it('sets bypassEnv flag on draft when toggling envelope bypass', async () => {
        await editor.openEditor()

        const envCard = document.querySelector('#soft-synth-panel [data-ss-card="enveloppe"]')
        const envBtn = envCard.querySelector('.ss-bypass-btn')

        expect(editor._draft.bypassEnv).toBeFalsy()
        envBtn.click()
        expect(editor._draft.bypassEnv).toBe(true)

        envBtn.click()
        expect(editor._draft.bypassEnv).toBe(false)
    })

    it('sets bypassNoise flag on draft when toggling noise bypass', async () => {
        await editor.openEditor()

        const noiseCard = document.querySelector('#soft-synth-panel [data-ss-card="noise"]')
        const noiseBtn = noiseCard.querySelector('.ss-bypass-btn')

        expect(editor._draft.bypassNoise).toBeFalsy()
        noiseBtn.click()
        expect(editor._draft.bypassNoise).toBe(true)

        noiseBtn.click()
        expect(editor._draft.bypassNoise).toBe(false)
    })

    it('sets bypassLfo1 flag on draft when toggling lfo bypass', async () => {
        await editor.openEditor()

        const lfoCard = document.querySelector('#soft-synth-panel [data-ss-card="lfo"]')
        const lfoBtn = lfoCard.querySelector('.ss-bypass-btn')

        expect(editor._draft.bypassLfo1).toBeFalsy()
        lfoBtn.click()
        expect(editor._draft.bypassLfo1).toBe(true)

        lfoBtn.click()
        expect(editor._draft.bypassLfo1).toBe(false)
    })

    it('sets bypassFm flag on draft when toggling fm bypass', async () => {
        await editor.openEditor()

        const fmCard = document.querySelector('#soft-synth-panel [data-ss-card="fm"]')
        const fmBtn = fmCard.querySelector('.ss-bypass-btn')

        expect(editor._draft.bypassFm).toBeFalsy()
        fmBtn.click()
        expect(editor._draft.bypassFm).toBe(true)

        fmBtn.click()
        expect(editor._draft.bypassFm).toBe(false)
    })

    it('VCO bypass saves/restores gain (not a bypass flag)', async () => {
        await editor.openEditor()

        expect(editor._draft.vco1.gain).toBe(1)
        const vco1Card = document.querySelector('#soft-synth-panel [data-ss-card="vco1"]')
        const vco1Btn = vco1Card.querySelector('.ss-bypass-btn')

        vco1Btn.click()
        expect(editor._draft.vco1.gain).toBe(0)
        expect(editor._draft.bypassVco1).toBeUndefined()

        vco1Btn.click()
        expect(editor._draft.vco1.gain).toBe(1)
    })

    it('propagates bypass flags to audioEngine via updateGeneratedSounds', async () => {
        await editor.openEditor()

        const filterCard = document.querySelector('#soft-synth-panel [data-ss-card="filter"]')
        const filterBtn = filterCard.querySelector('.ss-bypass-btn')

        audioEngine.updateGeneratedSounds.mockClear()
        filterBtn.click()
        expect(audioEngine.updateGeneratedSounds).toHaveBeenCalled()
        const committed = audioEngine.updateGeneratedSounds.mock.calls[0][0]
        expect(committed.BASS1.bypassFilter).toBe(true)
    })
})
