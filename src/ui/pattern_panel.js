// src/ui/pattern_panel.js — Coordinator
//
// Thin coordinator that delegates rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons.

import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { BEATS_PER_PAGE } from '../core/constants.js'
import { maxPageFor } from './page_nav.js'

import Utils from '../core/utils.js'
import BasePanel from './base_panel.js'

import HeaderSection from './pattern_panel/header_section.js'
import ClipboardSection from './pattern_panel/clipboard_section.js'
import SelectionSection from './pattern_panel/selection_section.js'
import KeyboardSection from './pattern_panel/keyboard_section.js'
import ContextMenuSection from './pattern_panel/context_menu_section.js'
import ActionsSection from './pattern_panel/actions_section.js'
import PointerSection from './pattern_panel/pointer_section.js'

const TRIGGER_FLASH_MS = 120
import GridSection from './pattern_panel/grid_section.js'
import PlaybackOverlaySection from './pattern_panel/playback_overlay_section.js'
import { EVENTS } from '../core/events.js'

export default class PatternPanel extends BasePanel {
    #appState
    #serviceRegistry
    #playbackEvents
    #selectedNote
    #gridTrackIdx
    #syncRafId
    #syncPending
    #beatRectsCache
    #focusRowIdx
    #cursorBeat
    #cursorBeatStep
    #cellMap
    #trackDataDirty
    #trackDataCache
    #cachedPage
    #cachedVersion
    #header
    #grid
    #overlay
    #headerDirty
    #forceFullRender
    #structureSig
    #headerEl
    #tracksEl
    #resizeObserver
    #layoutCache
    #clipboardSection
    #selection
    #keyboard
    #menuSection
    #actions
    #pointer
    #rangeAnchor

