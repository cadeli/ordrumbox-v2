// src/ui/pattern_panel.js — Coordinator
//
// Thin coordinator that delegates rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons.

import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { isMobileViewport, BEATS_PER_PAGE } from '../core/constants.js'
import { validatePatternJson } from '../logic/commands/pattern_import.js'

import Utils from '../core/utils.js'
import BasePanel from './base_panel.js'
import { logger } from "../core/logger.js"
import { showToast } from './toast.js'
import { downloadJson, formatNoteTooltip } from './components/panel_helpers.js'

import HeaderSection from './pattern_panel/header_section.js'

const TRIGGER_FLASH_MS = 120
import GridSection from './pattern_panel/grid_section.js'
import PlaybackOverlaySection from './pattern_panel/playback_overlay_section.js'

export default class PatternPanel extends BasePanel {
    #appState
    #serviceRegistry
    #playbackEvents
    #selNote
    #selTrackIdx
    #syncRafId
    #syncPending
    #beatRectsCache
    #cursorTrackIdx
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
    #headerEl
    #tracksEl
    #tooltip
    #resizeObserver
    #layoutCache

    /**
     * @param {object} [deps]  Optional dependency overrides (DI).
     */
    constructor(deps = {}) {
        super('pattern-panel')

        this.#appState = deps.appState ?? appState
        this.#serviceRegistry = deps.serviceRegistry ?? serviceRegistry
        this.#playbackEvents = deps.playbackEvents ?? playbackEvents

        this.#selNote = null
        this.#selTrackIdx = -1
        this.#syncRafId = null
        this.#syncPending = false
        this.#beatRectsCache = []
        this.#cursorTrackIdx = -1
        this.#cursorBeat = 0
        this.#cursorBeatStep = 0
        this.#cellMap = new Map()
        this.#trackDataDirty = true
        this.#trackDataCache = new Map()
        this.#cachedPage = -1
        this.#cachedVersion = -1

        this.#header = new HeaderSection(this)
        this.#grid = new GridSection(this)
        this.#overlay = new PlaybackOverlaySection(this)
        this.#headerDirty = true
        this.#forceFullRender = false
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
        this.container.addEventListener('focus', () => this.#onFocus())
        this.container.addEventListener('click', (e) => {
            this.container.focus()
            this.#onClick(e)
        }, { passive: false })
        this.container.addEventListener('input', (e) => this.#onInput(e))
        this.container.addEventListener('keydown', (e) => this.#onKeyDown(e))
        this.container.addEventListener('mouseover', (e) => this.#onMouseOver(e))
        this.container.addEventListener('mouseout', (e) => this.#onMouseOut(e))
        this.#resizeObserver = new ResizeObserver(() => this.#updateBarCache())
        this.#resizeObserver.observe(this.container)
    }

    #ensureTooltip() {
        if (!this.#tooltip || !this.container.contains(this.#tooltip)) {
            if (this.#tooltip) this.#tooltip.remove()
            this.#tooltip = document.createElement('div')
            this.#tooltip.className = 'pp-tooltip'
            this.#tooltip.style.display = 'none'
            this.container.appendChild(this.#tooltip)
        }
    }

    #onMouseOver(e) {
        const cell = e.target.closest('.pp-cell.filled')
        if (!cell) return
        const trackIdx = parseInt(cell.dataset.track, 10)
        const beat = parseInt(cell.dataset.beat, 10)
        const beatStep = parseInt(cell.dataset.step, 10)
        if (isNaN(trackIdx) || isNaN(beat) || isNaN(beatStep)) return

        const resolved = this.#resolveNotesAtStep(trackIdx, beat, beatStep)
        if (!resolved) return
        const { track, notesAtStep } = resolved
        if (notesAtStep.length === 0) return

        const sliceEl = e.target.closest('.pp-note-slice')
        const noteIdx = sliceEl ? parseInt(sliceEl.dataset.noteIdx, 10) : 0
        const note = notesAtStep[Math.min(noteIdx, notesAtStep.length - 1)]

        const trackPitch = track.pitch ?? 0

        this.#ensureTooltip()
        this.#tooltip.textContent = formatNoteTooltip(note, trackPitch)
        this.#tooltip.style.display = 'block'

        const rect = (sliceEl ?? cell).getBoundingClientRect()
        const containerRect = this.container.getBoundingClientRect()
        this.#tooltip.style.left = `${rect.left - containerRect.left + rect.width / 2 - this.#tooltip.offsetWidth / 2}px`
        this.#tooltip.style.top = `${rect.top - containerRect.top - this.#tooltip.offsetHeight - 4}px`
    }

    #onMouseOut(e) {
        const cell = e.target.closest('.pp-cell.filled')
        if (!cell) return
        if (this.#tooltip) this.#tooltip.style.display = 'none'
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
        this.#playbackEvents.on('noteChange', onNoteChange)
        this.#playbackEvents.on('trackParamChange', onNoteChange)
        this.#playbackEvents.on('patternStructureChange', onStructureChange)
        this.#playbackEvents.on('patternMetaChange', onStructureChange)
        this.#playbackEvents.on('drumkitChange', onStructureChange)
        this.#playbackEvents.on('loopPointChange', (data) => {
            if (data && typeof data.trackIdx === 'number' && typeof data.loopAtStep === 'number') {
                this.updateLoopPoint(data.trackIdx, data.loopAtStep)
            }
        })
        this.#playbackEvents.on('selectedPatternChange', () => {
            const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
            const nbBeats = pattern?.nbBeats ?? 4
            const maxPage = Math.floor((nbBeats - 1) / BEATS_PER_PAGE)
            if (this.#appState.currentPage > maxPage) {
                this.#appState.currentPage = 0
            }
            this.#forceFullRender = true
            this.#headerDirty = true
            this.#trackDataDirty = true
            this.requestSync()
        })
        this.#playbackEvents.on('playbackStop', () => {
            this.#overlay.resetPrevLoopTick()
            this.#overlay.stopRafLoop()
            this.#overlay.hidePlayhead()
            this.#overlay.resetVuAndWaveform()
        })
        this.#playbackEvents.on('playbackStart', () => {
            this.#updateBarCache()
            this.#overlay.startRafLoop()
        })
        this.#playbackEvents.on('noteTrigger', (data) => {
            if (!this.container || !data) return
            const cell = this.#cellMap.get(`${data.trackIdx}:${data.beat}:${data.beatStep}`)
            if (!cell) return
            cell.classList.add('pp-triggered')
            clearTimeout(cell._triggerTimer)
            cell._triggerTimer = setTimeout(() => cell.classList.remove('pp-triggered'), TRIGGER_FLASH_MS)
        })
        this.#playbackEvents.on('trackParamChange', () => {
            this.#overlay.syncVusVisibility()
            this.#updateBarCache()
        })
        this.#playbackEvents.on('trackSelect', (data) => {
            if (data) {
                if (this.#selTrackIdx !== data.trackIdx) {
                    this.#selNote = null
                }
                this.#selTrackIdx = data.trackIdx
            } else {
                this.#selTrackIdx = -1
                this.#selNote = null
            }
            this.#applySelection()
        })
    }

    #updateBarCache() {
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
            tracksOffset: tracksRect.left - containerRect.left
        }

        const beatEls = this.container.querySelectorAll('.pp-beat')
        beatEls.forEach(el => {
            const r = el.getBoundingClientRect()
            this.#beatRectsCache[parseInt(el.dataset.beat)] = {
                left: r.left - this.#layoutCache.tracksLeft,
                absLeft: r.left,
                absRight: r.right,
                width: r.width
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

    /** @private Shared requestAnimationFrame callback for sync + bar cache update. */
    #scheduleSync() {
        this.#syncRafId = requestAnimationFrame(() => {
            this.sync()
            this.#syncPending = false
            this.#syncRafId = null
            requestAnimationFrame(() => this.#updateBarCache())
        })
    }

    #onFocus() {
        if (this.#cursorTrackIdx === -1) {
            const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
            if (!pattern) return
            const tracks = Utils.getTracksArray(pattern)
            if (tracks.length === 0) return
            this.#cursorTrackIdx = 0
            this.#cursorBeat = 0
            this.#cursorBeatStep = 0
            this.#applySelection()
        }
    }

    #onKeyDown(e) {
        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        if (tracks.length === 0) return

        if (this.#cursorTrackIdx === -1) {
            this.#cursorTrackIdx = 0
            this.#cursorBeat = 0
            this.#cursorBeatStep = 0
        }

        const stepsPerBeat = tracks[this.#cursorTrackIdx]?.stepsPerBeat ?? 4
        const nbBeats = pattern.nbBeats ?? 4

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault()
                this.#cursorBeatStep++
                if (this.#cursorBeatStep >= stepsPerBeat) {
                    this.#cursorBeatStep = 0
                    this.#cursorBeat++
                    if (this.#cursorBeat >= nbBeats) {
                        this.#cursorBeat = 0
                    }
                }
                break
            case 'ArrowLeft':
                e.preventDefault()
                this.#cursorBeatStep--
                if (this.#cursorBeatStep < 0) {
                    this.#cursorBeatStep = stepsPerBeat - 1
                    this.#cursorBeat--
                    if (this.#cursorBeat < 0) {
                        this.#cursorBeat = nbBeats - 1
                    }
                }
                break
            case 'ArrowUp':
                e.preventDefault()
                if (this.#cursorTrackIdx > 0) this.#cursorTrackIdx--
                break
            case 'ArrowDown':
                e.preventDefault()
                if (this.#cursorTrackIdx < tracks.length - 1) this.#cursorTrackIdx++
                break
            case 'Enter':
                e.preventDefault()
                {
                    const track = tracks[this.#cursorTrackIdx]
                    if (!track) return
                    this.#handleNoteEnter(track)
                    break
                }
            default:
                return
        }

        const track = tracks[this.#cursorTrackIdx]
        if (!track) return

        const startBeat = this.#appState.currentPage * BEATS_PER_PAGE
        if (this.#cursorBeat < startBeat || this.#cursorBeat >= startBeat + BEATS_PER_PAGE) {
            this.#appState.currentPage = Math.floor(this.#cursorBeat / BEATS_PER_PAGE)
            this.sync()
        }

        const note = (track.notes ?? []).find(n => n.beat === this.#cursorBeat && n.beatStep === this.#cursorBeatStep)
        this.#selNote = note ?? null
        this.#selTrackIdx = this.#cursorTrackIdx
        this.#applySelection()
        if (note) {
            this.#playbackEvents.emit('noteSelect', { track, trackIdx: this.#cursorTrackIdx, note, pos: this.#cursorBeat * stepsPerBeat + this.#cursorBeatStep, beat: this.#cursorBeat, beatStep: this.#cursorBeatStep })
            this.#serviceRegistry.seq?.simpleBeep(this.#cursorTrackIdx, note)
        } else {
            this.#playbackEvents.emit('noteSelect', { track, trackIdx: this.#cursorTrackIdx, note: null, beat: this.#cursorBeat, beatStep: this.#cursorBeatStep })
        }
    }

    #resolveTrack(idx) {
        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        const tracks = Utils.getTracksArray(pattern)
        return tracks[idx] ?? null
    }

    #resolveNotesAtStep(trackIdx, beat, beatStep) {
        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        if (!pattern) return null
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (!track) return null
        const notesAtStep = (track.notes ?? []).filter(n => n.beat === beat && n.beatStep === beatStep)
        return { track, notesAtStep, pattern }
    }

    #selectTrack(trackIdx) {
        const track = this.#resolveTrack(trackIdx)
        if (!track) return
        this.#cursorTrackIdx = trackIdx

        if (this.#selTrackIdx === trackIdx && !this.#selNote) {
            if (isMobileViewport()) {
                this.#playbackEvents.emit('trackSelect', { track, trackIdx })
            } else {
                this.#clearSelection()
            }
        } else {
            this.#selNote = null
            this.#selTrackIdx = trackIdx
            this.#applySelection()
            this.#playbackEvents.emit('trackSelect', { track, trackIdx })
            this.#serviceRegistry.seq?.simpleBeep(trackIdx)
        }
    }

    #toggleTrackProp(idx, prop) {
        const track = this.#resolveTrack(idx)
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
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit('trackParamChange', track)
            this.#playbackEvents.emit('patternChange')
        })
    }

    #handleNoteEnter(track) {
        if (!track) return
        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        if (!pattern) return

        const cell = this.#cellMap.get(`${this.#cursorTrackIdx}:${this.#cursorBeat}:${this.#cursorBeatStep}`)
        if (cell) {
            const notesAtStep = (track.notes ?? []).filter(n => n.beat === this.#cursorBeat && n.beatStep === this.#cursorBeatStep)
            if (notesAtStep.length > 0) {
                const note = notesAtStep[0]
                if (this.#selNote === note && this.#selTrackIdx === this.#cursorTrackIdx) {
                    this.#serviceRegistry.cmd.deleteNote(track, note)
                    this.#clearSelection()
                    this.#updateTrackCellsInPlace(this.#cursorTrackIdx, track, pattern)
                } else {
                    this.#selNote = note
                    this.#selTrackIdx = this.#cursorTrackIdx
                    this.#applySelection()
                    const pos = this.#cursorBeat * (track.stepsPerBeat ?? 4) + this.#cursorBeatStep
                    this.#playbackEvents.emit('noteSelect', { track, trackIdx: this.#cursorTrackIdx, note, pos, beat: this.#cursorBeat, beatStep: this.#cursorBeatStep })
                    this.#serviceRegistry.seq?.simpleBeep(this.#cursorTrackIdx, note)
                }
            } else {
                const newNote = this.#serviceRegistry.cmd.addNote(track, this.#cursorBeat, this.#cursorBeatStep)
                this.#selNote = newNote
                this.#selTrackIdx = this.#cursorTrackIdx
                this.#updateTrackCellsInPlace(this.#cursorTrackIdx, track, pattern)
                this.#applySelection()

                const pos = this.#cursorBeat * (track.stepsPerBeat ?? 4) + this.#cursorBeatStep
                this.#playbackEvents.emit('noteSelect', { track, trackIdx: this.#cursorTrackIdx, note: newNote, pos, beat: this.#cursorBeat, beatStep: this.#cursorBeatStep })
                this.#serviceRegistry.seq?.simpleBeep(this.#cursorTrackIdx, newNote)
            }
        }
    }

    #onClick(e) {
        const actionBtn = e.target.closest('.pp-action-btn')
        if (actionBtn) {
            this.#onAction(actionBtn.dataset.ppAction)
            return
        }

        const masterTrackEl = e.target.closest('.pp-master-track')
        if (masterTrackEl) {
            this.#playbackEvents.emit('masterToggle', true)
            return
        }

        const trackEl = e.target.closest('.pp-track')
        if (trackEl && !e.target.closest('.pp-track-name') && !e.target.closest('.pp-divider') && !e.target.closest('.pp-solo') && !e.target.closest('.pp-cell') && !e.target.closest('.pp-volume')) {
            const trackIdx = parseInt(trackEl.querySelector('.pp-track-name')?.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this.#selectTrack(trackIdx)
            return
        }

        const trackNameEl = e.target.closest('.pp-track-name')
        if (trackNameEl) {
            const trackIdx = parseInt(trackNameEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this.#selectTrack(trackIdx)
            return
        }

        const dividerEl = e.target.closest('.pp-divider')
        if (dividerEl) {
            const trackIdx = parseInt(dividerEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this.#toggleTrackProp(trackIdx, 'mute')
            return
        }

        const soloEl = e.target.closest('.pp-solo')
        if (soloEl) {
            const trackIdx = parseInt(soloEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this.#toggleTrackProp(trackIdx, 'solo')
            return
        }

        if (e.target.closest('#pp-add-track')) {
            const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
            if (!pattern) return
            const trackNum = (Utils.getTracksArray(pattern).length) + 1
            this.#serviceRegistry.cmd?.addTrack(pattern, `T${trackNum}`)
            this.sync()
            return
        }

        if (e.target.closest('#pp-delete-track')) {
            const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
            if (!pattern) return
            const tracks = Utils.getTracksArray(pattern)
            if (tracks.length <= 1) return
            const trackIdx = this.#selTrackIdx !== -1 ? this.#selTrackIdx : (this.#appState.selectedTrackNum ?? -1)
            if (trackIdx < 0 || trackIdx >= tracks.length) return
            this.#serviceRegistry.cmd?.removeTrack(pattern, trackIdx)
            this.#selTrackIdx = -1
            this.sync()
            return
        }

        const cell = e.target.closest('.pp-cell')
        if (!cell) return
        const trackIdx = parseInt(cell.dataset.track, 10)
        const beat = parseInt(cell.dataset.beat, 10)
        const beatStep = parseInt(cell.dataset.step, 10)
        if (isNaN(trackIdx) || isNaN(beat) || isNaN(beatStep)) return

        this.#cursorTrackIdx = trackIdx
        this.#cursorBeat = beat
        this.#cursorBeatStep = beatStep

        const resolved = this.#resolveNotesAtStep(trackIdx, beat, beatStep)
        if (!resolved) return
        const { track, notesAtStep, pattern } = resolved

        if (notesAtStep.length > 0) {
            const sliceEl = e.target.closest('.pp-note-slice')
            const noteIdx = sliceEl ? parseInt(sliceEl.dataset.noteIdx, 10) : 0
            const note = notesAtStep[Math.min(noteIdx, notesAtStep.length - 1)]

            if (this.#selNote === note && this.#selTrackIdx === trackIdx) {
                this.#serviceRegistry.cmd.deleteNote(track, note)
                this.#clearSelection()
                this.#updateTrackCellsInPlace(trackIdx, track, pattern)
            } else {
                this.#selNote = note
                this.#selTrackIdx = trackIdx
                this.#applySelection()
                const pos = beat * (track.stepsPerBeat ?? 4) + beatStep
                this.#playbackEvents.batch(() => {
                    this.#playbackEvents.emit('trackSelect', { track, trackIdx })
                    this.#playbackEvents.emit('noteSelect', { track, trackIdx, note, pos, beat, beatStep })
                })
                this.#serviceRegistry.seq?.simpleBeep(trackIdx, note)
            }
            return
        }

        const newNote = this.#serviceRegistry.cmd.addNote(track, beat, beatStep)
        this.#selNote = newNote
        this.#selTrackIdx = trackIdx
        this.#updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#applySelection()

        const pos = beat * (track.stepsPerBeat ?? 4) + beatStep
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit('trackSelect', { track, trackIdx })
            this.#playbackEvents.emit('noteSelect', { track, trackIdx, note: newNote, pos, beat, beatStep })
        })

        this.#serviceRegistry.seq?.simpleBeep(trackIdx, newNote)
    }

    #clearSelection() {
        this.#selNote = null
        this.#selTrackIdx = -1
        const selected = this.container.querySelectorAll('.pp-cell.selected, .pp-track-name.selected, .pp-track.pp-selected')
        selected.forEach(el => el.classList.remove('selected', 'pp-selected'))
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit('noteSelect', null)
            this.#playbackEvents.emit('trackSelect', null)
        })
    }

    async #onAction(action) {
        const idx = this.#appState.selectedPatternNum
        const pattern = this.#appState.patterns[idx]
        if (!pattern && action !== 'replace' && action !== 'new') return
        const cmd = this.#serviceRegistry.cmd
        const patterns = this.#serviceRegistry.patterns

        switch (action) {
            case 'new': {
                const newIdx = this.#appState.patterns.length
                cmd.addPattern()
                cmd.setSelectedPatternNum(newIdx)
                this.#appState.currentPage = 0
                this.#emitStructureChange()
                showToast('Pattern added', 'success')
                break
            }
            case 'delete': {
                if (this.#appState.patterns.length <= 1) return
                if (!confirm('Delete pattern "' + (pattern.name ?? '') + '"?')) return
                cmd.removePattern(idx)
                this.#emitStructureChange()
                break
            }
            case 'clean': {
                if (!confirm('Clear all notes in "' + (pattern.name ?? '') + '"?')) return
                cmd.cleanPattern(pattern)
                patterns?.applyFlatNotes(pattern)
                break
            }
            case 'duplicate': {
                const clone = cmd.addPattern((pattern.name ?? 'Pattern') + ' copy')
                Object.assign(clone, structuredClone(pattern))
                clone.name = (pattern.name ?? 'Pattern') + ' copy'
                const newIdx = this.#appState.patterns.length - 1
                await cmd.setSelectedPatternNum(newIdx)
                this.#emitStructureChange()
                break
            }
            case 'rename': {
                const newName = prompt('Rename pattern:', pattern.name ?? '')
                if (newName === null || newName.trim() === '') return
                cmd.renamePattern(idx, newName.trim())
                this.#emitStructureChange()
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
                    try {
                        const text = await file.text()
                        const data = JSON.parse(text)
                        const validation = validatePatternJson(data)
                        if (!validation.ok) {
                            showToast(`Invalid pattern: ${validation.error}`, 'error')
                            return
                        }
                        cmd.importPatternFromJson(data)
                        this.#emitStructureChange()
                    } catch (err) {
                        logger.error('PatternPanel', 'Import failed', err)
                        showToast('Import failed: ' + err.message, 'error')
                    }
                }
                input.click()
                break
            }
        }
    }

    #emitStructureChange() {
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit('patternStructureChange')
            this.#playbackEvents.emit('patternChange')
        })
    }

    #applySelection() {
        const selected = this.container.querySelectorAll('.pp-cell.selected, .pp-track-name.selected, .pp-cell.cursor, .pp-note-slice.selected, .pp-track.pp-selected')
        selected.forEach(el => el.classList.remove('selected', 'cursor', 'pp-selected'))

        const currentTrackIdx = this.#selTrackIdx !== -1
            ? this.#selTrackIdx
            : (this.#appState.selectedTrackNum ?? -1)

        if (this.#selTrackIdx !== -1) {
            if (this.#selNote) {
                const trackIdx = this.#selTrackIdx
                const beat = this.#selNote.beat
                const step = this.#selNote.beatStep
                const sel = this.#cellMap.get(`${trackIdx}:${beat}:${step}`)
                if (sel) {
                    sel.classList.add('selected')
                    const slices = sel.querySelectorAll('.pp-note-slice')
                    if (slices.length > 0) {
                        const notes = (this.#appState.patterns[this.#appState.selectedPatternNum]
                            ? (Utils.getTracksArray(this.#appState.patterns[this.#appState.selectedPatternNum])?.[trackIdx]?.notes ?? [])
                            : []).filter(n => n.beat === beat && n.beatStep === step)
                        const idx = notes.indexOf(this.#selNote)
                        if (idx >= 0 && idx < slices.length) slices[idx].classList.add('selected')
                    }
                }
            } else if (this.#cursorTrackIdx !== -1) {
                const sel = this.#cellMap.get(`${this.#cursorTrackIdx}:${this.#cursorBeat}:${this.#cursorBeatStep}`)
                if (sel) sel.classList.add('cursor')
                const trackSel = this.container.querySelector(`.pp-track-name[data-track="${this.#cursorTrackIdx}"]`)
                if (trackSel) trackSel.classList.add('selected')
            } else {
                const sel = this.container.querySelector(`.pp-track-name[data-track="${this.#selTrackIdx}"]`)
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

    #onInput(e) {
        const volSlider = e.target.closest('.pp-volume')
        if (volSlider) {
            const trackIdx = parseInt(volSlider.dataset.track, 10)
            if (isNaN(trackIdx)) return
            const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
            const tracks = Utils.getTracksArray(pattern)
            const track = tracks[trackIdx]
            if (!track) return
            track.velocity = parseFloat(volSlider.value)
            this.#serviceRegistry.audioEngine?.syncTrack(track)
        }
        const masterSlider = e.target.closest('.pp-master-volume')
        if (masterSlider) {
            const value = parseFloat(masterSlider.value)
            this.#serviceRegistry.audioEngine?.mixer?.setMasterBus({ master: value })
        }
    }

    #updateTrackCellsInPlace(trackIdx, track, pattern) {
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
            this.#cellMap
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
                this.#cellMap
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
                    const newLabel = track.useSoftSynth && track.synthSoundKey
                        ? `SYNTH: ${track.synthSoundKey}`
                        : (track.soundId && track.soundId !== 'NOT_DEFINED'
                            ? (soundRegistry.sounds[track.soundId]?.url ?? track.soundId)
                            : '')
                    if (urlEl.textContent !== newLabel) {
                        urlEl.textContent = newLabel
                    }
                }
            }
        })

        this.#applySelection()
    }

    sync() {
        if (!this.container) return

        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
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
                requestAnimationFrame(() => { this.container.style.minHeight = '' })
            }
            return
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

        const patternVersion = pattern._version ?? 0
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
            selTrackIdx: this.#selTrackIdx,
            selectedTrackNum: this.#appState.selectedTrackNum,
            cachedPage: this.#cachedPage,
            cachedVersion: this.#cachedVersion,
            trackDataDirty: this.#trackDataDirty,
            trackDataCache: this.#trackDataCache
        })

        const tmp = document.createElement('div')
        tmp.innerHTML = tracksHtml
        const newTracksInner = tmp.querySelector('.pp-tracks')?.innerHTML

        if (newTracksInner != null) {
            const prevHeight = this.container.offsetHeight
            this.#tracksEl.innerHTML = newTracksInner
            if (prevHeight > 0) {
                this.container.style.minHeight = prevHeight + 'px'
                requestAnimationFrame(() => { this.container.style.minHeight = '' })
            }
        }

        this.#grid.applyScrollConstraints(this.#tracksEl, tracks)

        this.#overlay.ensurePlayhead()
        this.#cellMap = this.#grid.buildCellMap(this.container)
        this.#applySelection()

        this.#overlay.clearCaches()
        this.#overlay.syncVusVisibility()
    }

    updateLoopPoint(trackIdx, _loopAtStep) {
        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (track && this.#cellMap.size > 0) {
            this.#updateTrackCellsInPlace(trackIdx, track, pattern)
        } else {
            this.forceSync()
        }
    }

    // ─── Public API ───────────────────────────────────────────────────────
    /** @returns {HTMLElement} tracks container element */
    get tracksEl() { return this.#tracksEl }

    get selTrackIdx() { return this.#selTrackIdx }
    get appState() { return this.#appState }
    get serviceRegistry() { return this.#serviceRegistry }
    get playbackEvents() { return this.#playbackEvents }
    get layoutCache() { return this.#layoutCache }
    get beatRectsCache() { return this.#beatRectsCache }

    /** Execute a panel action (new, delete, duplicate, etc.) */
    onAction(action) { return this.#onAction(action) }
}
