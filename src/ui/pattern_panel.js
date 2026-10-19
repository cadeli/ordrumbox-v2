// src/ui/pattern_panel.js — Coordinator
//
// Thin coordinator that delegates rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons.

import { appState } from '../state/app_state.js'
import { playbackEvents, emitStructureChanged } from '../state/event_bus.js'

import { getTracksArray } from '../core/tracks.js'
import BasePanel from './base_panel.js'

import HeaderSection from './pattern_panel/header_section.js'
import ClipboardSection from './pattern_panel/clipboard_section.js'
import SelectionSection from './pattern_panel/selection_section.js'
import KeyboardSection from './pattern_panel/keyboard_section.js'
import ContextMenuSection from './pattern_panel/context_menu_section.js'
import ActionsSection from './pattern_panel/actions_section.js'
import PointerSection from './pattern_panel/pointer_section.js'
import PatternGridDrag from './pattern_panel/pattern_grid_drag.js'
import NoteGauge from './components/note_gauge.js'

import GridSection from './pattern_panel/grid_section.js'
import PlaybackOverlaySection from './pattern_panel/playback_overlay_section.js'
import SyncSection from './pattern_panel/sync_section.js'

export default class PatternPanel extends BasePanel {
    #appState
    #serviceRegistry
    #playbackEvents
    #selectedNote
    #gridTrackIdx
    #focusRowIdx
    #cursorBeat
    #cursorBeatStep
    #header
    #grid
    #overlay
    #sync
    #headerEl
    #tracksEl
    #resizeObserver
    #clipboardSection
    #selection
    #keyboard
    #menuSection
    #actions
    #pointer
    #drag
    #gauge
    #selectedByPointer
    #rangeAnchor

