// src/ui/output_panel/compressor_section.js
// Compressor knobs, bypass toggle and transfer-curve plot.

import { OrKnob } from '../components/or_knob.js'
import { color } from '../theme.js'

const COMP_CURVE_WIDTH = 320
const COMP_CURVE_HEIGHT = 140
const CURVE_X_MIN = -60
const CURVE_X_MAX = 0
const CURVE_Y_MIN = -60
const CURVE_Y_MAX = 12

const COMPRESSOR_PARAMS = [
    { key: 'threshold', label: 'Threshold', min: -40, max: 0, step: 1, default: -18, unit: 'dB' },
    { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, default: 8 },
    { key: 'attack', label: 'Attack', min: 0, max: 1, step: 0.001, default: 0.002, unit: 's' },
    { key: 'release', label: 'Release', min: 0, max: 1, step: 0.001, default: 0.08, unit: 's' },
    { key: 'knee', label: 'Knee', min: 0, max: 40, step: 1, default: 3, unit: 'dB' },
    { key: 'makeup', label: 'Makeup', min: 0, max: 24, step: 0.5, default: 8, unit: 'dB' },
]

export default class CompressorSection {
    #editor
    #compKnobs
    #compBypass
    #compBypassBtn
    #compCurveCanvas

    /** @param {import('../output_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#compKnobs = {}
        this.#compBypass = false
        this.#compBypassBtn = null
        this.#compCurveCanvas = null
    }

    get compKnobs() {
        return this.#compKnobs
    }
    get compBypass() {
        return this.#compBypass
    }
    get compBypassBtn() {
        return this.#compBypassBtn
    }
    get compCurveCanvas() {
        return this.#compCurveCanvas
    }
    get compCurveWidth() {
        return COMP_CURVE_WIDTH
    }
    get compCurveHeight() {
        return COMP_CURVE_HEIGHT
    }
    setCompBypass(v) {
        this.#compBypass = v
        this.#compBypassBtn?.classList.toggle('active', !v)
    }

    buildCompressorKnobs() {
        this.#compKnobs = {}
        const panel = this.#editor.container.querySelector('#op-comp-panel')

        this.#compBypass = false
        const header = document.createElement('div')
        header.className = 'op-comp-header'
        const title = document.createElement('span')
        title.className = 'op-comp-title'
        title.textContent = 'COMPRESSOR'
        this.#compBypassBtn = document.createElement('button')
        this.#compBypassBtn.className = 'op-comp-bypass active'
        this.#compBypassBtn.innerHTML =
            '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>'
        this.#compBypassBtn.title = 'Compressor on/off'
        this.#compBypassBtn.addEventListener('click', () => {
            this.#compBypass = !this.#compBypass
            this.#compBypassBtn.classList.toggle('active', !this.#compBypass)
            this.#editor.serviceRegistry.audioEngine?.mixer?.setMasterBus({ bypass: this.#compBypass })
            this.#editor.persistMaster('compBypass', this.#compBypass)
            this.drawCompCurve()
        })
        header.append(title, this.#compBypassBtn)

        const curveWrap = document.createElement('div')
        curveWrap.className = 'op-comp-curve-wrap'
        this.#compCurveCanvas = document.createElement('canvas')
        this.#compCurveCanvas.id = 'op-comp-curve'
        this.#compCurveCanvas.width = COMP_CURVE_WIDTH
        this.#compCurveCanvas.height = COMP_CURVE_HEIGHT
        curveWrap.appendChild(this.#compCurveCanvas)

        const topRow = document.createElement('div')
        topRow.className = 'op-comp-top-row'
        const preGainEl = this.#editor.preGainEl
        if (preGainEl) topRow.appendChild(preGainEl)
        topRow.appendChild(curveWrap)
        panel.appendChild(topRow)
        panel.appendChild(header)

        const knobsRow = document.createElement('div')
        knobsRow.className = 'op-comp-knobs'

        COMPRESSOR_PARAMS.forEach((p) => {
            const knob = new OrKnob({
                key: p.key,
                label: p.label,
                min: p.min,
                max: p.max,
                step: p.step,
                value: p.default,
                format: (v) => (p.step < 1 ? parseFloat(v.toFixed(3)) : Math.round(v)),
                unit: p.unit ?? '',
                onChange: (v) => {
                    this.#editor.serviceRegistry.audioEngine?.mixer?.setMasterBus({ [p.key]: v })
                    this.#editor.persistMaster(p.key, v)
                    if (p.key === 'threshold' || p.key === 'ratio' || p.key === 'knee' || p.key === 'makeup') {
                        this.drawCompCurve()
                    }
                },
            })
            this.#compKnobs[p.key] = knob
            knobsRow.appendChild(knob.createElement())
        })

        panel.appendChild(knobsRow)
        this.drawCompCurve()
    }

    #gainReductionDb(inputDb, threshold, ratio, knee) {
        const overDb = inputDb - threshold
        if (overDb <= -knee / 2) return 0
        if (knee > 0 && overDb < knee / 2) {
            const d = overDb + knee / 2
            return ((1 - 1 / ratio) * d * d) / (2 * knee)
        }
        return overDb * (1 - 1 / ratio)
    }

    drawCompCurve() {
        const canvas = this.#compCurveCanvas
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const w = canvas.width
        const h = canvas.height

        const threshold = this.#compKnobs?.threshold?.getValue() ?? -18
        const ratio = Math.max(1, this.#compKnobs?.ratio?.getValue() ?? 8)
        const knee = Math.max(0, this.#compKnobs?.knee?.getValue() ?? 3)
        const makeup = this.#compKnobs?.makeup?.getValue() ?? 8
        const bypass = this.#compBypass

        const xToPx = (db) => ((db - CURVE_X_MIN) / (CURVE_X_MAX - CURVE_X_MIN)) * w
        const yToPx = (db) => h - ((db - CURVE_Y_MIN) / (CURVE_Y_MAX - CURVE_Y_MIN)) * h

        const transfer = (xDb) => {
            if (bypass) return xDb
            return xDb - this.#gainReductionDb(xDb, threshold, ratio, knee) + makeup
        }

        ctx.fillStyle = color('surface-2')
        ctx.fillRect(0, 0, w, h)

        ctx.strokeStyle = color('border-subtle')
        ctx.lineWidth = 1
        ctx.setLineDash([])
        for (const db of [-60, -40, -20, 0]) {
            const x = xToPx(db)
            const y = yToPx(db)
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, h)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(w, y)
            ctx.stroke()
        }

        ctx.strokeStyle = color('muted')
        ctx.setLineDash([6, 6])
        ctx.lineWidth = 1
        ctx.beginPath()
        const diagStart = Math.max(CURVE_X_MIN, CURVE_Y_MIN)
        const diagEnd = Math.min(CURVE_X_MAX, CURVE_Y_MAX)
        ctx.moveTo(xToPx(diagStart), yToPx(diagStart))
        ctx.lineTo(xToPx(diagEnd), yToPx(diagEnd))
        ctx.stroke()
        ctx.setLineDash([])

        if (!bypass && threshold >= CURVE_X_MIN && threshold <= CURVE_X_MAX) {
            const tx = xToPx(threshold)
            ctx.strokeStyle = color('color-warning')
            ctx.setLineDash([4, 4])
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(tx, 0)
            ctx.lineTo(tx, h)
            ctx.stroke()
            ctx.setLineDash([])
        }

        ctx.strokeStyle = bypass ? color('muted') : color('accent')
        ctx.lineWidth = 2.5
        ctx.beginPath()
        const steps = w
        for (let px = 0; px <= steps; px++) {
            const xDb = CURVE_X_MIN + (px / steps) * (CURVE_X_MAX - CURVE_X_MIN)
            const yDb = transfer(xDb)
            const py = yToPx(yDb)
            if (px === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
        }
        ctx.stroke()

        ctx.fillStyle = color('muted')
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(`${CURVE_Y_MAX} dB`, 4, 12)
        ctx.textAlign = 'left'
        ctx.fillText(`${CURVE_Y_MIN} dB`, 4, h - 4)
        ctx.textAlign = 'right'
        ctx.fillText('0 dB', w - 4, h - 4)
        ctx.textAlign = 'left'
        ctx.fillText(`${CURVE_X_MIN} dB`, 4, h - 16)

        if (bypass) {
            ctx.fillStyle = color('muted')
            ctx.font = 'bold 12px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('BYPASSED', w / 2, h / 2)
        }
    }
}
