// src/ui/output_panel/master_section.js
// Master volume + pre-gain knobs for the output panel.

import { OrKnob } from '../components/or_knob.js'
import { formatSignedDb } from '../components/ui_utils.js'

export default class MasterSection {
    #editor
    #masterVol
    #preGain
    #preGainEl

    /** @param {import('../output_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#masterVol = null
        this.#preGain = null
        this.#preGainEl = null
    }

    get masterVol() {
        return this.#masterVol
    }
    get preGain() {
        return this.#preGain
    }
    get preGainEl() {
        return this.#preGainEl
    }

    buildMasterKnob() {
        this.#masterVol = new OrKnob({
            key: 'op-master-vol',
            label: 'Volume',
            min: 0,
            max: 2,
            step: 0.01,
            value: 1,
            format: (v) => v.toFixed(2),
            onChange: (v) => {
                this.#editor.audioEngine?.mixer?.setMasterBus({ master: v })
                this.#editor.persistMaster('volume', v)
            },
        })
        const el = this.#masterVol.createElement()
        el.dataset.orControl = 'op-master-vol'
        this.#editor.container.querySelector('#op-master-grid').appendChild(el)
    }

    buildPreGainKnob() {
        this.#preGain = new OrKnob({
            key: 'op-pregain',
            label: 'Pre-Gain',
            min: -20,
            max: 20,
            step: 0.5,
            value: 0,
            format: formatSignedDb,
            unit: 'dB',
            onChange: (v) => {
                this.#editor.audioEngine?.mixer?.setMasterBus({ preGain: v })
                this.#editor.persistMaster('preGain', v)
            },
        })
        const el = this.#preGain.createElement()
        el.classList.add('op-comp-pregain')
        this.#preGainEl = el
    }
}
