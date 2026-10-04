import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { recomputeFlatNotes } from './engine.js'
import { TICK } from '../core/constants.js'
import { EVENTS } from '../core/events.js'

// Recomputes a pattern's flat notes, writes them to appState and dispatches the
// change events. This is the whole module: it creates, reads, updates and deletes
// no pattern and keeps no state (it used to be `patterns/manager.js`, and
// `serviceRegistry.flatNotes` read like the pattern library).

/**
 * Recompute flat notes from a pattern, write to appState, and dispatch change events.
 *
 * The step resolver is rebuilt per track inside recomputeFlatNotes() (see
 * patterns/step_resolver.js for the pass-scoped cache strategy), so nothing
 * has to be invalidated here.
 */
export function applyFlatNotes(pattern, loop = 0) {
    const flatNotes = recomputeFlatNotes(pattern, loop, TICK)
    appState.flatNotes = flatNotes
    playbackEvents.batch(() => {
        playbackEvents.emit(EVENTS.NOTE_CHANGE)
        playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    })
    return flatNotes
}
