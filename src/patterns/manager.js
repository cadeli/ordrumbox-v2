import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import {
    computeFlatNotesFromPattern as _computeFlatNotesFromPattern,
    normalizeArp,
    hasArp,
    getArpNoteCount,
    isTrigged,
    isProbabilityTrigged,
    generateSubNotes,
    createArpFlatNote,
} from './engine.js'
import { TICK } from '../core/constants.js'

export { normalizeArp, hasArp, getArpNoteCount, isTrigged, isProbabilityTrigged, generateSubNotes, createArpFlatNote }

/**
 * Recompute flat notes from a pattern and dispatch a pattern change event.
 * This is the only method that mutates appState — everything else is a
 * pure re-export from engine.js.
 */
export function computeFlatNotesFromPattern(djtPattern, loop = 0) {
    const flatNotes = _computeFlatNotesFromPattern(djtPattern, loop, null, TICK)
    appState.flatNotes = flatNotes
    playbackEvents.dispatchPatternChange()
    return flatNotes
}

/**
 * Find the next occupied step after the given note in the same track.
 */
export function computeNextPatternStepNote(note, track) {
    const last = track.barQuantize * (track.bars ?? track.nbBars ?? 4)
    const first = note.bar * track.barQuantize + note.barStep

    if (!track._occupiedSet) {
        const set = new Set()
        const notes = track.notes
        const q = track.barQuantize
        if (notes) {
            for (let i = 0; i < notes.length; i++) {
                set.add(notes[i].bar * q + notes[i].barStep)
            }
        }
        track._occupiedSet = set
    }

    for (let i = first + 1; i < last; i++) {
        if (track._occupiedSet.has(i)) return i
    }
    return track.loopAtStep ?? last
}

/**
 * Backward-compatible class wrapper.
 * @deprecated Use named exports instead.
 */
export class MfPatterns {
    static TAG = "MFPATTERNS"

    constructor() { }

    computeFlatNotesFromPattern = (djtPattern, loop = 0) => {
        return computeFlatNotesFromPattern(djtPattern, loop)
    }

    computeNextPatternStepNote = (note, track) => {
        return computeNextPatternStepNote(note, track)
    }

    createArpFlatNote = (tick, track, note, semitoneOffset) => {
        return createArpFlatNote(tick, track, note, semitoneOffset)
    }

    hasArp = (arp) => hasArp(arp)

    normalizeArp = (arp) => normalizeArp(arp)

    getArpNoteCount = (note) => getArpNoteCount(note)

    isTrigged = (triggerPhase, triggerFreq, loop) => isTrigged(triggerPhase, triggerFreq, loop)

    isProbabilityTrigged = (triggerProbability = 1) => isProbabilityTrigged(triggerProbability)

    generateSubNotes = (flatNotes, baseTick, track, note, nbTickForPattern) => {
        return generateSubNotes(flatNotes, baseTick, track, note, nbTickForPattern, TICK)
    }
}

export default MfPatterns
