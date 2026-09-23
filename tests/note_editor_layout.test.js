// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import NoteEditor from '../src/ui/note_editor.js'

async function showNote(ne, overrides = {}) {
    const note = {
        beat: 0,
        beatStep: 0,
        velocity: 1,
        pitch: 0,
        pan: 0,
        every: 1,
        pos: 0,
        prob: 1,
        euclidianFill: 0,
        retriggerNum: 1,
        rate: 1,
        arpRange: 0,
        arpTriggerProbability: 1,
        ...overrides,
    }
    const track = { name: 'SNARE', notes: [note], nbBeats: 1, stepsPerBeat: 4 }
    await ne.show({ track, note, pos: 0, beat: 0, beatStep: 0 })
    return { note, track }
}

describe('NoteEditor — knob bar layout', () => {
    let noteEditor

    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        soundRegistry.drumkitList = [{ name: 'real', instruments: [{ key: 'KICK', url: 'real/kick.wav' }] }]
        soundRegistry.sounds = {
            'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: {} },
        }
        serviceRegistry.cmd = { changeTrackSound: vi.fn() }

        document.body.innerHTML = ''

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        })

        noteEditor = new NoteEditor()
        noteEditor.init()
    })

    it('knob bar uses ne-knob-bar class (flex-row in CSS)', async () => {
        await showNote(noteEditor)

        const knobBar = noteEditor.container.querySelector('.ne-knob-bar')
        expect(knobBar).not.toBeNull()

        expect(knobBar.classList.contains('ne-knob-bar')).toBe(true)
        expect(knobBar.classList.contains('or-knob-bar')).toBe(false)
    })

    it('knob bar contains exactly 3 knob placeholders (velocity, pitch, pan)', async () => {
        await showNote(noteEditor)

        const knobBar = noteEditor.container.querySelector('.ne-knob-bar')
        expect(knobBar).not.toBeNull()

        const knobs = knobBar.querySelectorAll('[data-or-knob]')
        expect(knobs.length).toBe(3)

        const keys = [...knobs].map((k) => k.dataset.orKnob)
        expect(keys).toEqual(['velocity', 'pitch', 'pan'])
    })

    it('no orphan or-knob-bar class exists in the DOM', async () => {
        await showNote(noteEditor)

        const orphan = noteEditor.container.querySelector('.or-knob-bar')
        expect(orphan).toBeNull()
    })
})
