// src/ui/piano_roll/render_section.js
// Renders the piano roll: key column, grid, loop point, notes and cursor.

import { getNoteAbsoluteStep } from '../../core/notes.js'
import { createStepResolver } from '../../patterns/step_resolver.js'
import { getNoteSubPositions } from '../../patterns/note_positions.js'
import { formatNoteTooltip } from '../components/ui_utils.js'
import { BLACK_KEY_INDICES, GRID_HEIGHT, MIDI_MIN, MIDDLE_C, NOTE_HEIGHT, TOTAL_KEYS, midiName } from './constants.js'

export default class RenderSection {
    #editor

    /** @param {import('../piano_roll_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    sync() {
        if (!this.#editor.container) return
        this.#editor.viewport.clampPage()
        this.#editor.viewport.measureCellWidth()
        if (this.#editor.keysDirty) {
            this.#renderKeys()
            this.#editor.keysDirty = false
        }
        if (this.#editor.gridDirty) {
            this.#renderGrid()
            this.#editor.gridDirty = false
        }
        this.#renderLoopPoint()
        this.#renderNotes()
        this.#updateTrackName()
        this.#editor.viewport.updatePageInfo()
        this.#editor.playback.reattach()
        if (this.#editor.pendingCenterScroll) {
            this.#editor.viewport.scrollToTrackCenter()
            this.#editor.pendingCenterScroll = false
        }
    }

    syncNotes() {
        if (!this.#editor.container || !this.#editor.isVisible) return
        this.#editor.viewport.clampPage()
        this.#renderLoopPoint()
        this.#renderNotes()
        this.#editor.playback.reattach()
    }

    #updateTrackName() {
        const label = this.#editor.container.querySelector('#pp-pr-track-name')
        if (label) label.textContent = this.#editor.track?.name ? ` — ${this.#editor.track.name}` : ''
    }

    #renderKeys() {
        const el = this.#editor.container.querySelector('#pp-piano-keys')
        if (!el) return
        el.style.height = `${GRID_HEIGHT}px`
        let html = ''
        for (let i = 0; i < TOTAL_KEYS; i++) {
            const midi = MIDI_MIN + i
            const mod = ((midi % 12) + 12) % 12
            const isBlack = BLACK_KEY_INDICES.has(mod)
            const isC = mod === 0
            html += `<div class="pp-pr-key ${isBlack ? 'black' : 'white'} ${isC ? 'is-c' : ''}" data-midi="${midi}" title="${midiName(midi)}">${isC ? midiName(midi) : ''}</div>`
        }
        el.innerHTML = html
    }

    #renderGrid() {
        const gridEl = this.#editor.container.querySelector('#pp-piano-grid')
        if (!gridEl || !this.#editor.track) return
        const { stepsPerBeat, pageStartStep, visibleSteps } = this.#editor.pageInfo()
        const gridWidth = visibleSteps * this.#editor.cellWidth
        gridEl.style.height = `${GRID_HEIGHT}px`
        gridEl.style.width = `${gridWidth}px`

        let html = ''
        for (let s = 0; s < visibleSteps; s++) {
            const stepInBeat = (pageStartStep + s) % stepsPerBeat
            const cls =
                stepInBeat === 0 ? 'beat' : stepsPerBeat >= 4 && stepInBeat === stepsPerBeat / 2 ? 'half' : 'step'
            html += `<div class="pp-pr-col ${cls}" style="left:${s * this.#editor.cellWidth}px;width:${this.#editor.cellWidth}px"></div>`
        }
        for (let i = 0; i < TOTAL_KEYS; i++) {
            const isC = (((MIDI_MIN + i) % 12) + 12) % 12 === 0
            html += `<div class="pp-pr-row ${isC ? 'octave' : ''}" style="bottom:${i * NOTE_HEIGHT}px;height:${NOTE_HEIGHT}px;width:${gridWidth}px"></div>`
        }
        gridEl.innerHTML = html

        this.#renderLoopPoint(gridEl)
    }

    #renderLoopPoint(gridEl) {
        if (!gridEl) gridEl = this.#editor.container?.querySelector('#pp-piano-grid')
        if (!gridEl) return
        gridEl.querySelectorAll('.pp-pr-loop-point').forEach((el) => el.remove())
        const track = this.#editor.track
        if (!track) return
        const { pageStartStep, visibleSteps } = this.#editor.pageInfo()
        const loopAtStep = track.loopAtStep ?? this.#editor.pageInfo().totalSteps
        if (loopAtStep > pageStartStep && loopAtStep <= pageStartStep + visibleSteps) {
            const lpEl = document.createElement('div')
            lpEl.className = 'pp-pr-loop-point'
            lpEl.style.left = `${(loopAtStep - pageStartStep) * this.#editor.cellWidth}px`
            lpEl.style.height = `${GRID_HEIGHT}px`
            gridEl.appendChild(lpEl)
        }
    }

    #renderNotes() {
        const gridEl = this.#editor.container.querySelector('#pp-piano-grid')
        if (!gridEl) return
        gridEl.querySelectorAll('.pp-pr-note, .pp-pr-ghost, .pp-pr-cursor').forEach((n) => n.remove())
        const track = this.#editor.track
        if (!track) return
        const { stepsPerBeat, totalSteps, pageStartStep, pageEndStep, visibleSteps } = this.#editor.pageInfo()
        const trackPitchOffset = track.pitch ?? 0
        const notes = track.notes ?? []
        const resolveSpanEnd = createStepResolver(track)
        const fragment = document.createDocumentFragment()

        notes.forEach((note, noteIdx) => {
            const step = getNoteAbsoluteStep(note, stepsPerBeat)
            if (step < pageStartStep || step >= pageEndStep) return
            const row = MIDDLE_C + trackPitchOffset + (note.pitch ?? 0) - MIDI_MIN
            if (row < 0 || row >= TOTAL_KEYS) return

            const pageStep = step - pageStartStep
            const vel = note.velocity ?? 0.8

            const el = document.createElement('div')
            el.className = `pp-pr-note${this.#editor.selectedNote === note ? ' selected' : ''}`
            el.style.left = `${pageStep * this.#editor.cellWidth + 1}px`
            el.style.width = `${this.#editor.cellWidth - 2}px`
            el.style.bottom = `${row * NOTE_HEIGHT + 1}px`
            el.style.height = `${NOTE_HEIGHT - 2}px`
            el.style.opacity = (0.25 + vel * 0.75).toFixed(2)
            el.title = formatNoteTooltip(note, trackPitchOffset)
            el.dataset.note = String(noteIdx)
            // the step is recoverable without inverting the pixel geometry
            el.dataset.step = String(step)

            const prob = note.prob ?? 1
            const every = note.every ?? 1
            if (prob < 1) {
                el.classList.add('pp-pr-trig-rand')
                el.dataset.trig = String(Math.round(prob * 10))
            } else if (every > 1) {
                el.classList.add('pp-pr-trig-fixed')
                el.dataset.trig = String(every)
            }
            fragment.appendChild(el)

            getNoteSubPositions(note, track, totalSteps, resolveSpanEnd).forEach(({ pos, type, pitchOffset }) => {
                const ghStep = pos - pageStartStep
                if (ghStep < 0 || ghStep >= visibleSteps) return
                const ghRow = row + (pitchOffset ?? 0)
                if (ghRow < 0 || ghRow >= TOTAL_KEYS) return
                const gh = document.createElement('div')
                gh.className = `pp-pr-ghost pp-pr-ghost-${type}`
                gh.style.left = `${ghStep * this.#editor.cellWidth}px`
                gh.style.bottom = `${ghRow * NOTE_HEIGHT}px`
                gh.style.width = `${this.#editor.cellWidth}px`
                gh.style.height = `${NOTE_HEIGHT}px`
                gh.dataset.step = String(pos)
                fragment.appendChild(gh)
            })
        })

        if (
            this.#editor.cursorStep >= pageStartStep &&
            this.#editor.cursorStep < pageEndStep &&
            this.#editor.cursorRow >= 0 &&
            this.#editor.cursorRow < TOTAL_KEYS &&
            !this.#editor.selectedNote
        ) {
            const cursor = document.createElement('div')
            cursor.className = 'pp-pr-cursor'
            cursor.style.left = `${(this.#editor.cursorStep - pageStartStep) * this.#editor.cellWidth}px`
            cursor.style.bottom = `${this.#editor.cursorRow * NOTE_HEIGHT}px`
            cursor.style.width = `${this.#editor.cellWidth}px`
            cursor.style.height = `${NOTE_HEIGHT}px`
            fragment.appendChild(cursor)
        }

        gridEl.appendChild(fragment)
    }
}
