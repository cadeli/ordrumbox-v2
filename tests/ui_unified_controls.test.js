// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrKnob } from '../src/ui/components/or_knob.js'
import { OrSlider } from '../src/ui/components/or_slider.js'

describe('Unified UI Controls — OrKnob & OrSlider Features', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    describe('OrKnob', () => {
        it('resets to defaultValue on double-click', () => {
            const onChange = vi.fn()
            const knob = new OrKnob({
                key: 'vol',
                label: 'Volume',
                min: 0,
                max: 1,
                step: 0.01,
                value: 0.8,
                defaultValue: 0.5,
                onChange,
            })
            const el = knob.createElement()
            document.body.appendChild(el)

            const knobEl = el.querySelector('.or-knob')
            knobEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

            expect(knob.getValue()).toBe(0.5)
            expect(onChange).toHaveBeenCalledWith(0.5, 'vol')
        })

        it('setValue with triggerCallback fires onChange', () => {
            const onChange = vi.fn()
            const knob = new OrKnob({
                key: 'vol',
                label: 'Volume',
                min: 0,
                max: 1,
                step: 0.1,
                value: 0.5,
                onChange,
            })
            knob.createElement()

            knob.setValue(0.51, true)

            expect(knob.getValue()).toBeCloseTo(0.51, 4)
            expect(onChange).toHaveBeenCalledWith(0.51, 'vol')
        })
    })

    describe('OrSlider', () => {
        it('resets to defaultValue on double-click', () => {
            const onChange = vi.fn()
            const slider = new OrSlider({
                key: 'pan',
                label: 'Pan',
                min: -1,
                max: 1,
                step: 0.01,
                value: 0.8,
                defaultValue: 0,
                onChange,
            })
            const el = slider.createElement()
            document.body.appendChild(el)

            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

            expect(slider.getValue()).toBe(0)
            expect(onChange).toHaveBeenCalledWith(0, 'pan')
        })

        it('setValue with triggerCallback fires onChange', () => {
            const onChange = vi.fn()
            const slider = new OrSlider({
                key: 'cutoff',
                label: 'Cutoff',
                min: 0,
                max: 1,
                step: 0.1,
                value: 0.5,
                onChange,
            })
            slider.createElement()

            slider.setValue(0.51, true)

            expect(slider.getValue()).toBeCloseTo(0.51, 4)
            expect(onChange).toHaveBeenCalledWith(0.51, 'cutoff')
        })
    })
})
