import Utils from '../core/utils.js'

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
        if (!track) return { ...Utils.TRACK_DEFAULTS, notes: [] }
        const d = Utils.TRACK_DEFAULTS
        return {
            name: track.name ?? d.name,
            useAutoAssignSound: track.useAutoAssignSound ?? d.useAutoAssignSound,
            soundId: track.soundId ?? d.soundId,
            bars: track.bars ?? d.bars,
            barQuantize: track.barQuantize ?? d.barQuantize,
            loopAtStep: track.loopAtStep ?? d.loopAtStep,
            swingResolution: track.swingResolution ?? d.swingResolution,
            swingAmount: track.swingAmount ?? d.swingAmount,
            velocity: track.velocity ?? d.velocity,
            velocityLfo: track.velocityLfo ?? d.velocityLfo,
            pitch: track.pitch ?? d.pitch,
            pitchLfo: track.pitchLfo ?? d.pitchLfo,
            pan: track.pan ?? d.pan,
            panLfo: track.panLfo ?? d.panLfo,
            solo: track.solo ?? d.solo,
            mute: track.mute ?? d.mute,
            auto: track.auto ?? d.auto,
            useSoftSynth: track.useSoftSynth ?? d.useSoftSynth,
            mono: track.mono ?? d.mono,
            filterType: track.filterType ?? d.filterType,
            filterFreqLfo: track.filterFreqLfo ?? d.filterFreqLfo,
            filterFreq: track.filterFreq ?? d.filterFreq,
            filterLfoFreq: track.filterLfoFreq ?? d.filterLfoFreq,
            filterQLfo: track.filterQLfo ?? d.filterQLfo,
            filterQ: track.filterQ ?? d.filterQ,
            reverbType: track.reverbType ?? d.reverbType,
            reverbAmount: track.reverbAmount ?? d.reverbAmount,
            delayType: track.delayType ?? d.delayType,
            delayTime: track.delayTime ?? d.delayTime,
            delayAmount: track.delayAmount ?? d.delayAmount,
            fxSelected: track.fxSelected ?? d.fxSelected,
            saturationType: track.saturationType ?? d.saturationType,
            saturationAmount: track.saturationAmount ?? d.saturationAmount,
            sampleLength: track.sampleLength ?? d.sampleLength,
            notes: track.notes ?? d.notes,
            ...track,
        }
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
