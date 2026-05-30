import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { TICK } from '../core/constants.js'

export default class PatternPanel {
    constructor() {
        this.container = null
        this._playhead = null
        this._rafId = null
        this._prevLoopTick = -1
        this._selTrackIdx = -1
        this._selNote = null
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
        this.container.style.minHeight = '100px'
        this.container.style.background = '#1a1a2e'
        this.container.addEventListener('click', (e) => this._onClick(e))
        
        document.body.appendChild(this.container)
    }

    _log(msg) {
        console.log(`PatternPanel: ${msg}`)
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
        const tracksArr = pattern.tracks ? (Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)) : []
        const barQuantize = tracksArr[0]?.barQuantize ?? 4
        const currentStep = Math.floor(loopTick / (TICK / barQuantize))

        const STEPS_PER_PAGE = 32
        const startStep = appState.currentPage * STEPS_PER_PAGE
        const endStep = startStep + STEPS_PER_PAGE

        if (currentStep < startStep || currentStep >= endStep) {
            this._playhead.style.display = 'none'
            return
        }

        if (loopTick === this._prevLoopTick && this._playhead.style.display !== 'none') return
        this._prevLoopTick = loopTick

        const targetCell = this.container.querySelector(`.pp-cell[data-pos="${currentStep}"]`)
        if (!targetCell) {
            this._playhead.style.display = 'none'
            return
        }

        const rect = targetCell.getBoundingClientRect()
        const parentRect = this.container.getBoundingClientRect()

