import { makeAppStateMock } from './helpers/app_state_mock.js'
/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import ViewSwitch from '../src/ui/toolbar/view_switch.js'

vi.mock('../src/state/event_bus.js', () => ({
    playbackEvents: {
        emit: vi.fn(),
        batch: vi.fn((fn) => fn()),
    },
}))

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        history: { undo: vi.fn(), redo: vi.fn() },
        cmd: { beginGenerationUndo: vi.fn(), commitGenerationUndo: vi.fn(), cancelGenerationUndo: vi.fn() },
        patterns: {},
    },
}))

vi.mock('../src/state/app_state.js', () => ({
    appState: makeAppStateMock({ patterns: [{ tracks: [] }] }),
}))

import { playbackEvents } from '../src/state/event_bus.js'
import { serviceRegistry } from '../src/state/service_registry.js'

describe('ViewSwitch', () => {
    let vs

    beforeEach(() => {
        vi.clearAllMocks()
        vs = new ViewSwitch()
    })

    describe('createDOM()', () => {
        it('creates gen group with correct class and label', () => {
            const { genWrap } = vs.createDOM()
            // toBeDefined() would pass for null; the className below is the real check
            expect(genWrap).not.toBeNull()
            expect(genWrap.className).toBe('tb-group tb-gen-group')
            const label = genWrap.querySelector('.tb-label')
            expect(label.textContent).toBe('Generation')
        })

        it('creates drumBtn with correct attributes', () => {
            vs.createDOM()
            expect(vs.drumBtn.className).toBe('tb-view-btn tb-gen-btn')
            expect(vs.drumBtn.dataset.gen).toBe('drum')
            expect(vs.drumBtn.textContent).toBe('↻ Drum')
            expect(vs.drumBtn.title).toBe('Generate drum pattern')
        })

        it('creates bassBtn with correct attributes', () => {
            vs.createDOM()
            expect(vs.bassBtn.className).toBe('tb-view-btn tb-gen-btn')
            expect(vs.bassBtn.dataset.gen).toBe('bass')
            expect(vs.bassBtn.textContent).toBe('↻ Bass')
            expect(vs.bassBtn.title).toBe('Generate bass line')
        })

        it('creates chordsBtn with correct attributes', () => {
            vs.createDOM()
            expect(vs.chordsBtn.className).toBe('tb-view-btn tb-gen-btn')
            expect(vs.chordsBtn.dataset.gen).toBe('chords')
            expect(vs.chordsBtn.textContent).toBe('↻ Chords')
            expect(vs.chordsBtn.title).toBe('Generate chords')
        })

        it('creates undo group with correct class and label', () => {
            const { undoWrap } = vs.createDOM()
            // toBeDefined() would pass for null; the className below is the real check
            expect(undoWrap).not.toBeNull()
            expect(undoWrap.className).toBe('tb-group tb-undo-group tb-hide-mobile')
            const label = undoWrap.querySelector('.tb-label')
            expect(label.textContent).toBe('History')
        })

        it('creates undoBtn initially disabled', () => {
            vs.createDOM()
            expect(vs.undoBtn.disabled).toBe(true)
            expect(vs.undoBtn.className).toBe('tb-undo-btn')
            expect(vs.undoBtn.textContent).toBe('↶')
            expect(vs.undoBtn.title).toBe('Undo (Ctrl+Z)')
        })

        it('creates redoBtn initially disabled', () => {
            vs.createDOM()
            expect(vs.redoBtn.disabled).toBe(true)
            expect(vs.redoBtn.className).toBe('tb-undo-btn')
            expect(vs.redoBtn.textContent).toBe('↷')
            expect(vs.redoBtn.title).toBe('Redo (Ctrl+Y)')
        })

        it('creates view group with correct class and label', () => {
            const { viewWrap } = vs.createDOM()
            // toBeDefined() would pass for null; the className below is the real check
            expect(viewWrap).not.toBeNull()
            expect(viewWrap.className).toBe('tb-group tb-hide-mobile')
            const label = viewWrap.querySelector('.tb-label')
            expect(label.textContent).toBe('View')
        })

        it('creates synthBtn with correct attributes', () => {
            vs.createDOM()
            expect(vs.synthBtn.className).toBe('tb-view-btn')
            expect(vs.synthBtn.dataset.view).toBe('synth')
            expect(vs.synthBtn.textContent).toBe('Synth')
            expect(vs.synthBtn.title).toBe('Toggle Soft Synth')
        })

        it('creates editBtn with correct attributes', () => {
            vs.createDOM()
            expect(vs.editBtn.className).toBe('tb-view-btn')
            expect(vs.editBtn.dataset.view).toBe('edit')
            expect(vs.editBtn.textContent).toBe('Grid')
            expect(vs.editBtn.title).toBe('Toggle Track Editor')
        })

        it('creates prollBtn with correct attributes', () => {
            vs.createDOM()
            expect(vs.prollBtn.className).toBe('tb-view-btn')
            expect(vs.prollBtn.dataset.view).toBe('proll')
            expect(vs.prollBtn.textContent).toBe('proll')
            expect(vs.prollBtn.title).toBe('Toggle Proll')
        })

        it('returns all three wrapper elements', () => {
            const result = vs.createDOM()
            expect(result).toHaveProperty('genWrap')
            expect(result).toHaveProperty('undoWrap')
            expect(result).toHaveProperty('viewWrap')
        })
    })

    describe('bindEvents() view buttons', () => {
        beforeEach(() => {
            vs.createDOM()
            vs.bindEvents()
        })

        it('emits synthToggle on synthBtn click', () => {
            vs.synthBtn.click()
            expect(playbackEvents.emit).toHaveBeenCalledWith('synthToggle')
        })

        it('emits editToggle on editBtn click', () => {
            vs.editBtn.click()
            expect(playbackEvents.emit).toHaveBeenCalledWith('editToggle')
        })

        it('emits prollToggle on prollBtn click', () => {
            vs.prollBtn.click()
            expect(playbackEvents.emit).toHaveBeenCalledWith('prollToggle')
        })
    })

    describe('bindEvents() undo/redo', () => {
        beforeEach(() => {
            vs.createDOM()
            vs.bindEvents()
        })

        it('calls history.undo on undoBtn click', () => {
            vs.undoBtn.disabled = false
            vs.undoBtn.click()
            expect(serviceRegistry.history.undo).toHaveBeenCalled()
        })

        it('calls history.redo on redoBtn click', () => {
            vs.redoBtn.disabled = false
            vs.redoBtn.click()
            expect(serviceRegistry.history.redo).toHaveBeenCalled()
        })
    })

    // The orchestration these buttons used to carry (undo transaction,
    // generation, event batch) moved to logic/services/pattern_auto_gen.js
    // and is covered by tests/pattern_auto_gen.test.js — here we only pin
    // the wiring.
    describe('generation buttons delegate to patternAutoGen', () => {
        beforeEach(() => {
            vs.createDOM()
            vs.bindEvents()
        })

        it('wires ↻ Drum, ↻ Bass and ↻ Chords to the shared service', async () => {
            const patternAutoGen = (await import('../src/logic/services/pattern_auto_gen.js')).default
            const drums = vi.spyOn(patternAutoGen, 'toggleDrums').mockImplementation(async () => {})
            const melodic = vi.spyOn(patternAutoGen, 'toggleMelodic').mockImplementation(async () => {})
            try {
                vs.drumBtn.click()
                vs.bassBtn.click()
                vs.chordsBtn.click()

                expect(drums).toHaveBeenCalledTimes(1)
                expect(melodic).toHaveBeenNthCalledWith(1, 'BASS')
                expect(melodic).toHaveBeenNthCalledWith(2, 'PIANO')
            } finally {
                drums.mockRestore()
                melodic.mockRestore()
            }
        })
    })
})
