import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { bindTabToggles } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import { OrKnob } from './components/or_knob.js'

const SPECTRUM_WIDTH = 256
const SPECTRUM_HEIGHT = 100
const COMP_CURVE_WIDTH = 320
const COMP_CURVE_HEIGHT = 140
// dB ranges for the transfer curve plot
const CURVE_X_MIN = -60
const CURVE_X_MAX = 0
const CURVE_Y_MIN = -60
const CURVE_Y_MAX = 12
import BasePanel from './base_panel.js'
import { color } from './theme.js'

const COMPRESSOR_PARAMS = [
    { key: 'threshold', label: 'Threshold', min: -40, max: 0,     step: 1,     default: -18,   unit: 'dB' },
    { key: 'ratio',     label: 'Ratio',     min: 1,   max: 20,    step: 0.5,   default: 8             },
    { key: 'attack',    label: 'Attack',    min: 0,   max: 1,     step: 0.001, default: 0.002, unit: 's' },
    { key: 'release',   label: 'Release',   min: 0,   max: 1,     step: 0.001, default: 0.08,  unit: 's' },
    { key: 'knee',      label: 'Knee',      min: 0,   max: 40,    step: 1,     default: 3,     unit: 'dB' },
    { key: 'makeup',    label: 'Makeup',    min: 0,   max: 24,    step: 0.5,   default: 8,     unit: 'dB' },
]

export default class OutputPanel extends BasePanel {
    #animId = null
    #visible = false
    #lowcutVal = 35
    #hicutVal = 18500
    #saveTimer = null
    #masterVol = null
    #preGain = null
    #compSliders = null
    #compBypass = false
    #compBypassBtn = null
    #compCurveCanvas = null
    #preGainEl = null
    #lowcut = null
    #hicut = null
    #bgColor = null

    constructor() {
        super('output-panel')
        this.canvas    = null
    }

