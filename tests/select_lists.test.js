// tests/select_lists.test.js
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/event_bus.js'
import { EVENTS } from '../src/core/events.js'
import {
    rebuildPatternSelect,
    rebuildDrumkitSelect,
    onPatternSelectChange,
    onDrumkitSelectChange,
} from '../src/ui/select_lists.js'

/** @returns {HTMLSelectElement} */
function makeSelect() {
    const select = document.createElement('select')
    document.body.appendChild(select)
    return select
}

/** @param {string} [name] @returns {{name?: string, beatCount: number, tracks: []}} */
function makePattern(name) {
    return name ? { name, beatCount: 4, tracks: [] } : { beatCount: 4, tracks: [] }
}

beforeEach(() => {
    document.body.innerHTML = ''
    appState.reset()
    serviceRegistry.reset()
    soundRegistry.reset()
    serviceRegistry.cmd = {
        setSelectedPatternIdx: vi.fn(),
        setSelectedDrumkitIdx: vi.fn(),
        resetPage: vi.fn(() => {
            appState.currentPage = 0
        }),
    }
})

afterEach(() => {
    playbackEvents.clearListeners()
})

describe('rebuildPatternSelect', () => {
    it('fills one option per pattern with its name', () => {
        appState.patterns = [makePattern('Alpha'), makePattern('Beta')]
        const select = makeSelect()
        rebuildPatternSelect(select)
        const opts = select.querySelectorAll('option')
        expect(opts.length).toBe(2)
        expect(opts[0].value).toBe('0')
        expect(opts[0].textContent).toBe('Alpha')
        expect(opts[1].textContent).toBe('Beta')
    })

    it('falls back to "Pattern N" when the pattern has no name', () => {
        appState.patterns = [makePattern()]
        const select = makeSelect()
        rebuildPatternSelect(select)
        expect(select.options[0].textContent).toBe('Pattern 0')
    })

    it('selects the current pattern index', () => {
        appState.patterns = [makePattern('P1'), makePattern('P2')]
        appState.selectedPatternIdx = 1
        const select = makeSelect()
        rebuildPatternSelect(select)
        expect(select.selectedIndex).toBe(1)
    })

    it('clamps an out-of-range index to the last option', () => {
        appState.patterns = [makePattern('P1'), makePattern('P2')]
        appState.selectedPatternIdx = 99
        const select = makeSelect()
        rebuildPatternSelect(select)
        expect(select.selectedIndex).toBe(1)
    })

    it('empties the select when there is no pattern', () => {
        appState.patterns = []
        const select = makeSelect()
        select.innerHTML = '<option>stale</option>'
        rebuildPatternSelect(select)
        expect(select.options.length).toBe(0)
    })

    it('keeps two instances in step when rebuilt from the same state', () => {
        appState.patterns = [makePattern('P1'), makePattern('P2'), makePattern('P3')]
        appState.selectedPatternIdx = 2
        const a = makeSelect()
        const b = makeSelect()
        rebuildPatternSelect(a)
        appState.selectedPatternIdx = 99
        rebuildPatternSelect(a)
        rebuildPatternSelect(b)
        expect(a.selectedIndex).toBe(b.selectedIndex)
        expect(a.selectedIndex).toBe(2)
    })
})

describe('rebuildDrumkitSelect', () => {
    it('fills one option per kit from soundRegistry.drumkitList', () => {
        soundRegistry.drumkitList = [
            { name: 'Kit A', instruments: [] },
            { name: 'Kit B', instruments: [] },
        ]
        appState.selectedDrumkitIdx = 1
        const select = makeSelect()
        rebuildDrumkitSelect(select)
        const opts = select.querySelectorAll('option')
        expect(opts.length).toBe(2)
        expect(opts[0].textContent).toBe('Kit A')
        expect(select.selectedIndex).toBe(1)
    })

    it('falls back to "Kit N" and clamps the index', () => {
        soundRegistry.drumkitList = [{ instruments: [] }, { name: 'Kit B', instruments: [] }]
        appState.selectedDrumkitIdx = 42
        const select = makeSelect()
        rebuildDrumkitSelect(select)
        expect(select.options[0].textContent).toBe('Kit 0')
        expect(select.selectedIndex).toBe(1)
    })
})

describe('onPatternSelectChange', () => {
    it('switches pattern, resets the page and emits META + CHANGE', () => {
        appState.patterns = [makePattern('P1'), makePattern('P2')]
        appState.selectedPatternIdx = 0
        appState.currentPage = 1
        const emitted = []
        playbackEvents.on(EVENTS.PATTERN_META_CHANGE, () => emitted.push(EVENTS.PATTERN_META_CHANGE))
        playbackEvents.on(EVENTS.PATTERN_CHANGE, () => emitted.push(EVENTS.PATTERN_CHANGE))

        const select = makeSelect()
        rebuildPatternSelect(select)
        select.value = '1'
        onPatternSelectChange(select)

        expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalledWith(1)
        expect(serviceRegistry.cmd.resetPage).toHaveBeenCalled()
        expect(appState.currentPage).toBe(0)
        expect(emitted).toContain(EVENTS.PATTERN_META_CHANGE)
        expect(emitted).toContain(EVENTS.PATTERN_CHANGE)
    })

    it('does not emit PATTERN_STRUCTURE_CHANGE (the list itself did not change)', () => {
        appState.patterns = [makePattern('P1'), makePattern('P2')]
        const structure = vi.fn()
        playbackEvents.on(EVENTS.PATTERN_STRUCTURE_CHANGE, structure)

        const select = makeSelect()
        rebuildPatternSelect(select)
        select.value = '1'
        onPatternSelectChange(select)

        expect(structure).not.toHaveBeenCalled()
    })

    it('ignores an invalid value without touching the command layer', () => {
        appState.patterns = [makePattern('P1')]
        const select = makeSelect()
        rebuildPatternSelect(select)
        select.value = ''
        onPatternSelectChange(select)

        expect(serviceRegistry.cmd.setSelectedPatternIdx).not.toHaveBeenCalled()
        expect(serviceRegistry.cmd.resetPage).not.toHaveBeenCalled()
    })
})

describe('onDrumkitSelectChange', () => {
    it('forwards the picked index to cmd.setSelectedDrumkitIdx', () => {
        soundRegistry.drumkitList = [
            { name: 'Kit A', instruments: [] },
            { name: 'Kit B', instruments: [] },
        ]
        appState.selectedDrumkitIdx = 0
        const select = makeSelect()
        rebuildDrumkitSelect(select)
        select.value = '1'
        onDrumkitSelectChange(select)

        expect(serviceRegistry.cmd.setSelectedDrumkitIdx).toHaveBeenCalledWith(1)
    })

    it('ignores an invalid value', () => {
        const select = makeSelect()
        onDrumkitSelectChange(select)
        expect(serviceRegistry.cmd.setSelectedDrumkitIdx).not.toHaveBeenCalled()
    })
})
