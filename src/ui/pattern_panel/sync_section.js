// src/ui/pattern_panel/sync_section.js
// Sync pipeline of the pattern grid: rAF scheduling, dirty flags, layout
// caches, the cell map and the (re)render path — in-place track-row updates
// or a full rebuild through GridSection.

import { maxPageFor, pageBeatWindow } from '../page_nav.js'
import { getTracksArray } from '../../core/tracks.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { EVENTS } from '../../core/events.js'

const TRIGGER_FLASH_MS = 120

export default class SyncSection {
    #editor
    #syncRafId
    #syncPending
    #cellMap
    #beatRectsCache
    #layoutCache
    #trackDataDirty
    #trackDataCache
    #cachedPage
    #cachedVersion
    #structureSig
    #headerDirty
    #forceFullRender

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#syncRafId = null
        this.#syncPending = false
        this.#cellMap = new Map()
        this.#beatRectsCache = []
        this.#trackDataDirty = true
        this.#trackDataCache = new Map()
        this.#cachedPage = -1
        this.#cachedVersion = -1
        this.#structureSig = ''
        this.#headerDirty = true
        this.#forceFullRender = false
    }

    /** @returns {Map<string, HTMLElement>} cell lookup keyed by "trackIdx:beat:beatStep" */
    get cellMap() {
        return this.#cellMap
    }

    get beatRectsCache() {
        return this.#beatRectsCache
    }

    get layoutCache() {
        return this.#layoutCache
    }

    /** Bus wiring: every handler only flips flags and asks for a sync. */
    subscribe() {
        const editor = this.#editor
        editor.sub(editor.playbackEvents, EVENTS.NOTE_CHANGE, () => this.#onNoteChange())
        editor.sub(editor.playbackEvents, EVENTS.TRACK_PARAM_CHANGE, () => this.#onNoteChange())
        editor.sub(editor.playbackEvents, EVENTS.PATTERN_STRUCTURE_CHANGE, () => this.#onStructureChange())
        editor.sub(editor.playbackEvents, EVENTS.PATTERN_META_CHANGE, () => this.#onStructureChange())
        editor.sub(editor.playbackEvents, EVENTS.DRUMKIT_CHANGE, () => this.#onStructureChange())
        editor.sub(editor.playbackEvents, EVENTS.LOOP_POINT_CHANGE, (data) => {
            if (data && typeof data.trackIdx === 'number' && typeof data.loopAtStep === 'number') {
                editor.refreshLoopRow(data.trackIdx)
            }
        })
        editor.sub(editor.playbackEvents, EVENTS.SELECTED_PATTERN_CHANGE, () => {
            editor.rangeAnchor = null
            const pattern = editor.appState.selectedPattern
            const maxPage = maxPageFor(pattern)
            if (editor.appState.currentPage > maxPage) {
                editor.serviceRegistry.cmd.resetPage()
            }
            this.#forceFullRender = true
            this.#headerDirty = true
            this.#trackDataDirty = true
            editor.requestSync()
        })
        editor.sub(editor.playbackEvents, EVENTS.PLAYBACK_STOP, () => {
            editor.overlay.resetPrevLoopTick()
            editor.overlay.stopRafLoop()
            editor.overlay.hidePlayhead()
            editor.overlay.resetVuAndWaveform()
        })
        editor.sub(editor.playbackEvents, EVENTS.PLAYBACK_START, () => {
            this.updateBeatRectsCache()
            editor.overlay.startRafLoop()
        })
        editor.sub(editor.playbackEvents, EVENTS.NOTE_TRIGGER, (data) => this.#onNoteTrigger(data))
        editor.sub(editor.playbackEvents, EVENTS.TRACK_PARAM_CHANGE, () => {
            editor.overlay.syncVusVisibility()
            this.updateBeatRectsCache()
        })
        editor.sub(editor.playbackEvents, EVENTS.TRACK_SELECT, (data) => this.#onTrackSelect(data))
    }

    #onNoteChange() {
        this.#editor.overlay.resetPrevLoopTick()
        this.#trackDataDirty = true
        this.#editor.requestSync()
    }

    #onStructureChange() {
        this.#editor.overlay.resetPrevLoopTick()
        this.#trackDataDirty = true
        this.#headerDirty = true
        this.#forceFullRender = true
        this.#editor.requestSync()
    }

    /** Flash the triggered cell; the timer id rides on the cell element. */
    #onNoteTrigger(data) {
        const container = this.#editor.container
        if (!container || !data) return
        const cell = this.#cellMap.get(`${data.trackIdx}:${data.beat}:${data.beatStep}`)
        if (!cell) return
        cell.classList.add('pp-triggered')
        clearTimeout(cell._triggerTimer)
        cell._triggerTimer = setTimeout(() => cell.classList.remove('pp-triggered'), TRIGGER_FLASH_MS)
    }

    /** @param {{trackIdx: number}|null} data */
    #onTrackSelect(data) {
        const editor = this.#editor
        if (data) {
            if (editor.gridTrackIdx !== data.trackIdx) {
                editor.selectedNote = null
                editor.selectedByPointer = false
            }
            editor.gridTrackIdx = data.trackIdx
        } else {
            editor.gridTrackIdx = -1
            editor.selectedNote = null
            editor.selectedByPointer = false
        }
        editor.applySelection()
    }

    updateBeatRectsCache() {
        const container = this.#editor.container
        if (!container) return
        this.#beatRectsCache = []
        const tracksEl = container.querySelector('.pp-tracks')
        if (!tracksEl) return

        const containerRect = container.getBoundingClientRect()
        const tracksRect = tracksEl.getBoundingClientRect()
        this.#layoutCache = {
            containerLeft: containerRect.left,
            containerRight: containerRect.right,
            tracksLeft: tracksRect.left,
            tracksHeight: tracksEl.clientHeight,
            tracksOffset: tracksRect.left - containerRect.left,
        }

        const beatEls = container.querySelectorAll('.pp-beat')
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

    /** Shared requestAnimationFrame callback for sync + beat-rects cache update. */
    #scheduleSync() {
        this.#syncRafId = requestAnimationFrame(() => {
            this.#editor.sync()
            this.#syncPending = false
            this.#syncRafId = null
            requestAnimationFrame(() => this.updateBeatRectsCache())
        })
    }

    /** @param {number} trackIdx @param {import('../../model/track_schema.js').Track} track @param {Partial<import('../../model/pattern_schema.js').Pattern>} pattern */
    updateTrackCellsInPlace(trackIdx, track, pattern) {
        const editor = this.#editor
        if (!editor.container || !track || this.#cellMap.size === 0) {
            editor.sync()
            return
        }
        const { startBeat, endBeatPage } = pageBeatWindow(editor.appState.currentPage)

        editor.grid.updateTrackCells(trackIdx, track, pattern, startBeat, endBeatPage, this.#trackDataCache, this.#cellMap)
    }

    /** @param {Partial<import('../../model/pattern_schema.js').Pattern>} pattern @param {import('../../model/track_schema.js').Track[]} tracks */
    #syncCellsInPlace(pattern, tracks) {
        const editor = this.#editor
        const { startBeat, endBeatPage } = pageBeatWindow(editor.appState.currentPage)

        tracks.forEach((track, trackIdx) => {
            if (!track) return
            editor.grid.updateTrackCells(
                trackIdx,
                track,
                pattern,
                startBeat,
                endBeatPage,
                this.#trackDataCache,
                this.#cellMap,
            )

            // Update track-level row classes and properties
            const trackEl = editor.tracksEl?.querySelectorAll('.pp-track:not(.pp-master-track)')?.[trackIdx]
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
                            : track.sampleId && track.sampleId !== 'NOT_DEFINED'
                              ? (soundRegistry.sounds[track.sampleId]?.url ?? track.sampleId)
                              : ''
                    if (urlEl.textContent !== newLabel) {
                        urlEl.textContent = newLabel
                    }
                }
            }
        })

        editor.applySelection()
    }

    sync() {
        const editor = this.#editor
        const container = editor.container
        if (!container) return

        const pattern = editor.appState.selectedPattern
        if (!pattern) {
            editor.headerEl.innerHTML = '<div class="pp-header pp-waiting">Waiting for patterns...</div>'
            editor.tracksEl.innerHTML = ''
            this.#cellMap.clear()
            return
        }

        const tracks = getTracksArray(pattern)

        const { startBeat, endBeatPage } = pageBeatWindow(editor.appState.currentPage)

        if (tracks.length === 0) {
            const prevHeight = container.offsetHeight
            editor.headerEl.innerHTML = editor.header.render(pattern, editor.appState.currentPage)
            editor.tracksEl.innerHTML = `<div class="pp-toolbar-row">
                    <div class="pp-master-track" id="pp-master-btn">
                        <span class="pp-track-name">Master</span>
                        <input type="range" class="pp-master-volume" min="0" max="2" step="0.01" value="1" title="Master Gain">
                    </div>
                    <div class="pp-toolbar-actions">
                        <div class="pp-add-track" id="pp-add-track">+ new track</div>
                    </div>
                </div>`
            this.#cellMap.clear()
            this.#headerDirty = false
            if (prevHeight > 0) {
                container.style.minHeight = prevHeight + 'px'
                requestAnimationFrame(() => {
                    container.style.minHeight = ''
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

        const existingTrackEls = editor.tracksEl?.querySelectorAll('.pp-track:not(.pp-master-track)')
        const canUpdateInPlace =
            !this.#forceFullRender &&
            existingTrackEls &&
            existingTrackEls.length === tracks.length &&
            this.#cachedPage === startBeat &&
            this.#cellMap.size > 0

        if (canUpdateInPlace) {
            if (this.#headerDirty) {
                editor.headerEl.innerHTML = editor.header.render(pattern, editor.appState.currentPage)
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
            editor.headerEl.innerHTML = editor.header.render(pattern, editor.appState.currentPage)
            this.#headerDirty = false
        }

        const tracksHtml = editor.grid.render(tracks, pattern, {
            startBeat,
            endBeatPage,
            effectiveTrackIdx: editor.effectiveTrackIdx,
            cachedPage: this.#cachedPage,
            cachedVersion: this.#cachedVersion,
            trackDataDirty: this.#trackDataDirty,
            trackDataCache: this.#trackDataCache,
        })

        const tmp = document.createElement('div')
        tmp.innerHTML = tracksHtml
        const newTracksInner = tmp.querySelector('.pp-tracks')?.innerHTML

        if (newTracksInner != null) {
            const prevHeight = container.offsetHeight
            editor.tracksEl.innerHTML = newTracksInner
            if (prevHeight > 0) {
                container.style.minHeight = prevHeight + 'px'
                requestAnimationFrame(() => {
                    container.style.minHeight = ''
                })
            }
        }

        editor.grid.applyScrollConstraints(editor.tracksEl, tracks)

        editor.overlay.ensurePlayhead()
        this.#cellMap = editor.grid.buildCellMap(container)
        editor.applySelection()

        editor.overlay.clearCaches()
        editor.overlay.syncVusVisibility()
    }

    /**
     * Repaint after the loop point moved. The model is already updated by the
     * command that emitted LOOP_POINT_CHANGE, so this only redraws.
     * @param {number} trackIdx
     */
    refreshLoopRow(trackIdx) {
        const pattern = this.#editor.appState.selectedPattern
        const tracks = getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (track && this.#cellMap.size > 0) {
            this.updateTrackCellsInPlace(trackIdx, track, pattern)
        } else {
            this.#editor.forceSync()
        }
    }

    /** Invalidate the per-track render cache (call after bulk note changes). */
    markTrackDataDirty() {
        this.#trackDataDirty = true
    }

    /** Panel teardown: drop the pending frame and every cell flash timer. */
    cancel() {
        if (this.#syncRafId) cancelAnimationFrame(this.#syncRafId)
        this.#syncRafId = null
        this.#syncPending = false
        for (const cell of this.#cellMap.values()) {
            if (cell._triggerTimer) {
                clearTimeout(cell._triggerTimer)
                cell._triggerTimer = null
            }
        }
    }
}
