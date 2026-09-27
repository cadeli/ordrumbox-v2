// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initSelectDropdown } from '../src/ui/select_dropdown.js'

function pointer(target, type = 'pointerdown') {
    const evt = new Event(type, { bubbles: true, cancelable: true })
    target.dispatchEvent(evt)
    return evt
}

function key(target, key, init = {}) {
    const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(evt)
    return evt
}

function popups() {
    return [...document.querySelectorAll('.od-select-popup')]
}

function rows() {
    return [...document.querySelectorAll('.od-select-option')]
}

describe('select_dropdown', () => {
    let select

    beforeEach(() => {
        document.body.innerHTML = ''
        select = document.createElement('select')
        select.innerHTML = `
            <option value="one">One</option>
            <option value="two">Two</option>
            <option value="off" disabled>Off</option>`
        select.value = 'one'
        document.body.appendChild(select)
        initSelectDropdown()
    })

    it('opens a popup with one row per option and suppresses the native default', () => {
        const evt = pointer(select)
        expect(evt.defaultPrevented).toBe(true)
        expect(popups()).toHaveLength(1)
        expect(rows()).toHaveLength(3)
        expect(rows().map((r) => r.textContent)).toEqual(['One', 'Two', 'Off'])
        expect(rows()[0].classList.contains('is-selected')).toBe(true)
        expect(rows()[0].classList.contains('is-active')).toBe(true)
        expect(document.querySelectorAll('.od-select-group')).toHaveLength(0)
    })

    it('clicking the same select again closes the popup (toggle)', () => {
        pointer(select)
        pointer(select)
        expect(popups()).toHaveLength(0)
    })

    it('selecting an option sets the value and dispatches input + change', () => {
        const onInput = vi.fn()
        const onChange = vi.fn()
        select.addEventListener('input', onInput)
        select.addEventListener('change', onChange)

        pointer(select)
        pointer(rows()[1])

        expect(select.value).toBe('two')
        expect(onInput).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(popups()).toHaveLength(0)
    })

    it('re-selecting the current value does not fire change', () => {
        const onChange = vi.fn()
        select.addEventListener('change', onChange)
        pointer(select)
        pointer(rows()[0])
        expect(onChange).not.toHaveBeenCalled()
        expect(select.value).toBe('one')
    })

    it('disabled options cannot be committed', () => {
        const onChange = vi.fn()
        select.addEventListener('change', onChange)
        pointer(select)
        pointer(rows()[2])
        expect(onChange).not.toHaveBeenCalled()
        expect(select.value).toBe('one')
        expect(popups()).toHaveLength(1)
    })

    it('pointing outside closes the popup', () => {
        pointer(select)
        const outside = document.createElement('div')
        document.body.appendChild(outside)
        pointer(outside)
        expect(popups()).toHaveLength(0)
    })

    it('Escape closes the popup', () => {
        pointer(select)
        key(select, 'Escape')
        expect(popups()).toHaveLength(0)
    })

    it('keyboard: Enter opens, arrows move the highlight, Enter commits', () => {
        const evt = key(select, 'Enter')
        expect(evt.defaultPrevented).toBe(true)
        expect(popups()).toHaveLength(1)
        expect(rows()[0].classList.contains('is-active')).toBe(true)

        key(select, 'ArrowDown')
        expect(rows()[1].classList.contains('is-active')).toBe(true)

        const onChange = vi.fn()
        select.addEventListener('change', onChange)
        key(select, 'Enter')
        expect(select.value).toBe('two')
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(popups()).toHaveLength(0)
    })

    it('keyboard: never lands on a disabled option', () => {
        key(select, 'ArrowDown')
        expect(popups()).toHaveLength(1)
        expect(rows()[0].classList.contains('is-active')).toBe(true)

        key(select, 'ArrowDown')
        expect(rows()[1].classList.contains('is-active')).toBe(true)

        key(select, 'ArrowDown')
        expect(rows()[1].classList.contains('is-active')).toBe(true)
        expect(rows()[2].classList.contains('is-active')).toBe(false)

        key(select, 'End')
        expect(rows()[1].classList.contains('is-active')).toBe(true)
        key(select, 'Home')
        expect(rows()[0].classList.contains('is-active')).toBe(true)
    })

    it('renders optgroup headers once per group', () => {
        select.innerHTML = `
            <optgroup label="Drums"><option value="kick">Kick</option><option value="snare">Snare</option></optgroup>
            <optgroup label="Cymbals"><option value="hat">Hat</option></optgroup>`
        pointer(select)
        const heads = [...document.querySelectorAll('.od-select-group')]
        expect(heads.map((h) => h.textContent)).toEqual(['Drums', 'Cymbals'])
        expect(rows()).toHaveLength(3)
    })

    it('only one popup exists at a time across selects', () => {
        const other = document.createElement('select')
        other.innerHTML = '<option value="x">X</option>'
        document.body.appendChild(other)
        pointer(select)
        pointer(other)
        expect(popups()).toHaveLength(1)
    })

    it('disabled and multiple selects keep their native behaviour', () => {
        const disabled = document.createElement('select')
        disabled.disabled = true
        document.body.appendChild(disabled)
        const evt = pointer(disabled)
        expect(evt.defaultPrevented).toBe(false)
        expect(popups()).toHaveLength(0)

        const multi = document.createElement('select')
        multi.multiple = true
        document.body.appendChild(multi)
        expect(pointer(multi).defaultPrevented).toBe(false)
        expect(popups()).toHaveLength(0)
    })
})
