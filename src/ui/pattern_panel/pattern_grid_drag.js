// src/ui/pattern_panel/pattern_grid_drag.js
// Dragging a filled cell in the pattern grid edits the note under the pointer:
// up/down is the velocity (the slice opacity follows it), left/right is the
// pitch — which the grid cannot show at all, hence the gauge bubble. The
// gesture math lives in the shared NoteDrag and the write path in note_edit.js;
// what stays here is the grid's own plumbing: which cell and voice, and the
// in-place repaint of that one cell.

import { notesAtStep } from '../../core/notes.js'
import { emitNotesChanged } from '../../state/event_bus.js'
import NoteDrag from '../components/note_drag.js'
import { applyNoteEdit, emitNotePicked } from '../components/note_edit.js'

export default class PatternGridDrag {
    #editor
    #drag
    #trackIdx = -1

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#drag = new NoteDrag({
            onStart: (note) => this.#selectNote(note),
            onValue: (note, axis, value, dir) => this.#apply(note, axis, value, dir),
        })
    }

    /** Starts a gesture when the press landed on a filled cell. @param {MouseEvent} e */
    onMouseDown(e) {
        if (e.button !== 0) return
        const cellEl = /** @type {HTMLElement} */ (
            /** @type {Element|null} */ (e.target)?.closest?.('.pp-cell.filled')
        )
        if (!cellEl) return
        const trackIdx = parseInt(cellEl.dataset.track, 10)
        const beat = parseInt(cellEl.dataset.beat, 10)
        const beatStep = parseInt(cellEl.dataset.step, 10)
        if (isNaN(trackIdx) || isNaN(beat) || isNaN(beatStep)) return

        const track = this.#editor.resolveTrack(trackIdx)
        const stepNotes = track ? notesAtStep(track, beat, beatStep) : []
        if (!stepNotes?.length) return

        // One slice per voice: the slice under the pointer is the note edited.
        const sliceEl = /** @type {HTMLElement} */ (
            /** @type {Element|null} */ (e.target)?.closest?.('.pp-note-slice')
        )
        const voiceIdx = sliceEl ? parseInt(sliceEl.dataset.voiceIdx, 10) : 0
        const note = stepNotes[Math.min(voiceIdx, stepNotes.length - 1)]

        // Without this the drag paints a text selection across the grid instead.
        e.preventDefault()
        this.#trackIdx = trackIdx
        this.#drag.begin(e, note, track.pitch ?? 0)
    }

    /** @returns {boolean} true when the trailing click must be ignored */
    consumeClick() {
        const consumed = this.#drag.consumeClick()
        this.#trackIdx = -1
        return consumed
    }

    /** Drops a running gesture (panel destroy). */
    cancel() {
        this.#drag.cancel()
        this.#editor.gauge.hide()
        this.#trackIdx = -1
    }

    /** A drag produces no click, so the selection it needs is made here. */
    #selectNote(note) {
        const track = this.#editor.resolveTrack(this.#trackIdx)
        this.#editor.selectedNote = note
        this.#editor.gridTrackIdx = this.#trackIdx
        this.#editor.selectedByPointer = true
        this.#editor.applySelection()
        emitNotePicked({
            bus: this.#editor.playbackEvents,
            track,
            trackIdx: this.#trackIdx,
            note,
        })
    }

    #apply(note, axis, value, dir) {
        const track = this.#editor.resolveTrack(this.#trackIdx)
        const trackIdx = this.#trackIdx
        const changed = applyNoteEdit({
            registry: this.#editor.serviceRegistry,
            track,
            trackIdx,
            note,
            key: axis,
            value,
        })
        if (changed) {
            // Repaint the slice now instead of waiting for the NOTE_CHANGE sync,
            // or the opacity lags a frame behind the pointer.
            this.#editor.updateTrackCellsInPlace(trackIdx, track, this.#editor.appState.selectedPattern)
            this.#editor.applySelection()
            emitNotesChanged(track)
        }
        this.#editor.gauge.show({ note, trackPitch: track?.pitch ?? 0, label: axis, dir })
    }
}
