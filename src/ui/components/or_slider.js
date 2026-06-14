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

const _defaultFmt = v => parseFloat(Number(v).toFixed(2))

export class OrSlider {
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
        this._key        = cfg.key
        this._label      = cfg.label
        this._min        = cfg.min
        this._max        = cfg.max
        this._step       = cfg.step
        this._unit       = cfg.unit      ?? ''
        this._format     = cfg.format    ?? _defaultFmt
        this._normalize  = cfg.normalize   ?? null
        this._denormalize = cfg.denormalize ?? null
        this._hasLfo     = cfg.hasLfo    ?? false
        this._noCursor   = cfg.noCursor  ?? false
        this._dataAttr   = cfg.dataAttr  ?? 'data-key'
        this._extraClass = cfg.extraClass ?? ''
        this._onChange   = cfg.onChange  ?? null

        // Current value in denormalized space
        this._value = cfg.value ?? cfg.min

        this.el       = null   // div.ne-row — available after mount() / createElement()
        this._input   = null
        this._valSpan = null

        this._boundOnInput   = this._onInput.bind(this)
        this._boundOnKeydown = this._onKeydown.bind(this)
    }

    // ─── Internal helpers ───────────────────────────────────────────────────

    /** Converts a denormalized value to an input range value */
    _toNorm(v) {
        return this._normalize ? this._normalize(v) : v
    }

    /** Converts an input range value to an application value */
    _toDenorm(v) {
        return this._denormalize ? this._denormalize(v) : v
    }

    /** Formats the denormalized value for display */
    _fmt(v) {
        const str = String(this._format(v))
        return this._unit ? `${str} ${this._unit}` : str
    }

    /** Row CSS classes */
    _rowClasses() {
        const classes = ['ne-row']
        if (this._hasLfo)   classes.push('has-lfo')
        if (this._noCursor) classes.push('no-cursor')
        if (this._extraClass) classes.push(this._extraClass)
        return classes.join(' ')
    }

    // ─── HTML generation (template literal mode) ────────────────────────────

    /**
     * Returns the row HTML (label + input + span).
     * Then call mount(rowEl) to bind events.
     */
    toHTML() {
        const normVal    = this._toNorm(this._value)
        const displayVal = this._fmt(this._value)
        return `<div class="${this._rowClasses()}" data-or-slider="${this._key}" data-prop="${this._key}">
            <label>${this._escHtml(this._label)}</label>
            <input type="range"
                   min="${this._min}" max="${this._max}" step="${this._step}"
                   value="${normVal}"
                   ${this._dataAttr}="${this._key}">
            <span class="ne-val" ${this._dataAttr}="${this._key}">${displayVal}</span>
        </div>`
    }

    /**
     * Binds events on a div.ne-row already injected into the DOM.
     * @param {HTMLElement} rowEl  The element returned by toHTML(), already in the DOM.
     */
    mount(rowEl) {
        this.el       = rowEl
        this._input   = rowEl.querySelector(`input[type=range]`)
        this._valSpan = rowEl.querySelector(`.ne-val`)
        this._bind()
    }

    // ─── Imperative DOM creation ────────────────────────────────────────────

    /**
     * Creates and returns the complete div.ne-row element, ready to be appended.
     * Events are already bound.
     */
    createElement() {
        const div = document.createElement('div')
        div.className = this._rowClasses()
        div.dataset.orSlider = this._key

        const label = document.createElement('label')
        label.textContent = this._label

        const input = document.createElement('input')
        input.type  = 'range'
        input.min   = this._min
        input.max   = this._max
        input.step  = this._step
        input.value = this._toNorm(this._value)
        input.setAttribute(this._dataAttr, this._key)

        const span = document.createElement('span')
        span.className = 'ne-val'
        span.setAttribute(this._dataAttr, this._key)
        span.textContent = this._fmt(this._value)

        div.appendChild(label)
        div.appendChild(input)
        div.appendChild(span)

        this.el       = div
        this._input   = input
        this._valSpan = span

        this._bind()
        return div
    }

    // ─── Event binding ──────────────────────────────────────────────────────

    _bind() {
        this._input.addEventListener('input',   this._boundOnInput)
        this._input.addEventListener('keydown', this._boundOnKeydown)
    }

    _onInput() {
        const norm    = parseFloat(this._input.value)
        const denorm  = this._toDenorm(norm)
        this._value   = denorm
        this._valSpan.textContent = this._fmt(denorm)
        this._onChange?.(denorm, this._key)
    }

    /**
     * Enhanced keyboard control on the input range:
     *   Arrow Up/Right        → +step
     *   Arrow Down/Left       → -step
     *   Shift + Arrow         → ±step × 10  (large jumps)
     *   Alt/Option + Arrow    → ±step ÷ 10  (fine adjustment)
     */
    _onKeydown(e) {
        const isUp   = e.key === 'ArrowUp'   || e.key === 'ArrowRight'
        const isDown = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
        if (!isUp && !isDown) return

        e.preventDefault()
        // Stop propagation so the delegated fallback handler in main.js does
        // not also handle the key (which would cause a double increment).
        e.stopPropagation()

        let multiplier = 1
        if (e.shiftKey) multiplier = 10
        if (e.altKey)   multiplier = 0.1

        const delta    = (isUp ? 1 : -1) * this._step * multiplier
        const norm     = parseFloat(this._input.value)
        const newNorm  = Math.min(this._max, Math.max(this._min, norm + delta))
        const denorm   = this._toDenorm(newNorm)

        this._input.value         = newNorm
        this._value               = denorm
        this._valSpan.textContent = this._fmt(denorm)
        this._onChange?.(denorm, this._key)
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /**
     * Updates the slider and display.
     * @param {number} val  Denormalized value
     */
    setValue(val) {
        this._value = val
        if (this._input)   this._input.value         = this._toNorm(val)
        if (this._valSpan) this._valSpan.textContent = this._fmt(val)
    }

    /** Returns the current denormalized value */
    getValue() {
        return this._value
    }

    /**
     * Toggles the LFO indicator (CSS class has-lfo).
     * @param {boolean} bool
     */
    setHasLfo(bool) {
        this._hasLfo = bool
        this.el?.classList.toggle('has-lfo', bool)
    }

    /**
     * Toggles the control.
     * @param {boolean} bool
     */
    setDisabled(bool) {
        if (this._input) this._input.disabled = bool
    }

    /**
     * Updates the maximum value of the slider.
     * @param {number} max  New max value
     */
    setMax(max) {
        this._max = max
        if (this._input) this._input.max = max
    }

    /** Removes event listeners. Call before removing the element from the DOM. */
    destroy() {
        this._input?.removeEventListener('input',   this._boundOnInput)
        this._input?.removeEventListener('keydown', this._boundOnKeydown)
        this.el       = null
        this._input   = null
        this._valSpan = null
    }

    // ─── Utilities ──────────────────────────────────────────────────────────

    _escHtml(str) {
        const d = document.createElement('div')
        d.textContent = str
        return d.innerHTML
    }
}
