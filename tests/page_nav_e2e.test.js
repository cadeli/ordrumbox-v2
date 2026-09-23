// tests/page_nav_e2e.test.js
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { BEATS_PER_PAGE, TICK } from '../src/core/constants.js'
import { EVENTS } from '../src/core/events.js'

let Toolbar, PatternPanel, PianoRollPanel

beforeEach(async () => {
    document.body.innerHTML = ''
    appState.reset()
    serviceRegistry.reset()
    soundRegistry.reset()
    globalThis.requestAnimationFrame = vi.fn()
    globalThis.cancelAnimationFrame = vi.fn()
    Toolbar = (await import('../src/ui/toolbar.js')).default
    PatternPanel = (await import('../src/ui/pattern_panel.js')).default
    PianoRollPanel = (await import('../src/ui/piano_roll_panel.js')).default
})

afterEach(() => {
    delete globalThis.requestAnimationFrame
    delete globalThis.cancelAnimationFrame
})

function makeMultiPagePattern(nbBeats = 8) {
    const totalSteps = nbBeats * 4
    const notes = []
    for (let i = 0; i < totalSteps; i += 4) {
        notes.push({ pos: i, pitch: 60, vel: 100, len: 1 })
    }
    return {
        name: 'MultiPage',
        nbBeats,
        bpm: 120,
        tracks: [
            {
                name: 'KICK',
                notes: [...notes],
                nbBeats,
                stepsPerBeat: 4,
                loopAtStep: totalSteps,
                mute: false,
                soundId: 'kick',
                useAutoAssignSound: true,
                useSoftSynth: false,
            },
            {
                name: 'SNARE',
                notes: notes.filter((_, i) => i % 2 === 1).map((n) => ({ ...n, pitch: 62 })),
                nbBeats,
                stepsPerBeat: 4,
                loopAtStep: totalSteps,
                mute: false,
                soundId: 'snare',
                useAutoAssignSound: true,
                useSoftSynth: false,
            },
        ],
    }
}

function make4BeatPattern() {
    const notes = []
    for (let i = 0; i < 16; i += 4) {
        notes.push({ pos: i, pitch: 60, vel: 100, len: 1 })
    }
    return {
        name: 'FourBeat',
        nbBeats: 4,
        bpm: 120,
        tracks: [
            {
                name: 'KICK',
                notes,
                nbBeats: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                mute: false,
                soundId: 'kick',
                useAutoAssignSound: true,
                useSoftSynth: false,
            },
        ],
    }
}

function setupServices() {
    serviceRegistry.seq = {
        toggleStartStop: vi.fn(),
        setBpm: vi.fn(),
        setTick: vi.fn(),
    }
    serviceRegistry.cmd = {
        setSelectedPatternNum: vi.fn((num) => {
            appState.selectedPatternNum = num
        }),
        setSelectedDrumkitNum: vi.fn(),
        setSelectedTrackNum: vi.fn(),
        cleanPattern: vi.fn(),
        addPattern: vi.fn(),
        removePattern: vi.fn(),
        beginGenerationUndo: vi.fn(),
        commitGenerationUndo: vi.fn(),
        cancelGenerationUndo: vi.fn(),
        setCurrentPage: vi.fn((page) => {
            appState.currentPage = Math.max(0, Math.floor(page) || 0)
        }),
        resetPage: vi.fn(() => {
            appState.currentPage = 0
        }),
    }
    serviceRegistry.transport = {
        isRunning: false,
        tick: 0,
    }
    serviceRegistry.patterns = {
        applyFlatNotes: vi.fn(),
    }
    serviceRegistry.resourcesLoader = {
        loadGeneratedSounds: vi.fn().mockResolvedValue(undefined),
    }
}

function initToolbar() {
    const tb = new Toolbar()
    tb.init()
    return tb
}

function initPatternPanel() {
    const pp = new PatternPanel()
    pp.init()
    pp.subscribe()
    return pp
}

function initPianoRollPanel() {
    const pr = new PianoRollPanel()
    pr.init()
    pr.subscribe()
    return pr
}

