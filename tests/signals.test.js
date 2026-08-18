import { describe, it, expect, vi } from 'vitest'
import { createSignal, effect, batch } from '../src/core/signals.js'

describe('createSignal', () => {
    it('returns initial value', () => {
        const [get] = createSignal(42)
        expect(get()).toBe(42)
    })

    it('updates when set is called', () => {
        const [get, set] = createSignal(0)
        set(10)
        expect(get()).toBe(10)
    })

    it('supports functional updates', () => {
        const [get, set] = createSignal(5)
        set(v => v + 3)
        expect(get()).toBe(8)
    })

    it('does not notify if value unchanged', () => {
        const [get, set] = createSignal(5)
        const fn = vi.fn()
        effect(() => { fn(get()) })
        expect(fn).toHaveBeenCalledTimes(1)
        set(5)
        expect(fn).toHaveBeenCalledTimes(1)
    })
})

describe('effect', () => {
    it('runs immediately', () => {
        const [get] = createSignal(1)
        const fn = vi.fn()
        effect(() => { fn(get()) })
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('re-runs when signal changes', () => {
        const [get, set] = createSignal(0)
        const values = []
        effect(() => { values.push(get()) })
        set(1)
        set(2)
        set(3)
        expect(values).toEqual([0, 1, 2, 3])
    })

    it('only re-runs when read signals change', () => {
        const [getA, setA] = createSignal(0)
        const [getB, setB] = createSignal(0)
        const fn = vi.fn()
        effect(() => { fn(getA()) })
        setB(1)
        expect(fn).toHaveBeenCalledTimes(1)
        setA(1)
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('dispose stops re-runs', () => {
        const [get, set] = createSignal(0)
        const fn = vi.fn()
        const dispose = effect(() => { fn(get()) })
        set(1)
        expect(fn).toHaveBeenCalledTimes(2)
        dispose()
        set(2)
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('supports cleanup function returned from fn', () => {
        const [get, set] = createSignal(0)
        const cleanup = vi.fn()
        const dispose = effect(() => {
            get() // track
            return cleanup
        })
        expect(cleanup).not.toHaveBeenCalled()
        set(1)
        expect(cleanup).toHaveBeenCalledTimes(1)
        dispose()
        expect(cleanup).toHaveBeenCalledTimes(2)
    })
})

describe('batch', () => {
    it('defers effects until batch completes', () => {
        const [getA, setA] = createSignal(0)
        const [getB, setB] = createSignal(0)
        const fn = vi.fn()
        effect(() => { fn(getA(), getB()) })
        expect(fn).toHaveBeenCalledTimes(1)

        batch(() => {
            setA(1)
            setB(2)
        })
        expect(fn).toHaveBeenCalledTimes(2)
        expect(fn).toHaveBeenLastCalledWith(1, 2)
    })

    it('nested batch only flushes once', () => {
        const [get, set] = createSignal(0)
        const fn = vi.fn()
        effect(() => { fn(get()) })
        batch(() => {
            batch(() => {
                set(5)
            })
            expect(fn).toHaveBeenCalledTimes(1)
        })
        expect(fn).toHaveBeenCalledTimes(2)
    })
})
