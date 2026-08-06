// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import OutputPanel from '../src/ui/output_panel.js'
import { serviceRegistry } from '../src/state/service_registry.js'

describe('OutputPanel — compressor bypass button', () => {
    let panel
    let setMasterBusMock

    beforeEach(() => {
        document.body.innerHTML = ''
        setMasterBusMock = vi.fn()
        serviceRegistry.audioEngine = { mixer: { setMasterBus: setMasterBusMock } }
        panel = new OutputPanel()
        panel.init()
    })

    it('exists in the compressor tab with initial "ON" label', () => {
        const compPanel = panel.container.querySelector('[data-tab-panel="compressor"]')
        const btn = compPanel.querySelector('.ne-btn')
        expect(btn).not.toBeNull()
        expect(btn.textContent).toBe('ON')
    })

    it('starts with active class (compressor ON by default)', () => {
        const compPanel = panel.container.querySelector('[data-tab-panel="compressor"]')
        const btn = compPanel.querySelector('.ne-btn')
        expect(btn.classList.contains('active')).toBe(true)
    })

    it('clicking toggles to OFF and dispatches bypass: true', () => {
        const compPanel = panel.container.querySelector('[data-tab-panel="compressor"]')
        const btn = compPanel.querySelector('.ne-btn')
        btn.click()
        expect(btn.textContent).toBe('OFF')
        expect(btn.classList.contains('active')).toBe(false)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ bypass: true })
    })

    it('clicking again toggles back to ON and dispatches bypass: false', () => {
        const compPanel = panel.container.querySelector('[data-tab-panel="compressor"]')
        const btn = compPanel.querySelector('.ne-btn')
        btn.click()
        btn.click()
        expect(btn.textContent).toBe('ON')
        expect(btn.classList.contains('active')).toBe(true)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ bypass: false })
    })

    it('bypass button is the first interactive element in the compressor grid', () => {
        const compPanel = panel.container.querySelector('[data-tab-panel="compressor"]')
        const grid = compPanel.querySelector('#op-comp-grid')
        const btn = grid.querySelector('.ne-btn')
        expect(btn).not.toBeNull()
        expect(btn.textContent).toBe('ON')
    })
})
