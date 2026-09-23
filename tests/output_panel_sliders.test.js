// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import OutputPanel from '../src/ui/output_panel.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

describe('OutputPanel — master controls', () => {
    let panel
    let setMasterBusMock

    beforeEach(() => {
        document.body.innerHTML = ''
        setMasterBusMock = vi.fn()
        serviceRegistry.audioEngine = { mixer: { setMasterBus: setMasterBusMock } }
        serviceRegistry.resourcesLoader = { saveSettings: vi.fn() }
        soundRegistry.reset()
        panel = new OutputPanel()
        panel.init()
    })

    it('renders the master volume knob with correct label and initial value', () => {
        const knob = panel.container.querySelector('[data-or-knob="op-master-vol"]')
        expect(knob).not.toBeNull()
        expect(knob.closest('.ne-row-knob')).not.toBeNull()
        const row = knob.closest('.ne-row')
        expect(row.querySelector('.or-knob-label').textContent).toBe('Volume')
        expect(row.querySelector('.ne-val').textContent).toBe('1.00')
    })

    it('master volume: setValue calls setMasterBus({ master })', () => {
        panel.getKnob('op-master-vol').setValue(1.01, true)
        expect(setMasterBusMock).toHaveBeenCalledWith({ master: 1.01 })
    })

    it('master volume knob: setValue calls setMasterBus', () => {
        panel.getKnob('op-master-vol').setValue(0.99, true)
        expect(setMasterBusMock).toHaveBeenCalledWith({ master: 0.99 })
    })

    it('low cut / high cut sliders: built with correct ranges and "Hz" unit', () => {
        const lowcut = panel.container.querySelector('input[data-key="op-lowcut"]')
        const hicut = panel.container.querySelector('input[data-key="op-hicut"]')
        expect(lowcut).not.toBeNull()
        expect(lowcut.min).toBe('10')
        expect(lowcut.max).toBe('500')
        expect(lowcut.value).toBe('35')
        expect(lowcut.nextElementSibling.textContent).toBe('35 Hz')
        expect(hicut).not.toBeNull()
        expect(hicut.min).toBe('1000')
        expect(hicut.max).toBe('20000')
        expect(hicut.value).toBe('18500')
        expect(hicut.nextElementSibling.textContent).toBe('18500 Hz')
    })

    it('low cut / high cut: each change pushes both values together', () => {
        const lowcut = panel.container.querySelector('input[data-key="op-lowcut"]')
        const hicut = panel.container.querySelector('input[data-key="op-hicut"]')
        lowcut.value = '80'
        lowcut.dispatchEvent(new Event('input', { bubbles: true }))
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ lowcut: 80, hicut: 18500 })
        hicut.value = '12000'
        hicut.dispatchEvent(new Event('input', { bubbles: true }))
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ lowcut: 80, hicut: 12000 })
    })

    it('panel tab buttons have correct labels', () => {
        const tabs = panel.container.querySelectorAll('.ne-tab-btn[data-ne-tab]')
        const labels = Array.from(tabs).map((b) => b.textContent.trim())
        expect(labels).toEqual(['vol', 'Comp', 'Flt'])
    })
})

