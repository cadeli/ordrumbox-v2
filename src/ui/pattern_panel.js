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
import { logger } from '../core/logger.js'
import { showToast } from '../core/notify.js'
import { downloadJson, formatNoteTooltip } from './components/panel_helpers.js'

import HeaderSection from './pattern_panel/header_section.js'

const TRIGGER_FLASH_MS = 120
import GridSection from './pattern_panel/grid_section.js'
import PlaybackOverlaySection from './pattern_panel/playback_overlay_section.js'
import { EVENTS } from '../core/events.js'

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
    #structureSig
    #headerEl
    #tracksEl
    #tooltip
    #resizeObserver
    #layoutCache
    #clipboard
    #rangeAnchor
    #contextMenuEl
    #contextMenuDismiss

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
        this.#clipboard = null
        this.#rangeAnchor = null
        this.#contextMenuEl = null
        this.#contextMenuDismiss = null

        this.#header = new HeaderSection(this)
        this.#grid = new GridSection(this)
        this.#overlay = new PlaybackOverlaySection(this)
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
        this.container.addEventListener('focus', () => this.#onFocus())
        this.container.addEventListener(
            'click',
            (e) => {
                this.container.focus()
                this.#onClick(e)
            },
            { passive: false },
        )
        this.container.addEventListener('input', (e) => this.#onInput(e))
        this.container.addEventListener('keydown', (e) => this.#onKeyDown(e))
        this.container.addEventListener('contextmenu', (e) => this.#onContextMenu(e))
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
        this.#playbackEvents.on(EVENTS.NOTE_CHANGE, onNoteChange)
        this.#playbackEvents.on(EVENTS.TRACK_PARAM_CHANGE, onNoteChange)
        this.#playbackEvents.on(EVENTS.PATTERN_STRUCTURE_CHANGE, onStructureChange)
        this.#playbackEvents.on(EVENTS.PATTERN_META_CHANGE, onStructureChange)
        this.#playbackEvents.on(EVENTS.DRUMKIT_CHANGE, onStructureChange)
        this.#playbackEvents.on(EVENTS.LOOP_POINT_CHANGE, (data) => {
            if (data && typeof data.trackIdx === 'number' && typeof data.loopAtStep === 'number') {
                this.updateLoopPoint(data.trackIdx, data.loopAtStep)
            }
        })
        this.#playbackEvents.on(EVENTS.SELECTED_PATTERN_CHANGE, () => {
            this.#rangeAnchor = null
            const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
            const nbBeats = pattern?.nbBeats ?? 4
            const maxPage = Math.floor((nbBeats - 1) / BEATS_PER_PAGE)
            if (this.#appState.currentPage > maxPage) {
                this.#serviceRegistry.cmd.resetPage()
            }
            this.#forceFullRender = true
            this.#headerDirty = true
            this.#trackDataDirty = true
            this.requestSync()
        })
        this.#playbackEvents.on(EVENTS.PLAYBACK_STOP, () => {
            this.#overlay.resetPrevLoopTick()
            this.#overlay.stopRafLoop()
            this.#overlay.hidePlayhead()
            this.#overlay.resetVuAndWaveform()
        })
        this.#playbackEvents.on(EVENTS.PLAYBACK_START, () => {
            this.#updateBarCache()
            this.#overlay.startRafLoop()
        })
        this.#playbackEvents.on(EVENTS.NOTE_TRIGGER, (data) => {
            if (!this.container || !data) return
            const cell = this.#cellMap.get(`${data.trackIdx}:${data.beat}:${data.beatStep}`)
            if (!cell) return
            cell.classList.add('pp-triggered')
            clearTimeout(cell._triggerTimer)
            cell._triggerTimer = setTimeout(() => cell.classList.remove('pp-triggered'), TRIGGER_FLASH_MS)
        })
        this.#playbackEvents.on(EVENTS.TRACK_PARAM_CHANGE, () => {
            this.#overlay.syncVusVisibility()
            this.#updateBarCache()
        })
        this.#playbackEvents.on(EVENTS.TRACK_SELECT, (data) => {
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
            tracksOffset: tracksRect.left - containerRect.left,
        }

        const beatEls = this.container.querySelectorAll('.pp-beat')
        beatEls.forEach((el) => {
            const r = el.getBoundingClientRect()
            this.#beatRectsCache[parseInt(el.dataset.beat)] = {
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

        const target = e.target
        const isEditable =
            target &&
            (target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                (target.tagName === 'INPUT' && /^(text|search|password|email|url|tel)$/i.test(target.type ?? 'text')))
        if (isEditable) return

        const isMod = e.ctrlKey || e.metaKey
        const keyC = e.key === 'c' || e.key === 'C' || e.code === 'KeyC'
        const keyV = e.key === 'v' || e.key === 'V' || e.code === 'KeyV'

        if (isMod && keyC) {
            e.preventDefault()
            if (e.shiftKey) this.#copyTrack(tracks)
            else if (this.#cursorTrackIdx !== -1) this.#copyStep(tracks)
            else this.#copyTrack(tracks)
            return
        }
        if (isMod && keyV) {
            e.preventDefault()
            if (e.shiftKey) this.#pasteTrack(pattern, tracks)
            else this.#pasteClipboard(pattern, tracks)
            return
        }
        if (isMod) return

        if (e.key === 'Escape') {
            e.preventDefault()
            this.#cursorTrackIdx = -1
            this.#selNote = null
            this.#selTrackIdx = -1
            this.#rangeAnchor = null
            this.#applySelection()
            return
        }

        if (this.#cursorTrackIdx === -1) {
            this.#cursorTrackIdx = 0
            this.#cursorBeat = 0
            this.#cursorBeatStep = 0
        }

        const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown'
        if (isArrow) {
            if (e.shiftKey) this.#ensureRangeAnchor()
            else this.#rangeAnchor = null
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
            case 'Delete':
            case 'Backspace':
                e.preventDefault()
                if (this.#rangeAnchor) this.#handleRangeDelete(tracks, pattern)
                else this.#handleNoteDelete(tracks)
                return
            default:
                return
        }

        const track = tracks[this.#cursorTrackIdx]
        if (!track) return

        const startBeat = this.#appState.currentPage * BEATS_PER_PAGE
        if (this.#cursorBeat < startBeat || this.#cursorBeat >= startBeat + BEATS_PER_PAGE) {
            this.#serviceRegistry.cmd.setCurrentPage(Math.floor(this.#cursorBeat / BEATS_PER_PAGE))
            this.sync()
        }

        const note = (track.notes ?? []).find((n) => n.beat === this.#cursorBeat && n.beatStep === this.#cursorBeatStep)
        this.#selNote = note ?? null
        this.#selTrackIdx = this.#cursorTrackIdx
        this.#applySelection()
        if (note) {
            this.#playbackEvents.emit(EVENTS.NOTE_SELECT, {
                track,
                trackIdx: this.#cursorTrackIdx,
                note,
                pos: this.#cursorBeat * stepsPerBeat + this.#cursorBeatStep,
                beat: this.#cursorBeat,
                beatStep: this.#cursorBeatStep,
            })
            this.#serviceRegistry.seq?.simpleBeep(this.#cursorTrackIdx, note)
        } else {
            this.#playbackEvents.emit(EVENTS.NOTE_SELECT, {
                track,
                trackIdx: this.#cursorTrackIdx,
                note: null,
                beat: this.#cursorBeat,
                beatStep: this.#cursorBeatStep,
            })
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
        const notesAtStep = (track.notes ?? []).filter((n) => n.beat === beat && n.beatStep === beatStep)
        return { track, notesAtStep, pattern }
    }

    #selectTrack(trackIdx) {
        const track = this.#resolveTrack(trackIdx)
        if (!track) return
        this.#rangeAnchor = null
        this.#cursorTrackIdx = trackIdx

        if (this.#selTrackIdx === trackIdx && !this.#selNote) {
            if (isMobileViewport()) {
                this.#playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx })
            } else {
                this.#clearSelection()
            }
        } else {
            this.#selNote = null
            this.#selTrackIdx = trackIdx
            this.#applySelection()
            this.#playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx })
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
            this.#playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, track)
            this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    #handleNoteEnter(track) {
        if (!track) return
        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        if (!pattern) return

        const cell = this.#cellMap.get(`${this.#cursorTrackIdx}:${this.#cursorBeat}:${this.#cursorBeatStep}`)
        if (cell) {
            const notesAtStep = (track.notes ?? []).filter(
                (n) => n.beat === this.#cursorBeat && n.beatStep === this.#cursorBeatStep,
            )
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
                    this.#playbackEvents.emit(EVENTS.NOTE_SELECT, {
                        track,
                        trackIdx: this.#cursorTrackIdx,
                        note,
                        pos,
                        beat: this.#cursorBeat,
                        beatStep: this.#cursorBeatStep,
                    })
                    this.#serviceRegistry.seq?.simpleBeep(this.#cursorTrackIdx, note)
                }
            } else {
                const newNote = this.#serviceRegistry.cmd.addNote(track, this.#cursorBeat, this.#cursorBeatStep)
                this.#selNote = newNote
                this.#selTrackIdx = this.#cursorTrackIdx
                this.#updateTrackCellsInPlace(this.#cursorTrackIdx, track, pattern)
                this.#applySelection()

                const pos = this.#cursorBeat * (track.stepsPerBeat ?? 4) + this.#cursorBeatStep
                this.#playbackEvents.emit(EVENTS.NOTE_SELECT, {
                    track,
                    trackIdx: this.#cursorTrackIdx,
                    note: newNote,
                    pos,
                    beat: this.#cursorBeat,
                    beatStep: this.#cursorBeatStep,
                })
                this.#serviceRegistry.seq?.simpleBeep(this.#cursorTrackIdx, newNote)
            }
        }
    }

    #handleNoteDelete(tracks) {
        const track = tracks[this.#cursorTrackIdx]
        if (!track) return
        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        if (!pattern) return

        const notesAtStep = (track.notes ?? []).filter(
            (n) => n.beat === this.#cursorBeat && n.beatStep === this.#cursorBeatStep,
        )
        if (notesAtStep.length > 0) {
            for (const note of notesAtStep) {
                this.#serviceRegistry.cmd.deleteNote(track, note)
            }
            this.#updateTrackCellsInPlace(this.#cursorTrackIdx, track, pattern)
        }
        this.#clearSelection()
    }

    #ensureRangeAnchor() {
        if (this.#rangeAnchor) return
        this.#rangeAnchor = {
            trackIdx: this.#cursorTrackIdx,
            beat: this.#cursorBeat,
            beatStep: this.#cursorBeatStep,
        }
    }

    #fracPos(track, beat, beatStep) {
        const spb = track?.stepsPerBeat ?? 4
        return beat + beatStep / spb
    }

    #getRangeInfo(tracks) {
        if (!this.#rangeAnchor || this.#cursorTrackIdx === -1) return null
        const a = this.#rangeAnchor
        const tA = tracks[a.trackIdx]
        const tC = tracks[this.#cursorTrackIdx]
        if (!tA || !tC) return null
        const fracA = this.#fracPos(tA, a.beat, a.beatStep)
        const fracC = this.#fracPos(tC, this.#cursorBeat, this.#cursorBeatStep)
        if (fracA === fracC && a.trackIdx === this.#cursorTrackIdx) return null
        return {
            trackMin: Math.min(a.trackIdx, this.#cursorTrackIdx),
            trackMax: Math.max(a.trackIdx, this.#cursorTrackIdx),
            fracMin: Math.min(fracA, fracC),
            fracMax: Math.max(fracA, fracC),
        }
    }

    #cellInInfoRange(trackIdx, beat, beatStep, track, info) {
        if (trackIdx < info.trackMin || trackIdx > info.trackMax) return false
        const frac = this.#fracPos(track, beat, beatStep)
        const eps = 1e-9
        return frac >= info.fracMin - eps && frac <= info.fracMax + eps
    }

    #handleRangeDelete(tracks, pattern) {
        const info = this.#getRangeInfo(tracks)
        this.#rangeAnchor = null
        if (!info) {
            this.#handleNoteDelete(tracks)
            return
        }
        for (let t = info.trackMin; t <= info.trackMax; t++) {
            const track = tracks[t]
            if (!track) continue
            const notes = [...(track.notes ?? [])]
            for (const note of notes) {
                if (this.#cellInInfoRange(t, note.beat, note.beatStep, track, info)) {
                    this.#serviceRegistry.cmd.deleteNote(track, note)
                }
            }
            this.#updateTrackCellsInPlace(t, track, pattern)
        }
        this.#selNote = null
        this.#selTrackIdx = this.#cursorTrackIdx
        this.#applySelection()
    }

    #applyRangeClasses(tracks) {
        const info = this.#getRangeInfo(tracks)
        if (!info) return
        for (const [key, cell] of this.#cellMap) {
            const parts = key.split(':')
            const tIdx = Number(parts[0])
            const beat = Number(parts[1])
            const step = Number(parts[2])
            const track = tracks[tIdx]
            if (!track) continue
            if (this.#cellInInfoRange(tIdx, beat, step, track, info)) cell.classList.add('pp-range')
        }
    }

    #copyStep(tracks) {
        const track = tracks[this.#cursorTrackIdx]
        if (!track) return
        const notes = (track.notes ?? [])
            .filter((n) => n.beat === this.#cursorBeat && n.beatStep === this.#cursorBeatStep)
            .map((n) => ({ ...n }))
        this.#clipboard = { type: 'step', notes }
        showToast(
            notes.length > 0
                ? `Copied ${this.#notesLabel(notes.length)} — ${track.name} @ ${this.#stepLabel()}`
                : `Copied empty step — ${track.name} @ ${this.#stepLabel()}`,
            'success',
        )
    }

    #copyTrack(tracks) {
        const idx =
            this.#selTrackIdx !== -1
                ? this.#selTrackIdx
                : this.#cursorTrackIdx !== -1
                  ? this.#cursorTrackIdx
                  : (this.#appState.selectedTrackNum ?? -1)
        const track = tracks[idx]
        if (!track) return
        const noteCount = (track.notes ?? []).length
        this.#clipboard = { type: 'track', track: structuredClone(track) }
        showToast(`Copied track "${track.name}" (${this.#notesLabel(noteCount)})`, 'success')
    }

    #pasteClipboard(pattern, tracks) {
        if (!this.#clipboard) {
            showToast('Clipboard is empty', 'info')
            return
        }
        if (this.#clipboard.type === 'track') {
            this.#pasteTrack(pattern, tracks)
            return
        }
        if (this.#cursorTrackIdx === -1) {
            this.#cursorTrackIdx = 0
            this.#cursorBeat = 0
            this.#cursorBeatStep = 0
        }
        const track = tracks[this.#cursorTrackIdx]
        if (!track) return
        const notes = this.#clipboard.notes ?? []
        this.#serviceRegistry.cmd.pasteStepNotes(track, this.#cursorBeat, this.#cursorBeatStep, notes)
        this.#updateTrackCellsInPlace(this.#cursorTrackIdx, track, pattern)
        this.#applySelection()
        this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        showToast(
            notes.length > 0
                ? `Pasted ${this.#notesLabel(notes.length)} — ${track.name} @ ${this.#stepLabel()}`
                : `Pasted empty step — ${track.name} @ ${this.#stepLabel()}`,
            'success',
        )
    }

    #pasteTrack(pattern, tracks) {
        if (!this.#clipboard || this.#clipboard.type !== 'track') return
        const insertAfter =
            this.#cursorTrackIdx !== -1
                ? this.#cursorTrackIdx
                : this.#selTrackIdx !== -1
                  ? this.#selTrackIdx
                  : tracks.length - 1
        const clone = this.#serviceRegistry.cmd.pasteTrack(pattern, insertAfter + 1, this.#clipboard.track)
        if (!clone) return
        this.#emitStructureChange()
        const noteCount = (clone.notes ?? []).length
        showToast(`Pasted track "${clone.name}" (${this.#notesLabel(noteCount)})`, 'success')
    }

    #notesLabel(count) {
        return `${count} note${count === 1 ? '' : 's'}`
    }

    #stepLabel() {
        return `beat ${this.#cursorBeat + 1}.${this.#cursorBeatStep + 1}`
    }

    #onContextMenu(e) {
        const trackEl = e.target.closest('.pp-track:not(.pp-master-track)')
        if (!trackEl) {
            this.#hideContextMenu()
            return
        }
        const trackNameEl = trackEl.querySelector('.pp-track-name[data-track]')
        const trackIdx = parseInt(trackNameEl?.dataset.track, 10)
        if (isNaN(trackIdx)) return

        const cellEl = e.target.closest('.pp-cell')
        if (cellEl) {
            const beat = parseInt(cellEl.dataset.beat, 10)
            const beatStep = parseInt(cellEl.dataset.step, 10)
            if (!isNaN(beat) && !isNaN(beatStep)) {
                e.preventDefault()
                this.#showCellContextMenu(trackIdx, beat, beatStep, e.clientX, e.clientY)
                return
            }
        }

        e.preventDefault()
        this.#showContextMenu(trackIdx, e.clientX, e.clientY)
    }

    #buildContextMenu(headerText, actions, x, y) {
        this.#hideContextMenu()
        const menu = document.createElement('div')
        menu.className = 'pp-context-menu'
        menu.setAttribute('role', 'menu')
        menu.style.left = `${x}px`
        menu.style.top = `${y}px`

        const header = document.createElement('div')
        header.className = 'pp-context-menu-header'
        header.textContent = headerText
        menu.appendChild(header)

        const sep = document.createElement('div')
        sep.className = 'pp-context-menu-sep'
        menu.appendChild(sep)

        for (const item of actions) {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'pp-context-menu-item'
            btn.setAttribute('role', 'menuitem')
            btn.textContent = item.label
            if (item.disabled) {
                btn.disabled = true
                btn.setAttribute('aria-disabled', 'true')
            } else {
                btn.addEventListener('click', () => {
                    this.#hideContextMenu()
                    item.run()
                })
            }
            menu.appendChild(btn)
        }

        document.body.appendChild(menu)
        this.#contextMenuEl = menu
        this.#clampContextMenu()
        this.#bindContextMenuDismiss()
    }

    #showCellContextMenu(trackIdx, beat, beatStep, x, y) {
        this.#hideContextMenu()
        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (!track) return

        const canPasteNotes = this.#clipboard?.type === 'step' && (this.#clipboard.notes?.length ?? 0) > 0
        const notesAtStep = (track.notes ?? []).filter((n) => n.beat === beat && n.beatStep === beatStep)
        const header = `${track.name ?? 'Track'} @ ${beat + 1}.${beatStep + 1}`
        const actions = [
            { label: 'Copy notes', run: () => this.#menuCopyNotes(tracks, trackIdx, beat, beatStep) },
            {
                label: 'Paste notes',
                disabled: !canPasteNotes,
                run: () => this.#menuPasteNotes(pattern, tracks, trackIdx, beat, beatStep),
            },
            {
                label: 'Delete note',
                disabled: notesAtStep.length === 0,
                run: () => this.#menuDeleteNote(pattern, tracks, trackIdx, beat, beatStep),
            },
            { label: 'Add rnd note', run: () => this.#menuAddRndNote(pattern, tracks, trackIdx, beat, beatStep) },
        ]
        this.#buildContextMenu(header, actions, x, y)
    }

    #showContextMenu(trackIdx, x, y) {
        this.#hideContextMenu()
        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (!track) return

        const canPasteTrack = this.#clipboard?.type === 'track'
        const actions = [
            { label: 'Copy track', run: () => this.#menuCopyTrack(tracks, trackIdx) },
            {
                label: 'Paste tracks',
                disabled: !canPasteTrack,
                run: () => this.#menuPasteTrack(pattern, tracks, trackIdx),
            },
            { label: 'Duplicate track', run: () => this.#menuDuplicateTrack(pattern, tracks, trackIdx) },
            { label: 'Delete track', run: () => this.#menuDeleteTrack(pattern, tracks, trackIdx) },
            { label: 'Randomize', run: () => this.#menuRandomizeTrack(track, pattern) },
            { label: 'Clear notes', run: () => this.#menuClearTrackNotes(track, pattern, trackIdx) },
        ]
        this.#buildContextMenu(track.name ?? 'Track', actions, x, y)
    }

    #clampContextMenu() {
        const menu = this.#contextMenuEl
        if (!menu) return
        const rect = menu.getBoundingClientRect()
        const maxLeft = Math.max(0, window.innerWidth - rect.width - 4)
        const maxTop = Math.max(0, window.innerHeight - rect.height - 4)
        const left = Math.min(parseFloat(menu.style.left) || 0, maxLeft)
        const top = Math.min(parseFloat(menu.style.top) || 0, maxTop)
        menu.style.left = `${left}px`
        menu.style.top = `${top}px`
    }

    #bindContextMenuDismiss() {
        const dismiss = (e) => {
            if (this.#contextMenuEl && !this.#contextMenuEl.contains(e.target)) this.#hideContextMenu()
        }
        const onKey = (e) => {
            if (e.key === 'Escape') this.#hideContextMenu()
        }
        document.addEventListener('click', dismiss, true)
        document.addEventListener('contextmenu', dismiss, true)
        document.addEventListener('keydown', onKey, true)
        this.#contextMenuDismiss = () => {
            document.removeEventListener('click', dismiss, true)
            document.removeEventListener('contextmenu', dismiss, true)
            document.removeEventListener('keydown', onKey, true)
        }
    }

    #hideContextMenu() {
        if (this.#contextMenuDismiss) {
            this.#contextMenuDismiss()
            this.#contextMenuDismiss = null
        }
        if (this.#contextMenuEl) {
            this.#contextMenuEl.remove()
            this.#contextMenuEl = null
        }
    }

    #menuCopyTrack(tracks, trackIdx) {
        this.#selTrackIdx = trackIdx
        this.#cursorTrackIdx = trackIdx
        this.#copyTrack(tracks)
    }

    #menuPasteTrack(pattern, tracks, trackIdx) {
        if (!this.#clipboard || this.#clipboard.type !== 'track') {
            showToast('Clipboard does not contain a track', 'info')
            return
        }
        this.#cursorTrackIdx = trackIdx
        this.#pasteTrack(pattern, tracks)
    }

    #menuDuplicateTrack(pattern, tracks, trackIdx) {
        const source = tracks[trackIdx]
        if (!source) return
        const clone = this.#serviceRegistry.cmd.pasteTrack(pattern, trackIdx + 1, source)
        if (!clone) return
        this.#emitStructureChange()
        showToast(`Duplicated track as "${clone.name}"`, 'success')
    }

    #menuDeleteTrack(pattern, tracks, trackIdx) {
        if (tracks.length <= 1) {
            showToast('Cannot delete the last track', 'warning')
            return
        }
        this.#serviceRegistry.cmd.removeTrack(pattern, trackIdx)
        this.#selTrackIdx = -1
        this.#rangeAnchor = null
        if (this.#cursorTrackIdx === trackIdx) this.#cursorTrackIdx = -1
        else if (this.#cursorTrackIdx > trackIdx) this.#cursorTrackIdx--
        this.#emitStructureChange()
        showToast('Track deleted', 'success')
    }

    #menuRandomizeTrack(track, pattern) {
        this.#serviceRegistry.cmd.randomizeTrack(track, pattern)
        this.#serviceRegistry.audioEngine?.invalidateCache()
        this.#trackDataDirty = true
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit(EVENTS.NOTE_CHANGE)
            this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
        this.requestSync()
        showToast(`Randomized "${track.name}"`, 'success')
    }

    #menuClearTrackNotes(track, pattern, trackIdx) {
        this.#serviceRegistry.cmd.cleanTrack(track)
        this.#updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit(EVENTS.NOTE_CHANGE)
            this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
        showToast(`Cleared notes on "${track.name}"`, 'success')
    }

    #menuCopyNotes(tracks, trackIdx, beat, beatStep) {
        const track = tracks[trackIdx]
        if (!track) return
        const notes = (track.notes ?? [])
            .filter((n) => n.beat === beat && n.beatStep === beatStep)
            .map((n) => ({ ...n }))
        this.#clipboard = { type: 'step', notes }
        this.#cursorTrackIdx = trackIdx
        this.#cursorBeat = beat
        this.#cursorBeatStep = beatStep
        const stepLabel = `beat ${beat + 1}.${beatStep + 1}`
        showToast(
            notes.length > 0
                ? `Copied ${this.#notesLabel(notes.length)} — ${track.name} @ ${stepLabel}`
                : `Copied empty step — ${track.name} @ ${stepLabel}`,
            'success',
        )
    }

    #menuPasteNotes(pattern, tracks, trackIdx, beat, beatStep) {
        if (!this.#clipboard || this.#clipboard.type !== 'step' || (this.#clipboard.notes?.length ?? 0) === 0) {
            showToast('Clipboard has no notes', 'info')
            return
        }
        const track = tracks[trackIdx]
        if (!track) return
        const notes = this.#clipboard.notes
        this.#serviceRegistry.cmd.pasteStepNotes(track, beat, beatStep, notes)
        this.#cursorTrackIdx = trackIdx
        this.#cursorBeat = beat
        this.#cursorBeatStep = beatStep
        this.#updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#applySelection()
        this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        const stepLabel = `beat ${beat + 1}.${beatStep + 1}`
        showToast(`Pasted ${this.#notesLabel(notes.length)} — ${track.name} @ ${stepLabel}`, 'success')
    }

    #menuDeleteNote(pattern, tracks, trackIdx, beat, beatStep) {
        const track = tracks[trackIdx]
        if (!track) return
        const notes = (track.notes ?? []).filter((n) => n.beat === beat && n.beatStep === beatStep)
        if (notes.length === 0) {
            showToast('No note to delete', 'info')
            return
        }
        for (const note of [...notes]) {
            this.#serviceRegistry.cmd.deleteNote(track, note)
        }
        this.#cursorTrackIdx = trackIdx
        this.#cursorBeat = beat
        this.#cursorBeatStep = beatStep
        if (this.#selNote && notes.includes(this.#selNote)) {
            this.#selNote = null
            this.#selTrackIdx = -1
        }
        this.#updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#applySelection()
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit(EVENTS.NOTE_CHANGE)
            this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        })
        const stepLabel = `beat ${beat + 1}.${beatStep + 1}`
        showToast(`Deleted ${this.#notesLabel(notes.length)} — ${track.name} @ ${stepLabel}`, 'success')
    }

    #menuAddRndNote(pattern, tracks, trackIdx, beat, beatStep) {
        const track = tracks[trackIdx]
        if (!track) return
        const range = Math.max(1, track.pitch_range ?? 12)
        const pitch = Math.floor(Math.random() * (range * 2 + 1)) - range
        const note = this.#serviceRegistry.cmd.addNote(track, beat, beatStep, pitch)
        this.#cursorTrackIdx = trackIdx
        this.#cursorBeat = beat
        this.#cursorBeatStep = beatStep
        this.#selNote = note ?? null
        this.#selTrackIdx = trackIdx
        this.#updateTrackCellsInPlace(trackIdx, track, pattern)
        this.#applySelection()
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit(EVENTS.NOTE_CHANGE)
            this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE, [track])
        })
        this.#serviceRegistry.seq?.simpleBeep(trackIdx, note)
        showToast(`Added note (pitch ${pitch}) — ${track.name} @ beat ${beat + 1}.${beatStep + 1}`, 'success')
    }

    #onClick(e) {
        this.#rangeAnchor = null

        const actionBtn = e.target.closest('.pp-action-btn')
        if (actionBtn) {
            this.#onAction(actionBtn.dataset.ppAction)
            return
        }

        const masterTrackEl = e.target.closest('.pp-master-track')
        if (masterTrackEl) {
            this.#playbackEvents.emit(EVENTS.MASTER_TOGGLE, true)
            return
        }

        const trackEl = e.target.closest('.pp-track')
        if (
            trackEl &&
            !e.target.closest('.pp-track-name') &&
            !e.target.closest('.pp-divider') &&
            !e.target.closest('.pp-solo') &&
            !e.target.closest('.pp-cell') &&
            !e.target.closest('.pp-volume')
        ) {
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
            const trackNum = Utils.getTracksArray(pattern).length + 1
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
                    this.#playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx })
                    this.#playbackEvents.emit(EVENTS.NOTE_SELECT, { track, trackIdx, note, pos, beat, beatStep })
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
            this.#playbackEvents.emit(EVENTS.TRACK_SELECT, { track, trackIdx })
            this.#playbackEvents.emit(EVENTS.NOTE_SELECT, { track, trackIdx, note: newNote, pos, beat, beatStep })
        })

        this.#serviceRegistry.seq?.simpleBeep(trackIdx, newNote)
    }

    #clearSelection() {
        this.#selNote = null
        this.#selTrackIdx = -1
        this.#rangeAnchor = null
        const selected = this.container.querySelectorAll(
            '.pp-cell.selected, .pp-track-name.selected, .pp-track.pp-selected, .pp-note-slice.selected, .pp-cell.pp-range',
        )
        selected.forEach((el) => el.classList.remove('selected', 'pp-selected', 'pp-range'))
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit(EVENTS.NOTE_SELECT, null)
            this.#playbackEvents.emit(EVENTS.TRACK_SELECT, null)
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
                cmd.resetPage()
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
            this.#playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    #applySelection() {
        const selected = this.container.querySelectorAll(
            '.pp-cell.selected, .pp-track-name.selected, .pp-cell.cursor, .pp-note-slice.selected, .pp-track.pp-selected, .pp-cell.pp-range',
        )
        selected.forEach((el) => el.classList.remove('selected', 'cursor', 'pp-selected', 'pp-range'))

        const pattern = this.#appState.patterns[this.#appState.selectedPatternNum]
        const tracks = pattern ? Utils.getTracksArray(pattern) : []
        if (this.#rangeAnchor && tracks.length > 0) this.#applyRangeClasses(tracks)

        const currentTrackIdx = this.#selTrackIdx !== -1 ? this.#selTrackIdx : (this.#appState.selectedTrackNum ?? -1)

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
                        const notes = (
                            this.#appState.patterns[this.#appState.selectedPatternNum]
                                ? (Utils.getTracksArray(this.#appState.patterns[this.#appState.selectedPatternNum])?.[
                                      trackIdx
                                  ]?.notes ?? [])
                                : []
                        ).filter((n) => n.beat === beat && n.beatStep === step)
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
                requestAnimationFrame(() => {
                    this.container.style.minHeight = ''
                })
            }
            return
        }

        // Structure (stepsPerBeat/nbBeats) can change via TRACK_PARAM_CHANGE or
        // undo without PATTERN_META_CHANGE — detect it and force a full rebuild
        // so the DOM cell count per beat matches the track.
        const structureSig = `${pattern.nbBeats ?? 4}|${tracks
            .map((t) => `${t?.stepsPerBeat ?? 4}:${t?.nbBeats ?? 4}`)
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
    get tracksEl() {
        return this.#tracksEl
    }

    get selTrackIdx() {
        return this.#selTrackIdx
    }
    get selNote() {
        return this.#selNote
    }
    get cursorBeat() {
        return this.#cursorBeat
    }
    get cursorBeatStep() {
        return this.#cursorBeatStep
    }
    get cursorTrackIdx() {
        return this.#cursorTrackIdx
    }
    get clipboard() {
        return this.#clipboard
    }
    get rangeAnchor() {
        return this.#rangeAnchor
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
        return this.#onAction(action)
    }
}
