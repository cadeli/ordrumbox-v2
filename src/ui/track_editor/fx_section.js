// src/ui/track_editor/fx_section.js
// FX tab — tab bar with LED indicators + per-FX control panels.
// The rows are built once by mount(); sync() only updates values in place.

import { OrKnob } from '../components/or_knob.js'
import { renderOptions } from '../components/ui_utils.js'
import { FX_DEFS, FILTER_TYPE_ICONS, PROP_BY_KEY, fmtVal } from './track_editor_constants.js'
import { TRACK_DEFAULTS } from '../../model/track_schema.js'
import { emitTrackChanged } from '../../state/event_bus.js'

/**
 * @typedef {object} FxProp
 * @property {string} key
 * @property {string} label
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {string} [type]
 * @property {string} [lfoKey]
 * @property {Array<string>} [options]
 * @property {Array<string>} [labels]
 */

export default class FxSection {
    #editor
    #container
    /** @type {Array<{div: HTMLElement, led: HTMLElement, idx: string}>} */
    #subtabs = []
    /** @type {Array<{key: string, buttons: HTMLButtonElement[]}>} */
    #iconRows = []
    /** @type {Array<{key: string, sel: HTMLSelectElement}>} */
    #selects = []
    /** @type {Array<{key: string, knob: import('../components/or_knob.js').OrKnob, prop: FxProp}>} */
    #knobRows = []

    /** @param {import('../track_editor.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    /** Returns true if the given FX definition is "on". */
    isFxOn(fx) {
        const track = this.#editor.track
        // The filter is "on" when a type other than the allpass bypass is set.
        if (fx.key === 'filterType') {
            const ft = track.filterType
            return ft != null && ft !== 'allpass'
        }
        const amount = Number(track[fx.key] ?? 0)
        return Number.isFinite(amount) && amount > 0
    }

    /**
     * Computes the track updates toggling an FX on/off (no mutation).
     * @returns {object} partial track updates (filterType or an amount key)
     */
    toggleFxByKey(key) {
        const editor = this.#editor
        const track = editor.track
        if (key === 'filterType') {
            const cur = track.filterType
            const isOn = cur != null && cur !== 'allpass'
            if (isOn) {
                editor.prevFilterType = cur
                return { filterType: 'allpass' }
            }
            return { filterType: editor.prevFilterType ?? 'lowpass' }
        }
        const isOn = Number(track[key] ?? 0) > 0
        return { [key]: isOn ? 0 : 0.5 }
    }

    /**
     * Computes the track updates for a filter-type icon click (no mutation).
     * @returns {object|null} null when the icon is outside the filter row
     */
    onFxIcon(target) {
        const editor = this.#editor
        const track = editor.track
        const val = target.dataset.fxIconVal
        if (!val) return null
        if (target.closest('[data-prop="filterType"]')) {
            const cur = track.filterType
            editor.prevFilterType = cur === val ? undefined : cur
            return { filterType: cur === val ? 'allpass' : val }
        }
        return null
    }

    /** Switch the active FX sub-tab. */
    onFxTab(fxTabId) {
        const tabIdx = parseInt(fxTabId, 10)
        if (Number.isNaN(tabIdx)) return
        this.#editor.fxTab.setActive(String(tabIdx))
        this.#syncTabs()
    }

