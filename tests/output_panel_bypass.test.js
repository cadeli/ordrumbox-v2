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

    it('exists in the compressor tab with active class (compressor ON by default)', () => {
        const btn = panel.container.querySelector('.op-comp-bypass')
        expect(btn).not.toBeNull()
        expect(btn.classList.contains('active')).toBe(true)
    })

    it('clicking toggles to OFF and dispatches bypass: true', () => {
        const btn = panel.container.querySelector('.op-comp-bypass')
        btn.click()
        expect(btn.classList.contains('active')).toBe(false)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ bypass: true })
    })

    it('clicking again toggles back to ON and dispatches bypass: false', () => {
        const btn = panel.container.querySelector('.op-comp-bypass')
        btn.click()
        btn.click()
        expect(btn.classList.contains('active')).toBe(true)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ bypass: false })
    })

    it('bypass button is inside the compressor panel header', () => {
        const header = panel.container.querySelector('.op-comp-header')
        expect(header).not.toBeNull()
        const btn = header.querySelector('.op-comp-bypass')
        expect(btn).not.toBeNull()
        expect(btn.classList.contains('active')).toBe(true)
    })
})
