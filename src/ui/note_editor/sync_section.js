// src/ui/note_editor/sync_section.js
// Rendering + control sync for the note editor panel.

import { emitNotesChanged } from '../../state/event_bus.js'
import { fmt, pitchToNoteName, knobFormat, knobUnit, renderOptions } from '../components/ui_utils.js'
import { OrSlider } from '../components/or_slider.js'
import { syncComponentMap, syncKnobs } from '../components/sync_helpers.js'
import { logger } from '../../core/logger.js'
import { NOTE_DEFAULTS } from '../../core/note_schema.js'

const ARP_TYPES = ['up', 'down', 'updown', 'random']
const SCALES_URL = 'assets/data/scales.json'

let scalesCache = null

async function loadScales() {
    if (scalesCache) return scalesCache
    try {
        const res = await fetch(SCALES_URL)
        scalesCache = await res.json()
    } catch (err) {
        logger.warn('NoteEditor', 'failed to load scales, using empty defaults', err)
        scalesCache = {}
    }
    return scalesCache
}

function getScaleIntervals(scaleName, range) {
    const steps = scalesCache?.[scaleName]?.scaleSteps
    if (!steps?.length) return [0]
    const intervals = []
    for (let i = 0; i < range; i++) {
        intervals.push(steps[i % steps.length] + Math.floor(i / steps.length) * 12)
    }
    return intervals
}

const KNOB_PROPS = [
    { key: 'velocity', label: 'Vel', min: 0, max: 1, step: 0.01 },
    { key: 'pitch', label: 'Pitch', min: -24, max: 24, step: 1 },
    { key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.01 },
]

const TAB_DEFS = [
    { id: 'triggers', label: 'Trig' },
    { id: 'retrig', label: 'Retr' },
    { id: 'eucl', label: 'Eucl' },
    { id: 'arp', label: 'Arp' },
]

const GROUPS = [
    {
        id: 'triggers',
        label: 'Triggers',
        props: [
            { key: 'every', label: 'Passes', min: 1, max: 16, step: 1 },
            { key: 'pos', label: 'Phase', min: 0, max: 15, step: 1 },
            { key: 'prob', label: 'Prob', min: 0, max: 1, step: 0.01 },
        ],
    },
    {
        id: 'retrig',
        label: 'Retrig',
        props: [
            { key: 'retriggerCount', label: 'Retrig', min: 1, max: 16, step: 1 },
            { key: 'rate', label: 'Rate', min: 1, max: 16, step: 1 },
            { key: 'arpTriggerProbability', label: 'Prob', min: 0, max: 1, step: 0.01 },
        ],
    },
    {
        id: 'eucl',
        label: 'Euclidean',
        props: [
            { key: 'euclideanFill', label: 'Eucl', min: 0, max: 16, step: 1 },
            { key: 'euclideanRotation', label: 'Rot', min: 0, max: 15, step: 1 },
            { key: 'arpTriggerProbability', label: 'Prob', min: 0, max: 1, step: 0.01 },
        ],
    },
    {
        id: 'arp',
        label: 'Arp',
        props: [
            { key: 'arpScale', label: 'Scale', type: 'select', options: [] },
            { key: 'arpType', label: 'Dir', type: 'select', options: ARP_TYPES },
            { key: 'arpRange', label: 'Range', min: 0, max: 12, step: 1 },
        ],
    },
]

export { loadScales, getScaleIntervals, KNOB_PROPS, TAB_DEFS, GROUPS, ARP_TYPES }

export default class SyncSection {
    #editor

