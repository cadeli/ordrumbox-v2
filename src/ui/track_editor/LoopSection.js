// src/ui/track_editor/LoopSection.js
// Loop tab — stepsPerBeat, loopAtStep, swingAmount sliders.

import { OrSlider } from '../components/or_slider.js'
import { fmt } from '../components/panel_helpers.js'
import { recalcLoopDerived } from '../../model/track_schema.js'

export default class LoopSection {
    /** @param {import('./track_editor.js').default} co */
    constructor(co) { this._co = co }

    // ── Render ─────────────────────────────────────────────────────

    render() {
        const co = this._co
        const track = co._track
        if (!track) return ''

        const beats = track.nbBeats ?? 4
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const loopAtStep = track.loopAtStep ?? (beats * stepsPerBeat)
        const maxSteps = beats * stepsPerBeat
        const swing = track.swingAmount ?? 0

        const fmtLoopPoint = (step) => {
            const b = Math.floor((step - 1) / stepsPerBeat) + 1
            const s = ((step - 1) % stepsPerBeat) + 1
            return `${b}.${s}`
        }

        let content = ''
        const loopProps = [
            { key: 'stepsPerBeat', label: 'Steps/Beat', min: 1, max: 8, step: 1, val: stepsPerBeat },
            { key: 'loopAtStep',  label: 'Loop Point', min: 1, max: maxSteps, step: 1, val: loopAtStep, format: fmtLoopPoint },
            { key: 'swingAmount', label: 'Swing',     min: 0, max: 1, step: 0.01, val: swing }
        ]

        loopProps.forEach(p => {
            let s = co._sliders.get(p.key)
            if (s) {
                s.setValue(p.val)
                if (p.key === 'loopAtStep') s.setMax?.(maxSteps)
            } else {
                s = new OrSlider({
                    key: p.key,
                    label: p.label,
                    min: p.min,
                    max: p.max,
                    step: p.step,
                    value: p.val,
                    format: p.format,
                    dataAttr: 'data-loop',
                    onChange: (v, key) => co._onLoopSlider({ dataset: { loop: key }, value: v })
                })
                co._sliders.set(p.key, s)
            }
            s._isDelegated = true
            content += s.toHTML()
        })

        return content
    }
}
