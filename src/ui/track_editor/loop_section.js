// src/ui/track_editor/LoopSection.js
// Loop tab — stepsPerBeat, loopAtStep, swingAmount sliders.
// The rows are built once by mount(); sync() only updates values in place.

import { stepToBeat } from '../../core/notes.js'
import { OrSlider } from '../components/or_slider.js'
import { TRACK_DEFAULTS } from '../../model/track_schema.js'

export default class LoopSection {
    #editor
    /** @type {Map<string, import('../components/or_slider.js').OrSlider>} */
    #sliders = new Map()

    /** @param {import('../track_editor.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    /** @returns {Map<string, import('../components/or_slider.js').OrSlider>} */
    get controls() {
        return this.#sliders
    }

    /**
     * Build the loop rows once. Called by TrackEditor.createDOM().
     * @param {HTMLElement} container
     */
    mount(container) {
        // Loop point display: "beat.step" within the track's current stepsPerBeat.
        // The formatter reads the live track so a stepsPerBeat change re-labels
        // the value without rebuilding the control.
        const fmtLoopPoint = (step) => {
            const spb = this.#editor.track?.stepsPerBeat ?? 4
            const { beat } = stepToBeat(step - 1, spb)
            return `${beat + 1}.${((step - 1) % spb) + 1}`
        }
        for (const p of LoopSection.#PROPS) {
            const dflt = TRACK_DEFAULTS[p.key] ?? p.min
            const s = new OrSlider({
                key: p.key,
                label: p.label,
                min: p.min,
                max: p.max,
                step: p.step,
                value: dflt,
                defaultValue: dflt,
                format: p.key === 'loopAtStep' ? fmtLoopPoint : undefined,
                dataAttr: 'data-loop',
                onChange: (v, key) => this.#editor.onLoopSlider(key, v),
            })
            this.#sliders.set(p.key, s)
            container.appendChild(s.createElement())
        }
    }

    /** Update values in place. */
    sync(track) {
        if (!track) return
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const maxSteps = (track.beatCount ?? 4) * stepsPerBeat
        this.#sliders.get('stepsPerBeat').setValue(stepsPerBeat)
        this.#sliders.get('swingAmount').setValue(track.swingAmount ?? 0)
        const loopSlider = this.#sliders.get('loopAtStep')
        loopSlider.setMax(maxSteps)
        loopSlider.setValue(track.loopAtStep ?? maxSteps)
    }

    destroy() {
        for (const s of this.#sliders.values()) s.destroy()
        this.#sliders.clear()
    }

    static #PROPS = [
        { key: 'stepsPerBeat', label: 'Steps/Beat', min: 1, max: 8, step: 1 },
        { key: 'loopAtStep', label: 'Loop Point', min: 1, max: 128, step: 1 },
        { key: 'swingAmount', label: 'Swing', min: 0, max: 1, step: 0.01 },
    ]
}
