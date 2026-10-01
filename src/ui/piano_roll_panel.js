import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import { serviceRegistry } from '../state/service_registry.js'
import FlatNote from '../model/flatnote.js'
import BasePanel from './base_panel.js'
import { getNoteSubPositions } from '../patterns/note_positions.js'
import { MIDDLE_C, MIDI_MIN, TOTAL_KEYS } from './piano_roll/constants.js'
import { pointToCell, findNoteAt } from './piano_roll/hit_test.js'
import ViewportSection from './piano_roll/viewport_section.js'
import RenderSection from './piano_roll/render_section.js'
import MenuSection from './piano_roll/menu_section.js'
import PlaybackSection from './piano_roll/playback_section.js'
import NoteParams from '../patterns/note_params.js'
import { EVENTS } from '../core/events.js'
import { BEATS_PER_PAGE } from '../core/constants.js'

export default class PianoRollPanel extends BasePanel {
    #track
    #trackIdx
    #cellWidth
    #firstShow
    #resizeObserver
    #selectedNote
    #cursorStep
    #cursorRow
    #keysDirty
    #gridDirty
    #boundOnKeyDown
    #boundOnWheel
    #viewport
    #render
    #menu
    #playback

    constructor() {
        super('piano-roll-panel')
        this.#track = null
        this.#trackIdx = -1
        this.#cellWidth = 24
        this.#firstShow = true
        this.#resizeObserver = null
        this.#selectedNote = null
        this.#cursorStep = -1
        this.#cursorRow = -1
        this.#keysDirty = true
        this.#gridDirty = true
        this.#viewport = new ViewportSection(this)
        this.#render = new RenderSection(this)
        this.#menu = new MenuSection(this)
        this.#playback = new PlaybackSection(this)
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
        this.sub(playbackEvents, EVENTS.NOTE_CHANGE, () => this.syncNotes())
        this.sub(playbackEvents, EVENTS.TRACK_PARAM_CHANGE, () => this.syncNotes())
        this.sub(playbackEvents, EVENTS.PATTERN_STRUCTURE_CHANGE, () => {
            this.#resolveTrack()
            this.#keysDirty = true
            this.#gridDirty = true
            this.sync()
        })
        this.sub(playbackEvents, EVENTS.TRACK_SELECT, (data) => {
            if (!data) return
            const trackChanged = data.track !== this.#track || data.trackIdx !== this.#trackIdx
            this.#track = data.track
            this.#trackIdx = data.trackIdx
            if (this.isVisible && trackChanged) {
                this.#firstShow = true
                this.#keysDirty = true
                this.#gridDirty = true
                this.sync()
            }
        })
        this.sub(playbackEvents, EVENTS.PATTERN_META_CHANGE, () => {
            if (!this.isVisible) return
            this.#viewport.clampPage()
            this.#gridDirty = true
            this.#keysDirty = true
            this.sync()
        })
        this.sub(playbackEvents, EVENTS.PLAYBACK_START, () => this.#playback.start())
        this.sub(playbackEvents, EVENTS.PLAYBACK_STOP, () => {
            this.#playback.stop()
            this.#playback.hidePlayhead()
            this.#playback.resetPrevLoopTick()
        })
        this.listen(this.container, 'click', (e) => {
            const key = /** @type {Element} */ (e.target).closest('.pp-pr-key')
            if (key) {
                this.#playKey(parseInt(key.dataset.midi, 10))
                return
            }
            const gridEl = /** @type {Element} */ (e.target).closest('#pp-piano-grid')
            if (gridEl) this.#onGridClick(e, gridEl)
        })
        this.listen(this.container, 'contextmenu', (e) => this.#menu.onContextMenu(e))
        this.#resizeObserver = new ResizeObserver(() => this.#viewport.onResize())
        this.#boundOnKeyDown = (e) => this.#onKeyDown(e)
        this.#boundOnWheel = (e) => this.#viewport.onWheel(e)
        this.listen(this.container?.querySelector('#pp-pr-prev'), 'click', () => this.#viewport.prevPage())
        this.listen(this.container?.querySelector('#pp-pr-next'), 'click', () => this.#viewport.nextPage())
    }

    #resolveTrack() {
        const pattern = appState.patterns[appState.selectedPatternIdx]
        const idx = appState.selectedTrackIdx
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
            playbackEvents.emit(EVENTS.TRACK_SELECT, { track: this.#track, trackIdx: this.#trackIdx })
        }
        const scrollEl = this.container.querySelector('#pp-piano-scroll')
        if (scrollEl && this.#resizeObserver) {
            this.#resizeObserver.disconnect()
            this.#resizeObserver.observe(scrollEl)
        }
        // Visibility-scoped, not panel-scoped: rebound on every show() and
        // released by hide()/onDestroy(), so they keep manual add/remove.
        document.addEventListener('keydown', this.#boundOnKeyDown)
        this.container?.addEventListener('wheel', this.#boundOnWheel, { passive: false })
        if (serviceRegistry.transport?.isRunning) this.#playback.start()
    }

    hide() {
        super.hide()
        this.#resizeObserver?.disconnect()
        this.#playback.stop()
        this.#playback.hidePlayhead()
        this.#playback.clearIllumination()
        this.#clearSelection()
        this.#menu.hide()
        document.removeEventListener('keydown', this.#boundOnKeyDown)
        this.container?.removeEventListener('wheel', this.#boundOnWheel)
    }

    onDestroy() {
        this.#resizeObserver?.disconnect()
        this.#playback.stop()
        this.#menu.hide()
        if (this.#boundOnKeyDown) document.removeEventListener('keydown', this.#boundOnKeyDown)
    }

    sync() {
        this.#render.sync()
    }

    pageInfo() {
        const track = this.#track
        const pattern = appState.patterns[appState.selectedPatternIdx]
        const stepsPerBeat = track?.stepsPerBeat ?? 4
        const nbBeats = pattern?.nbBeats ?? 4
        const totalSteps = nbBeats * stepsPerBeat
        const pageStartStep = appState.currentPage * BEATS_PER_PAGE * stepsPerBeat
        const pageEndStep = Math.min(pageStartStep + BEATS_PER_PAGE * stepsPerBeat, totalSteps)
        return {
            stepsPerBeat,
            nbBeats,
            totalSteps,
            pageStartStep,
            pageEndStep,
            visibleSteps: pageEndStep - pageStartStep,
        }
    }

    applySelection() {
        if (!this.container) return
        this.container.querySelectorAll('.pp-pr-note.selected').forEach((el) => el.classList.remove('selected'))
        if (!this.#selectedNote) return
        const idx = (this.#track?.notes ?? []).indexOf(this.#selectedNote)
        if (idx < 0) return
        this.container.querySelector(`.pp-pr-note[data-note="${idx}"]`)?.classList.add('selected')
    }

    #clearSelection() {
        this.#selectedNote = null
        this.#cursorStep = -1
        this.#cursorRow = -1
        playbackEvents.emit(EVENTS.NOTE_SELECT, null)
    }

    #onGridClick(e, gridEl) {
        const track = this.#track
        const cmd = serviceRegistry.cmd
        if (!track || !cmd) return
        const cell = pointToCell(e, gridEl, this.#cellWidth, this.pageInfo())
        if (!cell) return
        const { step, row, beat, beatStep } = cell
        const clickedMidi = MIDI_MIN + row
        const relativePitch = clickedMidi - MIDDLE_C - (track.pitch ?? 0)
        const hit = findNoteAt(track, beat, beatStep, clickedMidi)

        if (hit) {
            if (this.#selectedNote === hit) {
                cmd.deleteNote(track, hit)
                this.#clearSelection()
                playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
                playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
            } else {
                this.#selectedNote = hit
                this.#cursorStep = step
                this.#cursorRow = row
                this.applySelection()
                playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx: this.#trackIdx })
                playbackEvents.emit(EVENTS.NOTE_SELECT, { track, trackIdx: this.#trackIdx, note: hit, beat, beatStep })
                serviceRegistry.seq?.simpleBeep(this.#trackIdx, hit)
            }
        } else {
            const newNote = cmd.addNote(track, beat, beatStep, relativePitch)
            this.#selectedNote = newNote
            this.#cursorStep = step
            this.#cursorRow = row
            this.applySelection()
            playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
            playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx: this.#trackIdx })
            playbackEvents.emit(EVENTS.NOTE_SELECT, { track, trackIdx: this.#trackIdx, note: newNote, beat, beatStep })
            serviceRegistry.seq?.simpleBeep(this.#trackIdx, newNote)
        }
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

    #onKeyDown(e) {
        if (!this.isVisible) return
        const track = this.#track
        const pattern = appState.patterns[appState.selectedPatternIdx]
        if (!track || !pattern) return
        const cmd = serviceRegistry.cmd
        const { stepsPerBeat, totalSteps, pageStartStep } = this.pageInfo()

        const isArrow = e.key.startsWith('Arrow')
        const isAction = e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace'
        if (!isArrow && !isAction) return
        e.preventDefault()

        if (isArrow) {
            const dir = e.key.slice(5)
            const initCursor = (step, row) => {
                if (this.#cursorStep < 0) {
                    this.#cursorStep = step
                    this.#cursorRow = row
                }
            }
            if (dir === 'Left') {
                initCursor(pageStartStep, TOTAL_KEYS - 1 - Math.floor(TOTAL_KEYS / 2))
                this.#cursorStep = (this.#cursorStep - 1 + totalSteps) % totalSteps
            } else if (dir === 'Right') {
                initCursor(pageStartStep, TOTAL_KEYS - 1 - Math.floor(TOTAL_KEYS / 2))
                this.#cursorStep = (this.#cursorStep + 1) % totalSteps
            } else if (dir === 'Up') {
                if (this.#cursorRow < 0) {
                    this.#cursorRow = TOTAL_KEYS - 1
                    this.#cursorStep = pageStartStep
                }
                this.#cursorRow = (this.#cursorRow + 1) % TOTAL_KEYS
            } else if (dir === 'Down') {
                if (this.#cursorRow < 0) {
                    this.#cursorRow = 0
                    this.#cursorStep = pageStartStep
                }
                this.#cursorRow = (this.#cursorRow - 1 + TOTAL_KEYS) % TOTAL_KEYS
            }
            this.#syncCursor()
            return
        }

        if (e.key === 'Enter') {
            if (this.#cursorStep < 0 || this.#cursorRow < 0) return
            const { beat, beatStep } = Utils.stepToBeat(this.#cursorStep, stepsPerBeat)
            const midi = MIDI_MIN + this.#cursorRow
            const relativePitch = midi - MIDDLE_C - (track.pitch ?? 0)
            const note = findNoteAt(track, beat, beatStep, midi)

            if (note) {
                if (this.#selectedNote === note) {
                    cmd.deleteNote(track, note)
                    this.#clearSelection()
                    playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
                    playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
                    return
                }
                this.#selectedNote = note
            } else {
                this.#selectedNote = cmd.addNote(track, beat, beatStep, relativePitch)
                playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
                playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
            }
            this.applySelection()
            if (this.#selectedNote)
                playbackEvents.emit(EVENTS.NOTE_SELECT, {
                    track,
                    trackIdx: this.#trackIdx,
                    note: this.#selectedNote,
                    beat,
                    beatStep,
                })
            return
        }

        if (this.#selectedNote && cmd) {
            cmd.deleteNote(track, this.#selectedNote)
            this.#clearSelection()
            playbackEvents.emit(EVENTS.NOTE_CHANGE, [track])
            playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        }
    }

    #syncCursor() {
        const stepsPerBeat = this.#track?.stepsPerBeat ?? 4
        const pageStartStep = appState.currentPage * BEATS_PER_PAGE * stepsPerBeat
        const pageEndStep = pageStartStep + BEATS_PER_PAGE * stepsPerBeat
        if (this.#cursorStep < pageStartStep || this.#cursorStep >= pageEndStep) {
            serviceRegistry.cmd.setCurrentPage(Math.floor(this.#cursorStep / stepsPerBeat / BEATS_PER_PAGE))
            this.#gridDirty = true
        }
        const track = this.#track
        if (!track) return
        const { beat, beatStep } = Utils.stepToBeat(this.#cursorStep, stepsPerBeat)
        const midi = MIDI_MIN + this.#cursorRow
        const note = findNoteAt(track, beat, beatStep, midi)
        this.#selectedNote = note
        this.applySelection()
        playbackEvents.emit(
            EVENTS.NOTE_SELECT,
            note
                ? { track, trackIdx: this.#trackIdx, note, beat, beatStep }
                : { track, trackIdx: this.#trackIdx, note: null, beat, beatStep },
        )
        this.sync()
    }

    // ─── Public API ───────────────────────────────────────────────────────
    /** @returns {number} cell width in pixels */
    get cellWidth() {
        return this.#cellWidth
    }

    /** @returns {Object|null} currently selected note */
    get selectedNote() {
        return this.#selectedNote
    }
    /** @param {Object|null} n */
    set selectedNote(n) {
        this.#selectedNote = n
    }

    /** @returns {number} cursor column step */
    get cursorStep() {
        return this.#cursorStep
    }
    /** @param {number} s */
    set cursorStep(s) {
        this.#cursorStep = s
    }

    /** @returns {number} cursor row */
    get cursorRow() {
        return this.#cursorRow
    }
    /** @param {number} r */
    set cursorRow(r) {
        this.#cursorRow = r
    }

    /** @param {number} w */
    set cellWidth(w) {
        this.#cellWidth = w
    }

    get track() {
        return this.#track
    }

    get trackIdx() {
        return this.#trackIdx
    }

    get firstShow() {
        return this.#firstShow
    }
    /** @param {boolean} v */
    set firstShow(v) {
        this.#firstShow = v
    }

    get keysDirty() {
        return this.#keysDirty
    }
    /** @param {boolean} v */
    set keysDirty(v) {
        this.#keysDirty = v
    }

    get gridDirty() {
        return this.#gridDirty
    }
    /** @param {boolean} v */
    set gridDirty(v) {
        this.#gridDirty = v
    }

    get viewport() {
        return this.#viewport
    }

    get render() {
        return this.#render
    }

    get menu() {
        return this.#menu
    }

    get playback() {
        return this.#playback
    }

    /** Advance to next page of steps. */
    nextPage() {
        this.#viewport.nextPage()
    }

    /** Go back to previous page of steps. */
    prevPage() {
        this.#viewport.prevPage()
    }

    /** Recalculate cell width from container. */
    measureCellWidth() {
        this.#viewport.measureCellWidth()
    }

    /** Handle keyboard event. */
    onKeyDown(e) {
        this.#onKeyDown(e)
    }

    /** Start the playhead animation loop. */
    startRafLoop() {
        this.#playback.start()
    }

    clearSelection() {
        this.#clearSelection()
    }
    ensurePlayhead() {
        this.#playback.ensurePlayhead()
    }
    getSubPositions(note, track, totalSteps) {
        return getNoteSubPositions(note, track, totalSteps)
    }
    illuminateStep(step, tick) {
        this.#playback.illuminateStep(step, tick)
    }
    clearIllumination() {
        this.#playback.clearIllumination()
    }
    syncNotes() {
        this.#render.syncNotes()
    }
}
