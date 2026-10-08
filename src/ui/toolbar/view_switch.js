// src/ui/toolbar/view_switch.js
// View switch: view buttons, generation buttons, undo/redo.

import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/event_bus.js'
import { EVENTS } from '../../core/events.js'
import { Lifecycle } from '../../core/lifecycle.js'
import patternAutoGen from '../../logic/services/pattern_auto_gen.js'

export default class ViewSwitch {
    /** Owns every listener bound through #life — released by destroy(). */
    #life = new Lifecycle()
    /** @type {HTMLButtonElement} */
    #drumBtn
    /** @type {HTMLButtonElement} */
    #bassBtn
    /** @type {HTMLButtonElement} */
    #chordsBtn
    /** @type {HTMLButtonElement} */
    #undoBtn
    /** @type {HTMLButtonElement} */
    #redoBtn
    /** @type {HTMLButtonElement} */
    #synthBtn
    /** @type {HTMLButtonElement} */
    #editBtn
    /** @type {HTMLButtonElement} */
    #prollBtn
    /** @type {HTMLButtonElement} */
    #songBtn

    get drumBtn() {
        return this.#drumBtn
    }

    get bassBtn() {
        return this.#bassBtn
    }

    get chordsBtn() {
        return this.#chordsBtn
    }

    get undoBtn() {
        return this.#undoBtn
    }

    get redoBtn() {
        return this.#redoBtn
    }

    get synthBtn() {
        return this.#synthBtn
    }

    get editBtn() {
        return this.#editBtn
    }

    get prollBtn() {
        return this.#prollBtn
    }

    get songBtn() {
        return this.#songBtn
    }

    /** Releases every listener bound through listen(). */
    destroy() {
        this.#life.destroy()
    }

    createDOM() {
        // ── Generation buttons ──────────────────────────────────
        const genWrap = document.createElement('div')
        genWrap.className = 'tb-group tb-gen-group'
        const genLabel = document.createElement('span')
        genLabel.className = 'tb-label'
        genLabel.textContent = 'Generation'
        const genRow = document.createElement('div')
        genRow.className = 'tb-view-row'
        this.#drumBtn = document.createElement('button')
        this.#drumBtn.className = 'tb-view-btn tb-gen-btn'
        this.#drumBtn.dataset.gen = 'drum'
        this.#drumBtn.textContent = '↻ Drum'
        this.#drumBtn.title = 'Generate drum pattern'
        this.#bassBtn = document.createElement('button')
        this.#bassBtn.className = 'tb-view-btn tb-gen-btn'
        this.#bassBtn.dataset.gen = 'bass'
        this.#bassBtn.textContent = '↻ Bass'
        this.#bassBtn.title = 'Generate bass line'
        this.#chordsBtn = document.createElement('button')
        this.#chordsBtn.className = 'tb-view-btn tb-gen-btn'
        this.#chordsBtn.dataset.gen = 'chords'
        this.#chordsBtn.textContent = '↻ Chords'
        this.#chordsBtn.title = 'Generate chords'
        genRow.appendChild(this.#drumBtn)
        genRow.appendChild(this.#bassBtn)
        genRow.appendChild(this.#chordsBtn)
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
        this.#undoBtn = document.createElement('button')
        this.#undoBtn.className = 'tb-undo-btn'
        this.#undoBtn.textContent = '↶'
        this.#undoBtn.title = 'Undo (Ctrl+Z)'
        this.#undoBtn.disabled = true
        this.#redoBtn = document.createElement('button')
        this.#redoBtn.className = 'tb-undo-btn'
        this.#redoBtn.textContent = '↷'
        this.#redoBtn.title = 'Redo (Ctrl+Y)'
        this.#redoBtn.disabled = true
        undoRow.appendChild(this.#undoBtn)
        undoRow.appendChild(this.#redoBtn)
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
        this.#synthBtn = document.createElement('button')
        this.#synthBtn.className = 'tb-view-btn'
        this.#synthBtn.dataset.view = 'synth'
        this.#synthBtn.textContent = 'Synth'
        this.#synthBtn.title = 'Toggle Soft Synth'
        this.#editBtn = document.createElement('button')
        this.#editBtn.className = 'tb-view-btn'
        this.#editBtn.dataset.view = 'edit'
        this.#editBtn.textContent = 'Grid'
        this.#editBtn.title = 'Toggle Track Editor'
        this.#prollBtn = document.createElement('button')
        this.#prollBtn.className = 'tb-view-btn'
        this.#prollBtn.dataset.view = 'proll'
        this.#prollBtn.textContent = 'proll'
        this.#prollBtn.title = 'Toggle Proll'
        this.#songBtn = document.createElement('button')
        this.#songBtn.className = 'tb-view-btn'
        this.#songBtn.dataset.view = 'song'
        this.#songBtn.textContent = 'Song'
        this.#songBtn.title = 'Toggle Song'
        viewRow.appendChild(this.#synthBtn)
        viewRow.appendChild(this.#editBtn)
        viewRow.appendChild(this.#prollBtn)
        viewRow.appendChild(this.#songBtn)
        viewWrap.appendChild(viewLabel)
        viewWrap.appendChild(viewRow)

        return { genWrap, undoWrap, viewWrap }
    }

    /**
     * Renders history availability and which generation toggles are on.
     * @param {{canUndo: boolean, canRedo: boolean, nextUndoDesc: string|null, nextRedoDesc: string|null, gen: {drum: boolean, bass: boolean, chords: boolean}}} data
     */
    sync(data) {
        this.#undoBtn.disabled = !data.canUndo
        this.#redoBtn.disabled = !data.canRedo
        this.#undoBtn.title = data.canUndo
            ? `Undo: ${data.nextUndoDesc ?? ''} (Ctrl+Z)`
            : 'Undo (Ctrl+Z)'
        this.#redoBtn.title = data.canRedo
            ? `Redo: ${data.nextRedoDesc ?? ''} (Ctrl+Y)`
            : 'Redo (Ctrl+Y)'

        this.#drumBtn.classList.toggle('active', data.gen.drum)
        this.#bassBtn.classList.toggle('active', data.gen.bass)
        this.#chordsBtn.classList.toggle('active', data.gen.chords)
    }

    bindEvents() {
        // Fresh signal if this is a re-init cycle after destroy().
        this.#life.reset()

        this.#life.listen(this.#synthBtn, 'click', () => {
            playbackEvents.emit(EVENTS.SYNTH_TOGGLE)
        })
        this.#life.listen(this.#editBtn, 'click', () => {
            playbackEvents.emit(EVENTS.EDIT_TOGGLE)
        })
        this.#life.listen(this.#prollBtn, 'click', () => {
            playbackEvents.emit(EVENTS.PROLL_TOGGLE)
        })
        this.#life.listen(this.#songBtn, 'click', () => {
            playbackEvents.emit(EVENTS.SONG_TOGGLE)
        })

        this.#life.listen(this.#undoBtn, 'click', () => {
            serviceRegistry.history?.undo()
        })
        this.#life.listen(this.#redoBtn, 'click', () => {
            serviceRegistry.history?.redo()
        })

        // Generation orchestration (undo transaction, track creation, event
        // batch) lives in logic/services/pattern_auto_gen.js — shared with
        // the pattern settings panel.
        this.#life.listen(this.#drumBtn, 'click', () => patternAutoGen.toggleDrums())
        this.#life.listen(this.#bassBtn, 'click', () => patternAutoGen.toggleMelodic('BASS'))
        this.#life.listen(this.#chordsBtn, 'click', () => patternAutoGen.toggleMelodic('PIANO'))
    }
}