    /** @param {import('../note_editor.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    async initData(data) {
        this.#editor.track = data.track
        this.#editor.note = data.note
        this.#editor.beat = data.beat
        this.#editor.beatStep = data.beatStep
        await loadScales()
    }

    async initEmptyData(data) {
        this.#editor.track = data.track
        this.#editor.beat = data.beat ?? 0
        this.#editor.beatStep = data.beatStep ?? 0
        this.#editor.note = { ...NOTE_DEFAULTS }
        await loadScales()
    }

    sync() {
        const editor = this.#editor
        if (!editor.note) {
            if (!editor.track) return
            editor.container.innerHTML = `<div class="ne-header">
                <span class="ne-track">${editor.esc(editor.track.name)} [beat ${editor.beat + 1} step ${editor.beatStep + 1}] — no note</span>
            </div>`
            return
        }

        const scaleKeys = Object.keys(scalesCache ?? {})
        const arpState = this.#getArpState(editor.note)

        const headerHtml = `<div class="ne-header">
            <span class="ne-track">${editor.esc(editor.track.name)} [beat ${editor.beat + 1} step ${editor.beatStep + 1}]</span>
        </div>`

        const knobBarHtml = `<div class="ne-knob-bar">${KNOB_PROPS.map(
            (p) => `<div data-or-knob="${p.key}"></div>`,
        ).join('')}</div>`

        const tabBarHtml = editor.tab.renderBar()

        const panelsHtml = TAB_DEFS.map((tab) => {
            const g = GROUPS.find((gr) => gr.id === tab.id)
            if (!g) return ''
            const isHidden = editor.tab.isHidden(tab.id)
            const groupContent = g.props.map((p) => this.#renderProp(p, arpState, scaleKeys)).join('')
            return `<div class="ne-tab-panel${isHidden ? ' ne-tab-panel-hidden' : ''}" data-tab-panel="${tab.id}">${groupContent}</div>`
        }).join('')

        editor.container.innerHTML = headerHtml + knobBarHtml + tabBarHtml + panelsHtml

        this.#syncKnobs()
        this.#syncSliders(arpState)
        editor.tab.bindTo(editor.container)
        this.#bindEvents()
    }

    #getArpState(note) {
        if (!note?.arp || typeof note.arp !== 'object' || Array.isArray(note.arp)) {
            return { scale: 'major', type: 'up', range: 0 }
        }
        const mode = typeof note.arp.mode === 'string' ? note.arp.mode.toLowerCase() : 'up'
        const type = ARP_TYPES.includes(mode) ? mode : 'up'
        const intervals = Array.isArray(note.arp.intervals) ? note.arp.intervals : []
        const scaleNames = Object.keys(scalesCache ?? {})
        let scale = scaleNames[0] ?? 'major'
        for (const name of scaleNames) {
            const steps = scalesCache[name]?.scaleSteps
            if (!steps?.length || intervals.length === 0) continue
            const match = intervals.every((iv, i) => {
                return steps[i % steps.length] + Math.floor(i / steps.length) * 12 === iv
            })
            if (match) {
                scale = name
                break
            }
        }
        return { scale, type, range: intervals.length }
    }

    #renderProp(p, arpState, scaleKeys) {
        if (p.type === 'select') {
            const val = this.#resolveSelectValue(p, arpState)
            const options = p.key === 'arpScale' ? scaleKeys : p.options
            const opts = renderOptions(options, val)
            return `<div class="ne-row"><label>${p.label}</label><select data-key="${p.key}">${opts}</select></div>`
        }
        return `<div data-or-control="${p.key}"></div>`
    }

    #resolveSelectValue(p, arpState) {
        const note = this.#editor.note
        if (p.key === 'arpScale') return note._arpScale ?? arpState.scale
        if (p.key === 'arpType') return note._arpType ?? arpState.type
        return note['_' + p.key] ?? p.options[0]
    }

    #syncKnobs() {
        const editor = this.#editor
        editor.knobs = [
            ...syncKnobs({
                container: editor.container,
                configs: KNOB_PROPS.map((def) => ({
                    key: def.key,
                    label: def.label,
                    val: editor.note[def.key] ?? def.min,
                    min: def.min,
                    max: def.max,
                    step: def.step,
                    format: knobFormat(def),
                    unit: knobUnit(def),
                    onChange: (v) => this.#onSlider(def.key, v),
                })),
                prev: new Map(editor.knobs.map((k) => [k.key, k])),
            }).values(),
        ]
    }

    #syncSliders(arpState) {
        const editor = this.#editor
        const sliderProps = GROUPS.flatMap((g) => g.props.filter((p) => p.type !== 'select'))
        const configs = sliderProps.map((p) => ({
            ...p,
            value: p.key === 'arpRange' ? arpState.range : (editor.note[p.key] ?? p.min),
        }))

        editor.sliders = [
            ...syncComponentMap({
                container: editor.container,
                configs,
                selector: 'or-control',
                prev: new Map(editor.sliders.map((s) => [s.key, s])),
                create: (cfg) =>
                    new OrSlider({
                        key: cfg.key,
                        label: cfg.label,
                        min: cfg.min,
                        max: cfg.max,
                        step: cfg.step,
                        value: cfg.value,
                        format:
                            cfg.key === 'pitch'
                                ? (v) => `${fmt(v)} ${pitchToNoteName(v, editor.track?.pitch ?? 0)}`
                                : fmt,
                        onChange: (v) => this.#onSlider(cfg.key, v),
                    }),
                update: (inst, cfg) => {
                    inst.onChange = (v) => this.#onSlider(cfg.key, v)
                    inst.setValue(cfg.value)
                },
                postMount: (el) => el.removeAttribute('data-prop'),
            }).values(),
        ]
    }

    #bindEvents() {
        const editor = this.#editor
        editor.container.querySelectorAll('select').forEach((sel) => {
            sel.addEventListener('change', () => this.#onSelect(sel))
        })
    }

    #arpValue(overrides = {}) {
        const editor = this.#editor
        if (!editor.note) return null
        const note = editor.note
        const scale = overrides.scale ?? note._arpScale ?? 'major'
        const type = overrides.type ?? note._arpType ?? 'up'
        const range = overrides.range ?? this.#getArpState(note).range
        return range > 0 ? { intervals: getScaleIntervals(scale, range), mode: type } : null
    }

    /** @param {string} key @param {number} val */
    #onSlider(key, val) {
        const editor = this.#editor
        if (!editor.note || !editor.track) return
        const updates = key === 'arpRange' ? { arp: this.#arpValue({ range: val }) } : { [key]: val }
        editor.serviceRegistry.cmd?.updateNote(editor.track, editor.note, updates, {
            desc: `Edit note ${key === 'arpRange' ? 'arp' : key} on ${editor.track.name}`,
            coalesce: true,
        })
        emitNotesChanged(editor.track)
    }

    /** @param {HTMLSelectElement} sel */
    #onSelect(sel) {
        const editor = this.#editor
        if (!editor.note || !editor.track) return
        const key = sel.dataset.key
        const overrides = key === 'arpScale' ? { scale: sel.value } : key === 'arpType' ? { type: sel.value } : {}
        const updates = { ['_' + key]: sel.value, arp: this.#arpValue(overrides) }
        editor.serviceRegistry.cmd?.updateNote(editor.track, editor.note, updates, {
            desc: `Edit note ${key === 'arpRange' ? 'arp' : key} on ${editor.track.name}`,
        })
        emitNotesChanged(editor.track)
    }
}
