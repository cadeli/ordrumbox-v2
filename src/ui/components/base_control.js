// src/ui/components/base_control.js — shared behaviour of the Or* value
// controls (OrKnob, OrSlider): config parsing, value core, display formatting
// and the double-click / right-click gestures.

import { fmt as _defaultFmt, promptNumericInput } from './ui_utils.js'
import { clamp } from '../../core/numbers.js'

/**
 * BaseControl — common part of every Or* value control.
 *
 * Subclasses implement the visual side only:
 *   - `applyValue(val)`   — paint the new value (arc position, range input…)
 *   - `sanitizePromptInput(num)` — clamp/step a number typed in the prompt
 *   - their own bind path, calling `setValSpan()` for the `.ne-val` display
 *     and `bindGestures(...targets)` for the shared double-click / right-click.
 *
 * @param {Object}   cfg
 * @param {string}   cfg.key          Identifier
 * @param {string}   cfg.label        Display label
 * @param {number}   cfg.min          Minimum value
 * @param {number}   cfg.max          Maximum value
 * @param {number}   cfg.step         Step increment
 * @param {number}   [cfg.value]      Initial value (default: min)
 * @param {number}   [cfg.defaultValue] Value restored by double-click (default: value ?? min)
 * @param {string}   [cfg.unit]       Unit string appended to display
 * @param {Function} [cfg.format]     (val) => string display formatter
 * @param {boolean}  [cfg.hasLfo]     Adds CSS class has-lfo
 * @param {string}   [cfg.extraClass] Additional CSS class on the row
 * @param {Function} [cfg.onChange]   (val, key) => void callback
 */
export class BaseControl {
    #key
    #label
    #min
    #max
    #step
    #unit
    #format
    #hasLfo
    #extraClass
    #onChange
    #value
    #defaultValue
    #valSpan
    #gestureTargets
    #boundOnDblClick
    #boundOnContextMenu

    constructor(cfg) {
        this.#key = cfg.key
        this.#label = cfg.label
        this.#min = cfg.min
        this.#max = cfg.max
        this.#step = cfg.step
        this.#unit = cfg.unit ?? ''
        this.#format = cfg.format ?? _defaultFmt
        this.#hasLfo = cfg.hasLfo ?? false
        this.#extraClass = cfg.extraClass ?? ''
        this.#onChange = cfg.onChange ?? null
        this.#value = cfg.value ?? cfg.min
        this.#defaultValue = cfg.defaultValue ?? cfg.value ?? cfg.min

        this.el = null // div.ne-row — available after mount() / createElement()
        this.#valSpan = null
        this.#gestureTargets = []
        this.#boundOnDblClick = this.#onDblClick.bind(this)
        this.#boundOnContextMenu = this.#onContextMenu.bind(this)
    }

    // ─── Shared value core ─────────────────────────────────────────────────

    /** Formats the value for display, truncated to prevent CLS. */
    formatValue(v) {
        const raw = String(this.#format(v))
        const s = raw.length > 8 ? raw.slice(0, 8) : raw
        return this.#unit ? `${s} ${this.#unit}` : s
    }

    /**
     * Updates the value and its display; subclasses paint their own visuals
     * through applyValue().
     * @param {number} val
     * @param {boolean} [triggerCallback=false]
     */
    setValue(val, triggerCallback = false) {
        if (this.#value === val && !triggerCallback) return
        this.#value = val
        if (this.#valSpan) this.#valSpan.textContent = this.formatValue(val)
        this.applyValue(val)
        if (triggerCallback) this.#onChange?.(val, this.#key)
    }

    /**
     * setValue + onChange, only when the value actually moved — the drag / key
     * / typing path (a no-op step must not notify).
     * @param {number} val
     */
    commitValue(val) {
        if (this.#value === val) return
        this.setValue(val, true)
    }

    /** @returns {number} current value */
    getValue() {
        return this.#value
    }

    /**
     * Subclass hook: apply `val` to the control's own visuals (arc angle,
     * range input position…). The value span is already updated by then.
     * @param {number} _val
     */
    applyValue(_val) {}

    /**
     * Sanitize a raw number typed into the direct-input prompt.
     * Default: clamp to [min, max].
     * @param {number} num
     * @returns {number}
     */
    sanitizePromptInput(num) {
        return clamp(num, this.#min, this.#max)
    }

    // ─── Row CSS classes ───────────────────────────────────────────────────

    /**
     * Base row CSS class list: 'ne-row', the subclass base classes, plus the
     * shared has-lfo / extraClass flags.
     * @param {...string} base
     * @returns {string[]}
     */
    rowClassList(...base) {
        const c = ['ne-row', ...base]
        if (this.#hasLfo) c.push('has-lfo')
        if (this.#extraClass) c.push(this.#extraClass)
        return c
    }

    // ─── Shared gestures ───────────────────────────────────────────────────

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
        const val = promptNumericInput(this.#label, this.#min, this.#max, this.#value, this.#unit, (num) =>
            this.sanitizePromptInput(num)
        )
        if (val !== null) this.setValue(val, true)
    }

    /**
     * Binds the shared double-click (reset) and right-click (direct input)
     * gestures on `targets` plus the `.ne-val` value span. Rebinding replaces
     * the previous set.
     * @param {...(HTMLElement|null)} targets
     */
    bindGestures(...targets) {
        this.unbindGestures()
        this.#gestureTargets = [...new Set([...targets, this.#valSpan].filter(Boolean))]
        for (const el of this.#gestureTargets) {
            el.addEventListener('dblclick', this.#boundOnDblClick)
            el.addEventListener('contextmenu', this.#boundOnContextMenu)
        }
    }

    /** Removes the shared gestures from every target bound by bindGestures(). */
    unbindGestures() {
        for (const el of this.#gestureTargets) {
            el.removeEventListener('dblclick', this.#boundOnDblClick)
            el.removeEventListener('contextmenu', this.#boundOnContextMenu)
        }
        this.#gestureTargets = []
    }

    /**
     * Caches the `.ne-val` display span located by each control's bind path —
     * setValue() writes to it and bindGestures() wires its gestures.
     * @param {HTMLElement|null} el
     */
    setValSpan(el) {
        this.#valSpan = el
    }

    // ─── Public API ────────────────────────────────────────────────────────

    /** @returns {string} control identifier */
    get key() {
        return this.#key
    }

    /** @returns {string} display label */
    get label() {
        return this.#label
    }

    /** @returns {number} minimum value */
    get min() {
        return this.#min
    }

    /** @returns {number} maximum value */
    get max() {
        return this.#max
    }

    /** @returns {number} step increment */
    get step() {
        return this.#step
    }

    /** @returns {Function|null} current onChange callback */
    get onChange() {
        return this.#onChange
    }
    /** @param {Function|null} fn — rebind the onChange callback */
    set onChange(fn) {
        this.#onChange = fn
    }

    /** Toggles the LFO indicator CSS class. */
    setHasLfo(bool) {
        this.#hasLfo = bool
        this.el?.classList.toggle('has-lfo', bool)
    }

    /**
     * Updates the upper bound (a subclass refreshes its input in an override).
     * @param {number} max
     */
    setMax(max) {
        this.#max = max
    }

    /** Removes the shared gestures. Call before removing the element from the DOM. */
    destroy() {
        this.unbindGestures()
        this.el = null
        this.setValSpan(null)
    }
}
