// src/ui/pattern_panel.js — Coordinator
//
// Thin coordinator that delegates rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons for backward compatibility.

import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { isMobileViewport, BEATS_PER_PAGE } from '../core/constants.js'

import Utils from '../core/utils.js'
import BasePanel from './base_panel.js'
import { logger } from "../core/logger.js"
import { downloadJson, pitchToNoteName, formatNoteTooltip } from './components/panel_helpers.js'

import HeaderSection from './pattern_panel/header_section.js'
import GridSection from './pattern_panel/grid_section.js'
import PlaybackOverlaySection from './pattern_panel/playback_overlay_section.js'

export default class PatternPanel extends BasePanel {
    /**
     * @param {object} [deps]  Optional dependency overrides (DI).
     */
    constructor(deps = {}) {
        super('pattern-panel')

        this._appState = deps.appState ?? appState
        this._serviceRegistry = deps.serviceRegistry ?? serviceRegistry
        this._playbackEvents = deps.playbackEvents ?? playbackEvents

        this._selNote = null
        this._selTrackIdx = -1
        this._syncRafId = null
        this._syncPending = false
        this._beatRectsCache = []
        this._cursorTrackIdx = -1
        this._cursorBeat = 0
        this._cursorBeatStep = 0
        this._cellMap = new Map()
        this._trackDataDirty = true
        this._trackDataCache = new Map()
        this._cachedPage = -1
        this._cachedVersion = -1

        this._header = new HeaderSection(this)
        this._grid = new GridSection(this)
        this._overlay = new PlaybackOverlaySection(this)
        this._headerDirty = true
        this._forceFullRender = false
    }

