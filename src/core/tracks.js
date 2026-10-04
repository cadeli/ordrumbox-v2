import { createStepSignatureMap, getNoteAbsoluteStep } from './notes.js'
import { isMelodicTrack } from './drum_taxonomy.js'

/**
 * Returns the tracks of a pattern as an array, regardless of
 * the original format (Array or indexed object).
 *
 * @param {{tracks?: object|object[]}} pattern
 * @returns {any[]}
 */
export function getTracksArray(pattern) {
    if (!pattern?.tracks) return []
    return Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)
}

/**
 * Keep only the melodic tracks (BASS, PIANO, ORGAN) that have notes.
 * Returns a NEW array; `tracks` is left untouched.
 *
 * @param {Array} tracks
 * @returns {Array}
 */
export function filterEmptyMelodicTracks(tracks) {
    return tracks.filter((t) => !isMelodicTrack(t) || (t.notes && t.notes.length > 0))
}

/**
 * Compute how many steps a track spans: its declared beatCount × stepsPerBeat,
 * widened to the last note when that reaches further.
 *
 * @param {any} track
 * @returns {number}
 */
export function getTrackStepLength(track) {
    const stepsPerBeat = Number(track?.stepsPerBeat)
    const beats = Number(track?.beatCount)
    const declaredSteps =
        Number.isFinite(beats) && beats > 0 && Number.isFinite(stepsPerBeat) && stepsPerBeat > 0
            ? Math.floor(beats * stepsPerBeat)
            : 0
    const notesLastStep = Math.max(
        0,
        ...Object.values(track?.notes ?? []).map((note) => getNoteAbsoluteStep(note, stepsPerBeat) + 1),
    )
    return Math.max(declaredSteps, notesLastStep)
}

/**
 * The step the track loops at: its `loopAtStep` when set, its full length
 * otherwise — `loopAtStep` is the single source of truth for the loop.
 *
 * @param {any} track
 * @returns {number}
 */
export function getTrackLoopAtStep(track) {
    const loopAtStep = Number(track?.loopAtStep)
    if (Number.isFinite(loopAtStep) && loopAtStep > 0) {
        return Math.floor(loopAtStep)
    }

    return getTrackStepLength(track)
}

/**
 * Whether the notes of a track repeat identically for `trackSteps` steps when
 * truncated to `loopAtStep` — the test `addLoopToTrackIfPossible` uses to find
 * the shortest real loop instead of storing a duplicate of the pattern length.
 *
 * @param {any} track
 * @param {number} loopAtStep
 * @param {number} [trackSteps] - defaults to the track length
 * @returns {boolean}
 */
export function trackNotesMatchLoop(track, loopAtStep, trackSteps = getTrackStepLength(track)) {
    const stepsPerBeat = Number(track.stepsPerBeat)
    const original = createStepSignatureMap(track.notes, stepsPerBeat, (step) => step)
    // Only the first cycle is folded back: notes past loopAtStep are what the
    // loop would have to repeat, so comparing them would compare the loop to itself.
    const looped = createStepSignatureMap(
        track.notes.filter((note) => getNoteAbsoluteStep(note, stepsPerBeat) < loopAtStep),
        stepsPerBeat,
        (step) => step % loopAtStep,
    )

    for (let step = 0; step < trackSteps; step++) {
        const originalSignature = original.get(step) ?? ''
        const loopedSignature = looped.get(step % loopAtStep) ?? ''
        if (originalSignature !== loopedSignature) {
            return false
        }
    }
    return true
}

/**
 * Shorten a track to its shortest repeating loop, when it has one.
 *
 * @param {any} track - mutated in place (notes filtered, loopAtStep written)
 * @returns {{changed: boolean, reason: string, loopAtStep: number|null, removedNotes: number}}
 */
export function addLoopToTrackIfPossible(track) {
    if (!track || !Array.isArray(track.notes)) {
        return { changed: false, reason: 'invalid-track', loopAtStep: null, removedNotes: 0 }
    }

    const stepsPerBeat = Number(track.stepsPerBeat)
    if (!Number.isInteger(stepsPerBeat) || stepsPerBeat <= 0) {
        return { changed: false, reason: 'invalid-beat-quantize', loopAtStep: null, removedNotes: 0 }
    }

    const trackSteps = getTrackStepLength(track)
    if (trackSteps <= 1) {
        return { changed: false, reason: 'track-too-short', loopAtStep: null, removedNotes: 0 }
    }

    const currentLoopAtStep = getTrackLoopAtStep(track)

    if (track.notes.length === 0) {
        return {
            changed: false,
            reason: 'no-notes',
            loopAtStep: currentLoopAtStep,
            removedNotes: 0,
        }
    }

    for (let loopAtStep = 1; loopAtStep < currentLoopAtStep; loopAtStep++) {
        if (!trackNotesMatchLoop(track, loopAtStep, trackSteps)) {
            continue
        }

        const previousNoteCount = track.notes.length
        track.notes = track.notes
            .filter((note) => getNoteAbsoluteStep(note, stepsPerBeat) < loopAtStep)
            .sort((a, b) => getNoteAbsoluteStep(a, stepsPerBeat) - getNoteAbsoluteStep(b, stepsPerBeat))

        track.loopAtStep = loopAtStep

        return {
            changed: true,
            reason: 'loop-added',
            loopAtStep,
            removedNotes: previousNoteCount - track.notes.length,
        }
    }

    return {
        changed: false,
        reason: 'no-identical-loop-found',
        loopAtStep: currentLoopAtStep,
        removedNotes: 0,
    }
}

/**
 * Determine whether a track should produce sound given solo/mute state.
 * When any track has solo=true, only soloed tracks play.
 * Otherwise, all non-muted tracks play.
 *
 * @param {any} track       - track object with mute/solo properties
 * @param {boolean} anySolo - whether any track in the pattern has solo=true
 * @returns {boolean}
 */
export function shouldTrackPlay(track, anySolo) {
    return anySolo ? track.solo === true : track.mute !== true
}

/**
 * Compute whether any track in a tracks collection has solo enabled.
 *
 * @param {object[]|object} tracks - array or object values of tracks
 * @returns {boolean}
 */
export function hasAnySolo(tracks) {
    const arr = Array.isArray(tracks) ? tracks : Object.values(tracks)
    return arr.some((t) => t.solo === true)
}
