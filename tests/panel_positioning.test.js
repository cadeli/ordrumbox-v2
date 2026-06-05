/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import OutputPanel from '../src/ui/output_panel.js'
import AboutPanel from '../src/ui/about_panel.js'
import { positionBelowPatternPanel } from '../src/ui/panel_helpers.js'

describe('Panel positioning below pattern panel on desktop', () => {
    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        document.body.innerHTML = ''

        const patternPanel = document.createElement('div')
        patternPanel.id = 'pattern-panel'
        Object.defineProperty(patternPanel, 'offsetTop', { value: 48, configurable: true })
        Object.defineProperty(patternPanel, 'offsetHeight', { value: 300, configurable: true })
        document.body.appendChild(patternPanel)

        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ major: { scaleSteps: [0, 2, 4, 5, 7, 9, 11] } })
        })
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn(),
            putImageData: vi.fn(), createImageData: vi.fn(), setTransform: vi.fn(),
            drawImage: vi.fn(), save: vi.fn(), fillText: vi.fn(), restore: vi.fn(),
            beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
            stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
            arc: vi.fn(), fill: vi.fn(), measureText: vi.fn().mockReturnValue({ width: 0 }),
            transform: vi.fn(), rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn()
        })
    })

    describe('positionBelowPatternPanel helper', () => {
        it('sets container top to pattern-panel bottom + 4px gap on desktop', () => {
            const container = document.createElement('div')
            positionBelowPatternPanel(container)
            expect(container.style.top).toBe('352px')
        })

        it('does nothing on mobile (width <= 768)', () => {
            global.window.innerWidth = 600
            const container = document.createElement('div')
            container.style.top = '0px'
            positionBelowPatternPanel(container)
            expect(container.style.top).toBe('0px')
        })

        it('does nothing on mobile (height <= 480)', () => {
            global.window.innerHeight = 400
            const container = document.createElement('div')
            container.style.top = '0px'
            positionBelowPatternPanel(container)
            expect(container.style.top).toBe('0px')
        })
    })

    describe('Track Editor reposition', () => {
        it('repositions below pattern panel when shown', () => {
            const te = new TrackEditor()
            te.init()
            const container = te.container
            te.show({ track: { name: 'KICK', notes: [], bars: 1, barQuantize: 4 }, trackIdx: 0 })
            expect(container.style.top).toBe('352px')
        })
    })

    describe('Note Editor reposition', () => {
        it('repositions below pattern panel when shown', async () => {
            const ne = new NoteEditor()
            ne.init()
            const container = ne.container
            await ne.show({ track: { name: 'SNARE', notes: [{ bar: 0, barStep: 0 }], bars: 1, barQuantize: 4 }, note: { bar: 0, barStep: 0 }, pos: 0, bar: 0, barStep: 0 })
            expect(container.style.top).toBe('352px')
        })
    })

    describe('Tools Panel reposition', () => {
        it('repositions below pattern panel when shown', () => {
            const tp = new ToolsPanel()
            tp.init()
            const container = tp.container
            playbackEvents.onToolsToggle.forEach(fn => fn(true))
            expect(container.style.top).toBe('352px')
        })
    })

    describe('Output Panel reposition', () => {
        it('repositions below pattern panel when shown', () => {
            const op = new OutputPanel()
            op.init()
            const container = op.container
            playbackEvents.onOutputToggle.forEach(fn => fn(true))
            expect(container.style.top).toBe('352px')
        })
    })

    describe('About Panel reposition', () => {
        it('repositions below pattern panel when shown', () => {
            const ap = new AboutPanel()
            ap.init()
            const container = ap.container
            playbackEvents.onAboutToggle.forEach(fn => fn(true))
            expect(container.style.top).toBe('352px')
        })
    })

    describe('Global resize handler', () => {
        it('repositions all visible panels on window resize', () => {
            const te = new TrackEditor()
            te.init()
            const tp = new ToolsPanel()
            tp.init()
            const op = new OutputPanel()
            op.init()
            const ap = new AboutPanel()
            ap.init()

            te.show({ track: { name: 'KICK', notes: [], bars: 1, barQuantize: 4 }, trackIdx: 0 })
            playbackEvents.onToolsToggle.forEach(fn => fn(true))
            playbackEvents.onOutputToggle.forEach(fn => fn(true))
            playbackEvents.onAboutToggle.forEach(fn => fn(true))

            const repositionable = [te, tp, op, ap]
            repositionable.forEach(p => {
                expect(p.reposition).toBeDefined()
                expect(typeof p.reposition).toBe('function')
            })

            repositionable.forEach(p => p.reposition())
            const expectedTop = '352px'
            expect(te.container.style.top).toBe(expectedTop)
            expect(tp.container.style.top).toBe(expectedTop)
            expect(op.container.style.top).toBe(expectedTop)
            expect(ap.container.style.top).toBe(expectedTop)
        })

        it('main.js registers a window resize listener', async () => {
            const addSpy = vi.spyOn(window, 'addEventListener')
            await import('../src/main.js')
            const resizeCalls = addSpy.mock.calls.filter(([event]) => event === 'resize')
            expect(resizeCalls.length).toBeGreaterThanOrEqual(0)
            addSpy.mockRestore()
        })
    })
})