    createDOM() {
        super.createDOM()
this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Master</span>
            </div>
            <div class="ne-tab-bar">
                <button class="ne-tab-btn active" data-ne-tab="master">vol</button>
                <button class="ne-tab-btn" data-ne-tab="compressor">Comp</button>
                <button class="ne-tab-btn" data-ne-tab="filters">Flt</button>
            </div>
            <div class="ne-tab-panel" data-tab-panel="master">
                <div class="ne-grid" id="op-master-grid"></div>
                <div id="op-analyzer-group"><canvas id="op-spectrum"></canvas></div>
            </div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="compressor">
                <div class="op-comp-panel" id="op-comp-panel"></div>
            </div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="filters">
                <div class="ne-grid" id="op-filters-grid"></div>
            </div>`

        this.#buildMasterSlider()
        this.#buildPreGainSlider()
        this.#buildCompressorSliders()
        this.#buildFilterSliders()

        this.canvas = this.container.querySelector('#op-spectrum')
        this.canvas.width  = SPECTRUM_WIDTH
        this.canvas.height = SPECTRUM_HEIGHT

        bindTabToggles(this.container)
        this.#restoreMasterSettings()
    }

    #buildMasterSlider() {
        this.#masterVol = new OrKnob({
            key:     'op-master-vol',
            label:   'Volume',
            min:     0,
            max:     2,
            step:    0.01,
            value:   1,
            format:  v => v.toFixed(2),
            onChange: v => {
                serviceRegistry.audioEngine?.mixer?.setMasterBus({ master: v })
                this.#persistMaster('volume', v)
            },
        })
        const el = this.#masterVol.createElement()
        el.dataset.orSlider = 'op-master-vol'
        this.container.querySelector('#op-master-grid').appendChild(el)
    }

    #buildPreGainSlider() {
        this.#preGain = new OrKnob({
            key:     'op-pregain',
            label:   'Pre-Gain',
            min:     -20,
            max:     20,
            step:    0.5,
            value:   0,
            format:  v => (v >= 0 ? '+' : '') + v.toFixed(1),
            unit:    'dB',
            onChange: v => {
                serviceRegistry.audioEngine?.mixer?.setMasterBus({ preGain: v })
                this.#persistMaster('preGain', v)
            },
        })
        const el = this.#preGain.createElement()
        el.classList.add('op-comp-pregain')
        this.#preGainEl = el
    }

    #buildCompressorSliders() {
        this.#compSliders = {}
        const panel = this.container.querySelector('#op-comp-panel')

        this.#compBypass = false
        const header = document.createElement('div')
        header.className = 'op-comp-header'
        const title = document.createElement('span')
        title.className = 'op-comp-title'
        title.textContent = 'COMPRESSOR'
        this.#compBypassBtn = document.createElement('button')
        this.#compBypassBtn.className = 'op-comp-bypass active'
        this.#compBypassBtn.innerHTML = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>'
        this.#compBypassBtn.title = 'Compressor on/off'
        this.#compBypassBtn.addEventListener('click', () => {
            this.#compBypass = !this.#compBypass
            this.#compBypassBtn.classList.toggle('active', !this.#compBypass)
            serviceRegistry.audioEngine?.mixer?.setMasterBus({ bypass: this.#compBypass })
            this.#persistMaster('compBypass', this.#compBypass)
            this.#drawCompCurve()
        })
        header.append(title, this.#compBypassBtn)

        const curveWrap = document.createElement('div')
        curveWrap.className = 'op-comp-curve-wrap'
        this.#compCurveCanvas = document.createElement('canvas')
        this.#compCurveCanvas.id = 'op-comp-curve'
        this.#compCurveCanvas.width = COMP_CURVE_WIDTH
        this.#compCurveCanvas.height = COMP_CURVE_HEIGHT
        curveWrap.appendChild(this.#compCurveCanvas)

        // Top row: pregain knob beside the transfer curve
        const topRow = document.createElement('div')
        topRow.className = 'op-comp-top-row'
        if (this.#preGainEl) topRow.appendChild(this.#preGainEl)
        topRow.appendChild(curveWrap)
        panel.appendChild(topRow)
        panel.appendChild(header)

        const knobsRow = document.createElement('div')
        knobsRow.className = 'op-comp-knobs'

        COMPRESSOR_PARAMS.forEach(p => {
            const knob = new OrKnob({
                key:      p.key,
                label:    p.label,
                min:      p.min,
                max:      p.max,
                step:     p.step,
                value:    p.default,
                format:   v => p.step < 1 ? parseFloat(v.toFixed(3)) : Math.round(v),
                unit:     p.unit ?? '',
                onChange: v => {
                    serviceRegistry.audioEngine?.mixer?.setMasterBus({ [p.key]: v })
                    this.#persistMaster(p.key, v)
                    if (p.key === 'threshold' || p.key === 'ratio' || p.key === 'knee' || p.key === 'makeup') {
                        this.#drawCompCurve()
                    }
                },
            })
            this.#compSliders[p.key] = knob
            knobsRow.appendChild(knob.createElement())
        })

        panel.appendChild(knobsRow)
        this.#drawCompCurve()
    }

    #buildFilterSliders() {
        const grid = this.container.querySelector('#op-filters-grid')

        this.#lowcut = new OrSlider({
            key:     'op-lowcut',
            label:   'Low Cut',
            min:     10,
            max:     500,
            step:    1,
            value:   35,
            noCursor: true,
            format:  v => Math.round(v),
            unit:    'Hz',
            onChange: v => {
                this.#lowcutVal = v
                this.#pushFilters()
            },
        })
        grid.appendChild(this.#lowcut.createElement())

        this.#hicut = new OrSlider({
            key:     'op-hicut',
            label:   'High Cut',
            min:     1000,
            max:     20000,
            step:    100,
            value:   18500,
            noCursor: true,
            format:  v => Math.round(v),
            unit:    'Hz',
            onChange: v => {
                this.#hicutVal = v
                this.#pushFilters()
            },
        })
        grid.appendChild(this.#hicut.createElement())
    }

    #pushFilters() {
        serviceRegistry.audioEngine?.mixer?.setMasterBus({
            lowcut: this.#lowcutVal,
            hicut:  this.#hicutVal,
        })
        this.#persistMaster('lowcut', this.#lowcutVal)
        this.#persistMaster('hicut', this.#hicutVal)
    }

    #persistMaster(key, value) {
        soundRegistry.settings.master[key] = value
        if (this.#saveTimer) clearTimeout(this.#saveTimer)
        this.#saveTimer = setTimeout(() => {
            serviceRegistry.resourcesLoader?.saveSettings?.()
        }, 500)
    }

    #restoreMasterSettings() {
        const m = soundRegistry.settings.master
        if (!m) return

        this.#masterVol?.setValue(m.volume)
        this.#preGain?.setValue(m.preGain)
        this.#lowcut?.setValue(m.lowcut)
        this.#hicut?.setValue(m.hicut)
        this.#lowcutVal = m.lowcut
        this.#hicutVal = m.hicut

        if (m.compBypass) {
            this.#compBypass = true
            this.#compBypassBtn?.classList.remove('active')
        }

        for (const p of COMPRESSOR_PARAMS) {
            if (p.key in m && this.#compSliders?.[p.key]) {
                this.#compSliders[p.key].setValue(m[p.key])
            }
        }
        this.#drawCompCurve()
    }

    subscribe() {}

    show() {
        super.show()
        this.#visible = true
        this.#drawCompCurve()
        this.#startAnimation()
    }

    hide() {
        super.hide()
        this.#visible = false
        this.#stopAnimation()
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    #startAnimation() {
        this.#stopAnimation()
        const draw = () => {
            if (!this.#visible) return
            this.#drawSpectrum()
            this.#animId = requestAnimationFrame(draw)
        }
        draw()
    }

    #stopAnimation() {
        if (this.#animId) {
            cancelAnimationFrame(this.#animId)
            this.#animId = null
        }
    }

    /** Returns the OrKnob instance for a given key (masterVol, preGain, or compressor param). */
    getKnob(key) {
        if (this.#masterVol?.key === key) return this.#masterVol
        if (this.#preGain?.key === key) return this.#preGain
        return this.#compSliders?.[key] ?? null
    }

    #drawSpectrum() {
        const canvas = this.canvas
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const h = canvas.height
        if (!this.#bgColor) {
            this.#bgColor = color('surface-2')
        }
        const data = serviceRegistry.audioEngine?.getAnalyserData?.()
        if (!data) {
            ctx.fillStyle = this.#bgColor
            ctx.fillRect(0, 0, w, h)
            return
        }
        data.analyser.getByteFrequencyData(data.gFftData)
        const bins     = data.gFftData
        const beatCount = Math.min(bins.length, w)

        ctx.fillStyle = this.#bgColor
        ctx.fillRect(0, 0, w, h)

        ctx.beginPath()
        ctx.strokeStyle = '#202321'
        ctx.lineWidth = 1.5
        for (let i = 0; i < beatCount; i++) {
            const val  = bins[i] / 255
            const x = (i / beatCount) * w
            const y = h - val * h
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.stroke()
    }

    /**
     * Soft-knee gain reduction in dB — mirrors master_bus_source.js
     * #computeGainReduction so the curve matches the audible result.
     */
    #gainReductionDb(inputDb, threshold, ratio, knee) {
        const overDb = inputDb - threshold
        if (overDb <= -knee / 2) return 0
        if (knee > 0 && overDb < knee / 2) {
            const d = overDb + knee / 2
            return (1 - 1 / ratio) * d * d / (2 * knee)
        }
        return overDb * (1 - 1 / ratio)
    }

    /** Draws the compressor transfer curve (input dB → output dB). */
    #drawCompCurve() {
        const canvas = this.#compCurveCanvas
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const w = canvas.width
        const h = canvas.height

        const threshold = this.#compSliders?.threshold?.getValue() ?? -18
        const ratio     = Math.max(1, this.#compSliders?.ratio?.getValue() ?? 8)
        const knee      = Math.max(0, this.#compSliders?.knee?.getValue() ?? 3)
        const makeup    = this.#compSliders?.makeup?.getValue() ?? 8
        const bypass    = this.#compBypass

        const xToPx = db => ((db - CURVE_X_MIN) / (CURVE_X_MAX - CURVE_X_MIN)) * w
        const yToPx = db => h - ((db - CURVE_Y_MIN) / (CURVE_Y_MAX - CURVE_Y_MIN)) * h

        const transfer = xDb => {
            if (bypass) return xDb
            return xDb - this.#gainReductionDb(xDb, threshold, ratio, knee) + makeup
        }

        // Background
        ctx.fillStyle = color('surface-2')
        ctx.fillRect(0, 0, w, h)

        // Grid lines at useful dB levels
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

        // 1:1 reference diagonal (dashed) — only within overlapping range
        ctx.strokeStyle = color('muted')
        ctx.setLineDash([6, 6])
        ctx.lineWidth = 1
        ctx.beginPath()
        const diagStart = Math.max(CURVE_X_MIN, CURVE_Y_MIN)
        const diagEnd   = Math.min(CURVE_X_MAX, CURVE_Y_MAX)
        ctx.moveTo(xToPx(diagStart), yToPx(diagStart))
        ctx.lineTo(xToPx(diagEnd), yToPx(diagEnd))
        ctx.stroke()
        ctx.setLineDash([])

        // Threshold marker (vertical dashed line)
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

        // Transfer curve
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

        // Axis labels
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

        // Bypass watermark
        if (bypass) {
            ctx.fillStyle = color('muted')
            ctx.font = 'bold 12px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('BYPASSED', w / 2, h / 2)
        }
    }
}
