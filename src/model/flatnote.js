
export default class MfFlatNote {
    static TAG = "MFFLATNOTE"

    constructor(tick, track, note) {
        this.tick = tick
        this.track = track
        this.note = note
        this.pan = 0
        this.fpitch = 1
    }
}