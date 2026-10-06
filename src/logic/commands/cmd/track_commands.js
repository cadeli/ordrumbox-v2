import { clamp } from '../../../core/numbers.js'
import { getPanFromTrackName } from '../../../core/drum_taxonomy.js'
import { addLoopToTrackIfPossible, getTracksArray } from '../../../core/tracks.js'
import { NOT_FOUND } from '../../../core/constants.js'
import { clampStepsPerBeat, normalizeTrack, TRACK_VALUE_RANGES } from '../../../model/track_schema.js'
import { reportUserError } from '../../../core/notify.js'
import { soundRegistry } from '../../../state/sound_registry.js'
import RandomGenerator from '../../generators/random_generator.js'

const TRACK_STATE_KEYS = ['notes', 'loopAtStep']

/**
 * Track commands — sub-module of the Commander (see CommanderHost in ../cmd.js).
 */
export default class TrackCommands {
    #host
    #randomGen = new RandomGenerator()

    /** @param {import('../commander.js').CommanderHost} host */
    constructor(host) {
        this.#host = host
    }

    #snapshotTrack(track, keys) {
        const snap = {}
        for (const key of keys) {
            const value = track[key]
            snap[key] = Array.isArray(value) ? value.map((n) => ({ ...n })) : value
        }
        return snap
    }

    #restoreTrack(track, snap, keys) {
        for (const key of keys) track[key] = snap[key]
        this.#host.persist()
    }

    /**
     * Snapshot track keys, run mutate, record undo that restores the snapshot.
     * mutate may return false to skip recording (no-op).
     * options.persist: call this.#host.persist() after mutate.
     * options.coalesceKey: merge rapid same-key updates into one undo step.
     *
     * The changed keys (before → after) are recorded as meta.params/prev so
     * the undo/redo report toast can show exactly what this command touched.
     *
     * @param {any} track
     * @param {string[]} keys
     * @param {string} desc
     * @param {() => false | void} mutate
     * @param {{persist?: boolean, coalesceKey?: string}} [opts]
     */
    #withUndo(track, keys, desc, mutate, { persist = false, coalesceKey } = {}) {
        const before = this.#snapshotTrack(track, keys)
        const recordable = mutate() !== false
        if (persist) this.#host.persist()
        if (recordable) {
            const after = this.#snapshotTrack(track, keys)
            const params = { track: track.name }
            const prev = {}
            for (const key of keys) {
                const b = before[key]
                const a = after[key]
                const changed = Array.isArray(b) || Array.isArray(a) ? JSON.stringify(b) !== JSON.stringify(a) : b !== a
                if (changed) {
                    params[key] = a
                    prev[key] = b
                }
            }
            this.#host.record({
                desc,
                coalesceKey,
                params,
                prev,
                execute: () => this.#restoreTrack(track, after, keys),
                undo: () => this.#restoreTrack(track, before, keys),
            })
        }
        return before
    }

    addTrack(pattern, type, stepsPerBeat = 4) {
        const track = this.createTrack(pattern.beatCount, type, stepsPerBeat)
        // Clamp here rather than at first note: an out-of-grid track must be
        // corrected before any stepPercent/beatStep is derived from it.
        if (clampStepsPerBeat(track)) {
            reportUserError('Track.stepsPerBeat', `"${track.name}" uses ${track.stepsPerBeat} steps per beat`)
        }
        const trackIdx = pattern.tracks.length
        pattern.tracks.push(track)
        this.#host.persist()
        this.#host.record({
            desc: `Add track ${track.name}`,
            params: { track: track.name, index: trackIdx, type, stepsPerBeat },
            execute: () => {
                if (!pattern.tracks.includes(track)) {
                    pattern.tracks.splice(Math.min(trackIdx, pattern.tracks.length), 0, track)
                    this.#host.persist()
                }
            },
            undo: () => {
                const i = pattern.tracks.indexOf(track)
                if (i >= 0) pattern.tracks.splice(i, 1)
                this.#host.persist()
            },
        })
        return track
    }

    removeTrack(pattern, trackIdx) {
        if (!Array.isArray(pattern.tracks)) {
            pattern.tracks = getTracksArray(pattern)
        }
        const tracks = pattern.tracks
        if (trackIdx < 0 || trackIdx >= tracks.length) return
        const removed = tracks[trackIdx]
        const removedNotes = removed.notes.map((n) => ({ ...n }))
        tracks.splice(trackIdx, 1)
        this.#host.persist()
        this.#host.record({
            desc: `Remove track ${removed.name}`,
            params: { track: removed.name, index: trackIdx, notes: removedNotes.length },
            execute: () => {
                const i = tracks.indexOf(removed)
                tracks.splice(i >= 0 ? i : trackIdx, 1)
                this.#host.persist()
            },
            undo: () => {
                tracks.splice(Math.min(trackIdx, tracks.length), 0, removed)
                removed.notes = removedNotes
                this.#host.persist()
            },
        })
    }

    pasteTrack(pattern, insertIdx, sourceTrack) {
        if (!pattern || !sourceTrack) return null
        if (!Array.isArray(pattern.tracks)) {
            pattern.tracks = getTracksArray(pattern)
        }
        const tracks = pattern.tracks
        const existingNames = new Set(tracks.map((t) => t?.name))
        let name = `${sourceTrack.name ?? 'TRACK'} copy`
        let n = 2
        while (existingNames.has(name)) {
            name = `${sourceTrack.name ?? 'TRACK'} copy ${n++}`
        }

        const clone = structuredClone(sourceTrack)
        clone.name = name
        clone.notes = (sourceTrack.notes ?? []).map((note) => ({ ...note }))

        const idx = clamp(insertIdx, 0, tracks.length)
        tracks.splice(idx, 0, clone)
        this.#host.persist()
        this.#host.record({
            desc: `Paste track ${name}`,
            params: { track: name, index: idx, from: sourceTrack.name },
            execute: () => {
                if (!tracks.includes(clone)) {
                    tracks.splice(Math.min(idx, tracks.length), 0, clone)
                    this.#host.persist()
                }
            },
            undo: () => {
                const i = tracks.indexOf(clone)
                if (i >= 0) tracks.splice(i, 1)
                this.#host.persist()
            },
        })
        return clone
    }

    createTrack(beatCount, name, stepsPerBeat = 4) {
        const newTrack = normalizeTrack({
            name,
            beatCount: beatCount,
            stepsPerBeat,
            loopAtStep: beatCount * stepsPerBeat,
            pan: getPanFromTrackName(name),
        })
        return newTrack
    }

    /**
     * Set stepsPerBeat to an absolute value (clamped 1..8) and migrate the
     * notes / loop point proportionally:
     * - notes: stepPercent (absolute position) is preserved → beatStep rescaled
     * - loopAtStep is clamped to the new beat length
     * @param {any} track
     * @param {number} value - target steps per beat
     * @param {object} [opts]
     * @param {boolean} [opts.coalesce] - merge rapid changes into one undo step
     * @returns {boolean} true when a change was applied
     */
    setStepsPerBeat(track, value, { coalesce = false } = {}) {
        const range = TRACK_VALUE_RANGES.stepsPerBeat
        const target = Math.round(clamp(value, range.min, range.max))
        if (!track || !Number.isFinite(target) || target === track.stepsPerBeat) return false

        this.#withUndo(
            track,
            ['stepsPerBeat', 'loopAtStep', 'notes'],
            `Steps per beat on ${track.name}`,
            () => {
                const oldStepsPerBeat = track.stepsPerBeat
                track.stepsPerBeat = target

                if (track.notes) {
                    for (const note of track.notes) {
                        const stepPercent =
                            note.stepPercent ?? Math.round((note.beatStep * 100) / (oldStepsPerBeat ?? 4))
                        note.beatStep = Math.min(Math.round((stepPercent / 100) * target), target - 1)
                    }
                }

                const maxSteps = (track.beatCount ?? 4) * target
                if (track.loopAtStep > maxSteps) track.loopAtStep = maxSteps
            },
            {
                persist: true,
                coalesceKey: coalesce ? `track:${this.#host.coalesceId(track)}:stepsPerBeat` : undefined,
            },
        )
        return true
    }

    /** One step up on the subdivision cycle, wrapping 8 → 1. */
    incrStepsPerBeat(track) {
        // Cyclic wrap: 8 → 1 (intentional, not a bug)
        const next = track.stepsPerBeat >= 8 ? 1 : track.stepsPerBeat + 1
        this.setStepsPerBeat(track, next)
    }

    /** Moves the loop point BACK by one step, wrapping to the track end. */
    decrLoopPoint(track) {
        this.#withUndo(
            track,
            ['loopAtStep'],
            `Loop point back on ${track.name}`,
            () => {
                track.loopAtStep--
                if (track.loopAtStep < 1) {
                    track.loopAtStep = track.stepsPerBeat * track.beatCount
                }
            },
            { persist: true },
        )
    }

    cleanPattern(pattern) {
        getTracksArray(pattern).forEach((track) => {
            this.cleanTrack(track)
        })
    }

    cleanTrack(track) {
        this.#withUndo(track, TRACK_STATE_KEYS, `Clean ${track.name}`, () => {
            track.notes = []
            track.loopAtStep = track.beatCount * track.stepsPerBeat
        })
    }

    compactTrack(track) {
        const before = this.#snapshotTrack(track, TRACK_STATE_KEYS)
        const result = addLoopToTrackIfPossible(track)
        if (result.changed) {
            const after = this.#snapshotTrack(track, TRACK_STATE_KEYS)
            this.#host.record({
                desc: `Compact ${track.name}`,
                params: { track: track.name },
                execute: () => this.#restoreTrack(track, after, TRACK_STATE_KEYS),
                undo: () => this.#restoreTrack(track, before, TRACK_STATE_KEYS),
            })
        }
        return result
    }

    randomizeTrack(track, pattern) {
        this.#withUndo(track, TRACK_STATE_KEYS, `Randomize ${track.name}`, () => {
            this.#randomGen.generateRandom(track, pattern)
        })
    }

    changeTrackSound(track, sampleId) {
        this.#withUndo(
            track,
            ['sampleId', 'useAutoAssignSound', 'useSoftSynth'],
            `Sound on ${track.name}`,
            () => {
                track.sampleId = sampleId
                track.useAutoAssignSound = false
                track.useSoftSynth = false
            },
            { persist: true },
        )
    }

    changeTrackName(track, newName) {
        this.#withUndo(
            track,
            ['name'],
            `Rename track → ${newName}`,
            () => {
                track.name = newName
            },
            { persist: true },
        )
    }

    getSampleIdFromUrl(url) {
        const entry = Object.entries(soundRegistry.sounds).find(([, s]) => s.url === url)
        return entry?.[0] ?? NOT_FOUND
    }
}
