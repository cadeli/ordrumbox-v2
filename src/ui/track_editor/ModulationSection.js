// src/ui/track_editor/ModulationSection.js
// Modulation (LFO) tab — LFO target buttons + type/freq/range/phase controls.

import { renderOptions } from '../components/panel_helpers.js'
import { ALL_TRACK_PROPS, KNOB_PROPS, PROP_BY_KEY } from './constants.js'
import Utils from '../../core/utils.js'
import { fmt } from '../components/panel_helpers.js'

export default class ModulationSection {
    /** @param {import('./track_editor.js').default} co */
    constructor(co) {
        this._co = co
        co._selectedLfoTarget = null
    }

    /** All props that support LFO. */
    _lfoProps() {
        return [...ALL_TRACK_PROPS, ...KNOB_PROPS].filter(p => p.lfo)
    }

    /** Ensure _selectedLfoTarget is valid. */
    _ensureTarget() {
        const co = this._co
        const props = this._lfoProps()
        if (!props.length) return null
        if (!co._selectedLfoTarget || !props.find(p => p.key === co._selectedLfoTarget)) {
            co._selectedLfoTarget = props[0].key
        }
        return props.find(p => p.key === co._selectedLfoTarget) ?? props[0]
    }

    // ── Render ─────────────────────────────────────────────────────

    render() {
        const co = this._co
        const track = co._track
        if (!track) return ''

        const prop = this._ensureTarget()
        if (!prop) return ''

        const lfoKey = prop.lfo
        const lfo = track[lfoKey]

        const freq = lfo ? lfo.freq : 1
        const min = lfo ? lfo.min : prop.min
        const max = lfo ? lfo.max : prop.max
        const phase = lfo ? lfo.phase : 0
        const type = lfo ? (lfo.type ?? 'sine') : 'sine'

        let content = `<div class="te-mod-targets">`
        this._lfoProps().forEach(p => {
            const isActive = p.key === co._selectedLfoTarget
            const lfoOn = !!track[p.lfo]
            const ledCls = lfoOn ? 'lfo-led on' : 'lfo-led'
            const activeClass = isActive ? ' active' : ''
            content += `<div class="te-mod-btn${activeClass}">
                <span class="${ledCls}" data-lfo-toggle-btn="${p.key}"></span>
                <span data-lfo-select-btn="${p.key}">${p.label}</span></div>`
        })
        content += `</div>
            <div class="ne-row">
                <label>Type</label>
                <select data-lfo-type-select="1">
                    ${renderOptions(Utils.waveList, type)}
                </select>
            </div>
            <div class="ne-row">
                <label>Freq</label>
                <input type="range" min="0.1" max="2" step="0.1" value="${freq}" data-lfo-key="freq">
                <span class="ne-val">${fmt(freq)}</span>
            </div>
            <div class="ne-row">
                <label>Range</label>
                <div class="ne-range-container">
                    <input type="range" min="${prop.min}" max="${prop.max}" step="${prop.step}" 
                        value="${min}" data-lfo-key="min" title="Min">
                    <input type="range" min="${prop.min}" max="${prop.max}" step="${prop.step}" 
                        value="${max}" data-lfo-key="max" title="Max">
                </div>
                <span class="ne-val ne-val-wide">${fmt(min)}..${fmt(max)}</span>
            </div>
            <div class="ne-row">
                <label>Phase</label>
                <input type="range" min="0" max="1" step="0.01" value="${phase}" data-lfo-key="phase">
                <span class="ne-val">${fmt(phase)}</span>
            </div>`

        return content
    }

    // ── Event handlers ─────────────────────────────────────────────

    onSelectBtn(targetKey) {
        this._co._selectedLfoTarget = targetKey
    }

    onToggleBtn(targetKey) {
        this._co._selectedLfoTarget = targetKey
        this._toggleLfoForTarget(targetKey)
    }

    _toggleLfoForTarget(targetKey) {
        const co = this._co
        const track = co._track
        const prop = this._lfoProps().find(p => p.key === targetKey)
        if (!prop) return
        if (track[prop.lfo]) {
            delete track[prop.lfo]
        } else {
            track[prop.lfo] = { type: 'sine', freq: 1, min: prop.min, max: prop.max, phase: 0 }
        }
    }

    onSlider(input) {
        const co = this._co
        co._isDragging = true
        const track = co._track
        const prop = this._lfoProps().find(p => p.key === co._selectedLfoTarget)
        if (!prop) return false
        let lfo = track[prop.lfo]
        let needsSync = false
        if (!lfo) {
            lfo = track[prop.lfo] = { type: 'sine', freq: 1, min: prop.min, max: prop.max, phase: 0 }
            needsSync = true
        }
        const key = input.dataset.lfoKey
        lfo[key] = parseFloat(input.value)

        if (key === 'min' || key === 'max') {
            const row = input.closest?.('.ne-row')
            const valEl = row?.querySelector('.ne-val')
            if (valEl) valEl.textContent = `${fmt(lfo.min)}..${fmt(lfo.max)}`
        } else {
            if (input.nextElementSibling) {
                input.nextElementSibling.textContent = fmt(input.value)
            }
        }
        return needsSync
    }

    onSelect(sel) {
        const co = this._co
        const track = co._track
        const prop = this._lfoProps().find(p => p.key === co._selectedLfoTarget)
        if (!prop) return
        let lfo = track[prop.lfo]
        if (!lfo) {
            lfo = track[prop.lfo] = { type: sel.value, freq: 1, min: prop.min, max: prop.max, phase: 0 }
        }
        lfo.type = sel.value
    }
}