describe('OutputPanel — compressor (VST knobs)', () => {
    let panel
    let setMasterBusMock

    beforeEach(() => {
        document.body.innerHTML = ''
        setMasterBusMock = vi.fn()
        serviceRegistry.audioEngine = { mixer: { setMasterBus: setMasterBusMock } }
        serviceRegistry.resourcesLoader = { saveSettings: vi.fn() }
        soundRegistry.reset()
        panel = new OutputPanel()
        panel.init()
    })

    it('renders 6 compressor knobs with correct labels and default values', () => {
        const expected = [
            { key: 'threshold', label: 'Threshold', display: '-18 dB' },
            { key: 'ratio', label: 'Ratio', display: '8' },
            { key: 'attack', label: 'Attack', display: '0.002 s' },
            { key: 'release', label: 'Release', display: '0.08 s' },
            { key: 'knee', label: 'Knee', display: '3 dB' },
            { key: 'makeup', label: 'Makeup', display: '8 dB' },
        ]
        for (const e of expected) {
            const knob = panel.container.querySelector(`[data-or-knob="${e.key}"]`)
            expect(knob, `missing knob for ${e.key}`).not.toBeNull()
            const row = knob.closest('.ne-row')
            expect(row.querySelector('.or-knob-label').textContent).toBe(e.label)
            expect(row.querySelector('.ne-val').textContent).toBe(e.display)
        }
    })

    it('compressor: setValue on knob calls setMasterBus with correct key', () => {
        panel.getKnob('threshold').setValue(-17, true)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ threshold: -17 })
    })

    it('compressor: sub-second params (attack/release) show 3 decimals', () => {
        panel.getKnob('attack').setValue(0.003, true)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ attack: 0.003 })
        const val = panel.container.querySelector('[data-or-knob="attack"]').closest('.ne-row').querySelector('.ne-val')
        expect(val.textContent).toBe('0.003 s')
    })

    it('compressor: integer params (ratio/knee/makeup) show rounded values', () => {
        panel.getKnob('ratio').setValue(8.5, true)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ ratio: 8.5 })
        const ratioVal = panel.container
            .querySelector('[data-or-knob="ratio"]')
            .closest('.ne-row')
            .querySelector('.ne-val')
        expect(ratioVal.textContent).toBe('8.5')

        panel.getKnob('knee').setValue(4, true)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ knee: 4 })
        const kneeVal = panel.container
            .querySelector('[data-or-knob="knee"]')
            .closest('.ne-row')
            .querySelector('.ne-val')
        expect(kneeVal.textContent).toBe('4 dB')
    })

    it('pre-gain knob: renders with correct value and calls setMasterBus', () => {
        const knobEl = panel.container.querySelector('[data-or-knob="op-pregain"]')
        expect(knobEl).not.toBeNull()
        const val = knobEl.closest('.ne-row').querySelector('.ne-val')
        expect(val.textContent).toBe('+0.0 dB')
        panel.getKnob('op-pregain').setValue(0.5, true)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ preGain: 0.5 })
    })

    it('bypass button: toggles compressor on/off', () => {
        const btn = panel.container.querySelector('.op-comp-bypass')
        expect(btn).not.toBeNull()
        expect(btn.classList.contains('active')).toBe(true)
        btn.click()
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ bypass: true })
        expect(btn.classList.contains('active')).toBe(false)
        btn.click()
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ bypass: false })
        expect(btn.classList.contains('active')).toBe(true)
    })

    it('compressor panel has VST-style header', () => {
        const header = panel.container.querySelector('.op-comp-header')
        expect(header).not.toBeNull()
        const title = header.querySelector('.op-comp-title')
        expect(title.textContent).toBe('COMPRESSOR')
    })

    it('compressor panel renders a transfer curve canvas', () => {
        const canvas = panel.container.querySelector('#op-comp-curve')
        expect(canvas).not.toBeNull()
        expect(canvas.tagName).toBe('CANVAS')
        expect(canvas.width).toBe(320)
        expect(canvas.height).toBe(140)
    })

    it('curve sits beside the pregain knob in a top row', () => {
        const topRow = panel.container.querySelector('.op-comp-top-row')
        expect(topRow).not.toBeNull()
        const pregain = topRow.querySelector('.op-comp-pregain')
        const curve = topRow.querySelector('.op-comp-curve-wrap')
        expect(pregain).not.toBeNull()
        expect(curve).not.toBeNull()
        // pregain comes before curve in DOM order
        expect(Array.from(topRow.children).indexOf(pregain)).toBeLessThan(Array.from(topRow.children).indexOf(curve))
        // top row comes before the COMPRESSOR header
        const panelEl = panel.container.querySelector('#op-comp-panel')
        const children = Array.from(panelEl.children)
        const topRowIdx = children.indexOf(topRow)
        const headerIdx = children.findIndex((c) => c.classList.contains('op-comp-header'))
        const knobsIdx = children.findIndex((c) => c.classList.contains('op-comp-knobs'))
        expect(topRowIdx).toBeGreaterThanOrEqual(0)
        expect(headerIdx).toBeGreaterThan(topRowIdx)
        expect(knobsIdx).toBeGreaterThan(headerIdx)
    })

    it('changing threshold/ratio/knee/makeup triggers curve redraw', () => {
        const canvas = panel.container.querySelector('#op-comp-curve')
        const ctx = canvas.getContext('2d')
        ctx.beginPath.mockClear()
        ctx.stroke.mockClear()
        panel.getKnob('threshold').setValue(-24, true)
        expect(ctx.beginPath).toHaveBeenCalled()
        expect(ctx.stroke).toHaveBeenCalled()
    })

    it('toggling bypass triggers curve redraw', () => {
        const canvas = panel.container.querySelector('#op-comp-curve')
        const ctx = canvas.getContext('2d')
        ctx.beginPath.mockClear()
        ctx.stroke.mockClear()
        panel.container.querySelector('.op-comp-bypass').click()
        expect(ctx.beginPath).toHaveBeenCalled()
        expect(ctx.stroke).toHaveBeenCalled()
    })

    it('attack/release changes do not redraw the curve (time-domain only)', () => {
        const canvas = panel.container.querySelector('#op-comp-curve')
        const ctx = canvas.getContext('2d')
        ctx.beginPath.mockClear()
        panel.getKnob('attack').setValue(0.5, true)
        expect(ctx.beginPath).not.toHaveBeenCalled()
    })
})
