/**
 * A note projected onto the flat (linear) timeline of a pattern: one row in
 * the playback list, with its tick position, owning track and source note.
 */
export default class FlatNote {
    static TAG = 'FlatNote'

    /**
     * @param {number} tick - absolute tick position within the pattern
     * @param {import('./track_schema.js').Track} track - owning track
     * @param {Partial<import('../core/note_schema.js').Note>} note - source note object
     *   (partial: a player preview note carries no beat/beatStep)
     */
    constructor(tick, track, note) {
        this.tick = tick
        this.track = track
        this.note = note
        this.pan = 0
        this.fpitch = 1
    }

    /**
     * Swing offset in seconds, assigned by NoteParams.applyNoteParams before
     * the playback/export schedulers read it.
     * @type {number|undefined}
     */
    swingTime
}
