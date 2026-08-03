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
                onChange
            })
            const el = knob.createElement()
            document.body.appendChild(el)

            const knobEl = el.querySelector('.or-knob')
            knobEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

            expect(knob.getValue()).toBe(0.5)
            expect(onChange).toHaveBeenCalledWith(0.5, 'vol')
        })

        it('supports Shift precision mode during Arrow key navigation', () => {
            const onChange = vi.fn()
            const knob = new OrKnob({
                key: 'vol',
                label: 'Volume',
                min: 0,
                max: 1,
                step: 0.1,
                value: 0.5,
                onChange
            })
            const el = knob.createElement()
            document.body.appendChild(el)

            const knobEl = el.querySelector('.or-knob')
            // Shift + ArrowUp -> step * 0.1
            knobEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }))

            expect(knob.getValue()).toBeCloseTo(0.51)
            expect(onChange).toHaveBeenCalledWith(expect.closeTo(0.51, 4), 'vol')
        })

        it('opens window.prompt on contextmenu for direct numeric input', () => {
            const onChange = vi.fn()
            const knob = new OrKnob({
                key: 'pitch',
                label: 'Pitch',
                min: -12,
                max: 12,
                step: 1,
                value: 0,
                onChange
            })
            const el = knob.createElement()
            document.body.appendChild(el)

            vi.spyOn(window, 'prompt').mockReturnValue('7')

            const knobEl = el.querySelector('.or-knob')
            knobEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

            expect(window.prompt).toHaveBeenCalled()
            expect(knob.getValue()).toBe(7)
            expect(onChange).toHaveBeenCalledWith(7, 'pitch')
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
                onChange
            })
            const el = slider.createElement()
            document.body.appendChild(el)

            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

            expect(slider.getValue()).toBe(0)
            expect(onChange).toHaveBeenCalledWith(0, 'pan')
        })

        it('supports Shift precision mode on Arrow key navigation', () => {
            const onChange = vi.fn()
            const slider = new OrSlider({
                key: 'cutoff',
                label: 'Cutoff',
                min: 0,
                max: 1,
                step: 0.1,
                value: 0.5,
                onChange
            })
            const el = slider.createElement()
            document.body.appendChild(el)

            const input = el.querySelector('input[type=range]')
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }))

            expect(slider.getValue()).toBeCloseTo(0.51)
            expect(onChange).toHaveBeenCalledWith(0.51, 'cutoff')
        })

        it('opens window.prompt on contextmenu for direct numeric input', () => {
            const onChange = vi.fn()
            const slider = new OrSlider({
                key: 'decay',
                label: 'Decay',
                min: 0,
                max: 2,
                step: 0.01,
                value: 0.5,
                onChange
            })
            const el = slider.createElement()
            document.body.appendChild(el)

            vi.spyOn(window, 'prompt').mockReturnValue('1.25')

            el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

            expect(window.prompt).toHaveBeenCalled()
            expect(slider.getValue()).toBe(1.25)
            expect(onChange).toHaveBeenCalledWith(1.25, 'decay')
        })
    })
})
