// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import OutputPanel from '../src/ui/output_panel.js'
import { serviceRegistry } from '../src/state/service_registry.js'

function fireInput(el, value) {
    el.value = String(value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('OutputPanel — OrSlider integration', () => {
    let panel
    let setMasterBusMock

    beforeEach(() => {
        document.body.innerHTML = ''
        setMasterBusMock = vi.fn()
        serviceRegistry.audioEngine = { mixer: { setMasterBus: setMasterBusMock } }
        panel = new OutputPanel()
        panel.init()
    })

    it('renders the master volume slider with correct id, label, min/max', () => {
        const input = panel.container.querySelector('#op-master-vol')
        expect(input).not.toBeNull()
        expect(input.type).toBe('range')
        expect(input.min).toBe('0')
        expect(input.max).toBe('2')
        expect(input.step).toBe('0.01')
        expect(input.value).toBe('1')
        const row = input.closest('.ne-row')
        expect(row.classList.contains('no-cursor')).toBe(true)
        expect(row.querySelector('label').textContent).toBe('Volume')
    })

    it('master volume: changing value calls setMasterBus({ master }) and updates display', () => {
        const input  = panel.container.querySelector('#op-master-vol')
        const valEl  = input.nextElementSibling
        fireInput(input, 1.5)
        expect(setMasterBusMock).toHaveBeenCalledWith({ master: 1.5 })
        expect(valEl.textContent).toBe('1.50')
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
        fireInput(lowcut, 80)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ lowcut: 80, hicut: 18500 })
        fireInput(hicut, 12000)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ lowcut: 80, hicut: 12000 })
    })

    it('compressor sliders: 6 rows with correct keys, labels, units, and display', () => {
        const expected = [
            { key: 'threshold', label: 'Threshold', unit: 'dB', display: '-18 dB' },
            { key: 'ratio',     label: 'Ratio',     unit: '',   display: '8' },
            { key: 'attack',    label: 'Attack',    unit: 's',  display: '0.002 s' },
            { key: 'release',   label: 'Release',   unit: 's',  display: '0.08 s' },
            { key: 'knee',      label: 'Knee',      unit: 'dB', display: '3 dB' },
            { key: 'makeup',    label: 'Makeup',    unit: 'dB', display: '8 dB' },
        ]
        for (const e of expected) {
            const input = panel.container.querySelector(`input[data-key="${e.key}"]`)
            expect(input, `missing input for ${e.key}`).not.toBeNull()
            const row = input.closest('.ne-row')
            expect(row.classList.contains('no-cursor')).toBe(true)
            expect(row.querySelector('label').textContent).toBe(e.label)
            expect(input.nextElementSibling.textContent).toBe(e.display)
        }
    })

    it('compressor: changing a slider calls setMasterBus with the correct key', () => {
        const threshold = panel.container.querySelector('input[data-key="threshold"]')
        fireInput(threshold, -20)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ threshold: -20 })
    })

    it('compressor: sub-second params (attack/release) show 3 decimals', () => {
        const attack = panel.container.querySelector('input[data-key="attack"]')
        fireInput(attack, 0.123)
        expect(attack.nextElementSibling.textContent).toBe('0.123 s')
    })

    it('compressor: integer params (threshold/knee/ratio) show rounded values', () => {
        const ratio = panel.container.querySelector('input[data-key="ratio"]')
        fireInput(ratio, 8)
        expect(ratio.nextElementSibling.textContent).toBe('8')
        const knee = panel.container.querySelector('input[data-key="knee"]')
        fireInput(knee, 12.7)
        expect(knee.nextElementSibling.textContent).toBe('13 dB')
    })

    it('pre-gain slider: renders with correct range and calls setMasterBus', () => {
        const preGain = panel.container.querySelector('input[data-key="op-pregain"]')
        expect(preGain).not.toBeNull()
        expect(preGain.min).toBe('-20')
        expect(preGain.max).toBe('20')
        expect(preGain.value).toBe('0')
        expect(preGain.nextElementSibling.textContent).toBe('+0.0 dB')
        fireInput(preGain, 6)
        expect(setMasterBusMock).toHaveBeenLastCalledWith({ preGain: 6 })
        expect(preGain.nextElementSibling.textContent).toBe('+6.0 dB')
        fireInput(preGain, -3)
        expect(preGain.nextElementSibling.textContent).toBe('-3.0 dB')
    })

    it('panel toggle selectors still resolve (id and :nth-child)', () => {
        const masterTarget = panel.container.querySelector('#op-master-vol')
        expect(masterTarget).not.toBeNull()
        const groups = panel.container.querySelectorAll('.ne-group')
        expect(groups[1].querySelector('.ne-group-label').textContent).toBe('Compressor')
        expect(groups[2].querySelector('.ne-group-label').textContent).toBe('Filters')
    })

    it('keyboard arrows on a slider still work (delegated handler from main.js)', () => {
        // The OrSlider component has its own keydown handler, but the
        // delegated handler from main.js also covers all range inputs.
        // We just verify that an ArrowRight on the master volume updates it.
        const input = panel.container.querySelector('#op-master-vol')
        input.focus()
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
        expect(parseFloat(input.value)).toBeCloseTo(1.01, 5)
        // OrSlider's own _onKeydown fires the onChange callback
        expect(setMasterBusMock).toHaveBeenCalled()
    })
})
