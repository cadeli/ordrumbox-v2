import { playbackEvents } from '../state/playback_events.js'
import { fmt, pitchToNoteName, knobFormat } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import { OrKnob } from './components/or_knob.js'
import { OrTab } from './components/or_tab.js'
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
    /**
     * @param {HTMLElement} [externalContainer] – If provided, renders into this
     *   element instead of creating a separate fixed-position div.
     */
    constructor() {
        super('ne-panel')
        this._externalContainer = null
        this._note = null
        this._track = null
        this._trackEditor = null
        this._trackIdx = 0
        this._pos = 0
        this._beat = 0
        this._beatStep = 0
        this._knobs = []
        this._sliders = []
        this._tab = new OrTab({
            tabs: TAB_DEFS,
            defaultTab: 'triggers',
            onChange: () => this.sync()
        })
    }

    /** Provide the external container before init so the editor renders into it. */
    setContainer(el) {
        this._externalContainer = el
        this.container = el
    }

    init() {
        this.injectCSS()
        if (!this._externalContainer) {
            this.createDOM()
            this.sync()
        } else {
            this.container.style.display = 'none'
        }
        this.subscribe()
    }

    createDOM() {
        if (this._externalContainer) {
            this.container = this._externalContainer
            return
        }
        super.createDOM()
    }

    setTrackEditor(te) {
        this._trackEditor = te
    }

    subscribe() {
        playbackEvents.onNoteSelect.push((data) => {
            if (!data) return
            if (data.note) {
                if (this.isVisible) this.show(data)
            } else {
                this._track = data.track
                this._beat = data.beat
                this._beatStep = data.beatStep
                this._note = null
                if (this.isVisible) this.sync()
            }
        })
    }

    /** @returns {boolean} */
    get isVisible() {
        if (this._externalContainer) {
            return this.container.style.display !== 'none'
        }
        return super.isVisible
    }

    /**
     * Reverse-engineers scale name, arp type, and range from raw arp intervals.
     * @param {Object|null} note
     * @returns {{ scale: string, type: string, range: number }}
     */
    _getArpState(note) {
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
        await this._initData(data)
        super.show()
    }

    /** Show inline inside track editor container. */
    async showInline(data) {
        await this._initData(data)
        this.container.style.display = 'block'
        this.sync()
    }

    /** Show with default note values as standalone popup. */
    async showEmpty(data) {
        await this._initEmptyData(data)
        super.show()
    }

    /** Show with default note values inline inside track editor container. */
    async showEmptyInline(data) {
        await this._initEmptyData(data)
        this.container.style.display = 'block'
        this.sync()
    }

    /** @private */
    async _initData(data) {
        this._track = data.track
        this._note = data.note
        this._pos = data.pos
        this._beat = data.beat
        this._beatStep = data.beatStep
        await loadScales()
    }

    /** @private */
    async _initEmptyData(data) {
        this._track = data.track
        this._trackIdx = data.trackIdx ?? 0
        this._beat = data.beat ?? 0
        this._beatStep = data.beatStep ?? 0
        this._pos = data.pos ?? 0
        this._note = { ...DEFAULT_NOTE }
        await loadScales()
    }

    sync() {
        if (!this._note) {
            if (!this._track) return
            this.container.innerHTML = `<div class="ne-header">
                <span class="ne-track">${this.esc(this._track.name)} [beat ${this._beat + 1} step ${this._beatStep + 1}] — no note</span>
            </div>`
            return
        }

        const scaleKeys = Object.keys(_scalesCache ?? {})
        const arpState = this._getArpState(this._note)

        const headerHtml = `<div class="ne-header">
            <span class="ne-track">${this.esc(this._track.name)} [beat ${this._beat + 1} step ${this._beatStep + 1}]</span>
        </div>`

        const knobBarHtml = `<div class="ne-knob-bar">${
            KNOB_PROPS.map(p => `<div data-ne-knob="${p.key}"></div>`).join('')
        }</div>`

        const tabBarHtml = this._tab.renderBar()

        const panelsHtml = TAB_DEFS.map(tab => {
            const g = GROUPS.find(gr => gr.id === tab.id)
            if (!g) return ''
            const isHidden = this._tab.isHidden(tab.id)
            const groupContent = g.props.map(p => this._renderProp(p, arpState, scaleKeys)).join('')
            return `<div class="ne-tab-panel${isHidden ? ' ne-tab-panel-hidden' : ''}" data-tab-panel="${tab.id}">${groupContent}</div>`
        }).join('')

        this.container.innerHTML = headerHtml + knobBarHtml + tabBarHtml + panelsHtml

        this._syncKnobs()
        this._syncSliders(arpState)
        this._tab.bindTo(this.container)
        this._bindEvents()
    }

    /** @private Renders a single prop as HTML (select or slider placeholder). */
    _renderProp(p, arpState, scaleKeys) {
        if (p.type === 'select') {
            const val = this._resolveSelectValue(p, arpState)
            const options = p.key === 'arpScale' ? scaleKeys : p.options
            const opts = options.map(opt =>
                `<option value="${opt}"${opt === val ? ' selected' : ''}>${opt}</option>`
            ).join('')
            return `<div class="ne-row"><label>${p.label}</label><select data-key="${p.key}">${opts}</select></div>`
        }
        return `<div data-ne-slider="${p.key}"></div>`
    }

    /** @private */
    _resolveSelectValue(p, arpState) {
        if (p.key === 'arpScale') return this._note._arpScale ?? arpState.scale
        if (p.key === 'arpType') return this._note._arpType ?? arpState.type
        return this._note['_' + p.key] ?? p.options[0]
    }

    /** @private Keep-alive: reuse existing knobs via setValue, create only new ones. */
    _syncKnobs() {
        const prevKnobs = new Map(this._knobs.map(k => [k._key, k]))
        this._knobs = []

        for (const def of KNOB_PROPS) {
            const placeholder = this.container.querySelector(`[data-ne-knob="${def.key}"]`)
            if (!placeholder) continue

            let knob = prevKnobs.get(def.key)
            if (knob) {
                knob._onChange = (v) => this._onSlider(def.key, v)
                knob.setValue(this._note[def.key] ?? def.min)
                const row = this.container.querySelector(`.ne-row[data-or-slider="${def.key}"]`)
                if (row) knob.mount(row)
            } else {
                knob = new OrKnob({
                    key: def.key,
                    label: def.label,
                    min: def.min,
                    max: def.max,
                    step: def.step,
                    value: this._note[def.key] ?? def.min,
                    format: knobFormat(def),
                    unit: def.key === 'velocity' ? '%' : def.key === 'pitch' ? 'st' : '',
                    onChange: (v) => this._onSlider(def.key, v)
                })
                const el = knob.createElement()
                el.removeAttribute('data-prop')
                placeholder.replaceWith(el)
            }
            this._knobs.push(knob)
        }

        for (const [key, knob] of prevKnobs) {
            if (!this._knobs.some(k => k._key === key)) knob.destroy()
        }
    }

    /** @private Keep-alive: reuse existing sliders via setValue, create only new ones. */
    _syncSliders(arpState) {
        const prevSliders = new Map(this._sliders.map(s => [s._key, s]))
        this._sliders = []

        for (const g of GROUPS) {
            for (const p of g.props) {
                if (p.type === 'select') continue
                const placeholder = this.container.querySelector(`[data-ne-slider="${p.key}"]`)
                if (!placeholder) continue

                let val = this._note[p.key] ?? p.min
                if (p.key === 'arpRange') val = arpState.range

                let slider = prevSliders.get(p.key)
                if (slider) {
                    slider._onChange = (v) => this._onSlider(p.key, v)
                    slider.setValue(val)
                    const row = this.container.querySelector(`.ne-row[data-or-slider="${p.key}"]`)
                    if (row) slider.mount(row)
                } else {
                    slider = new OrSlider({
                        key: p.key,
                        label: p.label,
                        min: p.min,
                        max: p.max,
                        step: p.step,
                        value: val,
                        format: p.key === 'pitch'
                            ? v => `${fmt(v)} ${pitchToNoteName(v, this._track?.pitch ?? 0)}`
                            : fmt,
                        onChange: v => this._onSlider(p.key, v),
                    })
                    const el = slider.createElement()
                    el.removeAttribute('data-prop')
                    placeholder.replaceWith(el)
                }
                this._sliders.push(slider)
            }
        }

        for (const [key, slider] of prevSliders) {
            if (!this._sliders.some(s => s._key === key)) slider.destroy()
        }
    }

    /** @private */
    _bindEvents() {
        this.container.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', () => this._onSelect(sel))
        })
    }

    hide() {
        if (this._externalContainer) {
            this.container.style.display = 'none'
        } else {
            super.hide()
        }
        this._knobs.forEach(k => k.destroy())
        this._knobs = []
        this._sliders.forEach(s => s.destroy())
        this._sliders = []
        this._note = null
        this._track = null
    }

    /** No-op — Note Editor is nested inside Track Editor and positioned by its parent. */
    reposition() {}

    /** Builds note.arp from scale intervals + mode, or nulls it if range <= 0. */
    _composeArp() {
        if (!this._note) return
        const scale = this._note._arpScale ?? 'major'
        const type = this._note._arpType ?? 'up'
        const range = this._note.arpRange ?? this._getArpState(this._note).range
        this._note.arp = range > 0
            ? { intervals: getScaleIntervals(scale, range), mode: type }
            : null
    }

    _onSlider(key, val) {
        if (!this._note || !this._track) return
        this._note[key] = val
        if (key === 'arpRange') this._composeArp()
        playbackEvents.dispatchPatternChange([this._track])
    }

    _onSelect(sel) {
        if (!this._note || !this._track) return
        this._note['_' + sel.dataset.key] = sel.value
        this._composeArp()
        playbackEvents.dispatchPatternChange([this._track])
    }
}
