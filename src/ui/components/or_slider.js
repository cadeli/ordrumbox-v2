/**
 * OrSlider — unified slider component for ordrumbox-v2
 *
 * Aggregates all common slider features of the app:
 *   - label + input[type=range] + value display
 *   - configurable unit and display format
 *   - normalization/denormalization (e.g. filterFreq in Hz)
 *   - LFO indicator (CSS class has-lfo)
 *   - keyboard control: Arrow ±step, Shift+Arrow ±step×10, Alt+Arrow ±step÷10
 *   - programatic update via setValue()
 *   - onChange callback with denormalized value
 * Config, value core and the double-click / right-click gestures come from
 * BaseControl.
 *
 * Usage — HTML generation (template literal sections):
 *   const s = new OrSlider({ key:'velocity', label:'Velo', min:0, max:1, step:0.01, value:0.8,
 *                             onChange: v => track.velocity = v })
 *   rowDiv.innerHTML = s.toHTML()
 *   s.mount(rowDiv)     // bind events on the injected DOM
 *
 * Usage — imperative DOM creation:
 *   const s = new OrSlider({ ... })
 *   const el = s.createElement()   // returns the div.ne-row ready
 *   container.appendChild(el)
 *
 * Public API:
 *   s.setValue(val)       — updates the slider and display (denormalized value)
 *   s.getValue()          — returns current denormalized value
 *   s.setHasLfo(bool)     — toggles the CSS class has-lfo
 *   s.setDisabled(bool)   — toggles the control
 *   s.destroy()           — removes event listeners
 *   s.el                  — reference to DOM element (after mount/createElement)
 */

import { escapeHtml as _escHtml } from './ui_utils.js'
import { clamp } from '../../core/numbers.js'
import { BaseControl } from './base_control.js'

export class OrSlider extends BaseControl {
    #normalize
    #denormalize
    #noCursor
    #dataAttr
    #input
    #boundOnInput
    #boundOnKeydown

    /**
     * @param {Object}   cfg
     * @param {string}   cfg.key            Identifier (data-key on the input)
     * @param {string}   cfg.label          Label text
     * @param {number}   cfg.min            Minimum value (normalized space)
     * @param {number}   cfg.max            Maximum value (normalized space)
     * @param {number}   cfg.step           Base step
     * @param {number}   cfg.value          Initial value (denormalized)
     * @param {number}   [cfg.defaultValue] Value restored by double-click (defaults to value)
     * @param {string}   [cfg.unit]         Unit displayed after the value (e.g. 'Hz', 'ms')
     * @param {Function} [cfg.format]       (valDenorm) => string - display format
     * @param {Function} [cfg.normalize]    (valDenorm) => valNorm - for the input space
     * @param {Function} [cfg.denormalize]  (valNorm)   => valDenorm - inverse
     * @param {boolean}  [cfg.hasLfo]       Adds CSS class has-lfo
     * @param {boolean}  [cfg.noCursor]     Adds CSS class no-cursor
     * @param {string}   [cfg.dataAttr]     Name of the data-* attribute (default: 'data-key')
     * @param {string}   [cfg.extraClass]   Additional CSS class added to the row
     * @param {Function} [cfg.onChange]     (valDenorm, key) => void
     */
    constructor(cfg) {
        super(cfg)
        this.#normalize = cfg.normalize ?? null
        this.#denormalize = cfg.denormalize ?? null
        this.#noCursor = cfg.noCursor ?? false
        this.#dataAttr = cfg.dataAttr ?? 'data-key'

        this.#input = null
        this.#boundOnInput = this.#onInput.bind(this)
        this.#boundOnKeydown = this.#onKeydown.bind(this)
    }

    // ─── Internal helpers ───────────────────────────────────────────────────

