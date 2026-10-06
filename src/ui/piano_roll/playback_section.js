// src/ui/piano_roll/playback_section.js
// Playhead, rAF loop and note illumination during playback.

import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/playback_events.js'
import { EVENTS } from '../../core/events.js'
import { BEATS_PER_PAGE, TICK } from '../../core/constants.js'
import { getNoteAbsoluteStep } from '../../core/notes.js'
import { createStepResolver } from '../../patterns/step_resolver.js'
import { getNoteSubPositions } from '../../patterns/note_positions.js'
import { reportUserError } from '../../core/notify.js'

export default class PlaybackSection {
    #editor
    #playhead = null
    #rafId = null
    #prevLoopTick = -1
    #prevLitTick = -1
    #litNoteEls = []

    /** @param {import('../piano_roll_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    ensurePlayhead() {
        if (this.#playhead && this.#editor.container?.contains(this.#playhead)) return
        this.#playhead = document.createElement('div')
        this.#playhead.className = 'pp-pr-playhead'
        this.#playhead.style.display = 'none'
        this.#editor.container?.querySelector('#pp-piano-grid')?.appendChild(this.#playhead)
    }

    start() {
        if (this.#rafId) return
        const loop = () => {
            const transport = serviceRegistry.transport
            if (!transport?.isRunning || !this.#editor.container || !this.#editor.isVisible) {
                this.#rafId = null
                if (this.#playhead) this.#playhead.style.display = 'none'
                this.clearIllumination()
                return
            }
            try {
                this.#updatePlayhead()
            } catch (err) {
                reportUserError('PianoRoll.playheadLoop', 'Playback cursor stopped updating', { cause: err })
            }
            this.#rafId = requestAnimationFrame(loop)
        }
        this.#rafId = requestAnimationFrame(loop)
    }

    stop() {
        if (this.#rafId) {
            cancelAnimationFrame(this.#rafId)
            this.#rafId = null
        }
    }

    #updatePlayhead() {
        const transport = serviceRegistry.transport
        if (!transport?.isRunning) return
        const pattern = appState.selectedPattern
        const track = this.#editor.track
        if (!pattern || !track || !this.#editor.container) return
        this.ensurePlayhead()

        const { stepsPerBeat } = this.#editor.pageInfo()
        const tickCount = TICK * (pattern.beatCount ?? 4)
        if (tickCount <= 0) return
        const loopTick = (transport.tick ?? 0) % tickCount
        if (loopTick === this.#prevLoopTick && this.#playhead.style.display !== 'none') return
        this.#prevLoopTick = loopTick

        const absStep =
            Math.floor(loopTick / TICK) * stepsPerBeat + Math.floor((loopTick % TICK) / (TICK / stepsPerBeat))
        const pageStartStep = appState.currentPage * BEATS_PER_PAGE * stepsPerBeat
        const pageEndStep = pageStartStep + BEATS_PER_PAGE * stepsPerBeat

        if (absStep < pageStartStep || absStep >= pageEndStep) {
            const newPage = Math.floor(absStep / stepsPerBeat / BEATS_PER_PAGE)
            if (newPage !== appState.currentPage) {
                serviceRegistry.cmd.setCurrentPage(newPage)
                this.#editor.viewport.clampPage()
                this.#editor.gridDirty = true
                this.#editor.sync()
                this.illuminateStep(absStep, transport.tick)
                playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            }
            if (this.#playhead.style.display !== 'none') this.#playhead.style.display = 'none'
            return
        }

        if (this.#playhead.style.display !== 'block') this.#playhead.style.display = 'block'
        this.#playhead.style.left = `${(absStep - pageStartStep) * this.#editor.cellWidth}px`
        this.#playhead.style.width = '2px'
        this.illuminateStep(absStep, transport.tick)
    }

    illuminateStep(absStep, rawTick) {
        if (rawTick === this.#prevLitTick) return
        for (const el of this.#litNoteEls) el.classList.remove('playing')
        this.#litNoteEls.length = 0
        this.#prevLitTick = rawTick
        const gridEl = this.#editor.container?.querySelector('#pp-piano-grid')
        if (!gridEl) return
        const track = this.#editor.track
        if (!track) return
        const { stepsPerBeat, totalSteps } = this.#editor.pageInfo()
        const loopAtStep = track.loopAtStep ?? totalSteps
        const notes = track.notes ?? []
        const resolveSpanEnd = createStepResolver(track)
        for (const el of gridEl.querySelectorAll('.pp-pr-note')) {
            const note = notes[parseInt(el.dataset.note, 10)]
            if (!note) continue
            const basePos = getNoteAbsoluteStep(note, stepsPerBeat)
            if (basePos >= loopAtStep) continue
            const matchesBase = absStep % loopAtStep === basePos
            const matchesSub = getNoteSubPositions(note, track, totalSteps, resolveSpanEnd).some(
                (s) => s.pos < loopAtStep && absStep % loopAtStep === s.pos,
            )
            if (matchesBase || matchesSub) {
                el.classList.add('playing')
                this.#litNoteEls.push(el)
            }
        }
    }

    clearIllumination() {
        for (const el of this.#litNoteEls) el.classList.remove('playing')
        this.#litNoteEls.length = 0
        this.#prevLitTick = -1
    }

    reattach() {
        if (!this.#playhead) return
        this.#editor.container?.querySelector('#pp-piano-grid')?.appendChild(this.#playhead)
    }

    hidePlayhead() {
        if (this.#playhead) this.#playhead.style.display = 'none'
    }

    resetPrevLoopTick() {
        this.#prevLoopTick = -1
    }
}
