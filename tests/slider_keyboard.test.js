// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

/**
 * Reproduces the delegated keydown handler from src/main.js that makes all
 * <input type="range"> sliders respond to Arrow Left/Right when focused.
 *
 * Kept in sync with main.js — if the handler moves or changes, update both.
 */
function installSliderKeyHandler(doc = document) {
    doc.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        const el = e.target
        if (!(el instanceof HTMLInputElement) || el.type !== 'range') return
        if (el.disabled || el.readOnly) return

        const min = parseFloat(el.min) || 0
        const max = parseFloat(el.max) || 100
        const step = parseFloat(el.step) || 1
        const cur = parseFloat(el.value)
        const dir = e.key === 'ArrowRight' ? 1 : -1
        let next = cur + dir * step
        next = Math.round((next - min) / step) * step + min
        next = Math.min(max, Math.max(min, next))

        if (next === cur) {
            e.preventDefault()
            return
        }
        el.value = String(next)
        el.dispatchEvent(new Event('input',  { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        e.preventDefault()
    })
}

function makeSlider({ min = 0, max = 100, step = 1, value = 50 } = {}) {
    const el = document.createElement('input')
    el.type = 'range'
    el.min = String(min)
    el.max = String(max)
    el.step = String(step)
    el.value = String(value)
    document.body.appendChild(el)
    return el
}

function press(el, key) {
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('Slider keyboard navigation (Arrow Left/Right)', () => {
    const HANDLER_REF = { current: null }

    beforeAll(() => {
        installSliderKeyHandler(document)
    })

    beforeEach(() => {
        document.body.innerHTML = ''
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('ArrowRight increases the value by one step', () => {
        const s = makeSlider({ min: 0, max: 100, step: 1, value: 50 })
        press(s, 'ArrowRight')
        expect(s.value).toBe('51')
    })

    it('ArrowLeft decreases the value by one step', () => {
        const s = makeSlider({ min: 0, max: 100, step: 1, value: 50 })
        press(s, 'ArrowLeft')
        expect(s.value).toBe('49')
    })

    it('respects fractional steps (e.g. 0.01)', () => {
        const s = makeSlider({ min: 0, max: 1, step: 0.01, value: 0.5 })
        press(s, 'ArrowRight')
        expect(parseFloat(s.value)).toBeCloseTo(0.51, 5)
    })

    it('respects negative ranges and offsets', () => {
        const s = makeSlider({ min: -24, max: 24, step: 1, value: 0 })
        press(s, 'ArrowRight')
        expect(s.value).toBe('1')
        press(s, 'ArrowLeft')
        expect(s.value).toBe('0')
    })

    it('clamps to max when ArrowRight would exceed it', () => {
        const s = makeSlider({ min: 0, max: 10, step: 1, value: 10 })
        press(s, 'ArrowRight')
        expect(s.value).toBe('10')
    })

    it('clamps to min when ArrowLeft would go below it', () => {
        const s = makeSlider({ min: 0, max: 10, step: 1, value: 0 })
        press(s, 'ArrowLeft')
        expect(s.value).toBe('0')
    })

    it('fires input and change events so existing handlers run', () => {
        const s = makeSlider({ min: 0, max: 10, step: 1, value: 5 })
        const onInput = vi.fn()
        const onChange = vi.fn()
        s.addEventListener('input', onInput)
        s.addEventListener('change', onChange)
        press(s, 'ArrowRight')
        expect(onInput).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('does not fire input/change when value is already at boundary', () => {
        const s = makeSlider({ min: 0, max: 10, step: 1, value: 10 })
        const onInput = vi.fn()
        s.addEventListener('input', onInput)
        press(s, 'ArrowRight')
        expect(onInput).not.toHaveBeenCalled()
    })

    it('ignores non-range inputs (e.g. text, number, checkbox)', () => {
        const txt = document.createElement('input')
        txt.type = 'text'
        txt.value = 'hello'
        document.body.appendChild(txt)
        press(txt, 'ArrowRight')
        // Native behavior untouched — our handler must not interfere
        expect(txt.value).toBe('hello')
    })

    it('ignores ArrowUp/ArrowDown/Home/End (let native behavior handle them)', () => {
        const s = makeSlider({ min: 0, max: 10, step: 1, value: 5 })
        const onInput = vi.fn()
        s.addEventListener('input', onInput)
        press(s, 'ArrowUp')
        press(s, 'ArrowDown')
        press(s, 'Home')
        press(s, 'End')
        expect(onInput).not.toHaveBeenCalled()
    })

    it('ignores disabled sliders', () => {
        const s = makeSlider({ min: 0, max: 10, step: 1, value: 5 })
        s.disabled = true
        press(s, 'ArrowRight')
        expect(s.value).toBe('5')
    })

    it('ignores readonly sliders', () => {
        const s = makeSlider({ min: 0, max: 10, step: 1, value: 5 })
        s.readOnly = true
        press(s, 'ArrowRight')
        expect(s.value).toBe('5')
    })

    it('works on LFO dual-range sliders (min/max)', () => {
        // The LFO Range row contains two range inputs wrapped in a container
        // with pointer-events:none on the track. Keyboard must still work.
        const wrap = document.createElement('div')
        wrap.className = 'ne-range-container'
        const min = makeSlider({ min: 0, max: 1, step: 0.01, value: 0.0 })
        min.dataset.lfoKey = 'min'
        const max = makeSlider({ min: 0, max: 1, step: 0.01, value: 1.0 })
        max.dataset.lfoKey = 'max'
        wrap.append(min, max)
        document.body.appendChild(wrap)

        press(min, 'ArrowRight')
        expect(parseFloat(min.value)).toBeCloseTo(0.01, 5)
        press(max, 'ArrowLeft')
        expect(parseFloat(max.value)).toBeCloseTo(0.99, 5)
    })

    it('slider keeps focus after an arrow key changes the value', () => {
        const s = makeSlider({ min: 0, max: 100, step: 1, value: 50 })
        s.focus()
        expect(document.activeElement).toBe(s)
        press(s, 'ArrowRight')
        expect(document.activeElement).toBe(s)
        expect(s.value).toBe('51')
        press(s, 'ArrowRight')
        expect(document.activeElement).toBe(s)
        expect(s.value).toBe('52')
    })
})

/**
 * Reproduces the delegated click handler from src/main.js that focuses the
 * slider when the user clicks on its <label> (title) or <span.ne-val> (value).
 */
function installSliderFocusOnLabelClick(doc = document) {
    doc.addEventListener('click', (e) => {
        const t = e.target
        if (!(t instanceof HTMLElement)) return
        const isLabel = t.tagName === 'LABEL'
        const isValue = t instanceof HTMLSpanElement && t.classList.contains('ne-val')
        if (!isLabel && !isValue) return
        const row = t.closest('.ne-row')
        if (!row) return
        const slider = row.querySelector('input[type="range"]')
        if (slider && !slider.disabled) slider.focus()
    })
}

describe('Slider focus on label / value click', () => {
    beforeAll(() => {
        installSliderFocusOnLabelClick(document)
    })

    beforeEach(() => {
        document.body.innerHTML = ''
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    function makeRow({ label, value, sliderValue = 50 } = {}) {
        const row = document.createElement('div')
        row.className = 'ne-row'
        row.innerHTML = `
            <label>${label}</label>
            <input type="range" min="0" max="100" step="1" value="${sliderValue}">
            <span class="ne-val">${value}</span>
        `
        document.body.appendChild(row)
        return row
    }

    it('clicking the label focuses the slider in the same row', () => {
        const row = makeRow({ label: 'Volume', value: '50' })
        const label = row.querySelector('label')
        const slider = row.querySelector('input[type=range]')
        label.click()
        expect(document.activeElement).toBe(slider)
    })

    it('clicking the value display focuses the slider in the same row', () => {
        const row = makeRow({ label: 'Volume', value: '50' })
        const valSpan = row.querySelector('.ne-val')
        const slider = row.querySelector('input[type=range]')
        valSpan.click()
        expect(document.activeElement).toBe(slider)
    })

    it('does not focus anything if the row has no range input', () => {
        const row = document.createElement('div')
        row.className = 'ne-row'
        row.innerHTML = '<label>Title</label><span class="ne-val">val</span>'
        document.body.appendChild(row)
        const before = document.activeElement
        row.querySelector('label').click()
        expect(document.activeElement).toBe(before)
    })

    it('skips disabled sliders', () => {
        const row = makeRow({ label: 'Volume', value: '50' })
        const slider = row.querySelector('input[type=range]')
        slider.disabled = true
        const before = document.activeElement
        row.querySelector('label').click()
        expect(document.activeElement).toBe(before)
    })

    it('focuses the first slider in LFO dual-range rows', () => {
        const row = document.createElement('div')
        row.className = 'ne-row'
        row.innerHTML = `
            <label>Range</label>
            <div class="ne-range-container">
                <input type="range" min="0" max="1" step="0.01" value="0" data-lfo-key="min">
                <input type="range" min="0" max="1" step="0.01" value="1" data-lfo-key="max">
            </div>
            <span class="ne-val">0.0..1.0</span>
        `
        document.body.appendChild(row)
        const minSlider = row.querySelector('input[data-lfo-key="min"]')
        row.querySelector('label').click()
        expect(document.activeElement).toBe(minSlider)
    })

    it('clicking a label outside any .ne-row does nothing', () => {
        const label = document.createElement('label')
        label.textContent = 'orphan'
        document.body.appendChild(label)
        const before = document.activeElement
        label.click()
        expect(document.activeElement).toBe(before)
    })
})