    /** Converts a denormalized value to an input range value */
    #toNorm(v) {
        return this.#normalize ? this.#normalize(v) : v
    }

    /** Converts an input range value to an application value */
    #toDenorm(v) {
        return this.#denormalize ? this.#denormalize(v) : v
    }

    /** Row CSS classes */
    #rowClasses() {
        const classes = this.rowClassList()
        if (this.#noCursor) classes.push('no-cursor')
        return classes.join(' ')
    }

    // ─── HTML generation (template literal mode) ────────────────────────────

    /**
     * Returns the row HTML (label + input + span).
     * Then call mount(rowEl) to bind events.
     */
    toHTML() {
        const normVal = this.#toNorm(this.getValue())
        const displayVal = this.formatValue(this.getValue())
        return `<div class="${this.#rowClasses()}" data-or-control="${this.key}" data-prop="${this.key}">
            <label>${_escHtml(this.label)}</label>
            <input type="range"
                   min="${this.min}" max="${this.max}" step="${this.step}"
                   value="${normVal}"
                   ${this.#dataAttr}="${this.key}">
            <span class="ne-val" ${this.#dataAttr}="${this.key}">${displayVal}</span>
        </div>`
    }

    /**
     * Binds events on a div.ne-row already injected into the DOM.
     * @param {HTMLElement} rowEl  The element returned by toHTML(), already in the DOM.
     */
    mount(rowEl) {
        this.el = rowEl
        this.#input = rowEl.querySelector(`input[type=range]`)
        this.setValSpan(rowEl.querySelector(`.ne-val`))
        this.#bind()
    }

    // ─── Imperative DOM creation ────────────────────────────────────────────

    /**
     * Creates and returns the complete div.ne-row element, ready to be appended.
     * Events are already bound.
     */
    createElement() {
        const div = document.createElement('div')
        div.className = this.#rowClasses()
        div.dataset.orControl = this.key

        const label = document.createElement('label')
        label.textContent = this.label

        const input = document.createElement('input')
        input.type = 'range'
        input.min = String(this.min)
        input.max = String(this.max)
        input.step = String(this.step)
        input.value = this.#toNorm(this.getValue())
        input.setAttribute(this.#dataAttr, this.key)

        const span = document.createElement('span')
        span.className = 'ne-val'
        span.setAttribute(this.#dataAttr, this.key)
        span.textContent = this.formatValue(this.getValue())

        div.appendChild(label)
        div.appendChild(input)
        div.appendChild(span)

        this.el = div
        this.#input = input
        this.setValSpan(span)

        this.#bind()
        return div
    }

    // ─── Event binding ──────────────────────────────────────────────────────

    #bind() {
        this.#unbind()
        if (this.#input) {
            this.#input.addEventListener('input', this.#boundOnInput)
            this.#input.addEventListener('keydown', this.#boundOnKeydown)
        }
        this.bindGestures(this.el ?? this.#input)
    }

    #unbind() {
        this.#input?.removeEventListener('input', this.#boundOnInput)
        this.#input?.removeEventListener('keydown', this.#boundOnKeydown)
        this.unbindGestures()
    }

    /**
     * Handles 'input' events from the range element.
     */
    handleInput(_e) {
        const norm = parseFloat(this.#input.value)
        this.commitValue(this.#toDenorm(norm))
    }

    #onInput(e) {
        this.handleInput(e)
    }

    /**
     * Handles 'keydown' events (ArrowUp/Down).
     */
    handleKeydown(e) {
        const isUp = e.key === 'ArrowUp' || e.key === 'ArrowRight'
        const isDown = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
        if (!isUp && !isDown) return

        e.preventDefault()
        e.stopPropagation()

        let multiplier = 1
        const isFine = e.shiftKey || e.altKey
        if (isFine) multiplier = 0.1
        else if (e.ctrlKey || e.metaKey) multiplier = 10

        const delta = (isUp ? 1 : -1) * this.step * multiplier
        const norm = parseFloat(this.#input.value)
        const newNorm = clamp(norm + delta, this.min, this.max)
        const denorm = this.#toDenorm(newNorm)

        if (this.getValue() !== denorm) {
            this.#input.value = newNorm
            this.commitValue(denorm)
        }
        return true
    }

    #onKeydown(e) {
        this.handleKeydown(e)
    }

    /** Clamps a prompt value in application space (BaseControl hook). */
    sanitizePromptInput(num) {
        return clamp(this.#toDenorm(num), this.min, this.max)
    }

    /** Mirrors the value onto the range input (BaseControl hook). */
    applyValue(val) {
        const norm = this.#toNorm(val)
        if (this.#input && parseFloat(this.#input.value) !== norm) {
            this.#input.value = norm
        }
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /** @returns {HTMLInputElement|null} the range input element */
    get input() {
        return this.#input
    }

    /**
     * Toggles the control.
     * @param {boolean} bool
     */
    setDisabled(bool) {
        if (this.#input) this.#input.disabled = bool
    }

    /**
     * Updates the maximum value of the slider.
     * @param {number} max  New max value
     */
    setMax(max) {
        super.setMax(max)
        if (this.#input) this.#input.max = max
    }

    /** Removes event listeners. Call before removing the element from the DOM. */
    destroy() {
        this.#unbind()
        this.#input = null
        super.destroy()
    }
}
