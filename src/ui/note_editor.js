import { playbackEvents } from '../state/event_bus.js'
import { serviceRegistry } from '../state/service_registry.js'
import { fmt, pitchToNoteName, knobFormat, renderOptions } from './components/ui_utils.js'
import { OrSlider } from './components/or_slider.js'
import { OrTab } from './components/or_tab.js'
import { syncComponentMap, syncKnobs } from './components/sync_helpers.js'
import BasePanel from './base_panel.js'
import { logger } from '../core/logger.js'
import { EVENTS } from '../core/events.js'
import { NOTE_DEFAULTS } from '../core/note_schema.js'

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
            // every = one hit every N passes of the pattern, pos = which pass
            // (see isTriggered), hence "Passes" and not "Every"
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

export default class NoteEditor extends BasePanel {
    #externalContainer
    #note
    #track
    #beat
    #beatStep
    #knobs
    #sliders
    #tab

    constructor() {
        super('ne-panel')
        this.#externalContainer = null
        this.#note = null
        this.#track = null
        this.#beat = 0
        this.#beatStep = 0
        this.#knobs = []
        this.#sliders = []
        this.#tab = new OrTab({
            tabs: TAB_DEFS,
            defaultTab: 'triggers',
            onChange: () => this.sync(),
        })
    }

    /** Provide the external container before init so the editor renders into it. */
    setContainer(el) {
        this.#externalContainer = el
        this.container = el
    }

    init() {
        this.beginInit()
        this.injectCSS()
        if (!this.#externalContainer) {
            this.createDOM()
            this.sync()
        } else {
            this.container.style.display = 'none'
        }
        this.subscribe()
    }

    onDestroy() {
        this.#knobs.forEach((k) => k.destroy())
        this.#knobs = []
        this.#sliders.forEach((s) => s.destroy())
        this.#sliders = []
    }

    createDOM() {
        if (this.#externalContainer) {
            this.container = this.#externalContainer
            return
        }
        super.createDOM()
    }

    subscribe() {
        this.sub(playbackEvents, EVENTS.NOTE_SELECT, (data) => {
            if (!data) return
            if (data.note) {
                if (this.isVisible) this.show(data)
            } else {
                this.#track = data.track
                this.#beat = data.beat
                this.#beatStep = data.beatStep
                this.#note = null
                if (this.isVisible) this.sync()
            }
        })
    }

    /** @returns {boolean} */
    get isVisible() {
        if (this.#externalContainer) {
            return this.container.style.display !== 'none'
        }
        return super.isVisible
    }

    /**
     * Reverse-engineers scale name, arp type, and range from raw arp intervals.
     * @param {Object|null} note
     * @returns {{ scale: string, type: string, range: number }}
     */
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

    /** Show as standalone popup (hides other panels). */
    async show(data) {
        await this.#initData(data)
        super.show()
    }

    /** Show inline inside track editor container. */
    async showInline(data) {
        await this.#initData(data)
        this.container.style.display = 'block'
        this.sync()
    }

    /** Show with default note values as standalone popup. */
    async showDefaultNote(data) {
        await this.#initEmptyData(data)
        super.show()
    }

    /** Show with default note values inline inside track editor container. */
    async showDefaultNoteInline(data) {
        await this.#initEmptyData(data)
        this.container.style.display = 'block'
        this.sync()
    }

    async #initData(data) {
        this.#track = data.track
        this.#note = data.note
        this.#beat = data.beat
        this.#beatStep = data.beatStep
        await loadScales()
    }

    async #initEmptyData(data) {
        this.#track = data.track
        this.#beat = data.beat ?? 0
        this.#beatStep = data.beatStep ?? 0
        // NOTE_DEFAULTS, not a second table: this one used to disagree on velocity
        // (1 vs 0.8) and arpTriggerProbability (0 vs 1), so the editor's empty
        // state displayed values no note ever had — louder, and never
        // arp-triggered. Notes themselves are created by cmd.addNote(), which
        // spreads the same table.
        this.#note = { ...NOTE_DEFAULTS }
        await loadScales()
    }

    sync() {
        if (!this.#note) {
            if (!this.#track) return
            this.container.innerHTML = `<div class="ne-header">
                <span class="ne-track">${this.esc(this.#track.name)} [beat ${this.#beat + 1} step ${this.#beatStep + 1}] — no note</span>
            </div>`
            return
        }

        const scaleKeys = Object.keys(scalesCache ?? {})
        const arpState = this.#getArpState(this.#note)

        const headerHtml = `<div class="ne-header">
            <span class="ne-track">${this.esc(this.#track.name)} [beat ${this.#beat + 1} step ${this.#beatStep + 1}]</span>
        </div>`

        const knobBarHtml = `<div class="ne-knob-bar">${KNOB_PROPS.map(
            (p) => `<div data-or-knob="${p.key}"></div>`,
        ).join('')}</div>`

        const tabBarHtml = this.#tab.renderBar()

        const panelsHtml = TAB_DEFS.map((tab) => {
            const g = GROUPS.find((gr) => gr.id === tab.id)
            if (!g) return ''
            const isHidden = this.#tab.isHidden(tab.id)
            const groupContent = g.props.map((p) => this.#renderProp(p, arpState, scaleKeys)).join('')
            return `<div class="ne-tab-panel${isHidden ? ' ne-tab-panel-hidden' : ''}" data-tab-panel="${tab.id}">${groupContent}</div>`
        }).join('')

        this.container.innerHTML = headerHtml + knobBarHtml + tabBarHtml + panelsHtml

        this.#syncKnobs()
        this.#syncSliders(arpState)
        this.#tab.bindTo(this.container)
        this.#bindEvents()
    }

    /** Renders a single prop as HTML (select or slider placeholder). */
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
        if (p.key === 'arpScale') return this.#note._arpScale ?? arpState.scale
        if (p.key === 'arpType') return this.#note._arpType ?? arpState.type
        return this.#note['_' + p.key] ?? p.options[0]
    }

    /** Keep-alive: reuse existing knobs via setValue, create only new ones. */
    #syncKnobs() {
        this.#knobs = [
            ...syncKnobs({
                container: this.container,
                configs: KNOB_PROPS.map((def) => ({
                    key: def.key,
                    label: def.label,
                    val: this.#note[def.key] ?? def.min,
                    min: def.min,
                    max: def.max,
                    step: def.step,
                    format: knobFormat(def),
                    unit: def.key === 'velocity' ? '%' : def.key === 'pitch' ? 'st' : '',
                    onChange: (v) => this.#onSlider(def.key, v),
                })),
                prev: new Map(this.#knobs.map((k) => [k.key, k])),
            }).values(),
        ]
    }

    /** Keep-alive: reuse existing sliders via setValue, create only new ones. */
    #syncSliders(arpState) {
        const sliderProps = GROUPS.flatMap((g) => g.props.filter((p) => p.type !== 'select'))
        const configs = sliderProps.map((p) => ({
            ...p,
            value: p.key === 'arpRange' ? arpState.range : (this.#note[p.key] ?? p.min),
        }))

        this.#sliders = [
            ...syncComponentMap({
                container: this.container,
                configs,
                selector: 'or-control',
                prev: new Map(this.#sliders.map((s) => [s.key, s])),
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
                                ? (v) => `${fmt(v)} ${pitchToNoteName(v, this.#track?.pitch ?? 0)}`
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
        this.container.querySelectorAll('select').forEach((sel) => {
            sel.addEventListener('change', () => this.#onSelect(sel))
        })
    }

    /**
     * Closes the editor: hides it AND destroys every control it built, so the next
     * note re-renders the rows from scratch (the counterpart is `sync()`, called
     * on every track selection).
     */
    hide() {
        if (this.#externalContainer) {
            this.container.style.display = 'none'
        } else {
            super.hide()
        }
        this.#knobs.forEach((k) => k.destroy())
        this.#knobs = []
        this.#sliders.forEach((s) => s.destroy())
        this.#sliders = []
        this.#note = null
        this.#track = null
    }

    /**
     * Computes note.arp from scale intervals + mode, or null if range <= 0
     * (pure). `range` is the number of scale degrees, i.e.
     * `arp.intervals.length` — it is NOT a note field: it used to be cached in
     * `note.arpRange`, which nothing persisted, so the Range slider came back
     * wrong on reload and two values could describe one arp. Overrides model
     * the NEW value of a control being edited, since the note itself is only
     * updated once the command runs.
     * @param {{range?: number, scale?: string, type?: string}} [overrides]
     */
    #arpValue(overrides = {}) {
        if (!this.#note) return null
        const scale = overrides.scale ?? this.#note._arpScale ?? 'major'
        const type = overrides.type ?? this.#note._arpType ?? 'up'
        const range = overrides.range ?? this.#getArpState(this.#note).range
        return range > 0 ? { intervals: getScaleIntervals(scale, range), mode: type } : null
    }

    #onSlider(key, val) {
        if (!this.#note || !this.#track) return
        // arpRange is not a field: the range lives in arp.intervals.length
        const updates = key === 'arpRange' ? { arp: this.#arpValue({ range: val }) } : { [key]: val }
        // Continuous control: coalesce the whole drag into ONE undo step.
        serviceRegistry.cmd?.updateNote(this.#track, this.#note, updates, {
            desc: `Edit note ${key === 'arpRange' ? 'arp' : key} on ${this.#track.name}`,
            coalesce: true,
        })
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE, [this.#track])
            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [this.#track])
        })
    }

    #onSelect(sel) {
        if (!this.#note || !this.#track) return
        const key = sel.dataset.key
        const overrides = key === 'arpScale' ? { scale: sel.value } : key === 'arpType' ? { type: sel.value } : {}
        const updates = { ['_' + key]: sel.value, arp: this.#arpValue(overrides) }
        serviceRegistry.cmd?.updateNote(this.#track, this.#note, updates, {
            desc: `Edit note ${key === 'arpRange' ? 'arp' : key} on ${this.#track.name}`,
        })
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE, [this.#track])
            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [this.#track])
        })
    }

    // ─── Public API ───────────────────────────────────────────────────────
    /** @returns {import('./components/or_knob.js').OrKnob[]} current knob instances */
    get knobs() {
        return this.#knobs
    }
}
