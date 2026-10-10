// src/ui/track_editor/generation_section.js
// "Generation" tab — Basic/Transport props + Groove/Engine sub-tabs.
// The rows are built once by mount(); sync() only updates values in place.

import { OrSlider } from '../components/or_slider.js'
import { OrTab } from '../components/or_tab.js'
import { renderOptions } from '../components/ui_utils.js'
import { GROUPS, GEN_SUBTAB_DEFS, GEN_GROOVE_PROPS, GEN_ENGINE_PROPS, fmtVal } from './track_editor_constants.js'
import { TRACK_DEFAULTS } from '../../model/track_schema.js'
import { EVENTS } from '../../core/events.js'

/**
 * @typedef {object} GenProp
 * @property {string} key
 * @property {string} label
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {string} [type]
 * @property {string} [lfoKey]
 * @property {Array<string>} [options]
 * @property {Array<string>} [labels]
 * @property {Function} [format]
 * @property {Function} [normalize]
 * @property {Function} [denormalize]
 */

export default class GenerationSection {
    #editor
    #genSubTab
    #container
    /**
     * One entry per built row: the prop def, the row element, and the
     * interactive child (OrSlider / boolean button / select) when there is one.
     * @type {Array<{prop: GenProp, row: HTMLElement, control?: import('../components/or_slider.js').OrSlider, btn?: HTMLButtonElement, sel?: HTMLSelectElement}>}
     */
    #rows = []

    /** @param {import('../track_editor.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#genSubTab = new OrTab({
            tabs: GEN_SUBTAB_DEFS,
            defaultTab: 'groove',
            css: {
                bar: 'te-subtabs',
                btn: 'te-subtab',
                panel: 'gen-tab-panel',
                hidden: 'gen-tab-panel-hidden',
                dataAttr: 'gen-tab',
                panelData: 'gen-panel',
            },
        })
    }

    get subTab() {
        return this.#genSubTab
    }

    /** @returns {Map<string, import('../components/or_slider.js').OrSlider>} */
    get controls() {
        const map = new Map()
        for (const r of this.#rows) if (r.control) map.set(r.prop.key, r.control)
        return map
    }

    /**
     * Build the generation rows once. Called by TrackEditor.createDOM().
     * @param {HTMLElement} container
     */
    mount(container) {
        this.#container = container
        this.#buildProps(GROUPS[0].props, container)
        container.insertAdjacentHTML('beforeend', this.#genSubTab.renderBar())
        this.#genSubTab.bindTo(container)
        for (const [id, props] of [['groove', GEN_GROOVE_PROPS], ['engine', GEN_ENGINE_PROPS]]) {
            const panel = document.createElement('div')
            panel.className = `gen-tab-panel${this.#genSubTab.isHidden(id) ? ' gen-tab-panel-hidden' : ''}`
            panel.dataset.genPanel = id
            container.appendChild(panel)
            this.#buildProps(props, panel)
        }
    }

    /** Update values in place. */
    sync(track) {
        if (!track) return
        const editor = this.#editor
        for (const r of this.#rows) {
            const p = r.prop
            const val = track[p.key]
            r.row.classList.toggle('selected', editor.selectedPropKey === p.key)
            if (r.control) {
                r.control.setValue(val ?? p.min)
                r.control.setHasLfo(!!(p.lfoKey && track[p.lfoKey]))
            } else if (r.btn) {
                r.btn.textContent = val ? 'ON' : 'OFF'
                r.btn.classList.toggle('active', !!val)
            } else if (r.sel) {
                r.sel.value = val ?? ''
                if (r.sel.selectedIndex === -1 && r.sel.options.length) r.sel.selectedIndex = 0
            }
        }
        this.#genSubTab.refresh(this.#container)
    }

    destroy() {
        for (const r of this.#rows) r.control?.destroy()
        this.#rows = []
    }

    /** Build slider / boolean / select rows for a prop group. */
    #buildProps(props, container) {
        const editor = this.#editor
        for (const p of props) {
            const row = document.createElement('div')
            row.className = 'ne-row'
            row.dataset.prop = p.key
            const label = document.createElement('label')
            label.textContent = p.label
            row.appendChild(label)

            if (p.type === 'boolean') {
                const btn = document.createElement('button')
                btn.className = 'ne-btn'
                btn.dataset.key = p.key
                btn.textContent = 'OFF'
                row.appendChild(btn)
                this.#rows.push({ prop: p, row, btn })
            } else if (p.type === 'select') {
                const sel = document.createElement('select')
                sel.dataset.key = p.key
                sel.innerHTML = renderOptions(p.options, TRACK_DEFAULTS[p.key] ?? '', { labels: p.labels })
                row.appendChild(sel)
                this.#rows.push({ prop: p, row, sel })
            } else {
                const dflt = TRACK_DEFAULTS[p.key] ?? p.min
                const s = new OrSlider({
                    key: p.key,
                    label: p.label,
                    min: p.min,
                    max: p.max,
                    step: p.step,
                    value: dflt,
                    defaultValue: dflt,
                    format: (v) => (p.format ? p.format(v) : fmtVal(p.key, v)),
                    normalize: p.normalize ?? ((v) => v),
                    denormalize: p.denormalize ?? ((v) => v),
                    onChange: (v, key) => {
                        // Continuous slider: coalesce the drag into ONE undo step.
                        editor.serviceRegistry.cmd?.updateTrack(
                            editor.track,
                            { [key]: v },
                            { desc: `${key} on ${editor.track.name}`, coalesce: true },
                        )
                        editor.playbackEvents.batch(() => {
                            editor.playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, editor.track)
                            editor.playbackEvents.emit(EVENTS.PATTERN_CHANGE, [editor.track])
                        })
                    },
                })
                row.appendChild(s.createElement())
                this.#rows.push({ prop: p, row, control: s })
            }
            container.appendChild(row)
        }
    }
}
