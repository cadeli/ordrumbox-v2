// tests/base_control.test.js — shared gestures/formatting of OrKnob & OrSlider
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OrKnob } from '../src/ui/components/or_knob.js'
import { OrSlider } from '../src/ui/components/or_slider.js'

const CONTROLS = [
    {
        name: 'OrKnob',
        /** @param {object} cfg */
        make: (cfg) =>
            new OrKnob({
                key: 'k',
                label: 'Test',
                min: 0,
                max: 10,
                step: 0.5,
                value: 1,
                defaultValue: 2,
                unit: 'ms',
                format: (v) => String(v),
                ...cfg,
            }),
        /** The element carrying the shared gestures besides the value span. */
        gestureTarget: (row) => row.querySelector('.or-knob'),
    },
    {
        name: 'OrSlider',
        /** @param {object} cfg */
        make: (cfg) =>
            new OrSlider({
                key: 'k',
                label: 'Test',
                min: 0,
                max: 10,
                step: 0.5,
                value: 1,
                defaultValue: 2,
                unit: 'ms',
                format: (v) => String(v),
                ...cfg,
            }),
        gestureTarget: (row) => row,
    },
]

function dblclick(el) {
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
}

function rightclick(el) {
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
}

describe.each(CONTROLS)('BaseControl — $name', ({ make, gestureTarget }) => {
    let promptSpy

    beforeEach(() => {
        document.body.innerHTML = ''
        promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('double-click on the control resets to defaultValue and fires onChange', () => {
        const onChange = vi.fn()
        const ctl = make({ onChange })
        const row = ctl.createElement()
        document.body.appendChild(row)

        dblclick(gestureTarget(row))

        expect(ctl.getValue()).toBe(2)
        expect(onChange).toHaveBeenCalledWith(2, 'k')
    })

    it('double-click on the value span resets to defaultValue', () => {
        const onChange = vi.fn()
        const ctl = make({ onChange })
        const row = ctl.createElement()
        document.body.appendChild(row)

        dblclick(row.querySelector('.ne-val'))

        expect(ctl.getValue()).toBe(2)
        expect(onChange).toHaveBeenCalledWith(2, 'k')
    })

    it('right-click opens the numeric prompt and applies the typed value', () => {
        promptSpy.mockReturnValue('7')
        const onChange = vi.fn()
        const ctl = make({ onChange })
        const row = ctl.createElement()
        document.body.appendChild(row)

        rightclick(gestureTarget(row))

        expect(promptSpy).toHaveBeenCalledWith('Enter value for Test (0–10 ms):', '1')
        expect(ctl.getValue()).toBe(7)
        expect(onChange).toHaveBeenCalledWith(7, 'k')
    })

    it('cancelling the prompt keeps the value and stays silent', () => {
        promptSpy.mockReturnValue(null)
        const onChange = vi.fn()
        const ctl = make({ onChange })
        const row = ctl.createElement()
        document.body.appendChild(row)

        rightclick(gestureTarget(row))

        expect(ctl.getValue()).toBe(1)
        expect(onChange).not.toHaveBeenCalled()
    })

    it('formatValue clips the raw format to 8 chars then appends the unit', () => {
        const ctl = make({ format: (v) => v.toFixed(12) })
        const out = ctl.formatValue(3.141592653589)
        expect(out.split(' ')[0].length).toBeLessThanOrEqual(8)
        expect(out.endsWith(' ms')).toBe(true)
    })

    it('setValue with triggerCallback fires onChange', () => {
        const onChange = vi.fn()
        const ctl = make({ onChange, step: 0.1, value: 0.5 })
        ctl.createElement()

        ctl.setValue(0.51, true)

        expect(ctl.getValue()).toBeCloseTo(0.51, 4)
        expect(onChange).toHaveBeenCalledWith(0.51, 'k')
    })
})

describe('prompt sanitizing', () => {
    let promptSpy

    beforeEach(() => {
        document.body.innerHTML = ''
        promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('OrKnob snaps the typed value onto its step grid', () => {
        promptSpy.mockReturnValue('7.3')
        const knob = new OrKnob({ key: 'k', label: 'T', min: 0, max: 10, step: 0.5, value: 1 })
        const row = knob.createElement()
        document.body.appendChild(row)
        rightclick(row.querySelector('.or-knob'))
        expect(knob.getValue()).toBe(7.5)
    })

    it('OrSlider clamps the typed value to the range', () => {
        promptSpy.mockReturnValue('99')
        const slider = new OrSlider({ key: 'k', label: 'T', min: 0, max: 10, step: 0.5, value: 1 })
        const row = slider.createElement()
        document.body.appendChild(row)
        rightclick(row)
        expect(slider.getValue()).toBe(10)
    })
})
