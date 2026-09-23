// tests/playback_overlay_section.test.js
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { TICK } from '../src/core/constants.js'

let playbackEvents
let PlaybackOverlaySection

beforeEach(async () => {
    document.body.innerHTML = ''
    appState.reset()
    serviceRegistry.reset()
    soundRegistry.reset()
    serviceRegistry.cmd = {
        setCurrentPage: vi.fn((page) => {
            appState.currentPage = Math.max(0, Math.floor(page) || 0)
        }),
    }
    globalThis.requestAnimationFrame = vi.fn()
    globalThis.cancelAnimationFrame = vi.fn()
    playbackEvents = (await import('../src/state/playback_events.js')).playbackEvents
    PlaybackOverlaySection = (await import('../src/ui/pattern_panel/playback_overlay_section.js')).default
})

afterEach(() => {
    delete globalThis.requestAnimationFrame
    delete globalThis.cancelAnimationFrame
})

function makeMockPattern(nbBeats = 4) {
    return {
        name: 'Test',
        nbBeats,
        tracks: [{ name: 'KICK', notes: [], nbBeats, stepsPerBeat: 4, loopAtStep: nbBeats * 4, mute: false }],
    }
}

function makeMockEditor() {
    const container = document.createElement('div')
    container.innerHTML = '<div class="pp-header"></div>'
    document.body.appendChild(container)
    return {
        container,
        serviceRegistry: serviceRegistry,
        playbackEvents: playbackEvents,
        beatRectsCache: [],
        layoutCache: null,
        requestSync: vi.fn(),
    }
}

function runOneFrame() {
    const calls = globalThis.requestAnimationFrame.mock?.calls
    if (!calls || calls.length === 0) return
    const rafCb = calls[calls.length - 1][0]
    if (typeof rafCb === 'function') rafCb()
}

