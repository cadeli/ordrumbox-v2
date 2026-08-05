import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import { serviceRegistry } from '../state/service_registry.js'
import MfFlatNote from '../model/flatnote.js'
import { setViewBtn, setViewMode } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'
import { TICK } from '../core/constants.js'

const NOTE_HEIGHT = 14
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_KEY_INDICES = new Set([1, 3, 6, 8, 10])

// Absolute MIDI range shown in the roll. A note's absolute pitch is
// 60 (middle C) + track.pitch (-24..24) + note.pitch (-24..24), so the
// widest possible span is [12, 108]. Using that exact range guarantees
// every note the app can produce has a row to land on.
const MIDI_MIN = 12
const MIDI_MAX = 108
const TOTAL_KEYS = MIDI_MAX - MIDI_MIN + 1
const MIDDLE_C = 60

const MIN_CELL_WIDTH = 16
const KEYS_COLUMN_WIDTH = 80
const PAGE_BEATS = 4

function midiName(midi) {
    return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

export default class PianoRollPanel extends BasePanel {
    constructor() {
        super('piano-roll-panel')
        this._track = null
        this._trackIdx = -1
        this._cellWidth = 24
        this._firstShow = true
        this._resizeObserver = null
        this._pageStartBeat = 0
        this._playhead = null
        this._rafId = null
        this._prevLoopTick = -1
    }

    createDOM() {
        super.createDOM()
        this.container.style.display = 'none'
        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Piano Roll<span id="pp-pr-track-name"></span></span>
                <span id="pp-pr-page-nav" style="margin-left:auto;display:flex;align-items:center;gap:4px">
                    <button id="pp-pr-prev" class="pp-pr-page-btn" title="Previous page (←)">◀</button>
                    <span id="pp-pr-page-info"></span>
                    <button id="pp-pr-next" class="pp-pr-page-btn" title="Next page (→)">▶</button>
                </span>
            </div>
            <div class="pp-piano-roll" id="pp-piano-roll">
                <div class="pp-piano-scroll" id="pp-piano-scroll">
                    <div class="pp-piano-keys" id="pp-piano-keys"></div>
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
            if (this.isVisible) {
                this._firstShow = true
                this._sync()
            }
        })
        playbackEvents.onProllToggle.push(() => {
            if (this.isVisible) return
            this.show()
        })
        playbackEvents.onPlaybackStart.push(() => this._startRafLoop())
        playbackEvents.onPlaybackStop.push(() => {
            this._stopRafLoop()
            if (this._playhead) this._playhead.style.display = 'none'
            this._prevLoopTick = -1
        })
        this.container?.addEventListener('click', (e) => {
            const key = e.target.closest('.pp-pr-key')
            if (key) {
                this._playKey(parseInt(key.dataset.midi, 10))
                return
            }
            const gridEl = e.target.closest('#pp-piano-grid')
            if (gridEl) this._onGridClick(e, gridEl)
        })

        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => this._onResize())
        }
        this._onKeyDown = this._onKeyDown.bind(this)
        this._onWheel = this._onWheel.bind(this)
        this.container?.querySelector('#pp-pr-prev')?.addEventListener('click', () => this._prevPage())
        this.container?.querySelector('#pp-pr-next')?.addEventListener('click', () => this._nextPage())
    }

    show() {
        this._firstShow = true
        this._pageStartBeat = 0
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

        const scrollEl = this.container.querySelector('#pp-piano-scroll')
        if (scrollEl && this._resizeObserver) {
            this._resizeObserver.disconnect()
            this._resizeObserver.observe(scrollEl)
        }
        document.addEventListener('keydown', this._onKeyDown)
        this.container?.addEventListener('wheel', this._onWheel, { passive: false })
    }

    hide() {
        super.hide()
        this._resizeObserver?.disconnect()
        this._stopRafLoop()
        if (this._playhead) this._playhead.style.display = 'none'
        document.removeEventListener('keydown', this._onKeyDown)
        this.container?.removeEventListener('wheel', this._onWheel)
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        setViewBtn('proll', false)
    }

    sync() {
        this._sync()
    }

    _onResize() {
        const prevWidth = this._cellWidth
        this._measureCellWidth()
        if (this._cellWidth !== prevWidth) this._sync()
    }

    _sync() {
        if (!this.container) return
        this._clampPage()
        this._measureCellWidth()
        this._renderKeys()
        this._renderGrid()
        this._renderNotes()
        this._updateTrackName()
        this._updatePageInfo()
        if (this._playhead) {
            const gridEl = this.container.querySelector('#pp-piano-grid')
            gridEl?.appendChild(this._playhead)
        }
        if (this._firstShow) {
            this._scrollToTrackCenter()
            this._firstShow = false
        }
    }

    _updateTrackName() {
        const label = this.container.querySelector('#pp-pr-track-name')
        if (label) label.textContent = this._track?.name ? ` — ${this._track.name}` : ''
    }

    _updatePageInfo() {
        const info = this.container.querySelector('#pp-pr-page-info')
        const prev = this.container.querySelector('#pp-pr-prev')
        const next = this.container.querySelector('#pp-pr-next')
        const nav = this.container.querySelector('#pp-pr-page-nav')
        if (!info || !nav) return

        const total = this._totalPages()
        if (total <= 1) {
            nav.style.display = 'none'
            return
        }
        nav.style.display = 'flex'
        const current = Math.floor(this._pageStartBeat / PAGE_BEATS) + 1
        info.textContent = `${current}/${total}`
        if (prev) prev.disabled = this._pageStartBeat <= 0
        if (next) next.disabled = this._pageStartBeat >= (total - 1) * PAGE_BEATS
    }

    /**
     * Column width: fills the available grid width when the pattern is
     * short enough to fit, otherwise falls back to a fixed pixel width
     * and the grid scrolls horizontally.
     */
    _measureCellWidth() {
        const scrollEl = this.container.querySelector('#pp-piano-scroll')
        const track = this._track
        if (!scrollEl || !track) {
            this._cellWidth = 24
            return
        }
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const pageSteps = PAGE_BEATS * stepsPerBeat
        const availableWidth = scrollEl.clientWidth - KEYS_COLUMN_WIDTH
        this._cellWidth = Math.max(MIN_CELL_WIDTH, availableWidth / pageSteps)
    }

    _renderKeys() {
        const el = this.container.querySelector('#pp-piano-keys')
        if (!el) return
        const gridHeight = TOTAL_KEYS * NOTE_HEIGHT
        el.style.height = `${gridHeight}px`

        let html = ''
        for (let i = 0; i < TOTAL_KEYS; i++) {
            const midi = MIDI_MIN + i
            const isBlack = BLACK_KEY_INDICES.has(((midi % 12) + 12) % 12)
            const isC = ((midi % 12) + 12) % 12 === 0
            const name = midiName(midi)
            html += `<div class="pp-pr-key ${isBlack ? 'black' : 'white'} ${isC ? 'is-c' : ''}" data-midi="${midi}" title="${name}">${isC ? name : ''}</div>`
        }
        el.innerHTML = html
    }

    _renderGrid() {
        const gridEl = this.container.querySelector('#pp-piano-grid')
        if (!gridEl) return

        const track = this._track
        if (!track) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        const nbBeats = pattern?.nbBeats ?? 4
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const totalSteps = nbBeats * stepsPerBeat
        const pageSteps = PAGE_BEATS * stepsPerBeat
        const pageStartStep = this._pageStartBeat * stepsPerBeat
        const pageEndStep = Math.min(pageStartStep + pageSteps, totalSteps)
        const visibleSteps = pageEndStep - pageStartStep
        const gridHeight = TOTAL_KEYS * NOTE_HEIGHT
        const gridWidth = visibleSteps * this._cellWidth

        gridEl.style.height = `${gridHeight}px`
        gridEl.style.width = `${gridWidth}px`

        let html = ''
        for (let s = 0; s < visibleSteps; s++) {
            const absStep = pageStartStep + s
            const stepInBeat = absStep % stepsPerBeat
            const isBeatStart = stepInBeat === 0
            const isHalf = stepsPerBeat >= 4 && stepInBeat === stepsPerBeat / 2
            const cls = isBeatStart ? 'beat' : isHalf ? 'half' : 'step'
            const x = s * this._cellWidth
            html += `<div class="pp-pr-col ${cls}" style="left:${x}px;width:${this._cellWidth}px"></div>`
        }

        for (let i = 0; i < TOTAL_KEYS; i++) {
            const midi = MIDI_MIN + i
            const isC = ((midi % 12) + 12) % 12 === 0
            const y = i * NOTE_HEIGHT
            html += `<div class="pp-pr-row ${isC ? 'octave' : ''}" style="bottom:${y}px;height:${NOTE_HEIGHT}px;width:${gridWidth}px"></div>`
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
        const trackPitchOffset = track.pitch ?? 0

        const pattern = appState.patterns[appState.selectedPatternNum]
        const nbBeats = pattern?.nbBeats ?? 4
        const totalSteps = nbBeats * stepsPerBeat
        const pageSteps = PAGE_BEATS * stepsPerBeat
        const pageStartStep = this._pageStartBeat * stepsPerBeat
        const pageEndStep = Math.min(pageStartStep + pageSteps, totalSteps)

        const fragment = document.createDocumentFragment()
        notes.forEach(note => {
            const step = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
            if (step < pageStartStep || step >= pageEndStep) return

            const absMidi = MIDDLE_C + trackPitchOffset + (note.pitch ?? 0)
            const row = absMidi - MIDI_MIN
            if (row < 0 || row >= TOTAL_KEYS) return

            const pageStep = step - pageStartStep
            const el = document.createElement('div')
            el.className = 'pp-pr-note'
            el.style.left = `${pageStep * this._cellWidth + 1}px`
            el.style.width = `${this._cellWidth - 2}px`
            el.style.bottom = `${row * NOTE_HEIGHT + 1}px`
            el.style.height = `${NOTE_HEIGHT - 2}px`
            fragment.appendChild(el)
        })
        gridEl.appendChild(fragment)
    }

    /**
     * Click on the grid: adds a note where there is none, removes the
     * note under the click when clicking exactly on it, or adds a new
     * note at a different pitch to form a chord otherwise.
     */
    _onGridClick(e, gridEl) {
        const track = this._track
        const pattern = appState.patterns[appState.selectedPatternNum]
        const mfCmd = serviceRegistry.mfCmd
        if (!track || !pattern || !mfCmd) return

        const rect = gridEl.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        const stepsPerBeat = track.stepsPerBeat ?? 4
        const nbBeats = pattern.nbBeats ?? 4
        const totalSteps = nbBeats * stepsPerBeat

        const pageStartStep = this._pageStartBeat * stepsPerBeat
        const pageStep = Math.floor(x / this._cellWidth)
        const step = pageStartStep + pageStep
        const row = TOTAL_KEYS - 1 - Math.floor(y / NOTE_HEIGHT)
        if (step < 0 || step >= totalSteps || row < 0 || row >= TOTAL_KEYS) return

        const beat = Math.floor(step / stepsPerBeat)
        const beatStep = step % stepsPerBeat
        const trackPitchOffset = track.pitch ?? 0
        const clickedMidi = MIDI_MIN + row
        const relativePitch = clickedMidi - MIDDLE_C - trackPitchOffset

        const notesAtStep = (track.notes ?? []).filter(n => n.beat === beat && n.beatStep === beatStep)

        if (notesAtStep.length > 0) {
            const hit = notesAtStep.find(n => {
                const midi = MIDDLE_C + trackPitchOffset + (n.pitch ?? 0)
                return midi === clickedMidi
            })
            if (hit) {
                mfCmd.deleteNote(track, hit)
            } else {
                mfCmd.addNote(track, beat, beatStep, relativePitch)
            }
        } else {
            mfCmd.addNote(track, beat, beatStep, relativePitch)
        }

        playbackEvents.dispatchPatternChange([track])
    }

    _scrollToTrackCenter() {
        const scrollEl = this.container.querySelector('#pp-piano-scroll')
        if (!scrollEl) return
        const centerMidi = MIDDLE_C + (this._track?.pitch ?? 0)
        const row = centerMidi - MIDI_MIN
        // Rows are stacked bottom-up (low pitch at the bottom), so the
        // vertical offset from the top is measured from the highest key.
        const offsetFromTop = (TOTAL_KEYS - 1 - row) * NOTE_HEIGHT
        const target = offsetFromTop - scrollEl.clientHeight / 2
        scrollEl.scrollTop = Math.max(0, target)
    }

    _playKey(midi) {
        const track = this._track
        if (!track || Number.isNaN(midi)) return
        const relativePitch = midi - MIDDLE_C - (track.pitch ?? 0)
        const note = { ...Utils.NOTE_DEFAULTS, pitch: relativePitch }
        const flatNote = new MfFlatNote(0, track, note)
        const audioEngine = serviceRegistry.audioEngine
        if (audioEngine?.mfSound) {
            audioEngine.mfSound.play(flatNote, audioEngine.audioCtx.currentTime)
        }
    }

    _totalPages() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        const track = this._track
        if (!pattern || !track) return 1
        const nbBeats = pattern.nbBeats ?? 4
        return Math.max(1, Math.ceil(nbBeats / PAGE_BEATS))
    }

    _clampPage() {
        const max = this._totalPages() - 1
        if (this._pageStartBeat < 0) this._pageStartBeat = 0
        if (this._pageStartBeat > max * PAGE_BEATS) this._pageStartBeat = max * PAGE_BEATS
    }

    _prevPage() {
        if (this._pageStartBeat <= 0) return
        this._pageStartBeat -= PAGE_BEATS
        this._clampPage()
        this._sync()
    }

    _nextPage() {
        const maxStart = (this._totalPages() - 1) * PAGE_BEATS
        if (this._pageStartBeat >= maxStart) return
        this._pageStartBeat += PAGE_BEATS
        this._clampPage()
        this._sync()
    }

    _onKeyDown(e) {
        if (!this.isVisible) return
        if (e.key === 'ArrowLeft') { this._prevPage(); e.preventDefault() }
        else if (e.key === 'ArrowRight') { this._nextPage(); e.preventDefault() }
    }

    _onWheel(e) {
        if (!this.isVisible) return
        if (!e.shiftKey) return
        if (e.deltaY > 0 || e.deltaX > 0) this._nextPage()
        else if (e.deltaY < 0 || e.deltaX < 0) this._prevPage()
        e.preventDefault()
    }

    _ensurePlayhead() {
        if (this._playhead && this.container?.contains(this._playhead)) return
        this._playhead = document.createElement('div')
        this._playhead.className = 'pp-pr-playhead'
        this._playhead.style.display = 'none'
        const gridEl = this.container?.querySelector('#pp-piano-grid')
        gridEl?.appendChild(this._playhead)
    }

    _startRafLoop() {
        if (this._rafId) return
        const loop = () => {
            const transport = serviceRegistry.transport
            if (!transport?.isRunning || !this.container || !this.isVisible) {
                this._rafId = null
                if (this._playhead) this._playhead.style.display = 'none'
                return
            }
            this._updatePlayhead()
            this._rafId = requestAnimationFrame(loop)
        }
        this._rafId = requestAnimationFrame(loop)
    }

    _stopRafLoop() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId)
            this._rafId = null
        }
    }

    _updatePlayhead() {
        const transport = serviceRegistry.transport
        if (!transport?.isRunning) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        const track = this._track
        if (!pattern || !track || !this.container) return

        this._ensurePlayhead()

        const nbBeats = pattern.nbBeats ?? 4
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const nbTicks = TICK * nbBeats
        if (nbTicks <= 0) return

        const loopTick = (transport.tick ?? 0) % nbTicks
        if (loopTick === this._prevLoopTick && this._playhead.style.display !== 'none') return
        this._prevLoopTick = loopTick

        const currentBeat = Math.floor(loopTick / TICK)
        const tickInBeat = loopTick % TICK
        const currentBeatStep = Math.floor(tickInBeat / (TICK / stepsPerBeat))
        const absStep = currentBeat * stepsPerBeat + currentBeatStep

        const pageSteps = PAGE_BEATS * stepsPerBeat
        const pageStartStep = this._pageStartBeat * stepsPerBeat
        const totalSteps = nbBeats * stepsPerBeat

        if (absStep < pageStartStep || absStep >= pageStartStep + pageSteps) {
            const newPageStartBeat = Math.floor(absStep / stepsPerBeat / PAGE_BEATS) * PAGE_BEATS
            if (newPageStartBeat !== this._pageStartBeat) {
                this._pageStartBeat = newPageStartBeat
                this._clampPage()
                this._sync()
            }
            if (this._playhead.style.display !== 'none') this._playhead.style.display = 'none'
            return
        }

        const pageStep = absStep - pageStartStep
        const x = pageStep * this._cellWidth

        if (this._playhead.style.display !== 'block') this._playhead.style.display = 'block'
        this._playhead.style.left = `${x}px`
        this._playhead.style.width = `${Math.max(2, this._cellWidth)}px`
    }

    reposition() {
        if (!this.container) return
        this.container.style.position = 'fixed'
        this.container.style.top = '64px'
        this.container.style.left = '0'
        this.container.style.right = 'auto'
        this.container.style.width = '79%'
        // Height is governed by the CSS rule on #piano-roll-panel
        // (height: min(70vh, 620px)) — do not override it inline here,
        // that would silently defeat the vertical-scroll fix.
    }
}