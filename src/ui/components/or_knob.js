import { escapeHtml as _escHtml } from './ui_utils.js'
import { clamp } from '../../core/numbers.js'
import { BaseControl } from './base_control.js'

/**
 * OrKnob — rotary knob component for ordrumbox-v2.
 *
 * Vertical drag to change value, keyboard arrows for precision.
 * Displays an arc indicator and a numeric value.
 * Config, value core and the double-click / right-click gestures come from
 * BaseControl.
 *
 * @param {Object}   cfg
 * @param {string}   cfg.key        Identifier
 * @param {string}   cfg.label      Display label
 * @param {number}   cfg.min        Minimum value
 * @param {number}   cfg.max        Maximum value
 * @param {number}   cfg.step       Step increment
 * @param {number}   [cfg.value]    Initial value (default: min)
 * @param {number}   [cfg.defaultValue] Value restored by double-click (default: value ?? min)
 * @param {string}   [cfg.unit]     Unit string appended to display
 * @param {Function} [cfg.format]   (val) => string display formatter
 * @param {boolean}  [cfg.hasLfo]   Adds CSS class has-lfo
 * @param {string}   [cfg.extraClass] Additional CSS class on the row
 * @param {Function} [cfg.onChange]  (val, key) => void callback
 * @param {string}   [cfg.scale]    'log' for logarithmic mapping (default: 'linear')
 */
export class OrKnob extends BaseControl {
    #useLog
    #logMin
    #logRange
    #knobEl
    #dragStartY
    #dragStartVal
    #dragging
    /** @type {((ev: MouseEvent) => void)|null} */
    #dragOnMove
    /** @type {(() => void)|null} */
    #dragOnEnd
    #boundOnKeydown
    #boundOnStart

    constructor(cfg) {
        super(cfg)
        // A log scale is only defined for min > 0 (log10(0) = -Infinity, which
        // would yield a NaN arc). Fall back to linear instead of breaking.
        this.#useLog = cfg.scale === 'log' && this.min > 0 && this.max > this.min
        this.#logMin = this.#useLog ? Math.log10(this.min) : 0
        this.#logRange = this.#useLog ? Math.log10(this.max) - this.#logMin : 0

        this.#knobEl = null
        this.#dragStartY = 0
        this.#dragStartVal = 0
        this.#dragging = false
        this.#dragOnMove = null
        this.#dragOnEnd = null
        this.#boundOnKeydown = this.#onKeydown.bind(this)
        this.#boundOnStart = this.#onStart.bind(this)
    }

    /** Returns 0–100 percentage of current value within range. */
    #pct() {
        const value = this.getValue()
        if (this.#useLog) {
            const logPos = (Math.log10(Math.max(this.min, value)) - this.#logMin) / this.#logRange
            return clamp(logPos * 100, 0, 100)
        }
        return clamp(((value - this.min) / (this.max - this.min)) * 100, 0, 100)
    }

    /** Returns the CSS arc angle in degrees (0–270). */
    #arcDeg() {
        return (this.#pct() / 100) * 270
    }