// ────────────────────────────────────────────────────────────────
// PHASE 1: Toolbar page nav — multi-page pattern
// ────────────────────────────────────────────────────────────────
describe('Page navigation E2E — Toolbar', () => {
    let toolbar

    beforeEach(() => {
        setupServices()
        const pat = makeMultiPagePattern(8)
        appState.patterns = [pat]
        appState.selectedPatternNum = 0
        appState.currentPage = 0
        toolbar = initToolbar()
    })

    it('shows "1/2" for 8-beat pattern (2 pages)', () => {
        expect(toolbar.pageLabel.textContent).toBe('1/2')
    })

    it('next button enabled on page 1/2', () => {
        expect(toolbar.nextPageBtn.disabled).toBe(false)
    })

    it('prev button disabled on page 1', () => {
        expect(toolbar.prevPageBtn.disabled).toBe(true)
    })

    it('clicking next increments page to 2/2', () => {
        toolbar.nextPageBtn.click()
        expect(appState.currentPage).toBe(1)
        expect(toolbar.pageLabel.textContent).toBe('2/2')
    })

    it('after next click, prev enabled and next disabled', () => {
        toolbar.nextPageBtn.click()
        expect(toolbar.prevPageBtn.disabled).toBe(false)
        expect(toolbar.nextPageBtn.disabled).toBe(true)
    })

    it('clicking prev from page 2 goes back to page 1', () => {
        toolbar.nextPageBtn.click()
        toolbar.prevPageBtn.click()
        expect(appState.currentPage).toBe(0)
        expect(toolbar.pageLabel.textContent).toBe('1/2')
    })

    it('clicking prev on page 1 does nothing', () => {
        toolbar.prevPageBtn.click()
        expect(appState.currentPage).toBe(0)
        expect(toolbar.pageLabel.textContent).toBe('1/2')
    })

    it('clicking next on last page does nothing', () => {
        toolbar.nextPageBtn.click()
        toolbar.nextPageBtn.click()
        expect(appState.currentPage).toBe(1)
        expect(toolbar.pageLabel.textContent).toBe('2/2')
    })

    it('emits patternMetaChange on page change', () => {
        const spy = vi.spyOn(playbackEvents, 'emit')
        toolbar.nextPageBtn.click()
        expect(spy).toHaveBeenCalledWith('patternMetaChange')
        expect(spy).toHaveBeenCalledWith('patternChange')
    })
})

// ────────────────────────────────────────────────────────────────
// PHASE 2: Toolbar page nav — single-page pattern
// ────────────────────────────────────────────────────────────────
describe('Page navigation E2E — Toolbar single-page', () => {
    let toolbar

    beforeEach(() => {
        setupServices()
        const pat = make4BeatPattern()
        appState.patterns = [pat]
        appState.selectedPatternNum = 0
        appState.currentPage = 0
        toolbar = initToolbar()
    })

    it('shows "1/1" for 4-beat pattern (1 page)', () => {
        expect(toolbar.pageLabel.textContent).toBe('1/1')
    })

    it('both buttons disabled for single-page pattern', () => {
        expect(toolbar.prevPageBtn.disabled).toBe(true)
        expect(toolbar.nextPageBtn.disabled).toBe(true)
    })

    it('page stays 0 after clicks on single-page pattern', () => {
        toolbar.nextPageBtn.click()
        expect(appState.currentPage).toBe(0)
        toolbar.prevPageBtn.click()
        expect(appState.currentPage).toBe(0)
    })
})

