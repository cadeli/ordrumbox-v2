// src/ui/track_editor/ModulationSection.js
// Modulation (LFO) tab — LFO target buttons + type/freq/range/phase controls.

import { renderOptions } from '../components/panel_helpers.js'
import { ALL_TRACK_PROPS, KNOB_PROPS } from './constants.js'
import Utils from '../../core/utils.js'
import { fmt } from '../components/panel_helpers.js'

export default class ModulationSection {
    /** @param {import('./track_editor.js').default} editor */
    constructor(editor) {
        this._editor = editor
        editor._selectedLfoTarget = null
    }

    /** All props that support LFO. */
    _lfoProps() {
        return [...ALL_TRACK_PROPS, ...KNOB_PROPS].filter((p) => p.lfo)
    }

    /** Ensure _selectedLfoTarget is valid. */
    _ensureTarget() {
        const editor = this._editor
        const props = this._lfoProps()
        if (!props.length) return null
        if (!editor._selectedLfoTarget || !props.find((p) => p.key === editor._selectedLfoTarget)) {
            editor._selectedLfoTarget = props[0].key
        }
        return props.find((p) => p.key === editor._selectedLfoTarget) ?? props[0]
    }

    _getDefaultLfo(prop, type = 'sine') {
        return { type, freq: 1, min: prop.min, max: prop.max, phase: 0 }
    }

    // ── Render ─────────────────────────────────────────────────────

    render() {
        const editor = this._editor
        const track = editor._track
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
        this._lfoProps().forEach((p) => {
            const isActive = p.key === editor._selectedLfoTarget
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
        this._editor._selectedLfoTarget = targetKey
    }

    onToggleBtn(targetKey) {
        this._editor._selectedLfoTarget = targetKey
        return this._toggleLfoForTarget(targetKey)
    }

    /**
     * Computes the track updates flipping the LFO for a target on/off.
     * Turning off yields `undefined` (same as the previous `delete`): readers
     * only test truthiness and JSON output drops the key.
     * @returns {{updates: object}|null} null when the target supports no LFO
     */
    _toggleLfoForTarget(targetKey) {
        const editor = this._editor
        const track = editor._track
        const prop = this._lfoProps().find((p) => p.key === targetKey)
        if (!prop) return null
        if (track[prop.lfo]) return { updates: { [prop.lfo]: undefined } }
        return { updates: { [prop.lfo]: this._getDefaultLfo(prop) } }
    }

    /**
     * Computes the track updates for an LFO param slider (creating the LFO
     * object on first touch). The stored object is never mutated: a fresh
     * clone carries the new value so undo can restore the previous reference.
     * Also updates the DOM labels next to the input.
     * @returns {{updates: object, created: boolean}|null}
     */
    onSlider(input) {
        const editor = this._editor
        editor._isDragging = true
        const track = editor._track
        const prop = this._lfoProps().find((p) => p.key === editor._selectedLfoTarget)
        if (!prop) return null
        const current = track[prop.lfo]
        const key = input.dataset.lfoKey
        const lfo = { ...(current ?? this._getDefaultLfo(prop)), [key]: parseFloat(input.value) }

        if (key === 'min' || key === 'max') {
            const row = input.closest?.('.ne-row')
            const valEl = row?.querySelector('.ne-val')
            if (valEl) valEl.textContent = `${fmt(lfo.min)}..${fmt(lfo.max)}`
        } else {
            if (input.nextElementSibling) {
                input.nextElementSibling.textContent = fmt(input.value)
            }
        }
        return { updates: { [prop.lfo]: lfo }, created: !current }
    }

    /**
     * Computes the track updates for the LFO type select.
     * @returns {{updates: object, created: boolean}|null}
     */
    onSelect(sel) {
        const editor = this._editor
        const track = editor._track
        const prop = this._lfoProps().find((p) => p.key === editor._selectedLfoTarget)
        if (!prop) return null
        const current = track[prop.lfo]
        const lfo = { ...(current ?? this._getDefaultLfo(prop, sel.value)), type: sel.value }
        return { updates: { [prop.lfo]: lfo }, created: !current }
    }
}
