import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { TICK } from '../core/constants.js'

export default class PatternPanel {
    constructor() {
        this.container = null
        this._selNote = null
        this._selTrackIdx = -1
        this._rafId = null
        this._prevLoopTick = -1
        this._playhead = null
    }

    injectCSS() {
        if (document.getElementById('ui-styles')) return
        const link = document.createElement('link')
        link.id = 'ui-styles'
        link.rel = 'stylesheet'
        link.href = new URL('./styles.css', import.meta.url).href
        document.head.appendChild(link)
    }

    init() {
        this.injectCSS()
        this.createDOM()
        this.sync()
        this.subscribe()
    }

    createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'pattern-panel'
        this.container.addEventListener('click', (e) => this._onClick(e))
        document.body.appendChild(this.container)
    }

    _ensurePlayhead() {
        if (!this._playhead || !this.container.contains(this._playhead)) {
            if (this._playhead) this._playhead.remove()
            this._playhead = document.createElement('div')
            this._playhead.className = 'pp-playhead'
            this._playhead.style.display = 'none'
            this.container.appendChild(this._playhead)
        }
    }

    subscribe() {
        playbackEvents.onPatternChange.push(() => {
            this._prevLoopTick = -1
            this.sync()
        })
        playbackEvents.onPlaybackStop.push(() => {
            this._prevLoopTick = -1
            if (this._rafId) cancelAnimationFrame(this._rafId)
            this._rafId = null
            if (this._playhead) this._playhead.style.display = 'none'
        })
        playbackEvents.onPlaybackStart.push(() => {
            this._startPlayhead()
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

    _startPlayhead() {
        if (this._rafId) return
        const loop = () => {
            const transport = serviceRegistry.transport
            if (!transport?.isRunning) {
                this._rafId = null
                if (this._playhead) this._playhead.style.display = 'none'
                return
            }
            this._rafId = requestAnimationFrame(loop)
            this._updatePlayhead()
        }
        this._rafId = requestAnimationFrame(loop)
    }

    _updatePlayhead() {
        const transport = serviceRegistry.transport
        if (!transport?.isRunning) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern || !this.container) return
        this._ensurePlayhead()

        const nbTicks = TICK * (pattern.nbBars ?? 4)
        if (nbTicks <= 0) return

        const loopTick = (transport.tick ?? 0) % nbTicks
        const currentPatternBar = Math.floor(loopTick / TICK)
        
        const BARS_PER_PAGE = 4
        const startBar = appState.currentPage * BARS_PER_PAGE
        const endBar = startBar + BARS_PER_PAGE

        // Auto-follow: Change page if playback moves beyond current visible range
        if (currentPatternBar < startBar || currentPatternBar >= endBar) {
            const newPage = Math.floor(currentPatternBar / BARS_PER_PAGE)
            if (newPage !== appState.currentPage) {
                appState.currentPage = newPage
                this.sync()
                // Notify Toolbar to update page indicator
                playbackEvents.onPatternChange.forEach(fn => fn())
            }
            this._playhead.style.display = 'none'
            return
        }

        if (loopTick === this._prevLoopTick && this._playhead.style.display !== 'none') return
        this._prevLoopTick = loopTick

        const targetBar = this.container.querySelector(`.pp-bar[data-bar="${currentPatternBar}"]`)
        if (!targetBar) {
            this._playhead.style.display = 'none'
            return
        }

        const tickInBar = loopTick % TICK
        const normInBar = tickInBar / TICK

        const rect = targetBar.getBoundingClientRect()
        const parentRect = this.container.getBoundingClientRect()

        this._playhead.style.display = 'block'
        this._playhead.style.left = `${rect.left - parentRect.left + normInBar * rect.width}px`
        this._playhead.style.width = `2px`
    }

    _onClick(e) {
        const trackNameEl = e.target.closest('.pp-track-name')
        if (trackNameEl) {
            const trackIdx = parseInt(trackNameEl.dataset.track, 10)
            if (isNaN(trackIdx)) return
            const pattern = appState.patterns[appState.selectedPatternNum]
            const tracks = pattern.tracks ? (Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)) : []
            const track = tracks[trackIdx]
            if (!track) return

            if (this._selTrackIdx === trackIdx && !this._selNote) {
                if (window.innerWidth <= 768) {
                    playbackEvents.onTrackSelect.forEach(fn => fn({ track, trackIdx }))
                } else {
                    this._clearSelection()
                }
            } else {
                this._selNote = null
                this._selTrackIdx = trackIdx
                this._applySelection()
                playbackEvents.onTrackSelect.forEach(fn => fn({ track, trackIdx }))
            }
            return
        }

        const cell = e.target.closest('.pp-cell')
        if (!cell) return
        const trackIdx = parseInt(cell.dataset.track, 10)
        const bar = parseInt(cell.dataset.bar, 10)
        const barStep = parseInt(cell.dataset.step, 10)
        if (isNaN(trackIdx) || isNaN(bar) || isNaN(barStep)) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const tracks = pattern.tracks ? (Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)) : []
        const track = tracks[trackIdx]
        if (!track) return

        const note = (track.notes ?? []).find(n => n.bar === bar && n.barStep === barStep)

        if (note) {
            if (this._selNote === note && this._selTrackIdx === trackIdx) {
                serviceRegistry.mfCmd.deleteNote(track, note)
                this._clearSelection()
                this.sync()
            } else {
                this._selNote = note
                this._selTrackIdx = trackIdx
                this._applySelection()
                const pos = bar * (track.barQuantize ?? 4) + barStep
                playbackEvents.onNoteSelect.forEach(fn => fn({ track, trackIdx, note, pos, bar, barStep }))
            }
            return
        }

        const newNote = serviceRegistry.mfCmd.addNote(track, bar, barStep)
        this._selNote = newNote
        this._selTrackIdx = trackIdx
        this.sync()
        this._applySelection()
        const pos = bar * (track.barQuantize ?? 4) + barStep
        playbackEvents.onNoteSelect.forEach(fn => fn({ track, trackIdx, note: newNote, pos, bar, barStep }))
    }

    syncCells(trackIdx, bar, barStep) {
        // Obsolete with full sync but kept for compatibility
        this.sync()
    }

    _clearSelection() {
        this._selNote = null
        this._selTrackIdx = -1
        this.container.querySelectorAll('.pp-cell.selected').forEach(el => el.classList.remove('selected'))
        this.container.querySelectorAll('.pp-track-name.selected').forEach(el => el.classList.remove('selected'))
        playbackEvents.onNoteSelect.forEach(fn => fn(null))
        playbackEvents.onTrackSelect.forEach(fn => fn(null))
    }

    _applySelection() {
        this.container.querySelectorAll('.pp-cell.selected').forEach(el => el.classList.remove('selected'))
        this.container.querySelectorAll('.pp-track-name.selected').forEach(el => el.classList.remove('selected'))
        
        if (this._selTrackIdx !== -1) {
            if (this._selNote) {
                const trackIdx = this._selTrackIdx
                const bar = this._selNote.bar
                const step = this._selNote.barStep
                const sel = this.container.querySelector(`.pp-cell[data-track="${trackIdx}"][data-bar="${bar}"][data-step="${step}"]`)
                if (sel) sel.classList.add('selected')
            } else {
                const sel = this.container.querySelector(`.pp-track-name[data-track="${this._selTrackIdx}"]`)
                if (sel) sel.classList.add('selected')
            }
        }
    }

    _getBarQuantize(trackIdx) {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return 4
        const tracks = pattern.tracks ? (Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)) : []
        return (tracks[trackIdx]?.barQuantize ?? 4)
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
            if (pos < totalSteps) positions.push(pos)
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
                if (pos < totalSteps) positions.push(pos)
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

        const tracks = pattern.tracks ? (Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)) : []
        
        const BARS_PER_PAGE = 4
        const startBar = appState.currentPage * BARS_PER_PAGE
        const endBarPage = startBar + BARS_PER_PAGE
        
        const headerHtml = `<div class="pp-header">
            <span class="pp-name">${this.esc(pattern.name || 'Unnamed')}</span>
            <span class="pp-meta">${pattern.bpm ?? 120} BPM</span>
            <span class="pp-meta">${pattern.nbBars ?? 4} bars</span>
            <span class="pp-meta">Page ${appState.currentPage + 1}</span>
        </div>`

        if (tracks.length === 0) {
            this.container.innerHTML = headerHtml + '<div class="pp-empty" style="padding:40px; text-align:center; color:#888;">Empty Pattern</div>'
            return
        }

        let tracksHtml = '<div class="pp-tracks">'
        tracks.forEach((track, tIdx) => {
            if (!track) return
            const barQuantize = track.barQuantize ?? 4
            const totalSteps = (track.bars ?? 4) * barQuantize
            
            const notes = Array.isArray(track.notes) ? track.notes : Object.values(track.notes || {})
            const ghostMap = new Map()
            notes.forEach(note => {
                this._getSubPositions(note, track).forEach(subPos => {
                    const stepAbs = Math.floor(subPos)
                    const bar = Math.floor(stepAbs / barQuantize)
                    if (bar >= startBar && bar < endBarPage) {
                        if (!ghostMap.has(stepAbs)) ghostMap.set(stepAbs, [])
                        ghostMap.get(stepAbs).push(subPos - stepAbs)
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
                        
                        const note = notes.find(n => n.bar === b && n.barStep === s)
                        
                        const cls = ['pp-cell']
                        if (isBeyondTrack) cls.push('pp-cell-out')
                        
                        let trig = ''
                        if (note) {
                            cls.push('filled')
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
                        
                        const ghosts = (ghostMap.get(absPos) || []).map(offset => {
                            return `<div class="pp-ghost" style="left: ${offset * 100}%"></div>`
                        }).join('')

                        cellsHtml += `<div class="${cls.join(' ')}" data-track="${tIdx}" data-bar="${b}" data-step="${s}" data-pos="${absPos}" ${trig ? `data-trig="${trig}"` : ''}>${ghosts}</div>`
                    }
                }
                barsHtml += `<div class="pp-bar" data-bar="${b}">${cellsHtml}</div>`
            }
            barsHtml += '</div>'

            const isSelected = this._selTrackIdx === tIdx && !this._selNote
            tracksHtml += `
                <div class="pp-track">
                    <span class="pp-track-name ${isSelected ? 'selected' : ''}" data-track="${tIdx}">${this.esc(track.name || 'Track')}</span>
                    ${barsHtml}
                </div>`
        })
        tracksHtml += '</div>'

        this.container.innerHTML = headerHtml + tracksHtml
        this._ensurePlayhead()
        this._applySelection()
    }

    esc(str) {
        if (!str) return ''
        const d = document.createElement('div')
        d.textContent = String(str)
        return d.innerHTML
    }
}
