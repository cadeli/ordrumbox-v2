/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playbackEvents } from '../src/state/playback_events.js'
import BasePanel from '../src/ui/base_panel.js'

const EVT = 'lifecycle-test-event'

class TestPanel extends BasePanel {
    constructor(id = 'test-panel') {
        super(id)
        this.syncCount = 0
        this.destroyCount = 0
    }

    sync() {
        this.syncCount++
    }

    onDestroy() {
        this.destroyCount++
    }
}

class ExternalContainerPanel extends BasePanel {
    constructor(external) {
        super('external-panel')
        this.external = external
        this.container = external
    }

    createDOM() {
        this.container = this.external
    }
}

describe('BasePanel lifecycle', () => {
    let handler

    beforeEach(() => {
        handler = vi.fn()
        document.body.innerHTML = ''
    })

    afterEach(() => {
        playbackEvents.emit(EVT, undefined)
        document.body.innerHTML = ''
    })

    it('sub() keeps the handler alive until destroy()', () => {
        const panel = new TestPanel()
        panel.init()
        panel.sub(playbackEvents, EVT, handler)

        playbackEvents.emit(EVT, 1)
        expect(handler).toHaveBeenCalledTimes(1)

        panel.destroy()
        playbackEvents.emit(EVT, 2)
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('destroy() unsubscribes handlers and detaches an owned container', () => {
        const panel = new TestPanel()
        panel.init()
        panel.sub(playbackEvents, EVT, handler)
        const container = panel.container
        expect(document.body.contains(container)).toBe(true)

        panel.destroy()
        expect(panel.destroyCount).toBe(1)
        expect(document.body.contains(container)).toBe(false)

        playbackEvents.emit(EVT)
        expect(handler).not.toHaveBeenCalled()
    })

    it('keeps an external container on destroy()', () => {
        const external = document.createElement('div')
        document.body.appendChild(external)
        const panel = new ExternalContainerPanel(external)
        panel.init()

        panel.destroy()
        expect(document.body.contains(external)).toBe(true)
    })

    it('re-initializing the same id destroys the previous instance (no double bind)', () => {
        const first = new TestPanel()
        first.init()
        first.sub(playbackEvents, EVT, handler)
        const firstContainer = first.container

        const second = new TestPanel()
        second.init()

        expect(first.destroyCount).toBe(1)
        expect(document.body.contains(firstContainer)).toBe(false)

        playbackEvents.emit(EVT)
        expect(handler).not.toHaveBeenCalled()
        expect(second.syncCount).toBe(1)
    })

    it('init() is idempotent on the same instance', () => {
        const panel = new TestPanel()
        panel.init()
        panel.sub(playbackEvents, EVT, handler)

        panel.init()
        expect(panel.destroyCount).toBe(1)
        expect(panel.syncCount).toBe(2)

        playbackEvents.emit(EVT)
        expect(handler).not.toHaveBeenCalled()

        panel.sub(playbackEvents, EVT, handler)
        playbackEvents.emit(EVT)
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('custom init() using beginInit() gets the same protection', () => {
        const firstHandler = vi.fn()
        const secondHandler = vi.fn()

        class CustomPanel extends BasePanel {
            constructor(panelHandler) {
                super('custom-panel')
                this.panelHandler = panelHandler
                this.subscribeCount = 0
            }

            init() {
                this.beginInit()
                this.createDOM()
                this.subscribe()
            }

            subscribe() {
                this.subscribeCount++
                this.sub(playbackEvents, EVT, this.panelHandler)
            }
        }

        const first = new CustomPanel(firstHandler)
        first.init()
        const second = new CustomPanel(secondHandler)
        second.init()

        expect(second.subscribeCount).toBe(1)

        playbackEvents.emit(EVT)
        expect(firstHandler).not.toHaveBeenCalled()
        expect(secondHandler).toHaveBeenCalledTimes(1)
    })

    it('sub() works with an injected bus (DI)', () => {
        const off = vi.fn()
        const bus = { on: vi.fn(() => off) }
        const panel = new TestPanel()
        panel.init()

        panel.sub(bus, 'di-event', handler)
        expect(bus.on).toHaveBeenCalledWith('di-event', handler)

        panel.destroy()
        expect(off).toHaveBeenCalled()
    })
})
