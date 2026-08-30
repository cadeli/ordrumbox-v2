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

    #id
    #key
    #label
    #min
    #max
    #step
    #format
    #hasLfo
    #extraClass
    #onChange
    #value
    #defaultValue
    #unit
    #valSpan
    #knobEl
    #dragging
    #dragStartY
    #dragStartVal
    #boundOnKeydown
    #boundOnMousedown
    #boundOnDblClick
    #boundOnContextMenu

    constructor(cfg) {
        this.#id = `or-knob-${OrKnob.#ID++}`
        this.#key = cfg.key
        this.#label = cfg.label
        this.#min = cfg.min
        this.#max = cfg.max
        this.#step = cfg.step
        this.#format = cfg.format ?? _defaultFmt
        this.#hasLfo = cfg.hasLfo ?? false
        this.#extraClass = cfg.extraClass ?? ''
        this.#onChange = cfg.onChange ?? null
        this.#value = cfg.value ?? cfg.min
        this.#defaultValue = cfg.defaultValue ?? cfg.value ?? cfg.min
        this.#unit = cfg.unit ?? ''

        this.el = null
        this.#valSpan = null
        this.#knobEl = null

        this.#dragging = false
        this.#dragStartY = 0
        this.#dragStartVal = 0
        this.#boundOnKeydown = this.#onKeydown.bind(this)
        this.#boundOnMousedown = this.#onMousedown.bind(this)
        this.#boundOnDblClick = this.#onDblClick.bind(this)
        this.#boundOnContextMenu = this.#onContextMenu.bind(this)
    }

    /** Formats the value for display, truncated to prevent CLS. */
    #fmt(v) {
        const raw = String(this.#format(v))
        const s = raw.length > 8 ? raw.slice(0, 8) : raw
        return this.#unit ? `${s} ${this.#unit}` : s
    }

    /** Returns 0–100 percentage of current value within range. */
    #pct() {
        return Math.max(0, Math.min(100, ((this.#value - this.#min) / (this.#max - this.#min)) * 100))
    }

    /** Returns the CSS arc angle in degrees (0–270). */
    #arcDeg() {
        return (this.#pct() / 100) * 270
    }

    /** Clamps and rounds a raw value to the valid step. */
    #clampStep(raw, stepSize = this.#step) {
        const stepped = Math.round(raw / stepSize) * stepSize
        return Math.max(this.#min, Math.min(this.#max, stepped))
    }

    /** Row CSS classes. */
    #rowClasses() {
        const c = ['ne-row', 'ne-row-knob']
        if (this.#hasLfo) c.push('has-lfo')
        if (this.#extraClass) c.push(this.#extraClass)
        return c.join(' ')
    }

    // ─── HTML generation ──────────────────────────────────────────────────

    /** Returns the row HTML string. Call mount() after injecting into DOM. */
    toHTML() {
        const deg = this.#arcDeg()
        return `<div class="${this.#rowClasses()}" data-or-slider="${this.#key}" data-prop="${this.#key}">
            <div class="or-knob" data-or-knob="${this.#key}" style="--arc-deg:${deg}deg" tabindex="0">
                <div class="or-knob-arc"></div>
                <div class="or-knob-disc"></div>
            </div>
            <span class="or-knob-label">${_escHtml(this.#label)}</span>
            <span class="ne-val" data-key="${this.#key}">${this.#fmt(this.#value)}</span>
        </div>`
    }

    /** Creates and returns the DOM element with events already bound. */
    createElement() {
        const div = document.createElement('div')
        div.className = this.#rowClasses()
        div.dataset.orSlider = this.#key
        div.dataset.prop = this.#key

        const knob = document.createElement('div')
        knob.className = 'or-knob'
        knob.dataset.orKnob = this.#key
        knob.tabIndex = 0
        knob.style.setProperty('--arc-deg', `${this.#arcDeg()}deg`)

        const arc = document.createElement('div')
        arc.className = 'or-knob-arc'
        const disc = document.createElement('div')
        disc.className = 'or-knob-disc'

        knob.append(arc, disc)

        const label = document.createElement('span')
        label.className = 'or-knob-label'
        label.textContent = this.#label

        const val = document.createElement('span')
        val.className = 'ne-val'
        val.dataset.key = this.#key
        val.textContent = this.#fmt(this.#value)

        div.append(knob, label, val)
        this.#bind(div)
        return div
    }

    // ─── Mount / bind ─────────────────────────────────────────────────────

    /**
     * Binds events on an already-injected DOM element.
     * @param {HTMLElement} rowEl
     */
    mount(rowEl) {
        this.#bind(rowEl)
    }

    /** @private */
    #bind(rowEl) {
        this.#unbind()
        this.el = rowEl
        this.#valSpan = rowEl.querySelector('.ne-val')
        this.#knobEl = rowEl.querySelector('.or-knob')
        if (!this.#knobEl) return
        this.#knobEl.addEventListener('mousedown', this.#boundOnMousedown)
        this.#knobEl.addEventListener('keydown', this.#boundOnKeydown)
        this.#knobEl.addEventListener('dblclick', this.#boundOnDblClick)
        this.#knobEl.addEventListener('contextmenu', this.#boundOnContextMenu)
        this.#valSpan?.addEventListener('dblclick', this.#boundOnDblClick)
        this.#valSpan?.addEventListener('contextmenu', this.#boundOnContextMenu)
    }

    /** @private */
    #unbind() {
        this.#knobEl?.removeEventListener('mousedown', this.#boundOnMousedown)
        this.#knobEl?.removeEventListener('keydown', this.#boundOnKeydown)
        this.#knobEl?.removeEventListener('dblclick', this.#boundOnDblClick)
        this.#knobEl?.removeEventListener('contextmenu', this.#boundOnContextMenu)
        this.#valSpan?.removeEventListener('dblclick', this.#boundOnDblClick)
        this.#valSpan?.removeEventListener('contextmenu', this.#boundOnContextMenu)
    }

    /** @private */
    #onMousedown(e) {
        if (e.button !== 0) return // left click only
        e.preventDefault()
        this.#dragging = false
        this.#dragStartY = e.clientY
        this.#dragStartVal = this.#value
        this.#knobEl.classList.add('dragging')

        const baseSensitivity = (this.#max - this.#min) / 200

        const onMove = (ev) => {
            const deltaY = this.#dragStartY - ev.clientY
            if (Math.abs(deltaY) > 2) this.#dragging = true
            const isFine = ev.shiftKey
            const sensitivity = isFine ? baseSensitivity * 0.1 : baseSensitivity
            const stepSize = isFine ? this.#step * 0.1 : this.#step
            const clamped = this.#clampStep(this.#dragStartVal + deltaY * sensitivity, stepSize)
            if (clamped !== this.#value) {
                this.setValue(clamped)
                this.#onChange?.(clamped, this.#key)
            }
        }
        const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            this.#knobEl?.classList.remove('dragging')
            setTimeout(() => { this.#dragging = false }, 50)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    /** @private */
    #onKeydown(e) {
        const isUp = e.key === 'ArrowUp' || e.key === 'ArrowRight'
        const isDown = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
        if (!isUp && !isDown) return
        e.preventDefault()

        const isFine = e.shiftKey || e.altKey
        const mult = isFine ? 0.1 : e.ctrlKey || e.metaKey ? 10 : 1
        const delta = (isUp ? 1 : -1) * this.#step * mult
        const stepSize = isFine ? this.#step * 0.1 : this.#step
        const clamped = this.#clampStep(this.#value + delta, stepSize)
        if (clamped !== this.#value) {
            this.setValue(clamped)
            this.#onChange?.(clamped, this.#key)
        }
    }

    /** Reset value to default on double-click */
    #onDblClick(e) {
        e.preventDefault()
        e.stopPropagation()
        this.setValue(this.#defaultValue, true)
    }

    /** Prompt direct numeric value input on right-click / context menu */
    #onContextMenu(e) {
        e.preventDefault()
        e.stopPropagation()
        this.promptDirectInput()
    }

    /** Opens prompt for entering raw numeric value */
    promptDirectInput() {
        const title = `Enter value for ${this.#label} (${this.#min}–${this.#max}${this.#unit ? ' ' + this.#unit : ''}):`
        const raw = window.prompt(title, this.#value)
        if (raw === null || raw.trim() === '') return
        const num = parseFloat(raw)
        if (!Number.isNaN(num)) {
            const clamped = this.#clampStep(num)
            this.setValue(clamped, true)
        }
    }

    // ─── Public API ───────────────────────────────────────────────────────

    /** @returns {string} knob identifier */
    get key() { return this.#key }

    /** @returns {Function|null} current onChange callback */
    get onChange() { return this.#onChange }
    /** @param {Function|null} fn — rebind the onChange callback */
    set onChange(fn) { this.#onChange = fn }

    /** Formats value for display (exposed for testing). */
    formatValue(v) { return this.#fmt(v) }

    /**
     * Updates the knob visual and value display.
     * @param {number} val
     * @param {boolean} [triggerCallback=false]
     */
    setValue(val, triggerCallback = false) {
        if (this.#value === val && !triggerCallback) return
        this.#value = val
        if (this.#knobEl) this.#knobEl.style.setProperty('--arc-deg', `${this.#arcDeg()}deg`)
        if (this.#valSpan) this.#valSpan.textContent = this.#fmt(val)
        if (triggerCallback) this.#onChange?.(val, this.#key)
    }

    /** @returns {number} current value */
    getValue() { return this.#value }

    /** Toggles the LFO indicator CSS class. */
    setHasLfo(bool) {
        this.#hasLfo = bool
        this.el?.classList.toggle('has-lfo', bool)
    }

    /** Toggles disabled visual state. */
    setDisabled(bool) {
        if (this.#knobEl) this.#knobEl.style.opacity = bool ? '0.4' : ''
    }

    /** Removes event listeners. */
    destroy() {
        this.#unbind()
        this.el = null
        this.#valSpan = null
        this.#knobEl = null
    }
}
