import { fmt as _defaultFmt, escapeHtml as _escHtml } from './ui_utils.js'

/**
 * OrKnob — rotary knob component for ordrumbox-v2.
 *
 * Vertical drag to change value, keyboard arrows for precision.
 * Displays an arc indicator and a numeric value.
 *
 * @param {Object}   cfg
 * @param {string}   cfg.key        Identifier
 * @param {string}   cfg.label      Display label
 * @param {number}   cfg.min        Minimum value
 * @param {number}   cfg.max        Maximum value
 * @param {number}   cfg.step       Step increment
 * @param {number}   [cfg.value]    Initial value (default: min)
 * @param {string}   [cfg.unit]     Unit string appended to display
 * @param {Function} [cfg.format]   (val) => string display formatter
 * @param {boolean}  [cfg.hasLfo]   Adds CSS class has-lfo
 * @param {string}   [cfg.extraClass] Additional CSS class on the row
 * @param {Function} [cfg.onChange]  (val, key) => void callback
 */
export class OrKnob {
    static #ID = 0

    constructor(cfg) {
        this._id = `or-knob-${OrKnob.#ID++}`
        this._key = cfg.key
        this._label = cfg.label
        this._min = cfg.min
        this._max = cfg.max
        this._step = cfg.step
        this._format = cfg.format ?? _defaultFmt
        this._hasLfo = cfg.hasLfo ?? false
        this._extraClass = cfg.extraClass ?? ''
        this._onChange = cfg.onChange ?? null
        this._value = cfg.value ?? cfg.min
        this._defaultValue = cfg.defaultValue ?? cfg.value ?? cfg.min
        this._unit = cfg.unit ?? ''

        this.el = null
        this._valSpan = null
        this._knobEl = null

        this._dragging = false
        this._dragStartY = 0
        this._dragStartVal = 0
        this._boundOnKeydown = this._onKeydown.bind(this)
        this._boundOnMousedown = this._onMousedown.bind(this)
        this._boundOnDblClick = this._onDblClick.bind(this)
        this._boundOnContextMenu = this._onContextMenu.bind(this)
    }

    /** Formats the value for display, truncated to prevent CLS. */
    _fmt(v) {
        const raw = String(this._format(v))
        const s = raw.length > 8 ? raw.slice(0, 8) : raw
        return this._unit ? `${s} ${this._unit}` : s
    }

    /** Returns 0–100 percentage of current value within range. */
    _pct() {
        return Math.max(0, Math.min(100, ((this._value - this._min) / (this._max - this._min)) * 100))
    }

    /** Returns the CSS arc angle in degrees (0–270). */
    _arcDeg() {
        return (this._pct() / 100) * 270
    }

    /** Clamps and rounds a raw value to the valid step. */
    _clampStep(raw, stepSize = this._step) {
        const stepped = Math.round(raw / stepSize) * stepSize
        return Math.max(this._min, Math.min(this._max, stepped))
    }

    /** Row CSS classes. */
    _rowClasses() {
        const c = ['ne-row', 'ne-row-knob']
        if (this._hasLfo) c.push('has-lfo')
        if (this._extraClass) c.push(this._extraClass)
        return c.join(' ')
    }

    // ─── HTML generation ──────────────────────────────────────────────────

    /** Returns the row HTML string. Call mount() after injecting into DOM. */
    toHTML() {
        const deg = this._arcDeg()
        return `<div class="${this._rowClasses()}" data-or-slider="${this._key}" data-prop="${this._key}">
            <div class="or-knob" data-or-knob="${this._key}" style="--arc-deg:${deg}deg" tabindex="0">
                <div class="or-knob-arc"></div>
                <div class="or-knob-disc"></div>
            </div>
            <span class="or-knob-label">${_escHtml(this._label)}</span>
            <span class="ne-val" data-key="${this._key}">${this._fmt(this._value)}</span>
        </div>`
    }

    /** Creates and returns the DOM element with events already bound. */
    createElement() {
        const div = document.createElement('div')
        div.className = this._rowClasses()
        div.dataset.orSlider = this._key
        div.dataset.prop = this._key

        const knob = document.createElement('div')
        knob.className = 'or-knob'
        knob.dataset.orKnob = this._key
        knob.tabIndex = 0
        knob.style.setProperty('--arc-deg', `${this._arcDeg()}deg`)

        const arc = document.createElement('div')
        arc.className = 'or-knob-arc'
        const disc = document.createElement('div')
        disc.className = 'or-knob-disc'

        knob.append(arc, disc)

        const label = document.createElement('span')
        label.className = 'or-knob-label'
        label.textContent = this._label

        const val = document.createElement('span')
        val.className = 'ne-val'
        val.dataset.key = this._key
        val.textContent = this._fmt(this._value)

        div.append(knob, label, val)
        this._bind(div)
        return div
    }

    // ─── Mount / bind ─────────────────────────────────────────────────────

