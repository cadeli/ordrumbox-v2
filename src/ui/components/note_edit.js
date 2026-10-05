// src/ui/components/note_edit.js
// Shared write path for editing a note's parameters, whichever grid the gesture
// came from (drag or Shift+Arrow). Everything that must happen the same way in
// both lives here: the command call (undoable, coalesced so a whole gesture is
// one history step), the preview, and the announcement of the note being edited
// — a drag produces no click, so the selection it needs is made here.

import { EVENTS } from '../../core/events.js'
import { previewNote } from './note_preview.js'

/** Axis names double as note property names. */
export const AXIS_VELOCITY = 'velocity'
export const AXIS_PITCH = 'pitch'

/**
 * Records one effective parameter change and previews the result.
 *
 * A no-op (the value is already there, e.g. a drag past a bound) is dropped
 * before the command layer, so it neither previews nor pollutes the history.
 *
 * @param {Object} params
 * @param {{cmd?: Object, seq?: Object}} params.registry - service registry (injected: the pattern grid has its own)
 * @param {Object} params.track - owning track
 * @param {number} params.trackIdx - track row, for the preview
 * @param {Object} params.note - the edited note
 * @param {string} params.key - note property, 'velocity' or 'pitch'
 * @param {number} params.value - its new value
 * @returns {boolean} whether the note was changed
 */
export function applyNoteEdit({ registry, track, trackIdx, note, key, value }) {
    if (!track || !note || Object.is(note[key], value)) return false
    registry?.cmd?.updateNote(track, note, { [key]: value }, {
        desc: `Edit note ${key} on ${track.name ?? 'track'}`,
        coalesce: true,
    })
    previewNote(registry?.seq, trackIdx, note)
    return true
}

/**
 * Announces the note the user is about to edit: TRACK_SELECT (the note editor
 * follows the edited track) and NOTE_SELECT (its knobs follow the note).
 *
 * @param {Object} params
 * @param {{batch: Function, emit: Function}} params.bus - playback events (injected)
 * @param {Object} params.track - owning track
 * @param {number} params.trackIdx - track row
 * @param {Object} params.note - the picked note
 */
export function emitNotePicked({ bus, track, trackIdx, note }) {
    if (!bus || !note) return
    bus.batch(() => {
        bus.emit(EVENTS.TRACK_SELECT, { track, trackIdx })
        bus.emit(EVENTS.NOTE_SELECT, {
            track,
            trackIdx,
            note,
            pos: (note.beat ?? 0) * (track.stepsPerBeat ?? 4) + (note.beatStep ?? 0),
            beat: note.beat ?? 0,
            beatStep: note.beatStep ?? 0,
        })
    })
}