    /**
     * @param {object} [deps]  Optional dependency overrides (DI).
     * @param {typeof import('../state/app_state.js').appState} [deps.appState]
     * @param {typeof import('../state/service_loader.js').serviceRegistry} [deps.serviceRegistry]
     * @param {typeof import('../state/event_bus.js').playbackEvents} [deps.playbackEvents]
     */
    constructor(deps = {}) {
        super('pattern-panel')

        this.#appState = deps.appState ?? appState
        this.#serviceRegistry = deps.serviceRegistry
        this.#playbackEvents = deps.playbackEvents ?? playbackEvents

        this.#selectedNote = null
        this.#gridTrackIdx = -1
        this.#focusRowIdx = -1
        this.#cursorBeat = 0
        this.#cursorBeatStep = 0
        this.#clipboardSection = new ClipboardSection(this)
        this.#rangeAnchor = null

        this.#header = new HeaderSection(this)
        this.#grid = new GridSection(this)
        this.#overlay = new PlaybackOverlaySection(this)
        this.#sync = new SyncSection(this)
        this.#selection = new SelectionSection(this)
        this.#keyboard = new KeyboardSection(this)
        this.#menuSection = new ContextMenuSection(this)
        this.#actions = new ActionsSection(this)
        this.#pointer = new PointerSection(this)
        this.#drag = new PatternGridDrag(this)
        this.#gauge = new NoteGauge(() => this.container, {
            // The grid's hover tooltip describes the same note: it must not
            // compete with the gauge.
            onShow: () => this.#pointer.hideTooltip(),
            resolveAnchor: (note) => this.#resolveCellEl(note),
        })
        this.#selectedByPointer = false
    }

    createDOM() {
        super.createDOM()
        this.container.classList.add('workspace-panel')
        this.container.style.display = 'block'
        this.container.setAttribute('tabindex', '0')
        this.#headerEl = document.createElement('div')
        this.#headerEl.className = 'pp-header-container'
        this.#tracksEl = document.createElement('div')
        this.#tracksEl.className = 'pp-tracks'
        this.container.append(this.#headerEl, this.#tracksEl)
        this.listen(this.container, 'focus', () => this.#keyboard.onFocus())
        this.listen(
            this.container,
            'click',
            (e) => {
                this.container.focus()
                this.#pointer.onClick(/** @type {MouseEvent} */ (e))
            },
            { passive: false },
        )
        this.listen(this.container, 'mousedown', (e) => this.#drag.onMouseDown(/** @type {MouseEvent} */ (e)))
        this.listen(this.container, 'input', (e) => this.#pointer.onInput(e))
        this.listen(this.container, 'keydown', (e) => this.#keyboard.onKeyDown(/** @type {KeyboardEvent} */ (e)))
        this.listen(this.container, 'contextmenu', (e) => this.#menuSection.onContextMenu(/** @type {MouseEvent} */ (e)))
        this.listen(this.container, 'mouseover', (e) => this.#pointer.onMouseOver(/** @type {MouseEvent} */ (e)))
        this.listen(this.container, 'mouseout', (e) => this.#pointer.onMouseOut(/** @type {MouseEvent} */ (e)))
        this.#resizeObserver = new ResizeObserver(() => this.#sync.updateBeatRectsCache())
        this.#resizeObserver.observe(this.container)
    }

    subscribe() {
        this.#sync.subscribe()
    }

    onDestroy() {
        this.#resizeObserver?.disconnect()
        this.#sync.cancel()
        this.#drag.cancel()
        this.#gauge?.hide()
        this.#menuSection?.destroy()
    }

    sync() {
        this.#sync.sync()
    }

    requestSync() {
        this.#sync.requestSync()
    }

    forceSync() {
        this.#sync.forceSync()
    }

    /** @param {number} idx */
    resolveTrack(idx) {
        const pattern = this.#appState.selectedPattern
        const tracks = getTracksArray(pattern)
        return tracks[idx] ?? null
    }

    clearSelection() {
        this.#selection.clearSelection()
    }

    emitStructureChange() {
        emitStructureChanged([], this.#playbackEvents)
    }

    applySelection() {
        this.#selection.applySelection()
    }

    /** @param {number} trackIdx @param {import('../model/track_schema.js').Track} track @param {Partial<import('../model/pattern_schema.js').Pattern>} pattern */
    updateTrackCellsInPlace(trackIdx, track, pattern) {
        this.#sync.updateTrackCellsInPlace(trackIdx, track, pattern)
    }

    /**
     * Repaint after the loop point moved. The model is already updated by the
     * command that emitted LOOP_POINT_CHANGE, so this only redraws.
     * @param {number} trackIdx
     */
    refreshLoopRow(trackIdx) {
        this.#sync.refreshLoopRow(trackIdx)
    }

    /** Invalidate the per-track render cache (call after bulk note changes). */
    markTrackDataDirty() {
        this.#sync.markTrackDataDirty()
    }

    // ─── Public API ───────────────────────────────────────────────────────
    /** @returns {HTMLElement} tracks container element */
    get tracksEl() {
        return this.#tracksEl
    }

    /** @returns {HTMLElement} header container element */
    get headerEl() {
        return this.#headerEl
    }

    /**
     * The track the grid paints as active: the grid selection when there is one,
     * else appState's (the editor's current track).
     *
     * Distinct from gridTrackIdx (-1 = nothing selected in the grid) and from
     * appState.selectedTrackIdx (never -1: the editor always has a current track).
     * @returns {number}
     */
    get effectiveTrackIdx() {
        return this.#gridTrackIdx !== -1 ? this.#gridTrackIdx : (this.#appState.selectedTrackIdx ?? -1)
    }

    /**
     * Row selected *in the grid*, -1 when nothing is: appState.selectedTrackIdx
     * is a different thing and never -1.
     * @returns {number}
     */
    get gridTrackIdx() {
        return this.#gridTrackIdx
    }
    set gridTrackIdx(value) {
        this.#gridTrackIdx = value
    }
    get selectedNote() {
        return this.#selectedNote
    }
    set selectedNote(value) {
        this.#selectedNote = value
    }
    get cursorBeat() {
        return this.#cursorBeat
    }
    set cursorBeat(value) {
        this.#cursorBeat = value
    }
    get cursorBeatStep() {
        return this.#cursorBeatStep
    }
    set cursorBeatStep(value) {
        this.#cursorBeatStep = value
    }
    /**
     * Row the keyboard roving focus sits on (also set by a click on the row name,
     * and used as the paste target), -1 when none.
     * @returns {number}
     */
    get focusRowIdx() {
        return this.#focusRowIdx
    }
    set focusRowIdx(value) {
        this.#focusRowIdx = value
    }
    get clipboard() {
        return this.#clipboardSection.clipboard
    }
    set clipboard(value) {
        this.#clipboardSection.clipboard = value
    }
    get rangeAnchor() {
        return this.#rangeAnchor
    }
    set rangeAnchor(value) {
        this.#rangeAnchor = value
    }
    /** @returns {Map<string, HTMLElement>} cell lookup keyed by "trackIdx:beat:beatStep" */
    get cellMap() {
        return this.#sync.cellMap
    }

    get layoutCache() {
        return this.#sync.layoutCache
    }

    get beatRectsCache() {
        return this.#sync.beatRectsCache
    }

    /**
     * True when the selected note was picked with the pointer (click or drag),
     * not by walking the cursor with the arrows.
     *
     * This is what tells Shift+Arrow the two apart: it edits a note the mouse
     * picked, and keeps extending the range selection when the cursor merely
     * moved over a filled cell (the cursor sync selects that note too).
     * @returns {boolean}
     */
    get selectedByPointer() {
        return this.#selectedByPointer
    }
    /** @param {boolean} v */
    set selectedByPointer(v) {
        this.#selectedByPointer = v
    }

    /** @returns {import('./pattern_panel/header_section.js').default} */
    get header() {
        return this.#header
    }

    /** @returns {import('./pattern_panel/grid_section.js').default} */
    get grid() {
        return this.#grid
    }

    /** @returns {import('./pattern_panel/playback_overlay_section.js').default} */
    get overlay() {
        return this.#overlay
    }

    /** @returns {import('./pattern_panel/selection_section.js').default} */
    get selection() {
        return this.#selection
    }

    /** @returns {import('./pattern_panel/keyboard_section.js').default} */
    get keyboard() {
        return this.#keyboard
    }

    /** @returns {import('./pattern_panel/clipboard_section.js').default} */
    get clipboardSection() {
        return this.#clipboardSection
    }

    /** @returns {import('./pattern_panel/context_menu_section.js').default} */
    get menuSection() {
        return this.#menuSection
    }

    /** @returns {import('./pattern_panel/actions_section.js').default} */
    get actions() {
        return this.#actions
    }

    /** @returns {import('./pattern_panel/pointer_section.js').default} */
    get pointer() {
        return this.#pointer
    }

    /** @returns {import('./pattern_panel/pattern_grid_drag.js').default} */
    get drag() {
        return this.#drag
    }

    /** @returns {import('./components/note_gauge.js').default} */
    get gauge() {
        return this.#gauge
    }

    get appState() {
        return this.#appState
    }
    get serviceRegistry() {
        return this.#serviceRegistry
    }
    get playbackEvents() {
        return this.#playbackEvents
    }

    /**
     * Cell element holding a note, for the editing gauge anchor.
     * @param {Object} note
     * @returns {HTMLElement|null}
     */
    #resolveCellEl(note) {
        const trackIdx = this.#gridTrackIdx
        if (!note || trackIdx < 0) return null
        const beat = note.beat ?? 0
        const beatStep = note.beatStep ?? 0
        return (
            this.#sync.cellMap.get(`${trackIdx}:${beat}:${beatStep}`) ??
            this.container?.querySelector(
                `.pp-cell[data-track="${trackIdx}"][data-beat="${beat}"][data-step="${beatStep}"]`,
            ) ??
            null
        )
    }

    /** Execute a panel action (new, delete, duplicate, etc.) */
    onAction(action) {
        return this.#actions.run(action)
    }
}
