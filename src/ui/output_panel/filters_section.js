// src/ui/output_panel/filters_section.js
// Low-cut / high-cut filter sliders for the output panel.

import { MASTER_BUS_DEFAULTS } from '../../core/constants.js'
import { OrSlider } from '../components/or_slider.js'

export default class FiltersSection {
    #editor
    #lowcut
    #hicut
    #lowcutVal
    #hicutVal

    /** @param {import('../output_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#lowcut = null
        this.#hicut = null
        this.#lowcutVal = 35
        this.#hicutVal = 18500
    }

    get lowcut() {
        return this.#lowcut
    }
    get hicut() {
        return this.#hicut
    }
    get lowcutVal() {
        return this.#lowcutVal
    }
    get hicutVal() {
        return this.#hicutVal
    }
    setLowcutVal(v) { this.#lowcutVal = v }
    setHicutVal(v) { this.#hicutVal = v }

    buildFilterSliders() {
        const grid = this.#editor.container.querySelector('#op-filters-grid')

        this.#lowcut = new OrSlider({
            key: 'op-lowcut',
            label: 'Low Cut',
            min: 10,
            max: 500,
            step: 1,
            value: MASTER_BUS_DEFAULTS.lowcut,
            noCursor: true,
            format: (v) => Math.round(v),
            unit: 'Hz',
            onChange: (v) => {
                this.#lowcutVal = v
                this.pushFilters()
            },
        })
        grid.appendChild(this.#lowcut.createElement())

        this.#hicut = new OrSlider({
            key: 'op-hicut',
            label: 'High Cut',
            min: 1000,
            max: 20000,
            step: 100,
            value: MASTER_BUS_DEFAULTS.hicut,
            noCursor: true,
            format: (v) => Math.round(v),
            unit: 'Hz',
            onChange: (v) => {
                this.#hicutVal = v
                this.pushFilters()
            },
        })
        grid.appendChild(this.#hicut.createElement())
    }

    pushFilters() {
        this.#editor.audioEngine?.mixer?.setMasterBus({
            lowcut: this.#lowcutVal,
            hicut: this.#hicutVal,
        })
        this.#editor.persistMaster('lowcut', this.#lowcutVal)
        this.#editor.persistMaster('hicut', this.#hicutVal)
    }
}
