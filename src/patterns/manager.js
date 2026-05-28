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
        const flatNotes = computeFlatNotesFromPattern(djtPattern, loop, (note, track) => {
            return this.computeNextPatternStepNote(note, track)
        }, TICK)
        appState.flatNotes = flatNotes
        playbackEvents.onPatternChange.forEach(cb => cb())
        return flatNotes
    }

    computeNextPatternStepNote = (note, track) => {
        let last = track.barQuantize * (track.bars ?? track.nbBars ?? 4)
        let first = note.bar * track.barQuantize + note.barStep
        
        // Find next note manually to avoid dependency on MfCmd
        for (let i = first + 1; i < last; i++) {
            let bar = Math.floor(i / track.barQuantize)
            let step = i % track.barQuantize
            
            const hasNote = track.notes?.some(n => n.bar === bar && n.barStep === step)
            if (hasNote) {
                return i
            }
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
