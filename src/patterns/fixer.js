import { getPanFromTrackName } from '../core/drum_taxonomy.js'
import { getTracksArray } from '../core/tracks.js'
import { normalizeTrack } from '../model/track_schema.js'
import {
    canonicalNoteKeys,
    compactArrayToNote,
    isCompactFormat,
    migrateLegacyNoteKeys,
    normalizeNote,
} from '../core/note_schema.js'
import { ensurePatternId } from '../core/ids.js'
import { normalizeSongs } from '../model/song_schema.js'

/**
 * Expand compact note arrays to objects if track uses compact format.
 * Mutates the track in place.
 */
function expandCompactNotes(track) {
    if (!isCompactFormat(track)) return

    const keys = canonicalNoteKeys(track.noteKeys)
    track.notes = track.notes.map((arr) => compactArrayToNote(arr, keys))
    delete track.noteKeys
}

/**
 * Fill in a missing pan from the track's drum type.
 *
 * PAN_MAP is indexed by DRUM TYPE (TRACK_NAME_TO_INDEX), so the pan
 * comes from the type and never from the track's slot in the pattern: this used
 * to take the array index, so loading a pattern overwrote every pan the file
 * carried with a value picked from the track's position (a KICK in slot 1 came
 * back panned like a SNARE).
 *
 * @param {{name?: string, pan?: number}} track
 * @returns {{name?: string, pan?: number}} the same track
 */
export function fixTrackPanning(track) {
    if (typeof track.pan !== 'number') track.pan = getPanFromTrackName(track.name)
    return track
}

export function normalizeNoteGridPosition(track, note) {
    if (note.beatStep >= track.stepsPerBeat) {
        const prevBeatStep = note.beatStep
        note.beatStep %= track.stepsPerBeat
        note.beat = Math.floor(prevBeatStep / track.stepsPerBeat)
    }
    note.stepPercent = Math.round((note.beatStep * 100) / track.stepsPerBeat)
    return note
}

export function fixTrackDefaults(track) {
    expandCompactNotes(track)
    // before normalizeTrack(): that fills pan with its default, and the point here
    // is to tell "the file carries a pan" from "the file carries none"
    fixTrackPanning(track)

    const normalized = normalizeTrack(track)
    Object.assign(track, normalized)

    if (track.useSoftSynth) track.useAutoAssignSound = false
    if (track.useAutoAssignSound === undefined) track.useAutoAssignSound = true
    track.notes ??= []
    track.notes.forEach((note) => {
        // before normalizeNote(): a legacy key must be renamed (and dropped) so
        // it cannot survive the `...note` spread and reach the exporter again
        migrateLegacyNoteKeys(note)
        normalizeNoteGridPosition(track, note)
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
        // hot path on load: no index needed, the pan comes from the track type
        for (const track of getTracksArray(pattern)) fixTrackDefaults(track)
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
