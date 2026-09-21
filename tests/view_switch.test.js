/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import ViewSwitch from '../src/ui/toolbar/view_switch.js'

vi.mock('../src/state/playback_events.js', () => ({
    playbackEvents: {
        emit: vi.fn(),
        batch: vi.fn(fn => fn())
    }
}))

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        history: { undo: vi.fn(), redo: vi.fn() },
        cmd: { beginGenerationUndo: vi.fn(), commitGenerationUndo: vi.fn() },
        patterns: {}
    }
}))

vi.mock('../src/state/app_state.js', () => ({
    appState: {
        patterns: [{ tracks: [] }],
        selectedPatternNum: 0
    }
}))

vi.mock('../src/core/utils.js', () => ({
    default: {
        DRUM_TYPES: new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC']),
        detectTrackType: vi.fn(name => {
            const n = (name ?? '').toUpperCase()
            if (n.includes('KICK') || n.includes('BD')) return 'KICK'
            if (n.includes('SNARE') || n.includes('SD')) return 'SNARE'
            if (n.includes('OHH') || n.includes('HAT') || n.includes('CHH')) return 'HAT'
            if (n.includes('CLAP') || n.includes('CLP') || n.includes('CP')) return 'CLAP'
            if (n.includes('BASS')) return 'BASS'
            if (n.includes('PIANO')) return 'PIANO'
            if (n.includes('COWBELL') || n.includes('COW')) return 'COWBELL'
            if (n.includes('ORGAN')) return 'ORGAN'
            if (n.includes('SYNTH')) return 'BASS'
            return 'PERC'
        }),
        filterEmptyMelodicTracks: vi.fn(tracks => tracks)
    }
}))

vi.mock('../src/state/service_loader.js', () => ({
    getAutoGenerateService: vi.fn()
}))

import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { appState } from '../src/state/app_state.js'
import { getAutoGenerateService } from '../src/state/service_loader.js'
import Utils from '../src/core/utils.js'

function makeMockToolbar() {
    return {
        drumBtn: null,
        bassBtn: null,
        chordsBtn: null,
        undoBtn: null,
        redoBtn: null,
        synthBtn: null,
        editBtn: null,
        prollBtn: null
    }
}

