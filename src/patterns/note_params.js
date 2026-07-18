import Utils from '../core/utils.js'
import MfDefaults from './defaults.js'

export default class MfNoteParams {
    static TAG = "MFNOTEPARAMS"

    static SWING_RESOLUTION_OVERRIDE = 2

    static computeSwingTime(note, secondsPerBeat, _rez, depth) {
        if (Math.floor(note.beatStep % this.SWING_RESOLUTION_OVERRIDE) === 1) {
            return depth * secondsPerBeat
        }
        return 0
    }

    static computePan(flatNote) {
        const notePan = MfDefaults.getNoteProp(flatNote.note, 'pan')
        const trackPan = MfDefaults.getTrackProp(flatNote.track, 'pan')
        const pan = (parseFloat(notePan) + parseFloat(trackPan)) / 2
        return Math.floor(pan * 100) / 100
    }

    static computePitch(flatNote) {
        const notePitch = MfDefaults.getNoteProp(flatNote.note, 'pitch')
        const trackPitch = MfDefaults.getTrackProp(flatNote.track, 'pitch')
        const fpitch = Utils.semiToneToPitch(notePitch + trackPitch)
        return Math.floor(fpitch * 100) / 100
    }

    static applyNoteParams(flatNote, secondsPerBeat) {
        flatNote.pan = this.computePan(flatNote)
        flatNote.fpitch = this.computePitch(flatNote)
        flatNote.baseFpitch = flatNote.fpitch
        flatNote.swingTime = this.computeSwingTime(
            flatNote.note,
            secondsPerBeat,
            flatNote.track.swingResolution,
            flatNote.track.swingAmount
        )
    }

    static tickToTime(tick, nbTickForPattern, patternDuration) {
        return (tick / nbTickForPattern) * patternDuration
    }
}
