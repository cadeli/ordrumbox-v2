import { fmt as _defaultFmt, escapeHtml as _escHtml } from './ui_utils.js'

export class OrKnob {
    constructor(cfg) {
        this._key         = cfg.key
        this._label       = cfg.label
        this._min         = cfg.min
        this._max         = cfg.max
        this._step        = cfg.step
        this._format      = cfg.format    ?? _defaultFmt
        this._normalize   = cfg.normalize   ?? null
        this._denormalize = cfg.denormalize ?? null
        this._hasLfo      = cfg.hasLfo    ?? false
        this._extraClass  = cfg.extraClass ?? ''
        this._onChange     = cfg.onChange  ?? null
        this._value       = cfg.value     ?? cfg.min
        this._unit        = cfg.unit      ?? ''

        this.el       = null
        this._valSpan = null
        this._knob    = null

        this._dragging  = false
        this._dragStartY = 0
        this._dragStartVal = 0
        this._boundOnKeydown = this._onKeydown.bind(this)
    }

    _toNorm(v) {
        return this._normalize ? this._normalize(v) : v
    }

    _toDenorm(v) {
        return this._denormalize ? this._denormalize(v) : v
    }

    _fmt(v) {
        const s = String(this._format(v))
        return this._unit ? `${s} ${this._unit}` : s
    }

    _pct() {
        return Math.max(0, Math.min(100, ((this._value - this._min) / (this._max - this._min)) * 100))
    }

    _rowClasses() {
        const c = ['ne-row', 'ne-row-knob']
        if (this._hasLfo) c.push('has-lfo')
        if (this._extraClass) c.push(this._extraClass)
        return c.join(' ')
    }

    toHTML() {
        const pct = this._pct()
        const deg = (pct / 100) * 270
        const rot = -135 + (pct / 100) * 270
        return `<div class="${this._rowClasses()}" data-or-slider="${this._key}" data-prop="${this._key}">
            <div class="or-knob" data-or-knob="${this._key}" style="--arc-deg:${deg}deg;--pointer-rot:${rot}deg" tabindex="0">
                <div class="or-knob-arc"></div>
                <div class="or-knob-disc"></div>
                <div class="or-knob-pointer"></div>
                <div class="or-knob-center"></div>
            </div>
            <span class="or-knob-label">${_escHtml(this._label)}</span>
            <span class="ne-val" data-key="${this._key}">${this._fmt(this._value)}</span>
        </div>`
    }

    mount(rowEl) {
        this.el = rowEl
        this._valSpan = rowEl.querySelector('.ne-val')
        this._knob = rowEl.querySelector('.or-knob')
        if (!this._knob) return
        this._bindDrag()
        this._knob.addEventListener('keydown', this._boundOnKeydown)
    }

    _bindDrag() {
        const knob = this._knob
        knob.addEventListener('mousedown', (e) => {
            e.preventDefault()
            this._dragging = false
            this._dragStartY = e.clientY
            this._dragStartVal = this._value
            knob.classList.add('dragging')

            const range = this._max - this._min
            const sensitivity = range / 200

            const onMove = (ev) => {
                const deltaY = this._dragStartY - ev.clientY
                if (Math.abs(deltaY) > 2) this._dragging = true
                const raw = this._dragStartVal + deltaY * sensitivity
                const stepped = Math.round(raw / this._step) * this._step
                const clamped = Math.max(this._min, Math.min(this._max, stepped))
                this.setValue(clamped)
                this._onChange?.(clamped, this._key)
            }
            const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
                knob.classList.remove('dragging')
                if (this._dragging) {
                    this._onChange?.(this._value, this._key)
                }
                setTimeout(() => { this._dragging = false }, 50)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        })
    }

    _onKeydown(e) {
        const isUp   = e.key === 'ArrowUp'   || e.key === 'ArrowRight'
        const isDown = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
        if (!isUp && !isDown) return
        e.preventDefault()

        let mult = 1
        if (e.shiftKey) mult = 10
        if (e.altKey)   mult = 0.1

        const delta = (isUp ? 1 : -1) * this._step * mult
        const raw = this._value + delta
        const stepped = Math.round(raw / this._step) * this._step
        const clamped = Math.max(this._min, Math.min(this._max, stepped))
        this.setValue(clamped)
        this._onChange?.(clamped, this._key)
    }

    setValue(val, triggerCallback = false) {
        this._value = val
        const pct = this._pct()
        const deg = (pct / 100) * 270
        const rot = -135 + (pct / 100) * 270
        if (this._knob) {
            this._knob.style.setProperty('--arc-deg', `${deg}deg`)
            this._knob.style.setProperty('--pointer-rot', `${rot}deg`)
        }
        if (this._valSpan) this._valSpan.textContent = this._fmt(val)
        if (triggerCallback) this._onChange?.(val, this._key)
    }

    getValue() { return this._value }

    setHasLfo(bool) {
        this._hasLfo = bool
        this.el?.classList.toggle('has-lfo', bool)
    }

    setDisabled(bool) {
        if (this._knob) this._knob.style.opacity = bool ? '0.4' : ''
    }

    destroy() {
        this._knob?.removeEventListener('keydown', this._boundOnKeydown)
        this.el = null
        this._valSpan = null
        this._knob = null
    }
}