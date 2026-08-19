import Utils from '../core/utils.js'
import Defaults from './defaults.js'
import { logger } from '../core/logger.js'

export default class NoteParams {
    static TAG = "NoteParams"

    static SWING_RESOLUTION_OVERRIDE = 2

    static computeSwingTime(note, secondsPerBeat, _rez, depth) {
        if (Math.floor(note.beatStep % this.SWING_RESOLUTION_OVERRIDE) === 1) {
            return depth * secondsPerBeat
        }
        return 0
    }

    static computePan(flatNote) {
        const notePan = Defaults.getNoteProp(flatNote.note, 'pan')
        const trackPan = Defaults.getTrackProp(flatNote.track, 'pan')
        const n = parseFloat(notePan)
        const t = parseFloat(trackPan)
        if (!Number.isFinite(n) || !Number.isFinite(t)) {
            logger.warn('NoteParams', 'NaN pan value', { notePan, trackPan })
            return 0
        }
        const pan = (n + t) / 2
        return Math.floor(pan * 100) / 100
    }

    static computePitch(flatNote) {
        const notePitch = Defaults.getNoteProp(flatNote.note, 'pitch')
        const trackPitch = Defaults.getTrackProp(flatNote.track, 'pitch')
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
