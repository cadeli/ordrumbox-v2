/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { showToast } from '../src/ui/toast.js'

describe('showToast', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
        vi.useFakeTimers()
    })

    it('creates the container on first call', () => {
        showToast('hello')
        const c = document.getElementById('odbox-toast-container')
        expect(c).not.toBeNull()
        expect(c.style.position).toBe('fixed')
    })

    it('reuses the container across calls', () => {
        showToast('a')
        showToast('b')
        const c = document.getElementById('odbox-toast-container')
        expect(c.children.length).toBe(2)
    })

    it('injects the keyframes style exactly once', () => {
        showToast('a')
        showToast('b')
        showToast('c')
        const styles = document.querySelectorAll('#odbox-toast-keyframes')
        expect(styles.length).toBe(1)
    })

    it('renders the message text', () => {
        showToast('it works')
        const toast = document.querySelector('#odbox-toast-container > div')
        expect(toast.textContent).toBe('it works')
    })

    it('applies info background by default', () => {
        showToast('info msg')
        const toast = document.querySelector('#odbox-toast-container > div')
        expect(toast.style.background).toContain('--bg-elevated')
    })

    it('applies success background for type success', () => {
        showToast('ok', 'success')
        const toast = document.querySelector('#odbox-toast-container > div')
        expect(toast.style.background).toContain('--bg-success')
    })

    it('applies error background for type error', () => {
        showToast('fail', 'error')
        const toast = document.querySelector('#odbox-toast-container > div')
        expect(toast.style.background).toContain('--bg')
    })

    it('falls back to info styling for unknown type', () => {
        showToast('what', 'bogus')
        const toast = document.querySelector('#odbox-toast-container > div')
        expect(toast.style.background).toContain('--bg-elevated')
    })

    it('dismisses after 3s for info', () => {
        showToast('bye')
        const toast = document.querySelector('#odbox-toast-container > div')
        expect(toast).not.toBeNull()

        vi.advanceTimersByTime(3000)
        expect(toast.style.opacity).toBe('0')

        vi.advanceTimersByTime(250)
        expect(document.querySelector('#odbox-toast-container > div')).toBeNull()
    })

    it('dismisses after 4.5s for error', () => {
        showToast('err', 'error')
        const toast = document.querySelector('#odbox-toast-container > div')

        vi.advanceTimersByTime(4500)
        expect(toast.style.opacity).toBe('0')

        vi.advanceTimersByTime(250)
        expect(document.querySelector('#odbox-toast-container > div')).toBeNull()
    })
})
