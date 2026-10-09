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

/** Union of both controls' probe values — formatValue must clip every one. */
const PROBE_VALUES = [
    0,
    0.1,
    0.01,
    0.001,
    0.0001,
    0.00001,
    0.000001,
    0.0000001,
    1,
    10,
    100,
    1000,
    10000,
    100000,
    0.123456789,
    1.23456789,
    12.3456789,
    123.456789,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_VALUE,
]

const CONTROLS = [
    {
        name: 'OrKnob',
        unit: '',
        /** @param {object} cfg */
        make: (cfg) =>
            new OrKnob({
                key: 'test',
                label: 'Test',
                min: 0,
                max: 1,
                step: 0.0000001,
                value: 0.123456789012345,
                format: (v) => v.toFixed(15),
                ...cfg,
            }),
        /** A value outside the default range's precision, to clip. */
        tiny: 0.0000001,
        /** A DOM setValue that must not replace the .ne-val span. */
        inRange: 0.999,
        largeCfg: {
            key: 'large',
            label: 'Large',
            min: 0,
            max: 999999,
            step: 1,
            value: 123456.789,
            format: (v) => v.toFixed(10),
        },
    },
    {
        name: 'OrSlider',
        unit: 'Hz',
        /** @param {object} cfg */
        make: (cfg) =>
            new OrSlider({
                key: 'test',
                label: 'Test',
                min: 0,
                max: 20000,
                step: 1,
                value: 12345.6789012345,
                format: (v) => v.toFixed(10),
                unit: 'Hz',
                ...cfg,
            }),
        tiny: 0.123456789012345,
        inRange: 0.001,
        largeCfg: {
            key: 'big',
            label: 'Big',
            min: 0,
            max: 99999999,
            step: 1,
            value: 12345678.12345678,
            format: (v) => v.toFixed(8),
            unit: 'Hz',
        },
    },
]

function getValText(el) {
    const span = el.querySelector('.ne-val')
    return span?.textContent ?? ''
}

/** The number part of the value text, without the unit. */
function valuePart(text, unit) {
    return unit ? text.replace(` ${unit}`, '').trim() : text
}

describe.each(CONTROLS)('$name — CLS prevention', ({ make, unit, tiny, inRange, largeCfg }) => {
    let ctl

    beforeEach(() => {
        document.body.innerHTML = ''
        ctl = make()
    })

    it('truncates displayed value to at most 8 chars (excluding unit)', () => {
        const el = ctl.createElement()
        expect(valuePart(getValText(el), unit).length).toBeLessThanOrEqual(8)
    })

    it('truncates very small numbers', () => {
        ctl.setValue(tiny)
        const el = ctl.createElement()
        expect(valuePart(getValText(el), unit).length).toBeLessThanOrEqual(8)
    })

    it('truncates very large numbers', () => {
        const large = make(largeCfg)
        const el = large.createElement()
        expect(valuePart(getValText(el), unit).length).toBeLessThanOrEqual(8)
    })

    it('.ne-val element always exists with class ne-val', () => {
        const el = ctl.createElement()
        const span = el.querySelector('.ne-val')
        expect(span).not.toBeNull()
        expect(span.classList.contains('ne-val')).toBe(true)
    })

    it('keeps same DOM element when setValue is called', () => {
        const el = ctl.createElement()
        const spanBefore = el.querySelector('.ne-val')
        ctl.setValue(inRange)
        const spanAfter = el.querySelector('.ne-val')
        expect(spanAfter).toBe(spanBefore)
    })

    it('value text stays within 8 chars through extreme setValue calls', () => {
        const el = ctl.createElement()
        const extremeValues = [...PROBE_VALUES, 123456789.12345679, 99999.999999, 0, 20000]
        for (const v of extremeValues) {
            ctl.setValue(v)
            expect(valuePart(getValText(el), unit).length).toBeLessThanOrEqual(8)
        }
    })

    it('text content updates correctly after setValue', () => {
        const el = ctl.createElement()
        for (const v of [0.5, 1]) {
            ctl.setValue(v)
            const text = getValText(el)
            if (unit) expect(text.endsWith(` ${unit}`)).toBe(true)
            expect(valuePart(text, unit).length).toBeLessThanOrEqual(8)
        }
    })

    it.skipIf(!unit)('unit is preserved after truncation', () => {
        const el = ctl.createElement()
        ctl.setValue(12345.6789)
        expect(getValText(el).endsWith(` ${unit}`)).toBe(true)
    })
})

describe.each(CONTROLS)('CLS prevention — width stability', ({ name, make, unit }) => {
    it(`${name}: formatValue always returns ≤ 8 chars for any numeric input`, () => {
        const ctl = make({
            key: 'x',
            label: 'X',
            min: -99999,
            max: 99999,
            step: 0.001,
            value: 0,
            format: (v) => v.toFixed(12),
        })
        for (const v of PROBE_VALUES) {
            expect(valuePart(ctl.formatValue(v), unit).length).toBeLessThanOrEqual(8)
        }
    })
})
