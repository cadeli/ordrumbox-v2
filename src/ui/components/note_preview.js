// src/ui/components/note_preview.js
// Audible feedback while a note is being edited.
//
// Clicking a note already previews it (seq.simpleBeep), but a drag is silent:
// without this the user edits velocity/pitch blind and hears nothing until the
// pattern loops. Throttled, because a drag fires dozens of pointer moves per
// second and one hit per move would be a machine gun.

/** Minimum delay between two previews of an edited note, in ms. */
const MIN_INTERVAL_MS = 90

/** Timestamp of the last preview, module level: one note edited at a time. */
let lastPlayAt = 0

/**
 * Previews the note with its current values, at most every MIN_INTERVAL_MS.
 * @param {{simpleBeep?: Function}} seq - sequencer service (injected)
 * @param {number} trackIdx - track the note belongs to
 * @param {Object} note - the note, read as-is (velocity/pitch included)
 */
export function previewNote(seq, trackIdx, note) {
    if (!seq?.simpleBeep || !note || !Number.isInteger(trackIdx) || trackIdx < 0) return
    const now = Date.now()
    if (now - lastPlayAt < MIN_INTERVAL_MS) return
    lastPlayAt = now
    seq.simpleBeep(trackIdx, note)
}

/** Resets the throttle (tests, and panel teardown). */
export function resetNotePreviewThrottle() {
    lastPlayAt = 0
}
