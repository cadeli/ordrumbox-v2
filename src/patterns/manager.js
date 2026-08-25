import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import {
    computeFlatNotesFromPattern as _computeFlatNotesFromPattern,
} from './engine.js'
import { TICK } from '../core/constants.js'

/**
 * Recompute flat notes from a pattern and dispatch a pattern change event.
 */
export function computeFlatNotesFromPattern(djtPattern, loop = 0) {
    for (const track of djtPattern.tracks) {
        track._occupiedSet = null
    }
    const flatNotes = _computeFlatNotesFromPattern(djtPattern, loop, null, TICK)
    appState.flatNotes = flatNotes
    playbackEvents.emit("noteChange")
    playbackEvents.emit("patternChange")
    return flatNotes
}

/**
 * Find the next occupied step after the given note in the same track.
 */
export function computeNextPatternStepNote(note, track) {
    const last = track.stepsPerBeat * (track.nbBeats ?? 4)
    const first = note.beat * track.stepsPerBeat + note.beatStep

    if (!track._occupiedSet) {
        const set = new Set()
        const notes = track.notes
        const q = track.stepsPerBeat
        if (notes) {
            const noteList = Array.isArray(notes) ? notes : Object.values(notes)
            for (let i = 0; i < noteList.length; i++) {
                set.add(noteList[i].beat * q + noteList[i].beatStep)
            }
        }
        track._occupiedSet = set
    }

    for (let i = first + 1; i < last; i++) {
        if (track._occupiedSet.has(i)) return i
    }
    return track.loopAtStep ?? last
}
