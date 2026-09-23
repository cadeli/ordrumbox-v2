import { playbackEvents } from '../state/playback_events.js'
import { fmt, pitchToNoteName, knobFormat, renderOptions } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import { OrTab } from './components/or_tab.js'
import { syncComponentMap, syncKnobs } from './components/sync_helpers.js'
import BasePanel from './base_panel.js'
import { logger } from '../core/logger.js'

const ARP_TYPES = ['up', 'down', 'updown']
const SCALES_URL = 'assets/data/scales.json'

const DEFAULT_NOTE = {
    velocity: 1, pitch: 0, pan: 0,
    every: 1, prob: 1,
    retriggerNum: 1, rate: 1,
    euclidianFill: 0, arpTriggerProbability: 0, arpRange: 0
}

let _scalesCache = null

async function loadScales() {
    if (_scalesCache) return _scalesCache
    try {
        const res = await fetch(SCALES_URL)
        _scalesCache = await res.json()
    } catch (err) {
        logger.warn('NoteEditor', 'failed to load scales, using empty defaults', err)
        _scalesCache = {}
    }
    return _scalesCache
}

function getScaleIntervals(scaleName, range) {
    const steps = _scalesCache?.[scaleName]?.scaleSteps
    if (!steps?.length) return [0]
    const intervals = []
    for (let i = 0; i < range; i++) {
        intervals.push(steps[i % steps.length] + Math.floor(i / steps.length) * 12)
    }
    return intervals
}

const KNOB_PROPS = [
    { key: 'velocity', label: 'Vel',   min: 0,   max: 1,  step: 0.01 },
    { key: 'pitch',    label: 'Pitch', min: -24, max: 24, step: 1 },
    { key: 'pan',      label: 'Pan',   min: -1,  max: 1,  step: 0.01 }
]

const TAB_DEFS = [
    { id: 'triggers', label: 'Trig' },
    { id: 'retrig',   label: 'Retr' },
    { id: 'arp',      label: 'Arp' }
]