// ────────────────────────────────────────────────────────────────
// PHASE 3: Beat change updates page count
// ────────────────────────────────────────────────────────────────
describe('Page navigation E2E — beats change updates pages', () => {
    let toolbar

    beforeEach(() => {
        setupServices()
        const pat = make4BeatPattern()
        appState.patterns = [pat]
        appState.selectedPatternNum = 0
        appState.currentPage = 0
        toolbar = initToolbar()
    })

    it('changing beats from 4 to 8 updates label to 1/2', () => {
        expect(toolbar.pageLabel.textContent).toBe('1/1')
        const beatsSelect = toolbar.beatsSelect
        beatsSelect.value = '8'
        beatsSelect.dispatchEvent(new Event('change'))
        expect(toolbar.pageLabel.textContent).toBe('1/2')
        expect(toolbar.nextPageBtn.disabled).toBe(false)
    })

    it('changing beats from 8 to 4 resets to page 1 and disables next', () => {
        const pat = makeMultiPagePattern(8)
        appState.patterns = [pat]
        appState.currentPage = 1
        playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
        expect(toolbar.pageLabel.textContent).toBe('2/2')

        const beatsSelect = toolbar.beatsSelect
        beatsSelect.value = '4'
        beatsSelect.dispatchEvent(new Event('change'))
        expect(toolbar.pageLabel.textContent).toBe('1/1')
        expect(toolbar.nextPageBtn.disabled).toBe(true)
    })
})

// ────────────────────────────────────────────────────────────────
// PHASE 4: Toolbar ↔ PatternPanel sync
// ────────────────────────────────────────────────────────────────
describe('Page navigation E2E — Toolbar ↔ PatternPanel grid', () => {
    let toolbar, patternPanel

    beforeEach(() => {
        setupServices()
        const pat = makeMultiPagePattern(8)
        appState.patterns = [pat]
        appState.selectedPatternNum = 0
        appState.currentPage = 0
        toolbar = initToolbar()
        patternPanel = initPatternPanel()
        patternPanel.show()
    })

    it('pattern panel header shows "Page 1" initially', () => {
        const header = patternPanel.container.querySelector('.pp-meta')
        expect(header?.textContent).toContain('Page 1')
    })

    it('toolbar next → pattern panel header shows "Page 2"', () => {
        toolbar.nextPageBtn.click()
        patternPanel.sync()
        const header = patternPanel.container.querySelector('.pp-meta')
        expect(header?.textContent).toContain('Page 2')
    })

    it('pattern panel header re-renders after page change event', () => {
        appState.currentPage = 1
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
        patternPanel.sync()
        const header = patternPanel.container.querySelector('.pp-meta')
        expect(header?.textContent).toContain('Page 2')
    })

    it('pattern panel grid shows correct beats range per page', () => {
        const cells = patternPanel.container.querySelectorAll('.pp-cell')
        if (cells.length > 0) {
            const beatNums = new Set()
            cells.forEach((c) => {
                const beat = parseInt(c.dataset.beat, 10)
                if (!isNaN(beat)) beatNums.add(beat)
            })
            for (const b of beatNums) {
                expect(b).toBeGreaterThanOrEqual(0)
                expect(b).toBeLessThan(BEATS_PER_PAGE)
            }
        }
    })
})

// ────────────────────────────────────────────────────────────────
// PHASE 5: Toolbar ↔ PianoRoll sync
// ────────────────────────────────────────────────────────────────
describe('Page navigation E2E — Toolbar ↔ PianoRoll', () => {
    let toolbar, pianoRoll

    beforeEach(() => {
        setupServices()
        const pat = makeMultiPagePattern(8)
        appState.patterns = [pat]
        appState.selectedPatternNum = 0
        appState.selectedTrackNum = 0
        appState.currentPage = 0
        toolbar = initToolbar()
        pianoRoll = initPianoRollPanel()
    })

    it('piano roll shows page info for multi-page patterns', () => {
        pianoRoll.show()
        const info = pianoRoll.container.querySelector('#pp-pr-page-info')
        expect(info?.textContent).toBe('1/2')
    })

    it('piano roll page nav visible for multi-page patterns', () => {
        pianoRoll.show()
        const nav = pianoRoll.container.querySelector('#pp-pr-page-nav')
        expect(nav?.style.display).not.toBe('none')
    })

    it('piano roll page info shows "1/2" on page 1', () => {
        pianoRoll.show()
        const info = pianoRoll.container.querySelector('#pp-pr-page-info')
        expect(info?.textContent).toBe('1/2')
    })

    it('piano roll next click → both toolbar and piano roll update', () => {
        pianoRoll.show()
        const prNext = pianoRoll.container.querySelector('#pp-pr-next')
        prNext.click()
        expect(appState.currentPage).toBe(1)
        expect(toolbar.pageLabel.textContent).toBe('2/2')
        const info = pianoRoll.container.querySelector('#pp-pr-page-info')
        expect(info?.textContent).toBe('2/2')
    })

    it('toolbar next click → piano roll updates', () => {
        pianoRoll.show()
        toolbar.nextPageBtn.click()
        const info = pianoRoll.container.querySelector('#pp-pr-page-info')
        expect(info?.textContent).toBe('2/2')
    })
})

