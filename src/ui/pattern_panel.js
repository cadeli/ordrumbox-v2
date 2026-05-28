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
        this._createPlayhead()
        document.body.appendChild(this.container)
    }

    _createPlayhead() {
        if (this._playhead) this._playhead.remove()
        this._playhead = document.createElement('div')
        this._playhead.className = 'pp-playhead'
        this._playhead.style.display = 'none'
        this.container.appendChild(this._playhead)
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
        if (!pattern || !this._playhead) return

        const nbTicks = TICK * (pattern.nbBars ?? 4)
        if (nbTicks <= 0) return

        const loopTick = (transport.tick ?? 0) % nbTicks
        if (loopTick === this._prevLoopTick && this._playhead.style.display !== 'none') return
        this._prevLoopTick = loopTick

        const normPos = loopTick / nbTicks
        const firstGrid = this.container.querySelector('.pp-grid')
        if (!firstGrid) return

        const gridRect = firstGrid.getBoundingClientRect()
        const panelRect = this.container.getBoundingClientRect()
        const left = gridRect.left - panelRect.left + normPos * gridRect.width

        this._playhead.style.display = 'block'
        this._playhead.style.left = left + 'px'
    }

    _onClick(e) {
        const trackNameEl = e.target.closest('.pp-track-name')
        if (trackNameEl) {
            const trackIdx = parseInt(trackNameEl.dataset.track, 10)
            if (isNaN(trackIdx)) return

            const pattern = appState.patterns[appState.selectedPatternNum]
            const tracks = Object.values(pattern?.tracks ?? {})
            const track = tracks[trackIdx]
            if (!track) return

            if (this._selTrackIdx === trackIdx && !this._selNote) {
                this._clearSelection()
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
        const pos = parseInt(cell.dataset.pos, 10)
        if (isNaN(trackIdx) || isNaN(pos)) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Object.values(pattern.tracks)
        const track = tracks[trackIdx]
        if (!track) return

        const barQuantize = track.barQuantize ?? 4
        const bar = Math.floor(pos / barQuantize)
        const barStep = pos % barQuantize
        const note = (track.notes ?? []).find(n => n.bar === bar && n.barStep === barStep)

        // Case 1: Click on an existing note
        if (note) {
            if (this._selNote === note && this._selTrackIdx === trackIdx) {
                // Already selected -> Delete
                serviceRegistry.mfCmd.deleteNote(track, note)
                this._clearSelection()
                this.sync()
            } else {
                // Not selected -> Select
                this._selNote = note
                this._selTrackIdx = trackIdx
                this._applySelection()
                playbackEvents.onNoteSelect.forEach(fn => fn({ track, trackIdx, note, pos, bar, barStep }))
            }
            return
        }

        // Case 2: Click on an empty step -> Create and select note
        const newNote = serviceRegistry.mfCmd.addNote(track, bar, barStep)
        this._selNote = newNote
        this._selTrackIdx = trackIdx
        this.sync() // Re-render to show the new note
        // _applySelection and event are called after sync because sync might re-create the DOM
        this._applySelection()
        playbackEvents.onNoteSelect.forEach(fn => fn({ track, trackIdx, note: newNote, pos, bar, barStep }))
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
                const barQuantize = this._getBarQuantize(trackIdx)
                const pos = this._selNote.bar * barQuantize + this._selNote.barStep
                const sel = this.container.querySelector(`.pp-cell[data-track="${trackIdx}"][data-pos="${pos}"]`)
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
        const tracks = Object.values(pattern.tracks)
        return (tracks[trackIdx]?.barQuantize ?? 4)
    }

    _getSubPositions(note, track) {
        const barQuantize = track.barQuantize ?? 4
        const basePos = note.bar * barQuantize + note.barStep
        const retriggerNum = note.retriggerNum ?? 1
        const retriggerStep = note.retriggerStep ?? 1
        const euclidianFill = note.euclidianFill ?? 0
        const hasArp = note.arp && (typeof note.arp === 'string' || (typeof note.arp === 'object' && !Array.isArray(note.arp) && Array.isArray(note.arp.intervals) && note.arp.intervals.length > 0))
        const totalSteps = track.bars * barQuantize
        
        const positions = []
        const stepSpacing = retriggerStep < 8 ? retriggerStep / 8 : retriggerStep - 7
        const count = hasArp || retriggerNum > 1 ? retriggerNum : 0

        // Retrigger and Arp positions
        for (let i = 1; i < count; i++) {
            const pos = basePos + i * stepSpacing
            if (pos < totalSteps) positions.push(pos)
        }

        // Euclidian Fill positions
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
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) {
            this.container.innerHTML = '<div class="pp-header"><span class="pp-name">No pattern</span></div>'
            return
        }

        const tracks = Object.values(pattern.tracks)
        let html = `<div class="pp-header">
            <span class="pp-name">${this.esc(pattern.name)}</span>
            <span class="pp-meta">${pattern.bpm ?? 120} BPM</span>
            <span class="pp-meta">${pattern.nbBars ?? 4} bars</span>
            <span class="pp-meta">${tracks.length} trk</span>
        </div><div class="pp-tracks">`

        tracks.forEach((track, tIdx) => {
            const barQuantize = track.barQuantize ?? 4
            const bars = track.bars ?? 4
            const steps = bars * barQuantize
            const stepMap = Array.from({ length: steps }, () => ({ cls: [], subs: [] }))

            // Main notes
            ;(track.notes ?? []).forEach(n => {
                const p = n.bar * barQuantize + n.barStep
                if (p >= steps) return
                
                const freq = n.triggerFreq ?? 1
                const prob = n.triggerProbability ?? 1
                const isRand = prob < 1
                const isFixed = freq > 1 && !isRand
                
                stepMap[p].cls.push('filled')
                if (isRand) stepMap[p].cls.push('pp-trig-rand')
                if (isFixed) stepMap[p].cls.push('pp-trig-fixed')
                if (isRand) stepMap[p].trig = String(Math.round(prob * 10))
                else if (isFixed) stepMap[p].trig = String(freq)

                // Sub-notes (ghosts)
                this._getSubPositions(n, track).forEach(subPos => {
                    const parentStep = Math.floor(subPos)
                    if (parentStep < steps) {
                        const offset = subPos - parentStep
                        stepMap[parentStep].subs.push(offset)
                    }
                })
            })

            const loopAt = track.loopAtStep ?? steps
            const cells = []
            for (let i = 0; i < steps; i++) {
                const cls = ['pp-cell', ...stepMap[i].cls]
                if (i % barQuantize === 0) cls.push('bar-start')
                if (loopAt > 0 && i === loopAt - 1) cls.push('pp-loop')
                
                let attrs = `data-track="${tIdx}" data-pos="${i}"`
                if (stepMap[i].trig) attrs += ` data-trig="${stepMap[i].trig}"`
                
                const ghostElements = stepMap[i].subs.map(offset => {
                    const style = offset > 0 ? `style="left: ${offset * 100}%"` : ''
                    return `<div class="pp-ghost" ${style}></div>`
                }).join('')

                cells.push(`<div class="${cls.join(' ')}" ${attrs}>${ghostElements}</div>`)
            }

            const isSelected = this._selTrackIdx === tIdx && !this._selNote
            html += `<div class="pp-track">
                <span class="pp-track-name ${isSelected ? 'selected' : ''}" data-track="${tIdx}">${this.esc(track.name)}</span>
                <div class="pp-grid">${cells.join('')}</div>
            </div>`
        })

        html += '</div>'
        this.container.innerHTML = html
        this._createPlayhead()
        this._applySelection()
    }

    esc(str) {
        const d = document.createElement('div')
        d.textContent = str
        return d.innerHTML
    }
}
