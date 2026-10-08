/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Lifecycle } from '../src/core/lifecycle.js'
import { playbackEvents } from '../src/state/event_bus.js'

const EVT = 'lifecycle-test-event'

describe('Lifecycle', () => {
    let life
    let handler

    beforeEach(() => {
        life = new Lifecycle()
        handler = vi.fn()
    })

    afterEach(() => {
        playbackEvents.emit(EVT, undefined)
        playbackEvents.clearListeners()
    })

    describe('listen()', () => {
        it('binds the handler until destroy()', () => {
            const btn = document.createElement('button')
            document.body.appendChild(btn)
            life.listen(btn, 'click', handler)

            btn.dispatchEvent(new Event('click'))
            expect(handler).toHaveBeenCalledTimes(1)

            life.destroy()
            btn.dispatchEvent(new Event('click'))
            expect(handler).toHaveBeenCalledTimes(1)
            btn.remove()
        })

        it('passes listener options through (capture)', () => {
            const btn = document.createElement('button')
            document.body.appendChild(btn)
            const captureSpy = vi.fn()
            life.listen(btn, 'focus', captureSpy, { capture: true })

            expect(() => btn.dispatchEvent(new Event('focus'))).not.toThrow()
            expect(captureSpy).toHaveBeenCalledTimes(1)
            life.destroy()
            btn.remove()
        })

        it('tolerates a null or undefined target', () => {
            expect(() => life.listen(null, 'click', handler)).not.toThrow()
            expect(() => life.listen(undefined, 'click', handler)).not.toThrow()
            life.destroy()
        })

        it('binds on document, not just elements', () => {
            life.listen(document, 'visibilitychange', handler)
            document.dispatchEvent(new Event('visibilitychange'))
            expect(handler).toHaveBeenCalledTimes(1)

            life.destroy()
            document.dispatchEvent(new Event('visibilitychange'))
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it('exposes the signal it binds on', () => {
            expect(life.signal.aborted).toBe(false)
            life.destroy()
            expect(life.signal.aborted).toBe(true)
        })
    })

    describe('sub()', () => {
        it('keeps the handler alive until destroy()', () => {
            life.sub(playbackEvents, EVT, handler)

            playbackEvents.emit(EVT, 1)
            expect(handler).toHaveBeenCalledTimes(1)

            life.destroy()
            playbackEvents.emit(EVT, 2)
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it('works with an injected bus (DI)', () => {
            const off = vi.fn()
            const bus = { on: vi.fn(() => off) }

            const returned = life.sub(bus, 'di-event', handler)
            expect(bus.on).toHaveBeenCalledWith('di-event', handler)
            expect(returned).toBe(off)

            life.destroy()
            expect(off).toHaveBeenCalled()
        })
    })

    describe('destroy()', () => {
        it('is idempotent — a second call releases nothing twice', () => {
            const off = vi.fn()
            const bus = { on: vi.fn(() => off) }
            life.sub(bus, 'evt', handler)

            life.destroy()
            life.destroy()
            expect(off).toHaveBeenCalledTimes(1)
        })

        it('releases listeners bound after a first destroy cycle only once', () => {
            const btn = document.createElement('button')
            document.body.appendChild(btn)
            life.destroy()
            // A destroyed lifecycle binds nothing: its signal is aborted.
            life.listen(btn, 'click', handler)
            btn.dispatchEvent(new Event('click'))
            expect(handler).not.toHaveBeenCalled()
            btn.remove()
        })
    })

    describe('reset()', () => {
        it('gives a fresh signal: old listeners stay dead, new ones fire', () => {
            const btn = document.createElement('button')
            document.body.appendChild(btn)
            const first = vi.fn()
            life.listen(btn, 'click', first)
            const bus = { on: vi.fn(() => vi.fn()), }
            life.sub(bus, 'evt', handler)

            life.reset()

            btn.dispatchEvent(new Event('click'))
            expect(first).not.toHaveBeenCalled()
            expect(bus.on.mock.results[0].value).toHaveBeenCalled()

            const second = vi.fn()
            life.listen(btn, 'click', second)
            btn.dispatchEvent(new Event('click'))
            expect(second).toHaveBeenCalledTimes(1)

            life.destroy()
            btn.dispatchEvent(new Event('click'))
            expect(second).toHaveBeenCalledTimes(1)
            btn.remove()
        })

        it('also releases pending bus subscriptions', () => {
            life.sub(playbackEvents, EVT, handler)
            life.reset()

            playbackEvents.emit(EVT, 1)
            expect(handler).not.toHaveBeenCalled()
        })
    })
})
