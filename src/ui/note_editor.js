import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'

const ARP_TYPES = ['up', 'down', 'updown']
const SCALES_URL = 'public/assets/data/scales.json'
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
        label: 'Arpege',
        props: [
            { key: 'arpScale', label: 'Scl', type: 'select', options: [] },
            { key: 'arpType', label: 'Dir', type: 'select', options: ARP_TYPES },
            { key: 'arpRange', label: 'Rng', min: 0, max: 12, step: 1 },
            { key: 'arpTriggerProbability', label: 'Arp%', min: 0, max: 1, step: 0.01 },
            { key: 'retriggerNum', label: 'Retrig', min: 1, max: 16, step: 1 },
            { key: 'retriggerStep', label: 'RetS', min: 1, max: 16, step: 1 }
        ]
    }
]

export default class NoteEditor {
    constructor() {
        this.container = null
        this._note = null
        this._track = null
    }

    injectCSS() {
        if (document.getElementById('ui-styles')) return
        const link = document.createElement('link')
        link.id = 'ui-styles'
        link.rel = 'stylesheet'
        link.href = new URL('./styles.css', import.meta.url).href
        document.head.appendChild(link)
    }

    init() {
        this.injectCSS()
        this.createDOM()
        this.subscribe()
    }

    createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'ne-panel'
        document.body.appendChild(this.container)
    }

    subscribe() {
        playbackEvents.onNoteSelect.push((data) => {
            if (!data) { this.hide(); return }
            this.show(data)
        })
    }

    reposition() {
        const pp = document.getElementById('pattern-panel')
        if (pp) {
            this.container.style.top = (pp.offsetTop + pp.offsetHeight) + 'px'
        }
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

    async show({ track, trackIdx, note, pos, bar, barStep }) {
        this._track = track
        this._note = note

        await loadScales()

        const scaleKeys = Object.keys(_scalesCache ?? {})
        const arpState = this._getArpState(note)
        const scaleGroup = GROUPS[2]
        scaleGroup.props[0].options = scaleKeys

        let html = `<div class="ne-header">
            <span class="ne-track">${this.esc(track.name)}</span>
            <span class="ne-pos">bar ${bar} step ${barStep}</span>
            <button class="ne-close">&times;</button>
        </div><div class="ne-body">`

        GROUPS.forEach(g => {
            html += `<div class="ne-group">
                <div class="ne-group-label">${g.label}</div>
                <div class="ne-grid">`
            g.props.forEach(p => {
                if (p.type === 'select') {
                    let val = p.key === 'arpScale' ? arpState.scale : arpState.type
                    if (note['_' + p.key]) val = note['_' + p.key]
                    html += `<div class="ne-row">
                        <label>${p.label}</label>
                        <select data-key="${p.key}">`
                    p.options.forEach(opt => {
                        const sel = opt === val ? ' selected' : ''
                        html += `<option value="${opt}"${sel}>${opt}</option>`
                    })
                    html += `</select>
                    </div>`
                } else {
                    let val = note[p.key] ?? p.min
                    if (p.key === 'arpRange') {
                        val = arpState.range
                    }
                    html += `<div class="ne-row">
                        <label>${p.label}</label>
                        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}"
                            value="${val}" data-key="${p.key}">
                        <span class="ne-val">${fmt(val)}</span>
                    </div>`
                }
            })
            html += `</div></div>`
        })

        html += '</div>'
        this.container.innerHTML = html
        this.container.style.display = 'block'
        this.reposition()

        this.container.querySelectorAll('input[type=range]').forEach(input => {
            input.addEventListener('input', () => this._onSlider(input))
        })
        this.container.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', () => this._onSelect(sel))
        })
        this.container.querySelector('.ne-close').addEventListener('click', () => this.hide())
    }

    hide() {
        this.container.style.display = 'none'
        this._note = null
        this._track = null
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

    _onSlider(input) {
        if (!this._note || !this._track) return
        const key = input.dataset.key
        const val = parseFloat(input.value)
        this._note[key] = val
        input.nextElementSibling.textContent = fmt(val)

        if (key === 'arpRange') this._composeArp()

        const el = this.container.querySelector('.ne-pos')
        if (el) el.textContent = `bar ${this._note.bar} step ${this._note.barStep}`

        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    _onSelect(sel) {
        if (!this._note || !this._track) return
        const key = sel.dataset.key
        const val = sel.value
        this._note['_' + key] = val
        this._composeArp()
        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    esc(str) {
        const d = document.createElement('div')
        d.textContent = str
        return d.innerHTML
    }
}