    createDOM() {
        super.createDOM()
        this.container.style.display = 'block'
        this.container.setAttribute('tabindex', '0')
        this._headerEl = document.createElement('div')
        this._headerEl.className = 'pp-header-container'
        this._tracksEl = document.createElement('div')
        this._tracksEl.className = 'pp-tracks'
        this.container.append(this._headerEl, this._tracksEl)
        this.container.addEventListener('focus', () => this._onFocus())
        this.container.addEventListener('click', (e) => {
            this.container.focus()
            this._onClick(e)
        }, { passive: false })
        this.container.addEventListener('input', (e) => this._onInput(e))
        this.container.addEventListener('keydown', (e) => this._onKeyDown(e))
        this.container.addEventListener('mouseover', (e) => this._onMouseOver(e))
        this.container.addEventListener('mouseout', (e) => this._onMouseOut(e))
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => this._updateBarCache())
            this._resizeObserver.observe(this.container)
        }
    }

    _ensureTooltip() {
        if (!this._tooltip || !this.container.contains(this._tooltip)) {
            if (this._tooltip) this._tooltip.remove()
            this._tooltip = document.createElement('div')
            this._tooltip.className = 'pp-tooltip'
            this._tooltip.style.display = 'none'
            this.container.appendChild(this._tooltip)
        }
    }

    _onMouseOver(e) {
        const cell = e.target.closest('.pp-cell.filled')
        if (!cell) return
        const trackIdx = parseInt(cell.dataset.track, 10)
        const beat = parseInt(cell.dataset.beat, 10)
        const beatStep = parseInt(cell.dataset.step, 10)
        if (isNaN(trackIdx) || isNaN(beat) || isNaN(beatStep)) return

        const pattern = this._appState.patterns[this._appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (!track) return

        const notesAtStep = (track.notes ?? []).filter(n => n.beat === beat && n.beatStep === beatStep)
        if (notesAtStep.length === 0) return

        const sliceEl = e.target.closest('.pp-note-slice')
        const noteIdx = sliceEl ? parseInt(sliceEl.dataset.noteIdx, 10) : 0
        const note = notesAtStep[Math.min(noteIdx, notesAtStep.length - 1)]

        const trackPitch = track.pitch ?? 0

        this._ensureTooltip()
        this._tooltip.textContent = formatNoteTooltip(note, trackPitch)
        this._tooltip.style.display = 'block'

        const rect = (sliceEl ?? cell).getBoundingClientRect()
        const containerRect = this.container.getBoundingClientRect()
        this._tooltip.style.left = `${rect.left - containerRect.left + rect.width / 2 - this._tooltip.offsetWidth / 2}px`
        this._tooltip.style.top = `${rect.top - containerRect.top - this._tooltip.offsetHeight - 4}px`
    }

    _onMouseOut(e) {
        const cell = e.target.closest('.pp-cell.filled')
        if (!cell) return
        if (this._tooltip) this._tooltip.style.display = 'none'
    }

    subscribe() {
        const onNoteChange = () => {
            this._overlay.resetPrevLoopTick()
            this._trackDataDirty = true
            this.requestSync()
        }
        const onStructureChange = () => {
            this._overlay.resetPrevLoopTick()
            this._trackDataDirty = true
            this._headerDirty = true
            this._forceFullRender = true
            this.requestSync()
        }
        this._playbackEvents.on('noteChange', onNoteChange)
        this._playbackEvents.on('trackParamChange', onNoteChange)
        this._playbackEvents.on('patternStructureChange', onStructureChange)
        this._playbackEvents.on('patternMetaChange', onStructureChange)
        this._playbackEvents.on('loopPointChange', (data) => {
            if (data && typeof data.trackIdx === 'number' && typeof data.loopAtStep === 'number') {
                this.updateLoopPoint(data.trackIdx, data.loopAtStep)
            }
        })
        this._playbackEvents.on('playbackStop', () => {
            this._overlay.resetPrevLoopTick()
            this._overlay.stopRafLoop()
            this._overlay.hidePlayhead()
            this._overlay._resetVuAndWaveform()
        })
        this._playbackEvents.on('playbackStart', () => {
            this._updateBarCache()
            this._overlay.startRafLoop()
        })
        this._playbackEvents.on('noteTrigger', (data) => {
            if (!this.container || !data) return
            const cell = this._cellMap.get(`${data.trackIdx}:${data.beat}:${data.beatStep}`)
            if (!cell) return
            cell.classList.add('pp-triggered')
            clearTimeout(cell._triggerTimer)
            cell._triggerTimer = setTimeout(() => cell.classList.remove('pp-triggered'), 120)
        })
        this._playbackEvents.on('trackParamChange', () => {
            this._overlay.syncVusVisibility()
            this._updateBarCache()
        })
        this._playbackEvents.on('trackSelect', (data) => {
            if (data) {
                if (this._selTrackIdx !== data.trackIdx) {
                    this._selNote = null
                }
                this._selTrackIdx = data.trackIdx
            } else {
                this._selTrackIdx = -1
                this._selNote = null
            }
            this._applySelection()
        })
    }

    _updateBarCache() {
        if (!this.container) return
        this._beatRectsCache = []
        const tracksEl = this.container.querySelector('.pp-tracks')
        if (!tracksEl) return

        const containerRect = this.container.getBoundingClientRect()
        const tracksRect = tracksEl.getBoundingClientRect()
        this._layoutCache = {
            containerLeft: containerRect.left,
            containerRight: containerRect.right,
            tracksLeft: tracksRect.left,
            tracksHeight: tracksEl.clientHeight,
            tracksOffset: tracksRect.left - containerRect.left
        }

        const beatEls = this.container.querySelectorAll('.pp-beat')
        beatEls.forEach(el => {
            const r = el.getBoundingClientRect()
            this._beatRectsCache[parseInt(el.dataset.beat)] = {
                left: r.left - this._layoutCache.tracksLeft,
                absLeft: r.left,
                absRight: r.right,
                width: r.width
            }
        })
    }

    requestSync() {
        if (this._syncPending) return
        this._syncPending = true
        this._syncRafId = requestAnimationFrame(() => {
            this.sync()
            this._syncPending = false
            this._syncRafId = null
            requestAnimationFrame(() => this._updateBarCache())
        })
    }

    forceSync() {
        this._forceFullRender = true
        if (this._syncRafId) cancelAnimationFrame(this._syncRafId)
        this._syncPending = false
        this._syncRafId = requestAnimationFrame(() => {
            this.sync()
            this._syncPending = false
            this._syncRafId = null
            requestAnimationFrame(() => this._updateBarCache())
        })
    }

    _onFocus() {
        if (this._cursorTrackIdx === -1) {
            const pattern = this._appState.patterns[this._appState.selectedPatternNum]
            if (!pattern) return
            const tracks = Utils.getTracksArray(pattern)
            if (tracks.length === 0) return
            this._cursorTrackIdx = 0
            this._cursorBeat = 0
            this._cursorBeatStep = 0
            this._applySelection()
        }
    }

    _onKeyDown(e) {
        const pattern = this._appState.patterns[this._appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        if (tracks.length === 0) return

        if (this._cursorTrackIdx === -1) {
            this._cursorTrackIdx = 0
            this._cursorBeat = 0
            this._cursorBeatStep = 0
        }

        const stepsPerBeat = tracks[this._cursorTrackIdx]?.stepsPerBeat ?? 4
        const nbBeats = pattern.nbBeats ?? 4

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault()
                this._cursorBeatStep++
                if (this._cursorBeatStep >= stepsPerBeat) {
                    this._cursorBeatStep = 0
                    this._cursorBeat++
                    if (this._cursorBeat >= nbBeats) {
                        this._cursorBeat = 0
                    }
                }
                break
            case 'ArrowLeft':
                e.preventDefault()
                this._cursorBeatStep--
                if (this._cursorBeatStep < 0) {
                    this._cursorBeatStep = stepsPerBeat - 1
                    this._cursorBeat--
                    if (this._cursorBeat < 0) {
                        this._cursorBeat = nbBeats - 1
                    }
                }
                break
            case 'ArrowUp':
                e.preventDefault()
                if (this._cursorTrackIdx > 0) this._cursorTrackIdx--
                break
            case 'ArrowDown':
                e.preventDefault()
                if (this._cursorTrackIdx < tracks.length - 1) this._cursorTrackIdx++
                break
            case 'Enter':
                e.preventDefault()
                {
                    const track = tracks[this._cursorTrackIdx]
                    if (!track) return

                    const cell = this._cellMap.get(`${this._cursorTrackIdx}:${this._cursorBeat}:${this._cursorBeatStep}`)
                    if (cell) {
                        const notesAtStep = (track.notes ?? []).filter(n => n.beat === this._cursorBeat && n.beatStep === this._cursorBeatStep)
                        if (notesAtStep.length > 0) {
                            const note = notesAtStep[0]
                            if (this._selNote === note && this._selTrackIdx === this._cursorTrackIdx) {
                                this._serviceRegistry.cmd.deleteNote(track, note)
                                this._clearSelection()
                                this._updateTrackCellsInPlace(this._cursorTrackIdx, track, pattern)
                            } else {
                                this._selNote = note
                                this._selTrackIdx = this._cursorTrackIdx
                                this._applySelection()
                                const pos = this._cursorBeat * (track.stepsPerBeat ?? 4) + this._cursorBeatStep
                                this._playbackEvents.emit('noteSelect', { track, trackIdx: this._cursorTrackIdx, note, pos, beat: this._cursorBeat, beatStep: this._cursorBeatStep })
                                this._serviceRegistry.seq?.simpleBeep(this._cursorTrackIdx, note)
                            }
                        } else {
                            const newNote = this._serviceRegistry.cmd.addNote(track, this._cursorBeat, this._cursorBeatStep)
                            this._selNote = newNote
                            this._selTrackIdx = this._cursorTrackIdx
                            this._updateTrackCellsInPlace(this._cursorTrackIdx, track, pattern)
                            this._applySelection()

                            const pos = this._cursorBeat * (track.stepsPerBeat ?? 4) + this._cursorBeatStep
                            this._playbackEvents.emit('noteSelect', { track, trackIdx: this._cursorTrackIdx, note: newNote, pos, beat: this._cursorBeat, beatStep: this._cursorBeatStep })
                            this._serviceRegistry.seq?.simpleBeep(this._cursorTrackIdx, newNote)
                        }
                    }
                }
                break
            default:
                return
        }

        const track = tracks[this._cursorTrackIdx]
        if (!track) return

        const startBeat = this._appState.currentPage * BEATS_PER_PAGE
        if (this._cursorBeat < startBeat || this._cursorBeat >= startBeat + BEATS_PER_PAGE) {
            this._appState.currentPage = Math.floor(this._cursorBeat / BEATS_PER_PAGE)
            this.sync()
        }

        const note = (track.notes ?? []).find(n => n.beat === this._cursorBeat && n.beatStep === this._cursorBeatStep)
        this._selNote = note ?? null
        this._selTrackIdx = this._cursorTrackIdx
        this._applySelection()
        if (note) {
            this._playbackEvents.emit('noteSelect', { track, trackIdx: this._cursorTrackIdx, note, pos: this._cursorBeat * stepsPerBeat + this._cursorBeatStep, beat: this._cursorBeat, beatStep: this._cursorBeatStep })
            this._serviceRegistry.seq?.simpleBeep(this._cursorTrackIdx, note)
        } else {
            this._playbackEvents.emit('noteSelect', { track, trackIdx: this._cursorTrackIdx, note: null, beat: this._cursorBeat, beatStep: this._cursorBeatStep })
        }
    }

    _resolveTrack(idx) {
        const pattern = this._appState.patterns[this._appState.selectedPatternNum]
        const tracks = Utils.getTracksArray(pattern)
        return tracks[idx] ?? null
    }

    _selectTrack(trackIdx) {
        const track = this._resolveTrack(trackIdx)
        if (!track) return
        this._cursorTrackIdx = trackIdx

        if (this._selTrackIdx === trackIdx && !this._selNote) {
            if (isMobileViewport()) {
                this._playbackEvents.emit('trackSelect', { track, trackIdx })
            } else {
                this._clearSelection()
            }
        } else {
            this._selNote = null
            this._selTrackIdx = trackIdx
            this._applySelection()
            this._playbackEvents.emit('trackSelect', { track, trackIdx })
            this._serviceRegistry.seq?.simpleBeep(trackIdx)
        }
    }

    _toggleTrackProp(idx, prop) {
        const track = this._resolveTrack(idx)
        if (!track) return
        track[prop] = track[prop] !== true

        const trackEl = this.container.querySelector(`.pp-track-name[data-track="${idx}"]`)?.closest('.pp-track')
        if (trackEl) {
            if (prop === 'mute') {
                const isMuted = track.mute === true
                trackEl.classList.toggle('pp-muted', isMuted)
                const divider = trackEl.querySelector('.pp-divider')
                divider?.classList.toggle('muted', isMuted)
            } else if (prop === 'solo') {
                const isSolo = track.solo === true
                const solo = trackEl.querySelector('.pp-solo')
                solo?.classList.toggle('active', isSolo)
            }
        }
        this._playbackEvents.emit('trackParamChange', track)
        this._playbackEvents.emit('patternChange')
    }

    _onClick(e) {
        const actionBtn = e.target.closest('.pp-action-btn')
        if (actionBtn) {
            this._onAction(actionBtn.dataset.ppAction)
            return
        }

        const masterTrackEl = e.target.closest('.pp-master-track')
        if (masterTrackEl) {
            this._playbackEvents.emit('outputToggle', true)
            return
        }

        const trackEl = e.target.closest('.pp-track')
        if (trackEl && !e.target.closest('.pp-track-name') && !e.target.closest('.pp-divider') && !e.target.closest('.pp-solo') && !e.target.closest('.pp-cell') && !e.target.closest('.pp-volume')) {
            const trackIdx = parseInt(trackEl.querySelector('.pp-track-name')?.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this._selectTrack(trackIdx)
            return
        }

        const trackNameEl = e.target.closest('.pp-track-name')
        if (trackNameEl) {
            const trackIdx = parseInt(trackNameEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this._selectTrack(trackIdx)
            return
        }

        const dividerEl = e.target.closest('.pp-divider')
        if (dividerEl) {
            const trackIdx = parseInt(dividerEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this._toggleTrackProp(trackIdx, 'mute')
            return
        }

        const soloEl = e.target.closest('.pp-solo')
        if (soloEl) {
            const trackIdx = parseInt(soloEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this._toggleTrackProp(trackIdx, 'solo')
            return
        }

        if (e.target.closest('#pp-add-track')) {
            const pattern = this._appState.patterns[this._appState.selectedPatternNum]
            if (!pattern) return
            const trackNum = (Utils.getTracksArray(pattern).length) + 1
            this._serviceRegistry.cmd?.addTrack(pattern, `T${trackNum}`)
            this.sync()
            return
        }

        const cell = e.target.closest('.pp-cell')
        if (!cell) return
        const trackIdx = parseInt(cell.dataset.track, 10)
        const beat = parseInt(cell.dataset.beat, 10)
        const beatStep = parseInt(cell.dataset.step, 10)
        if (isNaN(trackIdx) || isNaN(beat) || isNaN(beatStep)) return

        this._cursorTrackIdx = trackIdx
        this._cursorBeat = beat
        this._cursorBeatStep = beatStep

        const pattern = this._appState.patterns[this._appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (!track) return

        const notesAtStep = (track.notes ?? []).filter(n => n.beat === beat && n.beatStep === beatStep)

        if (notesAtStep.length > 0) {
            const sliceEl = e.target.closest('.pp-note-slice')
            const noteIdx = sliceEl ? parseInt(sliceEl.dataset.noteIdx, 10) : 0
            const note = notesAtStep[Math.min(noteIdx, notesAtStep.length - 1)]

            if (this._selNote === note && this._selTrackIdx === trackIdx) {
                this._serviceRegistry.cmd.deleteNote(track, note)
                this._clearSelection()
                this._updateTrackCellsInPlace(trackIdx, track, pattern)
            } else {
                this._selNote = note
                this._selTrackIdx = trackIdx
                this._applySelection()
                const pos = beat * (track.stepsPerBeat ?? 4) + beatStep
                this._playbackEvents.emit('trackSelect', { track, trackIdx })
                this._playbackEvents.emit('noteSelect', { track, trackIdx, note, pos, beat, beatStep })
                this._serviceRegistry.seq?.simpleBeep(trackIdx, note)
            }
            return
        }

        const newNote = this._serviceRegistry.cmd.addNote(track, beat, beatStep)
        this._selNote = newNote
        this._selTrackIdx = trackIdx
        this._updateTrackCellsInPlace(trackIdx, track, pattern)
        this._applySelection()

        const pos = beat * (track.stepsPerBeat ?? 4) + beatStep
        this._playbackEvents.emit('trackSelect', { track, trackIdx })
        this._playbackEvents.emit('noteSelect', { track, trackIdx, note: newNote, pos, beat, beatStep })

        this._serviceRegistry.seq?.simpleBeep(trackIdx, newNote)
    }

    _clearSelection() {
        this._selNote = null
        this._selTrackIdx = -1
        const selected = this.container.querySelectorAll('.pp-cell.selected, .pp-track-name.selected, .pp-track.pp-selected')
        selected.forEach(el => el.classList.remove('selected', 'pp-selected'))
        this._playbackEvents.emit('noteSelect', null)
        this._playbackEvents.emit('trackSelect', null)
    }

    async _onAction(action) {
        const idx = this._appState.selectedPatternNum
        const pattern = this._appState.patterns[idx]
        if (!pattern && action !== 'replace') return
        const cmd = this._serviceRegistry.cmd
        const patterns = this._serviceRegistry.patterns

        switch (action) {
            case 'delete': {
                if (this._appState.patterns.length <= 1) return
                if (!confirm('Delete pattern "' + (pattern.name ?? '') + '"?')) return
                cmd.removePattern(idx)
                this._playbackEvents.emit('patternStructureChange')
                this._playbackEvents.emit('patternChange')
                break
            }
            case 'clean': {
                if (!confirm('Clear all notes in "' + (pattern.name ?? '') + '"?')) return
                cmd.cleanPattern(pattern)
                patterns?.computeFlatNotesFromPattern(pattern)
                this._playbackEvents.emit('noteChange')
                this._playbackEvents.emit('patternChange')
                break
            }
            case 'duplicate': {
                const clone = cmd.addPattern((pattern.name ?? 'Pattern') + ' copy')
                Object.assign(clone, structuredClone(pattern))
                clone.name = (pattern.name ?? 'Pattern') + ' copy'
                const newIdx = this._appState.patterns.length - 1
                await cmd.setSelectedPatternNum(newIdx)
                this._playbackEvents.emit('patternStructureChange')
                this._playbackEvents.emit('patternChange')
                break
            }
            case 'rename': {
                const newName = prompt('Rename pattern:', pattern.name ?? '')
                if (newName === null || newName.trim() === '') return
                cmd.renamePattern(idx, newName.trim())
                this._playbackEvents.emit('patternStructureChange')
                this._playbackEvents.emit('patternChange')
                break
            }
            case 'save': {
                const { PatternExporter } = await import('../patterns/exporter.js')
                const data = PatternExporter.export(pattern)
                downloadJson(data, `ordrumbox-${pattern.name ?? 'pattern'}.json`)
                break
            }
            case 'replace': {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.json'
                input.onchange = async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const text = await file.text()
                    const data = JSON.parse(text)
                    cmd.importPatternFromJson(data)
                    this._playbackEvents.emit('patternStructureChange')
                    this._playbackEvents.emit('patternChange')
                }
                input.click()
                break
            }
        }
    }

    _applySelection() {
        const selected = this.container.querySelectorAll('.pp-cell.selected, .pp-track-name.selected, .pp-cell.cursor, .pp-note-slice.selected, .pp-track.pp-selected')
        selected.forEach(el => el.classList.remove('selected', 'cursor', 'pp-selected'))

        const currentTrackIdx = this._selTrackIdx !== -1
            ? this._selTrackIdx
            : (this._appState.selectedTrackNum ?? -1)

        if (this._selTrackIdx !== -1) {
            if (this._selNote) {
                const trackIdx = this._selTrackIdx
                const beat = this._selNote.beat
                const step = this._selNote.beatStep
                const sel = this._cellMap.get(`${trackIdx}:${beat}:${step}`)
                if (sel) {
                    sel.classList.add('selected')
                    const slices = sel.querySelectorAll('.pp-note-slice')
                    if (slices.length > 0) {
                        const notes = (this._appState.patterns[this._appState.selectedPatternNum]
                            ? (Utils.getTracksArray(this._appState.patterns[this._appState.selectedPatternNum])?.[trackIdx]?.notes ?? [])
                            : []).filter(n => n.beat === beat && n.beatStep === step)
                        const idx = notes.indexOf(this._selNote)
                        if (idx >= 0 && idx < slices.length) slices[idx].classList.add('selected')
                    }
                }
            } else if (this._cursorTrackIdx !== -1) {
                const sel = this._cellMap.get(`${this._cursorTrackIdx}:${this._cursorBeat}:${this._cursorBeatStep}`)
                if (sel) sel.classList.add('cursor')
                const trackSel = this.container.querySelector(`.pp-track-name[data-track="${this._cursorTrackIdx}"]`)
                if (trackSel) trackSel.classList.add('selected')
            } else {
                const sel = this.container.querySelector(`.pp-track-name[data-track="${this._selTrackIdx}"]`)
                if (sel) sel.classList.add('selected')
            }
        }

        if (currentTrackIdx !== -1) {
            const trackSel = this.container.querySelector(`.pp-track-name[data-track="${currentTrackIdx}"]`)
            if (trackSel) trackSel.classList.add('selected')
            const trackEl = trackSel?.closest('.pp-track')
            if (trackEl) trackEl.classList.add('pp-selected')
        }
    }

    _onInput(e) {
        const volSlider = e.target.closest('.pp-volume')
        if (volSlider) {
            const trackIdx = parseInt(volSlider.dataset.track, 10)
            if (isNaN(trackIdx)) return
            const pattern = this._appState.patterns[this._appState.selectedPatternNum]
            const tracks = Utils.getTracksArray(pattern)
            const track = tracks[trackIdx]
            if (!track) return
            track.velocity = parseFloat(volSlider.value)
            this._serviceRegistry.audioEngine?.syncTrack(track)
        }
        const masterSlider = e.target.closest('.pp-master-volume')
        if (masterSlider) {
            const value = parseFloat(masterSlider.value)
            this._serviceRegistry.audioEngine?.mixer?.setMasterBus({ master: value })
        }
    }

    _updateTrackCellsInPlace(trackIdx, track, pattern) {
        if (!this.container || !track || this._cellMap.size === 0) {
            this.sync()
            return
        }
        const startBeat = this._appState.currentPage * BEATS_PER_PAGE
        const endBeatPage = startBeat + BEATS_PER_PAGE

        this._grid.updateTrackCells(
            trackIdx,
            track,
            pattern,
            startBeat,
            endBeatPage,
            this._trackDataCache,
            this._cellMap
        )
    }

    _syncCellsInPlace(pattern, tracks) {
        const startBeat = this._appState.currentPage * BEATS_PER_PAGE
        const endBeatPage = startBeat + BEATS_PER_PAGE

        tracks.forEach((track, tIdx) => {
            if (!track) return
            this._grid.updateTrackCells(
                tIdx,
                track,
                pattern,
                startBeat,
                endBeatPage,
                this._trackDataCache,
                this._cellMap
            )

            // Update track-level row classes and properties
            const trackEl = this._tracksEl?.querySelectorAll('.pp-track:not(.pp-master-track)')?.[tIdx]
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
            }
        })

        this._applySelection()
    }

    sync() {
        if (!this.container) return

        const pattern = this._appState.patterns[this._appState.selectedPatternNum]
        if (!pattern) {
            this._headerEl.innerHTML = '<div class="pp-header pp-waiting">Waiting for patterns...</div>'
            this._tracksEl.innerHTML = ''
            this._cellMap.clear()
            return
        }

        const tracks = Utils.getTracksArray(pattern)

        const startBeat = this._appState.currentPage * BEATS_PER_PAGE
        const endBeatPage = startBeat + BEATS_PER_PAGE

        if (tracks.length === 0) {
            const prevHeight = this.container.offsetHeight
            this._headerEl.innerHTML = this._header.render(pattern, this._appState.currentPage)
            this._tracksEl.innerHTML = '<div class="pp-empty">Empty Pattern</div>'
            this._cellMap.clear()
            this._headerDirty = false
            if (prevHeight > 0) {
                this.container.style.minHeight = prevHeight + 'px'
                requestAnimationFrame(() => { this.container.style.minHeight = '' })
            }
            return
        }

        const existingTrackEls = this._tracksEl?.querySelectorAll('.pp-track:not(.pp-master-track)')
        const canUpdateInPlace =
            !this._forceFullRender &&
            existingTrackEls &&
            existingTrackEls.length === tracks.length &&
            this._cachedPage === startBeat &&
            this._cellMap.size > 0

        if (canUpdateInPlace) {
            if (this._headerDirty) {
                this._headerEl.innerHTML = this._header.render(pattern, this._appState.currentPage)
                this._headerDirty = false
            }
            this._syncCellsInPlace(pattern, tracks)
            return
        }

        this._forceFullRender = false
        this._cellMap.clear()

        const patternVersion = pattern._version ?? 0
        this._trackDataCache.clear()
        this._cachedVersion = patternVersion
        this._cachedPage = startBeat
        this._trackDataDirty = false

        if (this._headerDirty) {
            this._headerEl.innerHTML = this._header.render(pattern, this._appState.currentPage)
            this._headerDirty = false
        }

        const tracksHtml = this._grid.render(tracks, pattern, {
            startBeat,
            endBeatPage,
            selTrackIdx: this._selTrackIdx,
            selectedTrackNum: this._appState.selectedTrackNum,
            cachedPage: this._cachedPage,
            cachedVersion: this._cachedVersion,
            trackDataDirty: this._trackDataDirty,
            trackDataCache: this._trackDataCache
        })

        const tmp = document.createElement('div')
        tmp.innerHTML = tracksHtml
        const newTracksInner = tmp.querySelector('.pp-tracks')?.innerHTML

        if (newTracksInner != null) {
            const prevHeight = this.container.offsetHeight
            this._tracksEl.innerHTML = newTracksInner
            if (prevHeight > 0) {
                this.container.style.minHeight = prevHeight + 'px'
                requestAnimationFrame(() => { this.container.style.minHeight = '' })
            }
        }

        this._grid.applyScrollConstraints(this._tracksEl, tracks)

        this._overlay.ensurePlayhead()
        this._cellMap = this._grid.buildCellMap(this.container)
        this._applySelection()

        this._overlay.clearCaches()
        this._overlay.syncVusVisibility()
    }

    updateLoopPoint(trackIdx, loopAtStep) {
        const pattern = this._appState.patterns[this._appState.selectedPatternNum]
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (track && this._cellMap.size > 0) {
            this._updateTrackCellsInPlace(trackIdx, track, pattern)
        } else {
            this.forceSync()
        }
    }
}