describe('ViewSwitch', () => {
    let tb, vs

    beforeEach(() => {
        vi.clearAllMocks()
        tb = makeMockToolbar()
        vs = new ViewSwitch(tb)
    })

    describe('createDOM()', () => {
        it('creates gen group with correct class and label', () => {
            const { genWrap } = vs.createDOM()
            expect(genWrap).toBeDefined()
            expect(genWrap.className).toBe('tb-group tb-gen-group')
            const label = genWrap.querySelector('.tb-label')
            expect(label.textContent).toBe('Generation')
        })

        it('creates drumBtn with correct attributes', () => {
            vs.createDOM()
            expect(tb.drumBtn.className).toBe('tb-view-btn tb-gen-btn')
            expect(tb.drumBtn.dataset.gen).toBe('drum')
            expect(tb.drumBtn.textContent).toBe('↻ Drum')
            expect(tb.drumBtn.title).toBe('Generate drum pattern')
        })

        it('creates bassBtn with correct attributes', () => {
            vs.createDOM()
            expect(tb.bassBtn.className).toBe('tb-view-btn tb-gen-btn')
            expect(tb.bassBtn.dataset.gen).toBe('bass')
            expect(tb.bassBtn.textContent).toBe('↻ Bass')
            expect(tb.bassBtn.title).toBe('Generate bass line')
        })

        it('creates chordsBtn with correct attributes', () => {
            vs.createDOM()
            expect(tb.chordsBtn.className).toBe('tb-view-btn tb-gen-btn')
            expect(tb.chordsBtn.dataset.gen).toBe('chords')
            expect(tb.chordsBtn.textContent).toBe('↻ Chords')
            expect(tb.chordsBtn.title).toBe('Generate chords')
        })

        it('creates undo group with correct class and label', () => {
            const { undoWrap } = vs.createDOM()
            expect(undoWrap).toBeDefined()
            expect(undoWrap.className).toBe('tb-group tb-undo-group tb-hide-mobile')
            const label = undoWrap.querySelector('.tb-label')
            expect(label.textContent).toBe('History')
        })

        it('creates undoBtn initially disabled', () => {
            vs.createDOM()
            expect(tb.undoBtn.disabled).toBe(true)
            expect(tb.undoBtn.className).toBe('tb-undo-btn')
            expect(tb.undoBtn.textContent).toBe('↶')
            expect(tb.undoBtn.title).toBe('Undo (Ctrl+Z)')
        })

        it('creates redoBtn initially disabled', () => {
            vs.createDOM()
            expect(tb.redoBtn.disabled).toBe(true)
            expect(tb.redoBtn.className).toBe('tb-undo-btn')
            expect(tb.redoBtn.textContent).toBe('↷')
            expect(tb.redoBtn.title).toBe('Redo (Ctrl+Y)')
        })

        it('creates view group with correct class and label', () => {
            const { viewWrap } = vs.createDOM()
            expect(viewWrap).toBeDefined()
            expect(viewWrap.className).toBe('tb-group tb-hide-mobile')
            const label = viewWrap.querySelector('.tb-label')
            expect(label.textContent).toBe('View')
        })

        it('creates synthBtn with correct attributes', () => {
            vs.createDOM()
            expect(tb.synthBtn.className).toBe('tb-view-btn')
            expect(tb.synthBtn.dataset.view).toBe('synth')
            expect(tb.synthBtn.textContent).toBe('Synth')
            expect(tb.synthBtn.title).toBe('Toggle Soft Synth')
        })

        it('creates editBtn with correct attributes', () => {
            vs.createDOM()
            expect(tb.editBtn.className).toBe('tb-view-btn')
            expect(tb.editBtn.dataset.view).toBe('edit')
            expect(tb.editBtn.textContent).toBe('Grid')
            expect(tb.editBtn.title).toBe('Toggle Track Editor')
        })

        it('creates prollBtn with correct attributes', () => {
            vs.createDOM()
            expect(tb.prollBtn.className).toBe('tb-view-btn')
            expect(tb.prollBtn.dataset.view).toBe('proll')
            expect(tb.prollBtn.textContent).toBe('proll')
            expect(tb.prollBtn.title).toBe('Toggle Proll')
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
            tb.synthBtn.click()
            expect(playbackEvents.emit).toHaveBeenCalledWith('synthToggle')
        })

        it('emits editToggle on editBtn click', () => {
            tb.editBtn.click()
            expect(playbackEvents.emit).toHaveBeenCalledWith('editToggle')
        })

        it('emits prollToggle on prollBtn click', () => {
            tb.prollBtn.click()
            expect(playbackEvents.emit).toHaveBeenCalledWith('prollToggle')
        })
    })

    describe('bindEvents() undo/redo', () => {
        beforeEach(() => {
            vs.createDOM()
            vs.bindEvents()
        })

        it('calls history.undo on undoBtn click', () => {
            tb.undoBtn.disabled = false
            tb.undoBtn.click()
            expect(serviceRegistry.history.undo).toHaveBeenCalled()
        })

        it('calls history.redo on redoBtn click', () => {
            tb.redoBtn.disabled = false
            tb.redoBtn.click()
            expect(serviceRegistry.history.redo).toHaveBeenCalled()
        })
    })

    describe('_toggleAutoGen()', () => {
        beforeEach(() => {
            vs.createDOM()
            vs.bindEvents()
        })

        it('toggle-off: sets auto=false and _toolbarAuto=false when _toolbarAuto tracks exist', async () => {
            const track1 = { name: 'KICK', auto: true, _toolbarAuto: true }
            const track2 = { name: 'SNARE', auto: true, _toolbarAuto: true }
            const track3 = { name: 'BASS', auto: true, _toolbarAuto: true }
            appState.patterns = [{ tracks: [track1, track2, track3] }]
            appState.selectedPatternNum = 0

            await vs._toggleAutoGen(Utils.DRUM_TYPES, vi.fn())

            expect(track1.auto).toBe(false)
            expect(track1._toolbarAuto).toBe(false)
            expect(track2.auto).toBe(false)
            expect(track2._toolbarAuto).toBe(false)
            expect(track3.auto).toBe(true)
            expect(track3._toolbarAuto).toBe(true)
            expect(playbackEvents.batch).toHaveBeenCalled()
        })

        it('toggle-off: handles empty tracks array', async () => {
            appState.patterns = [{ tracks: [] }]
            appState.selectedPatternNum = 0
            const generateFn = vi.fn()

            await vs._toggleAutoGen(Utils.DRUM_TYPES, generateFn)

            expect(generateFn).toHaveBeenCalled()
        })

        it('toggle-on: imports service_loader and calls generateFn when no _toolbarAuto tracks', async () => {
            appState.patterns = [{ tracks: [] }]
            appState.selectedPatternNum = 0
            const generateFn = vi.fn()
            const mockAutoGen = { structureGen: {} }
            getAutoGenerateService.mockResolvedValue(mockAutoGen)

            await vs._toggleAutoGen(Utils.DRUM_TYPES, generateFn)

            expect(getAutoGenerateService).toHaveBeenCalled()
            expect(generateFn).toHaveBeenCalledWith(appState.patterns[0], mockAutoGen)
        })

        it('toggle-on: converts string type to Set', async () => {
            appState.patterns = [{ tracks: [] }]
            appState.selectedPatternNum = 0
            const generateFn = vi.fn()
            const mockAutoGen = {}
            getAutoGenerateService.mockResolvedValue(mockAutoGen)

            await vs._toggleAutoGen('BASS', generateFn)

            expect(generateFn).toHaveBeenCalledWith(appState.patterns[0], mockAutoGen)
        })

        it('toggle-on: converts array type to Set', async () => {
            appState.patterns = [{ tracks: [] }]
            appState.selectedPatternNum = 0
            const generateFn = vi.fn()
            const mockAutoGen = {}
            getAutoGenerateService.mockResolvedValue(mockAutoGen)

            await vs._toggleAutoGen(['BASS', 'PIANO'], generateFn)

            expect(generateFn).toHaveBeenCalledWith(appState.patterns[0], mockAutoGen)
        })

        it('returns early when pattern is undefined', async () => {
            appState.patterns = []
            appState.selectedPatternNum = 5
            const generateFn = vi.fn()

            await vs._toggleAutoGen(Utils.DRUM_TYPES, generateFn)

            expect(generateFn).not.toHaveBeenCalled()
        })

        it('toggle-off: only toggles matching type tracks when mixed types exist', async () => {
            const drumTrack = { name: 'HAT', auto: true, _toolbarAuto: true }
            const bassTrack = { name: 'BASS1', auto: true, _toolbarAuto: true }
            appState.patterns = [{ tracks: [drumTrack, bassTrack] }]
            appState.selectedPatternNum = 0

            await vs._toggleAutoGen(Utils.DRUM_TYPES, vi.fn())

            expect(drumTrack.auto).toBe(false)
            expect(drumTrack._toolbarAuto).toBe(false)
            expect(bassTrack.auto).toBe(true)
            expect(bassTrack._toolbarAuto).toBe(true)
        })
    })
})