        this._playhead.style.display = 'block'
        this._playhead.style.left = `${rect.left - parentRect.left}px`
        this._playhead.style.width = `${rect.width}px`
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
        const tracks = pattern.tracks ? (Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)) : []
        const track = tracks[trackIdx]
        if (!track) return

        const barQuantize = track.barQuantize ?? 4
        const bar = Math.floor(pos / barQuantize)
        const barStep = pos % barQuantize
        const note = (track.notes ?? []).find(n => n.bar === bar && n.barStep === barStep)

        if (note) {
            if (this._selNote === note && this._selTrackIdx === trackIdx) {
                serviceRegistry.mfCmd.deleteNote(track, note)
                this._clearSelection()
                this.syncCells(trackIdx, pos)
            } else {
                this._selNote = note
                this._selTrackIdx = trackIdx
                this._applySelection()
                playbackEvents.onNoteSelect.forEach(fn => fn({ track, trackIdx, note, pos, bar, barStep }))
            }
            return
        }

        const newNote = serviceRegistry.mfCmd.addNote(track, bar, barStep)
        this._selNote = newNote
        this._selTrackIdx = trackIdx
        this.syncCells(trackIdx, pos)
        this._applySelection()
        playbackEvents.onNoteSelect.forEach(fn => fn({ track, trackIdx, note: newNote, pos, bar, barStep }))
    }

    syncCells(trackIdx, pos) {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const tracks = pattern.tracks ? (Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)) : []
        const track = tracks[trackIdx]
        if (!track) return

        const STEPS_PER_PAGE = 32
        const startStep = appState.currentPage * STEPS_PER_PAGE
        if (pos < startStep || pos >= startStep + STEPS_PER_PAGE) return

        const barQuantize = track.barQuantize ?? 4
        const bar = Math.floor(pos / barQuantize)
        const barStep = pos % barQuantize
        const note = (track.notes ?? []).find(n => n.bar === bar && n.barStep === barStep)
        
        const cell = this.container.querySelector(`.pp-cell[data-track="${trackIdx}"][data-pos="${pos}"]`)
        if (!cell) return

        cell.className = 'pp-cell'
        if (pos % barQuantize === 0) cell.classList.add('bar-start')
        const loopAt = track.loopAtStep ?? (track.bars * barQuantize)
        if (loopAt > 0 && pos === loopAt - 1) cell.classList.add('pp-loop')

        cell.innerHTML = ''
        delete cell.dataset.trig

        if (note) {
            const freq = note.triggerFreq ?? 1
            const prob = note.triggerProbability ?? 1
            const isRand = prob < 1
            const isFixed = freq > 1 && !isRand

            cell.classList.add('filled')
            if (isRand) {
                cell.classList.add('pp-trig-rand')
                cell.dataset.trig = String(Math.round(prob * 10))
            } else if (isFixed) {
                cell.classList.add('pp-trig-fixed')
                cell.dataset.trig = String(freq)
            }

            const ghostElements = this._getSubPositions(note, track).map(subPos => {
                const parentStep = Math.floor(subPos)
                if (parentStep === pos) {
                    const offset = subPos - parentStep
                    const style = offset > 0 ? `style="left: ${offset * 100}%"` : ''
                    return `<div class="pp-ghost" ${style}></div>`
                }
                return ''
            }).join('')
            cell.innerHTML = ghostElements
        }
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
        const totalSteps = track.bars * barQuantize
        
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
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) {
            this._log('No pattern in appState')
            return
        }

        const tracks = pattern.tracks ? (Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)) : []
        
        const STEPS_PER_PAGE = 32
        const startStep = appState.currentPage * STEPS_PER_PAGE
        const endStepPage = startStep + STEPS_PER_PAGE
        
        const headerHtml = `<div class="pp-header">
            <span class="pp-name">${this.esc(pattern.name || 'Unnamed')}</span>
            <span class="pp-meta">${pattern.bpm ?? 120} BPM</span>
            <span class="pp-meta">${pattern.nbBars ?? 4} bars</span>
            <span class="pp-meta">Page ${appState.currentPage + 1}</span>
        </div>`

        if (tracks.length === 0) {
            this._log('Tracks array is empty')
            this.container.innerHTML = headerHtml + '<div class="pp-empty" style="padding:40px; text-align:center; color:#888; background:rgba(255,255,255,0.05); border-radius:8px; margin-top:10px;">Empty Pattern: No tracks found.</div>'
            return
        }

        let tracksHtml = '<div class="pp-tracks" style="background: rgba(255,255,255,0.02); padding: 5px; border-radius: 4px; min-width: 500px;">'
        tracks.forEach((track, tIdx) => {
            if (!track) return
            const barQuantize = track.barQuantize ?? 4
            const totalSteps = (track.bars ?? 4) * barQuantize
            const stepMap = Array.from({ length: STEPS_PER_PAGE }, () => ({ cls: [], subs: [] }))

            // Main notes
            const notes = Array.isArray(track.notes) ? track.notes : Object.values(track.notes || {})
            notes.forEach(n => {
                if (!n) return
                const p = n.bar * barQuantize + n.barStep
                if (p < startStep || p >= endStepPage) return
                const localIdx = p - startStep
                if (!stepMap[localIdx]) return
                
                stepMap[localIdx].cls.push('filled')
                if ((n.triggerProbability ?? 1) < 1) {
                    stepMap[localIdx].cls.push('pp-trig-rand')
                    stepMap[localIdx].trig = String(Math.round(n.triggerProbability * 10))
                } else if ((n.triggerFreq ?? 1) > 1) {
                    stepMap[localIdx].cls.push('pp-trig-fixed')
                    stepMap[localIdx].trig = String(n.triggerFreq)
                }

                this._getSubPositions(n, track).forEach(subPos => {
                    const parentStep = Math.floor(subPos)
                    if (parentStep >= startStep && parentStep < endStepPage) {
                        const subLocalIdx = parentStep - startStep
                        if (stepMap[subLocalIdx]) stepMap[subLocalIdx].subs.push(subPos - parentStep)
                    }
                })
            })

            const loopAt = track.loopAtStep ?? totalSteps
            const isSelected = this._selTrackIdx === tIdx && !this._selNote
            
            let cellsHtml = ''
            for (let i = 0; i < STEPS_PER_PAGE; i++) {
                const absPos = startStep + i
                const cls = ['pp-cell', ...stepMap[i].cls]
                if (absPos % barQuantize === 0) cls.push('bar-start')
                if (loopAt > 0 && absPos === loopAt - 1) cls.push('pp-loop')
                
                let attrs = `data-track="${tIdx}" data-pos="${absPos}"`
                if (stepMap[i].trig) attrs += ` data-trig="${stepMap[i].trig}"`
                
                const ghosts = (stepMap[i].subs || []).map(offset => {
                    const style = offset > 0 ? `style="left: ${offset * 100}%"` : ''
                    return `<div class="pp-ghost" ${style}></div>`
                }).join('')

                cellsHtml += `<div class="${cls.join(' ')}" ${attrs}>${ghosts}</div>`
            }

            tracksHtml += `
                <div class="pp-track" style="display:flex; align-items:center; margin-bottom:6px;">
                    <span class="pp-track-name ${isSelected ? 'selected' : ''}" data-track="${tIdx}">${this.esc(track.name || 'Track')}</span>
                    <div class="pp-grid" style="display:flex; gap:3px; margin-left:12px;">${cellsHtml}</div>
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
