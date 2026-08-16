import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { TICK, isMobileViewport } from '../core/constants.js'

import Utils from '../core/utils.js'
import BasePanel from './base_panel.js'
import { logger, nameOr } from "../core/logger.js"
import { downloadJson, pitchToNoteName, formatNoteTooltip } from './components/panel_helpers.js'

const BEATS_PER_PAGE = 4

export default class PatternPanel extends BasePanel {
    constructor() {
        super('pattern-panel')
        this._selNote = null
        this._selTrackIdx = -1
        this._rafId = null
        this._syncRafId = null
        this._prevLoopTick = -1
        this._playhead = null
        this._syncPending = false
        this._beatRectsCache = []
        this._cursorTrackIdx = -1
        this._cursorBeat = 0
        this._cursorBeatStep = 0
        this._cellMap = new Map()
        this._vuElCache = null
        this._trackDataDirty = true
        this._trackDataCache = new Map()
        this._cachedPage = -1
        this._cachedVersion = -1
    }

    createDOM() {
        super.createDOM()
        this.container.style.display = 'block'
        this.container.setAttribute('tabindex', '0')
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

    _ensurePlayhead() {
        if (!this._playhead || !this.container.contains(this._playhead)) {
            if (this._playhead) this._playhead.remove()
            this._playhead = document.createElement('div')
            this._playhead.className = 'pp-playhead'
            this._playhead.style.display = 'none'
            this._playhead.style.position = 'absolute'
            this._playhead.style.left = '0'
            this._playhead.style.top = '0'
            this._playhead.style.bottom = '0'
            this._playhead.style.zIndex = '10'
            this._playhead.style.pointerEvents = 'none'
            const header = this.container.querySelector('.pp-header')
            if (header) {
                header.appendChild(this._playhead)
            } else {
                this.container.appendChild(this._playhead)
            }
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

        const pattern = appState.patterns[appState.selectedPatternNum]
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
        const notePitch = note.pitch ?? 0
        const totalPitch = trackPitch + notePitch
        const noteName = pitchToNoteName(totalPitch)

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
        playbackEvents.onPatternChange.push(() => {
            this._prevLoopTick = -1
            this._trackDataDirty = true
            this.requestSync()
        })
        playbackEvents.onLoopPointChange.push((data) => {
            if (data && typeof data.trackIdx === 'number' && typeof data.loopAtStep === 'number') {
                this.updateLoopPoint(data.trackIdx, data.loopAtStep)
            }
        })
        playbackEvents.onPlaybackStop.push(() => {
            this._prevLoopTick = -1
            this._stopRafLoop()
            if (this._playhead) this._playhead.style.display = 'none'
            this._resetVuAndWaveform()
        })
        playbackEvents.onPlaybackStart.push(() => {
            this._updateBarCache()
            this._startRafLoop()
        })
        playbackEvents.onNoteTrigger.push((data) => {
            if (!this.container || !data) return
            const cell = this._cellMap.get(`${data.trackIdx}:${data.beat}:${data.beatStep}`)
            if (!cell) return
            cell.classList.add('pp-triggered')
            clearTimeout(cell._triggerTimer)
            cell._triggerTimer = setTimeout(() => cell.classList.remove('pp-triggered'), 120)
        })
        playbackEvents.onTrackParamChange.push(() => {
            this._syncVusVisibility()
            this._updateBarCache()
        })
        playbackEvents.onTrackSelect.push((data) => {
            if (data) {
                this._selTrackIdx = data.trackIdx
                this._selNote = null
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
        const tracksRect    = tracksEl.getBoundingClientRect()
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
            // Wait for DOM to settle
            requestAnimationFrame(() => this._updateBarCache())
        })
    }

    forceSync() {
        if (this._syncRafId) cancelAnimationFrame(this._syncRafId)
        this._syncPending = false
        this._syncRafId = requestAnimationFrame(() => {
            this.sync()
            this._syncPending = false
            this._syncRafId = null
            requestAnimationFrame(() => this._updateBarCache())
        })
    }

    _startRafLoop() {
        if (this._rafId) return
        // Cache static element refs for the loop
        this._waveformCanvas = this.container?.querySelector('.pp-waveform-overlay')
        this._tracksEl       = this.container?.querySelector('.pp-tracks')
        this._vuElCache      = this.container?.querySelectorAll('.pp-vu')

        const loop = () => {
            const transport = serviceRegistry.transport
            const mixer = serviceRegistry.audioEngine?.mixer
            if (!transport?.isRunning || !mixer || !this.container) {
                this._rafId = null
                if (this._playhead) this._playhead.style.display = 'none'
                this._resetVuAndWaveform()
                return
            }

            this._updateVus(mixer)
            this._drawWaveform(mixer)
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
        this._waveformCanvas = null
        this._tracksEl       = null
        this._vuElCache      = null
    }

    _updateVus(mixer) {
        if (appState.showVus === false) return
        if (!this._vuElCache) {
            this._vuElCache = this.container?.querySelectorAll('.pp-vu')
            if (!this._vuElCache) return
        }
        const strips = mixer.strips
        const vuEls = this._vuElCache
        const currentPattern = appState.patterns[appState.selectedPatternNum]
        const tracks = Utils.getTracksArray(currentPattern)
        for (const vuEl of vuEls) {
            // Use cached track index if available
            let tIdx = vuEl._tIdx
            if (tIdx === undefined) {
                tIdx = vuEl._tIdx = parseInt(vuEl.dataset.track, 10)
            }
            const track = tracks?.[tIdx]
            const strip = track?.name ? strips[track.name] : null
            const level = strip?.getLevel ? strip.getLevel() : 0
            
            let fill = vuEl._fill
            if (!fill) fill = vuEl._fill = vuEl.querySelector('.pp-vu-fill')
            
            if (fill) {
                const pct = Math.min(level * 10, 1) * 100
                fill.style.height = pct + '%'
            }
        }
    }

    _drawWaveform(mixer) {
        if (appState.showVus === false) return
        if (!this._waveformCanvas) {
            this._waveformCanvas = this.container?.querySelector('.pp-waveform-overlay')
        }
        const canvas = this._waveformCanvas
        if (!canvas || !this._layoutCache) return

        if (!this._tracksEl) {
            this._tracksEl = this.container?.querySelector('.pp-tracks')
        }
        const tracksEl = this._tracksEl
        if (!tracksEl) return

        const dpr = window.devicePixelRatio ?? 1
        
        // Find visible grid area using cached rects
        const firstBeatCache = this._beatRectsCache[appState.currentPage * 4]
        const lastBeatIdx = Math.min(this._beatRectsCache.length - 1, (appState.currentPage + 1) * 4 - 1)
        const lastBeatCache = this._beatRectsCache[lastBeatIdx]
        
        if (!firstBeatCache || !lastBeatCache) return

        const { containerLeft, containerRight, tracksLeft, tracksHeight } = this._layoutCache

        const visibleLeft = Math.max(firstBeatCache.absLeft, containerLeft)
        const visibleRight = Math.min(lastBeatCache.absRight, containerRight)
        const vW = Math.max(0, visibleRight - visibleLeft)
        const vH = tracksHeight
        
        if (vW <= 0 || vH <= 0) {
            if (canvas.style.display !== 'none') canvas.style.display = 'none'
            return
        }
        if (canvas.style.display !== 'block') canvas.style.display = 'block'

        // Position canvas to cover the visible grid area
        const canvasLeft = (visibleLeft - tracksLeft) + 'px'
        const canvasTop  = tracksEl.scrollTop + 'px'
        const canvasWidth = vW + 'px'
        const canvasHeight = vH + 'px'

        if (canvas.style.left !== canvasLeft) canvas.style.left = canvasLeft
        if (canvas.style.top !== canvasTop) canvas.style.top = canvasTop
        if (canvas.style.width !== canvasWidth) canvas.style.width = canvasWidth
        if (canvas.style.height !== canvasHeight) canvas.style.height = canvasHeight

        const w = Math.round(vW * dpr)
        const h = Math.round(vH * dpr)
        
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
        }

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        
        const data = serviceRegistry.audioEngine?.getAnalyserData?.()
        if (!data) {
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, w, h)
            return
        }

        data.analyser.getByteTimeDomainData(data.dataArray)
        
        // Clear background
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, w, h)
        
        // Draw main waveform
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()
        
        const sliceW = w / data.dataArray.length
        const mid = h * 0.5
        
        for (let i = 0; i < data.dataArray.length; i++) {
            const v = (data.dataArray[i] - 128) / 128
            const x = i * sliceW
            const y = v * h * 0.45 + mid
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
    }

    _syncVusVisibility() {
        if (!this.container) return
        const hidden = appState.showVus === false
        this.container.classList.toggle('pp-vus-hidden', hidden)
        
        // Reset cached display states if we just hid them
        if (hidden && this._waveformCanvas) {
            this._waveformCanvas.style.display = ''
        }
    }

    _resetVuAndWaveform() {
        if (!this.container) return
        const vuEls = this._vuElCache ?? this.container.querySelectorAll('.pp-vu')
        for (const vuEl of vuEls) {
            const fill = vuEl.querySelector('.pp-vu-fill')
            if (fill) {
                fill.style.height = '0%'
            }
        }
        const canvas = this.container.querySelector('.pp-waveform-overlay')
        if (canvas) {
            const ctx = canvas.getContext('2d')
            if (ctx) {
                ctx.fillStyle = '#000'
                ctx.fillRect(0, 0, canvas.width, canvas.height)
            }
        }
    }

    _updatePlayhead() {
        const transport = serviceRegistry.transport
        if (!transport?.isRunning) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern || !this.container || !this._layoutCache) return
        this._ensurePlayhead()

        const nbTicks = TICK * (pattern.nbBeats ?? 4)
        if (nbTicks <= 0) return

        const loopTick = (transport.tick ?? 0) % nbTicks
        
        if (loopTick === this._prevLoopTick && this._playhead.style.display !== 'none') return
        this._prevLoopTick = loopTick

        const currentPatternBeat = Math.floor(loopTick / TICK)
        const startBeat = appState.currentPage * BEATS_PER_PAGE
        const endBeat = startBeat + BEATS_PER_PAGE

        if (currentPatternBeat < startBeat || currentPatternBeat >= endBeat) {
            const newPage = Math.floor(currentPatternBeat / BEATS_PER_PAGE)
            if (newPage !== appState.currentPage) {
                appState.currentPage = newPage
                this.requestSync()
                playbackEvents.dispatchPatternChange()
            }
            if (this._playhead.style.display !== 'none') this._playhead.style.display = 'none'
            return
        }

        const beatCache = this._beatRectsCache[currentPatternBeat]
        if (!beatCache) {
            if (this._playhead.style.display !== 'none') this._playhead.style.display = 'none'
            return
        }

        const tickInBar = loopTick % TICK
        const normInBar = tickInBar / TICK

        if (this._playhead.style.display !== 'block') this._playhead.style.display = 'block'
        const x = beatCache.left + normInBar * beatCache.width
        
        this._playhead.style.transform = `translateX(${x}px)`
        if (this._playhead.style.width !== '2px') this._playhead.style.width = `2px`
    }

    _onFocus() {
        if (this._cursorTrackIdx === -1) {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const tracks = Utils.getTracksArray(pattern)
            if (tracks.length === 0) return
            this._cursorTrackIdx = 0
            this._cursorBeat = 0
            this._cursorBeatStep = 0
            this._selTrackIdx = 0
            this._applySelection()
        }
    }

    _onKeyDown(e) {
        const pattern = appState.patterns[appState.selectedPatternNum]
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
                                serviceRegistry.mfCmd.deleteNote(track, note)
                                this._clearSelection()
                            } else {
                                this._selNote = note
                                this._selTrackIdx = this._cursorTrackIdx
                                this._applySelection()
                                const pos = this._cursorBeat * (track.stepsPerBeat ?? 4) + this._cursorBeatStep
                                playbackEvents.dispatchNoteSelect({ track, trackIdx: this._cursorTrackIdx, note, pos, beat: this._cursorBeat, beatStep: this._cursorBeatStep })
                            }
                        } else {
                            const newNote = serviceRegistry.mfCmd.addNote(track, this._cursorBeat, this._cursorBeatStep)
                            this._selNote = newNote
                            this._selTrackIdx = this._cursorTrackIdx
                            this._applySelection()

                            const pos = this._cursorBeat * (track.stepsPerBeat ?? 4) + this._cursorBeatStep
                            playbackEvents.dispatchNoteSelect({ track, trackIdx: this._cursorTrackIdx, note: newNote, pos, beat: this._cursorBeat, beatStep: this._cursorBeatStep })
                        }
                        this.sync()
                    }
                }
                break
            default:
                return
        }

        const track = tracks[this._cursorTrackIdx]
        if (!track) return

        const startBeat = appState.currentPage * BEATS_PER_PAGE
        if (this._cursorBeat < startBeat || this._cursorBeat >= startBeat + BEATS_PER_PAGE) {
            appState.currentPage = Math.floor(this._cursorBeat / BEATS_PER_PAGE)
        }

        const note = (track.notes ?? []).find(n => n.beat === this._cursorBeat && n.beatStep === this._cursorBeatStep)
        this._selNote = note ?? null
        this._selTrackIdx = this._cursorTrackIdx
        this.sync()
        if (note) {
            playbackEvents.dispatchNoteSelect({ track, trackIdx: this._cursorTrackIdx, note, pos: this._cursorBeat * stepsPerBeat + this._cursorBeatStep, beat: this._cursorBeat, beatStep: this._cursorBeatStep })
        } else {
            playbackEvents.dispatchNoteSelect({ track, trackIdx: this._cursorTrackIdx, note: null, beat: this._cursorBeat, beatStep: this._cursorBeatStep })
        }
    }

    _resolveTrack(idx) {
        const pattern = appState.patterns[appState.selectedPatternNum]
        const tracks = Utils.getTracksArray(pattern)
        return tracks[idx] ?? null
    }

    _selectTrack(trackIdx) {
        const track = this._resolveTrack(trackIdx)
        if (!track) return
        this._cursorTrackIdx = trackIdx

        if (this._selTrackIdx === trackIdx && !this._selNote) {
            if (isMobileViewport()) {
                playbackEvents.dispatchTrackSelect({ track, trackIdx })
            } else {
                this._clearSelection()
            }
        } else {
            this._selNote = null
            this._selTrackIdx = trackIdx
            this._applySelection()
            playbackEvents.dispatchTrackSelect({ track, trackIdx })
        }
    }

    _toggleTrackProp(idx, prop) {
        const track = this._resolveTrack(idx)
        if (!track) return
        track[prop] = track[prop] !== true
        this.sync()
    }

    _onClick(e) {
        const actionBtn = e.target.closest('.pp-action-btn')
        if (actionBtn) {
            this._onAction(actionBtn.dataset.ppAction)
            return
        }

        const masterTrackEl = e.target.closest('.pp-master-track')
        if (masterTrackEl) {
            playbackEvents.dispatchOutputToggle(true)
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
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const trackNum = (Utils.getTracksArray(pattern).length) + 1
            serviceRegistry.mfCmd?.addTrack(pattern, `T${trackNum}`)
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

        const pattern = appState.patterns[appState.selectedPatternNum]
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
                serviceRegistry.mfCmd.deleteNote(track, note)
                this._clearSelection()

                requestAnimationFrame(() => this.sync())
            } else {
                this._selNote = note
                this._selTrackIdx = trackIdx
                this._applySelection()
                const pos = beat * (track.stepsPerBeat ?? 4) + beatStep
                playbackEvents.dispatchNoteSelect({ track, trackIdx, note, pos, beat, beatStep })
            }
            return
        }

        const newNote = serviceRegistry.mfCmd.addNote(track, beat, beatStep)
        this._selNote = newNote
        this._selTrackIdx = trackIdx
        this._applySelection()

        const pos = beat * (track.stepsPerBeat ?? 4) + beatStep
        playbackEvents.dispatchNoteSelect({ track, trackIdx, note: newNote, pos, beat, beatStep })

        requestAnimationFrame(() => this.sync())
    }

    _clearSelection() {
        this._selNote = null
        this._selTrackIdx = -1
        const selected = this.container.querySelectorAll('.pp-cell.selected, .pp-track-name.selected, .pp-track.pp-selected')
        selected.forEach(el => el.classList.remove('selected', 'pp-selected'))
        playbackEvents.dispatchNoteSelect(null)
        playbackEvents.dispatchTrackSelect(null)
    }

    async _onAction(action) {
        const idx = appState.selectedPatternNum
        const pattern = appState.patterns[idx]
        if (!pattern && action !== 'replace') return
        const mfCmd = serviceRegistry.mfCmd
        const mfPatterns = serviceRegistry.mfPatterns

        switch (action) {
            case 'delete': {
                if (appState.patterns.length <= 1) return
                if (!confirm('Delete pattern "' + (pattern.name ?? '') + '"?')) return
                mfCmd.removePattern(idx)
                playbackEvents.dispatchPatternChange()
                break
            }
            case 'clean': {
                if (!confirm('Clear all notes in "' + (pattern.name ?? '') + '"?')) return
                mfCmd.cleanPattern(pattern)
                mfPatterns?.computeFlatNotesFromPattern(pattern)
                playbackEvents.dispatchPatternChange()
                break
            }
            case 'duplicate': {
                const clone = mfCmd.addPattern((pattern.name ?? 'Pattern') + ' copy')
                Object.assign(clone, structuredClone(pattern))
                clone.name = (pattern.name ?? 'Pattern') + ' copy'
                const newIdx = appState.patterns.length - 1
                await mfCmd.setSelectedPatternNum(newIdx)
                playbackEvents.dispatchPatternChange()
                break
            }
            case 'rename': {
                const newName = prompt('Rename pattern:', pattern.name ?? '')
                if (newName === null || newName.trim() === '') return
                mfCmd.renamePattern(idx, newName.trim())
                playbackEvents.dispatchPatternChange()
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
                    mfCmd.importPatternFromJson(data)
                    playbackEvents.dispatchPatternChange()
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
            : (appState.selectedTrackNum ?? -1)

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
                        const notes = (appState.patterns[appState.selectedPatternNum]
                            ? (Utils.getTracksArray(appState.patterns[appState.selectedPatternNum])?.[trackIdx]?.notes ?? [])
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
            const pattern = appState.patterns[appState.selectedPatternNum]
            const tracks = Utils.getTracksArray(pattern)
            const track = tracks[trackIdx]
            if (!track) return
            track.velocity = parseFloat(volSlider.value)
            serviceRegistry.audioEngine?.syncTrack(track)
        }
        const masterSlider = e.target.closest('.pp-master-volume')
        if (masterSlider) {
            const value = parseFloat(masterSlider.value)
            serviceRegistry.audioEngine?.mixer?.setMasterBus({ master: value })
        }
    }

    _getSubPositions(note, track) {
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const basePos = note.beat * stepsPerBeat + note.beatStep
        const retriggerNum = note.retriggerNum ?? 1
        const rate = note.rate ?? 1
        const euclidianFill = note.euclidianFill ?? 0
        const hasArp = note.arp && (typeof note.arp === 'string' || (typeof note.arp === 'object' && !Array.isArray(note.arp) && Array.isArray(note.arp.intervals) && note.arp.intervals.length > 0))
        const totalSteps = (track.nbBeats ?? 4) * stepsPerBeat

        const positions = []
        const stepSpacing = rate < 8 ? rate / 8 : rate - 7
        const count = hasArp || retriggerNum > 1 ? retriggerNum : 0

        for (let i = 1; i < count; i++) {
            const pos = Math.round(basePos + i * stepSpacing)
            if (pos < totalSteps) positions.push({ pos, type: 'retrigger' })
        }

        if (euclidianFill > 0) {
            const endStep = (() => {
                const currentPatternPos = basePos
                let nextNotePos = totalSteps
                for (const n of (track.notes ?? [])) {
                    const nPos = n.beat * stepsPerBeat + n.beatStep
                    if (nPos > currentPatternPos && nPos < nextNotePos) {
                        nextNotePos = nPos
                    }
                }
                return track.loopAtStep && track.loopAtStep > currentPatternPos && track.loopAtStep < nextNotePos
                    ? track.loopAtStep
                    : nextNotePos
            })()

            const stepsSpan = endStep - basePos
            for (let i = 1; i <= euclidianFill; i++) {
                const pos = Math.round(basePos + (i * stepsSpan) / (euclidianFill + 1))
                if (pos < totalSteps) positions.push({ pos, type: 'euclidian' })
            }
        }
        return positions
    }

    sync() {
        if (!this.container) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) {
            if (!this.container.querySelector('.pp-waiting')) {
                this.container.innerHTML = '<div class="pp-header pp-waiting">Waiting for patterns...</div>'
            }
            return
        }

        const tracks = Utils.getTracksArray(pattern)

        const startBeat = appState.currentPage * BEATS_PER_PAGE
        const endBeatPage = startBeat + BEATS_PER_PAGE

        const totalBeats = pattern.nbBeats ?? 4
        const firstStepsPerBeat = tracks[0]?.stepsPerBeat ?? 4
        const totalMeasures = Math.ceil(totalBeats / firstStepsPerBeat)
        const headerHtml = `<div class="pp-header">
            <div class="pp-actions">
                <button class="pp-action-btn" data-pp-action="delete" title="Delete pattern">✕</button>
                <button class="pp-action-btn" data-pp-action="clean" title="Clear all notes">⌫</button>
                <button class="pp-action-btn" data-pp-action="duplicate" title="Duplicate pattern">⧉</button>
                <button class="pp-action-btn" data-pp-action="rename" title="Rename pattern">✎</button>
                <button class="pp-action-btn" data-pp-action="save" title="Save as JSON">↓</button>
                <button class="pp-action-btn" data-pp-action="replace" title="Load / replace pattern">↑</button>
            </div>
            <span class="pp-name">${this.esc(nameOr(pattern.name, 'Unnamed', 'PatternPanel', 'name fallback'))}</span>
            <span class="pp-meta">${pattern.bpm ?? 120} BPM · ${totalBeats} beats (${totalMeasures} measures) · Page ${appState.currentPage + 1}</span>
        </div>`

        if (tracks.length === 0) {
            const prevHeight = this.container.offsetHeight
            this.container.innerHTML = headerHtml + '<div class="pp-empty" style="padding:40px; text-align:center; color:#888;">Empty Pattern</div>'
            if (prevHeight > 0) {
                this.container.style.minHeight = prevHeight + 'px'
                requestAnimationFrame(() => { this.container.style.minHeight = '' })
            }
            return
        }

        this._cellMap.clear()

        const patternVersion = pattern._version ?? 0
        const pageChanged = startBeat !== this._cachedPage
        if (this._trackDataDirty || this._cachedVersion !== patternVersion || pageChanged) {
            this._trackDataCache.clear()
            this._cachedVersion = patternVersion
            this._cachedPage = startBeat
            this._trackDataDirty = false
        }

        let tracksHtml = '<div class="pp-tracks">'
        tracks.forEach((track, tIdx) => {
            if (!track) return
            const stepsPerBeat = track.stepsPerBeat ?? 4
            const totalSteps = (track.nbBeats ?? 4) * stepsPerBeat

            let cached = this._trackDataCache.get(tIdx)
            if (!cached) {
                const notes = Array.isArray(track.notes) ? track.notes : Object.values(nameOr(track.notes, {}, 'PatternPanel', 'track.notes fallback'))

                const noteMap = new Map()
                notes.forEach(n => {
                    const key = `${n.beat}:${n.beatStep}`
                    if (!noteMap.has(key)) noteMap.set(key, [])
                    noteMap.get(key).push(n)
                })

const ghostMap = new Map()
            noteMap.forEach(notes => {
                for (const note of notes) {
                    this._getSubPositions(note, track).forEach(({ pos, type }) => {
                        const stepAbs = Math.floor(pos)
                        const beat = Math.floor(stepAbs / stepsPerBeat)
                        if (beat >= startBeat && beat < endBeatPage) {
                            if (!ghostMap.has(stepAbs)) ghostMap.set(stepAbs, [])
                            ghostMap.get(stepAbs).push({ offset: pos - stepAbs, type })
                        }
                    })
                }
            })

                cached = { noteMap, ghostMap }
                this._trackDataCache.set(tIdx, cached)
            }

            let beatsHtml = '<div class="pp-beats">'
            for (let b = startBeat; b < endBeatPage; b++) {
                let cellsHtml = ''
                if (b < (pattern.nbBeats ?? 4)) {
                    const trackBarCount = track.nbBeats ?? 4
                    for (let s = 0; s < stepsPerBeat; s++) {
                        const absPos = b * stepsPerBeat + s
                        const isBeyondTrack = b >= trackBarCount

                        const notesAtStep = cached.noteMap.get(`${b}:${s}`)

                        const cls = ['pp-cell']
                        if (isBeyondTrack) cls.push('pp-cell-out')

                        let trig = ''
                        let cellStyle = ''
                        let noteSlicesHtml = ''

                        if (notesAtStep && notesAtStep.length > 0) {
                            cls.push('filled')
                            if (notesAtStep.length > 1) cls.push('pp-cell-multi')

                            const slicePct = (100 / notesAtStep.length).toFixed(2)
                            noteSlicesHtml = notesAtStep.map((note, ni) => {
                                const vel = note.velocity ?? 0.8
                                const alpha = 0.25 + vel * 0.75
                                const pitch = note.pitch ?? 0
                                const pct = ((pitch + 24) / 48) * 100
                                return `<div class="pp-note-slice" data-note-idx="${ni}" style="width:${slicePct}%;opacity:${alpha.toFixed(2)}"><div class="pp-pitch-beat" style="bottom:${pct.toFixed(1)}%"></div></div>`
                            }).join('')

                            const firstNote = notesAtStep[0]
                            if ((firstNote.prob ?? 1) < 1) {
                                cls.push('pp-trig-rand')
                                trig = String(Math.round(firstNote.prob * 10))
                            } else if ((firstNote.every ?? 1) > 1) {
                                cls.push('pp-trig-fixed')
                                trig = String(firstNote.every)
                            }
                        }

                        const loopAt = track.loopAtStep ?? totalSteps
                        if (loopAt > 0 && absPos === loopAt - 1) cls.push('pp-loop')

                        const ghosts = (cached.ghostMap.get(absPos) ?? []).map(({ type }) => {
                            const ghostCls = type === 'euclidian' ? 'pp-ghost pp-ghost-euclidian' : 'pp-ghost pp-ghost-retrigger'
                            return `<div class="${ghostCls}"></div>`
                        }).join('')

                        const cellHtml = `<div class="${cls.join(' ')}" data-track="${tIdx}" data-beat="${b}" data-step="${s}" data-pos="${absPos}" ${trig ? `data-trig="${trig}"` : ''}>${ghosts}${noteSlicesHtml}</div>`
                        cellsHtml += cellHtml
                    }
                }
                beatsHtml += `<div class="pp-beat" data-beat="${b}">${cellsHtml}</div>`
            }
            beatsHtml += '</div>'

            const currentTrackIdx = this._selTrackIdx !== -1 ? this._selTrackIdx : (appState.selectedTrackNum ?? -1)
            const isSelected = currentTrackIdx === tIdx
            const isMuted = track.mute === true
            const isSolo = track.solo === true
            const soundUrl = track.soundId && track.soundId !== 'NOT_DEFINED'
                ? (soundRegistry.sounds[track.soundId]?.url ?? track.soundId)
                : ''
            tracksHtml += `
                <div class="pp-track ${isMuted ? 'pp-muted' : ''} ${isSelected ? 'pp-selected' : ''}">
                    <div class="pp-vu ${isSelected ? 'selected' : ''}" data-track="${tIdx}"><div class="pp-vu-fill"></div></div>
                    <div class="pp-track-left">
                        <div class="pp-track-top">
                            <span class="pp-track-name ${isSelected ? 'selected' : ''}" data-track="${tIdx}">${this.esc(nameOr(track.name, 'Track', 'PatternPanel', 'track name fallback'))}</span>
                            <input type="range" class="pp-volume" min="0" max="1" step="0.01" value="${track.velocity ?? 1}" data-track="${tIdx}">
                        </div>
                        ${soundUrl ? `<div class="pp-track-url" title="${this.esc(soundUrl)}">${this.esc(soundUrl)}</div>` : ''}
                    </div>
                    <div class="pp-divider ${isMuted ? 'muted' : ''}" data-track="${tIdx}" role="button" tabindex="0" title="Mute"></div>
                    <div class="pp-solo ${isSolo ? 'active' : ''}" data-track="${tIdx}" role="button" tabindex="0" title="Solo"></div>
                    ${beatsHtml}
                </div>`
        })
        tracksHtml += `<div class="pp-toolbar-row">
            <div class="pp-master-track" id="pp-master-btn">
                <span class="pp-track-name">Master</span>
                <input type="range" class="pp-master-volume" min="0" max="2" step="0.01" value="1" title="Master Gain">
            </div>
            <div class="pp-add-track" id="pp-add-track">+ new track</div>
        </div>`
        tracksHtml += `<canvas class="pp-waveform-overlay"></canvas></div>`

        const prevHeight = this.container.offsetHeight
        this.container.innerHTML = headerHtml + tracksHtml

        const tracksEl = this.container.querySelector('.pp-tracks')
        if (tracksEl) {
            const TRACK_HEIGHT = 46
            const TRACK_GAP = 3
            const MAX_VISIBLE = 10
            if (tracks.length > MAX_VISIBLE) {
                const maxH = MAX_VISIBLE * TRACK_HEIGHT + (MAX_VISIBLE - 1) * TRACK_GAP
                tracksEl.style.maxHeight = maxH + 'px'
                tracksEl.style.overflowY = 'auto'
            } else {
                tracksEl.style.maxHeight = ''
                tracksEl.style.overflowY = ''
            }
        }
        if (prevHeight > 0) {
            this.container.style.minHeight = prevHeight + 'px'
            requestAnimationFrame(() => {
                this.container.style.minHeight = ''
            })
        }
        this._ensurePlayhead()
        this._buildCellMap()
        this._applySelection()
        
        // Clear loop element caches
        this._waveformCanvas = null
        this._tracksEl       = null
        this._vuElCache      = null
        
        this._syncVusVisibility()
    }

    _buildCellMap() {
        this._cellMap.clear()
        const cells = this.container.querySelectorAll('.pp-cell')
        for (const cell of cells) {
            const key = `${cell.dataset.track}:${cell.dataset.beat}:${cell.dataset.step}`
            this._cellMap.set(key, cell)
        }
    }

    updateLoopPoint(trackIdx, loopAtStep) {
        this.forceSync()
    }
}
