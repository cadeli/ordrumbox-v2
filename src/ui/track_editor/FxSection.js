// src/ui/track_editor/FxSection.js
// FX tab — tab bar with LED indicators + per-FX control panels.

import { OrKnob } from '../components/or_knob.js'
import { renderOptions, renderIconChoices } from '../components/panel_helpers.js'
import { FX_DEFS, FILTER_TYPE_ICONS, FILTER_PROPS, PROP_BY_KEY, fmtVal } from './constants.js'

export default class FxSection {
    /** @param {import('./track_editor.js').default} co */
    constructor(co) {
        this._co = co
    }

    /** Returns true if the given FX definition is "on". */
    isFxOn(fx) {
        const track = this._co._track
        if (fx.key === 'filterFreq') {
            const ft = track.filterType
            return ft != null && ft !== 'allpass'
        }
        const amount = Number(track[fx.key] ?? 0)
        return Number.isFinite(amount) && amount > 0
    }

    /** Toggle an FX on/off. */
    toggleFxByKey(key) {
        const co = this._co
        const track = co._track
        if (key === 'filterFreq') {
            const cur = track.filterType
            const isOn = cur != null && cur !== 'allpass'
            if (isOn) {
                co._prevFilterType = cur
                track.filterType = 'allpass'
            } else {
                track.filterType = co._prevFilterType ?? 'lowpass'
            }
        } else {
            const isOn = Number(track[key] ?? 0) > 0
            track[key] = isOn ? 0 : 0.5
        }
    }

    /** Render FX icon (filter type) selector. */
    onFxIcon(target) {
        const co = this._co
        const track = co._track
        const val = target.dataset.fxIconVal
        if (!val) return
        if (target.closest('[data-prop="filterType"]')) {
            const cur = track.filterType
            track.filterType = (cur === val) ? 'allpass' : val
            co._prevFilterType = (cur === val) ? undefined : cur
        }
    }

    /** Switch the active FX sub-tab. */
    onFxTab(btn) {
        const co = this._co
        const tabIdx = parseInt(btn.dataset.fxTab, 10)
        if (Number.isNaN(tabIdx)) return
        const activeTab = String(tabIdx)
        co._fxTab.setActive(activeTab)
        co._fxTab.togglePanels(co.container)
        co.container.querySelectorAll('.te-mod-btn').forEach(tab => {
            const tabButton = tab.querySelector('[data-fx-tab]')
            tab.classList.toggle('active', tabButton?.dataset.fxTab === activeTab)
        })
    }

    /** Generate the full FX tab HTML. */
    render() {
        const co = this._co
        const track = co._track
        if (!track) return ''

        let tabsHtml = '<div class="te-mod-targets">'
        FX_DEFS.forEach((fx, i) => {
            const on = this.isFxOn(fx)
            const ledClass = on ? 'lfo-led on' : 'lfo-led'
            const activeClass = co._fxTab.isHidden(String(i)) ? '' : ' active'
            tabsHtml += `<div class="te-mod-btn${activeClass}">
                <span class="${ledClass}" data-fx-toggle-btn="${fx.key}"></span>
                <span data-fx-tab="${i}">${fx.label}</span></div>`
        })
        tabsHtml += '</div>'

        let content = tabsHtml
        FX_DEFS.forEach((fx, idx) => {
            const isHidden = co._fxTab.isHidden(String(idx))
            const on = this.isFxOn(fx)
            const ledClass = on ? 'lfo-led on' : 'lfo-led'

            content += `<div class="fx-tab-panel ${isHidden ? 'fx-tab-panel-hidden' : ''}" data-fx-panel="${idx}">`

            fx.controls.forEach(ck => {
                const prop = PROP_BY_KEY.get(ck)
                if (!prop) return
                const val = track[ck]
                if (prop.type === 'icon') {
                    content += `<div class="ne-row fx-icon-row" data-prop="${ck}">
                        <label class="ne-row-label">${prop.label}</label>
                        ${renderIconChoices(prop.options, val, FILTER_TYPE_ICONS, { cssClass: 'fx-icon-btn', valueDataAttr: 'data-fx-icon-val' })}
                    </div>`
                } else if (prop.type === 'select') {
                    content += `<div class="ne-row" data-prop="${ck}">
                        <label class="ne-row-label">${prop.label}</label>
                        <select data-key="${ck}">${renderOptions(prop.options, val, { labels: prop.labels })}</select></div>`
                } else {
                    const hasLfo = prop.lfo && track[prop.lfo] ? 'has-lfo' : ''
                    const isSelected = co._selectedPropKey === ck ? 'selected' : ''
                    const knob = new OrKnob({
                        key: ck,
                        label: prop.label,
                        min: prop.min,
                        max: prop.max,
                        step: prop.step,
                        value: val ?? prop.min,
                        extraClass: `${isSelected} ${hasLfo}`.trim(),
                        format: (v) => fmtVal(ck, v),
                        onChange: (v) => {
                            co._track[ck] = v
                            co._playbackEvents.dispatchTrackParamChange(co._track)
                        }
                    })
                    co._fxKnobs.push(knob)
                    content += knob.toHTML()
                }
            })

            content += `</div>`
        })

        return content
    }
}
