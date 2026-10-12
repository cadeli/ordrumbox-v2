// @vitest-environment jsdom
//
// The knob drag must run on touch devices: a mouse-driven drag never sees a
// move event during a touch gesture, so mobile could not change any value.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { OrKnob } from '../src/ui/components/or_knob.js'

function makeKnob({ value = 0.5, onChange = null } = {}) {
    return new OrKnob({
        key: 'pan',
        label: 'Pan',
        min: 0,
        max: 1,
        step: 0.01,
        value,
        onChange,
    })
}

const TOUCH = { bubbles: true, button: 0, pointerId: 1, pointerType: 'touch', isPrimary: true }

function knobEl(knob) {
    const el = knob.createElement()
    return { row: el, disc: el.querySelector('.or-knob') }
}

/** 40 px upward drag on a 0..1 knob = +0.20 (sensitivity (max-min)/200 per px). */
function touchDragUp(disc, fromY = 200, px = 40) {
    disc.dispatchEvent(new PointerEvent('pointerdown', { ...TOUCH, clientY: fromY }))
    window.dispatchEvent(new PointerEvent('pointermove', { ...TOUCH, clientY: fromY - px }))
    window.dispatchEvent(new PointerEvent('pointerup', TOUCH))
}

describe('OrKnob — touch drag', () => {
    it('a pointer drag upward changes the value and commits it', () => {
        const changes = []
        const knob = makeKnob({ onChange: (v) => changes.push(v) })
        const { disc } = knobEl(knob)

        touchDragUp(disc)

        expect(knob.getValue()).toBeCloseTo(0.7, 5)
        expect(changes.at(-1)).toBeCloseTo(0.7, 5)
    })

    it('the drag is over on pointerup: the class drops and later moves are ignored', () => {
        const knob = makeKnob()
        const { disc } = knobEl(knob)

        disc.dispatchEvent(new PointerEvent('pointerdown', { ...TOUCH, clientY: 200 }))
        window.dispatchEvent(new PointerEvent('pointermove', { ...TOUCH, clientY: 160 }))
        window.dispatchEvent(new PointerEvent('pointerup', TOUCH))

        expect(disc.classList.contains('dragging')).toBe(false)
        const settled = knob.getValue()

        window.dispatchEvent(new PointerEvent('pointermove', { ...TOUCH, clientY: 0 }))
        expect(knob.getValue()).toBe(settled)
    })

    it('the compatibility mousedown of the same gesture does not rebase the drag', () => {
        const knob = makeKnob()
        const { disc } = knobEl(knob)

        disc.dispatchEvent(new PointerEvent('pointerdown', { ...TOUCH, clientY: 200 }))
        // A browser follows pointerdown with a compatibility mousedown; a wrong
        // clientY there would move the origin and skew every later move.
        disc.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 999 }))
        window.dispatchEvent(new PointerEvent('pointermove', { ...TOUCH, clientY: 160 }))

        expect(knob.getValue()).toBeCloseTo(0.7, 5)
    })

    it('pointercancel (stolen gesture) ends the drag instead of leaving it stuck', () => {
        const knob = makeKnob()
        const { disc } = knobEl(knob)

        disc.dispatchEvent(new PointerEvent('pointerdown', { ...TOUCH, clientY: 200 }))
        window.dispatchEvent(new PointerEvent('pointercancel', TOUCH))

        expect(disc.classList.contains('dragging')).toBe(false)
        const settled = knob.getValue()
        window.dispatchEvent(new PointerEvent('pointermove', { ...TOUCH, clientY: 0 }))
        expect(knob.getValue()).toBe(settled)
    })

    it('the stylesheet keeps the gesture on the knob (touch-action: none)', () => {
        const css = readFileSync(resolve(import.meta.dirname, '../src/ui/styles.css'), 'utf8')
        const rule = css.match(/\.or-knob \{[^}]*\}/s)?.[0] ?? ''
        expect(rule).toMatch(/touch-action:\s*none/)
    })
})
