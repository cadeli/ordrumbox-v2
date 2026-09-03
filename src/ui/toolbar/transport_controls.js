// src/ui/toolbar/transport_controls.js
// Transport section: start/stop, BPM toggle/slider, beats select.

import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/playback_events.js'
import { appState } from '../../state/app_state.js'
import Utils from '../../core/utils.js'
import { recalcLoopDerived } from '../../model/track_schema.js'

export default class TransportControls {
    /** @param {import('../toolbar.js').default} toolbar */
    constructor(toolbar) { this._tb = toolbar }

    createDOM() {
        const tb = this._tb

        tb.startBtn = document.createElement('button')
        tb.startBtn.className = 'tb-start'
        tb.startBtn.textContent = '▶'
        tb.startBtn.title = 'Start / Stop'

        const bpmWrap = document.createElement('div')
        bpmWrap.className = 'tb-group'

        const bpmLabel = document.createElement('span')
        bpmLabel.className = 'tb-label'
        bpmLabel.textContent = 'BPM'

        tb.bpmToggle = document.createElement('button')
        tb.bpmToggle.className = 'tb-bpm-toggle'
        tb.bpmToggle.textContent = '120'
        bpmWrap.appendChild(bpmLabel)
        bpmWrap.appendChild(tb.bpmToggle)

        tb.bpmPanel = document.createElement('div')
        tb.bpmPanel.className = 'tb-bpm-panel'
        tb.bpmSlider = document.createElement('input')
        tb.bpmSlider.type = 'range'
        tb.bpmSlider.min = 20
        tb.bpmSlider.max = 250
        tb.bpmSlider.step = 1
        tb.bpmValue = document.createElement('span')
        tb.bpmValue.className = 'tb-bpm-val'
        tb.bpmPanel.appendChild(tb.bpmSlider)
        tb.bpmPanel.appendChild(tb.bpmValue)
        bpmWrap.appendChild(tb.bpmPanel)

        const beatsWrap = document.createElement('div')
        beatsWrap.className = 'tb-group tb-beats-group'
        const beatsLabel = document.createElement('span')
        beatsLabel.className = 'tb-label'
        beatsLabel.textContent = 'Beats'
        tb.beatsSelect = document.createElement('select')
        for (let i = 1; i <= 16; i++) {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = i
            tb.beatsSelect.appendChild(opt)
        }
        beatsWrap.appendChild(beatsLabel)
        beatsWrap.appendChild(tb.beatsSelect)

        return { startBtn: tb.startBtn, bpmWrap, beatsWrap }
    }

    bindEvents() {
        const tb = this._tb

        tb.startBtn.addEventListener('click', () => {
            serviceRegistry.seq.toggleStartStop()
        })

        tb.bpmToggle.addEventListener('click', () => {
            tb.bpmPanel.classList.toggle('open')
        })

        tb.bpmSlider.addEventListener('input', () => {
            const bpm = parseInt(tb.bpmSlider.value, 10)
            tb.bpmValue.textContent = bpm
            serviceRegistry.seq?.setBpm(bpm)
            playbackEvents.emit('bpmChange', bpm)
        })

        tb.beatsSelect.addEventListener('change', () => {
            const val = parseInt(tb.beatsSelect.value, 10)
            if (isNaN(val)) return
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            pattern.nbBeats = val
            Utils.getTracksArray(pattern).forEach(track => {
                track.nbBeats = val
                const maxSteps = val * (track.stepsPerBeat ?? 4)
                if (track.loopAtStep > maxSteps) {
                    track.loopAtStep = maxSteps
                    recalcLoopDerived(track)
                }
            })
            appState.currentPage = 0
            playbackEvents.batch(() => {
                playbackEvents.emit('patternMetaChange')
                playbackEvents.emit('patternChange')
            })
        })
    }
}