// ────────────────────────────────────────────────────────────────
// PHASE 6: Playback auto-page in grid mode
// ────────────────────────────────────────────────────────────────
describe('Page navigation E2E — playback auto-page (grid)', () => {
    let toolbar, patternPanel

    function runOneFrame() {
        const calls = globalThis.requestAnimationFrame.mock?.calls
        if (!calls || calls.length === 0) return
        const rafCb = calls[calls.length - 1][0]
        if (typeof rafCb === 'function') rafCb()
    }

    beforeEach(() => {
        setupServices()
        serviceRegistry.audioEngine = { mixer: { strips: [] } }
        const pat = makeMultiPagePattern(8)
        appState.patterns = [pat]
        appState.selectedPatternNum = 0
        appState.currentPage = 0
        toolbar = initToolbar()
        patternPanel = initPatternPanel()
        patternPanel.show()
    })

    it('simulating playback crossing page boundary updates toolbar label', () => {
        playbackEvents.emit(EVENTS.PLAYBACK_START)
        serviceRegistry.transport.isRunning = true
        serviceRegistry.transport.tick = 0
        runOneFrame()

        expect(appState.currentPage).toBe(0)
        expect(toolbar.pageLabel.textContent).toBe('1/2')

        serviceRegistry.transport.tick = TICK * 4
        runOneFrame()

        expect(appState.currentPage).toBe(1)
        expect(toolbar.pageLabel.textContent).toBe('2/2')
    })

    it('simulating playback wrapping resets to page 1', () => {
        playbackEvents.emit(EVENTS.PLAYBACK_START)
        serviceRegistry.transport.isRunning = true
        serviceRegistry.transport.tick = TICK * 4
        runOneFrame()

        expect(appState.currentPage).toBe(1)
        expect(toolbar.pageLabel.textContent).toBe('2/2')

        serviceRegistry.transport.tick = 0
        runOneFrame()

        expect(appState.currentPage).toBe(0)
        expect(toolbar.pageLabel.textContent).toBe('1/2')
    })
})

// ────────────────────────────────────────────────────────────────
// PHASE 7: Playback auto-page in piano roll mode
// ────────────────────────────────────────────────────────────────
describe('Page navigation E2E — playback auto-page (piano roll)', () => {
    let toolbar, pianoRoll

    function runOneFrame() {
        const calls = globalThis.requestAnimationFrame.mock?.calls
        if (!calls || calls.length === 0) return
        const rafCb = calls[calls.length - 1][0]
        if (typeof rafCb === 'function') rafCb()
    }

    beforeEach(() => {
        setupServices()
        serviceRegistry.audioEngine = { mixer: { strips: [] } }
        const pat = makeMultiPagePattern(8)
        appState.patterns = [pat]
        appState.selectedPatternNum = 0
        appState.selectedTrackNum = 0
        appState.currentPage = 0
        toolbar = initToolbar()
        pianoRoll = initPianoRollPanel()
        pianoRoll.show()
    })

    it('simulating playback crossing page boundary updates piano roll page info', () => {
        serviceRegistry.transport.isRunning = true
        serviceRegistry.transport.tick = 0
        pianoRoll.startRafLoop()
        runOneFrame()

        expect(appState.currentPage).toBe(0)
        let info = pianoRoll.container.querySelector('#pp-pr-page-info')
        expect(info?.textContent).toBe('1/2')

        serviceRegistry.transport.tick = TICK * 4
        runOneFrame()

        expect(appState.currentPage).toBe(1)
        info = pianoRoll.container.querySelector('#pp-pr-page-info')
        expect(info?.textContent).toBe('2/2')
        expect(toolbar.pageLabel.textContent).toBe('2/2')
    })

    it('playback wrap resets piano roll page info to 1/2', () => {
        serviceRegistry.transport.isRunning = true
        serviceRegistry.transport.tick = TICK * 4
        pianoRoll.startRafLoop()
        runOneFrame()

        expect(appState.currentPage).toBe(1)

        serviceRegistry.transport.tick = 0
        runOneFrame()

        expect(appState.currentPage).toBe(0)
        const info = pianoRoll.container.querySelector('#pp-pr-page-info')
        expect(info?.textContent).toBe('1/2')
        expect(toolbar.pageLabel.textContent).toBe('1/2')
    })
})