    /**
     * Binds events on an already-injected DOM element.
     * @param {HTMLElement} rowEl
     */
    mount(rowEl) {
        this._bind(rowEl)
    }

    /** @private */
    _bind(rowEl) {
        this._unbind()
        this.el = rowEl
        this._valSpan = rowEl.querySelector('.ne-val')
        this._knobEl = rowEl.querySelector('.or-knob')
        if (!this._knobEl) return
        this._knobEl.addEventListener('mousedown', this._boundOnMousedown)
        this._knobEl.addEventListener('keydown', this._boundOnKeydown)
        this._knobEl.addEventListener('dblclick', this._boundOnDblClick)
        this._knobEl.addEventListener('contextmenu', this._boundOnContextMenu)
        this._valSpan?.addEventListener('dblclick', this._boundOnDblClick)
        this._valSpan?.addEventListener('contextmenu', this._boundOnContextMenu)
    }

    /** @private */
    _unbind() {
        this._knobEl?.removeEventListener('mousedown', this._boundOnMousedown)
        this._knobEl?.removeEventListener('keydown', this._boundOnKeydown)
        this._knobEl?.removeEventListener('dblclick', this._boundOnDblClick)
        this._knobEl?.removeEventListener('contextmenu', this._boundOnContextMenu)
        this._valSpan?.removeEventListener('dblclick', this._boundOnDblClick)
        this._valSpan?.removeEventListener('contextmenu', this._boundOnContextMenu)
    }

    /** @private */
    _onMousedown(e) {
        if (e.button !== 0) return // left click only
        e.preventDefault()
        this._dragging = false
        this._dragStartY = e.clientY
        this._dragStartVal = this._value
        this._knobEl.classList.add('dragging')

        const baseSensitivity = (this._max - this._min) / 200

        const onMove = (ev) => {
            const deltaY = this._dragStartY - ev.clientY
            if (Math.abs(deltaY) > 2) this._dragging = true
            const isFine = ev.shiftKey
            const sensitivity = isFine ? baseSensitivity * 0.1 : baseSensitivity
            const stepSize = isFine ? this._step * 0.1 : this._step
            const clamped = this._clampStep(this._dragStartVal + deltaY * sensitivity, stepSize)
            this.setValue(clamped)
            this._onChange?.(clamped, this._key)
        }
        const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            this._knobEl?.classList.remove('dragging')
            if (this._dragging) {
                this._onChange?.(this._value, this._key)
            }
            setTimeout(() => { this._dragging = false }, 50)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    /** @private */
    _onKeydown(e) {
        const isUp = e.key === 'ArrowUp' || e.key === 'ArrowRight'
        const isDown = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
        if (!isUp && !isDown) return
        e.preventDefault()

        const isFine = e.shiftKey || e.altKey
        const mult = isFine ? 0.1 : e.ctrlKey || e.metaKey ? 10 : 1
        const delta = (isUp ? 1 : -1) * this._step * mult
        const stepSize = isFine ? this._step * 0.1 : this._step
        const clamped = this._clampStep(this._value + delta, stepSize)
        this.setValue(clamped)
        this._onChange?.(clamped, this._key)
    }

    /** Reset value to default on double-click */
    _onDblClick(e) {
        e.preventDefault()
        e.stopPropagation()
        this.setValue(this._defaultValue, true)
    }

    /** Prompt direct numeric value input on right-click / context menu */
    _onContextMenu(e) {
        e.preventDefault()
        e.stopPropagation()
        this.promptDirectInput()
    }

    /** Opens prompt for entering raw numeric value */
    promptDirectInput() {
        const title = `Enter value for ${this._label} (${this._min}–${this._max}${this._unit ? ' ' + this._unit : ''}):`
        const raw = window.prompt(title, this._value)
        if (raw === null || raw.trim() === '') return
        const num = parseFloat(raw)
        if (!Number.isNaN(num)) {
            const clamped = this._clampStep(num)
            this.setValue(clamped, true)
        }
    }

    // ─── Public API ───────────────────────────────────────────────────────

    /**
     * Updates the knob visual and value display.
     * @param {number} val
     * @param {boolean} [triggerCallback=false]
     */
    setValue(val, triggerCallback = false) {
        this._value = val
        if (this._knobEl) this._knobEl.style.setProperty('--arc-deg', `${this._arcDeg()}deg`)
        if (this._valSpan) this._valSpan.textContent = this._fmt(val)
        if (triggerCallback) this._onChange?.(val, this._key)
    }

    /** @returns {number} current value */
    getValue() { return this._value }

    /** Toggles the LFO indicator CSS class. */
    setHasLfo(bool) {
        this._hasLfo = bool
        this.el?.classList.toggle('has-lfo', bool)
    }

    /** Toggles disabled visual state. */
    setDisabled(bool) {
        if (this._knobEl) this._knobEl.style.opacity = bool ? '0.4' : ''
    }

    /** Removes event listeners. */
    destroy() {
        this._unbind()
        this.el = null
        this._valSpan = null
        this._knobEl = null
    }
}
