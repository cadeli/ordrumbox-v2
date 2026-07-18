// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import NoteEditor from '../src/ui/note_editor.js'

function fireInput(el, value) {
    el.value = String(value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function showNote(ne, overrides = {}) {
    const note = {
        beat: 0, beatStep: 0,
        velocity: 1, pitch: 0, pan: 0,
        every: 1, pos: 0, prob: 1,
        euclidianFill: 0,
        retriggerNum: 1, rate: 1,
        arpRange: 0, arpTriggerProbability: 1,
        ...overrides,
    }
    const track = { name: 'SNARE', notes: [note], nbBeats: 1, stepsPerBeat: 4 }
    await ne.show({ track, note, pos: 0, beat: 0, beatStep: 0 })
    return { note, track }
}

describe('NoteEditor — OrSlider integration', () => {
    let noteEditor

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
            'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: {} }
        }
        serviceRegistry.mfCmd = { changeTrackSound: vi.fn() }

        document.body.innerHTML = ''

        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({
                major:    { scaleSteps: [0, 2, 4, 5, 7, 9, 11] },
                minor:    { scaleSteps: [0, 2, 3, 5, 7, 8, 10] },
                pentaton: { scaleSteps: [0, 3, 5, 7, 10] },
            })
        })

        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn(),
            putImageData: vi.fn(), createImageData: vi.fn(), setTransform: vi.fn(),
            drawImage: vi.fn(), save: vi.fn(), fillText: vi.fn(), restore: vi.fn(),
            beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
            stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
            arc: vi.fn(), fill: vi.fn(), measureText: vi.fn().mockReturnValue({ width: 0 }),
            transform: vi.fn(), rect: vi.fn(), clip: vi.fn()
        })

        noteEditor = new NoteEditor()
        noteEditor.init()
    })

    it('renders a range slider + display span for each velocity/pitch/pan prop', async () => {
        await showNote(noteEditor)

        for (const p of [
            { key: 'velocity', label: 'Vel' },
            { key: 'pitch',    label: 'Pitch' },
            { key: 'pan',      label: 'Pan' },
        ]) {
            const input = noteEditor.container.querySelector(`input[data-key="${p.key}"]`)
            const span  = noteEditor.container.querySelector(`.ne-val[data-key="${p.key}"]`)
            expect(input, `missing input for ${p.key}`).not.toBeNull()
            expect(span, `missing span for ${p.key}`).not.toBeNull()
            const row = input.closest('.ne-row')
            expect(row.querySelector('label').textContent).toBe(p.label)
            expect(input.type).toBe('range')
        }
    })

    it('renders a range slider for each trigger/retrig/arpRange prop', async () => {
        await showNote(noteEditor)

        for (const key of [
            'every', 'pos', 'prob', 'euclidianFill',
            'retriggerNum', 'rate',
            'arpRange', 'arpTriggerProbability',
        ]) {
            const input = noteEditor.container.querySelector(`input[data-key="${key}"]`)
            expect(input, `missing input for ${key}`).not.toBeNull()
        }
    })

    it('displays the initial value using the rounded 2-decimal format', async () => {
        await showNote(noteEditor, { velocity: 0.625, pan: -0.3 })

        const velocitySpan = noteEditor.container.querySelector(`.ne-val[data-key="velocity"]`)
        const panSpan      = noteEditor.container.querySelector(`.ne-val[data-key="pan"]`)
        expect(velocitySpan.textContent).toBe('0.63')
        expect(panSpan.textContent).toBe('-0.3')
    })

    it('keeps integer and select props as native <select> (not sliders)', async () => {
        await showNote(noteEditor)

        const arpScale = noteEditor.container.querySelector('select[data-key="arpScale"]')
        const arpType  = noteEditor.container.querySelector('select[data-key="arpType"]')
        expect(arpScale).not.toBeNull()
        expect(arpType).not.toBeNull()
        expect(arpScale.tagName).toBe('SELECT')
        expect(arpType.tagName).toBe('SELECT')

        // No range inputs for these keys
        expect(noteEditor.container.querySelector('input[type=range][data-key="arpScale"]')).toBeNull()
        expect(noteEditor.container.querySelector('input[type=range][data-key="arpType"]')).toBeNull()
    })

    it('changing a slider updates the note and fires onPatternChange', async () => {
        const { note } = await showNote(noteEditor)
        const fn = vi.fn()
        playbackEvents.onPatternChange.push(fn)

        const velocityInput = noteEditor.container.querySelector('input[data-key="velocity"]')
        fireInput(velocityInput, 0.42)

        expect(note.velocity).toBeCloseTo(0.42, 5)
        expect(velocityInput.nextElementSibling.textContent).toBe('0.42')
        expect(fn).toHaveBeenCalled()
    })

    it('changing arpRange recomposes note.arp (intervals + mode)', async () => {
        const { note } = await showNote(noteEditor, { arpRange: 0, arp: null })

        expect(note.arp).toBeNull()

        const arpRangeInput = noteEditor.container.querySelector('input[data-key="arpRange"]')
        fireInput(arpRangeInput, 3)

        // Range 3 on the first scale (major) → [0, 2, 4]
        expect(note.arp).toEqual({ intervals: [0, 2, 4], mode: 'up' })

        fireInput(arpRangeInput, 0)
        expect(note.arp).toBeNull()
    })

    it('selecting an arp scale updates _arpScale and recomposes arp', async () => {
        const { note } = await showNote(noteEditor, { arpRange: 2 })

        const arpScale = noteEditor.container.querySelector('select[data-key="arpScale"]')
        arpScale.value = 'minor'
        arpScale.dispatchEvent(new Event('change', { bubbles: true }))

        expect(note._arpScale).toBe('minor')
        // Range 2 on minor scale → [0, 2]
        expect(note.arp).toEqual({ intervals: [0, 2], mode: 'up' })
    })

    it('re-sync destroys old OrSliders (no leaked listeners) and renders new ones', async () => {
        await showNote(noteEditor, { velocity: 0.5 })
        const firstVelocityInput = noteEditor.container.querySelector('input[data-key="velocity"]')

        await showNote(noteEditor, { velocity: 0.9 })
        const secondVelocityInput = noteEditor.container.querySelector('input[data-key="velocity"]')

        // Different DOM node
        expect(secondVelocityInput).not.toBe(firstVelocityInput)
        expect(secondVelocityInput.value).toBe('0.9')
        expect(secondVelocityInput.nextElementSibling.textContent).toBe('0.9')
    })

    it('keyboard arrow on a slider updates its value (OrSlider _onKeydown)', async () => {
        const { note } = await showNote(noteEditor, { velocity: 0.5 })

        const input = noteEditor.container.querySelector('input[data-key="velocity"]')
        input.focus()
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }))

        expect(note.velocity).toBeCloseTo(0.51, 5)
        expect(input.value).toBe('0.51')
    })
})
