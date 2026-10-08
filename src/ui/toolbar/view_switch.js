// src/ui/toolbar/view_switch.js
// View switch: view buttons, generation buttons, undo/redo.

import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/event_bus.js'
import { EVENTS } from '../../core/events.js'
import { Lifecycle } from '../../core/lifecycle.js'
import patternAutoGen from '../../logic/services/pattern_auto_gen.js'

export default class ViewSwitch {
    #tb
    /** Owns every listener bound through #life — released by destroy(). */
    #life = new Lifecycle()

    /** @param {import('../toolbar.js').default} toolbar */
    constructor(toolbar) {
        this.#tb = toolbar
    }

    /** Releases every listener bound through listen(). */
    destroy() {
        this.#life.destroy()
    }

    createDOM() {
        const tb = this.#tb

        // ── Generation buttons ──────────────────────────────────
        const genWrap = document.createElement('div')
        genWrap.className = 'tb-group tb-gen-group'
        const genLabel = document.createElement('span')
        genLabel.className = 'tb-label'
        genLabel.textContent = 'Generation'
        const genRow = document.createElement('div')
        genRow.className = 'tb-view-row'
        tb.drumBtn = document.createElement('button')
        tb.drumBtn.className = 'tb-view-btn tb-gen-btn'
        tb.drumBtn.dataset.gen = 'drum'
        tb.drumBtn.textContent = '↻ Drum'
        tb.drumBtn.title = 'Generate drum pattern'
        tb.bassBtn = document.createElement('button')
        tb.bassBtn.className = 'tb-view-btn tb-gen-btn'
        tb.bassBtn.dataset.gen = 'bass'
        tb.bassBtn.textContent = '↻ Bass'
        tb.bassBtn.title = 'Generate bass line'
        tb.chordsBtn = document.createElement('button')
        tb.chordsBtn.className = 'tb-view-btn tb-gen-btn'
        tb.chordsBtn.dataset.gen = 'chords'
        tb.chordsBtn.textContent = '↻ Chords'
        tb.chordsBtn.title = 'Generate chords'
        genRow.appendChild(tb.drumBtn)
        genRow.appendChild(tb.bassBtn)
        genRow.appendChild(tb.chordsBtn)
        genWrap.appendChild(genLabel)
        genWrap.appendChild(genRow)

        // ── Undo/Redo buttons ────────────────────────────────────
        const undoWrap = document.createElement('div')
        undoWrap.className = 'tb-group tb-undo-group tb-hide-mobile'
        const undoLabel = document.createElement('span')
        undoLabel.className = 'tb-label'
        undoLabel.textContent = 'History'
        const undoRow = document.createElement('div')
        undoRow.className = 'tb-undo-row'
        tb.undoBtn = document.createElement('button')
        tb.undoBtn.className = 'tb-undo-btn'
        tb.undoBtn.textContent = '↶'
        tb.undoBtn.title = 'Undo (Ctrl+Z)'
        tb.undoBtn.disabled = true
        tb.redoBtn = document.createElement('button')
        tb.redoBtn.className = 'tb-undo-btn'
        tb.redoBtn.textContent = '↷'
        tb.redoBtn.title = 'Redo (Ctrl+Y)'
        tb.redoBtn.disabled = true
        undoRow.appendChild(tb.undoBtn)
        undoRow.appendChild(tb.redoBtn)
        undoWrap.appendChild(undoLabel)
        undoWrap.appendChild(undoRow)

        // ── View buttons ────────────────────────────────────────
        const viewWrap = document.createElement('div')
        viewWrap.className = 'tb-group tb-hide-mobile'
        const viewLabel = document.createElement('span')
        viewLabel.className = 'tb-label'
        viewLabel.textContent = 'View'
        const viewRow = document.createElement('div')
        viewRow.className = 'tb-view-row'
        tb.synthBtn = document.createElement('button')
        tb.synthBtn.className = 'tb-view-btn'
        tb.synthBtn.dataset.view = 'synth'
        tb.synthBtn.textContent = 'Synth'
        tb.synthBtn.title = 'Toggle Soft Synth'
        tb.editBtn = document.createElement('button')
        tb.editBtn.className = 'tb-view-btn'
        tb.editBtn.dataset.view = 'edit'
        tb.editBtn.textContent = 'Grid'
        tb.editBtn.title = 'Toggle Track Editor'
        tb.prollBtn = document.createElement('button')
        tb.prollBtn.className = 'tb-view-btn'
        tb.prollBtn.dataset.view = 'proll'
        tb.prollBtn.textContent = 'proll'
        tb.prollBtn.title = 'Toggle Proll'
        tb.songBtn = document.createElement('button')
        tb.songBtn.className = 'tb-view-btn'
        tb.songBtn.dataset.view = 'song'
        tb.songBtn.textContent = 'Song'
        tb.songBtn.title = 'Toggle Song'
        viewRow.appendChild(tb.synthBtn)
        viewRow.appendChild(tb.editBtn)
        viewRow.appendChild(tb.prollBtn)
        viewRow.appendChild(tb.songBtn)
        viewWrap.appendChild(viewLabel)
        viewWrap.appendChild(viewRow)

        return { genWrap, undoWrap, viewWrap }
    }

    bindEvents() {
        const tb = this.#tb

        this.#life.listen(tb.synthBtn, 'click', () => {
            playbackEvents.emit(EVENTS.SYNTH_TOGGLE)
        })
        this.#life.listen(tb.editBtn, 'click', () => {
            playbackEvents.emit(EVENTS.EDIT_TOGGLE)
        })
        this.#life.listen(tb.prollBtn, 'click', () => {
            playbackEvents.emit(EVENTS.PROLL_TOGGLE)
        })
        this.#life.listen(tb.songBtn, 'click', () => {
            playbackEvents.emit(EVENTS.SONG_TOGGLE)
        })

        this.#life.listen(tb.undoBtn, 'click', () => {
            serviceRegistry.history?.undo()
        })
        this.#life.listen(tb.redoBtn, 'click', () => {
            serviceRegistry.history?.redo()
        })

        // Generation orchestration (undo transaction, track creation, event
        // batch) lives in logic/services/pattern_auto_gen.js — shared with
        // the pattern settings panel.
        this.#life.listen(tb.drumBtn, 'click', () => patternAutoGen.toggleDrums())
        this.#life.listen(tb.bassBtn, 'click', () => patternAutoGen.toggleMelodic('BASS'))
        this.#life.listen(tb.chordsBtn, 'click', () => patternAutoGen.toggleMelodic('PIANO'))
    }
}