    /** Clamps and rounds a raw value to the valid step. */
    #clampStep(raw, stepSize = this.step) {
        const stepped = Math.round(raw / stepSize) * stepSize
        return clamp(stepped, this.min, this.max)
    }

    /** Row CSS classes. */
    #rowClasses() {
        return this.rowClassList('ne-row-knob').join(' ')
    }

    // ─── HTML generation ──────────────────────────────────────────────────

    /** Returns the row HTML string. Call mount() after injecting into DOM. */
    toHTML() {
        const deg = this.#arcDeg()
        return `<div class="${this.#rowClasses()}" data-or-control="${this.key}">
            <div class="or-knob" data-or-knob="${this.key}" style="--arc-deg:${deg}deg" tabindex="0">
                <div class="or-knob-arc"></div>
                <div class="or-knob-disc"></div>
            </div>
            <span class="or-knob-label">${_escHtml(this.label)}</span>
            <span class="ne-val" data-key="${this.key}">${this.formatValue(this.getValue())}</span>
        </div>`
    }

    /** Creates and returns the DOM element with events already bound. */
    createElement() {
        const div = document.createElement('div')
        div.className = this.#rowClasses()
        div.dataset.orControl = this.key

        const knob = document.createElement('div')
        knob.className = 'or-knob'
        knob.dataset.orKnob = this.key
        knob.tabIndex = 0
        knob.style.setProperty('--arc-deg', `${this.#arcDeg()}deg`)

        const arc = document.createElement('div')
        arc.className = 'or-knob-arc'
        const disc = document.createElement('div')
        disc.className = 'or-knob-disc'

        knob.append(arc, disc)

        const label = document.createElement('span')
        label.className = 'or-knob-label'
        label.textContent = this.label

        const val = document.createElement('span')
        val.className = 'ne-val'
        val.dataset.key = this.key
        val.textContent = this.formatValue(this.getValue())

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

    /** @param {any} rowEl */
    #bind(rowEl) {
        this.#unbindKeys()
        this.unbindGestures()
        this.el = rowEl
        this.setValSpan(rowEl.querySelector('.ne-val'))
        this.#knobEl = rowEl.querySelector('.or-knob')
        if (!this.#knobEl) return
        // Touch and pen only travel through the pointer events — a drag bound
        // to the mouse family alone never moves the value on mobile. Both
        // families are wired: one gesture fires pointerdown then a
        // compatibility mousedown, which #dragging ignores.
        this.#knobEl.addEventListener('pointerdown', this.#boundOnStart)
        this.#knobEl.addEventListener('mousedown', this.#boundOnStart)
        this.#knobEl.addEventListener('keydown', this.#boundOnKeydown)
        this.bindGestures(this.#knobEl)
    }

    #unbindKeys() {
        this.#endDrag()
        this.#knobEl?.removeEventListener('pointerdown', this.#boundOnStart)
        this.#knobEl?.removeEventListener('mousedown', this.#boundOnStart)
        this.#knobEl?.removeEventListener('keydown', this.#boundOnKeydown)
    }

    /** @param {any} e */
    #onStart(e) {
        if (this.#dragging) return // compatibility mousedown of a pointer drag
        if (e.button !== 0) return // primary button only
        e.preventDefault()
        this.#dragging = true
        this.#dragStartY = e.clientY
        this.#dragStartVal = this.getValue()
        this.#knobEl?.classList.add('dragging')

        const isLog = this.#useLog
        const baseSensitivity = isLog ? this.#logRange / 200 : (this.max - this.min) / 200
        const startLogPos = isLog
            ? (Math.log10(Math.max(this.min, this.#dragStartVal)) - this.#logMin) / this.#logRange
            : 0

        this.#dragOnMove = (ev) => {
            const deltaY = this.#dragStartY - ev.clientY
            const isFine = ev.shiftKey
            const sensitivity = isFine ? baseSensitivity * 0.1 : baseSensitivity
            const stepSize = isFine ? this.step * 0.1 : this.step

            let clamped
            if (isLog) {
                const newLogPos = clamp(startLogPos + deltaY * sensitivity, 0, 1)
                const raw = Math.pow(10, this.#logMin + newLogPos * this.#logRange)
                clamped = this.#clampStep(raw, stepSize)
            } else {
                clamped = this.#clampStep(this.#dragStartVal + deltaY * sensitivity, stepSize)
            }
            this.commitValue(clamped)
        }
        this.#dragOnEnd = () => this.#endDrag()

        // Absolute math from the press, so a mouse drag reaching us through
        // both families applies the same value twice instead of doubling it.
        window.addEventListener('pointermove', this.#dragOnMove)
        window.addEventListener('mousemove', this.#dragOnMove)
        window.addEventListener('pointerup', this.#dragOnEnd)
        window.addEventListener('pointercancel', this.#dragOnEnd)
        window.addEventListener('mouseup', this.#dragOnEnd)
    }

    /** Ends the running drag: one removal per family, then the visual state. */
    #endDrag() {
        if (this.#dragOnMove) {
            window.removeEventListener('pointermove', this.#dragOnMove)
            window.removeEventListener('mousemove', this.#dragOnMove)
        }
        if (this.#dragOnEnd) {
            window.removeEventListener('pointerup', this.#dragOnEnd)
            window.removeEventListener('pointercancel', this.#dragOnEnd)
            window.removeEventListener('mouseup', this.#dragOnEnd)
        }
        this.#dragOnMove = null
        this.#dragOnEnd = null
        if (!this.#dragging) return
        this.#dragging = false
        this.#knobEl?.classList.remove('dragging')
    }

    /** @param {any} e */
    #onKeydown(e) {
        const isUp = e.key === 'ArrowUp' || e.key === 'ArrowRight'
        const isDown = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
        if (!isUp && !isDown) return
        e.preventDefault()

        const isFine = e.shiftKey || e.altKey
        const mult = isFine ? 0.1 : e.ctrlKey || e.metaKey ? 10 : 1
        const delta = (isUp ? 1 : -1) * this.step * mult
        const stepSize = isFine ? this.step * 0.1 : this.step
        this.commitValue(this.#clampStep(this.getValue() + delta, stepSize))
    }

    /** Steps a prompt value onto the knob grid (BaseControl hook). */
    sanitizePromptInput(num) {
        return this.#clampStep(num)
    }

    /** Paints the arc angle (BaseControl hook). */
    applyValue(_val) {
        if (this.#knobEl) this.#knobEl.style.setProperty('--arc-deg', `${this.#arcDeg()}deg`)
    }

    // ─── Public API ───────────────────────────────────────────────────────

    /** Toggles disabled visual state. */
    setDisabled(bool) {
        if (this.#knobEl) this.#knobEl.style.opacity = bool ? '0.4' : ''
    }

    /** Removes event listeners. */
    destroy() {
        this.#unbindKeys()
        this.#knobEl = null
        super.destroy()
    }
}
