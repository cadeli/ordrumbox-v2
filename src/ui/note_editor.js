import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { bindCloseButton, bindVisibilityToggles } from './panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import BasePanel from './base_panel.js'

const ARP_TYPES = ['up', 'down', 'updown']
const SCALES_URL = 'assets/data/scales.json'
const fmt = v => parseFloat(Number(v).toFixed(2))

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

const GROUPS = [
    {
        label: 'Vel / Pitch / Pan',
        props: [
            { key: 'velocity', label: 'Vel', min: 0, max: 1, step: 0.01 },
            { key: 'pitch', label: 'Pitch', min: -24, max: 24, step: 1 },
            { key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.01 }
        ]
    },
    {
        label: 'Triggers',
        props: [
            { key: 'triggerFreq', label: 'TrigF', min: 1, max: 16, step: 1 },
            { key: 'triggerPhase', label: 'TrigP', min: 0, max: 15, step: 1 },
            { key: 'triggerProbability', label: 'Trig%', min: 0, max: 1, step: 0.01 },
            { key: 'euclidianFill', label: 'Euc', min: 0, max: 16, step: 1 }
        ]
    },
    {
        label: 'Retrig',
        props: [
            { key: 'retriggerNum', label: 'Retrig', min: 1, max: 16, step: 1 },
            { key: 'retriggerStep', label: 'RetS', min: 1, max: 16, step: 1 }
        ]
    },
    {
        label: 'Arpege',
        props: [
            { key: 'arpScale', label: 'Scl', type: 'select', options: [] },
            { key: 'arpType', label: 'Dir', type: 'select', options: ARP_TYPES },
            { key: 'arpRange', label: 'Rng', min: 0, max: 12, step: 1 },
            { key: 'arpTriggerProbability', label: 'Arp%', min: 0, max: 1, step: 0.01 }
        ]
    }
]

export default class NoteEditor extends BasePanel {
    constructor() {
        super('ne-panel')
        this._note = null
        this._track = null
    }

    subscribe() {
        playbackEvents.onNoteSelect.push((data) => {
            if (!data) { this.hide(); return }
            this.show(data)
        })
        playbackEvents.onOutputToggle.push(() => this.hide())
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
        this._bar = data.bar
        this._barStep = data.barStep

        await loadScales()
        super.show()
    }

    sync() {
        if (!this._note) return

        // Destroy previous OrSlider instances so their listeners are cleaned up
        // before we wipe the container's innerHTML.
        if (this._sliders) this._sliders.forEach(s => s.destroy())
        this._sliders = []

        const vis = appState.noteEditorVisibility
        const scaleKeys = Object.keys(_scalesCache ?? {})
        const arpState = this._getArpState(this._note)
        const scaleGroup = GROUPS[3]
        scaleGroup.props[0].options = scaleKeys

        let headerHtml = `<div class="ne-header">
            <span class="ne-track">${this.esc(this._track.name)} [bar ${this._bar} step ${this._barStep}]</span>
            <div class="ne-toggles">
                <button class="ne-toggle ${vis.levels ? 'active' : ''}" data-toggle="levels">V/P/P</button>
                <button class="ne-toggle ${vis.triggers ? 'active' : ''}" data-toggle="triggers">Trig</button>
                <button class="ne-toggle ${vis.retrig ? 'active' : ''}" data-toggle="retrig">Retr</button>
                <button class="ne-toggle ${vis.arp ? 'active' : ''}" data-toggle="arp">Arp</button>
            </div>
            <button class="ne-close">&times;</button>
        </div>`

        let bodyHtml = `<div class="ne-body">`

        GROUPS.forEach((g, idx) => {
            const visKey = ['levels', 'triggers', 'retrig', 'arp'][idx]
            if (!vis[visKey]) return

            bodyHtml += `<div class="ne-group">
                <div class="ne-group-label">${g.label}</div>
                <div class="ne-grid">`
            g.props.forEach(p => {
                if (p.type === 'select') {
                    let val = p.key === 'arpScale' ? arpState.scale : arpState.type
                    if (this._note['_' + p.key]) val = this._note['_' + p.key]
                    bodyHtml += `<div class="ne-row">
                        <label>${p.label}</label>
                        <select data-key="${p.key}">`
                    p.options.forEach(opt => {
                        const sel = opt === val ? ' selected' : ''
                        bodyHtml += `<option value="${opt}"${sel}>${opt}</option>`
                    })
                    bodyHtml += `</select>
                    </div>`
                } else {
                    // Placeholder for OrSlider (replaced after innerHTML is set)
                    bodyHtml += `<div data-ne-slider="${p.key}"></div>`
                }
            })
            bodyHtml += `</div></div>`
        })

        bodyHtml += '</div>'
        this.container.innerHTML = headerHtml + bodyHtml
        
        // Build OrSlider instances for each placeholder
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
                    format: fmt,
                    onChange: v => this._onSlider(p.key, v),
                })
                this._sliders.push(slider)
                placeholder.replaceWith(slider.createElement())
            })
        })

        this._bindEvents()
    }

    _bindEvents() {
        bindVisibilityToggles(this.container, appState.noteEditorVisibility, () => this.sync())

        this.container.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', () => this._onSelect(sel))
        })
        bindCloseButton(this.container, () => this.hide())
    }

    hide() {
        if (!this.isVisible) return
        super.hide()
        
        const wasActive = this._note !== null
        this._note = null
        this._track = null

        if (wasActive) {
            playbackEvents.dispatchNoteSelect(null)
        }
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

        playbackEvents.dispatchPatternChange()
    }

    _onSelect(sel) {
        if (!this._note || !this._track) return
        const key = sel.dataset.key
        const val = sel.value
        this._note['_' + key] = val
        this._composeArp()
        playbackEvents.dispatchPatternChange()
    }
}
