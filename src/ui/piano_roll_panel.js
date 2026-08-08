import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import { serviceRegistry } from '../state/service_registry.js'
import { isMobileViewport } from '../core/constants.js'
import MfFlatNote from '../model/flatnote.js'
import BasePanel from './base_panel.js'
import { TICK } from '../core/constants.js'
import { pitchToNoteName, formatNoteTooltip } from './components/ui_utils.js'

const NOTE_HEIGHT = 14
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_KEY_INDICES = new Set([1, 3, 6, 8, 10])

const MIDI_MIN = 12
const MIDI_MAX = 108
const TOTAL_KEYS = MIDI_MAX - MIDI_MIN + 1
const MIDDLE_C = 60
const GRID_HEIGHT = TOTAL_KEYS * NOTE_HEIGHT

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
        this._selNote = null
        this._cursorStep = -1
        this._cursorRow = -1
        this._prevLitTick = -1
        this._litNoteEls = []
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
        playbackEvents.onPlaybackStart.push(() => this._startRafLoop())
        playbackEvents.onPlaybackStop.push(() => {
            this._stopRafLoop()
            if (this._playhead) this._playhead.style.display = 'none'
            this._prevLoopTick = -1
        })
        this.container?.addEventListener('click', (e) => {
            const key = e.target.closest('.pp-pr-key')
            if (key) { this._playKey(parseInt(key.dataset.midi, 10)); return }
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
        this._clearSelection()
        super.show(['tools-panel', 'output-panel', 'about-panel', 'dm-panel', 'soft-synth-panel'])
        this.reposition()
        const pattern = appState.patterns[appState.selectedPatternNum]
        const idx = appState.selectedTrackNum
        const track = Utils.getTracksArray(pattern)?.[idx]
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
        this._clearIllumination()
        this._clearSelection()
        document.removeEventListener('keydown', this._onKeyDown)
        this.container?.removeEventListener('wheel', this._onWheel)
    }

    sync() { this._sync() }

    _onResize() {
        const prev = this._cellWidth
        this._measureCellWidth()
        if (this._cellWidth !== prev) this._sync()
    }

    _pageInfo() {
        const track = this._track
        const pattern = appState.patterns[appState.selectedPatternNum]
        const stepsPerBeat = track?.stepsPerBeat ?? 4
        const nbBeats = pattern?.nbBeats ?? 4
        const totalSteps = nbBeats * stepsPerBeat
        const pageStartStep = this._pageStartBeat * stepsPerBeat
        const pageEndStep = Math.min(pageStartStep + PAGE_BEATS * stepsPerBeat, totalSteps)
        return { stepsPerBeat, nbBeats, totalSteps, pageStartStep, pageEndStep, visibleSteps: pageEndStep - pageStartStep }
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
            this.container.querySelector('#pp-piano-grid')?.appendChild(this._playhead)
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
        const nav = this.container.querySelector('#pp-pr-page-nav')
        const info = this.container.querySelector('#pp-pr-page-info')
        if (!info || !nav) return
        const total = this._totalPages()
        if (total <= 1) { nav.style.display = 'none'; return }
        nav.style.display = 'flex'
        info.textContent = `${Math.floor(this._pageStartBeat / PAGE_BEATS) + 1}/${total}`
        const prev = this.container.querySelector('#pp-pr-prev')
        const next = this.container.querySelector('#pp-pr-next')
        if (prev) prev.disabled = this._pageStartBeat <= 0
        if (next) next.disabled = this._pageStartBeat >= (total - 1) * PAGE_BEATS
    }

    _applySelection() {
        if (!this.container) return
        this.container.querySelectorAll('.pp-pr-note.selected').forEach(el => el.classList.remove('selected'))
        if (!this._selNote) return
        const idx = (this._track?.notes ?? []).indexOf(this._selNote)
        if (idx < 0) return
        this.container.querySelector(`.pp-pr-note[data-note="${idx}"]`)?.classList.add('selected')
    }

    _clearSelection() {
        this._selNote = null
        this._cursorStep = -1
        this._cursorRow = -1
        playbackEvents.dispatchNoteSelect(null)
    }

    _measureCellWidth() {
        const scrollEl = this.container.querySelector('#pp-piano-scroll')
        if (!scrollEl || !this._track) { this._cellWidth = 24; return }
        const pageSteps = PAGE_BEATS * (this._track.stepsPerBeat ?? 4)
        this._cellWidth = Math.max(MIN_CELL_WIDTH, (scrollEl.clientWidth - KEYS_COLUMN_WIDTH) / pageSteps)
    }

    _renderKeys() {
        const el = this.container.querySelector('#pp-piano-keys')
        if (!el) return
        el.style.height = `${GRID_HEIGHT}px`
        let html = ''
        for (let i = 0; i < TOTAL_KEYS; i++) {
            const midi = MIDI_MIN + i
            const mod = ((midi % 12) + 12) % 12
            const isBlack = BLACK_KEY_INDICES.has(mod)
            const isC = mod === 0
            html += `<div class="pp-pr-key ${isBlack ? 'black' : 'white'} ${isC ? 'is-c' : ''}" data-midi="${midi}" title="${midiName(midi)}">${isC ? midiName(midi) : ''}</div>`
        }
        el.innerHTML = html
    }

    _renderGrid() {
        const gridEl = this.container.querySelector('#pp-piano-grid')
        if (!gridEl || !this._track) return
        const { stepsPerBeat, pageStartStep, visibleSteps } = this._pageInfo()
        const gridWidth = visibleSteps * this._cellWidth
        gridEl.style.height = `${GRID_HEIGHT}px`
        gridEl.style.width = `${gridWidth}px`

        let html = ''
        for (let s = 0; s < visibleSteps; s++) {
            const stepInBeat = (pageStartStep + s) % stepsPerBeat
            const cls = stepInBeat === 0 ? 'beat' : stepsPerBeat >= 4 && stepInBeat === stepsPerBeat / 2 ? 'half' : 'step'
            html += `<div class="pp-pr-col ${cls}" style="left:${s * this._cellWidth}px;width:${this._cellWidth}px"></div>`
        }
        for (let i = 0; i < TOTAL_KEYS; i++) {
            const isC = ((MIDI_MIN + i) % 12 + 12) % 12 === 0
            html += `<div class="pp-pr-row ${isC ? 'octave' : ''}" style="bottom:${i * NOTE_HEIGHT}px;height:${NOTE_HEIGHT}px;width:${gridWidth}px"></div>`
        }
        gridEl.innerHTML = html

        const track = this._track
        const loopAtStep = track.loopAtStep ?? (this._pageInfo().totalSteps)
        if (loopAtStep > pageStartStep && loopAtStep <= pageStartStep + visibleSteps) {
            const lpEl = document.createElement('div')
            lpEl.className = 'pp-pr-loop-point'
            lpEl.style.left = `${(loopAtStep - pageStartStep) * this._cellWidth}px`
            lpEl.style.height = `${GRID_HEIGHT}px`
            gridEl.appendChild(lpEl)
        }
    }

    _renderNotes() {
        const gridEl = this.container.querySelector('#pp-piano-grid')
        if (!gridEl) return
        gridEl.querySelectorAll('.pp-pr-note, .pp-pr-ghost, .pp-pr-cursor').forEach(n => n.remove())
        const track = this._track
        if (!track) return
        const { stepsPerBeat, totalSteps, pageStartStep, pageEndStep, visibleSteps } = this._pageInfo()
        const trackPitchOffset = track.pitch ?? 0
        const notes = track.notes ?? []
        const fragment = document.createDocumentFragment()

        notes.forEach((note, noteIdx) => {
            const step = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
            if (step < pageStartStep || step >= pageEndStep) return
            const row = MIDDLE_C + trackPitchOffset + (note.pitch ?? 0) - MIDI_MIN
            if (row < 0 || row >= TOTAL_KEYS) return

            const pageStep = step - pageStartStep
            const vel = note.velocity ?? 0.8

            const el = document.createElement('div')
            el.className = `pp-pr-note${this._selNote === note ? ' selected' : ''}`
            el.style.left = `${pageStep * this._cellWidth + 1}px`
            el.style.width = `${this._cellWidth - 2}px`
            el.style.bottom = `${row * NOTE_HEIGHT + 1}px`
            el.style.height = `${NOTE_HEIGHT - 2}px`
            el.style.opacity = (0.25 + vel * 0.75).toFixed(2)
            el.title = formatNoteTooltip(note, trackPitchOffset)
            el.dataset.note = String(noteIdx)

            const prob = note.prob ?? 1
            const every = note.every ?? 1
            if (prob < 1) {
                el.classList.add('pp-pr-trig-rand')
                el.dataset.trig = String(Math.round(prob * 10))
            } else if (every > 1) {
                el.classList.add('pp-pr-trig-fixed')
                el.dataset.trig = String(every)
            }
            fragment.appendChild(el)

            this._getSubPositions(note, track, totalSteps).forEach(({ pos, type, pitchOffset }) => {
                const ghStep = pos - pageStartStep
                if (ghStep < 0 || ghStep >= visibleSteps) return
                const ghRow = row + (pitchOffset ?? 0)
                if (ghRow < 0 || ghRow >= TOTAL_KEYS) return
                const gh = document.createElement('div')
                gh.className = `pp-pr-ghost pp-pr-ghost-${type}`
                gh.style.left = `${ghStep * this._cellWidth}px`
                gh.style.bottom = `${ghRow * NOTE_HEIGHT}px`
                gh.style.width = `${this._cellWidth}px`
                gh.style.height = `${NOTE_HEIGHT}px`
                fragment.appendChild(gh)
            })
        })

        if (this._cursorStep >= pageStartStep && this._cursorStep < pageEndStep && this._cursorRow >= 0 && this._cursorRow < TOTAL_KEYS && !this._selNote) {
            const cursor = document.createElement('div')
            cursor.className = 'pp-pr-cursor'
            cursor.style.left = `${(this._cursorStep - pageStartStep) * this._cellWidth}px`
            cursor.style.bottom = `${this._cursorRow * NOTE_HEIGHT}px`
            cursor.style.width = `${this._cellWidth}px`
            cursor.style.height = `${NOTE_HEIGHT}px`
            fragment.appendChild(cursor)
        }

        gridEl.appendChild(fragment)
    }

    _getSubPositions(note, track, totalSteps) {
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const basePos = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
        const retriggerNum = note.retriggerNum ?? 1
        const rate = note.rate ?? 1
        const euclidianFill = note.euclidianFill ?? 0
        const arpConfig = this._normalizeArp(note.arp)
        const hasTriggers = arpConfig || retriggerNum > 1 || euclidianFill > 0

        const positions = []
        if (!hasTriggers) return positions

        const stepSpacing = rate < 8 ? rate / 8 : rate - 7
        const seq = arpConfig?.sequence

        for (let i = 1; i < retriggerNum; i++) {
            const pos = Math.round(basePos + i * stepSpacing)
            if (pos < totalSteps) positions.push({ pos, type: 'retrigger', pitchOffset: seq ? seq[i % seq.length] : 0 })
        }

        if (euclidianFill > 0) {
            let endStep = totalSteps
            for (const n of (track.notes ?? [])) {
                const nPos = (n.beat ?? 0) * stepsPerBeat + (n.beatStep ?? 0)
                if (nPos > basePos && nPos < endStep) endStep = nPos
            }
            if (track.loopAtStep && track.loopAtStep > basePos && track.loopAtStep < endStep) endStep = track.loopAtStep
            const stepsSpan = endStep - basePos
            for (let i = 1; i <= euclidianFill; i++) {
                const pos = Math.round(basePos + (i * stepsSpan) / (euclidianFill + 1))
                if (pos < totalSteps) positions.push({ pos, type: 'euclidian', pitchOffset: seq ? seq[(retriggerNum + i - 1) % seq.length] : 0 })
            }
        }
        return positions
    }

    _normalizeArp(arp) {
        if (arp == null) return null
        let intervals, mode = 'up'
        if (Array.isArray(arp)) {
            intervals = arp
        } else if (typeof arp === 'string') {
            if (!/\d/.test(arp)) return null
            intervals = arp.split(',').map(Number).filter(Number.isFinite)
        } else if (typeof arp === 'object') {
            intervals = Array.isArray(arp.intervals) ? arp.intervals : []
            mode = String(arp.mode ?? mode).toLowerCase()
        } else {
            return null
        }
        const filtered = intervals.map(Number).filter(Number.isFinite)
        if (filtered.length === 0) return null
        if (!filtered.includes(0)) filtered.unshift(0)
        const asc = [...filtered].sort((a, b) => a - b)
        const sequence = mode === 'down' ? [...asc].reverse()
            : mode === 'updown' ? asc.concat(asc.slice(1, -1).reverse())
            : asc
        return { sequence }
    }

    _onGridClick(e, gridEl) {
        const track = this._track
        const mfCmd = serviceRegistry.mfCmd
        if (!track || !mfCmd) return
        const { stepsPerBeat, totalSteps, pageStartStep } = this._pageInfo()
        const rect = gridEl.getBoundingClientRect()
        const pageStep = Math.floor((e.clientX - rect.left) / this._cellWidth)
        const step = pageStartStep + pageStep
        const row = TOTAL_KEYS - 1 - Math.floor((e.clientY - rect.top) / NOTE_HEIGHT)
        if (step < 0 || step >= totalSteps || row < 0 || row >= TOTAL_KEYS) return

        const beat = Math.floor(step / stepsPerBeat)
        const beatStep = step % stepsPerBeat
        const trackPitchOffset = track.pitch ?? 0
        const clickedMidi = MIDI_MIN + row
        const relativePitch = clickedMidi - MIDDLE_C - trackPitchOffset

        const hit = (track.notes ?? []).find(n => n.beat === beat && n.beatStep === beatStep
            && (MIDDLE_C + trackPitchOffset + (n.pitch ?? 0)) === clickedMidi)

        if (hit) {
            if (this._selNote === hit) {
                mfCmd.deleteNote(track, hit)
                this._clearSelection()
                playbackEvents.dispatchPatternChange([track])
            } else {
                this._selNote = hit
                this._cursorStep = step
                this._cursorRow = row
                this._applySelection()
                playbackEvents.dispatchNoteSelect({ track, trackIdx: this._trackIdx, note: hit, beat, beatStep })
            }
        } else {
            const newNote = mfCmd.addNote(track, beat, beatStep, relativePitch)
            this._selNote = newNote
            this._cursorStep = step
            this._cursorRow = row
            this._applySelection()
            playbackEvents.dispatchPatternChange([track])
            playbackEvents.dispatchNoteSelect({ track, trackIdx: this._trackIdx, note: newNote, beat, beatStep })
        }
    }

    _scrollToTrackCenter() {
        const scrollEl = this.container.querySelector('#pp-piano-scroll')
        if (!scrollEl) return
        const row = MIDDLE_C + (this._track?.pitch ?? 0) - MIDI_MIN
        scrollEl.scrollTop = Math.max(0, (TOTAL_KEYS - 1 - row) * NOTE_HEIGHT - scrollEl.clientHeight / 2)
    }

    _playKey(midi) {
        const track = this._track
        if (!track || Number.isNaN(midi)) return
        const relativePitch = midi - MIDDLE_C - (track.pitch ?? 0)
        const flatNote = new MfFlatNote(0, track, { ...Utils.NOTE_DEFAULTS, pitch: relativePitch })
        serviceRegistry.audioEngine?.mfSound?.play(flatNote, serviceRegistry.audioEngine.audioCtx.currentTime)
    }

    _totalPages() {
        if (!this._track) return 1
        const nbBeats = appState.patterns[appState.selectedPatternNum]?.nbBeats ?? 4
        return Math.max(1, Math.ceil(nbBeats / PAGE_BEATS))
    }

    _clampPage() {
        const max = (this._totalPages() - 1) * PAGE_BEATS
        this._pageStartBeat = Math.max(0, Math.min(this._pageStartBeat, max))
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
        const track = this._track
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!track || !pattern) return
        const mfCmd = serviceRegistry.mfCmd
        const { stepsPerBeat, totalSteps, pageStartStep } = this._pageInfo()

        const isArrow = e.key.startsWith('Arrow')
        const isAction = e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace'
        if (!isArrow && !isAction) return
        e.preventDefault()

        if (isArrow) {
            const dir = e.key.slice(5)
            const initCursor = (step, row) => { if (this._cursorStep < 0) { this._cursorStep = step; this._cursorRow = row } }
            if (dir === 'Left') { initCursor(pageStartStep, TOTAL_KEYS - 1 - Math.floor(TOTAL_KEYS / 2)); this._cursorStep = (this._cursorStep - 1 + totalSteps) % totalSteps }
            else if (dir === 'Right') { initCursor(pageStartStep, TOTAL_KEYS - 1 - Math.floor(TOTAL_KEYS / 2)); this._cursorStep = (this._cursorStep + 1) % totalSteps }
            else if (dir === 'Up') { if (this._cursorRow < 0) { this._cursorRow = TOTAL_KEYS - 1; this._cursorStep = pageStartStep } this._cursorRow = (this._cursorRow + 1) % TOTAL_KEYS }
            else if (dir === 'Down') { if (this._cursorRow < 0) { this._cursorRow = 0; this._cursorStep = pageStartStep } this._cursorRow = (this._cursorRow - 1 + TOTAL_KEYS) % TOTAL_KEYS }
            this._syncCursor()
            return
        }

        if (e.key === 'Enter') {
            if (this._cursorStep < 0 || this._cursorRow < 0) return
            const beat = Math.floor(this._cursorStep / stepsPerBeat)
            const beatStep = this._cursorStep % stepsPerBeat
            const trackPitchOffset = track.pitch ?? 0
            const midi = MIDI_MIN + this._cursorRow
            const relativePitch = midi - MIDDLE_C - trackPitchOffset
            const note = (track.notes ?? []).find(n => n.beat === beat && n.beatStep === beatStep
                && (MIDDLE_C + trackPitchOffset + (n.pitch ?? 0)) === midi)

            if (note) {
                if (this._selNote === note) {
                    mfCmd.deleteNote(track, note)
                    this._clearSelection()
                    playbackEvents.dispatchPatternChange([track])
                    return
                }
                this._selNote = note
            } else {
                this._selNote = mfCmd.addNote(track, beat, beatStep, relativePitch)
                playbackEvents.dispatchPatternChange([track])
            }
            this._applySelection()
            if (this._selNote) playbackEvents.dispatchNoteSelect({ track, trackIdx: this._trackIdx, note: this._selNote, beat, beatStep })
            return
        }

        if (this._selNote && mfCmd) {
            mfCmd.deleteNote(track, this._selNote)
            this._clearSelection()
            playbackEvents.dispatchPatternChange([track])
        }
    }

    _syncCursor() {
        const stepsPerBeat = this._track?.stepsPerBeat ?? 4
        const pageStartStep = this._pageStartBeat * stepsPerBeat
        const pageEndStep = pageStartStep + PAGE_BEATS * stepsPerBeat
        if (this._cursorStep < pageStartStep || this._cursorStep >= pageEndStep) {
            this._pageStartBeat = Math.floor(this._cursorStep / stepsPerBeat / PAGE_BEATS) * PAGE_BEATS
        }
        const track = this._track
        if (!track) return
        const beat = Math.floor(this._cursorStep / stepsPerBeat)
        const beatStep = this._cursorStep % stepsPerBeat
        const trackPitchOffset = track.pitch ?? 0
        const midi = MIDI_MIN + this._cursorRow
        const note = (track.notes ?? []).find(n => n.beat === beat && n.beatStep === beatStep
            && (MIDDLE_C + trackPitchOffset + (n.pitch ?? 0)) === midi)
        this._selNote = note ?? null
        this._applySelection()
        playbackEvents.dispatchNoteSelect(note ? { track, trackIdx: this._trackIdx, note, beat, beatStep } : { track, trackIdx: this._trackIdx, note: null, beat, beatStep })
        this._sync()
    }

    _onWheel(e) {
        if (!this.isVisible || !e.shiftKey) return
        if (e.deltaY > 0 || e.deltaX > 0) this._nextPage()
        else if (e.deltaY < 0 || e.deltaX < 0) this._prevPage()
        e.preventDefault()
    }

    _ensurePlayhead() {
        if (this._playhead && this.container?.contains(this._playhead)) return
        this._playhead = document.createElement('div')
        this._playhead.className = 'pp-pr-playhead'
        this._playhead.style.display = 'none'
        this.container?.querySelector('#pp-piano-grid')?.appendChild(this._playhead)
    }

    _startRafLoop() {
        if (this._rafId) return
        const loop = () => {
            const transport = serviceRegistry.transport
            if (!transport?.isRunning || !this.container || !this.isVisible) {
                this._rafId = null
                if (this._playhead) this._playhead.style.display = 'none'
                this._clearIllumination()
                return
            }
            this._updatePlayhead()
            this._rafId = requestAnimationFrame(loop)
        }
        this._rafId = requestAnimationFrame(loop)
    }

    _stopRafLoop() {
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null }
    }

    _updatePlayhead() {
        const transport = serviceRegistry.transport
        if (!transport?.isRunning) return
        const pattern = appState.patterns[appState.selectedPatternNum]
        const track = this._track
        if (!pattern || !track || !this.container) return
        this._ensurePlayhead()

        const { stepsPerBeat } = this._pageInfo()
        const nbTicks = TICK * (pattern.nbBeats ?? 4)
        if (nbTicks <= 0) return
        const loopTick = (transport.tick ?? 0) % nbTicks
        if (loopTick === this._prevLoopTick && this._playhead.style.display !== 'none') return
        this._prevLoopTick = loopTick

        const absStep = Math.floor(loopTick / TICK) * stepsPerBeat + Math.floor((loopTick % TICK) / (TICK / stepsPerBeat))
        const pageStartStep = this._pageStartBeat * stepsPerBeat
        const pageEndStep = pageStartStep + PAGE_BEATS * stepsPerBeat

        if (absStep < pageStartStep || absStep >= pageEndStep) {
            const newPage = Math.floor(absStep / stepsPerBeat / PAGE_BEATS) * PAGE_BEATS
            if (newPage !== this._pageStartBeat) {
                this._pageStartBeat = newPage
                this._clampPage()
                this._sync()
                this._illuminateStep(absStep, transport.tick)
            }
            if (this._playhead.style.display !== 'none') this._playhead.style.display = 'none'
            return
        }

        if (this._playhead.style.display !== 'block') this._playhead.style.display = 'block'
        this._playhead.style.left = `${(absStep - pageStartStep) * this._cellWidth}px`
        this._playhead.style.width = '2px'
        this._illuminateStep(absStep, transport.tick)
    }

    _illuminateStep(absStep, rawTick) {
        if (rawTick === this._prevLitTick) return
        for (const el of this._litNoteEls) el.classList.remove('playing')
        this._litNoteEls.length = 0
        this._prevLitTick = rawTick
        const gridEl = this.container?.querySelector('#pp-piano-grid')
        if (!gridEl) return
        const track = this._track
        if (!track) return
        const { stepsPerBeat, totalSteps } = this._pageInfo()
        const loopAtStep = track.loopAtStep ?? totalSteps
        const notes = track.notes ?? []
        for (const el of gridEl.querySelectorAll('.pp-pr-note')) {
            const note = notes[parseInt(el.dataset.note, 10)]
            if (!note) continue
            const basePos = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
            if (basePos >= loopAtStep) continue
            const matchesBase = absStep % loopAtStep === basePos
            const matchesSub = this._getSubPositions(note, track, totalSteps).some(s => s.pos < loopAtStep && absStep % loopAtStep === s.pos)
            if (matchesBase || matchesSub) {
                el.classList.add('playing')
                this._litNoteEls.push(el)
            }
        }
    }

    _clearIllumination() {
        for (const el of this._litNoteEls) el.classList.remove('playing')
        this._litNoteEls.length = 0
        this._prevLitTick = -1
    }

    reposition() {
        if (!this.container) return
        const isMobile = isMobileViewport()
        this.container.style.position = 'fixed'
        this.container.style.top = isMobile ? '48px' : '64px'
        this.container.style.left = '0'
        this.container.style.right = 'auto'
        this.container.style.width = isMobile ? '100%' : '79%'
    }
}
