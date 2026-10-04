import { TICK } from '../core/constants.js'
import { semiToneToPitch } from '../core/notes.js'
import Defaults from './defaults.js'
import { logger } from '../core/logger.js'

export default class NoteParams {
    static TAG = 'NoteParams'

    /**
     * Delay applied to the off-beat notes of a swung group.
     *
     * `resolution` is the track's swingResolution (1-8), i.e. the grid the notes
     * are grouped on: the note at `beatStep % resolution === 1` is the one that
     * gets pushed late. 1 = straight (nothing is ever off-beat), 2 = every other
     * step, 4 = every fourth. It used to be hardcoded to 2, which made the knob
     * (editable in the track editor, persisted, undoable) do nothing.
     *
     * @param {{beatStep?: number}} note
     * @param {number} secondsPerTick  Sequencer tick duration (a beat is TICK of them)
     * @param {number} resolution  Swing grid (track.swingResolution)
     * @param {number} depth  Track swing intensity, 0-1: 1 delays by a whole beat,
     *   0.33 by a triplet
     * @returns {number} seconds to add to the note time
     */
    static computeSwingTime(note, secondsPerTick, resolution, depth) {
        const grid = Math.max(1, Math.floor(Number(resolution) || 1))
        if (grid === 1) return 0
        if (Math.floor(note.beatStep % grid) !== 1) return 0
        return depth * secondsPerTick * TICK
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
        const fpitch = semiToneToPitch(notePitch + trackPitch)
        return Math.floor(fpitch * 100) / 100
    }

    static applyNoteParams(flatNote, secondsPerTick) {
        flatNote.pan = this.computePan(flatNote)
        flatNote.fpitch = this.computePitch(flatNote)
        flatNote.baseFpitch = flatNote.fpitch
        flatNote.swingTime = this.computeSwingTime(
            flatNote.note,
            secondsPerTick,
            flatNote.track.swingResolution,
            flatNote.track.swingAmount,
        )
    }

    static tickToTime(tick, nbTickForPattern, patternDuration) {
        return (tick / nbTickForPattern) * patternDuration
    }
}
