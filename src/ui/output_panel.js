import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { bindTabToggles } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import { OrKnob } from './components/or_knob.js'
import BasePanel from './base_panel.js'

const COMPRESSOR_PARAMS = [
    { key: 'threshold', label: 'Threshold', min: -40, max: 0,     step: 1,     default: -18,   unit: 'dB' },
    { key: 'ratio',     label: 'Ratio',     min: 1,   max: 20,    step: 0.5,   default: 8             },
    { key: 'attack',    label: 'Attack',    min: 0,   max: 1,     step: 0.001, default: 0.002, unit: 's' },
    { key: 'release',   label: 'Release',   min: 0,   max: 1,     step: 0.001, default: 0.08,  unit: 's' },
    { key: 'knee',      label: 'Knee',      min: 0,   max: 40,    step: 1,     default: 3,     unit: 'dB' },
    { key: 'makeup',    label: 'Makeup',    min: 0,   max: 24,    step: 0.5,   default: 8,     unit: 'dB' },
]

export default class OutputPanel extends BasePanel {
    constructor() {
        super('output-panel')
        this.canvas    = null
        this._animId   = null
        this._visible  = false

        this._lowcutVal = 35
        this._hicutVal  = 18500
        this._spectrumLut = null
        this._saveTimer = null
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

        this._buildMasterSlider()
        this._buildPreGainSlider()
        this._buildCompressorSliders()
        this._buildFilterSliders()

        this.canvas = this.container.querySelector('#op-spectrum')
        this.canvas.width  = 256
        this.canvas.height = 100

        bindTabToggles(this.container)
        this._restoreMasterSettings()
    }

    _buildMasterSlider() {
        this._masterVol = new OrKnob({
            key:     'op-master-vol',
            label:   'Volume',
            min:     0,
            max:     2,
            step:    0.01,
            value:   1,
            format:  v => v.toFixed(2),
            onChange: v => {
                serviceRegistry.audioEngine?.mixer?.setMasterBus({ master: v })
                this._persistMaster('volume', v)
            },
        })
        const el = this._masterVol.createElement()
        el.dataset.orSlider = 'op-master-vol'
        this.container.querySelector('#op-master-grid').appendChild(el)
    }

    _buildPreGainSlider() {
        this._preGain = new OrKnob({
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
                this._persistMaster('preGain', v)
            },
        })
        const el = this._preGain.createElement()
        el.classList.add('op-comp-pregain')
        this.container.querySelector('#op-comp-panel').appendChild(el)
    }

    _buildCompressorSliders() {
        this._compSliders = {}
        const panel = this.container.querySelector('#op-comp-panel')

        this._compBypass = false
        const header = document.createElement('div')
        header.className = 'op-comp-header'
        const title = document.createElement('span')
        title.className = 'op-comp-title'
        title.textContent = 'COMPRESSOR'
        this._compBypassBtn = document.createElement('button')
        this._compBypassBtn.className = 'op-comp-bypass active'
        this._compBypassBtn.innerHTML = '&#9889;'
        this._compBypassBtn.title = 'Compressor on/off'
        this._compBypassBtn.addEventListener('click', () => {
            this._compBypass = !this._compBypass
            this._compBypassBtn.classList.toggle('active', !this._compBypass)
            serviceRegistry.audioEngine?.mixer?.setMasterBus({ bypass: this._compBypass })
            this._persistMaster('compBypass', this._compBypass)
        })
        header.append(title, this._compBypassBtn)
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
                    this._persistMaster(p.key, v)
                },
            })
            this._compSliders[p.key] = knob
            knobsRow.appendChild(knob.createElement())
        })

        panel.appendChild(knobsRow)
    }

    _buildFilterSliders() {
        const grid = this.container.querySelector('#op-filters-grid')

        this._lowcut = new OrSlider({
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
                this._lowcutVal = v
                this._pushFilters()
            },
        })
        grid.appendChild(this._lowcut.createElement())

        this._hicut = new OrSlider({
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
                this._hicutVal = v
                this._pushFilters()
            },
        })
        grid.appendChild(this._hicut.createElement())
    }

    _pushFilters() {
        serviceRegistry.audioEngine?.mixer?.setMasterBus({
            lowcut: this._lowcutVal,
            hicut:  this._hicutVal,
        })
        this._persistMaster('lowcut', this._lowcutVal)
        this._persistMaster('hicut', this._hicutVal)
    }

    _persistMaster(key, value) {
        soundRegistry.settings.master[key] = value
        if (this._saveTimer) clearTimeout(this._saveTimer)
        this._saveTimer = setTimeout(() => {
            serviceRegistry.resourcesLoader?.saveSettings?.()
        }, 500)
    }

    _restoreMasterSettings() {
        const m = soundRegistry.settings.master
        if (!m) return

        this._masterVol?.setValue(m.volume)
        this._preGain?.setValue(m.preGain)
        this._lowcut?.setValue(m.lowcut)
        this._hicut?.setValue(m.hicut)
        this._lowcutVal = m.lowcut
        this._hicutVal = m.hicut

        if (m.compBypass) {
            this._compBypass = true
            this._compBypassBtn?.classList.remove('active')
        }

        for (const p of COMPRESSOR_PARAMS) {
            if (p.key in m && this._compSliders?.[p.key]) {
                this._compSliders[p.key].setValue(m[p.key])
            }
        }
    }

    subscribe() {}

    show() {
        super.show()
        this._visible = true
        this._startAnimation()
    }

    hide() {
        super.hide()
        this._visible = false
        this._stopAnimation()
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    _startAnimation() {
        this._stopAnimation()
        const draw = () => {
            if (!this._visible) return
            this._drawSpectrum()
            this._animId = requestAnimationFrame(draw)
        }
        draw()
    }

    _stopAnimation() {
        if (this._animId) {
            cancelAnimationFrame(this._animId)
            this._animId = null
        }
    }

    _drawSpectrum() {
        const canvas = this.canvas
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const h = canvas.height
        if (!this._bgColor) {
            this._bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim() || '#0d0d1a'
        }
        const data = serviceRegistry.audioEngine?.getAnalyserData?.()
        if (!data) {
            ctx.fillStyle = this._bgColor
            ctx.fillRect(0, 0, w, h)
            return
        }
        data.analyser.getByteFrequencyData(data.gFftData)
        const bins     = data.gFftData
        const beatCount = Math.min(bins.length, w)
        const beatW     = w / beatCount

        if (!this._spectrumLut || this._spectrumLut.length < beatCount) {
            this._spectrumLut = new Array(beatCount)
            for (let i = 0; i < beatCount; i++) {
                const val = i / beatCount
                const r = Math.floor(200 + 55 * val)
                const g = Math.floor(69 * (1 - val * 0.5))
                const b = Math.floor(96 * (1 - val * 0.7))
                this._spectrumLut[i] = `rgb(${r},${g},${b})`
            }
        }

        ctx.fillStyle = this._bgColor
        ctx.fillRect(0, 0, w, h)

        for (let i = 0; i < beatCount; i++) {
            const val  = bins[i] / 255
            const beatH = val * h
            ctx.fillStyle = this._spectrumLut[i]
            ctx.fillRect(i * beatW, h - beatH, Math.max(1, beatW - 0.5), beatH)
        }
    }
}
