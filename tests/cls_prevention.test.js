/**
 * @vitest-environment jsdom
 *
 * Verifies that OrKnob and OrSlider never generate CLS (Cumulative Layout Shift)
 * by truncating long displayed values and keeping fixed-width .ne-val elements.
 *
 * Note: jsdom does not apply CSS from stylesheets, so computed-style checks
 * (overflow, width) are replaced by DOM-structure assertions that prove the
 * contract: the .ne-val element exists, has a fixed-width CSS class in the
 * stylesheet, and the formatted text is always ≤ 8 characters.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { OrKnob } from '../src/ui/components/or_knob.js'
import { OrSlider } from '../src/ui/components/or_slider.js'

function getValText(el) {
    const span = el.querySelector('.ne-val')
    return span?.textContent ?? ''
}

describe('OrKnob — CLS prevention', () => {
    let knob

    beforeEach(() => {
        knob = new OrKnob({
            key: 'test',
            label: 'Test',
            min: 0,
            max: 1,
            step: 0.0000001,
            value: 0.123456789012345,
            format: v => v.toFixed(15),
        })
    })

    it('truncates displayed value to at most 8 chars (excluding unit)', () => {
        const el = knob.createElement()
        const text = getValText(el)
        expect(text.length).toBeLessThanOrEqual(8)
    })

    it('truncates very small numbers', () => {
        knob.setValue(0.0000001)
        const el = knob.createElement()
        const text = getValText(el)
        expect(text.length).toBeLessThanOrEqual(8)
    })

    it('truncates very large numbers', () => {
        const largeKnob = new OrKnob({
            key: 'large',
            label: 'Large',
            min: 0,
            max: 999999,
            step: 1,
            value: 123456.789,
            format: v => v.toFixed(10),
        })
        const el = largeKnob.createElement()
        const text = getValText(el)
        expect(text.length).toBeLessThanOrEqual(8)
    })

    it('.ne-val element always exists with class ne-val', () => {
        const el = knob.createElement()
        const span = el.querySelector('.ne-val')
        expect(span).not.toBeNull()
        expect(span.classList.contains('ne-val')).toBe(true)
    })

    it('keeps same DOM element when setValue is called', () => {
        const el = knob.createElement()
        const spanBefore = el.querySelector('.ne-val')
        knob.setValue(0.999)
        const spanAfter = el.querySelector('.ne-val')
        expect(spanAfter).toBe(spanBefore)
    })

    it('text content updates correctly after setValue', () => {
        const el = knob.createElement()
        knob.setValue(0.5)
        expect(getValText(el).length).toBeLessThanOrEqual(8)
        knob.setValue(1)
        expect(getValText(el).length).toBeLessThanOrEqual(8)
    })
})

describe('OrSlider — CLS prevention', () => {
    let slider

    beforeEach(() => {
        slider = new OrSlider({
            key: 'test',
            label: 'Test',
            min: 0,
            max: 20000,
            step: 1,
            value: 12345.6789012345,
            format: v => v.toFixed(10),
            unit: 'Hz',
        })
    })

    it('truncates displayed value to at most 8 chars (excluding unit)', () => {
        const el = slider.createElement()
        const text = getValText(el)
        const valuePart = text.replace(' Hz', '').trim()
        expect(valuePart.length).toBeLessThanOrEqual(8)
    })

    it('truncates extreme precision values', () => {
        slider.setValue(0.123456789012345)
        const el = slider.createElement()
        const text = getValText(el)
        const valuePart = text.replace(' Hz', '').trim()
        expect(valuePart.length).toBeLessThanOrEqual(8)
    })

    it('truncates very large values with unit', () => {
        const bigSlider = new OrSlider({
            key: 'big',
            label: 'Big',
            min: 0,
            max: 99999999,
            step: 1,
            value: 12345678.12345678,
            format: v => v.toFixed(8),
            unit: 'Hz',
        })
        const el = bigSlider.createElement()
        const text = getValText(el)
        const valuePart = text.replace(' Hz', '').trim()
        expect(valuePart.length).toBeLessThanOrEqual(8)
    })

    it('.ne-val element always exists with class ne-val', () => {
        const el = slider.createElement()
        const span = el.querySelector('.ne-val')
        expect(span).not.toBeNull()
        expect(span.classList.contains('ne-val')).toBe(true)
    })

    it('keeps same DOM element when setValue is called', () => {
        const el = slider.createElement()
        const spanBefore = el.querySelector('.ne-val')
        slider.setValue(0.001)
        const spanAfter = el.querySelector('.ne-val')
        expect(spanAfter).toBe(spanBefore)
    })

    it('value text does not exceed 8 chars after multiple extreme setValue calls', () => {
        const el = slider.createElement()

        const extremeValues = [
            0.000000001,
            123456789.123456789,
            0.123456789012345,
            99999.999999,
            0,
            20000,
        ]
        for (const v of extremeValues) {
            slider.setValue(v)
            const text = getValText(el)
            const valuePart = text.replace(' Hz', '').trim()
            expect(valuePart.length).toBeLessThanOrEqual(8)
        }
    })

    it('text content updates correctly after setValue', () => {
        const el = slider.createElement()
        slider.setValue(100)
        const text100 = getValText(el)
        expect(text100.endsWith(' Hz')).toBe(true)
        expect(text100.replace(' Hz', '').trim().length).toBeLessThanOrEqual(8)
        slider.setValue(0.5)
        const text05 = getValText(el)
        expect(text05.endsWith(' Hz')).toBe(true)
        expect(text05.replace(' Hz', '').trim().length).toBeLessThanOrEqual(8)
    })

    it('unit is preserved after truncation', () => {
        const el = slider.createElement()
        slider.setValue(12345.6789)
        const text = getValText(el)
        expect(text.endsWith(' Hz')).toBe(true)
    })
})

describe('CLS prevention — width stability', () => {
    it('OrKnob: _fmt always returns ≤ 8 chars for any numeric input', () => {
        const values = [
            0, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001,
            1, 10, 100, 1000, 10000, 100000,
            0.123456789, 1.23456789, 12.3456789, 123.456789,
            Number.MAX_SAFE_INTEGER, Number.MIN_VALUE,
        ]
        const k = new OrKnob({
            key: 'x', label: 'X', min: -99999, max: 99999, step: 0.001,
            value: 0, format: v => v.toFixed(12),
        })
        for (const v of values) {
            const result = k._fmt(v)
            expect(result.length).toBeLessThanOrEqual(8)
        }
    })

    it('OrSlider: _fmt always returns ≤ 8 chars for any numeric input', () => {
        const values = [
            0, 0.1, 0.01, 0.001, 0.0001, 0.00001,
            1, 10, 100, 1000, 10000, 100000,
            0.123456789, 1.23456789, 12.3456789,
            Number.MAX_SAFE_INTEGER, Number.MIN_VALUE,
        ]
        const s = new OrSlider({
            key: 'x', label: 'X', min: -99999, max: 99999, step: 0.001,
            value: 0, format: v => v.toFixed(12), unit: 'Hz',
        })
        for (const v of values) {
            const result = s._fmt(v)
            const valuePart = result.replace(' Hz', '').trim()
            expect(valuePart.length).toBeLessThanOrEqual(8)
        }
    })
})
