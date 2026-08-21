// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import OutputPanel from '../src/ui/output_panel.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

function fireKey(el, key) {
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

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

    it('master volume: arrow key changes value and calls setMasterBus({ master })', () => {
        const knob = panel.container.querySelector('[data-or-knob="op-master-vol"]')
        fireKey(knob, 'ArrowRight')
        expect(setMasterBusMock).toHaveBeenCalledWith({ master: 1.01 })
        const valEl = knob.closest('.ne-row').querySelector('.ne-val')
        expect(valEl.textContent).toBe('1.01')
    })

    it('master volume knob: ArrowDown decrements value', () => {
        const knob = panel.container.querySelector('[data-or-knob="op-master-vol"]')
        fireKey(knob, 'ArrowDown')
        expect(setMasterBusMock).toHaveBeenCalledWith({ master: 0.99 })
    })

    it('low cut / high cut sliders: built with correct ranges and "Hz" unit', () => {
        const lowcut = panel.container.querySelector('input[data-key="op-lowcut"]')
        const hicut  = panel.container.querySelector('input[data-key="op-hicut"]')
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
        const hicut  = panel.container.querySelector('input[data-key="op-hicut"]')
        lowcut.value = '80'
        lowcut.dispatchEvent(new Event('input', { bubbles: true }))
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ lowcut: 80, hicut: 18500 })
        hicut.value = '12000'
        hicut.dispatchEvent(new Event('input', { bubbles: true }))
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ lowcut: 80, hicut: 12000 })
    })

    it('panel tab buttons have correct labels', () => {
        const tabs = panel.container.querySelectorAll('.ne-tab-btn[data-ne-tab]')
        const labels = Array.from(tabs).map(b => b.textContent.trim())
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
            { key: 'ratio',     label: 'Ratio',     display: '8' },
            { key: 'attack',    label: 'Attack',    display: '0.002 s' },
            { key: 'release',   label: 'Release',   display: '0.08 s' },
            { key: 'knee',      label: 'Knee',      display: '3 dB' },
            { key: 'makeup',    label: 'Makeup',    display: '8 dB' },
        ]
        for (const e of expected) {
            const knob = panel.container.querySelector(`[data-or-knob="${e.key}"]`)
            expect(knob, `missing knob for ${e.key}`).not.toBeNull()
            const row = knob.closest('.ne-row')
            expect(row.querySelector('.or-knob-label').textContent).toBe(e.label)
            expect(row.querySelector('.ne-val').textContent).toBe(e.display)
        }
    })

    it('compressor: arrow key on knob calls setMasterBus with correct key', () => {
        const knob = panel.container.querySelector('[data-or-knob="threshold"]')
        fireKey(knob, 'ArrowRight')
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ threshold: -17 })
    })

    it('compressor: sub-second params (attack/release) show 3 decimals', () => {
        const knob = panel.container.querySelector('[data-or-knob="attack"]')
        fireKey(knob, 'ArrowRight')
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ attack: 0.003 })
        const val = knob.closest('.ne-row').querySelector('.ne-val')
        expect(val.textContent).toBe('0.003 s')
    })

    it('compressor: integer params (ratio/knee/makeup) show rounded values', () => {
        const ratio = panel.container.querySelector('[data-or-knob="ratio"]')
        fireKey(ratio, 'ArrowRight')
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ ratio: 8.5 })
        const ratioVal = ratio.closest('.ne-row').querySelector('.ne-val')
        expect(ratioVal.textContent).toBe('8.5')

        const knee = panel.container.querySelector('[data-or-knob="knee"]')
        fireKey(knee, 'ArrowRight')
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ knee: 4 })
        const kneeVal = knee.closest('.ne-row').querySelector('.ne-val')
        expect(kneeVal.textContent).toBe('4 dB')
    })

    it('pre-gain knob: renders with correct value and calls setMasterBus', () => {
        const knob = panel.container.querySelector('[data-or-knob="op-pregain"]')
        expect(knob).not.toBeNull()
        const val = knob.closest('.ne-row').querySelector('.ne-val')
        expect(val.textContent).toBe('+0.0 dB')
        fireKey(knob, 'ArrowRight')
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
})
