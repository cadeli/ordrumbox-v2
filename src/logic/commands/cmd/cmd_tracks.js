import Utils from '../../../core/utils.js'
import { NOT_FOUND } from '../../../core/constants.js'
import { normalizeTrack, recalcLoopDerived, TRACK_VALUE_RANGES } from '../../../model/track_schema.js'
import { soundRegistry } from '../../../state/sound_registry.js'
import RandomGenerate from '../../generators/random_generate.js'

/**
 * Track CRUD + mutation commands — returns an object of methods bound to the Commander instance.
 */
export function createTrackMethods(cmd) {
    const TRACK_STATE_KEYS = ['notes', 'loopPointStep', 'loopPointBeat', 'loopAtStep']
    const randomGen = new RandomGenerate()

    function snapshotTrack(track, keys) {
        const snap = {}
        for (const key of keys) {
            const value = track[key]
            snap[key] = Array.isArray(value) ? value.map((n) => ({ ...n })) : value
        }
        return snap
    }

    function restoreTrack(track, snap, keys) {
        for (const key of keys) track[key] = snap[key]
        cmd.persist()
    }

    /**
     * Snapshot track keys, run mutate, record undo that restores the snapshot.
     * mutate may return false to skip recording (no-op).
     * options.persist: call cmd.persist() after mutate.
     * options.coalesceKey: merge rapid same-key updates into one undo step.
     *
     * The changed keys (before → after) are recorded as meta.params/prev so
     * the undo/redo report toast can show exactly what this command touched.
     */
    function withUndo(track, keys, desc, mutate, { persist = false, coalesceKey } = {}) {
        const before = snapshotTrack(track, keys)
        const recordable = mutate() !== false
        if (persist) cmd.persist()
        if (recordable) {
            const after = snapshotTrack(track, keys)
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
            cmd.record({
                desc,
                coalesceKey,
                params,
                prev,
                execute: () => restoreTrack(track, after, keys),
                undo: () => restoreTrack(track, before, keys),
            })
        }
        return before
    }

    return {
        addTrack(pattern, type, stepsPerBeat = 4) {
            const track = this.createTrack(pattern.nbBeats, type, stepsPerBeat)
            const trackIndex = pattern.tracks.length
            pattern.tracks.push(track)
            cmd.persist()
            cmd.record({
                desc: `Add track ${track.name}`,
                params: { track: track.name, index: trackIndex, type, stepsPerBeat },
                execute: () => {
                    if (!pattern.tracks.includes(track)) {
                        pattern.tracks.splice(Math.min(trackIndex, pattern.tracks.length), 0, track)
                        cmd.persist()
                    }
                },
                undo: () => {
                    const i = pattern.tracks.indexOf(track)
                    if (i >= 0) pattern.tracks.splice(i, 1)
                    cmd.persist()
                },
            })
            return track
        },

        removeTrack(pattern, trackIdx) {
            if (!Array.isArray(pattern.tracks)) {
                pattern.tracks = Utils.getTracksArray(pattern)
            }
            const tracks = pattern.tracks
            if (trackIdx < 0 || trackIdx >= tracks.length) return
            const removed = tracks[trackIdx]
            const removedNotes = removed.notes.map((n) => ({ ...n }))
            tracks.splice(trackIdx, 1)
            cmd.persist()
            cmd.record({
                desc: `Remove track ${removed.name}`,
                params: { track: removed.name, index: trackIdx, notes: removedNotes.length },
                execute: () => {
                    const i = tracks.indexOf(removed)
                    tracks.splice(i >= 0 ? i : trackIdx, 1)
                    cmd.persist()
                },
                undo: () => {
                    tracks.splice(Math.min(trackIdx, tracks.length), 0, removed)
                    removed.notes = removedNotes
                    cmd.persist()
                },
            })
        },

        pasteTrack(pattern, insertIdx, sourceTrack) {
            if (!pattern || !sourceTrack) return null
            if (!Array.isArray(pattern.tracks)) {
                pattern.tracks = Utils.getTracksArray(pattern)
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

            const idx = Utils.clamp(insertIdx, 0, tracks.length)
            tracks.splice(idx, 0, clone)
            cmd.persist()
            cmd.record({
                desc: `Paste track ${name}`,
                params: { track: name, index: idx, from: sourceTrack.name },
                execute: () => {
                    if (!tracks.includes(clone)) {
                        tracks.splice(Math.min(idx, tracks.length), 0, clone)
                        cmd.persist()
                    }
                },
                undo: () => {
                    const i = tracks.indexOf(clone)
                    if (i >= 0) tracks.splice(i, 1)
                    cmd.persist()
                },
            })
            return clone
        },

        createTrack(nbBeats, name, stepsPerBeat = 4) {
            const newTrack = normalizeTrack({
                name,
                nbBeats: nbBeats,
                stepsPerBeat,
                loopAtStep: nbBeats * stepsPerBeat,
                pan: Utils.getPanFromTrackName(name),
            })
            recalcLoopDerived(newTrack)
            return newTrack
        },

        /**
         * Set stepsPerBeat to an absolute value (clamped 1..8) and migrate the
         * notes / loop point proportionally:
         * - notes: steppc (absolute position) is preserved → beatStep rescaled
         * - loopAtStep is clamped to the new bar length, loop point re-derived
         * @param {object} track
         * @param {number} value - target steps per beat
         * @param {object} [opts]
         * @param {boolean} [opts.coalesce] - merge rapid changes into one undo step
         * @returns {boolean} true when a change was applied
         */
        setStepsPerBeat(track, value, { coalesce = false } = {}) {
            const range = TRACK_VALUE_RANGES.stepsPerBeat
            const target = Math.round(Utils.clamp(value, range.min, range.max))
            if (!track || !Number.isFinite(target) || target === track.stepsPerBeat) return false

            withUndo(
                track,
                ['stepsPerBeat', 'loopPointStep', 'loopPointBeat', 'loopAtStep', 'notes'],
                `Steps per bar on ${track.name}`,
                () => {
                    const oldStepsPerBeat = track.stepsPerBeat
                    track.stepsPerBeat = target

                    if (track.notes) {
                        for (const note of track.notes) {
                            const steppc = note.steppc ?? Math.round((note.beatStep * 100) / (oldStepsPerBeat ?? 4))
                            note.beatStep = Math.min(Math.round((steppc / 100) * target), target - 1)
                        }
                    }

                    const maxSteps = (track.nbBeats ?? 4) * target
                    if (track.loopAtStep > maxSteps) track.loopAtStep = maxSteps
                    recalcLoopDerived(track)
                },
                {
                    persist: true,
                    coalesceKey: coalesce ? `track:${cmd.coalesceId(track)}:stepsPerBeat` : undefined,
                },
            )
            return true
        },

        incrNbStepPerBar(track) {
            // Cyclic wrap: 8 → 1 (intentional, not a bug)
            const next = track.stepsPerBeat >= 8 ? 1 : track.stepsPerBeat + 1
            this.setStepsPerBeat(track, next)
        },

        incrLoopPoint(track) {
            withUndo(
                track,
                ['loopAtStep', 'loopPointBeat', 'loopPointStep'],
                `Loop point on ${track.name}`,
                () => {
                    track.loopAtStep--
                    if (track.loopAtStep < 1) {
                        track.loopAtStep = track.stepsPerBeat * track.nbBeats
                    }
                    recalcLoopDerived(track)
                },
                { persist: true },
            )
        },

        cleanPattern(pattern) {
            Utils.getTracksArray(pattern).forEach((track) => {
                this.cleanTrack(track)
            })
        },

        cleanTrack(track) {
            withUndo(track, TRACK_STATE_KEYS, `Clean ${track.name}`, () => {
                track.notes = []
                track.loopPointStep = 0
                track.loopPointBeat = track.nbBeats
                track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
            })
        },

        compactTrack(track) {
            const before = snapshotTrack(track, TRACK_STATE_KEYS)
            const result = Utils.addLoopToTrackIfPossible(track)
            if (result.changed) {
                const after = snapshotTrack(track, TRACK_STATE_KEYS)
                cmd.record({
                    desc: `Compact ${track.name}`,
                    params: { track: track.name },
                    execute: () => restoreTrack(track, after, TRACK_STATE_KEYS),
                    undo: () => restoreTrack(track, before, TRACK_STATE_KEYS),
                })
            }
            return result
        },

        randomizeTrack(track, pattern) {
            withUndo(track, TRACK_STATE_KEYS, `Randomize ${track.name}`, () => {
                randomGen.generateRandom(track, pattern)
            })
        },

        changeTrackSound(track, soundId) {
            withUndo(
                track,
                ['soundId', 'useAutoAssignSound', 'useSoftSynth'],
                `Sound on ${track.name}`,
                () => {
                    track.soundId = soundId
                    track.useAutoAssignSound = false
                    track.useSoftSynth = false
                },
                { persist: true },
            )
        },

        changeTrackName(track, newName) {
            withUndo(
                track,
                ['name'],
                `Rename track → ${newName}`,
                () => {
                    track.name = newName
                },
                { persist: true },
            )
        },

        getSoundIdFromUrl(url) {
            const entry = Object.entries(soundRegistry.sounds).find(([, s]) => s.url === url)
            return entry?.[0] ?? NOT_FOUND
        },
    }
}
