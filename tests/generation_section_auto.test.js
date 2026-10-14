/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import GenerationSection from '../src/ui/track_editor/generation_section.js'
import { GEN_ENGINE_PROPS, GEN_GROOVE_PROPS, GROUPS } from '../src/ui/track_editor/track_editor_constants.js'

function makeEditor(track) {
    return {
        track,
        selectedPropKey: null,
        serviceRegistry: { cmd: null },
        playbackEvents: { batch: (fn) => fn(), emit: vi.fn() },
    }
}

function mountSection(track) {
    const section = new GenerationSection(makeEditor(track))
    const container = document.createElement('div')
    section.mount(container)
    section.sync(track)
    return { section, container }
}

const hidden = (el) => el.classList.contains('gen-auto-hidden')

const row = (container, key) => container.querySelector(`[data-prop="${key}"]`)
const panel = (container, id) => container.querySelector(`[data-gen-panel="${id}"]`)
const bar = (container) => container.querySelector('.te-subtabs')

describe('GenerationSection — Groove/Engine vs the Auto switch', () => {
    it('auto ON: Groove and Engine appear, the manual props disappear', () => {
        const { container } = mountSection({ name: 'KICK', auto: true })

        expect(hidden(bar(container))).toBe(false)
        expect(hidden(panel(container, 'groove'))).toBe(false)
        expect(hidden(panel(container, 'engine'))).toBe(false)

        for (const key of ['variation', 'variation2', 'probability']) {
            expect(hidden(row(container, key))).toBe(true)
        }
        // The switch itself must stay reachable, or auto can never be turned off.
        expect(hidden(row(container, 'auto'))).toBe(false)
    })

    it('auto OFF: the manual props appear, Groove and Engine disappear', () => {
        const { container } = mountSection({ name: 'KICK', auto: false })

        expect(hidden(bar(container))).toBe(true)
        expect(hidden(panel(container, 'groove'))).toBe(true)
        expect(hidden(panel(container, 'engine'))).toBe(true)

        for (const key of ['auto', 'variation', 'variation2', 'probability']) {
            expect(hidden(row(container, key))).toBe(false)
        }
    })

    it('flips both ways across successive syncs', () => {
        const track = { name: 'KICK', auto: false }
        const { section, container } = mountSection(track)

        track.auto = true
        section.sync(track)
        expect(hidden(panel(container, 'engine'))).toBe(false)
        expect(hidden(row(container, 'variation'))).toBe(true)

        track.auto = false
        section.sync(track)
        expect(hidden(panel(container, 'engine'))).toBe(true)
        expect(hidden(row(container, 'variation'))).toBe(false)
    })

    it('does not row-gate the Groove/Engine props — they ride their panel', () => {
        const { container } = mountSection({ name: 'KICK', auto: true })

        for (const key of ['prob_pitch', 'prob_retrig', 'auto_variant', 'auto_density']) {
            expect(hidden(row(container, key))).toBe(false)
        }
    })

    it('keeps OrTab in charge of which Groove/Engine panel is active', () => {
        const track = { name: 'KICK', auto: true }
        const { section, container } = mountSection(track)

        section.subTab.setActive('engine')
        section.sync(track)

        expect(panel(container, 'groove').classList.contains('gen-tab-panel-hidden')).toBe(true)
        expect(hidden(panel(container, 'groove'))).toBe(false)
        expect(panel(container, 'engine').classList.contains('gen-tab-panel-hidden')).toBe(false)
        expect(hidden(panel(container, 'engine'))).toBe(false)
    })

    it('keeps the hidden values on the track across an off/on cycle', () => {
        const track = { name: 'KICK', auto: true, auto_variant: 'roll', auto_density: 0.75 }
        const { section, container } = mountSection(track)

        track.auto = false
        section.sync(track)
        expect(track.auto_variant).toBe('roll')
        expect(track.auto_density).toBe(0.75)

        track.auto = true
        section.sync(track)
        expect(row(container, 'auto_variant').querySelector('select').value).toBe('roll')
        expect(hidden(row(container, 'auto_variant'))).toBe(false)
    })
})

describe('GenerationSection — one label per row', () => {
    // OrSlider draws its own <label> inside its row, unlike OrKnob used by the
    // other sections: a label on the outer row as well prints the name twice.
    const expectOneLabel = (container, props) => {
        for (const p of props) {
            const outer = container.querySelectorAll(`[data-prop="${p.key}"]`)[0]
            const labels = outer.querySelectorAll('label')
            expect(labels.length, `${p.key} label count`).toBe(1)
            expect(labels[0].textContent, `${p.key} label text`).toBe(p.label)
        }
    }

    it('slider, boolean and select rows all print their name once', () => {
        const { container } = mountSection({ name: 'KICK', auto: true })
        expectOneLabel(container, [...GROUPS[0].props, ...GEN_GROOVE_PROPS, ...GEN_ENGINE_PROPS])
    })

    it('the manual rows print their name once too', () => {
        const { container } = mountSection({ name: 'KICK', auto: false })
        expectOneLabel(container, GROUPS[0].props)
    })
})
