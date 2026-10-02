import Utils from '../core/utils.js'
import { recalcLoopDerived, normalizeTrack } from '../model/track_schema.js'
import { compactArrayToNote, isCompactFormat, normalizeNote } from '../core/note_schema.js'
import { ensurePatternId } from '../core/ids.js'
import { normalizeSongs } from '../model/song_schema.js'

/**
 * Expand compact note arrays to objects if track uses compact format.
 * Mutates the track in place.
 */
function expandCompactNotes(track) {
    if (!isCompactFormat(track)) return

    const keys = track.noteKeys
    track.notes = track.notes.map((arr) => compactArrayToNote(arr, keys))
    delete track.noteKeys
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

export function fixTrackDefaults(track, indexTrack) {
    expandCompactNotes(track)

    const normalized = normalizeTrack(track)
    Object.assign(track, normalized)

    fixTrackPanning(track, indexTrack)
    if (track.useSoftSynth) track.useAutoAssignSound = false
    recalcLoopDerived(track)
    if (track.useAutoAssignSound === undefined) track.useAutoAssignSound = true
    track.notes ??= []
    track.notes.forEach((note) => {
        fixNoteStepBar(track, note)
        Object.assign(note, normalizeNote(note))
    })
    return track
}

export function fixPattern(pattern, takenIds = new Set()) {
    pattern.application ??= 'online-ordrumbox'
    pattern.url ??= 'https://www.ordrumbox.com'
    // Every pattern that reaches the app passes through here, so this is the one
    // place that can guarantee a stable id. Existing ids are never rewritten.
    ensurePatternId(pattern, takenIds)
    if (pattern.tracks) {
        Utils.getTracksArray(pattern).forEach((track, indexTrack) => {
            fixTrackDefaults(track, indexTrack)
        })
    }
    return pattern
}

export function fixPatterns(patterns) {
    // Shared across the whole library so two same-named patterns cannot collide.
    const takenIds = new Set()
    return Object.values(patterns).map((pattern) => fixPattern(pattern, takenIds))
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

/**
 * Validate the arrangements of a song file against the pattern ids of the
 * library it will be loaded with. Exposed here because the loader layer may not
 * import `model` directly (tests/module_graph.test.js), while `patterns` may.
 * @param {any} rawSongs
 * @param {any[]} fixedPatterns patterns after fixPatterns()
 * @returns {{ songs: object[], dropped: Array<{pattern: string, reason: string}> }}
 */
export function fixSongs(rawSongs, fixedPatterns) {
    const ids = new Set(fixedPatterns.map((p) => p?.id).filter(Boolean))
    return normalizeSongs(rawSongs, ids)
}
