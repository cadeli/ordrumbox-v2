import Utils from '../../../core/utils.js'
import { appState } from '../../../state/app_state.js'
import { logger } from '../../../core/logger.js'

function findPatternForTrack(track) {
    return appState.patterns.find((p) => Utils.getTracksArray(p).includes(track))
}

/**
 * Note CRUD commands — returns an object of methods bound to the Commander instance.
 */
export function createNoteMethods(cmd) {
    return {
        deleteNote(track, selectedNote) {
            const values = Object.values(track.notes)
            for (let i = values.length - 1; i >= 0; i--) {
                const note = values[i]
                if (
                    note.beatStep === selectedNote.beatStep &&
                    note.beat === selectedNote.beat &&
                    (note.pitch ?? 0) === (selectedNote.pitch ?? 0)
                ) {
                    const deletedNote = { ...note }
                    const noteIndex = track.notes.indexOf(note)
                    track.notes.splice(noteIndex, 1)
                    cmd.incrementPatternVersionByTrack(track)
                    cmd.persist()
                    const patName = findPatternForTrack(track)?.name ?? ''
                    cmd.record({
                        desc: `Delete note on ${track.name} in "${patName}"`,
                        params: {
                            track: track.name,
                            beat: deletedNote.beat,
                            beatStep: deletedNote.beatStep,
                            pitch: deletedNote.pitch ?? 0,
                        },
                        execute: () => {
                            const i = track.notes.indexOf(deletedNote)
                            track.notes.splice(i >= 0 ? i : noteIndex, 1)
                            cmd.incrementPatternVersionByTrack(track)
                            cmd.persist()
                        },
                        undo: () => {
                            track.notes.splice(noteIndex, 0, deletedNote)
                            cmd.incrementPatternVersionByTrack(track)
                            cmd.persist()
                        },
                    })
                    return
                }
            }
        },

        addNote(track, beat, beatStep, pitch = 0) {
            if (!Number.isInteger(track.stepsPerBeat) || track.stepsPerBeat < 1 || track.stepsPerBeat > 8) {
                logger.warn('Cmd', `stepsPerBeat out of bounds (${track.stepsPerBeat}), resetting to 8`)
                track.stepsPerBeat = 8
            }
            const steppc = Math.round((beatStep * 100) / track.stepsPerBeat)
            const note = {
                ...Utils.NOTE_DEFAULTS,
                beatStep,
                steppc,
                beat,
                pitch,
            }
            const noteIndex = track.notes.length
            track.notes.push(note)
            cmd.incrementPatternVersionByTrack(track)
            cmd.persist()
            const patName = findPatternForTrack(track)?.name ?? ''
            cmd.record({
                desc: `Add note on ${track.name} in "${patName}"`,
                params: { track: track.name, beat, beatStep, pitch },
                execute: () => {
                    if (track.notes.indexOf(note) === -1) {
                        track.notes.splice(Math.min(noteIndex, track.notes.length), 0, note)
                        cmd.incrementPatternVersionByTrack(track)
                        cmd.persist()
                    }
                },
                undo: () => {
                    const i = track.notes.indexOf(note)
                    if (i >= 0) {
                        track.notes.splice(i, 1)
                        cmd.incrementPatternVersionByTrack(track)
                        cmd.persist()
                    }
                },
            })
            return note
        },

        /**
         * Apply a partial note update (velocity, pitch, prob, arp, …), persist
         * and record one undoable entry. Diffed against the current values so
         * no-op updates never reach the history.
         * @param {object} track - owning track (version bump + persistence)
         * @param {object} note - the note object being edited
         * @param {object} updates - key → value
         * @param {object} [opts]
         * @param {string} [opts.desc] - history label
         * @param {boolean} [opts.coalesce] - merge rapid same-key updates of
         *   this note into ONE undo step (continuous sliders/knobs)
         * @returns {object} the note
         */
        updateNote(track, note, updates, { desc, coalesce = false } = {}) {
            if (!note || !updates || typeof updates !== 'object') return note

            const oldValues = {}
            const newValues = {}
            for (const [k, v] of Object.entries(updates)) {
                if (Object.is(note[k], v)) continue
                oldValues[k] = note[k]
                newValues[k] = v
            }
            if (Object.keys(newValues).length === 0) return note

            const applyValues = (values) => {
                Object.assign(note, values)
                cmd.incrementPatternVersionByTrack(track)
                cmd.persist()
            }
            const coalesceKey = coalesce
                ? `note:${cmd.coalesceId(note)}:${Object.keys(newValues).sort().join(',')}`
                : undefined
            applyValues(newValues)
            cmd.record({
                desc: desc ?? `Edit note on ${track?.name ?? 'track'}`,
                coalesceKey,
                params: { track: track?.name ?? '', ...newValues },
                prev: { ...oldValues },
                execute: () => applyValues(newValues),
                undo: () => applyValues(oldValues),
            })
            return note
        },

        pasteStepNotes(track, beat, beatStep, sourceNotes) {
            if (!track || !Array.isArray(sourceNotes)) return
            const spb = track.stepsPerBeat ?? 4
            const before = (track.notes ?? [])
                .filter((n) => n.beat === beat && n.beatStep === beatStep)
                .map((n) => ({ ...n }))

            track.notes = (track.notes ?? []).filter((n) => !(n.beat === beat && n.beatStep === beatStep))

            const added = sourceNotes.map((src) => ({
                ...Utils.NOTE_DEFAULTS,
                ...src,
                beat,
                beatStep,
                steppc: Math.round((beatStep * 100) / spb),
            }))
            track.notes.push(...added)

            cmd.incrementPatternVersionByTrack(track)
            cmd.persist()
            const patName = findPatternForTrack(track)?.name ?? ''
            cmd.record({
                desc: `Paste step on ${track.name} in "${patName}"`,
                params: { track: track.name, beat, beatStep, notes: added.length },
                execute: () => {
                    track.notes = (track.notes ?? []).filter((n) => !(n.beat === beat && n.beatStep === beatStep))
                    track.notes.push(...added.map((n) => ({ ...n })))
                    cmd.incrementPatternVersionByTrack(track)
                    cmd.persist()
                },
                undo: () => {
                    track.notes = (track.notes ?? []).filter((n) => !(n.beat === beat && n.beatStep === beatStep))
                    track.notes.push(...before.map((n) => ({ ...n })))
                    cmd.incrementPatternVersionByTrack(track)
                    cmd.persist()
                },
            })
        },
    }
}
