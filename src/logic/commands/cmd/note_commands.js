import { NOTE_DEFAULTS } from '../../../core/note_schema.js'
import { getTracksArray } from '../../../core/tracks.js'
import { appState } from '../../../state/app_state.js'
import { clampStepsPerBeat } from '../../../model/track_schema.js'
import { reportUserError } from '../../../core/notify.js'

function findPatternForTrack(track) {
    return appState.patterns.find((p) => getTracksArray(p).includes(track))
}

/**
 * Note commands — sub-module of the Commander (see CommanderHost in ../cmd.js).
 */
export default class NoteCommands {
    #host

    /** @param {import('../commander.js').CommanderHost} host */
    constructor(host) {
        this.#host = host
    }

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
                this.#host.incrementPatternVersionByTrack(track)
                this.#host.persist()
                const patName = findPatternForTrack(track)?.name ?? ''
                this.#host.record({
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
                        this.#host.incrementPatternVersionByTrack(track)
                        this.#host.persist()
                    },
                    undo: () => {
                        track.notes.splice(noteIndex, 0, deletedNote)
                        this.#host.incrementPatternVersionByTrack(track)
                        this.#host.persist()
                    },
                })
                return
            }
        }
    }

    addNote(track, beat, beatStep, pitch = 0) {
        // Defensive: addTrack already normalises, but a direct field write can
        // still leave the grid. Clamp + rescale (and say so) instead of
        // silently rewriting the track to 8 and leaving earlier notes stale.
        if (clampStepsPerBeat(track)) {
            reportUserError('Note.stepsPerBeat', `"${track.name}" uses ${track.stepsPerBeat} steps per beat`)
        }
        const stepPercent = Math.round((beatStep * 100) / track.stepsPerBeat)
        const note = {
            ...NOTE_DEFAULTS,
            beatStep,
            stepPercent,
            beat,
            pitch,
        }
        const noteIndex = track.notes.length
        track.notes.push(note)
        this.#host.incrementPatternVersionByTrack(track)
        this.#host.persist()
        const patName = findPatternForTrack(track)?.name ?? ''
        this.#host.record({
            desc: `Add note on ${track.name} in "${patName}"`,
            params: { track: track.name, beat, beatStep, pitch },
            execute: () => {
                if (track.notes.indexOf(note) === -1) {
                    track.notes.splice(Math.min(noteIndex, track.notes.length), 0, note)
                    this.#host.incrementPatternVersionByTrack(track)
                    this.#host.persist()
                }
            },
            undo: () => {
                const i = track.notes.indexOf(note)
                if (i >= 0) {
                    track.notes.splice(i, 1)
                    this.#host.incrementPatternVersionByTrack(track)
                    this.#host.persist()
                }
            },
        })
        return note
    }

    /**
     * Apply a partial note update (velocity, pitch, prob, arp, …), persist
     * and record one undoable entry. Diffed against the current values so
     * no-op updates never reach the history.
     * @param {any} track - owning track (version bump + persistence)
     * @param {any} note - the note object being edited
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
            this.#host.incrementPatternVersionByTrack(track)
            this.#host.persist()
        }
        const coalesceKey = coalesce
            ? `note:${this.#host.coalesceId(note)}:${Object.keys(newValues).sort().join(',')}`
            : undefined
        applyValues(newValues)
        this.#host.record({
            desc: desc ?? `Edit note on ${track?.name ?? 'track'}`,
            coalesceKey,
            params: { track: track?.name ?? '', ...newValues },
            prev: { ...oldValues },
            execute: () => applyValues(newValues),
            undo: () => applyValues(oldValues),
        })
        return note
    }

    pasteStepNotes(track, beat, beatStep, sourceNotes) {
        if (!track || !Array.isArray(sourceNotes)) return
        const spb = track.stepsPerBeat ?? 4
        const before = (track.notes ?? [])
            .filter((n) => n.beat === beat && n.beatStep === beatStep)
            .map((n) => ({ ...n }))

        track.notes = (track.notes ?? []).filter((n) => !(n.beat === beat && n.beatStep === beatStep))

        const added = sourceNotes.map((src) => ({
            ...NOTE_DEFAULTS,
            ...src,
            beat,
            beatStep,
            stepPercent: Math.round((beatStep * 100) / spb),
        }))
        track.notes.push(...added)

        this.#host.incrementPatternVersionByTrack(track)
        this.#host.persist()
        const patName = findPatternForTrack(track)?.name ?? ''
        this.#host.record({
            desc: `Paste step on ${track.name} in "${patName}"`,
            params: { track: track.name, beat, beatStep, notes: added.length },
            execute: () => {
                track.notes = (track.notes ?? []).filter((n) => !(n.beat === beat && n.beatStep === beatStep))
                track.notes.push(...added.map((n) => ({ ...n })))
                this.#host.incrementPatternVersionByTrack(track)
                this.#host.persist()
            },
            undo: () => {
                track.notes = (track.notes ?? []).filter((n) => !(n.beat === beat && n.beatStep === beatStep))
                track.notes.push(...before.map((n) => ({ ...n })))
                this.#host.incrementPatternVersionByTrack(track)
                this.#host.persist()
            },
        })
    }
}
