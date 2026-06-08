import Utils from '../core/utils.js'
import { recalcLoopDerived } from '../model/track_schema.js'

const PAN_MAP = [0, 0.3, 0.5, -0.4, 0.4, -0.3, -0.2, 1]

export function fixTrackPanning(track, indexTrack) {
    track.pan = PAN_MAP[indexTrack] ?? 0
    return track
}

export function fixNoteStepBar(track, note) {
    note.barStep ??= note.step ?? 0
    delete note.step
    if (note.barStep >= track.barQuantize) {
        const pStep = note.barStep
        note.barStep %= track.barQuantize
        note.bar = Math.floor(pStep / track.barQuantize)
    }
    note.steppc = Math.round((note.barStep * 100) / track.barQuantize)
    return note
}

export function fixNoteDefaults(note, track) {
    fixNoteStepBar(track, note)
    note.velocity ??= Utils.NOTE_DEFAULTS.velocity
    note.pan ??= Utils.NOTE_DEFAULTS.pan
    note.retriggerNum ??= Utils.NOTE_DEFAULTS.retriggerNum
    note.retriggerStep ??= Utils.NOTE_DEFAULTS.retriggerStep
    note.triggerFreq ??= Utils.NOTE_DEFAULTS.triggerFreq
    note.triggerPhase ??= Utils.NOTE_DEFAULTS.triggerPhase
    if (note.triggerProbability == null) note.triggerProbability = Utils.NOTE_DEFAULTS.triggerProbability
    if (note.arpTriggerProbability == null) note.arpTriggerProbability = Utils.NOTE_DEFAULTS.arpTriggerProbability
    note.euclidianFill ??= Utils.NOTE_DEFAULTS.euclidianFill
    return note
}

export function fixTrackDefaults(track, indexTrack) {
    fixTrackPanning(track, indexTrack)
    if (track.useSoftSynth) track.useAutoAssignSound = false
    recalcLoopDerived(track)
    if (track.useAutoAssignSound === undefined) track.useAutoAssignSound = true
    track.swingResolution ??= Utils.TRACK_DEFAULTS.swingResolution
    track.swingAmount ??= Utils.TRACK_DEFAULTS.swingAmount
    track.velocityLfo ??= Utils.TRACK_DEFAULTS.velocityLfo
    track.pitchLfo ??= Utils.TRACK_DEFAULTS.pitchLfo
    track.panLfo ??= Utils.TRACK_DEFAULTS.panLfo
    track.filterFreqLfo ??= Utils.TRACK_DEFAULTS.filterFreqLfo
    track.filterQLfo ??= Utils.TRACK_DEFAULTS.filterQLfo
    track.filterType ??= Utils.TRACK_DEFAULTS.filterType
    if (track.filterType === 'all') track.filterType = 'allpass'
    if (track.filterFreq == null) track.filterFreq = Utils.TRACK_DEFAULTS.filterFreq
    if (track.filterQ == null) track.filterQ = Utils.TRACK_DEFAULTS.filterQ
    track.filterLfoFreq ??= 0
    track.sampleLength ??= 1
    track.notes ??= []
    track.notes.forEach(note => fixNoteDefaults(note, track))
    return track
}

export function fixPattern(pattern) {
    pattern.application ??= "online-ordrumbox"
    pattern.url ??= "https://www.ordrumbox.com"
    if (pattern.tracks) {
        Object.values(pattern.tracks).forEach((track, indexTrack) => {
            fixTrackDefaults(track, indexTrack)
        })
    }
    return pattern
}

export function fixPatterns(patterns) {
    return Object.values(patterns).map(pattern => fixPattern(pattern))
}

export function getUnloadedSamplesFromDrumkits(drumkits, existingSounds) {
    const samples = []
    const seenUrls = new Set()
    Object.values(drumkits || {}).forEach((drumkit) => {
        Object.values(drumkit?.instruments || {}).forEach((sample) => {
            if (!sample?.url || seenUrls.has(sample.url) || existingSounds[sample.url]?.buffer) {
                return
            }
            seenUrls.add(sample.url)
            samples.push({ sample, kitName: drumkit.name })
        })
    })
    return samples
}
