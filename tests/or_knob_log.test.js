// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { OrKnob } from '../src/ui/components/or_knob.js'
import { KNOB_PROPS } from '../src/ui/track_editor/track_editor_constants.js'

const DECAY = KNOB_PROPS.find((p) => p.key === 'decay')

function makeKnob({ min = 20, max = 5000, step = 10, scale = 'log', value = 20 } = {}) {
    return new OrKnob({
        key: 'decay',
        label: 'Decay',
        min,
        max,
        step,
        value,
        scale,
        format: (v) => `${Math.round(v)} ms`,
    })
}

function arcDeg(knob) {
    const el = knob.createElement()
    return parseFloat(el.querySelector('.or-knob').style.getPropertyValue('--arc-deg'))
}

/** Drag the knob upward by `dy` screen pixels and return the resulting value. */
function dragUp(knob, dy) {
    const el = knob.createElement()
    el.querySelector('.or-knob').dispatchEvent(new MouseEvent('mousedown', { button: 0, clientY: 200, bubbles: true }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 200 - dy }))
    window.dispatchEvent(new MouseEvent('mouseup'))
    return knob.getValue()
}

describe('OrKnob — logarithmic scale', () => {
    it('track editor decay knob is log-scaled with a defined (min > 0) range', () => {
        expect(DECAY).toMatchObject({ min: 20, max: 5000, step: 10, scale: 'log' })
    })

    it('arc spans the full 0–270° range', () => {
        expect(arcDeg(makeKnob({ value: 20 }))).toBeCloseTo(0, 5)
        expect(arcDeg(makeKnob({ value: 5000 }))).toBeCloseTo(270, 5)
    })

    it('gives small values most of the arc (200 ms sits at ~42%)', () => {
        const logArc = arcDeg(makeKnob({ value: 200 }))
        const linearArc = arcDeg(makeKnob({ value: 200, scale: 'linear' }))

        // log: log10(200/20) / log10(5000/20) * 270
        expect(logArc).toBeCloseTo(112.6, 0)
        expect(logArc).toBeGreaterThan(linearArc * 5)
    })

    it('falls back to linear instead of a NaN arc when min is 0', () => {
        const knob = makeKnob({ min: 0, scale: 'log', value: 2500 })
        const arc = arcDeg(knob)
        expect(Number.isFinite(arc)).toBe(true)
        expect(arc).toBeCloseTo(135, 5)
    })

    it('a small drag at the low end moves much less than a linear knob', () => {
        const logVal = dragUp(makeKnob({ scale: 'log', value: 20 }), 10)
        const linearVal = dragUp(makeKnob({ scale: 'linear', value: 20 }), 10)

        expect(logVal).toBeGreaterThanOrEqual(30)
        expect(logVal).toBeLessThanOrEqual(50)
        expect(linearVal).toBeGreaterThanOrEqual(250)
        expect(logVal).toBeLessThan(linearVal)
    })

    it('drag still respects min, max and step', () => {
        expect(dragUp(makeKnob({ scale: 'log', value: 5000 }), 400)).toBe(5000)
        const down = makeKnob({ scale: 'log', value: 100 })
        const el = down.createElement()
        el.querySelector('.or-knob').dispatchEvent(
            new MouseEvent('mousedown', { button: 0, clientY: 0, bubbles: true }),
        )
        window.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }))
        window.dispatchEvent(new MouseEvent('mouseup'))
        expect(down.getValue()).toBe(20)
    })
})
