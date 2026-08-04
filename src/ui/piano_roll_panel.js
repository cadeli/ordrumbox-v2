import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import { setViewBtn, setViewMode, pitchToNoteName } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'

const PIANO_ROLL_NOTE_HEIGHT = 12
const PIANO_ROLL_OCTAVE_KEYS = 12
const PIANO_ROLL_BASE_OCTAVE = 2
const PIANO_ROLL_OCTAVES = 7

export default class PianoRollPanel extends BasePanel {
    constructor() {
        super('piano-roll-panel')
        this._animId = null
    }

    createDOM() {
        super.createDOM()
        this.container.style.display = 'none'
        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Piano Roll</span>
            </div>
            <div class="pp-piano-roll" id="pp-piano-roll">
                <div class="pp-piano-roll-piano" id="pp-piano-roll-piano"></div>
                <div class="pp-piano-roll-grid" id="pp-piano-roll-grid"></div>
            </div>
        `
    }

    subscribe() {
        playbackEvents.onPatternChange.push(() => this._sync())
        playbackEvents.onProllToggle.push(() => {
            if (this.isVisible) return
            this.show()
        })
    }

    show() {
        super.show(['tools-panel', 'output-panel', 'about-panel', 'dm-panel', 'soft-synth-panel'])
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
        const tePanel = document.getElementById('te-panel')
        if (tePanel) {
            tePanel.classList.remove('ui-hidden')
            tePanel.classList.add('pp-split')
            tePanel.style.display = 'block'
        }
        this.reposition()
        setViewMode('proll')
        const pattern = appState.patterns[appState.selectedPatternNum]
        const idx = appState.selectedTrackNum
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[idx]
        if (track) {
            playbackEvents.dispatchTrackSelect({ track, trackIdx: idx })
        }
    }

    hide() {
        super.hide()
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        setViewBtn('proll', false)
    }

    sync() {
        this._sync()
    }

    _sync() {
        if (!this.container) return
        this._renderPiano()
        this._renderNotes()
    }

    _renderPiano() {
        const pianoEl = this.container.querySelector('#pp-piano-roll-piano')
        if (!pianoEl) return
        let html = ''
        const totalKeys = PIANO_ROLL_OCTAVES * PIANO_ROLL_OCTAVE_KEYS
        for (let i = 0; i < totalKeys; i++) {
            const noteNum = PIANO_ROLL_BASE_OCTAVE * 12 + i
            const noteName = pitchToNoteName(noteNum) ?? `${noteNum}`
            const isBlack = this._isBlackKey((i % 12))
            html += `<div class="pp-piano-key ${isBlack ? 'black' : 'white'}" data-note="${noteNum}">
                <span class="pp-piano-label">${noteName}</span>
            </div>`
        }
        pianoEl.innerHTML = html
    }

    _isBlackKey(semi) {
        return [1, 3, 6, 8, 10].includes(semi)
    }

    _renderNotes() {
        const gridEl = this.container.querySelector('#pp-piano-roll-grid')
        if (!gridEl) return
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        const currentTrack = tracks[appState.selectedTrackNum]
        if (!currentTrack) return
        const notes = Array.isArray(currentTrack.notes) ? currentTrack.notes : Object.values(currentTrack.notes ?? {})
        const stepsPerBeat = currentTrack.stepsPerBeat ?? 4
        const totalBeats = pattern.nbBeats ?? 4
        const totalSteps = totalBeats * stepsPerBeat
        const totalKeys = PIANO_ROLL_OCTAVES * PIANO_ROLL_OCTAVE_KEYS
        const gridHeight = totalKeys * PIANO_ROLL_NOTE_HEIGHT
        gridEl.style.height = gridHeight + 'px'
        gridEl.style.position = 'relative'
        let html = ''
        for (let s = 0; s < totalSteps; s++) {
            html += `<div class="pp-piano-step" data-step="${s}"></div>`
        }
        gridEl.innerHTML = html
        notes.forEach(note => {
            const step = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
            const pitch = note.pitch ?? 0
            const noteRow = (pitch - PIANO_ROLL_BASE_OCTAVE * 12)
            if (noteRow < 0 || noteRow >= totalKeys) return
            const noteEl = document.createElement('div')
            noteEl.className = 'pp-piano-note'
            noteEl.style.left = `${step * PIANO_ROLL_NOTE_HEIGHT}px`
            noteEl.style.width = `${PIANO_ROLL_NOTE_HEIGHT}px`
            noteEl.style.bottom = `${noteRow * PIANO_ROLL_NOTE_HEIGHT}px`
            gridEl.appendChild(noteEl)
        })
    }

    reposition() {
        if (!this.container) return
        this.container.style.position = 'fixed'
        this.container.style.top = '64px'
        this.container.style.left = '0'
        this.container.style.right = 'auto'
        this.container.style.width = '79%'
        this.container.style.height = 'auto'
        this.container.style.minHeight = '440px'
    }
}
