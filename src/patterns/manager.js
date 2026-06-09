import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import {
    computeFlatNotesFromPattern,
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

export default class MfPatterns {
    static TAG = "MFPATTERNS"

    constructor() { }

    computeFlatNotesFromPattern = (djtPattern, loop = 0) => {
        const flatNotes = computeFlatNotesFromPattern(djtPattern, loop, null, TICK)
        appState.flatNotes = flatNotes
        playbackEvents.dispatchPatternChange()
        return flatNotes
    }

    computeNextPatternStepNote = (note, track) => {
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

    createArpFlatNote = (tick, track, note, semitoneOffset) => {
        return createArpFlatNote(tick, track, note, semitoneOffset)
    }

    hasArp = (arp) => {
        return hasArp(arp)
    }

    normalizeArp = (arp) => {
        return normalizeArp(arp)
    }

    getArpNoteCount = (note) => {
        return getArpNoteCount(note)
    }

    isTrigged = (triggerPhase, triggerFreq, loop) => {
        return isTrigged(triggerPhase, triggerFreq, loop)
    }

    isProbabilityTrigged = (triggerProbability = 1) => {
        return isProbabilityTrigged(triggerProbability)
    }

    generateSubNotes = (flatNotes, baseTick, track, note, nbTickForPattern) => {
        return generateSubNotes(flatNotes, baseTick, track, note, nbTickForPattern, TICK)
    }
}
