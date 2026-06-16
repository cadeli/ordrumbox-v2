import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { bindCloseButton, bindAccordionToggles, buildAccordionGroup } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
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
    }

    createDOM() {
        super.createDOM()
        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Output</span>
                <button class="ne-close">&times;</button>
            </div>
            <div class="ne-body">
                ${buildAccordionGroup('master', 'Master', 'Mst', true, '', { gridId: 'op-master-grid' })}
                ${buildAccordionGroup('compressor', 'Compressor', 'Comp', true, '', { gridId: 'op-comp-grid', gridClass: 'ne-grid ne-grid-2col' })}
                ${buildAccordionGroup('filters', 'Filters', 'Flt', true, '', { gridId: 'op-filters-grid' })}
                ${buildAccordionGroup('spectrum', 'Spectrum', 'Spec', true, '<canvas id="op-spectrum"></canvas>', { extraAttrs: 'id="op-analyzer-group"' })}
            </div>
        `

        this._buildMasterSlider()
        this._buildPreGainSlider()
        this._buildCompressorSliders()
        this._buildFilterSliders()

        this.canvas = this.container.querySelector('#op-spectrum')
        this.canvas.width  = 256
        this.canvas.height = 100

        bindCloseButton(this.container, () => this.hide())

        const targetMap = {
            master:     '#op-master-vol',
            compressor: '.ne-group:nth-child(2) .ne-group-content',
            filters:    '.ne-group:nth-child(3) .ne-group-content',
            spectrum:   '#op-analyzer-group .ne-group-content',
        }
        bindAccordionToggles(this.container, (key) => this.container.querySelector(targetMap[key]))
    }

    _buildMasterSlider() {
        this._masterVol = new OrSlider({
            key:     'op-master-vol',
            label:   'Volume',
            min:     0,
            max:     2,
            step:    0.01,
            value:   1,
            noCursor: true,
            format:  v => v.toFixed(2),
            onChange: v => serviceRegistry.audioEngine?.mixer?.setMasterBus({ master: v }),
        })
        const row = this._masterVol.createElement()
        row.querySelector('input[type=range]').id = 'op-master-vol'
        this.container.querySelector('#op-master-grid').appendChild(row)
    }

    _buildPreGainSlider() {
        this._preGain = new OrSlider({
            key:     'op-pregain',
            label:   'Pre-Gain',
            min:     -20,
            max:     20,
            step:    0.5,
            value:   0,
            noCursor: true,
            format:  v => (v >= 0 ? '+' : '') + v.toFixed(1),
            unit:    'dB',
            onChange: v => serviceRegistry.audioEngine?.mixer?.setMasterBus({ preGain: v }),
        })
        this.container.querySelector('#op-comp-grid').appendChild(this._preGain.createElement())
    }

    _buildCompressorSliders() {
        this._compSliders = {}
        const grid = this.container.querySelector('#op-comp-grid')
        COMPRESSOR_PARAMS.forEach(p => {
            const slider = new OrSlider({
                key:      p.key,
                label:    p.label,
                min:      p.min,
                max:      p.max,
                step:     p.step,
                value:    p.default,
                noCursor: true,
                format:   v => p.step < 1 ? parseFloat(v.toFixed(3)) : Math.round(v),
                unit:     p.unit ?? '',
                onChange: v => serviceRegistry.audioEngine?.mixer?.setMasterBus({ [p.key]: v }),
            })
            this._compSliders[p.key] = slider
            grid.appendChild(slider.createElement())
        })
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
    }

    subscribe() {
        playbackEvents.onOutputToggle.push((show) => { if (show) this.show(); else this.hide() })
        playbackEvents.onTrackSelect.push((data)  => { if (data) this.hide() })
        playbackEvents.onNoteSelect.push((data)   => { if (data) this.hide() })
    }

    show() {
        super.show(['te-panel', 'ne-panel', 'tools-panel', 'about-panel', 'soft-synth-panel'])
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        this._visible = true
        this._startAnimation()
    }

    hide() {
        super.hide()
        this._visible = false
        this._stopAnimation()
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    sync() {
        const mixer = serviceRegistry.audioEngine?.mixer
        if (!mixer) return
    }

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
        const data = serviceRegistry.audioEngine?.getAnalyserData?.()
        if (!data) {
            ctx.fillStyle = '#0d0d1a'
            ctx.fillRect(0, 0, w, h)
            return
        }
        data.analyser.getByteFrequencyData(data.gFftData)
        const bins     = data.gFftData
        const barCount = Math.min(bins.length, w)
        const barW     = w / barCount

        if (!this._spectrumLut || this._spectrumLut.length < barCount) {
            this._spectrumLut = new Array(barCount)
            for (let i = 0; i < barCount; i++) {
                const val = i / barCount
                const r = Math.floor(200 + 55 * val)
                const g = Math.floor(69 * (1 - val * 0.5))
                const b = Math.floor(96 * (1 - val * 0.7))
                this._spectrumLut[i] = `rgb(${r},${g},${b})`
            }
        }

        ctx.fillStyle = '#0d0d1a'
        ctx.fillRect(0, 0, w, h)

        for (let i = 0; i < barCount; i++) {
            const val  = bins[i] / 255
            const barH = val * h
            ctx.fillStyle = this._spectrumLut[i]
            ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 0.5), barH)
        }
    }
}
