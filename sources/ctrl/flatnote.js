import Utils from '../utils.js'

export default class MfFlatNote {
    static TAG = "MFFLATNOTE"

    constructor(tick, soundNum, track, note) {
        this.tick = tick
        this.soundNum = soundNum
        this.track = track
        this.note = note
        this.pano = 0
        this.fpitch = 1
    }
}