    /**
     * @param {object} [deps]  Optional dependency overrides (DI).
     * @param {any} [deps.appState]
     * @param {any} [deps.serviceRegistry]
     * @param {any} [deps.playbackEvents]
     */
    constructor(deps = {}) {
        super('pattern-panel')

        this.#appState = deps.appState ?? appState
        this.#serviceRegistry = deps.serviceRegistry ?? serviceRegistry
        this.#playbackEvents = deps.playbackEvents ?? playbackEvents

        this.#selectedNote = null
        this.#gridTrackIdx = -1
        this.#syncRafId = null
        this.#syncPending = false
        this.#beatRectsCache = []
        this.#focusRowIdx = -1
        this.#cursorBeat = 0
        this.#cursorBeatStep = 0
        this.#cellMap = new Map()
        this.#trackDataDirty = true
        this.#trackDataCache = new Map()
        this.#cachedPage = -1
        this.#cachedVersion = -1
        this.#clipboardSection = new ClipboardSection(this)
        this.#rangeAnchor = null

        this.#header = new HeaderSection(this)
        this.#grid = new GridSection(this)
        this.#overlay = new PlaybackOverlaySection(this)
        this.#selection = new SelectionSection(this)
        this.#keyboard = new KeyboardSection(this)
        this.#menuSection = new ContextMenuSection(this)
        this.#actions = new ActionsSection(this)
        this.#pointer = new PointerSection(this)
        this.#headerDirty = true
        this.#forceFullRender = false
        this.#structureSig = ''
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
                this.#pointer.onClick(e)
            },
            { passive: false },
        )
        this.listen(this.container, 'input', (e) => this.#pointer.onInput(e))
        this.listen(this.container, 'keydown', (e) => this.#keyboard.onKeyDown(e))
        this.listen(this.container, 'contextmenu', (e) => this.#menuSection.onContextMenu(e))
        this.listen(this.container, 'mouseover', (e) => this.#pointer.onMouseOver(e))
        this.listen(this.container, 'mouseout', (e) => this.#pointer.onMouseOut(e))
        this.#resizeObserver = new ResizeObserver(() => this.#updateBeatRectsCache())
        this.#resizeObserver.observe(this.container)
    }

    subscribe() {
        const onNoteChange = () => {
            this.#overlay.resetPrevLoopTick()
            this.#trackDataDirty = true
            this.requestSync()
        }
        const onStructureChange = () => {
            this.#overlay.resetPrevLoopTick()
            this.#trackDataDirty = true
            this.#headerDirty = true
            this.#forceFullRender = true
            this.requestSync()
        }
        this.sub(this.#playbackEvents, EVENTS.NOTE_CHANGE, onNoteChange)
        this.sub(this.#playbackEvents, EVENTS.TRACK_PARAM_CHANGE, onNoteChange)
        this.sub(this.#playbackEvents, EVENTS.PATTERN_STRUCTURE_CHANGE, onStructureChange)
        this.sub(this.#playbackEvents, EVENTS.PATTERN_META_CHANGE, onStructureChange)
        this.sub(this.#playbackEvents, EVENTS.DRUMKIT_CHANGE, onStructureChange)
        this.sub(this.#playbackEvents, EVENTS.LOOP_POINT_CHANGE, (data) => {
            if (data && typeof data.trackIdx === 'number' && typeof data.loopAtStep === 'number') {
                this.refreshLoopRow(data.trackIdx)
            }
        })
        this.sub(this.#playbackEvents, EVENTS.SELECTED_PATTERN_CHANGE, () => {
            this.#rangeAnchor = null
            const pattern = this.#appState.selectedPattern
            const maxPage = maxPageFor(pattern)
            if (this.#appState.currentPage > maxPage) {
                this.#serviceRegistry.cmd.resetPage()
            }
            this.#forceFullRender = true
            this.#headerDirty = true
            this.#trackDataDirty = true
            this.requestSync()
        })
        this.sub(this.#playbackEvents, EVENTS.PLAYBACK_STOP, () => {
            this.#overlay.resetPrevLoopTick()
            this.#overlay.stopRafLoop()
            this.#overlay.hidePlayhead()
            this.#overlay.resetVuAndWaveform()
        })
        this.sub(this.#playbackEvents, EVENTS.PLAYBACK_START, () => {
            this.#updateBeatRectsCache()
            this.#overlay.startRafLoop()
        })
        this.sub(this.#playbackEvents, EVENTS.NOTE_TRIGGER, (data) => {
            if (!this.container || !data) return
            const cell = this.#cellMap.get(`${data.trackIdx}:${data.beat}:${data.beatStep}`)
            if (!cell) return
            cell.classList.add('pp-triggered')
            clearTimeout(cell._triggerTimer)
            cell._triggerTimer = setTimeout(() => cell.classList.remove('pp-triggered'), TRIGGER_FLASH_MS)
        })
        this.sub(this.#playbackEvents, EVENTS.TRACK_PARAM_CHANGE, () => {
            this.#overlay.syncVusVisibility()
            this.#updateBeatRectsCache()
        })
        this.sub(this.#playbackEvents, EVENTS.TRACK_SELECT, (data) => {
            if (data) {
                if (this.#gridTrackIdx !== data.trackIdx) {
                    this.#selectedNote = null
                }
                this.#gridTrackIdx = data.trackIdx
            } else {
                this.#gridTrackIdx = -1
                this.#selectedNote = null
            }
            this.applySelection()
        })
    }

    onDestroy() {
        this.#resizeObserver?.disconnect()
        if (this.#syncRafId) cancelAnimationFrame(this.#syncRafId)
        this.#syncRafId = null
        this.#syncPending = false
        this.#menuSection?.destroy()
    }

    #updateBeatRectsCache() {
        if (!this.container) return
        this.#beatRectsCache = []
        const tracksEl = this.container.querySelector('.pp-tracks')
        if (!tracksEl) return

        const containerRect = this.container.getBoundingClientRect()
        const tracksRect = tracksEl.getBoundingClientRect()
        this.#layoutCache = {
            containerLeft: containerRect.left,
            containerRight: containerRect.right,
            tracksLeft: tracksRect.left,
            tracksHeight: tracksEl.clientHeight,
            tracksOffset: tracksRect.left - containerRect.left,
        }

        const beatEls = this.container.querySelectorAll('.pp-beat')
        beatEls.forEach((el) => {
            const r = el.getBoundingClientRect()
            this.#beatRectsCache[parseInt(/** @type {HTMLElement} */ (el).dataset.beat)] = {
                left: r.left - this.#layoutCache.tracksLeft,
                absLeft: r.left,
                absRight: r.right,
                width: r.width,
            }
        })
    }

    requestSync() {
        if (this.#syncPending) return
        this.#syncPending = true
        this.#scheduleSync()
    }

    forceSync() {
        this.#forceFullRender = true
        if (this.#syncRafId) cancelAnimationFrame(this.#syncRafId)
        this.#syncPending = false
        this.#scheduleSync()
    }

    /** Shared requestAnimationFrame callback for sync + bar cache update. */
    #scheduleSync() {
        this.#syncRafId = requestAnimationFrame(() => {
            this.sync()
            this.#syncPending = false
            this.#syncRafId = null
            requestAnimationFrame(() => this.#updateBeatRectsCache())
        })
    }

    resolveTrack(idx) {
        const pattern = this.#appState.selectedPattern
        const tracks = Utils.getTracksArray(pattern)
        return tracks[idx] ?? null
    }

    clearSelection() {
        this.#selection.clearSelection()
    }

    emitStructureChange() {
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    applySelection() {
        this.#selection.applySelection()
    }

    updateTrackCellsInPlace(trackIdx, track, pattern) {
        if (!this.container || !track || this.#cellMap.size === 0) {
            this.sync()
            return
        }
        const startBeat = this.#appState.currentPage * BEATS_PER_PAGE
        const endBeatPage = startBeat + BEATS_PER_PAGE

        this.#grid.updateTrackCells(
            trackIdx,
            track,
            pattern,
            startBeat,
            endBeatPage,
            this.#trackDataCache,
            this.#cellMap,
        )
    }

    #syncCellsInPlace(pattern, tracks) {
        const startBeat = this.#appState.currentPage * BEATS_PER_PAGE
        const endBeatPage = startBeat + BEATS_PER_PAGE

        tracks.forEach((track, tIdx) => {
            if (!track) return
            this.#grid.updateTrackCells(
                tIdx,
                track,
                pattern,
                startBeat,
                endBeatPage,
                this.#trackDataCache,
                this.#cellMap,
            )

            // Update track-level row classes and properties
            const trackEl = this.#tracksEl?.querySelectorAll('.pp-track:not(.pp-master-track)')?.[tIdx]
            if (trackEl) {
                const isMuted = track.mute === true
                const isSolo = track.solo === true
                trackEl.classList.toggle('pp-muted', isMuted)

                const divider = trackEl.querySelector('.pp-divider')
                divider?.classList.toggle('muted', isMuted)

                const solo = trackEl.querySelector('.pp-solo')
                solo?.classList.toggle('active', isSolo)

                const volInput = trackEl.querySelector('.pp-volume')
                if (volInput && document.activeElement !== volInput) {
                    volInput.value = track.velocity ?? 1
                }

                const nameEl = trackEl.querySelector('.pp-track-name')
                if (nameEl && track.name && nameEl.textContent !== track.name) {
                    nameEl.textContent = track.name
                }

                const urlEl = trackEl.querySelector('.pp-track-url')
                if (urlEl) {
                    const newLabel =
                        track.useSoftSynth && track.synthSoundKey
                            ? `SYNTH: ${track.synthSoundKey}`
                            : track.soundId && track.soundId !== 'NOT_DEFINED'
                              ? (soundRegistry.sounds[track.soundId]?.url ?? track.soundId)
                              : ''
                    if (urlEl.textContent !== newLabel) {
                        urlEl.textContent = newLabel
                    }
                }
            }
        })

        this.applySelection()
    }

    sync() {
        if (!this.container) return

        const pattern = this.#appState.selectedPattern
        if (!pattern) {
            this.#headerEl.innerHTML = '<div class="pp-header pp-waiting">Waiting for patterns...</div>'
            this.#tracksEl.innerHTML = ''
            this.#cellMap.clear()
            return
        }

        const tracks = Utils.getTracksArray(pattern)

        const startBeat = this.#appState.currentPage * BEATS_PER_PAGE
        const endBeatPage = startBeat + BEATS_PER_PAGE

        if (tracks.length === 0) {
            const prevHeight = this.container.offsetHeight
            this.#headerEl.innerHTML = this.#header.render(pattern, this.#appState.currentPage)
            this.#tracksEl.innerHTML = `<div class="pp-tracks">
                <div class="pp-toolbar-row">
                    <div class="pp-master-track" id="pp-master-btn">
                        <span class="pp-track-name">Master</span>
                        <input type="range" class="pp-master-volume" min="0" max="2" step="0.01" value="1" title="Master Gain">
                    </div>
                    <div class="pp-add-track" id="pp-add-track">+ new track</div>
                </div>
            </div>`
            this.#cellMap.clear()
            this.#headerDirty = false
            if (prevHeight > 0) {
                this.container.style.minHeight = prevHeight + 'px'
                requestAnimationFrame(() => {
                    this.container.style.minHeight = ''
                })
            }
            return
        }

        // Structure (stepsPerBeat/beatCount) can change via TRACK_PARAM_CHANGE or
        // undo without PATTERN_META_CHANGE — detect it and force a full rebuild
        // so the DOM cell count per beat matches the track.
        const structureSig = `${pattern.beatCount ?? 4}|${tracks
            .map((t) => `${t?.stepsPerBeat ?? 4}:${t?.beatCount ?? 4}`)
            .join(',')}`
        if (structureSig !== this.#structureSig) {
            this.#structureSig = structureSig
            this.#forceFullRender = true
            this.#headerDirty = true
        }

        const existingTrackEls = this.#tracksEl?.querySelectorAll('.pp-track:not(.pp-master-track)')
        const canUpdateInPlace =
            !this.#forceFullRender &&
            existingTrackEls &&
            existingTrackEls.length === tracks.length &&
            this.#cachedPage === startBeat &&
            this.#cellMap.size > 0

        if (canUpdateInPlace) {
            if (this.#headerDirty) {
                this.#headerEl.innerHTML = this.#header.render(pattern, this.#appState.currentPage)
                this.#headerDirty = false
            }
            this.#syncCellsInPlace(pattern, tracks)
            return
        }

        this.#forceFullRender = false
        this.#cellMap.clear()

        const patternVersion = pattern._revision ?? 0
        this.#trackDataCache.clear()
        this.#cachedVersion = patternVersion
        this.#cachedPage = startBeat
        this.#trackDataDirty = false

        if (this.#headerDirty) {
            this.#headerEl.innerHTML = this.#header.render(pattern, this.#appState.currentPage)
            this.#headerDirty = false
        }

        const tracksHtml = this.#grid.render(tracks, pattern, {
            startBeat,
            endBeatPage,
            effectiveTrackIdx: this.effectiveTrackIdx,
            cachedPage: this.#cachedPage,
            cachedVersion: this.#cachedVersion,
            trackDataDirty: this.#trackDataDirty,
            trackDataCache: this.#trackDataCache,
        })

        const tmp = document.createElement('div')
        tmp.innerHTML = tracksHtml
        const newTracksInner = tmp.querySelector('.pp-tracks')?.innerHTML

        if (newTracksInner != null) {
            const prevHeight = this.container.offsetHeight
            this.#tracksEl.innerHTML = newTracksInner
            if (prevHeight > 0) {
                this.container.style.minHeight = prevHeight + 'px'
                requestAnimationFrame(() => {
                    this.container.style.minHeight = ''
                })
            }
        }

        this.#grid.applyScrollConstraints(this.#tracksEl, tracks)

        this.#overlay.ensurePlayhead()
        this.#cellMap = this.#grid.buildCellMap(this.container)
        this.applySelection()

        this.#overlay.clearCaches()
        this.#overlay.syncVusVisibility()
    }

    /**
     * Repaint after the loop point moved. The model is already updated by the
     * command that emitted LOOP_POINT_CHANGE, so this only redraws.
     * @param {number} trackIdx
     */
    refreshLoopRow(trackIdx) {
        const pattern = this.#appState.selectedPattern
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (track && this.#cellMap.size > 0) {
            this.updateTrackCellsInPlace(trackIdx, track, pattern)
        } else {
            this.forceSync()
        }
    }

    // ─── Public API ───────────────────────────────────────────────────────
    /** @returns {HTMLElement} tracks container element */
    get tracksEl() {
        return this.#tracksEl
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
        return this.#cellMap
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

    /** Invalidate the per-track render cache (call after bulk note changes). */
    markTrackDataDirty() {
        this.#trackDataDirty = true
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
    get layoutCache() {
        return this.#layoutCache
    }
    get beatRectsCache() {
        return this.#beatRectsCache
    }

    /** Execute a panel action (new, delete, duplicate, etc.) */
    onAction(action) {
        return this.#actions.run(action)
    }
}
