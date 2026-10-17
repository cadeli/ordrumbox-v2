/**
 * A note projected onto the flat (linear) timeline of a pattern: one row in
 * the playback list, with its tick position, owning track and source note.
 */
export default class FlatNote {
    static TAG = 'FlatNote'

    /**
     * @param {number} tick - absolute tick position within the pattern
     * @param {any} track - owning track
     * @param {any} note - source note object
     */
    constructor(tick, track, note) {
        this.tick = tick
        this.track = track
        this.note = note
        this.pan = 0
        this.fpitch = 1
    }
}
