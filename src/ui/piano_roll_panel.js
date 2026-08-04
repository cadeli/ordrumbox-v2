import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import MfFlatNote from '../model/flatnote.js'
import { setViewBtn, setViewMode, pitchToNoteName } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'

const NOTE_HEIGHT = 14
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_KEY_INDICES = new Set([1, 3, 6, 8, 10])

const MIN_OCTAVE = 2
const MAX_OCTAVE = 6
const TOTAL_OCTAVES = MAX_OCTAVE - MIN_OCTAVE + 1
const TOTAL_KEYS = TOTAL_OCTAVES * 12
const C4_PITCH = 48

function pitchName(pitch) {
    return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`
}

export default class PianoRollPanel extends BasePanel {
    constructor() {
        super('piano-roll-panel')
        this._track = null
        this._trackIdx = -1
        this._cellWidth = 20
        this._firstShow = true
    }

    createDOM() {
        super.createDOM()
        this.container.style.display = 'none'
        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Piano Roll</span>
            </div>
            <div class="pp-piano-roll" id="pp-piano-roll">
                <div class="pp-piano-keys" id="pp-piano-keys"></div>
                <div class="pp-piano-grid-wrap" id="pp-piano-grid-wrap">
                    <div class="pp-piano-grid" id="pp-piano-grid"></div>
                </div>
            </div>
        `
    }

    subscribe() {
        playbackEvents.onPatternChange.push(() => this._sync())
        playbackEvents.onTrackSelect.push((data) => {
            if (!data) return
            this._track = data.track
            this._trackIdx = data.trackIdx
            if (this.isVisible) this._sync()
        })
        playbackEvents.onProllToggle.push(() => {
            if (this.isVisible) return
            this.show()
        })
        this.container?.addEventListener('click', (e) => {
            const key = e.target.closest('.pp-pr-key')
            if (key) this._playKey(parseInt(key.dataset.pitch, 10))
        })
    }

    show() {
        this._firstShow = true
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
            this._track = track
            this._trackIdx = idx
            playbackEvents.dispatchTrackSelect({ track, trackIdx: idx })
        }
        this._sync()
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
        this._measureCellWidth()
        this._renderKeys()
        this._renderGrid()
        this._renderNotes()
        if (this._firstShow) {
            this._scrollToC4()
            this._firstShow = false
        }
    }

    _measureCellWidth() {
        const ppCell = document.querySelector('#pattern-panel .pp-cell')
        if (ppCell) {
            this._cellWidth = ppCell.getBoundingClientRect().width || 20
        }
    }

    _renderKeys() {
        const el = this.container.querySelector('#pp-piano-keys')
        if (!el) return
        let html = ''
        for (let i = 0; i < TOTAL_KEYS; i++) {
            const pitch = MIN_OCTAVE * 12 + i
            const isBlack = BLACK_KEY_INDICES.has(((pitch % 12) + 12) % 12)
            const name = pitchName(pitch)
            html += `<div class="pp-pr-key ${isBlack ? 'black' : 'white'}" data-pitch="${pitch}" title="${name}"></div>`
        }
        el.innerHTML = html
    }

    _renderGrid() {
        const wrapEl = this.container.querySelector('#pp-piano-grid-wrap')
        const gridEl = this.container.querySelector('#pp-piano-grid')
        if (!wrapEl || !gridEl) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const track = this._track
        if (!track) return

        const stepsPerBeat = track.stepsPerBeat ?? 4
        const nbBeats = pattern.nbBeats ?? 4
        const totalSteps = nbBeats * stepsPerBeat
        const gridHeight = TOTAL_KEYS * NOTE_HEIGHT

        gridEl.style.height = `${gridHeight}px`
        gridEl.style.width = `${totalSteps * this._cellWidth}px`

        let html = ''
        for (let s = 0; s < totalSteps; s++) {
            const beat = Math.floor(s / stepsPerBeat)
            const stepInBeat = s % stepsPerBeat
            const isBeatStart = stepInBeat === 0
            const isHalf = stepsPerBeat >= 4 && stepInBeat === stepsPerBeat / 2
            const cls = isBeatStart ? 'beat' : isHalf ? 'half' : 'step'
            const x = s * this._cellWidth
            html += `<div class="pp-pr-col ${cls}" style="left:${x}px;width:${this._cellWidth}px"></div>`
        }

        for (let i = 0; i < TOTAL_KEYS; i++) {
            const pitch = MIN_OCTAVE * 12 + i
            const isC = ((pitch % 12) + 12) % 12 === 0
            const y = i * NOTE_HEIGHT
            html += `<div class="pp-pr-row ${isC ? 'octave' : ''}" style="bottom:${y}px;height:${NOTE_HEIGHT}px;width:${totalSteps * this._cellWidth}px"></div>`
        }

        gridEl.innerHTML = html
    }

    _renderNotes() {
        const gridEl = this.container.querySelector('#pp-piano-grid')
        if (!gridEl) return
        gridEl.querySelectorAll('.pp-pr-note').forEach(n => n.remove())

        const track = this._track
        if (!track) return
        const notes = Array.isArray(track.notes) ? track.notes : Object.values(track.notes ?? {})
        const stepsPerBeat = track.stepsPerBeat ?? 4

        notes.forEach(note => {
            const step = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
            const pitch = note.pitch ?? 0
            const row = pitch - MIN_OCTAVE * 12
            if (row < 0 || row >= TOTAL_KEYS) return

            const el = document.createElement('div')
            el.className = 'pp-pr-note'
            el.style.left = `${step * this._cellWidth + 1}px`
            el.style.width = `${this._cellWidth - 2}px`
            el.style.bottom = `${row * NOTE_HEIGHT + 1}px`
            el.style.height = `${NOTE_HEIGHT - 2}px`
            gridEl.appendChild(el)
        })
    }

    _scrollToC4() {
        const wrap = this.container.querySelector('#pp-piano-grid-wrap')
        if (!wrap) return
        const row = C4_PITCH - MIN_OCTAVE * 12
        const target = row * NOTE_HEIGHT - wrap.clientHeight / 2
        wrap.scrollTop = Math.max(0, target)
    }

    _playKey(pitch) {
        const track = this._track
        if (!track) return
        const note = { ...Utils.NOTE_DEFAULTS, pitch }
        const flatNote = new MfFlatNote(0, track, note)
        const audioEngine = serviceRegistry.audioEngine
        if (audioEngine?.mfSound) {
            audioEngine.mfSound.play(flatNote, audioEngine.audioCtx.currentTime)
        }
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
