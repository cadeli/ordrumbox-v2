import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import { serviceRegistry } from '../state/service_registry.js'
import FlatNote from '../model/flatnote.js'
import BasePanel from './base_panel.js'
import { TICK } from '../core/constants.js'
import { formatNoteTooltip } from './components/ui_utils.js'
import NoteParams from '../patterns/note_params.js'

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
    #track
    #trackIdx
    #cellWidth
    #firstShow
    #resizeObserver
    #playhead
    #rafId
    #prevLoopTick
    #selNote
    #cursorStep
    #cursorRow
    #prevLitTick
    #litNoteEls
    #keysDirty
    #gridDirty
    #boundOnKeyDown
    #boundOnWheel

    constructor() {
        super('piano-roll-panel')
        this.#track = null
        this.#trackIdx = -1
        this.#cellWidth = 24
        this.#firstShow = true
        this.#resizeObserver = null
        this.#playhead = null
        this.#rafId = null
        this.#prevLoopTick = -1
        this.#selNote = null
        this.#cursorStep = -1
        this.#cursorRow = -1
        this.#prevLitTick = -1
        this.#litNoteEls = []
        this.#keysDirty = true
        this.#gridDirty = true
    }

    createDOM() {
        super.createDOM()
        this.container.classList.add('workspace-panel')
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
        playbackEvents.on("noteChange", () => this.syncNotes())
        playbackEvents.on("trackParamChange", () => this.syncNotes())
        playbackEvents.on("patternStructureChange", () => { this.#resolveTrack(); this.#keysDirty = true; this.#gridDirty = true; this.sync() })
        playbackEvents.on("trackSelect", (data) => {
            if (!data) return
            const trackChanged = data.track !== this.#track || data.trackIdx !== this.#trackIdx
            this.#track = data.track
            this.#trackIdx = data.trackIdx
            if (this.isVisible && trackChanged) {
                this.#firstShow = true
                this.#keysDirty = true
                this.#gridDirty = true
                this.#sync()
            }
        })
        playbackEvents.on("patternMetaChange", () => {
            if (!this.isVisible) return
            this.#clampPage()
            this.#gridDirty = true
            this.#keysDirty = true
            this.#sync()
        })
        playbackEvents.on("playbackStart", () => this.#startRafLoop())
        playbackEvents.on("playbackStop", () => {
            this.#stopRafLoop()
            if (this.#playhead) this.#playhead.style.display = 'none'
            this.#prevLoopTick = -1
        })
        this.container?.addEventListener('click', (e) => {
            const key = e.target.closest('.pp-pr-key')
            if (key) { this.#playKey(parseInt(key.dataset.midi, 10)); return }
            const gridEl = e.target.closest('#pp-piano-grid')
            if (gridEl) this.#onGridClick(e, gridEl)
        })
        this.#resizeObserver = new ResizeObserver(() => this.#onResize())
        this.#boundOnKeyDown = (e) => this.#onKeyDown(e)
        this.#boundOnWheel = (e) => this.#onWheel(e)
        this.container?.querySelector('#pp-pr-prev')?.addEventListener('click', () => this.#prevPage())
        this.container?.querySelector('#pp-pr-next')?.addEventListener('click', () => this.#nextPage())
    }

    #resolveTrack() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        const idx = appState.selectedTrackNum
        const track = Utils.getTracksArray(pattern)?.[idx]
        if (track) {
            this.#track = track
            this.#trackIdx = idx
        }
    }

    show() {
        this.#firstShow = true
        this.#keysDirty = true
        this.#gridDirty = true
        this.#clearSelection()
        this.#resolveTrack()
        this.container.style.display = 'flex'
        this.sync()
        if (this.#track) {
            playbackEvents.emit("trackSelect", { track: this.#track, trackIdx: this.#trackIdx })
        }
        const scrollEl = this.container.querySelector('#pp-piano-scroll')
        if (scrollEl && this.#resizeObserver) {
            this.#resizeObserver.disconnect()
            this.#resizeObserver.observe(scrollEl)
        }
        document.addEventListener('keydown', this.#boundOnKeyDown)
        this.container?.addEventListener('wheel', this.#boundOnWheel, { passive: false })
        if (serviceRegistry.transport?.isRunning) this.#startRafLoop()
    }

    hide() {
        super.hide()
        this.#resizeObserver?.disconnect()
        this.#stopRafLoop()
        if (this.#playhead) this.#playhead.style.display = 'none'
        this.#clearIllumination()
        this.#clearSelection()
        document.removeEventListener('keydown', this.#boundOnKeyDown)
        this.container?.removeEventListener('wheel', this.#boundOnWheel)
    }

    sync() { this.#sync() }

    #onResize() {
        const prev = this.#cellWidth
        this.#measureCellWidth()
        if (this.#cellWidth !== prev) {
            this.#gridDirty = true
            this.#sync()
        }
    }

    #pageInfo() {
        const track = this.#track
        const pattern = appState.patterns[appState.selectedPatternNum]
        const stepsPerBeat = track?.stepsPerBeat ?? 4
        const nbBeats = pattern?.nbBeats ?? 4
        const totalSteps = nbBeats * stepsPerBeat
        const pageStartStep = appState.currentPage * PAGE_BEATS * stepsPerBeat
        const pageEndStep = Math.min(pageStartStep + PAGE_BEATS * stepsPerBeat, totalSteps)
        return { stepsPerBeat, nbBeats, totalSteps, pageStartStep, pageEndStep, visibleSteps: pageEndStep - pageStartStep }
    }

    #sync() {
        if (!this.container) return
        this.#clampPage()
        this.#measureCellWidth()
        if (this.#keysDirty) { this.#renderKeys(); this.#keysDirty = false }
        if (this.#gridDirty) { this.#renderGrid(); this.#gridDirty = false }
        this.#renderLoopPoint()
        this.#renderNotes()
        this.#updateTrackName()
        this.#updatePageInfo()
        if (this.#playhead) {
            this.container.querySelector('#pp-piano-grid')?.appendChild(this.#playhead)
        }
        if (this.#firstShow) {
            this.#scrollToTrackCenter()
            this.#firstShow = false
        }
    }

    #syncNotes() {
        if (!this.container || !this.isVisible) return
        this.#clampPage()
        this.#renderLoopPoint()
        this.#renderNotes()
        if (this.#playhead) {
            this.container.querySelector('#pp-piano-grid')?.appendChild(this.#playhead)
        }
    }

    #updateTrackName() {
        const label = this.container.querySelector('#pp-pr-track-name')
        if (label) label.textContent = this.#track?.name ? ` — ${this.#track.name}` : ''
    }

    #updatePageInfo() {
        const nav = this.container.querySelector('#pp-pr-page-nav')
        const info = this.container.querySelector('#pp-pr-page-info')
        if (!info || !nav) return
        const total = this.#totalPages()
        if (total <= 1) { nav.style.display = 'none'; return }
        nav.style.display = 'flex'
        info.textContent = `${appState.currentPage + 1}/${total}`
        const prev = this.container.querySelector('#pp-pr-prev')
        const next = this.container.querySelector('#pp-pr-next')
        if (prev) prev.disabled = appState.currentPage <= 0
        if (next) next.disabled = appState.currentPage >= total - 1
    }

    #applySelection() {
        if (!this.container) return
        this.container.querySelectorAll('.pp-pr-note.selected').forEach(el => el.classList.remove('selected'))
        if (!this.#selNote) return
        const idx = (this.#track?.notes ?? []).indexOf(this.#selNote)
        if (idx < 0) return
        this.container.querySelector(`.pp-pr-note[data-note="${idx}"]`)?.classList.add('selected')
    }

    #clearSelection() {
        this.#selNote = null
        this.#cursorStep = -1
        this.#cursorRow = -1
        playbackEvents.emit("noteSelect", null)
    }

    #measureCellWidth() {
        const scrollEl = this.container.querySelector('#pp-piano-scroll')
        if (!scrollEl || !this.#track) { this.#cellWidth = 24; return }
        const pageSteps = PAGE_BEATS * (this.#track.stepsPerBeat ?? 4)
        this.#cellWidth = Math.max(MIN_CELL_WIDTH, (scrollEl.clientWidth - KEYS_COLUMN_WIDTH) / pageSteps)
    }

    #renderKeys() {
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

    #renderGrid() {
        const gridEl = this.container.querySelector('#pp-piano-grid')
        if (!gridEl || !this.#track) return
        const { stepsPerBeat, pageStartStep, visibleSteps } = this.#pageInfo()
        const gridWidth = visibleSteps * this.#cellWidth
        gridEl.style.height = `${GRID_HEIGHT}px`
        gridEl.style.width = `${gridWidth}px`

        let html = ''
        for (let s = 0; s < visibleSteps; s++) {
            const stepInBeat = (pageStartStep + s) % stepsPerBeat
            const cls = stepInBeat === 0 ? 'beat' : stepsPerBeat >= 4 && stepInBeat === stepsPerBeat / 2 ? 'half' : 'step'
            html += `<div class="pp-pr-col ${cls}" style="left:${s * this.#cellWidth}px;width:${this.#cellWidth}px"></div>`
        }
        for (let i = 0; i < TOTAL_KEYS; i++) {
            const isC = ((MIDI_MIN + i) % 12 + 12) % 12 === 0
            html += `<div class="pp-pr-row ${isC ? 'octave' : ''}" style="bottom:${i * NOTE_HEIGHT}px;height:${NOTE_HEIGHT}px;width:${gridWidth}px"></div>`
        }
        gridEl.innerHTML = html

        this.#renderLoopPoint(gridEl)
    }

    #renderLoopPoint(gridEl) {
        if (!gridEl) gridEl = this.container?.querySelector('#pp-piano-grid')
        if (!gridEl) return
        gridEl.querySelectorAll('.pp-pr-loop-point').forEach(el => el.remove())
        const track = this.#track
        if (!track) return
        const { pageStartStep, visibleSteps } = this.#pageInfo()
        const loopAtStep = track.loopAtStep ?? (this.#pageInfo().totalSteps)
        if (loopAtStep > pageStartStep && loopAtStep <= pageStartStep + visibleSteps) {
            const lpEl = document.createElement('div')
            lpEl.className = 'pp-pr-loop-point'
            lpEl.style.left = `${(loopAtStep - pageStartStep) * this.#cellWidth}px`
            lpEl.style.height = `${GRID_HEIGHT}px`
            gridEl.appendChild(lpEl)
        }
    }

    #renderNotes() {
        const gridEl = this.container.querySelector('#pp-piano-grid')
        if (!gridEl) return
        gridEl.querySelectorAll('.pp-pr-note, .pp-pr-ghost, .pp-pr-cursor').forEach(n => n.remove())
        const track = this.#track
        if (!track) return
        const { stepsPerBeat, totalSteps, pageStartStep, pageEndStep, visibleSteps } = this.#pageInfo()
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
            el.className = `pp-pr-note${this.#selNote === note ? ' selected' : ''}`
            el.style.left = `${pageStep * this.#cellWidth + 1}px`
            el.style.width = `${this.#cellWidth - 2}px`
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

            this.#getSubPositions(note, track, totalSteps).forEach(({ pos, type, pitchOffset }) => {
                const ghStep = pos - pageStartStep
                if (ghStep < 0 || ghStep >= visibleSteps) return
                const ghRow = row + (pitchOffset ?? 0)
                if (ghRow < 0 || ghRow >= TOTAL_KEYS) return
                const gh = document.createElement('div')
                gh.className = `pp-pr-ghost pp-pr-ghost-${type}`
                gh.style.left = `${ghStep * this.#cellWidth}px`
                gh.style.bottom = `${ghRow * NOTE_HEIGHT}px`
                gh.style.width = `${this.#cellWidth}px`
                gh.style.height = `${NOTE_HEIGHT}px`
                fragment.appendChild(gh)
            })
        })

        if (this.#cursorStep >= pageStartStep && this.#cursorStep < pageEndStep && this.#cursorRow >= 0 && this.#cursorRow < TOTAL_KEYS && !this.#selNote) {
            const cursor = document.createElement('div')
            cursor.className = 'pp-pr-cursor'
            cursor.style.left = `${(this.#cursorStep - pageStartStep) * this.#cellWidth}px`
            cursor.style.bottom = `${this.#cursorRow * NOTE_HEIGHT}px`
            cursor.style.width = `${this.#cellWidth}px`
            cursor.style.height = `${NOTE_HEIGHT}px`
            fragment.appendChild(cursor)
        }

        gridEl.appendChild(fragment)
    }

    #getSubPositions(note, track, totalSteps) {
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const basePos = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
        const retriggerNum = note.retriggerNum ?? 1
        const rate = note.rate ?? 1
        const euclidianFill = note.euclidianFill ?? 0
        const arpConfig = this.#normalizeArp(note.arp)
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

    #normalizeArp(arp) {
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

    #onGridClick(e, gridEl) {
        const track = this.#track
        const cmd = serviceRegistry.cmd
        if (!track || !cmd) return
        const { stepsPerBeat, totalSteps, pageStartStep } = this.#pageInfo()
        const rect = gridEl.getBoundingClientRect()
        const pageStep = Math.floor((e.clientX - rect.left) / this.#cellWidth)
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
            if (this.#selNote === hit) {
                cmd.deleteNote(track, hit)
                this.#clearSelection()
                playbackEvents.emit("noteChange", [track])
                playbackEvents.emit("patternChange", [track])
            } else {
                this.#selNote = hit
                this.#cursorStep = step
                this.#cursorRow = row
                this.#applySelection()
                playbackEvents.emit("trackSelect", { track, trackIdx: this.#trackIdx })
                playbackEvents.emit("noteSelect", { track, trackIdx: this.#trackIdx, note: hit, beat, beatStep })
                serviceRegistry.seq?.simpleBeep(this.#trackIdx, hit)
            }
        } else {
            const newNote = cmd.addNote(track, beat, beatStep, relativePitch)
            this.#selNote = newNote
            this.#cursorStep = step
            this.#cursorRow = row
            this.#applySelection()
            playbackEvents.emit("noteChange", [track])
            playbackEvents.emit("patternChange", [track])
            playbackEvents.emit("trackSelect", { track, trackIdx: this.#trackIdx })
            playbackEvents.emit("noteSelect", { track, trackIdx: this.#trackIdx, note: newNote, beat, beatStep })
            serviceRegistry.seq?.simpleBeep(this.#trackIdx, newNote)
        }
    }

    #scrollToTrackCenter() {
        const scrollEl = this.container.querySelector('#pp-piano-scroll')
        if (!scrollEl) return
        const row = MIDDLE_C + (this.#track?.pitch ?? 0) - MIDI_MIN
        scrollEl.scrollTop = Math.max(0, (TOTAL_KEYS - 1 - row) * NOTE_HEIGHT - scrollEl.clientHeight / 2)
    }

    #playKey(midi) {
        const track = this.#track
        if (!track || Number.isNaN(midi)) return
        const relativePitch = midi - MIDDLE_C - (track.pitch ?? 0)
        const flatNote = new FlatNote(0, track, { ...Utils.NOTE_DEFAULTS, pitch: relativePitch })
        const secondsPerBeat = serviceRegistry.seq?.secondsPerBeat ?? 0.5
        NoteParams.applyNoteParams(flatNote, secondsPerBeat)
        serviceRegistry.audioEngine?.sound?.play(flatNote, serviceRegistry.audioEngine.audioCtx.currentTime)
    }

    #totalPages() {
        if (!this.#track) return 1
        const nbBeats = appState.patterns[appState.selectedPatternNum]?.nbBeats ?? 4
        return Math.max(1, Math.ceil(nbBeats / PAGE_BEATS))
    }

    #clampPage() {
        appState.currentPage = Math.max(0, Math.min(appState.currentPage, this.#totalPages() - 1))
    }

    #prevPage() {
        if (appState.currentPage <= 0) return
        appState.currentPage--
        playbackEvents.batch(() => {
            playbackEvents.emit('patternMetaChange')
            playbackEvents.emit('patternChange')
        })
    }

    #nextPage() {
        if (appState.currentPage >= this.#totalPages() - 1) return
        appState.currentPage++
        playbackEvents.batch(() => {
            playbackEvents.emit('patternMetaChange')
            playbackEvents.emit('patternChange')
        })
    }

    #onKeyDown(e) {
        if (!this.isVisible) return
        const track = this.#track
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!track || !pattern) return
        const cmd = serviceRegistry.cmd
        const { stepsPerBeat, totalSteps, pageStartStep } = this.#pageInfo()

        const isArrow = e.key.startsWith('Arrow')
        const isAction = e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace'
        if (!isArrow && !isAction) return
        e.preventDefault()

        if (isArrow) {
            const dir = e.key.slice(5)
            const initCursor = (step, row) => { if (this.#cursorStep < 0) { this.#cursorStep = step; this.#cursorRow = row } }
            if (dir === 'Left') { initCursor(pageStartStep, TOTAL_KEYS - 1 - Math.floor(TOTAL_KEYS / 2)); this.#cursorStep = (this.#cursorStep - 1 + totalSteps) % totalSteps }
            else if (dir === 'Right') { initCursor(pageStartStep, TOTAL_KEYS - 1 - Math.floor(TOTAL_KEYS / 2)); this.#cursorStep = (this.#cursorStep + 1) % totalSteps }
            else if (dir === 'Up') { if (this.#cursorRow < 0) { this.#cursorRow = TOTAL_KEYS - 1; this.#cursorStep = pageStartStep } this.#cursorRow = (this.#cursorRow + 1) % TOTAL_KEYS }
            else if (dir === 'Down') { if (this.#cursorRow < 0) { this.#cursorRow = 0; this.#cursorStep = pageStartStep } this.#cursorRow = (this.#cursorRow - 1 + TOTAL_KEYS) % TOTAL_KEYS }
            this.#syncCursor()
            return
        }

        if (e.key === 'Enter') {
            if (this.#cursorStep < 0 || this.#cursorRow < 0) return
            const beat = Math.floor(this.#cursorStep / stepsPerBeat)
            const beatStep = this.#cursorStep % stepsPerBeat
            const trackPitchOffset = track.pitch ?? 0
            const midi = MIDI_MIN + this.#cursorRow
            const relativePitch = midi - MIDDLE_C - trackPitchOffset
            const note = (track.notes ?? []).find(n => n.beat === beat && n.beatStep === beatStep
                && (MIDDLE_C + trackPitchOffset + (n.pitch ?? 0)) === midi)

            if (note) {
                if (this.#selNote === note) {
                    cmd.deleteNote(track, note)
                    this.#clearSelection()
                    playbackEvents.emit("noteChange", [track])
                    playbackEvents.emit("patternChange", [track])
                    return
                }
                this.#selNote = note
            } else {
                this.#selNote = cmd.addNote(track, beat, beatStep, relativePitch)
                playbackEvents.emit("noteChange", [track])
                playbackEvents.emit("patternChange", [track])
            }
            this.#applySelection()
            if (this.#selNote) playbackEvents.emit("noteSelect", { track, trackIdx: this.#trackIdx, note: this.#selNote, beat, beatStep })
            return
        }

        if (this.#selNote && cmd) {
            cmd.deleteNote(track, this.#selNote)
            this.#clearSelection()
            playbackEvents.emit("noteChange", [track])
            playbackEvents.emit("patternChange", [track])
        }
    }

    #syncCursor() {
        const stepsPerBeat = this.#track?.stepsPerBeat ?? 4
        const pageStartStep = appState.currentPage * PAGE_BEATS * stepsPerBeat
        const pageEndStep = pageStartStep + PAGE_BEATS * stepsPerBeat
        if (this.#cursorStep < pageStartStep || this.#cursorStep >= pageEndStep) {
            appState.currentPage = Math.floor(this.#cursorStep / stepsPerBeat / PAGE_BEATS)
            this.#gridDirty = true
        }
        const track = this.#track
        if (!track) return
        const beat = Math.floor(this.#cursorStep / stepsPerBeat)
        const beatStep = this.#cursorStep % stepsPerBeat
        const trackPitchOffset = track.pitch ?? 0
        const midi = MIDI_MIN + this.#cursorRow
        const note = (track.notes ?? []).find(n => n.beat === beat && n.beatStep === beatStep
            && (MIDDLE_C + trackPitchOffset + (n.pitch ?? 0)) === midi)
        this.#selNote = note ?? null
        this.#applySelection()
        playbackEvents.emit("noteSelect", note ? { track, trackIdx: this.#trackIdx, note, beat, beatStep } : { track, trackIdx: this.#trackIdx, note: null, beat, beatStep })
        this.#sync()
    }

    #onWheel(e) {
        if (!this.isVisible || !e.shiftKey) return
        if (e.deltaY > 0 || e.deltaX > 0) this.#nextPage()
        else if (e.deltaY < 0 || e.deltaX < 0) this.#prevPage()
        e.preventDefault()
    }

    #ensurePlayhead() {
        if (this.#playhead && this.container?.contains(this.#playhead)) return
        this.#playhead = document.createElement('div')
        this.#playhead.className = 'pp-pr-playhead'
        this.#playhead.style.display = 'none'
        this.container?.querySelector('#pp-piano-grid')?.appendChild(this.#playhead)
    }

    #startRafLoop() {
        if (this.#rafId) return
        const loop = () => {
            const transport = serviceRegistry.transport
            if (!transport?.isRunning || !this.container || !this.isVisible) {
                this.#rafId = null
                if (this.#playhead) this.#playhead.style.display = 'none'
                this.#clearIllumination()
                return
            }
            this.#updatePlayhead()
            this.#rafId = requestAnimationFrame(loop)
        }
        this.#rafId = requestAnimationFrame(loop)
    }

    #stopRafLoop() {
        if (this.#rafId) { cancelAnimationFrame(this.#rafId); this.#rafId = null }
    }

    #updatePlayhead() {
        const transport = serviceRegistry.transport
        if (!transport?.isRunning) return
        const pattern = appState.patterns[appState.selectedPatternNum]
        const track = this.#track
        if (!pattern || !track || !this.container) return
        this.#ensurePlayhead()

        const { stepsPerBeat } = this.#pageInfo()
        const nbTicks = TICK * (pattern.nbBeats ?? 4)
        if (nbTicks <= 0) return
        const loopTick = (transport.tick ?? 0) % nbTicks
        if (loopTick === this.#prevLoopTick && this.#playhead.style.display !== 'none') return
        this.#prevLoopTick = loopTick

        const absStep = Math.floor(loopTick / TICK) * stepsPerBeat + Math.floor((loopTick % TICK) / (TICK / stepsPerBeat))
        const pageStartStep = appState.currentPage * PAGE_BEATS * stepsPerBeat
        const pageEndStep = pageStartStep + PAGE_BEATS * stepsPerBeat

        if (absStep < pageStartStep || absStep >= pageEndStep) {
            const newPage = Math.floor(absStep / stepsPerBeat / PAGE_BEATS)
            if (newPage !== appState.currentPage) {
                appState.currentPage = newPage
                this.#clampPage()
                this.#gridDirty = true
                this.#sync()
                this.#illuminateStep(absStep, transport.tick)
                playbackEvents.emit('patternMetaChange')
            }
            if (this.#playhead.style.display !== 'none') this.#playhead.style.display = 'none'
            return
        }

        if (this.#playhead.style.display !== 'block') this.#playhead.style.display = 'block'
        this.#playhead.style.left = `${(absStep - pageStartStep) * this.#cellWidth}px`
        this.#playhead.style.width = '2px'
        this.#illuminateStep(absStep, transport.tick)
    }

    #illuminateStep(absStep, rawTick) {
        if (rawTick === this.#prevLitTick) return
        for (const el of this.#litNoteEls) el.classList.remove('playing')
        this.#litNoteEls.length = 0
        this.#prevLitTick = rawTick
        const gridEl = this.container?.querySelector('#pp-piano-grid')
        if (!gridEl) return
        const track = this.#track
        if (!track) return
        const { stepsPerBeat, totalSteps } = this.#pageInfo()
        const loopAtStep = track.loopAtStep ?? totalSteps
        const notes = track.notes ?? []
        for (const el of gridEl.querySelectorAll('.pp-pr-note')) {
            const note = notes[parseInt(el.dataset.note, 10)]
            if (!note) continue
            const basePos = (note.beat ?? 0) * stepsPerBeat + (note.beatStep ?? 0)
            if (basePos >= loopAtStep) continue
            const matchesBase = absStep % loopAtStep === basePos
            const matchesSub = this.#getSubPositions(note, track, totalSteps).some(s => s.pos < loopAtStep && absStep % loopAtStep === s.pos)
            if (matchesBase || matchesSub) {
                el.classList.add('playing')
                this.#litNoteEls.push(el)
            }
        }
    }

    #clearIllumination() {
        for (const el of this.#litNoteEls) el.classList.remove('playing')
        this.#litNoteEls.length = 0
        this.#prevLitTick = -1
    }

    // ─── Public API ───────────────────────────────────────────────────────
    /** @returns {number} cell width in pixels */
    get cellWidth() { return this.#cellWidth }

    /** @returns {Object|null} currently selected note */
    get selNote() { return this.#selNote }
    /** @param {Object|null} n */
    set selNote(n) { this.#selNote = n }

    /** @returns {number} cursor column step */
    get cursorStep() { return this.#cursorStep }
    /** @param {number} s */
    set cursorStep(s) { this.#cursorStep = s }

    /** @returns {number} cursor row */
    get cursorRow() { return this.#cursorRow }
    /** @param {number} r */
    set cursorRow(r) { this.#cursorRow = r }

    /** Advance to next page of steps. */
    nextPage() { this.#nextPage() }

    /** Go back to previous page of steps. */
    prevPage() { this.#prevPage() }

    /** Recalculate cell width from container. */
    measureCellWidth() { this.#measureCellWidth() }

    /** Handle keyboard event. */
    onKeyDown(e) { this.#onKeyDown(e) }

    /** Start the playhead animation loop. */
    startRafLoop() { this.#startRafLoop() }

    clearSelection() { this.#clearSelection() }
    ensurePlayhead() { this.#ensurePlayhead() }
    getSubPositions(note, track, totalSteps) { return this.#getSubPositions(note, track, totalSteps) }
    illuminateStep(step, tick) { this.#illuminateStep(step, tick) }
    clearIllumination() { this.#clearIllumination() }
    syncNotes() { this.#syncNotes() }

    get _track() { return this.#track }
    set _track(v) { this.#track = v }
    get _trackIdx() { return this.#trackIdx }
    set _trackIdx(v) { this.#trackIdx = v }
    get _gridDirty() { return this.#gridDirty }
    set _gridDirty(v) { this.#gridDirty = v }

}
