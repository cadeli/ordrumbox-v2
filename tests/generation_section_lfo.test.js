/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import GenerationSection from '../src/ui/track_editor/generation_section.js'

vi.mock('../src/ui/track_editor/track_editor_constants.js', async () => {
    const mod = await vi.importActual('../src/ui/track_editor/track_editor_constants.js')
    return {
        ...mod,
        GROUPS: [
            {
                label: 'Basic / Transport',
                props: [{ key: 'velocity', label: 'Vel', step: 0.01, lfoKey: 'velocityLfo' }],
            },
        ],
    }
})

function makeEditor(track) {
    return {
        track,
        sliders: new Map(),
        selectedPropKey: null,
        isDragging: false,
        serviceRegistry: { cmd: null },
        playbackEvents: { batch: (fn) => fn(), emit: vi.fn() },
    }
}

describe('GenerationSection — LFO indicator on existing sliders', () => {
    it('re-applies the LFO flag through setHasLfo on re-render', () => {
        const track = { name: 'LEAD', velocity: 0.8, velocityLfo: 0 }
        const editor = makeEditor(track)
        const section = new GenerationSection(editor)

        section.render()
        const slider = editor.sliders.get('velocity')
        expect(slider).toBeTruthy()
        expect(slider.toHTML()).not.toContain('has-lfo')

        track.velocityLfo = 4
        const setHasLfo = vi.spyOn(slider, 'setHasLfo')
        section.render()

        expect(setHasLfo).toHaveBeenCalledWith(true)
        expect('_hasLfo' in slider).toBe(false)
        expect(slider.toHTML()).toContain('has-lfo')
    })
})
