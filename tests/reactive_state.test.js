import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState, AppState } from '../src/state/app_state.js'
import { effect, computed } from '../src/core/signals.js'

describe('AppState reactive signals', () => {
    beforeEach(() => {
        appState.reset()
    })

    it('tracks appState property changes reactively with effect()', () => {
        const fn = vi.fn()
        const dispose = effect(() => {
            fn(appState.currentPage)
        })

        expect(fn).toHaveBeenCalledWith(0)
        expect(fn).toHaveBeenCalledTimes(1)

        appState.currentPage = 1
        expect(fn).toHaveBeenCalledWith(1)
        expect(fn).toHaveBeenCalledTimes(2)

        appState.currentPage = 2
        expect(fn).toHaveBeenCalledWith(2)
        expect(fn).toHaveBeenCalledTimes(3)

        dispose()
        appState.currentPage = 3
        expect(fn).toHaveBeenCalledTimes(3)
    })

    it('tracks showVus changes', () => {
        const fn = vi.fn()
        effect(() => {
            fn(appState.showVus)
        })

        expect(fn).toHaveBeenCalledWith(true)

        appState.showVus = false
        expect(fn).toHaveBeenCalledWith(false)
        expect(fn).toHaveBeenCalledTimes(2)
    })

    it('computes derived state from appState properties', () => {
        const pageTitle = computed(() => `Page ${appState.currentPage + 1}`)
        expect(pageTitle()).toBe('Page 1')

        appState.currentPage = 2
        expect(pageTitle()).toBe('Page 3')
    })

    it('new AppState instances are also reactive', () => {
        const customState = new AppState()
        const fn = vi.fn()

        effect(() => {
            fn(customState.selectedPatternNum)
        })

        expect(fn).toHaveBeenCalledWith(0)

        customState.selectedPatternNum = 4
        expect(fn).toHaveBeenCalledWith(4)
        expect(fn).toHaveBeenCalledTimes(2)
    })
})