const GROUPS = [
    {
        id: 'triggers',
        label: 'Triggers',
        props: [
            { key: 'every', label: 'Every', min: 1, max: 16, step: 1 },
            { key: 'pos', label: 'Pos', min: 0, max: 15, step: 1 },
            { key: 'prob', label: 'Prob', min: 0, max: 1, step: 0.01 }
        ]
    },
    {
        id: 'retrig',
        label: 'Retrig',
        props: [
            { key: 'retriggerNum', label: 'Retrig', min: 1, max: 16, step: 1 },
            { key: 'rate', label: 'Rate', min: 1, max: 16, step: 1 },
            { key: 'euclidianFill', label: 'Eucl', min: 0, max: 16, step: 1 },
            { key: 'arpTriggerProbability', label: 'Prob', min: 0, max: 1, step: 0.01 }
        ]
    },
    {
        id: 'arp',
        label: 'Arp',
        props: [
            { key: 'arpScale', label: 'Scale', type: 'select', options: [] },
            { key: 'arpType', label: 'Dir', type: 'select', options: ARP_TYPES },
            { key: 'arpRange', label: 'Range', min: 0, max: 12, step: 1 }
        ]
    }
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

    /**
     * @param {HTMLElement} [externalContainer] – If provided, renders into this
     *   element instead of creating a separate fixed-position div.
     */
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
            onChange: () => this.sync()
        })
    }

    /** Provide the external container before init so the editor renders into it. */
    setContainer(el) {
        this.#externalContainer = el
        this.container = el
    }

    init() {
        this.injectCSS()
        if (!this.#externalContainer) {
            this.createDOM()
            this.sync()
        } else {
            this.container.style.display = 'none'
        }
        this.subscribe()
    }

    createDOM() {
        if (this.#externalContainer) {
            this.container = this.#externalContainer
            return
        }
        super.createDOM()
    }

    setTrackEditor(_te) {
        // Intentionally unused: kept for API compatibility with callers.
    }

    subscribe() {
        playbackEvents.on("noteSelect", (data) => {
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
        const scaleNames = Object.keys(_scalesCache ?? {})
        let scale = scaleNames[0] ?? 'major'
        for (const name of scaleNames) {
            const steps = _scalesCache[name]?.scaleSteps
            if (!steps?.length || intervals.length === 0) continue
            const match = intervals.every((iv, i) => {
                return steps[i % steps.length] + Math.floor(i / steps.length) * 12 === iv
            })
            if (match) { scale = name; break }
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
    async showEmpty(data) {
        await this.#initEmptyData(data)
        super.show()
    }

    /** Show with default note values inline inside track editor container. */
    async showEmptyInline(data) {
        await this.#initEmptyData(data)
        this.container.style.display = 'block'
        this.sync()
    }

    /** @private */
    async #initData(data) {
        this.#track = data.track
        this.#note = data.note
        this.#beat = data.beat
        this.#beatStep = data.beatStep
        await loadScales()
    }

    /** @private */
    async #initEmptyData(data) {
        this.#track = data.track
        this.#beat = data.beat ?? 0
        this.#beatStep = data.beatStep ?? 0
        this.#note = { ...DEFAULT_NOTE }
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

        const scaleKeys = Object.keys(_scalesCache ?? {})
        const arpState = this.#getArpState(this.#note)

        const headerHtml = `<div class="ne-header">
            <span class="ne-track">${this.esc(this.#track.name)} [beat ${this.#beat + 1} step ${this.#beatStep + 1}]</span>
        </div>`

        const knobBarHtml = `<div class="ne-knob-bar">${
            KNOB_PROPS.map(p => `<div data-or-knob="${p.key}"></div>`).join('')
        }</div>`

        const tabBarHtml = this.#tab.renderBar()

        const panelsHtml = TAB_DEFS.map(tab => {
            const g = GROUPS.find(gr => gr.id === tab.id)
            if (!g) return ''
            const isHidden = this.#tab.isHidden(tab.id)
            const groupContent = g.props.map(p => this.#renderProp(p, arpState, scaleKeys)).join('')
            return `<div class="ne-tab-panel${isHidden ? ' ne-tab-panel-hidden' : ''}" data-tab-panel="${tab.id}">${groupContent}</div>`
        }).join('')

        this.container.innerHTML = headerHtml + knobBarHtml + tabBarHtml + panelsHtml

        this.#syncKnobs()
        this.#syncSliders(arpState)
        this.#tab.bindTo(this.container)
        this.#bindEvents()
    }

    /** @private Renders a single prop as HTML (select or slider placeholder). */
    #renderProp(p, arpState, scaleKeys) {
        if (p.type === 'select') {
            const val = this.#resolveSelectValue(p, arpState)
            const options = p.key === 'arpScale' ? scaleKeys : p.options
            const opts = renderOptions(options, val)
            return `<div class="ne-row"><label>${p.label}</label><select data-key="${p.key}">${opts}</select></div>`
        }
        return `<div data-or-slider="${p.key}"></div>`
    }

    /** @private */
    #resolveSelectValue(p, arpState) {
        if (p.key === 'arpScale') return this.#note._arpScale ?? arpState.scale
        if (p.key === 'arpType') return this.#note._arpType ?? arpState.type
        return this.#note['_' + p.key] ?? p.options[0]
    }

    /** @private Keep-alive: reuse existing knobs via setValue, create only new ones. */
    #syncKnobs() {
        this.#knobs = [...syncKnobs({
            container: this.container,
            configs: KNOB_PROPS.map(def => ({
                key: def.key, label: def.label, val: this.#note[def.key] ?? def.min,
                min: def.min, max: def.max, step: def.step,
                format: knobFormat(def),
                unit: def.key === 'velocity' ? '%' : def.key === 'pitch' ? 'st' : '',
                onChange: (v) => this.#onSlider(def.key, v),
            })),
            prev: new Map(this.#knobs.map(k => [k.key, k])),
        }).values()]
    }

    /** @private Keep-alive: reuse existing sliders via setValue, create only new ones. */
    #syncSliders(arpState) {
        const sliderProps = GROUPS.flatMap(g => g.props.filter(p => p.type !== 'select'))
        const configs = sliderProps.map(p => ({
            ...p,
            value: p.key === 'arpRange' ? arpState.range : (this.#note[p.key] ?? p.min),
        }))

        this.#sliders = [...syncComponentMap({
            container: this.container,
            configs,
            selector: 'or-slider',
            prev: new Map(this.#sliders.map(s => [s.key, s])),
            create: (cfg) => new OrSlider({
                key:    cfg.key,
                label:  cfg.label,
                min:    cfg.min,
                max:    cfg.max,
                step:   cfg.step,
                value:  cfg.value,
                format: cfg.key === 'pitch'
                    ? v => `${fmt(v)} ${pitchToNoteName(v, this.#track?.pitch ?? 0)}`
                    : fmt,
                onChange: v => this.#onSlider(cfg.key, v),
            }),
            update: (inst, cfg) => {
                inst.onChange = (v) => this.#onSlider(cfg.key, v)
                inst.setValue(cfg.value)
            },
            postMount: (el) => el.removeAttribute('data-prop'),
        }).values()]
    }

    /** @private */
    #bindEvents() {
        this.container.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', () => this.#onSelect(sel))
        })
    }

    hide() {
        if (this.#externalContainer) {
            this.container.style.display = 'none'
        } else {
            super.hide()
        }
        this.#knobs.forEach(k => k.destroy())
        this.#knobs = []
        this.#sliders.forEach(s => s.destroy())
        this.#sliders = []
        this.#note = null
        this.#track = null
    }

    /** Builds note.arp from scale intervals + mode, or nulls it if range <= 0. */
    #composeArp() {
        if (!this.#note) return
        const scale = this.#note._arpScale ?? 'major'
        const type = this.#note._arpType ?? 'up'
        const range = this.#note.arpRange ?? this.#getArpState(this.#note).range
        this.#note.arp = range > 0
            ? { intervals: getScaleIntervals(scale, range), mode: type }
            : null
    }

    #onSlider(key, val) {
        if (!this.#note || !this.#track) return
        this.#note[key] = val
        if (key === 'arpRange') this.#composeArp()
        playbackEvents.batch(() => {
            playbackEvents.emit("noteChange", [this.#track])
            playbackEvents.emit("patternChange", [this.#track])
        })
    }

    #onSelect(sel) {
        if (!this.#note || !this.#track) return
        this.#note['_' + sel.dataset.key] = sel.value
        this.#composeArp()
        playbackEvents.batch(() => {
            playbackEvents.emit("noteChange", [this.#track])
            playbackEvents.emit("patternChange", [this.#track])
        })
    }

    // ─── Public API ───────────────────────────────────────────────────────
    /** @returns {OrKnob[]} current knob instances */
    get knobs() { return this.#knobs }
}
