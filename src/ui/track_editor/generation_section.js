// src/ui/track_editor/GenerationSection.js
// "Generation" tab — Basic/Transport props + Groove/Engine sub-tabs.

import { OrSlider } from '../components/or_slider.js'
import { OrTab } from '../components/or_tab.js'
import { renderOptions } from '../components/panel_helpers.js'
import { GROUPS, GEN_SUBTAB_DEFS, GEN_GROOVE_PROPS, GEN_ENGINE_PROPS, fmtVal } from './constants.js'

export default class GenerationSection {
    /** @param {import('./track_editor.js').default} editor */
    constructor(editor) {
        this._editor = editor
        this._genSubTab = new OrTab({
            tabs: GEN_SUBTAB_DEFS,
            defaultTab: 'groove',
            css: {
                bar: 'te-mod-targets',
                btn: 'te-mod-btn',
                panel: 'gen-tab-panel',
                hidden: 'gen-tab-panel-hidden',
                dataAttr: 'gen-tab',
                panelData: 'gen-panel',
            },
        })
    }

    /** Render a group of props as slider/boolean/select rows. */
    #renderProps(props, track) {
        const editor = this._editor
        let html = ''

        props.forEach(p => {
            const val = track[p.key]
            const isSelected = editor._selectedPropKey === p.key ? 'selected' : ''
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
                let s = editor._sliders.get(p.key)
                if (s) {
                    s.setValue(val ?? p.min)
                    s._hasLfo = !!(p.lfo && track[p.lfo])
                } else {
                    s = new OrSlider({
                        key: p.key,
                        label: p.label,
                        min: p.min,
                        max: p.max,
                        step: p.step,
                        value: val ?? p.min,
                        hasLfo: !!(p.lfo && track[p.lfo]),
                        extraClass: isSelected,
                        format: (v) => p.format ? p.format(v) : fmtVal(p.key, v),
                        normalize: p.normalize ?? ((v) => v),
                        denormalize: p.denormalize ?? ((v) => v),
                        onChange: (v, key) => {
                            editor._isDragging = true
                            editor._track[key] = v
                            editor._playbackEvents.emit("trackParamChange", editor._track)
                            editor._playbackEvents.emit("patternChange", [editor._track])
                        }
                    })
                    editor._sliders.set(p.key, s)
                }
                s._isDelegated = true
                html += s.toHTML()
            }
        })

        return html
    }

    /** Generate HTML for the generation tab. */
    render() {
        const editor = this._editor
        const track = editor._track
        if (!track) return ''

        const group = GROUPS[0]
        let html = this.#renderProps(group.props, track)

        const subTabBar = this._genSubTab.renderBar()
        html += subTabBar

        const grooveHidden = this._genSubTab.isHidden('groove')
        const engineHidden = this._genSubTab.isHidden('engine')

        html += `<div class="gen-tab-panel ${grooveHidden ? 'gen-tab-panel-hidden' : ''}" data-gen-panel="groove">`
        html += this.#renderProps(GEN_GROOVE_PROPS, track)
        html += '</div>'

        html += `<div class="gen-tab-panel ${engineHidden ? 'gen-tab-panel-hidden' : ''}" data-gen-panel="engine">`
        html += this.#renderProps(GEN_ENGINE_PROPS, track)
        html += '</div>'

        return html
    }
}