    /** @returns {Map<string, import('../components/or_knob.js').OrKnob>} */
    get controls() {
        const map = new Map()
        for (const k of this.#knobRows) map.set(k.key, k.knob)
        return map
    }

    /**
     * Build the FX tab bar + panels once. Called by TrackEditor.createDOM().
     * @param {HTMLElement} container
     */
    mount(container) {
        this.#container = container

        const bar = document.createElement('div')
        bar.className = 'te-subtabs'
        FX_DEFS.forEach((fx, i) => {
            const div = document.createElement('div')
            div.className = 'te-subtab'
            const led = document.createElement('span')
            led.className = 'lfo-led'
            led.dataset.fxToggleBtn = fx.key
            const label = document.createElement('span')
            label.dataset.fxTab = String(i)
            label.textContent = fx.label
            div.append(led, label)
            bar.appendChild(div)
            this.#subtabs.push({ div, led, idx: String(i) })
        })
        container.appendChild(bar)

        FX_DEFS.forEach((fx, idx) => {
            const panel = document.createElement('div')
            panel.className = `fx-tab-panel${this.#editor.fxTab.isHidden(String(idx)) ? ' fx-tab-panel-hidden' : ''}`
            panel.dataset.fxPanel = String(idx)
            container.appendChild(panel)
            fx.controls.forEach((ck) => this.#buildControl(ck, panel))
        })
    }

    /** Update values in place. */
    sync(track) {
        if (!track) return
        const editor = this.#editor
        for (const st of this.#subtabs) {
            const fx = FX_DEFS[Number(st.idx)]
            st.led.classList.toggle('on', this.isFxOn(fx))
            st.div.classList.toggle('active', !editor.fxTab.isHidden(st.idx))
        }
        editor.fxTab.togglePanels(this.#container)
        for (const ir of this.#iconRows) {
            for (const btn of ir.buttons) {
                btn.classList.toggle('selected', track[ir.key] === btn.dataset.fxIconVal)
            }
        }
        for (const s of this.#selects) {
            s.sel.value = track[s.key] ?? ''
            if (s.sel.selectedIndex === -1 && s.sel.options.length) s.sel.selectedIndex = 0
        }
        for (const kr of this.#knobRows) {
            const prop = kr.prop
            kr.knob.setValue(track[kr.key] ?? prop.min)
            kr.knob.setHasLfo(!!(prop.lfoKey && track[prop.lfoKey]))
            kr.knob.el?.classList.toggle('selected', editor.selectedPropKey === kr.key)
        }
    }

    destroy() {
        for (const kr of this.#knobRows) kr.knob.destroy()
        this.#knobRows = []
        this.#subtabs = []
        this.#iconRows = []
        this.#selects = []
    }

    /** Build one control row (icon buttons / select / knob) inside a panel. */
    #buildControl(ck, panel) {
        const editor = this.#editor
        const prop = PROP_BY_KEY.get(ck)
        if (!prop) return

        const row = document.createElement('div')
        row.className = 'ne-row'
        row.dataset.prop = ck
        const label = document.createElement('label')
        label.className = 'ne-row-label'
        label.textContent = prop.label
        row.appendChild(label)

        if (prop.type === 'icon') {
            row.classList.add('fx-icon-row')
            const buttons = []
            for (const opt of prop.options) {
                const btn = document.createElement('button')
                btn.className = 'fx-icon-btn'
                btn.dataset.fxIconVal = opt
                btn.title = opt
                btn.textContent = FILTER_TYPE_ICONS[opt] ?? opt
                row.appendChild(btn)
                buttons.push(btn)
            }
            this.#iconRows.push({ key: ck, buttons })
        } else if (prop.type === 'select') {
            const sel = document.createElement('select')
            sel.dataset.key = ck
            sel.innerHTML = renderOptions(prop.options, TRACK_DEFAULTS[ck] ?? '', { labels: prop.labels })
            row.appendChild(sel)
            this.#selects.push({ key: ck, sel })
        } else {
            const dflt = TRACK_DEFAULTS[ck] ?? prop.min
            const knob = new OrKnob({
                key: ck,
                label: prop.label,
                min: prop.min,
                max: prop.max,
                step: prop.step,
                value: dflt,
                defaultValue: dflt,
                format: (v) => fmtVal(ck, v),
                onChange: (v) => {
                    // Continuous knob: coalesce the drag into ONE undo step.
                    editor.serviceRegistry.cmd?.updateTrack(
                        editor.track,
                        { [ck]: v },
                        { desc: `${prop.label} on ${editor.track.name}`, coalesce: true },
                    )
                    emitTrackChanged(editor.track, editor.playbackEvents)
                },
            })
            row.appendChild(knob.createElement())
            this.#knobRows.push({ key: ck, knob, prop })
        }
        panel.appendChild(row)
    }

    /** Repaint the subtab bar (active tab) + panel visibility after a tab switch. */
    #syncTabs() {
        const editor = this.#editor
        for (const st of this.#subtabs) {
            st.div.classList.toggle('active', !editor.fxTab.isHidden(st.idx))
        }
        editor.fxTab.togglePanels(this.#container)
    }
}
