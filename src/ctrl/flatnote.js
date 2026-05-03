
export default class MfFlatNote {
    static TAG = "MFFLATNOTE"

    constructor(tick, soundId, track, note) {
        this.tick = tick
        this.soundId = soundId
        this.track = track
        this.note = note
        this.pano = 0
        this.fpitch = 1
    }
}