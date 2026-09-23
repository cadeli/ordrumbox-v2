// tests/pattern_settings_panel.test.js
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { MAX_BEATS } from '../src/core/constants.js'

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
        nbBeats: 4,
        stepsPerBeat: 4,
        loopAtStep: 16,
        mute: false,
        soundId: 'kick_url',
        useAutoAssignSound: true,
        useSoftSynth: false,
        ...overrides,
    }
}

function setupPattern(tracks) {
    const pattern = { name: 'Test', nbBeats: 4, tracks }
    appState.patterns = [pattern]
    appState.selectedPatternNum = 0
    return pattern
}

describe('PatternSettingsPanel', () => {
    let panel

    beforeEach(() => {
        serviceRegistry.cmd = {
            setSelectedDrumkitNum: vi.fn(),
            setSelectedPatternNum: vi.fn(),
            beginGenerationUndo: vi.fn(),
            commitGenerationUndo: vi.fn(),
            addTrack: vi.fn(),
        }
        panel = new PatternSettingsPanel()
        panel.init()
    })

    describe('init', () => {
        it('creates container in the DOM', () => {
            expect(panel.container).not.toBeNull()
            expect(document.body.contains(panel.container)).toBe(true)
        })

        it('renders beats select with options 1 to MAX_BEATS', () => {
            const opts = panel._beatsSelect.querySelectorAll('option')
            expect(opts.length).toBe(MAX_BEATS)
            expect(opts[0].value).toBe('1')
            expect(opts[MAX_BEATS - 1].value).toBe(String(MAX_BEATS))
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
            expect(panel._pageLabel.textContent).toBe('1/1')
        })

        it('disables prev button on page 0', () => {
            setupPattern([makeTrack()])
            appState.currentPage = 0
            panel.sync()
            expect(panel._prevPageBtn.disabled).toBe(true)
        })

        it('updates beats select to match pattern nbBeats', () => {
            const tracks = [makeTrack({ nbBeats: 8 })]
            const pattern = setupPattern(tracks)
            pattern.nbBeats = 8
            panel.sync()
            expect(panel._beatsSelect.value).toBe('8')
        })
    })

    describe('syncDrumkits', () => {
        it('populates drumkit select from soundRegistry', () => {
            soundRegistry.drumkitList = [
                { name: 'Kit A', instruments: [] },
                { name: 'Kit B', instruments: [] },
            ]
            appState.selectedDrumkitNum = 0
            panel.syncDrumkits()
            const opts = panel._drumkitSelect.querySelectorAll('option')
            expect(opts.length).toBe(2)
            expect(opts[0].textContent).toBe('Kit A')
        })

        it('populates pattern select from appState.patterns', () => {
            appState.patterns = [
                { name: 'Pattern 1', nbBeats: 4, tracks: [] },
                { name: 'Pattern 2', nbBeats: 4, tracks: [] },
            ]
            panel.syncDrumkits()
            const opts = panel._patternSelect.querySelectorAll('option')
            expect(opts.length).toBe(2)
        })
    })

    describe('page navigation', () => {
        function setupBigPattern() {
            const track = makeTrack({ nbBeats: 8, stepsPerBeat: 4, loopAtStep: 32 })
            const pattern = { name: 'Big', nbBeats: 8, tracks: [track] }
            appState.patterns = [pattern]
            appState.selectedPatternNum = 0
            return pattern
        }

        it('decrements currentPage on prev click', () => {
            setupBigPattern()
            appState.currentPage = 1
            panel.sync()
            panel._prevPageBtn.click()
            expect(appState.currentPage).toBe(0)
        })

        it('does not decrement below 0', () => {
            setupBigPattern()
            appState.currentPage = 0
            panel.sync()
            panel._prevPageBtn.click()
            expect(appState.currentPage).toBe(0)
        })

        it('increments currentPage on next click', () => {
            setupBigPattern()
            appState.currentPage = 0
            panel.sync()
            panel._nextPageBtn.click()
            expect(appState.currentPage).toBe(1)
        })

        it('does not increment beyond max page', () => {
            setupBigPattern()
            appState.currentPage = 0
            panel.sync()
            panel._nextPageBtn.click()
            expect(appState.currentPage).toBe(1)
            panel._nextPageBtn.click()
            expect(appState.currentPage).toBe(1)
        })

        it('emits patternMetaChange and patternChange on page nav', () => {
            setupBigPattern()
            appState.currentPage = 0
            panel.sync()
            const spy = vi.fn()
            playbackEvents.on('patternChange', spy)
            panel._nextPageBtn.click()
            expect(spy).toHaveBeenCalled()
        })
    })

    describe('beats change', () => {
        it('updates pattern.nbBeats and all tracks nbBeats', () => {
            const t1 = makeTrack({ nbBeats: 4 })
            const t2 = makeTrack({ name: 'SNARE', nbBeats: 4 })
            setupPattern([t1, t2])
            panel.sync()

            panel._beatsSelect.value = '8'
            panel._beatsSelect.dispatchEvent(new Event('change'))

            const pattern = appState.patterns[0]
            expect(pattern.nbBeats).toBe(8)
            expect(t1.nbBeats).toBe(8)
            expect(t2.nbBeats).toBe(8)
        })

        it('clamps loopAtStep when beats decrease', () => {
            const track = makeTrack({ nbBeats: 8, stepsPerBeat: 4, loopAtStep: 32 })
            const pattern = setupPattern([track])
            pattern.nbBeats = 8
            panel.sync()

            panel._beatsSelect.value = '4'
            panel._beatsSelect.dispatchEvent(new Event('change'))

            expect(track.loopAtStep).toBe(16)
        })

        it('does not clamp loopAtStep when beats increase', () => {
            const track = makeTrack({ nbBeats: 4, stepsPerBeat: 4, loopAtStep: 16 })
            setupPattern([track])
            panel.sync()

            panel._beatsSelect.value = '8'
            panel._beatsSelect.dispatchEvent(new Event('change'))

            expect(track.loopAtStep).toBe(16)
        })

        it('resets currentPage to 0 on beats change', () => {
            setupPattern([makeTrack()])
            appState.currentPage = 1
            panel.sync()

            panel._beatsSelect.value = '6'
            panel._beatsSelect.dispatchEvent(new Event('change'))

            expect(appState.currentPage).toBe(0)
        })

        it('emits patternMetaChange and patternChange', () => {
            setupPattern([makeTrack()])
            panel.sync()
            const spy = vi.fn()
            playbackEvents.on('patternChange', spy)
            panel._beatsSelect.value = '2'
            panel._beatsSelect.dispatchEvent(new Event('change'))
            expect(spy).toHaveBeenCalled()
        })
    })

    describe('drumkit change', () => {
        it('calls cmd.setSelectedDrumkitNum', () => {
            soundRegistry.drumkitList = [
                { name: 'Kit A', instruments: [] },
                { name: 'Kit B', instruments: [] },
            ]
            panel.syncDrumkits()
            panel._drumkitSelect.value = '1'
            panel._drumkitSelect.dispatchEvent(new Event('change'))
            expect(serviceRegistry.cmd.setSelectedDrumkitNum).toHaveBeenCalledWith(1)
        })
    })

    describe('pattern change', () => {
        it('calls cmd.setSelectedPatternNum', () => {
            appState.patterns = [
                { name: 'P1', nbBeats: 4, tracks: [] },
                { name: 'P2', nbBeats: 4, tracks: [] },
            ]
            panel.syncDrumkits()
            panel._patternSelect.value = '1'
            panel._patternSelect.dispatchEvent(new Event('change'))
            expect(serviceRegistry.cmd.setSelectedPatternNum).toHaveBeenCalledWith(1)
        })

        it('resets currentPage to 0', () => {
            appState.patterns = [
                { name: 'P1', nbBeats: 4, tracks: [] },
                { name: 'P2', nbBeats: 4, tracks: [] },
            ]
            appState.currentPage = 1
            panel.syncDrumkits()
            panel._patternSelect.value = '1'
            panel._patternSelect.dispatchEvent(new Event('change'))
            expect(appState.currentPage).toBe(0)
        })
    })

    describe('event subscriptions', () => {
        it('syncs on patternMetaChange', () => {
            setupPattern([makeTrack({ nbBeats: 6 })])
            appState.patterns[0].nbBeats = 6
            playbackEvents.emit('patternMetaChange')
            expect(panel._beatsSelect.value).toBe('6')
        })

        it('syncs on patternStructureChange', () => {
            setupPattern([makeTrack({ nbBeats: 10 })])
            appState.patterns[0].nbBeats = 10
            playbackEvents.emit('patternStructureChange')
            expect(panel._beatsSelect.value).toBe('10')
        })

        it('rebuilds drumkit selects on drumkitChange', () => {
            soundRegistry.drumkitList = [{ name: 'Initial', instruments: [] }]
            panel.syncDrumkits()
            expect(panel._drumkitSelect.options.length).toBe(1)

            soundRegistry.drumkitList = [
                { name: 'A', instruments: [] },
                { name: 'B', instruments: [] },
            ]
            playbackEvents.emit('drumkitChange')
            expect(panel._drumkitSelect.options.length).toBe(2)
        })
    })
})
