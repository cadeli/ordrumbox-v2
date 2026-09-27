import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { buildOccupiedSet, recomputeFlatNotes, resolveSpanEndStep } from './engine.js'
import { TICK } from '../core/constants.js'
import { EVENTS } from '../core/events.js'

/**
 * Recompute flat notes from a pattern, write to appState, and dispatch change events.
 */
export function applyFlatNotes(djtPattern, loop = 0) {
    for (const track of djtPattern.tracks) {
        track._occupiedSet = null
    }
    const flatNotes = recomputeFlatNotes(djtPattern, loop, null, TICK)
    appState.flatNotes = flatNotes
    playbackEvents.batch(() => {
        playbackEvents.emit(EVENTS.NOTE_CHANGE)
        playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    })
    return flatNotes
}

/**
 * Find where the sub-note span of a given note ends (next occupied step,
 * clamped by the loop point). The occupied set is cached on the track.
 */
export function computeNextPatternStepNote(note, track) {
    if (!track._occupiedSet) track._occupiedSet = buildOccupiedSet(track)
    return resolveSpanEndStep(note, track, track._occupiedSet)
}
