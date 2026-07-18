/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import Toolbar from '../src/ui/toolbar.js'

describe('Toolbar overflow (mobile single-line)', () => {
    let toolbar

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        document.body.innerHTML = ''

        serviceRegistry.transport = { isRunning: false }
        serviceRegistry.mfSeq = { toggleStartStop: vi.fn() }
        serviceRegistry.mfCmd = { setSelectedPatternNum: vi.fn(), setSelectedDrumkitNum: vi.fn(), cleanPattern: vi.fn() }
        serviceRegistry.mfPatterns = { computeFlatNotesFromPattern: vi.fn() }

        appState.patterns = [{ name: 'P1', bpm: 120, nbBeats: 1, stepsPerBeat: 16, tracks: [{ stepsPerBeat: 16 }] }]
        soundRegistry.drumkitList = [{ name: 'real', instruments: [] }]
    })

    function simulateOverflow(toolbar, overflowing) {
        Object.defineProperty(toolbar.container, 'clientWidth', { value: 300, configurable: true })
        Object.defineProperty(toolbar.container, 'scrollWidth', { value: overflowing ? 400 : 280, configurable: true })
        toolbar._checkOverflow()
    }

    it('adds tb-overflow class on mobile when toolbar overflows', () => {
        global.window.innerWidth = 500
        toolbar = new Toolbar()
        toolbar.init()

        simulateOverflow(toolbar, true)

        expect(toolbar.container.classList.contains('tb-overflow')).toBe(true)
    })

    it('does not add tb-overflow class on mobile when toolbar fits on one line', () => {
        global.window.innerWidth = 500
        toolbar = new Toolbar()
        toolbar.init()

        simulateOverflow(toolbar, false)

        expect(toolbar.container.classList.contains('tb-overflow')).toBe(false)
    })

    it('does not add tb-overflow class on desktop even if overflow detected', () => {
        global.window.innerWidth = 1400
        toolbar = new Toolbar()
        toolbar.init()

        simulateOverflow(toolbar, true)

        expect(toolbar.container.classList.contains('tb-overflow')).toBe(false)
    })

    it('toggles tb-overflow class as dimensions change', () => {
        global.window.innerWidth = 500
        toolbar = new Toolbar()
        toolbar.init()

        simulateOverflow(toolbar, true)
        expect(toolbar.container.classList.contains('tb-overflow')).toBe(true)

        simulateOverflow(toolbar, false)
        expect(toolbar.container.classList.contains('tb-overflow')).toBe(false)

        simulateOverflow(toolbar, true)
        expect(toolbar.container.classList.contains('tb-overflow')).toBe(true)
    })

    it('re-checks overflow on window resize', () => {
        global.window.innerWidth = 500
        toolbar = new Toolbar()
        toolbar.init()

        simulateOverflow(toolbar, true)
        expect(toolbar.container.classList.contains('tb-overflow')).toBe(true)

        global.window.innerWidth = 1400
        window.dispatchEvent(new Event('resize'))

        expect(toolbar.container.classList.contains('tb-overflow')).toBe(false)
    })
})
