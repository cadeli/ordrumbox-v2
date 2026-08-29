import Utils from '../../../core/utils.js'
import { appState } from '../../../state/app_state.js'
import { logger } from '../../../core/logger.js'

function _findPatternForTrack(track) {
    return appState.patterns.find(p => Utils.getTracksArray(p).includes(track))
}

/**
 * Note CRUD commands — returns an object of methods bound to the Commander instance.
 */
export function createNoteMethods(cmd) {
    return {
        deleteNote(track, selNote) {
            const values = Object.values(track.notes)
            for (let i = values.length - 1; i >= 0; i--) {
                const note = values[i]
                if (note.beatStep === selNote.beatStep && note.beat === selNote.beat && (note.pitch ?? 0) === (selNote.pitch ?? 0)) {
                    const deletedNote = { ...note }
                    const noteIndex = track.notes.indexOf(note)
                    track.notes.splice(noteIndex, 1)
                    cmd._incrementPatternVersionByTrack(track)
                    cmd._persist()
                    const patName = _findPatternForTrack(track)?.name ?? ''
                    cmd._record(() => {
                        track.notes.splice(noteIndex, 0, deletedNote)
                        cmd._incrementPatternVersionByTrack(track)
                        cmd._persist()
                    }, { desc: `Delete note on ${track.name} in "${patName}"` })
                    return
                }
            }
        },

        addNote(track, beat, beatStep, pitch = 0) {
            let steppc = Math.round((beatStep * 100) / track.stepsPerBeat)
            if (steppc > 100) {
                logger.warn('Cmd', `stepsPerBeat override ${track.stepsPerBeat} → 8 (beatStep ${beatStep})`)
                track.stepsPerBeat = 8
                steppc = Math.round((beatStep * 100) / track.stepsPerBeat)
            }
            const note = {
                ...Utils.NOTE_DEFAULTS,
                beatStep,
                steppc,
                beat,
                pitch
            }
            const noteIndex = track.notes.length
            track.notes.push(note)
            cmd._incrementPatternVersionByTrack(track)
            cmd._persist()
            const patName = _findPatternForTrack(track)?.name ?? ''
            cmd._record(() => {
                track.notes.splice(noteIndex, 1)
                cmd._incrementPatternVersionByTrack(track)
                cmd._persist()
            }, { desc: `Add note on ${track.name} in "${patName}"` })
            return note
        }
    }
}
