// tests/pattern_settings_panel.test.js
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import Commander from '../src/logic/commands/commander.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/event_bus.js'
import { MAX_BEATS } from '../src/core/constants.js'
import { EVENTS } from '../src/core/events.js'

let PatternSettingsPanel

beforeEach(async () => {
    document.body.innerHTML = ''
    appState.reset()
    serviceRegistry.reset()
    soundRegistry.reset()
    PatternSettingsPanel = (await import('../src/ui/pattern_settings_panel.js')).default
})

function makeTrack(overrides = {}) {
    return {
        name: 'KICK',
        notes: [],
        beatCount: 4,
        stepsPerBeat: 4,
        loopAtStep: 16,
        mute: false,
        sampleId: 'kick_url',
        useAutoAssignSound: true,
        useSoftSynth: false,
        ...overrides,
    }
}

function setupPattern(tracks) {
    const pattern = { name: 'Test', beatCount: 4, tracks }
    appState.patterns = [pattern]
    appState.selectedPatternIdx = 0
    return pattern
}

describe('PatternSettingsPanel', () => {
    let panel

    beforeEach(() => {
        const realCmd = new Commander()
        serviceRegistry.cmd = {
            setPatternBeatCount: (pattern, beatCount) => realCmd.setPatternBeatCount(pattern, beatCount),
            setSelectedDrumkitIdx: vi.fn(),
            setSelectedPatternIdx: vi.fn(),
            beginGenerationUndo: vi.fn(),
            commitGenerationUndo: vi.fn(),
            cancelGenerationUndo: vi.fn(),
            addTrack: vi.fn(),
            setCurrentPage: vi.fn((page) => {
                appState.currentPage = Math.max(0, Math.floor(page) || 0)
            }),
            resetPage: vi.fn(() => {
                appState.currentPage = 0
            }),
        }
        panel = new PatternSettingsPanel()
        panel.init()
    })

    afterEach(() => {
        panel.destroy()
    })

    describe('init', () => {
        it('creates container in the DOM', () => {
            expect(panel.container).not.toBeNull()
            expect(document.body.contains(panel.container)).toBe(true)
        })

        it('renders beats select with options 1 to MAX_BEATS', () => {
            const opts = panel.beatsSelect.querySelectorAll('option')
            expect(opts.length).toBe(MAX_BEATS)
            expect(opts[0].value).toBe('1')
            expect(opts[MAX_BEATS - 1].value).toBe(String(MAX_BEATS))
        })

        it('is idempotent: a second init() does not duplicate the panel', () => {
            panel.init()

            expect(document.querySelectorAll('#pattern-settings-panel').length).toBe(1)
            expect(document.body.contains(panel.container)).toBe(true)
        })

        it('is idempotent: a second init() binds the bus handlers once', () => {
            const spy = vi.spyOn(panel, 'sync')
            panel.init()

            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)

            expect(spy).toHaveBeenCalledTimes(1)
        })
    })

    describe('show / hide', () => {
        it('adds open class on show', () => {
            panel.hide()
            panel.show()
            expect(panel.container.classList.contains('open')).toBe(true)
        })

        it('removes open class on hide', () => {
            panel.show()
            panel.hide()
            expect(panel.container.classList.contains('open')).toBe(false)
        })

        it('is safe to double-show', () => {
            panel.show()
            expect(() => panel.show()).not.toThrow()
        })

        it('is safe to double-hide', () => {
            panel.hide()
            expect(() => panel.hide()).not.toThrow()
        })
    })

    describe('close button', () => {
        it('hides panel on click', () => {
            panel.show()
            const closeBtn = panel.container.querySelector('.ps-close-btn')
            closeBtn.click()
            expect(panel.container.classList.contains('open')).toBe(false)
        })
    })

    describe('sync', () => {
        it('updates page label from appState', () => {
            const tracks = [makeTrack()]
            setupPattern(tracks)
            appState.currentPage = 0
            panel.sync()
            expect(panel.pageLabel.textContent).toBe('1/1')
        })

        it('disables prev button on page 0', () => {
            setupPattern([makeTrack()])
            appState.currentPage = 0
            panel.sync()
            expect(panel.prevPageBtn.disabled).toBe(true)
        })

        it('updates beats select to match pattern beatCount', () => {
            const tracks = [makeTrack({ beatCount: 8 })]
            const pattern = setupPattern(tracks)
            pattern.beatCount = 8
            panel.sync()
            expect(panel.beatsSelect.value).toBe('8')
        })
    })

    describe('syncSelects', () => {
        it('populates drumkit select from soundRegistry', () => {
            soundRegistry.drumkitList = [
                { name: 'Kit A', instruments: [] },
                { name: 'Kit B', instruments: [] },
            ]
            appState.selectedDrumkitIdx = 0
            panel.syncSelects()
            const opts = panel.drumkitSelect.querySelectorAll('option')
            expect(opts.length).toBe(2)
            expect(opts[0].textContent).toBe('Kit A')
        })

        it('populates pattern select from appState.patterns', () => {
            appState.patterns = [
                { name: 'Pattern 1', beatCount: 4, tracks: [] },
                { name: 'Pattern 2', beatCount: 4, tracks: [] },
            ]
            panel.syncSelects()
            const opts = panel.patternSelect.querySelectorAll('option')
            expect(opts.length).toBe(2)
        })
    })

    describe('page navigation', () => {
        function setupBigPattern() {
            const track = makeTrack({ beatCount: 8, stepsPerBeat: 4, loopAtStep: 32 })
            const pattern = { name: 'Big', beatCount: 8, tracks: [track] }
            appState.patterns = [pattern]
            appState.selectedPatternIdx = 0
            return pattern
        }

        it('decrements currentPage on prev click', () => {
            setupBigPattern()
            appState.currentPage = 1
            panel.sync()
            panel.prevPageBtn.click()
            expect(appState.currentPage).toBe(0)
        })

        it('does not decrement below 0', () => {
            setupBigPattern()
            appState.currentPage = 0
            panel.sync()
            panel.prevPageBtn.click()
            expect(appState.currentPage).toBe(0)
        })

        it('increments currentPage on next click', () => {
            setupBigPattern()
            appState.currentPage = 0
            panel.sync()
            panel.nextPageBtn.click()
            expect(appState.currentPage).toBe(1)
        })

        it('does not increment beyond max page', () => {
            setupBigPattern()
            appState.currentPage = 0
            panel.sync()
            panel.nextPageBtn.click()
            expect(appState.currentPage).toBe(1)
            panel.nextPageBtn.click()
            expect(appState.currentPage).toBe(1)
        })

        it('emits patternMetaChange and patternChange on page nav', () => {
            setupBigPattern()
            appState.currentPage = 0
            panel.sync()
            const spy = vi.fn()
            playbackEvents.on(EVENTS.PATTERN_CHANGE, spy)
            panel.nextPageBtn.click()
            expect(spy).toHaveBeenCalled()
        })
    })

    describe('beats change', () => {
        it('updates pattern.beatCount and all tracks beatCount', () => {
            const t1 = makeTrack({ beatCount: 4 })
            const t2 = makeTrack({ name: 'SNARE', beatCount: 4 })
            setupPattern([t1, t2])
            panel.sync()

            panel.beatsSelect.value = '8'
            panel.beatsSelect.dispatchEvent(new Event('change'))

            const pattern = appState.patterns[0]
            expect(pattern.beatCount).toBe(8)
            expect(t1.beatCount).toBe(8)
            expect(t2.beatCount).toBe(8)
        })

        it('clamps loopAtStep when beats decrease', () => {
            const track = makeTrack({ beatCount: 8, stepsPerBeat: 4, loopAtStep: 32 })
            const pattern = setupPattern([track])
            pattern.beatCount = 8
            panel.sync()

            panel.beatsSelect.value = '4'
            panel.beatsSelect.dispatchEvent(new Event('change'))

            expect(track.loopAtStep).toBe(16)
        })

        it('does not clamp loopAtStep when beats increase', () => {
            const track = makeTrack({ beatCount: 4, stepsPerBeat: 4, loopAtStep: 16 })
            setupPattern([track])
            panel.sync()

            panel.beatsSelect.value = '8'
            panel.beatsSelect.dispatchEvent(new Event('change'))

            expect(track.loopAtStep).toBe(16)
        })

        it('resets currentPage to 0 on beats change', () => {
            setupPattern([makeTrack()])
            appState.currentPage = 1
            panel.sync()

            panel.beatsSelect.value = '6'
            panel.beatsSelect.dispatchEvent(new Event('change'))

            expect(appState.currentPage).toBe(0)
        })

        it('emits patternMetaChange and patternChange', () => {
            setupPattern([makeTrack()])
            panel.sync()
            const spy = vi.fn()
            playbackEvents.on(EVENTS.PATTERN_CHANGE, spy)
            panel.beatsSelect.value = '2'
            panel.beatsSelect.dispatchEvent(new Event('change'))
            expect(spy).toHaveBeenCalled()
        })
    })

    describe('drumkit change', () => {
        it('calls cmd.setSelectedDrumkitIdx', () => {
            soundRegistry.drumkitList = [
                { name: 'Kit A', instruments: [] },
                { name: 'Kit B', instruments: [] },
            ]
            panel.syncSelects()
            panel.drumkitSelect.value = '1'
            panel.drumkitSelect.dispatchEvent(new Event('change'))
            expect(serviceRegistry.cmd.setSelectedDrumkitIdx).toHaveBeenCalledWith(1)
        })
    })

    describe('pattern change', () => {
        it('calls cmd.setSelectedPatternIdx', () => {
            appState.patterns = [
                { name: 'P1', beatCount: 4, tracks: [] },
                { name: 'P2', beatCount: 4, tracks: [] },
            ]
            panel.syncSelects()
            panel.patternSelect.value = '1'
            panel.patternSelect.dispatchEvent(new Event('change'))
            expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalledWith(1)
        })

        it('resets currentPage to 0', () => {
            appState.patterns = [
                { name: 'P1', beatCount: 4, tracks: [] },
                { name: 'P2', beatCount: 4, tracks: [] },
            ]
            appState.currentPage = 1
            panel.syncSelects()
            panel.patternSelect.value = '1'
            panel.patternSelect.dispatchEvent(new Event('change'))
            expect(appState.currentPage).toBe(0)
        })
    })

    // The orchestration these buttons used to carry lives in
    // logic/services/pattern_auto_gen.js (shared with the toolbar) and is
    // covered by tests/pattern_auto_gen.test.js — here we only pin the wiring.
    describe('generation buttons', () => {
        it('wires ↻ Drum, ↻ Bass and ↻ Chords to the shared service', async () => {
            const patternAutoGen = (await import('../src/logic/services/pattern_auto_gen.js')).default
            const drums = vi.spyOn(patternAutoGen, 'toggleDrums').mockImplementation(async () => {})
            const melodic = vi.spyOn(patternAutoGen, 'toggleMelodic').mockImplementation(async () => {})
            try {
                panel.container.querySelector('.ps-gen-drum').click()
                panel.container.querySelector('.ps-gen-bass').click()
                panel.container.querySelector('.ps-gen-chords').click()

                expect(drums).toHaveBeenCalledTimes(1)
                expect(melodic).toHaveBeenNthCalledWith(1, 'BASS')
                expect(melodic).toHaveBeenNthCalledWith(2, 'PIANO')
            } finally {
                drums.mockRestore()
                melodic.mockRestore()
            }
        })
    })

    describe('event subscriptions', () => {
        it('syncs on patternMetaChange', () => {
            setupPattern([makeTrack({ beatCount: 6 })])
            appState.patterns[0].beatCount = 6
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            expect(panel.beatsSelect.value).toBe('6')
        })

        it('syncs on patternStructureChange', () => {
            setupPattern([makeTrack({ beatCount: 10 })])
            appState.patterns[0].beatCount = 10
            playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            expect(panel.beatsSelect.value).toBe('10')
        })

        it('rebuilds drumkit selects on drumkitChange', () => {
            soundRegistry.drumkitList = [{ name: 'Initial', instruments: [] }]
            panel.syncSelects()
            expect(panel.drumkitSelect.options.length).toBe(1)

            soundRegistry.drumkitList = [
                { name: 'A', instruments: [] },
                { name: 'B', instruments: [] },
            ]
            playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)
            expect(panel.drumkitSelect.options.length).toBe(2)
        })
    })

    describe('destroy', () => {
        it('unsubscribes the four bus handlers (no leak on teardown)', () => {
            const spy = vi.spyOn(panel, 'sync')
            panel.destroy()

            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            expect(spy).not.toHaveBeenCalled()

            // re-subscribed handlers are gone too: the toggle no longer shows it
            playbackEvents.emit(EVENTS.PATTERN_SETTINGS_TOGGLE, true)
            expect(panel.isOpen).toBe(false)
        })

        it('detaches the container', () => {
            const container = panel.container
            panel.destroy()
            expect(document.body.contains(container)).toBe(false)
        })

        it('unbinds the DOM listeners (close button)', () => {
            panel.show()
            const closeBtn = panel.container.querySelector('.ps-close-btn')
            panel.destroy()
            closeBtn.click()
            expect(panel.isOpen).toBe(true)
        })
    })
})
