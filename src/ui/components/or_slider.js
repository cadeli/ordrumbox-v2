/**
 * OrSlider — unified slider component for ordrumbox-v2
 *
 * Aggregates all common slider features of the app:
 *   - label + input[type=range] + value display
 *   - configurable unit and display format
 *   - normalization/denormalization (e.g. filterFreq in Hz)
 *   - LFO indicator (CSS class has-lfo)
 *   - keyboard control: Arrow ±step, Shift+Arrow ±step×10, Alt+Arrow ±step÷10
 *   - programmatic update via setValue()
 *   - onChange callback with denormalized value
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

import { fmt as _defaultFmt, escapeHtml as _escHtml } from './ui_utils.js'

export class OrSlider {
    #key
    #label
    #min
    #max
    #step
    #unit
    #format
    #normalize
    #denormalize
    #hasLfo
    #noCursor
    #dataAttr
    #extraClass
    #onChange
    #value
    #defaultValue
    #input
    #valSpan
    #boundOnInput
    #boundOnKeydown
    #boundOnDblClick
    #boundOnContextMenu

    /**
     * @param {Object}   cfg
     * @param {string}   cfg.key            Identifier (data-key on the input)
     * @param {string}   cfg.label          Label text
     * @param {number}   cfg.min            Minimum value (normalized space)
     * @param {number}   cfg.max            Maximum value (normalized space)
     * @param {number}   cfg.step           Base step
     * @param {number}   cfg.value          Initial value (denormalized)
     * @param {string}   [cfg.unit]         Unit displayed after the value (e.g. 'Hz', 'ms')
     * @param {Function} [cfg.format]       (valDenorm) => string — display format
     * @param {Function} [cfg.normalize]    (valDenorm) => valNorm — for the input space
     * @param {Function} [cfg.denormalize]  (valNorm)   => valDenorm — inverse
     * @param {boolean}  [cfg.hasLfo]       Adds CSS class has-lfo
     * @param {boolean}  [cfg.noCursor]     Adds CSS class no-cursor
     * @param {string}   [cfg.dataAttr]     Name of the data-* attribute (default: 'data-key')
     * @param {string}   [cfg.extraClass]   Additional CSS class added to the row
     * @param {Function} [cfg.onChange]     (valDenorm, key) => void
     */
    constructor(cfg) {
        this.#key        = cfg.key
        this.#label      = cfg.label
        this.#min        = cfg.min
        this.#max        = cfg.max
        this.#step       = cfg.step
        this.#unit       = cfg.unit      ?? ''
        this.#format     = cfg.format    ?? _defaultFmt
        this.#normalize  = cfg.normalize   ?? null
        this.#denormalize = cfg.denormalize ?? null
        this.#hasLfo     = cfg.hasLfo    ?? false
        this.#noCursor   = cfg.noCursor  ?? false
        this.#dataAttr   = cfg.dataAttr  ?? 'data-key'
        this.#extraClass = cfg.extraClass ?? ''
        this.#onChange   = cfg.onChange  ?? null

        // Current value in denormalized space
        this.#value = cfg.value ?? cfg.min
        this.#defaultValue = cfg.defaultValue ?? cfg.value ?? cfg.min

        this.el       = null   // div.ne-row — available after mount() / createElement()
        this.#input   = null
        this.#valSpan = null

        this.#boundOnInput   = this.#onInput.bind(this)
        this.#boundOnKeydown = this.#onKeydown.bind(this)
        this.#boundOnDblClick = this.#onDblClick.bind(this)
        this.#boundOnContextMenu = this.#onContextMenu.bind(this)
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

    /** Formats the denormalized value for display, truncated to prevent CLS. */
    #fmt(v) {
        const raw = String(this.#format(v))
        const str = raw.length > 8 ? raw.slice(0, 8) : raw
        return this.#unit ? `${str} ${this.#unit}` : str
    }

    /** Row CSS classes */
    #rowClasses() {
        const classes = ['ne-row']
        if (this.#hasLfo)   classes.push('has-lfo')
        if (this.#noCursor) classes.push('no-cursor')
        if (this.#extraClass) classes.push(this.#extraClass)
        return classes.join(' ')
    }

    // ─── HTML generation (template literal mode) ────────────────────────────

    /**
     * Returns the row HTML (label + input + span).
     * Then call mount(rowEl) to bind events.
     */
    toHTML() {
        const normVal    = this.#toNorm(this.#value)
        const displayVal = this.#fmt(this.#value)
        return `<div class="${this.#rowClasses()}" data-or-slider="${this.#key}" data-prop="${this.#key}">
            <label>${_escHtml(this.#label)}</label>
            <input type="range"
                   min="${this.#min}" max="${this.#max}" step="${this.#step}"
                   value="${normVal}"
                   ${this.#dataAttr}="${this.#key}">
            <span class="ne-val" ${this.#dataAttr}="${this.#key}">${displayVal}</span>
        </div>`
    }

    /**
     * Binds events on a div.ne-row already injected into the DOM.
     * @param {HTMLElement} rowEl  The element returned by toHTML(), already in the DOM.
     */
    mount(rowEl) {
        this.el       = rowEl
        this.#input   = rowEl.querySelector(`input[type=range]`)
        this.#valSpan = rowEl.querySelector(`.ne-val`)
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
        div.dataset.orSlider = this.#key

        const label = document.createElement('label')
        label.textContent = this.#label

        const input = document.createElement('input')
        input.type  = 'range'
        input.min   = this.#min
        input.max   = this.#max
        input.step  = this.#step
        input.value = this.#toNorm(this.#value)
        input.setAttribute(this.#dataAttr, this.#key)

        const span = document.createElement('span')
        span.className = 'ne-val'
        span.setAttribute(this.#dataAttr, this.#key)
        span.textContent = this.#fmt(this.#value)

        div.appendChild(label)
        div.appendChild(input)
        div.appendChild(span)

        this.el       = div
        this.#input   = input
        this.#valSpan = span

        this.#bind()
        return div
    }

    // ─── Event binding ──────────────────────────────────────────────────────

    #bind() {
        this.#unbind()
        if (this.#input) {
            this.#input.addEventListener('input',   this.#boundOnInput)
            this.#input.addEventListener('keydown', this.#boundOnKeydown)
        }
        if (this.el) {
            this.el.addEventListener('dblclick', this.#boundOnDblClick)
            this.el.addEventListener('contextmenu', this.#boundOnContextMenu)
        } else if (this.#input) {
            this.#input.addEventListener('dblclick', this.#boundOnDblClick)
            this.#input.addEventListener('contextmenu', this.#boundOnContextMenu)
        }
        if (this.#valSpan) {
            this.#valSpan.addEventListener('dblclick', this.#boundOnDblClick)
            this.#valSpan.addEventListener('contextmenu', this.#boundOnContextMenu)
        }
    }

    #unbind() {
        this.#input?.removeEventListener('input',   this.#boundOnInput)
        this.#input?.removeEventListener('keydown', this.#boundOnKeydown)
        if (this.el) {
            this.el.removeEventListener('dblclick', this.#boundOnDblClick)
            this.el.removeEventListener('contextmenu', this.#boundOnContextMenu)
        } else if (this.#input) {
            this.#input.removeEventListener('dblclick', this.#boundOnDblClick)
            this.#input.removeEventListener('contextmenu', this.#boundOnContextMenu)
        }
        if (this.#valSpan) {
            this.#valSpan.removeEventListener('dblclick', this.#boundOnDblClick)
            this.#valSpan.removeEventListener('contextmenu', this.#boundOnContextMenu)
        }
    }

    #onDblClick(e) {
        e.preventDefault()
        e.stopPropagation()
        this.setValue(this.#defaultValue, true)
    }

    #onContextMenu(e) {
        e.preventDefault()
        e.stopPropagation()
        this.promptDirectInput()
    }

    promptDirectInput() {
        const title = `Enter value for ${this.#label} (${this.#min}–${this.#max}${this.#unit ? ' ' + this.#unit : ''}):`
        const raw = window.prompt(title, this.#value)
        if (raw === null || raw.trim() === '') return
        const num = parseFloat(raw)
        if (!Number.isNaN(num)) {
            const denorm = this.#toDenorm(num)
            const clamped = Math.min(this.#max, Math.max(this.#min, denorm))
            this.setValue(clamped, true)
        }
    }

    /**
     * Handles 'input' events from the range element.
     */
    handleInput(e) {
        const norm    = parseFloat(this.#input.value)
        const denorm  = this.#toDenorm(norm)
        if (this.#value === denorm) return
        this.#value   = denorm
        if (this.#valSpan) this.#valSpan.textContent = this.#fmt(denorm)
        this.#onChange?.(denorm, this.#key)
    }

    #onInput(e) {
        this.handleInput(e)
    }

    /**
     * Handles 'keydown' events (ArrowUp/Down).
     */
    handleKeydown(e) {
        const isUp   = e.key === 'ArrowUp'   || e.key === 'ArrowRight'
        const isDown = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
        if (!isUp && !isDown) return

        e.preventDefault()
        e.stopPropagation()

        let multiplier = 1
        const isFine = e.shiftKey || e.altKey
        if (isFine) multiplier = 0.1
        else if (e.ctrlKey || e.metaKey) multiplier = 10

        const delta    = (isUp ? 1 : -1) * this.#step * multiplier
        const norm     = parseFloat(this.#input.value)
        const newNorm  = Math.min(this.#max, Math.max(this.#min, norm + delta))
        const denorm   = this.#toDenorm(newNorm)

        if (this.#value !== denorm) {
            this.#input.value         = newNorm
            this.#value               = denorm
            if (this.#valSpan) this.#valSpan.textContent = this.#fmt(denorm)
            this.#onChange?.(denorm, this.#key)
        }
        return true
    }

    #onKeydown(e) {
        this.handleKeydown(e)
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /** @returns {string} slider identifier */
    get key() { return this.#key }

    /** @returns {HTMLInputElement|null} the range input element */
    get input() { return this.#input }

    /** @returns {Function|null} current onChange callback */
    get onChange() { return this.#onChange }
    /** @param {Function|null} fn — rebind the onChange callback */
    set onChange(fn) { this.#onChange = fn }

    /** Formats denormalized value for display (exposed for testing). */
    formatValue(v) { return this.#fmt(v) }

    /**
     * Updates the slider and display.
     * @param {number} val  Denormalized value
     * @param {boolean} [triggerCallback=false]  If true, calls onChange callback
     */
    setValue(val, triggerCallback = false) {
        if (this.#value === val && !triggerCallback) return
        this.#value = val
        const norm = this.#toNorm(val)
        if (this.#input && parseFloat(this.#input.value) !== norm) {
            this.#input.value = norm
        }
        if (this.#valSpan) this.#valSpan.textContent = this.#fmt(val)
        if (triggerCallback && this.#onChange) {
            this.#onChange(val, this.#key)
        }
    }

    /** Returns the current denormalized value */
    getValue() {
        return this.#value
    }

    /**
     * Toggles the LFO indicator (CSS class has-lfo).
     * @param {boolean} bool
     */
    setHasLfo(bool) {
        this.#hasLfo = bool
        this.el?.classList.toggle('has-lfo', bool)
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
        this.#max = max
        if (this.#input) this.#input.max = max
    }

    /** Removes event listeners. Call before removing the element from the DOM. */
    destroy() {
        this.#unbind()
        this.el       = null
        this.#input   = null
        this.#valSpan = null
    }
}
