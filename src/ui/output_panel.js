import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { bindTabToggles } from './components/ui_utils.js'
import BasePanel from './base_panel.js'

import MasterSection from './output_panel/master_section.js'
import CompressorSection from './output_panel/compressor_section.js'
import FiltersSection from './output_panel/filters_section.js'
import SpectrumSection from './output_panel/spectrum_section.js'

const SPECTRUM_WIDTH = 256
const SPECTRUM_HEIGHT = 100

export default class OutputPanel extends BasePanel {
    #master
    #compressor
    #filters
    #spectrum
    #saveTimer = null

    constructor() {
        super('output-panel')
        this.canvas = null
        this.#master = new MasterSection(this)
        this.#compressor = new CompressorSection(this)
        this.#filters = new FiltersSection(this)
        this.#spectrum = new SpectrumSection(this)
    }

    get canvas() {
        return this._canvas
    }
    set canvas(v) {
        this._canvas = v
    }

    get master() {
        return this.#master
    }
    get compressor() {
        return this.#compressor
    }
    get filters() {
        return this.#filters
    }
    get spectrum() {
        return this.#spectrum
    }

    /** Delegated knob access (masterVol, preGain, or compressor param). */
    getKnob(key) {
        if (this.#master.masterVol?.key === key) return this.#master.masterVol
        if (this.#master.preGain?.key === key) return this.#master.preGain
        return this.#compressor.compKnobs?.[key] ?? null
    }

    /** Exposed for sections that need the pre-gain element. */
    get preGainEl() {
        return this.#master.preGainEl
    }

    persistMaster(key, value) {
        soundRegistry.settings.master[key] = value
        if (this.#saveTimer) clearTimeout(this.#saveTimer)
        this.#saveTimer = setTimeout(() => {
            serviceRegistry.resourcesLoader?.saveSettings?.()
        }, 500)
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

        this.#master.buildMasterKnob()
        this.#master.buildPreGainKnob()
        this.#compressor.buildCompressorKnobs()
        this.#filters.buildFilterSliders()

        this.canvas = /** @type {HTMLCanvasElement} */ (this.container.querySelector('#op-spectrum'))
        this.canvas.width = SPECTRUM_WIDTH
        this.canvas.height = SPECTRUM_HEIGHT

        bindTabToggles(this.container)
        this.#restoreMasterSettings()
    }

    #restoreMasterSettings() {
        const m = soundRegistry.settings.master
        if (!m) return

        this.#master.masterVol?.setValue(m.volume)
        this.#master.preGain?.setValue(m.preGain)
        this.#filters.lowcut?.setValue(m.lowcut)
        this.#filters.hicut?.setValue(m.hicut)
        this.#filters.setLowcutVal(m.lowcut)
        this.#filters.setHicutVal(m.hicut)

        if (m.compBypass) {
            this.#compressor.setCompBypass(true)
        }

        for (const key of Object.keys(this.#compressor.compKnobs ?? {})) {
            if (key in m && this.#compressor.compKnobs?.[key]) {
                this.#compressor.compKnobs[key].setValue(m[key])
            }
        }
        this.#compressor.drawCompCurve()
    }

    subscribe() {}

    onDestroy() {
        if (this.#saveTimer) clearTimeout(this.#saveTimer)
        this.#saveTimer = null
        this.#spectrum.stopAnimation()
    }

    show() {
        super.show()
        this.#compressor.drawCompCurve()
        this.#spectrum.startAnimation()
    }

    hide() {
        super.hide()
        this.#spectrum.stopAnimation()
    }
}
