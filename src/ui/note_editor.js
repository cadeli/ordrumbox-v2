import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { fmt, pitchToNoteName } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import { OrKnob } from './components/or_knob.js'
import BasePanel from './base_panel.js'

const ARP_TYPES = ['up', 'down', 'updown']
const SCALES_URL = 'assets/data/scales.json'

let _scalesCache = null

async function loadScales() {
    if (_scalesCache) return _scalesCache
    const res = await fetch(SCALES_URL)
    const data = await res.json()
    _scalesCache = data
    return data
}

function getScaleIntervals(scaleName, range) {
    if (!_scalesCache || !_scalesCache[scaleName]) return [0]
    const steps = _scalesCache[scaleName].scaleSteps
    if (!steps || steps.length === 0) return [0]
    const intervals = []
    for (let i = 0; i < range; i++) {
        const octave = Math.floor(i / steps.length)
        const idx = i % steps.length
        intervals.push(steps[idx] + octave * 12)
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
    constructor() {
        super('ne-panel')
        this._note = null
        this._track = null
        this._trackEditor = null
        this._knobs = []
        this._activeTab = 'triggers'
    }

    setTrackEditor(te) {
        this._trackEditor = te
    }

    subscribe() {
        playbackEvents.onNoteSelect.push((data) => {
            if (!data) return
            if (this.isVisible) {
                this.show(data)
            }
        })
    }

    _getArpState(note) {
        if (!note.arp || typeof note.arp !== 'object' || Array.isArray(note.arp)) {
            return { scale: 'major', type: 'up', range: 0 }
        }
        const mode = typeof note.arp.mode === 'string' ? note.arp.mode.toLowerCase() : 'up'
        const type = ARP_TYPES.includes(mode) ? mode : 'up'
        const intervals = Array.isArray(note.arp.intervals) ? note.arp.intervals : []
        const scaleNames = Object.keys(_scalesCache ?? {})
        let scale = scaleNames[0] ?? 'major'
        if (_scalesCache) {
            for (const name of scaleNames) {
                const steps = _scalesCache[name].scaleSteps
                const match = intervals.length > 0 && intervals.every((iv, i) => {
                    const oct = Math.floor(i / steps.length)
                    const idx = i % steps.length
                    return steps[idx] + oct * 12 === iv
                })
                if (match) { scale = name; break }
            }
        }
        const range = intervals.length
        return { scale, type, range }
    }

    async show(data) {
        this._track = data.track
        this._note = data.note
        this._pos = data.pos
        this._beat = data.beat
        this._beatStep = data.beatStep

        await loadScales()
        super.show()
        this.reposition()
    }

    async showInline(data) {
        this._track = data.track
        this._note = data.note
        this._pos = data.pos
        this._beat = data.beat
        this._beatStep = data.beatStep

        await loadScales()
        this.container.style.display = 'block'
        this.sync()
        this.reposition()
    }

    async showEmpty(data) {
        this._track = data.track
        this._trackIdx = data.trackIdx ?? 0
        this._beat = data.beat ?? 0
        this._beatStep = data.beatStep ?? 0
        this._pos = data.pos ?? 0
        this._note = { velocity: 1, pitch: 0, pan: 0, every: 1, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0, arpTriggerProbability: 0, arpRange: 0 }

        await loadScales()
        super.show()
        this.sync()
        this.reposition()
    }

    async showEmptyInline(data) {
        this._track = data.track
        this._trackIdx = data.trackIdx ?? 0
        this._beat = data.beat ?? 0
        this._beatStep = data.beatStep ?? 0
        this._pos = data.pos ?? 0
        this._note = { velocity: 1, pitch: 0, pan: 0, every: 1, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0, arpTriggerProbability: 0, arpRange: 0 }

        await loadScales()
        this.container.style.display = 'block'
        this.sync()
        this.reposition()
    }

    sync() {
        if (!this._note) {
            if (!this._track) return
            this.container.innerHTML = `<div class="ne-header">
                <span class="ne-track">${this.esc(this._track.name)} — no note</span>
            </div>`
            return
        }

        // Destroy previous instances so their listeners are cleaned up
        if (this._sliders) this._sliders.forEach(s => s.destroy())
        this._sliders = []
        this._knobs.forEach(k => k.destroy())
        this._knobs = []

        const scaleKeys = Object.keys(_scalesCache ?? {})
        const arpState = this._getArpState(this._note)
        const scaleGroup = GROUPS[2]
        scaleGroup.props[0].options = scaleKeys

        let headerHtml = `<div class="ne-header">
            <span class="ne-track">${this.esc(this._track.name)} [beat ${this._beat} step ${this._beatStep}]</span>
        </div>`

        let knobBarHtml = `<div class="ne-knob-bar">`
        KNOB_PROPS.forEach(p => {
            knobBarHtml += `<div data-ne-knob="${p.key}"></div>`
        })
        knobBarHtml += '</div>'

        // Tab bar
        let tabBarHtml = '<div class="ne-tab-bar">'
        for (const tab of TAB_DEFS) {
            const cls = tab.id === this._activeTab ? ' active' : ''
            tabBarHtml += `<button class="ne-tab-btn${cls}" data-ne-tab="${tab.id}">${tab.label}</button>`
        }
        tabBarHtml += '</div>'

        // Tab panels
        let panelsHtml = ''
        TAB_DEFS.forEach((tab) => {
            const g = GROUPS.find(gr => gr.id === tab.id)
            if (!g) return
            const isHidden = tab.id !== this._activeTab

            let groupContent = ''
            g.props.forEach(p => {
                if (p.type === 'select') {
                    let val = p.key === 'arpScale' ? arpState.scale : arpState.type
                    if (this._note['_' + p.key]) val = this._note['_' + p.key]
                    groupContent += `<div class="ne-row">
                        <label>${p.label}</label>
                        <select data-key="${p.key}">`
                    p.options.forEach(opt => {
                        const sel = opt === val ? ' selected' : ''
                        groupContent += `<option value="${opt}"${sel}>${opt}</option>`
                    })
                    groupContent += `</select></div>`
                } else {
                    groupContent += `<div data-ne-slider="${p.key}"></div>`
                }
            })
            panelsHtml += `<div class="ne-tab-panel ${isHidden ? 'ne-tab-panel-hidden' : ''}" data-tab-panel="${tab.id}">${groupContent}</div>`
        })

        this.container.innerHTML = headerHtml + knobBarHtml + tabBarHtml + panelsHtml

        // Build OrKnob instances for the knob bar
        KNOB_PROPS.forEach(def => {
            const placeholder = this.container.querySelector(`[data-ne-knob="${def.key}"]`)
            if (!placeholder) return

            const knob = new OrKnob({
                key: def.key,
                label: def.label,
                min: def.min,
                max: def.max,
                step: def.step,
                value: this._note[def.key] ?? def.min,
                format: def.key === 'velocity'
                    ? v => Math.round(v * 100)
                    : def.key === 'pitch'
                        ? v => `${v >= 0 ? '+' : ''}${v}`
                        : fmt,
                unit: def.key === 'velocity' ? '%' : def.key === 'pitch' ? 'st' : '',
                onChange: (v) => this._onSlider(def.key, v)
            })
            this._knobs.push(knob)
            placeholder.replaceWith(knob.createElement())
        })

        // Build OrSlider instances for the active tab panel
        GROUPS.forEach((g) => {
            g.props.forEach(p => {
                if (p.type === 'select') return
                const placeholder = this.container.querySelector(`[data-ne-slider="${p.key}"]`)
                if (!placeholder) return

                let val = this._note[p.key] ?? p.min
                if (p.key === 'arpRange') {
                    val = arpState.range
                }

                const slider = new OrSlider({
                    key:    p.key,
                    label:  p.label,
                    min:    p.min,
                    max:    p.max,
                    step:   p.step,
                    value:  val,
                    format: p.key === 'pitch'
                        ? v => `${fmt(v)} ${pitchToNoteName(v, this._track?.pitch ?? 0)}`
                        : fmt,
                    onChange: v => this._onSlider(p.key, v),
                })
                this._sliders.push(slider)
                placeholder.replaceWith(slider.createElement())
            })
        })

        this._bindEvents()
    }

    _bindEvents() {
        this.container.querySelectorAll('[data-ne-tab]').forEach(btn => {
            btn.addEventListener('click', () => this._onTabClick(btn.dataset.neTab))
        })

        this.container.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', () => this._onSelect(sel))
        })
    }

    hide() {
        if (!this.isVisible) return
        super.hide()
        this._knobs.forEach(k => k.destroy())
        this._knobs = []
        this._note = null
        this._track = null
    }

    reposition() {
        const tePanel = document.getElementById('te-panel')
        if (!tePanel || tePanel.style.display === 'none') return
        const teRect = tePanel.getBoundingClientRect()
        this.container.style.top = (tePanel.offsetTop + tePanel.offsetHeight) + 'px'
        this.container.style.left = teRect.left + 'px'
        this.container.style.width = teRect.width + 'px'
    }

    _onTabClick(tabId) {
        if (tabId === this._activeTab) return
        this._activeTab = tabId
        this.sync()
    }

    _composeArp() {
        if (!this._note) return
        const scale = this._note._arpScale ?? 'major'
        const type = this._note._arpType ?? 'up'
        const range = this._note.arpRange ?? (this._getArpState(this._note).range)
        if (range <= 0) {
            this._note.arp = null
        } else {
            const intervals = getScaleIntervals(scale, range)
            this._note.arp = { intervals, mode: type }
        }
    }

    _onSlider(key, val) {
        if (!this._note || !this._track) return
        this._note[key] = val

        if (key === 'arpRange') this._composeArp()

        playbackEvents.dispatchPatternChange([this._track])
    }

    _onSelect(sel) {
        if (!this._note || !this._track) return
        const key = sel.dataset.key
        const val = sel.value
        this._note['_' + key] = val
        this._composeArp()
        playbackEvents.dispatchPatternChange([this._track])
    }
}
