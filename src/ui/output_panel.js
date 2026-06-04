import { serviceRegistry } from '../state/service_registry.js'
import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { bindCloseButton, bindPanelToggles, hidePanelsById, injectUiCss, positionBelowPatternPanel } from './panel_helpers.js'

const COMPRESSOR_PARAMS = [
    { key: 'threshold', label: 'Threshold', min: -40, max: 0, step: 1, default: -12, unit: 'dB' },
    { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, default: 4 },
    { key: 'attack', label: 'Attack', min: 0, max: 1, step: 0.001, default: 0.005, unit: 's' },
    { key: 'release', label: 'Release', min: 0, max: 1, step: 0.001, default: 0.15, unit: 's' },
    { key: 'knee', label: 'Knee', min: 0, max: 40, step: 1, default: 30, unit: 'dB' },
]

export default class OutputPanel {
    constructor() {
        this.container = null
        this.canvas = null
        this._animId = null
        this._visible = false
    }

    injectCSS() {
        injectUiCss()
    }

    init() {
        this.injectCSS()
        this.createDOM()
        this.subscribe()
        this._syncWorklet()
    }

    createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'output-panel'
        this.container.style.display = 'none'

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Output</span>
                <div class="ne-toggles">
                    <button class="ne-toggle active" data-toggle="master">Master</button>
                    <button class="ne-toggle active" data-toggle="filters">Flt</button>
                    <button class="ne-toggle active" data-toggle="compressor">Comp</button>
                    <button class="ne-toggle active" data-toggle="spectrum">Spec</button>
                </div>
                <button class="ne-close">&times;</button>
            </div>
            <div class="ne-body">
                <div class="ne-group">
                    <div class="ne-group-label">Engine</div>
                    <div class="ne-grid">
                        <div class="ne-row no-cursor op-worklet-row">
                            <label class="op-toggle-label">
                                <input type="checkbox" id="op-use-worklets">
                                <span>Use Audio Worklets</span>
                            </label>
                            <span class="op-worklet-status" id="op-worklet-status">OFF</span>
                        </div>
                    </div>
                </div>
                <div class="ne-group">
                    <div class="ne-group-label">Master</div>
                    <div class="ne-grid">
                        <div class="ne-row no-cursor">
                            <label>Volume</label>
                            <input type="range" min="0" max="2" step="0.01" value="1" id="op-master-vol">
                            <span class="ne-val" id="op-master-vol-val">1.00</span>
                        </div>
                    </div>
                </div>
                <div class="ne-group">
                    <div class="ne-group-label">Filters</div>
                    <div class="ne-grid">
                        <div class="ne-row no-cursor">
                            <label>Low Cut</label>
                            <input type="range" min="10" max="500" step="1" value="35" id="op-lowcut">
                            <span class="ne-val" id="op-lowcut-val">35 Hz</span>
                        </div>
                        <div class="ne-row no-cursor">
                            <label>High Cut</label>
                            <input type="range" min="1000" max="20000" step="100" value="18500" id="op-hicut">
                            <span class="ne-val" id="op-hicut-val">18500 Hz</span>
                        </div>
                    </div>
                </div>
                <div class="ne-group">
                    <div class="ne-group-label">Compressor</div>
                    <div class="ne-grid" id="op-comp-grid"></div>
                </div>
                <div class="ne-group" id="op-analyzer-group">
                    <div class="ne-group-label">Spectrum</div>
                    <canvas id="op-spectrum"></canvas>
                </div>
            </div>
        `

        document.body.appendChild(this.container)
        this._compGrid = this.container.querySelector('#op-comp-grid')
        COMPRESSOR_PARAMS.forEach(p => {
            const row = document.createElement('div')
            row.className = 'ne-row no-cursor'
            row.innerHTML = `
                <label>${p.label}</label>
                <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.default}" data-comp="${p.key}">
                <span class="ne-val" data-comp-val="${p.key}">${p.default}${p.unit ? ' ' + p.unit : ''}</span>
            `
            row.querySelector('input[type=range]').addEventListener('input', (e) => this._onCompSlider(e))
            this._compGrid.appendChild(row)
        })

        this.canvas = this.container.querySelector('#op-spectrum')
        this.canvas.width = 256
        this.canvas.height = 100

        const masterSlider = this.container.querySelector('#op-master-vol')
        masterSlider.addEventListener('input', () => this._onMasterVolume())

        const lowcutSlider = this.container.querySelector('#op-lowcut')
        lowcutSlider.addEventListener('input', () => this._onFilterChange())

        const hicutSlider = this.container.querySelector('#op-hicut')
        hicutSlider.addEventListener('input', () => this._onFilterChange())

        const workletCheckbox = this.container.querySelector('#op-use-worklets')
        workletCheckbox.addEventListener('change', () => this._onWorkletToggle())

        bindCloseButton(this.container, () => this.hide())

        const targetMap = { master: '#op-master-vol', filters: '.ne-group:nth-child(2)', compressor: '.ne-group:nth-child(3)', spectrum: '#op-analyzer-group' }
        bindPanelToggles(this.container, (key) => {
            return this.container.querySelector(targetMap[key])
        })
    }

    subscribe() {
        playbackEvents.onOutputToggle.push((show) => {
            if (show) this.show()
            else this.hide()
        })
        playbackEvents.onTrackSelect.push((data) => {
            if (data) this.hide()
        })
        playbackEvents.onNoteSelect.push((data) => {
            if (data) this.hide()
        })
        playbackEvents.onWorkletStatusChange.push(() => this._syncWorklet())
    }

    show() {
        hidePanelsById(['te-panel', 'ne-panel', 'tools-panel', 'about-panel'])

        this.container.style.display = 'block'
        this._visible = true
        this._sync()
        this.reposition()
        this._startAnimation()
    }

    hide() {
        this.container.style.display = 'none'
        this._visible = false
        this._stopAnimation()
    }

    reposition() {
        positionBelowPatternPanel(this.container)
    }

    _sync() {
        this._syncWorklet()
        const mixer = serviceRegistry.audioEngine?.mixer
        if (!mixer) return

        const masterSlider = this.container.querySelector('#op-master-vol')
        const masterVal = this.container.querySelector('#op-master-vol-val')
        if (mixer.masterGain) {
            const v = mixer.masterGain.gain.value
            masterSlider.value = v
            masterVal.textContent = v.toFixed(2)
        }

        const lowcutSlider = this.container.querySelector('#op-lowcut')
        const lowcutVal = this.container.querySelector('#op-lowcut-val')
        if (mixer.lowcutFilter) {
            const v = mixer.lowcutFilter.frequency.value
            lowcutSlider.value = v
            lowcutVal.textContent = Math.round(v) + ' Hz'
        }

        const hicutSlider = this.container.querySelector('#op-hicut')
        const hicutVal = this.container.querySelector('#op-hicut-val')
        if (mixer.hicutFilter) {
            const v = mixer.hicutFilter.frequency.value
            hicutSlider.value = v
            hicutVal.textContent = Math.round(v) + ' Hz'
        }

        COMPRESSOR_PARAMS.forEach(p => {
            if (mixer.compressor) {
                const v = mixer.compressor[p.key].value
                const slider = this.container.querySelector(`input[data-comp="${p.key}"]`)
                const val = this.container.querySelector(`span[data-comp-val="${p.key}"]`)
                if (slider && val) {
                    slider.value = v
                    val.textContent = p.step < 1 ? parseFloat(v.toFixed(3)) + (p.unit ? ' ' + p.unit : '') : Math.round(v) + (p.unit ? ' ' + p.unit : '')
                }
            }
        })
    }

    _onMasterVolume() {
        const slider = this.container.querySelector('#op-master-vol')
        const val = this.container.querySelector('#op-master-vol-val')
        const v = parseFloat(slider.value)
        val.textContent = v.toFixed(2)
        const mixer = serviceRegistry.audioEngine?.mixer
        if (mixer?.masterGain) {
            mixer.masterGain.gain.setValueAtTime(v, mixer.audioCtx.currentTime)
        }
    }

    _onFilterChange() {
        const lowcutSlider = this.container.querySelector('#op-lowcut')
        const lowcutVal = this.container.querySelector('#op-lowcut-val')
        const hicutSlider = this.container.querySelector('#op-hicut')
        const hicutVal = this.container.querySelector('#op-hicut-val')
        const lv = parseFloat(lowcutSlider.value)
        const hv = parseFloat(hicutSlider.value)
        lowcutVal.textContent = Math.round(lv) + ' Hz'
        hicutVal.textContent = Math.round(hv) + ' Hz'
        const mixer = serviceRegistry.audioEngine?.mixer
        if (mixer?.lowcutFilter) {
            mixer.lowcutFilter.frequency.setValueAtTime(lv, mixer.audioCtx.currentTime)
        }
        if (mixer?.hicutFilter) {
            mixer.hicutFilter.frequency.setValueAtTime(hv, mixer.audioCtx.currentTime)
        }
    }

    _onCompSlider(e) {
        const key = e.target.dataset.comp
        const v = parseFloat(e.target.value)
        const val = this.container.querySelector(`span[data-comp-val="${key}"]`)
        const param = COMPRESSOR_PARAMS.find(p => p.key === key)
        val.textContent = param && param.step < 1 ? parseFloat(v.toFixed(3)) + (param.unit ? ' ' + param.unit : '') : Math.round(v) + (param.unit ? ' ' + param.unit : '')

        const mixer = serviceRegistry.audioEngine?.mixer
        if (mixer?.compressor && mixer.compressor[key]) {
            mixer.compressor[key].setValueAtTime(v, mixer.audioCtx.currentTime)
        }
    }

    _syncWorklet() {
        const checkbox = this.container.querySelector('#op-use-worklets')
        const badge = this.container.querySelector('#op-worklet-status')
        if (!checkbox || !badge) return
        const status = appState.workletStatus
        const enabled = appState.useWorklets === 1 || status === 'active'
        checkbox.checked = enabled
        checkbox.disabled = status === 'active'  // can't disable once active
        badge.classList.remove('op-status-off', 'op-status-active', 'op-status-unavailable')
        if (status === 'active') {
            badge.textContent = 'ACTIVE'
            badge.classList.add('op-status-active')
        } else if (status === 'unavailable') {
            badge.textContent = 'UNAVAILABLE'
            badge.classList.add('op-status-unavailable')
        } else {
            badge.textContent = 'OFF'
            badge.classList.add('op-status-off')
        }
    }

    _onWorkletToggle() {
        const checkbox = this.container.querySelector('#op-use-worklets')
        const badge = this.container.querySelector('#op-worklet-status')
        if (!checkbox) return
        const engine = serviceRegistry.audioEngine
        if (!engine) {
            checkbox.checked = false
            return
        }
        if (checkbox.checked) {
            appState.useWorklets = 1
            if (badge) {
                badge.textContent = '...'
                badge.classList.remove('op-status-off', 'op-status-active', 'op-status-unavailable')
            }
            engine.upgradeToWorklets().then((ok) => {
                if (!ok) {
                    appState.useWorklets = 0
                    checkbox.checked = false
                }
            })
        } else {
            appState.useWorklets = 0
        }
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
        const bins = data.gFftData
        const barCount = Math.min(bins.length, w)
        const barW = w / barCount

        ctx.fillStyle = '#0d0d1a'
        ctx.fillRect(0, 0, w, h)

        for (let i = 0; i < barCount; i++) {
            const val = bins[i] / 255
            const barH = val * h
            const r = Math.floor(200 + 55 * val)
            const g = Math.floor(69 * (1 - val * 0.5))
            const b = Math.floor(96 * (1 - val * 0.7))
            ctx.fillStyle = `rgb(${r},${g},${b})`
            ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 0.5), barH)
        }
    }
}
