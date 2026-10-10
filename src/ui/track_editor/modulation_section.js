// src/ui/track_editor/modulation_section.js
// Modulation (LFO) tab — LFO target buttons + type/freq/range/phase controls.
// The rows are built once by mount(); sync() only updates values in place.

import { renderOptions, fmt } from '../components/ui_utils.js'
import { ALL_TRACK_PROPS, KNOB_PROPS } from './track_editor_constants.js'
import { WAVE_TYPES } from '../../audio/fx_values.js'

export default class ModulationSection {
    #editor
    #freqInput
    #freqVal
    #minInput
    #maxInput
    #rangeVal
    #phaseInput
    #phaseVal
    #typeSelect
    /** @type {Array<{div: HTMLElement, led: HTMLElement, key: string, lfoKey: string}>} */
    #subtabs = []

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

    /**
     * Build the LFO rows once. Called by TrackEditor.createDOM().
     * @param {HTMLElement} container
     */
    mount(container) {
        const bar = document.createElement('div')
        bar.className = 'te-subtabs'
        for (const p of this.#lfoProps()) {
            const div = document.createElement('div')
            div.className = 'te-subtab'
            const led = document.createElement('span')
            led.className = 'lfo-led'
            led.dataset.lfoToggleBtn = p.key
            const label = document.createElement('span')
            label.dataset.lfoSelectBtn = p.key
            label.textContent = p.label
            div.append(led, label)
            bar.appendChild(div)
            this.#subtabs.push({ div, led, key: p.key, lfoKey: p.lfoKey })
        }
        container.appendChild(bar)

        const typeRow = document.createElement('div')
        typeRow.className = 'ne-row'
        const typeLabel = document.createElement('label')
        typeLabel.textContent = 'Type'
        this.#typeSelect = document.createElement('select')
        this.#typeSelect.dataset.lfoTypeSelect = '1'
        this.#typeSelect.innerHTML = renderOptions(WAVE_TYPES, 'sine')
        typeRow.append(typeLabel, this.#typeSelect)
        container.appendChild(typeRow)

        const freqRow = document.createElement('div')
        freqRow.className = 'ne-row'
        const freqLabel = document.createElement('label')
        freqLabel.textContent = 'Freq'
        this.#freqInput = document.createElement('input')
        this.#freqInput.type = 'range'
        this.#freqInput.min = '0.1'
        this.#freqInput.max = '2'
        this.#freqInput.step = '0.1'
        this.#freqInput.value = '1'
        this.#freqInput.dataset.lfoKey = 'freq'
        this.#freqVal = document.createElement('span')
        this.#freqVal.className = 'ne-val'
        this.#freqVal.textContent = fmt(1)
        freqRow.append(freqLabel, this.#freqInput, this.#freqVal)
        container.appendChild(freqRow)

        const rangeRow = document.createElement('div')
        rangeRow.className = 'ne-row'
        const rangeLabel = document.createElement('label')
        rangeLabel.textContent = 'Range'
        const rangeContainer = document.createElement('div')
        rangeContainer.className = 'ne-range-container'
        this.#minInput = document.createElement('input')
        this.#minInput.type = 'range'
        this.#minInput.title = 'Min'
        this.#minInput.dataset.lfoKey = 'min'
        this.#maxInput = document.createElement('input')
        this.#maxInput.type = 'range'
        this.#maxInput.title = 'Max'
        this.#maxInput.dataset.lfoKey = 'max'
        rangeContainer.append(this.#minInput, this.#maxInput)
        this.#rangeVal = document.createElement('span')
        this.#rangeVal.className = 'ne-val ne-val-wide'
        rangeRow.append(rangeLabel, rangeContainer, this.#rangeVal)
        container.appendChild(rangeRow)

        const phaseRow = document.createElement('div')
        phaseRow.className = 'ne-row'
        const phaseLabel = document.createElement('label')
        phaseLabel.textContent = 'Phase'
        this.#phaseInput = document.createElement('input')
        this.#phaseInput.type = 'range'
        this.#phaseInput.min = '0'
        this.#phaseInput.max = '1'
        this.#phaseInput.step = '0.01'
        this.#phaseInput.value = '0'
        this.#phaseInput.dataset.lfoKey = 'phase'
        this.#phaseVal = document.createElement('span')
        this.#phaseVal.className = 'ne-val'
        this.#phaseVal.textContent = fmt(0)
        phaseRow.append(phaseLabel, this.#phaseInput, this.#phaseVal)
        container.appendChild(phaseRow)
    }

    /** Update values in place. */
    sync(track) {
        if (!track) return
        const prop = this.#ensureTarget()
        if (!prop) return
        const lfoKey = prop.lfoKey
        const lfo = track[lfoKey]

        const freq = lfo ? lfo.freq : 1
        const min = lfo ? lfo.min : prop.min
        const max = lfo ? lfo.max : prop.max
        const phase = lfo ? lfo.phase : 0
        const type = lfo ? (lfo.type ?? 'sine') : 'sine'

        for (const st of this.#subtabs) {
            st.div.classList.toggle('active', st.key === this.#editor.selectedLfoTarget)
            st.led.classList.toggle('on', !!track[st.lfoKey])
        }

        this.#typeSelect.value = type
        if (this.#typeSelect.selectedIndex === -1 && this.#typeSelect.options.length) this.#typeSelect.selectedIndex = 0

        this.#freqInput.value = String(freq)
        this.#freqVal.textContent = fmt(freq)

        this.#minInput.min = String(prop.min)
        this.#minInput.max = String(prop.max)
        this.#minInput.step = String(prop.step)
        this.#minInput.value = String(min)
        this.#maxInput.min = String(prop.min)
        this.#maxInput.max = String(prop.max)
        this.#maxInput.step = String(prop.step)
        this.#maxInput.value = String(max)
        this.#rangeVal.textContent = `${fmt(min)}..${fmt(max)}`

        this.#phaseInput.value = String(phase)
        this.#phaseVal.textContent = fmt(phase)
    }

    destroy() {
        this.#subtabs = []
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
