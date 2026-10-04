// src/ui/track_editor/ModulationSection.js
// Modulation (LFO) tab — LFO target buttons + type/freq/range/phase controls.

import { renderOptions } from '../components/ui_utils.js'
import { ALL_TRACK_PROPS, KNOB_PROPS } from './constants.js'
import { WAVE_TYPES } from '../../audio/fx_values.js'
import { fmt } from '../components/ui_utils.js'

export default class ModulationSection {
    #editor

    /** @param {import('../track_editor.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        editor.selectedLfoTarget = null
    }

    /** All props that support LFO. */
    #lfoProps() {
        return [...ALL_TRACK_PROPS, ...KNOB_PROPS].filter((p) => p.lfoKey)
    }

    /** Ensure _selectedLfoTarget is valid. */
    #ensureTarget() {
        const editor = this.#editor
        const props = this.#lfoProps()
        if (!props.length) return null
        if (!editor.selectedLfoTarget || !props.find((p) => p.key === editor.selectedLfoTarget)) {
            editor.selectedLfoTarget = props[0].key
        }
        return props.find((p) => p.key === editor.selectedLfoTarget) ?? props[0]
    }

    #getDefaultLfo(prop, type = 'sine') {
        return { type, freq: 1, min: prop.min, max: prop.max, phase: 0 }
    }

    // ── Render ─────────────────────────────────────────────────────

    render() {
        const editor = this.#editor
        const track = editor.track
        if (!track) return ''

        const prop = this.#ensureTarget()
        if (!prop) return ''

        const lfoKey = prop.lfoKey
        const lfo = track[lfoKey]

        const freq = lfo ? lfo.freq : 1
        const min = lfo ? lfo.min : prop.min
        const max = lfo ? lfo.max : prop.max
        const phase = lfo ? lfo.phase : 0
        const type = lfo ? (lfo.type ?? 'sine') : 'sine'

        let content = `<div class="te-subtabs">`
        this.#lfoProps().forEach((p) => {
            const isActive = p.key === editor.selectedLfoTarget
            const lfoOn = !!track[p.lfoKey]
            const ledCls = lfoOn ? 'lfo-led on' : 'lfo-led'
            const activeClass = isActive ? ' active' : ''
            content += `<div class="te-subtab${activeClass}">
                <span class="${ledCls}" data-lfo-toggle-btn="${p.key}"></span>
                <span data-lfo-select-btn="${p.key}">${p.label}</span></div>`
        })
        content += `</div>
            <div class="ne-row">
                <label>Type</label>
                <select data-lfo-type-select="1">
                    ${renderOptions(WAVE_TYPES, type)}
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
        this.#editor.selectedLfoTarget = targetKey
    }

    onToggleBtn(targetKey) {
        this.#editor.selectedLfoTarget = targetKey
        return this.toggleLfoForTarget(targetKey)
    }

    /**
     * Computes the track updates flipping the LFO for a target on/off.
     * Turning off yields `undefined` (same as the previous `delete`): readers
     * only test truthiness and JSON output drops the key.
     * @returns {{updates: object}|null} null when the target supports no LFO
     */
    toggleLfoForTarget(targetKey) {
        const editor = this.#editor
        const track = editor.track
        const prop = this.#lfoProps().find((p) => p.key === targetKey)
        if (!prop) return null
        if (track[prop.lfoKey]) return { updates: { [prop.lfoKey]: undefined } }
        return { updates: { [prop.lfoKey]: this.#getDefaultLfo(prop) } }
    }

    /**
     * Computes the track updates for an LFO param slider (creating the LFO
     * object on first touch). The stored object is never mutated: a fresh
     * clone carries the new value so undo can restore the previous reference.
     * Also updates the DOM labels next to the input.
     * @returns {{updates: object, created: boolean}|null}
     */
    onSlider(input) {
        const editor = this.#editor
        editor.isDragging = true
        const track = editor.track
        const prop = this.#lfoProps().find((p) => p.key === editor.selectedLfoTarget)
        if (!prop) return null
        const current = track[prop.lfoKey]
        const key = input.dataset.lfoKey
        const lfo = { ...(current ?? this.#getDefaultLfo(prop)), [key]: parseFloat(input.value) }

        if (key === 'min' || key === 'max') {
            const row = input.closest?.('.ne-row')
            const valEl = row?.querySelector('.ne-val')
            if (valEl) valEl.textContent = `${fmt(lfo.min)}..${fmt(lfo.max)}`
        } else {
            if (input.nextElementSibling) {
                input.nextElementSibling.textContent = fmt(input.value)
            }
        }
        return { updates: { [prop.lfoKey]: lfo }, created: !current }
    }

    /**
     * Computes the track updates for the LFO type select.
     * @returns {{updates: object, created: boolean}|null}
     */
    onSelect(sel) {
        const editor = this.#editor
        const track = editor.track
        const prop = this.#lfoProps().find((p) => p.key === editor.selectedLfoTarget)
        if (!prop) return null
        const current = track[prop.lfoKey]
        const lfo = { ...(current ?? this.#getDefaultLfo(prop, sel.value)), type: sel.value }
        return { updates: { [prop.lfoKey]: lfo }, created: !current }
    }
}
