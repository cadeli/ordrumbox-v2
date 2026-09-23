import Utils from '../../../core/utils.js'
import { NOT_FOUND } from '../../../core/constants.js'
import { normalizeTrack, recalcLoopDerived } from '../../../model/track_schema.js'
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
     */
    function withUndo(track, keys, desc, mutate, { persist = false } = {}) {
        const snap = snapshotTrack(track, keys)
        const recordable = mutate() !== false
        if (persist) cmd.persist()
        if (recordable) {
            cmd.record(() => restoreTrack(track, snap, keys), { desc })
        }
        return snap
    }

    return {
        addTrack(pattern, type, stepsPerBeat = 4) {
            const track = this.createTrack(pattern.nbBeats, type, stepsPerBeat)
            const trackIndex = pattern.tracks.length
            pattern.tracks.push(track)
            cmd.persist()
            cmd.record(
                () => {
                    pattern.tracks.splice(trackIndex, 1)
                    cmd.persist()
                },
                { desc: `Add track ${track.name}` },
            )
            return track
        },

        removeTrack(pattern, trackIdx) {
            const tracks = pattern.tracks
            if (trackIdx < 0 || trackIdx >= tracks.length) return
            const removed = tracks[trackIdx]
            const removedNotes = removed.notes.map((n) => ({ ...n }))
            tracks.splice(trackIdx, 1)
            cmd.persist()
            cmd.record(
                () => {
                    tracks.splice(trackIdx, 0, removed)
                    removed.notes = removedNotes
                    cmd.persist()
                },
                { desc: `Remove track ${removed.name}` },
            )
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

        incrNbStepPerBar(track) {
            withUndo(
                track,
                ['stepsPerBeat', 'loopPointStep', 'loopAtStep', 'notes'],
                `Steps per bar on ${track.name}`,
                () => {
                    const loopStepPc = Math.round((track.loopPointStep * 100) / track.stepsPerBeat)
                    track.stepsPerBeat++
                    if (track.stepsPerBeat > 8) {
                        // Cyclic wrap: 8 → 1 (intentional, not a bug)
                        track.stepsPerBeat = 1
                    }

                    for (const note of track.notes) {
                        note.beatStep = Math.min(
                            Math.round((note.steppc / 100) * track.stepsPerBeat),
                            track.stepsPerBeat - 1,
                        )
                    }
                    track.loopPointStep = Math.floor((loopStepPc / 100) * track.stepsPerBeat)
                    track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
                },
                { persist: true },
            )
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
            const snap = snapshotTrack(track, TRACK_STATE_KEYS)
            const result = Utils.addLoopToTrackIfPossible(track)
            if (result.changed) {
                cmd.record(() => restoreTrack(track, snap, TRACK_STATE_KEYS), { desc: `Compact ${track.name}` })
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
