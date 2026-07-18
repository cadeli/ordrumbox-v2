import Utils from '../core/utils.js'
import { recalcLoopDerived, normalizeTrack } from '../model/track_schema.js'
import {
    NOTE_DEFAULTS,
    NOTE_KEY_ORDER,
    compactArrayToNote,
    isCompactFormat,
    normalizeNote
} from '../core/note_schema.js'

/**
 * Expand compact note arrays to objects if track uses compact format.
 * Mutates the track in place.
 */
function expandCompactNotes(track) {
    if (!isCompactFormat(track)) return;

    const keys = track.noteKeys;
    track.notes = track.notes.map(arr => compactArrayToNote(arr, keys));
    delete track.noteKeys;
}

export function fixTrackPanning(track, indexTrack) {
    track.pan = Utils.computeTrackPan(indexTrack)
    return track
}

export function fixNoteStepBar(track, note) {
    if (note.beatStep >= track.stepsPerBeat) {
        const pStep = note.beatStep
        note.beatStep %= track.stepsPerBeat
        note.beat = Math.floor(pStep / track.stepsPerBeat)
    }
    note.steppc = Math.round((note.beatStep * 100) / track.stepsPerBeat)
    return note
}

/**
 * @deprecated Use normalizeNote from note_schema.js instead
 * Kept for backward compatibility with tests
 */
export function fixNoteDefaults(note, track) {
    fixNoteStepBar(track, note)
    Object.assign(note, normalizeNote(note))
    return note
}

export function fixTrackDefaults(track, indexTrack) {
    expandCompactNotes(track);

    const normalized = normalizeTrack(track)
    Object.assign(track, normalized)

    fixTrackPanning(track, indexTrack)
    if (track.useSoftSynth) track.useAutoAssignSound = false
    recalcLoopDerived(track)
    if (track.useAutoAssignSound === undefined) track.useAutoAssignSound = true
    track.notes ??= []
    track.notes.forEach(note => {
        fixNoteStepBar(track, note)
        Object.assign(note, normalizeNote(note))
    })
    return track
}

export function fixPattern(pattern) {
    pattern.application ??= "online-ordrumbox"
    pattern.url ??= "https://www.ordrumbox.com"
    if (pattern.tracks) {
        Utils.getTracksArray(pattern).forEach((track, indexTrack) => {
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
    Object.values(drumkits ?? {}).forEach((drumkit) => {
        Object.values(drumkit?.instruments ?? {}).forEach((sample) => {
            if (!sample?.url || seenUrls.has(sample.url) || existingSounds[sample.url]?.buffer) {
                return
            }
            seenUrls.add(sample.url)
            samples.push({ sample, kitName: drumkit.name })
        })
    })
    return samples
}
