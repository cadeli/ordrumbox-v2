import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { bindTabToggles } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import { OrKnob } from './components/or_knob.js'
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
    #spectrumLut = null
    #saveTimer = null
    #masterVol = null
    #preGain = null
    #compSliders = null
    #compBypass = false
    #compBypassBtn = null
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
        this.canvas.width  = 256
        this.canvas.height = 100

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
        this.container.querySelector('#op-comp-panel').appendChild(el)
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
        })
        header.append(title, this.#compBypassBtn)
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
                },
            })
            this.#compSliders[p.key] = knob
            knobsRow.appendChild(knob.createElement())
        })

        panel.appendChild(knobsRow)
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
    }

    subscribe() {}

    show() {
        super.show()
        this.#visible = true
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

    #drawSpectrum() {
        const canvas = this.canvas
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const h = canvas.height
        if (!this.#bgColor) {
            this.#bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim() || color('bg-canvas')
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
        const beatW     = w / beatCount

        if (!this.#spectrumLut || this.#spectrumLut.length < beatCount) {
            this.#spectrumLut = new Array(beatCount)
            for (let i = 0; i < beatCount; i++) {
                const val = i / beatCount
                const r = Math.floor(200 + 55 * val)
                const g = Math.floor(69 * (1 - val * 0.5))
                const b = Math.floor(96 * (1 - val * 0.7))
                this.#spectrumLut[i] = `rgb(${r},${g},${b})`
            }
        }

        ctx.fillStyle = this.#bgColor
        ctx.fillRect(0, 0, w, h)

        for (let i = 0; i < beatCount; i++) {
            const val  = bins[i] / 255
            const beatH = val * h
            ctx.fillStyle = this.#spectrumLut[i]
            ctx.fillRect(i * beatW, h - beatH, Math.max(1, beatW - 0.5), beatH)
        }
    }
}