// ────────────────────────────────────────────────────────────────
// PHASE 8: Page navigation persists across pattern switches
// ────────────────────────────────────────────────────────────────
describe('Page navigation E2E — pattern switch resets page', () => {
    let toolbar

    beforeEach(() => {
        setupServices()
        const pat8 = makeMultiPagePattern(8)
        const pat4 = make4BeatPattern()
        appState.patterns = [pat8, pat4]
        appState.selectedPatternNum = 0
        appState.currentPage = 0
        toolbar = initToolbar()
    })

    it('switching to single-page pattern resets to page 1 and disables buttons', () => {
        toolbar.nextPageBtn.click()
        expect(appState.currentPage).toBe(1)
        expect(toolbar.pageLabel.textContent).toBe('2/2')

        toolbar.patternSelect.value = '1'
        toolbar.patternSelect.dispatchEvent(new Event('change'))

        expect(appState.currentPage).toBe(0)
        expect(toolbar.prevPageBtn.disabled).toBe(true)
        expect(toolbar.nextPageBtn.disabled).toBe(true)
        expect(toolbar.pageLabel.textContent).toBe('1/1')
    })

    it('switching back to multi-page re-enables next button', () => {
        toolbar.nextPageBtn.click()
        toolbar.patternSelect.value = '1'
        toolbar.patternSelect.dispatchEvent(new Event('change'))

        toolbar.patternSelect.value = '0'
        toolbar.patternSelect.dispatchEvent(new Event('change'))

        expect(toolbar.pageLabel.textContent).toBe('1/2')
        expect(toolbar.nextPageBtn.disabled).toBe(false)
    })
})

// ────────────────────────────────────────────────────────────────
// PHASE 9: Larger patterns (16 beats = 4 pages)
// ────────────────────────────────────────────────────────────────
describe('Page navigation E2E — 16-beat pattern (4 pages)', () => {
    let toolbar

    beforeEach(() => {
        setupServices()
        const pat = makeMultiPagePattern(16)
        appState.patterns = [pat]
        appState.selectedPatternNum = 0
        appState.currentPage = 0
        toolbar = initToolbar()
    })

    it('shows "1/4" for 16-beat pattern', () => {
        expect(toolbar.pageLabel.textContent).toBe('1/4')
    })

    it('can navigate through all 4 pages', () => {
        toolbar.nextPageBtn.click()
        expect(toolbar.pageLabel.textContent).toBe('2/4')

        toolbar.nextPageBtn.click()
        expect(toolbar.pageLabel.textContent).toBe('3/4')

        toolbar.nextPageBtn.click()
        expect(toolbar.pageLabel.textContent).toBe('4/4')
        expect(toolbar.nextPageBtn.disabled).toBe(true)

        toolbar.prevPageBtn.click()
        expect(toolbar.pageLabel.textContent).toBe('3/4')

        toolbar.prevPageBtn.click()
        expect(toolbar.prevPageBtn.disabled).toBe(false)
    })

    it('prev disabled only on first page', () => {
        expect(toolbar.prevPageBtn.disabled).toBe(true)
        toolbar.nextPageBtn.click()
        expect(toolbar.prevPageBtn.disabled).toBe(false)
    })
})
