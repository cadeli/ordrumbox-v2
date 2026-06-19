import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { TICK } from '../core/constants.js'
import Utils from '../core/utils.js'
import BasePanel from './base_panel.js'
import { logger } from "../core/logger.js"

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
        this._barRectsCache = []
        this._cursorTrackIdx = -1
        this._cursorBar = 0
        this._cursorBarStep = 0
        this._cellMap = new Map()
        this._vuElCache = null
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
        this.container.addEventListener('keydown', (e) => this._onKeyDown(e))
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
            this._playhead.style.top = '0'
            this._playhead.style.bottom = '0'
            this._playhead.style.zIndex = '10'
            this._playhead.style.pointerEvents = 'none'
            this._playhead.style.willChange = 'transform'
            const header = this.container.querySelector('.pp-header')
            if (header) {
                header.style.position = 'relative'
                header.appendChild(this._playhead)
            } else {
                this.container.appendChild(this._playhead)
            }
        }
    }

    subscribe() {
        playbackEvents.onPatternChange.push(() => {
            this._prevLoopTick = -1
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
            const cell = this._cellMap.get(`${data.trackIdx}:${data.bar}:${data.barStep}`)
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
        this._barRectsCache = []
        const tracksEl = this.container.querySelector('.pp-tracks')
        if (!tracksEl) return

        const containerRect = this.container.getBoundingClientRect()
        const tracksRect    = tracksEl.getBoundingClientRect()
        this._layoutCache = {
            containerLeft: containerRect.left,
            containerRight: containerRect.right,
            tracksLeft: tracksRect.left,
            tracksHeight: tracksEl.clientHeight
        }

        const barEls = this.container.querySelectorAll('.pp-bar')
        barEls.forEach(el => {
            const r = el.getBoundingClientRect()
            this._barRectsCache[parseInt(el.dataset.bar)] = {
                left: r.left - this._layoutCache.tracksLeft,
                absLeft: r.left,
                absRight: r.right,
                width: r.width
            }
        })
        
        const firstBar = this.container.querySelector('.pp-bar')
        if (firstBar) {
            const header = this.container.querySelector('.pp-header')
            if (header) {
                const barRect = firstBar.getBoundingClientRect()
                const headerRect = header.getBoundingClientRect()
                this._headerBarsLeft = barRect.left - headerRect.left
                this._headerBarsWidth = barRect.width
            }
        }
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
        
        this._perfData = {
            lastTime: performance.now(),
            frameTimes: [],
            avgFrameTime: 0
        }

        const loop = () => {
            const transport = serviceRegistry.transport
            const mixer = serviceRegistry.audioEngine?.mixer
            if (!transport?.isRunning || !mixer || !this.container) {
                this._rafId = null
                if (this._playhead) this._playhead.style.display = 'none'
                this._resetVuAndWaveform()
                this._updatePerfDisplay(0)
                return
            }

            const startTime = performance.now()
            
            this._updateVus(mixer)
            this._drawWaveform(mixer)
            this._updatePlayhead()
            
            const endTime = performance.now()
            const frameDuration = endTime - startTime
            
            this._perfData.frameTimes.push(frameDuration)
            if (this._perfData.frameTimes.length > 60) this._perfData.frameTimes.shift()
            
            if (this._perfData.frameTimes.length === 60) {
                const avg = this._perfData.frameTimes.reduce((a, b) => a + b, 0) / 60
                this._perfData.avgFrameTime = avg
                this._updatePerfDisplay(avg)
            }

            this._rafId = requestAnimationFrame(loop)
        }
        this._rafId = requestAnimationFrame(loop)
    }

    _updatePerfDisplay(avgMs) {
        if (!this.container) return
        let perfEl = this.container.querySelector('.pp-perf-stats')
        if (!perfEl && avgMs > 0) {
            perfEl = document.createElement('span')
            perfEl.className = 'pp-perf-stats pp-meta'
            perfEl.style.color = '#4ade80'
            perfEl.style.marginLeft = 'auto'
            const header = this.container.querySelector('.pp-header')
            if (header) header.appendChild(perfEl)
        }
        if (perfEl) {
            if (avgMs === 0) {
                perfEl.textContent = ''
                return
            }
            // Frame budget for 60fps is 16.6ms. 
            // This measures just our JS execution time in the loop.
            const budgetPct = (avgMs / 16.66) * 100
            perfEl.textContent = `UI Load: ${avgMs.toFixed(2)}ms (${budgetPct.toFixed(1)}%)`
            perfEl.style.color = budgetPct > 50 ? '#f43f5e' : (budgetPct > 20 ? '#fbbf24' : '#4ade80')
        }
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
        for (const vuEl of vuEls) {
            // Use cached track index if available
            let tIdx = vuEl._tIdx
            if (tIdx === undefined) {
                tIdx = vuEl._tIdx = parseInt(vuEl.dataset.track, 10)
            }
            const tracks = Utils.getTracksArray(appState.patterns[appState.selectedPatternNum])
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

        const dpr = window.devicePixelRatio ?? (logger.warn('PatternPanel', 'dpr fallback'), 1)
        
        // Find visible grid area using cached rects
        const firstBarCache = this._barRectsCache[appState.currentPage * 4]
        const lastBarIdx = Math.min(this._barRectsCache.length - 1, (appState.currentPage + 1) * 4 - 1)
        const lastBarCache = this._barRectsCache[lastBarIdx]
        
        if (!firstBarCache || !lastBarCache) return

        const { containerLeft, containerRight, tracksLeft, tracksHeight } = this._layoutCache

        const visibleLeft = Math.max(firstBarCache.absLeft, containerLeft)
        const visibleRight = Math.min(lastBarCache.absRight, containerRight)
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
        const vuEls = this._vuElCache ?? (logger.warn('PatternPanel', 'vuElCache fallback'), this.container.querySelectorAll('.pp-vu'))
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

        const nbTicks = TICK * (pattern.nbBars ?? 4)
        if (nbTicks <= 0) return

        const loopTick = (transport.tick ?? 0) % nbTicks
        
        if (loopTick === this._prevLoopTick && this._playhead.style.display !== 'none') return
        this._prevLoopTick = loopTick

        const currentPatternBar = Math.floor(loopTick / TICK)
        const BARS_PER_PAGE = 4
        const startBar = appState.currentPage * BARS_PER_PAGE
        const endBar = startBar + BARS_PER_PAGE

        if (currentPatternBar < startBar || currentPatternBar >= endBar) {
            const newPage = Math.floor(currentPatternBar / BARS_PER_PAGE)
            if (newPage !== appState.currentPage) {
                appState.currentPage = newPage
                this.requestSync()
                playbackEvents.dispatchPatternChange()
            }
            if (this._playhead.style.display !== 'none') this._playhead.style.display = 'none'
            return
        }

        const barCache = this._barRectsCache[currentPatternBar]
        if (!barCache) {
            if (this._playhead.style.display !== 'none') this._playhead.style.display = 'none'
            return
        }

        const tickInBar = loopTick % TICK
        const normInBar = tickInBar / TICK

        if (this._playhead.style.display !== 'block') this._playhead.style.display = 'block'
        const x = this._headerBarsLeft + barCache.left + normInBar * barCache.width
        
        // Use a small threshold to avoid sub-pixel jitter if needed, 
        // but translateX handles sub-pixels well.
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
            this._cursorBar = 0
            this._cursorBarStep = 0
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
            this._cursorBar = 0
            this._cursorBarStep = 0
        }

        const barQuantize = tracks[this._cursorTrackIdx]?.barQuantize ?? 4
        const nbBars = pattern.nbBars ?? 4

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault()
                this._cursorBarStep++
                if (this._cursorBarStep >= barQuantize) {
                    this._cursorBarStep = 0
                    this._cursorBar++
                    if (this._cursorBar >= nbBars) {
                        this._cursorBar = 0
                    }
                }
                break
            case 'ArrowLeft':
                e.preventDefault()
                this._cursorBarStep--
                if (this._cursorBarStep < 0) {
                    this._cursorBarStep = barQuantize - 1
                    this._cursorBar--
                    if (this._cursorBar < 0) {
                        this._cursorBar = nbBars - 1
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
                const track = tracks[this._cursorTrackIdx]
                if (!track) return

                const cell = this._cellMap.get(`${this._cursorTrackIdx}:${this._cursorBar}:${this._cursorBarStep}`)
                if (cell) {
                    if (cell.classList.contains('filled')) {
                        cell.classList.remove('filled', 'pp-trig-rand', 'pp-trig-fixed')
                        cell.innerHTML = ''

                        const note = (track.notes ?? []).find(n => n.bar === this._cursorBar && n.barStep === this._cursorBarStep)
                        if (note) {
                            serviceRegistry.mfCmd.deleteNote(track, note)
                        }
                        this._clearSelection()
                    } else {
                        cell.classList.add('filled')

                        const newNote = serviceRegistry.mfCmd.addNote(track, this._cursorBar, this._cursorBarStep)
                        this._selNote = newNote
                        this._selTrackIdx = this._cursorTrackIdx
                        this._applySelection()

                        const pos = this._cursorBar * (track.barQuantize ?? 4) + this._cursorBarStep
                        playbackEvents.dispatchNoteSelect({ track, trackIdx: this._cursorTrackIdx, note: newNote, pos, bar: this._cursorBar, barStep: this._cursorBarStep })
                    }
                    this.sync()
                }
                break
            default:
                return
        }

        const track = tracks[this._cursorTrackIdx]
        if (!track) return

        const BARS_PER_PAGE = 4
        const startBar = appState.currentPage * BARS_PER_PAGE
        if (this._cursorBar < startBar || this._cursorBar >= startBar + BARS_PER_PAGE) {
            appState.currentPage = Math.floor(this._cursorBar / BARS_PER_PAGE)
        }

        const note = (track.notes ?? []).find(n => n.bar === this._cursorBar && n.barStep === this._cursorBarStep)
        this._selNote = note || null
        this._selTrackIdx = this._cursorTrackIdx
        this.sync()
        if (note) {
            playbackEvents.dispatchNoteSelect({ track, trackIdx: this._cursorTrackIdx, note, pos: this._cursorBar * barQuantize + this._cursorBarStep, bar: this._cursorBar, barStep: this._cursorBarStep })
        } else {
            playbackEvents.dispatchTrackSelect({ track, trackIdx: this._cursorTrackIdx })
        }
    }

    _onClick(e) {
        const trackNameEl = e.target.closest('.pp-track-name')
        if (trackNameEl) {
            const trackIdx = parseInt(trackNameEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            this._cursorTrackIdx = trackIdx
            const pattern = appState.patterns[appState.selectedPatternNum]
            const tracks = Utils.getTracksArray(pattern)
            const track = tracks[trackIdx]
            if (!track) return

            if (this._selTrackIdx === trackIdx && !this._selNote) {
                if (window.innerWidth <= 768) {
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
            return
        }

        const cell = e.target.closest('.pp-cell')
        if (!cell) return
        const trackIdx = parseInt(cell.dataset.track, 10)
        const bar = parseInt(cell.dataset.bar, 10)
        const barStep = parseInt(cell.dataset.step, 10)
        if (isNaN(trackIdx) || isNaN(bar) || isNaN(barStep)) return

        this._cursorTrackIdx = trackIdx
        this._cursorBar = bar
        this._cursorBarStep = barStep

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        const track = tracks[trackIdx]
        if (!track) return

        const note = (track.notes ?? []).find(n => n.bar === bar && n.barStep === barStep)

        if (note) {
            if (this._selNote === note && this._selTrackIdx === trackIdx) {
                cell.classList.remove('filled', 'pp-trig-rand', 'pp-trig-fixed')
                cell.innerHTML = ''

                serviceRegistry.mfCmd.deleteNote(track, note)
                this._clearSelection()

                requestAnimationFrame(() => this.sync())
            } else {
                this._selNote = note
                this._selTrackIdx = trackIdx
                this._applySelection()
                const pos = bar * (track.barQuantize ?? 4) + barStep
                playbackEvents.dispatchNoteSelect({ track, trackIdx, note, pos, bar, barStep })
            }
            return
        }

        cell.classList.add('filled')

        const newNote = serviceRegistry.mfCmd.addNote(track, bar, barStep)
        this._selNote = newNote
        this._selTrackIdx = trackIdx
        this._applySelection()

        const pos = bar * (track.barQuantize ?? 4) + barStep
        playbackEvents.dispatchNoteSelect({ track, trackIdx, note: newNote, pos, bar, barStep })

        requestAnimationFrame(() => this.sync())
    }

    _clearSelection() {
        this._selNote = null
        this._selTrackIdx = -1
        const selected = this.container.querySelectorAll('.pp-cell.selected, .pp-track-name.selected')
        selected.forEach(el => el.classList.remove('selected'))
        playbackEvents.dispatchNoteSelect(null)
        playbackEvents.dispatchTrackSelect(null)
    }

    _applySelection() {
        const selected = this.container.querySelectorAll('.pp-cell.selected, .pp-track-name.selected, .pp-cell.cursor')
        selected.forEach(el => el.classList.remove('selected', 'cursor'))

        if (this._selTrackIdx !== -1) {
            if (this._selNote) {
                const trackIdx = this._selTrackIdx
                const bar = this._selNote.bar
                const step = this._selNote.barStep
                const sel = this._cellMap.get(`${trackIdx}:${bar}:${step}`)
                if (sel) sel.classList.add('selected')
            } else if (this._cursorTrackIdx !== -1) {
                const sel = this._cellMap.get(`${this._cursorTrackIdx}:${this._cursorBar}:${this._cursorBarStep}`)
                if (sel) sel.classList.add('cursor')
                const trackSel = this.container.querySelector(`.pp-track-name[data-track="${this._cursorTrackIdx}"]`)
                if (trackSel) trackSel.classList.add('selected')
            } else {
                const sel = this.container.querySelector(`.pp-track-name[data-track="${this._selTrackIdx}"]`)
                if (sel) sel.classList.add('selected')
            }
        }
    }

    _getSubPositions(note, track) {
        const barQuantize = track.barQuantize ?? 4
        const basePos = note.bar * barQuantize + note.barStep
        const retriggerNum = note.retriggerNum ?? 1
        const retriggerStep = note.retriggerStep ?? 1
        const euclidianFill = note.euclidianFill ?? 0
        const hasArp = note.arp && (typeof note.arp === 'string' || (typeof note.arp === 'object' && !Array.isArray(note.arp) && Array.isArray(note.arp.intervals) && note.arp.intervals.length > 0))
        const totalSteps = (track.bars ?? 4) * barQuantize

        const positions = []
        const stepSpacing = retriggerStep < 8 ? retriggerStep / 8 : retriggerStep - 7
        const count = hasArp || retriggerNum > 1 ? retriggerNum : 0

        for (let i = 1; i < count; i++) {
            const pos = basePos + i * stepSpacing
            if (pos < totalSteps) positions.push({ pos, type: 'retrigger' })
        }

        if (euclidianFill > 0) {
            const endStep = (() => {
                const currentPatternPos = basePos
                let nextNotePos = totalSteps
                for (const n of (track.notes ?? [])) {
                    const nPos = n.bar * barQuantize + n.barStep
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
                const pos = basePos + (i * stepsSpan) / (euclidianFill + 1)
                if (pos < totalSteps) positions.push({ pos, type: 'euclidian' })
            }
        }
        return positions
    }

    sync() {
        if (!this.container) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) {
            this.container.innerHTML = '<div class="pp-header" style="color:#fff; padding:10px;">Waiting for patterns...</div>'
            return
        }

        const tracks = Utils.getTracksArray(pattern)

        const BARS_PER_PAGE = 4
        const startBar = appState.currentPage * BARS_PER_PAGE
        const endBarPage = startBar + BARS_PER_PAGE

        const headerHtml = `<div class="pp-header">
            <span class="pp-name">${this.esc(pattern.name ?? (logger.warn('PatternPanel', 'name fallback'), 'Unnamed'))}</span>
            <span class="pp-meta">${pattern.bpm ?? 120} BPM</span>
            <span class="pp-meta">${pattern.nbBars ?? 4} bars</span>
            <span class="pp-meta">Page ${appState.currentPage + 1}</span>
        </div>`

        if (tracks.length === 0) {
            this.container.innerHTML = headerHtml + '<div class="pp-empty" style="padding:40px; text-align:center; color:#888;">Empty Pattern</div>'
            return
        }

        this._cellMap.clear()

        let tracksHtml = '<div class="pp-tracks">'
        tracks.forEach((track, tIdx) => {
            if (!track) return
            const barQuantize = track.barQuantize ?? 4
            const totalSteps = (track.bars ?? 4) * barQuantize

            const notes = Array.isArray(track.notes) ? track.notes : Object.values(track.notes ?? (logger.warn('PatternPanel', 'track.notes fallback'), {}))

            const noteMap = new Map()
            notes.forEach(n => {
                noteMap.set(`${n.bar}:${n.barStep}`, n)
            })

            const ghostMap = new Map()
            notes.forEach(note => {
                this._getSubPositions(note, track).forEach(({ pos, type }) => {
                    const stepAbs = Math.floor(pos)
                    const bar = Math.floor(stepAbs / barQuantize)
                    if (bar >= startBar && bar < endBarPage) {
                        if (!ghostMap.has(stepAbs)) ghostMap.set(stepAbs, [])
                        ghostMap.get(stepAbs).push({ offset: pos - stepAbs, type })
                    }
                })
            })

            let barsHtml = '<div class="pp-bars">'
            for (let b = startBar; b < endBarPage; b++) {
                let cellsHtml = ''
                if (b < (pattern.nbBars ?? 4)) {
                    const trackBarCount = track.bars ?? 4
                    for (let s = 0; s < barQuantize; s++) {
                        const absPos = b * barQuantize + s
                        const isBeyondTrack = b >= trackBarCount

                        const note = noteMap.get(`${b}:${s}`)

                        const cls = ['pp-cell']
                        if (isBeyondTrack) cls.push('pp-cell-out')

                        let trig = ''
                        let cellStyle = ''
                        if (note) {
                            cls.push('filled')
                            const vel = note.velocity ?? 0.8
                            const alpha = 0.25 + vel * 0.75
                            cellStyle = ` style="opacity:${alpha.toFixed(2)}"`
                            if ((note.triggerProbability ?? 1) < 1) {
                                cls.push('pp-trig-rand')
                                trig = String(Math.round(note.triggerProbability * 10))
                            } else if ((note.triggerFreq ?? 1) > 1) {
                                cls.push('pp-trig-fixed')
                                trig = String(note.triggerFreq)
                            }
                        }

                        const loopAt = track.loopAtStep ?? totalSteps
                        if (loopAt > 0 && absPos === loopAt - 1) cls.push('pp-loop')

                        const ghosts = (ghostMap.get(absPos) ?? (logger.warn('PatternPanel', 'ghostMap fallback'), [])).map(({ offset, type }) => {
                            const cls = type === 'euclidian' ? 'pp-ghost pp-ghost-euclidian' : 'pp-ghost pp-ghost-retrigger'
                            return `<div class="${cls}" style="left: ${offset * 100}%"></div>`
                        }).join('')

                        let pitchIndicator = ''
                        if (note) {
                            const pitch = note.pitch ?? 0
                            const pct = ((pitch + 24) / 48) * 100
                            pitchIndicator = `<div class="pp-pitch-bar" style="bottom:${pct.toFixed(1)}%"></div>`
                        }

                        const cellHtml = `<div class="${cls.join(' ')}" data-track="${tIdx}" data-bar="${b}" data-step="${s}" data-pos="${absPos}" ${trig ? `data-trig="${trig}"` : ''}${cellStyle}>${ghosts}${pitchIndicator}</div>`
                        cellsHtml += cellHtml
                    }
                }
                barsHtml += `<div class="pp-bar" data-bar="${b}">${cellsHtml}</div>`
            }
            barsHtml += '</div>'

            const isSelected = this._selTrackIdx === tIdx && !this._selNote
            tracksHtml += `
                <div class="pp-track">
                    <div class="pp-vu ${isSelected ? 'selected' : ''}" data-track="${tIdx}"><div class="pp-vu-fill"></div></div>
                    <span class="pp-track-name ${isSelected ? 'selected' : ''}" data-track="${tIdx}">${this.esc(track.name ?? (logger.warn('PatternPanel', 'track name fallback'), 'Track'))}</span>
                    ${barsHtml}
                </div>`
        })
        tracksHtml += `<canvas class="pp-waveform-overlay"></canvas></div>`

        this.container.innerHTML = headerHtml + tracksHtml
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
            const key = `${cell.dataset.track}:${cell.dataset.bar}:${cell.dataset.step}`
            this._cellMap.set(key, cell)
        }
    }

    updateLoopPoint(trackIdx, loopAtStep) {
        this.forceSync()
    }
}
