// src/ui/piano_roll/drag_section.js
// Dragging a note in the piano roll edits it: the gesture math (velocity /
// pitch, axis lock) lives in the shared NoteDrag and the write path in
// note_edit.js. What stays here is the piano roll's own plumbing: finding the
// note under the pointer, keeping the cursor on it, repainting.

import { playbackEvents, emitNotesChanged } from '../../state/playback_events.js'
import { serviceRegistry } from '../../state/service_registry.js'
import NoteDrag from '../components/note_drag.js'
import { applyNoteEdit, emitNotePicked } from '../components/note_edit.js'

export default class DragSection {
    #editor
    #drag

    /** @param {import('../piano_roll_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#drag = new NoteDrag({
            onStart: (note) => this.#selectNote(note),
            onValue: (note, axis, value, dir) => this.#apply(note, axis, value, dir),
        })
    }

    /** Starts a gesture when the press landed on a note. @param {MouseEvent} e */
    onMouseDown(e) {
        if (e.button !== 0) return
        const noteEl = /** @type {HTMLElement} */ (
            /** @type {Element|null} */ (e.target)?.closest?.('.pp-pr-note')
        )
        if (!noteEl) return
        const track = this.#editor.track
        const notes = track?.notes
        const note = Array.isArray(notes) ? notes[Number(noteEl.dataset.note)] : null
        if (!track || !note) return

        // Keeps the press from selecting the page text or starting a native drag.
        e.preventDefault()
        this.#drag.begin(e, note, track.pitch ?? 0)
    }

    /** @returns {boolean} true when the trailing click must be ignored */
    consumeClick() {
        return this.#drag.consumeClick()
    }

    /** Drops a running gesture (panel hide / destroy). */
    cancel() {
        this.#drag.cancel()
    }

    /** A drag produces no click, so the selection it needs is made here. */
    #selectNote(note) {
        const track = this.#editor.track
        this.#editor.selectedNote = note
        this.#editor.followCursorToSelectedNote()
        this.#editor.applySelection()
        emitNotePicked({ bus: playbackEvents, track, trackIdx: this.#editor.selectedTrackIdx, note })
    }

    #apply(note, axis, value, dir) {
        const track = this.#editor.track
        const changed = applyNoteEdit({
            registry: serviceRegistry,
            track,
            trackIdx: this.#editor.selectedTrackIdx,
            note,
            key: axis,
            value,
        })
        // emitNotesChanged repaints the notes, replacing every note element: the
        // gauge must resolve its anchor after that, not before.
        if (changed) emitNotesChanged(track)
        this.#editor.followCursorToSelectedNote()
        this.#editor.gauge.show({ note, trackPitch: track?.pitch ?? 0, label: axis, dir })
    }
}
