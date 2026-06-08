import Utils from '../core/utils.js'
import { normalizeTrack } from '../model/track_schema.js'

export default class MfDefaults {
    static TAG = "MFDEFAULTS"

    static normalizeNote(note) {
        if (!note) return { ...Utils.NOTE_DEFAULTS }
        const d = Utils.NOTE_DEFAULTS
        return {
            bar: note.bar ?? d.bar,
            barStep: note.barStep ?? note.step ?? d.barStep,
            pitch: note.pitch ?? d.pitch,
            velocity: note.velocity ?? d.velocity,
            pan: note.pan ?? d.pan,
            arp: note.arp ?? d.arp,
            triggerFreq: note.triggerFreq ?? d.triggerFreq,
            triggerPhase: note.triggerPhase ?? d.triggerPhase,
            triggerProbability: note.triggerProbability ?? d.triggerProbability,
            arpTriggerProbability: note.arpTriggerProbability ?? d.arpTriggerProbability,
            retriggerNum: note.retriggerNum ?? d.retriggerNum,
            retriggerStep: note.retriggerStep ?? d.retriggerStep,
            euclidianFill: note.euclidianFill ?? d.euclidianFill,
            ...note,
        }
    }

    static getNoteProp(note, key) {
        return note?.[key] ?? Utils.NOTE_DEFAULTS[key]
    }

    static getTrackProp(track, key) {
        return track?.[key] ?? Utils.TRACK_DEFAULTS[key]
    }

    static getPatternProp(pattern, key) {
        return pattern?.[key] ?? Utils.PATTERN_DEFAULTS[key]
    }

    static normalizeTrack(track) {
        return normalizeTrack(track)
    }

    static normalizePattern(pattern) {
        if (!pattern) return { ...Utils.PATTERN_DEFAULTS, tracks: [] }
        const d = Utils.PATTERN_DEFAULTS
        return {
            nbBars: pattern.nbBars ?? d.nbBars,
            bpm: pattern.bpm ?? d.bpm,
            description: pattern.description ?? d.description,
            tags: pattern.tags ?? d.tags,
            tracks: pattern.tracks ?? d.tracks,
            ...pattern,
        }
    }
}
