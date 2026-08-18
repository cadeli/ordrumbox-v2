// src/ui/track_editor/GenerationSection.js
// "Basic / Transport" tab — renders GROUPS[0] props (auto, variation, variation2, probability).

import { OrSlider } from '../components/or_slider.js'
import { renderOptions } from '../components/panel_helpers.js'
import { GROUPS, fmtVal } from './constants.js'

export default class GenerationSection {
    /** @param {import('./track_editor.js').default} co */
    constructor(co) { this._co = co }

    /** Generate HTML for the generation tab. */
    render() {
        const co = this._co
        const track = co._track
        if (!track) return ''

        const group = GROUPS[0]
        let html = ''

        group.props.forEach(p => {
            const val = track[p.key]
            const isSelected = co._selectedPropKey === p.key ? 'selected' : ''
            const hasLfo = p.lfo && track[p.lfo] ? 'has-lfo' : ''

            if (p.type === 'boolean') {
                const active = val ? 'active' : ''
                html += `<div class="ne-row ${isSelected} ${hasLfo}" data-prop="${p.key}">
                    <label>${p.label}</label>
                    <button class="ne-btn ${active}" data-key="${p.key}">${val ? 'ON' : 'OFF'}</button>
                </div>`
            } else if (p.type === 'select') {
                html += `<div class="ne-row ${isSelected} ${hasLfo}" data-prop="${p.key}">
                    <label>${p.label}</label>
                    <select data-key="${p.key}">${renderOptions(p.options, val, { labels: p.labels })}</select></div>`
            } else {
                const s = new OrSlider({
                    key: p.key,
                    label: p.label,
                    min: p.min,
                    max: p.max,
                    step: p.step,
                    value: val ?? p.min,
                    hasLfo: !!(p.lfo && track[p.lfo]),
                    extraClass: isSelected,
                    format: (v) => fmtVal(p.key, v),
                    normalize: p.normalize ?? ((v) => v),
                    denormalize: p.denormalize ?? ((v) => v),
                    onChange: (v, key) => {
                        co._isDragging = true
                        co._track[key] = v
                        co._playbackEvents.dispatchTrackParamChange(co._track)
                    }
                })
                s._isDelegated = true
                co._sliders.set(p.key, s)
                html += s.toHTML()
            }
        })

        return html
    }
}
