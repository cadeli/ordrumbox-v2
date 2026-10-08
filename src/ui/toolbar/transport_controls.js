// src/ui/toolbar/transport_controls.js
// Transport section: start/stop, BPM toggle/slider, beats select.

import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/event_bus.js'
import { appState } from '../../state/app_state.js'
import { MAX_BEATS } from '../../core/constants.js'
import { EVENTS } from '../../core/events.js'
import { Lifecycle } from '../../core/lifecycle.js'

const BPM_MIN = 20
const BPM_MAX = 250

export default class TransportControls {
    /** Owns every listener bound through #life — released by destroy(). */
    #life = new Lifecycle()
    /** @type {HTMLButtonElement} */
    #startBtn
    /** @type {HTMLButtonElement} */
    #bpmToggle
    /** @type {HTMLDivElement} */
    #bpmPanel
    /** @type {HTMLInputElement} */
    #bpmSlider
    /** @type {HTMLSpanElement} */
    #bpmValue
    /** @type {HTMLSelectElement} */
    #beatsSelect
    #bpmOverride = null

    get startBtn() {
        return this.#startBtn
    }

    get bpmToggle() {
        return this.#bpmToggle
    }

    get bpmPanel() {
        return this.#bpmPanel
    }

    get bpmSlider() {
        return this.#bpmSlider
    }

    get bpmValue() {
        return this.#bpmValue
    }

    get beatsSelect() {
        return this.#beatsSelect
    }

    /** Releases every DOM listener bound through listen(). */
    destroy() {
        this.#life.destroy()
    }

    createDOM() {
        this.#startBtn = document.createElement('button')
        this.#startBtn.className = 'tb-start'
        this.#startBtn.textContent = '▶'
        this.#startBtn.title = 'Start / Stop'

        const bpmWrap = document.createElement('div')
        bpmWrap.className = 'tb-group'

        const bpmLabel = document.createElement('span')
        bpmLabel.className = 'tb-label'
        bpmLabel.textContent = 'BPM'

        this.#bpmToggle = document.createElement('button')
        this.#bpmToggle.className = 'tb-bpm-toggle'
        this.#bpmToggle.textContent = '120'
        bpmWrap.appendChild(bpmLabel)
        bpmWrap.appendChild(this.#bpmToggle)

        this.#bpmPanel = document.createElement('div')
        this.#bpmPanel.className = 'tb-bpm-panel'
        this.#bpmSlider = document.createElement('input')
        this.#bpmSlider.type = 'range'
        this.#bpmSlider.min = String(BPM_MIN)
        this.#bpmSlider.max = String(BPM_MAX)
        this.#bpmSlider.step = '1'
        this.#bpmValue = document.createElement('span')
        this.#bpmValue.className = 'tb-bpm-val'
        this.#bpmPanel.appendChild(this.#bpmSlider)
        this.#bpmPanel.appendChild(this.#bpmValue)
        bpmWrap.appendChild(this.#bpmPanel)

        const beatsWrap = document.createElement('div')
        beatsWrap.className = 'tb-group tb-beats-group'
        const beatsLabel = document.createElement('span')
        beatsLabel.className = 'tb-label'
        beatsLabel.textContent = 'Beats'
        this.#beatsSelect = document.createElement('select')
        for (let i = 1; i <= MAX_BEATS; i++) {
            const opt = document.createElement('option')
            opt.value = String(i)
            opt.textContent = String(i)
            this.#beatsSelect.appendChild(opt)
        }
        beatsWrap.appendChild(beatsLabel)
        beatsWrap.appendChild(this.#beatsSelect)

        return { startBtn: this.#startBtn, bpmWrap, beatsWrap }
    }

    /**
     * Renders the transport: run state, BPM (one pending slider override wins
     * over the pattern value) and the beat count.
     * @param {{isRunning: boolean, bpm: number, beatCount: number}} data
     */
    sync(data) {
        const bpm = this.#bpmOverride ?? data.bpm
        this.#bpmOverride = null

        this.#startBtn.textContent = data.isRunning ? '■' : '▶'
        this.#startBtn.classList.toggle('running', data.isRunning)
        this.#bpmSlider.value = String(bpm)
        this.#bpmValue.textContent = String(bpm)
        this.#bpmToggle.textContent = String(bpm)
        this.#beatsSelect.value = String(data.beatCount)
    }

    bindEvents() {
        // Fresh signal if this is a re-init cycle after destroy().
        this.#life.reset()

        this.#life.listen(this.#startBtn, 'click', () => {
            serviceRegistry.seq.toggleStartStop()
        })

        this.#life.listen(this.#bpmToggle, 'click', () => {
            this.#bpmPanel.classList.toggle('open')
        })

        this.#life.listen(this.#bpmSlider, 'input', () => {
            const bpm = parseInt(this.#bpmSlider.value, 10)
            this.#bpmValue.textContent = String(bpm)
            this.#bpmToggle.textContent = String(bpm)
            this.#bpmOverride = bpm
            serviceRegistry.seq?.setBpm(bpm)
            playbackEvents.emit(EVENTS.BPM_CHANGE, bpm)
        })

        this.#life.listen(this.#beatsSelect, 'change', () => {
            const val = parseInt(this.#beatsSelect.value, 10)
            if (isNaN(val)) return
            const pattern = appState.selectedPattern
            if (!pattern) return
            serviceRegistry.cmd.setPatternBeatCount(pattern, val)
            serviceRegistry.cmd.resetPage()
            playbackEvents.batch(() => {
                playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
                playbackEvents.emit(EVENTS.PATTERN_CHANGE)
            })
        })
    }
}