describe('PlaybackOverlaySection', () => {
    let overlay, editor, pattern

    beforeEach(() => {
        pattern = makeMockPattern(4)
        appState.patterns = [pattern]
        appState.selectedPatternNum = 0
        editor = makeMockEditor(pattern)
        overlay = new PlaybackOverlaySection(editor)
    })

    describe('ensurePlayhead', () => {
        it('creates a pp-playhead div in the pp-header', () => {
            overlay.ensurePlayhead()
            const ph = editor.container.querySelector('.pp-playhead')
            expect(ph).not.toBeNull()
            expect(ph.style.display).toBe('none')
        })

        it('reattaches if removed from DOM', () => {
            overlay.ensurePlayhead()
            const ph = editor.container.querySelector('.pp-playhead')
            ph.remove()
            overlay.ensurePlayhead()
            const ph2 = editor.container.querySelector('.pp-playhead')
            expect(ph2).not.toBeNull()
        })

        it('does not duplicate if already present', () => {
            overlay.ensurePlayhead()
            overlay.ensurePlayhead()
            const all = editor.container.querySelectorAll('.pp-playhead')
            expect(all.length).toBe(1)
        })
    })

    describe('hidePlayhead', () => {
        it('sets playhead display to none', () => {
            overlay.ensurePlayhead()
            const ph = editor.container.querySelector('.pp-playhead')
            ph.style.display = 'block'
            overlay.hidePlayhead()
            expect(ph.style.display).toBe('none')
        })

        it('is safe to call without playhead', () => {
            expect(() => overlay.hidePlayhead()).not.toThrow()
        })
    })

    describe('resetPrevLoopTick', () => {
        it('resets internal state so next frame recomputes', () => {
            overlay.resetPrevLoopTick()
            expect(() => overlay.resetPrevLoopTick()).not.toThrow()
        })
    })

    describe('startRafLoop / stopRafLoop', () => {
        it('starts and stops without error', () => {
            serviceRegistry.transport = { isRunning: false, tick: 0 }
            serviceRegistry.audioEngine = { mixer: null }
            overlay.startRafLoop()
            overlay.stopRafLoop()
        })

        it('does not start a second loop if one is running', () => {
            serviceRegistry.transport = { isRunning: false, tick: 0 }
            serviceRegistry.audioEngine = { mixer: null }
            overlay.startRafLoop()
            overlay.startRafLoop()
            overlay.stopRafLoop()
        })

        it('loop exits when transport is not running', () => {
            serviceRegistry.transport = { isRunning: false, tick: 0 }
            serviceRegistry.audioEngine = { mixer: null }
            overlay.startRafLoop()
            runOneFrame(overlay)
            overlay.stopRafLoop()
        })
    })

    describe('syncVusVisibility', () => {
        it('adds pp-vus-hidden class when showVus is false', () => {
            appState.showVus = false
            overlay.syncVusVisibility()
            expect(editor.container.classList.contains('pp-vus-hidden')).toBe(true)
        })

        it('removes pp-vus-hidden class when showVus is true', () => {
            appState.showVus = true
            overlay.syncVusVisibility()
            expect(editor.container.classList.contains('pp-vus-hidden')).toBe(false)
        })
    })

    describe('resetVuAndWaveform', () => {
        it('does not throw when container has no vu elements', () => {
            expect(() => overlay.resetVuAndWaveform()).not.toThrow()
        })
    })

    describe('clearCaches', () => {
        it('clears internal caches without error', () => {
            expect(() => overlay.clearCaches()).not.toThrow()
        })
    })

    describe('playhead page auto-scroll', () => {
        it('changes currentPage when beat is outside visible page', () => {
            const bigPattern = makeMockPattern(8)
            appState.patterns = [bigPattern]
            appState.selectedPatternNum = 0
            appState.currentPage = 0

            editor.beatRectsCache = Array.from({ length: 8 }, () => ({
                left: 0,
                width: 50,
                absLeft: 0,
                absRight: 400,
            }))
            editor.layoutCache = {
                containerLeft: 0,
                containerRight: 400,
                tracksLeft: 0,
                tracksHeight: 200,
            }

            serviceRegistry.transport = {
                isRunning: true,
                tick: TICK * 5,
            }

            const mixer = { strips: {} }
            serviceRegistry.audioEngine = { mixer, getAnalyserData: vi.fn() }

            overlay.startRafLoop()
            runOneFrame(overlay)

            expect(appState.currentPage).toBe(1)
            overlay.stopRafLoop()
        })

        it('hides playhead when beat is on a different page', () => {
            const bigPattern = makeMockPattern(8)
            appState.patterns = [bigPattern]
            appState.selectedPatternNum = 0
            appState.currentPage = 0

            editor.beatRectsCache = Array.from({ length: 8 }, () => ({
                left: 0,
                width: 50,
                absLeft: 0,
                absRight: 400,
            }))
            editor.layoutCache = {
                containerLeft: 0,
                containerRight: 400,
                tracksLeft: 0,
                tracksHeight: 200,
            }

            serviceRegistry.transport = {
                isRunning: true,
                tick: TICK * 6,
            }
            serviceRegistry.audioEngine = { mixer: { strips: {} }, getAnalyserData: vi.fn() }

            overlay.ensurePlayhead()
            const ph = editor.container.querySelector('.pp-playhead')
            ph.style.display = 'block'

            overlay.startRafLoop()
            runOneFrame(overlay)

            expect(ph.style.display).toBe('none')
            overlay.stopRafLoop()
        })

        it('shows playhead when beat is within current page', () => {
            const bigPattern = makeMockPattern(8)
            appState.patterns = [bigPattern]
            appState.selectedPatternNum = 0
            appState.currentPage = 1

            editor.beatRectsCache = Array.from({ length: 8 }, (_, i) => ({
                left: i * 100,
                width: 100,
                absLeft: i * 100,
                absRight: (i + 1) * 100,
            }))
            editor.layoutCache = {
                containerLeft: 0,
                containerRight: 800,
                tracksLeft: 0,
                tracksHeight: 200,
            }

            serviceRegistry.transport = {
                isRunning: true,
                tick: TICK * 5,
            }
            serviceRegistry.audioEngine = { mixer: { strips: {} }, getAnalyserData: vi.fn() }

            overlay.resetPrevLoopTick()
            overlay.startRafLoop()
            runOneFrame(overlay)

            const ph = editor.container.querySelector('.pp-playhead')
            expect(ph.style.display).toBe('block')
            overlay.stopRafLoop()
        })
    })

    describe('VU update loop', () => {
        it('updates vu fill heights from mixer strip levels', () => {
            const vuEl = document.createElement('div')
            vuEl.className = 'pp-vu'
            vuEl.dataset.track = '0'
            const fill = document.createElement('div')
            fill.className = 'pp-vu-fill'
            vuEl.appendChild(fill)
            editor.container.appendChild(vuEl)

            const strip = { getLevel: vi.fn().mockReturnValue(0.05) }
            const mixer = { strips: { KICK: strip } }
            serviceRegistry.audioEngine = { mixer, getAnalyserData: vi.fn() }
            serviceRegistry.transport = { isRunning: true, tick: 0 }

            overlay.startRafLoop()
            runOneFrame(overlay)

            expect(fill.style.height).toBe('50%')
            overlay.stopRafLoop()
        })

        it('handles missing getLevel gracefully', () => {
            const vuEl = document.createElement('div')
            vuEl.className = 'pp-vu'
            vuEl.dataset.track = '0'
            const fill = document.createElement('div')
            fill.className = 'pp-vu-fill'
            vuEl.appendChild(fill)
            editor.container.appendChild(vuEl)

            const mixer = { strips: {} }
            serviceRegistry.audioEngine = { mixer, getAnalyserData: vi.fn() }
            serviceRegistry.transport = { isRunning: true, tick: 0 }

            overlay.startRafLoop()
            runOneFrame(overlay)

            expect(fill.style.height).toBe('0%')
            overlay.stopRafLoop()
        })

        it('hides waveform canvas when layout has zero width', () => {
            const canvas = document.createElement('canvas')
            canvas.className = 'pp-waveform-overlay'
            canvas.style.display = 'block'
            editor.container.appendChild(canvas)

            editor.beatRectsCache = [{ left: 0, width: 0, absLeft: 0, absRight: 0 }]
            editor.layoutCache = {
                containerLeft: 0,
                containerRight: 0,
                tracksLeft: 0,
                tracksHeight: 0,
            }

            const mixer = { strips: {} }
            serviceRegistry.audioEngine = { mixer, getAnalyserData: vi.fn() }
            serviceRegistry.transport = { isRunning: true, tick: 0 }

            overlay.startRafLoop()
            runOneFrame(overlay)

            overlay.stopRafLoop()
        })
    })
})
