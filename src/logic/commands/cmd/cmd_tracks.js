import Utils from '../../../core/utils.js'
import { NOT_FOUND } from '../../../core/constants.js'
import { normalizeTrack, recalcLoopDerived } from '../../../model/track_schema.js'
import { soundRegistry } from '../../../state/sound_registry.js'

/**
 * Track CRUD + mutation commands — returns an object of methods bound to the Commander instance.
 */
export function createTrackMethods(cmd) {
    return {
        addTrack(pattern, type, stepsPerBeat = 4) {
            let track = this.createTrack(pattern.nbBeats, type, stepsPerBeat)
            const trackIndex = pattern.tracks.length
            pattern.tracks.push(track)
            cmd.persist()
            cmd.record(() => {
                pattern.tracks.splice(trackIndex, 1)
                cmd.persist()
            }, { desc: `Add track ${track.name}` })
            return track
        },

        removeTrack(pattern, trackIdx) {
            const tracks = pattern.tracks
            if (trackIdx < 0 || trackIdx >= tracks.length) return
            const removed = tracks[trackIdx]
            const removedNotes = removed.notes.map(n => ({ ...n }))
            tracks.splice(trackIdx, 1)
            cmd.persist()
            cmd.record(() => {
                tracks.splice(trackIdx, 0, removed)
                removed.notes = removedNotes
                cmd.persist()
            }, { desc: `Remove track ${removed.name}` })
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
            const oldStepsPerBeat = track.stepsPerBeat
            const oldLoopPointStep = track.loopPointStep
            const oldLoopAtStep = track.loopAtStep
            const oldNotes = track.notes.map(n => ({ ...n }))

            let loopStepPc = Math.round((track.loopPointStep * 100) / track.stepsPerBeat)
            track.stepsPerBeat++
            if (track.stepsPerBeat > 8) {
                track.stepsPerBeat = 1
            }

            Object.values(track.notes).forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * track.stepsPerBeat), track.stepsPerBeat - 1)
            })
            track.loopPointStep = Math.floor((loopStepPc / 100) * track.stepsPerBeat)
            track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
            cmd.persist()
            cmd.record(() => {
                track.stepsPerBeat = oldStepsPerBeat
                track.loopPointStep = oldLoopPointStep
                track.loopAtStep = oldLoopAtStep
                track.notes = oldNotes
                cmd.persist()
            }, { desc: `Steps per bar on ${track.name}` })
        },

        incrLoopPoint(track) {
            const oldLoopAtStep = track.loopAtStep
            const oldLoopPointBeat = track.loopPointBeat
            const oldLoopPointStep = track.loopPointStep

            track.loopAtStep--
            if (track.loopAtStep < 1) {
                track.loopAtStep = track.stepsPerBeat * track.nbBeats
            }
            recalcLoopDerived(track)
            cmd.persist()
            cmd.record(() => {
                track.loopAtStep = oldLoopAtStep
                track.loopPointBeat = oldLoopPointBeat
                track.loopPointStep = oldLoopPointStep
                cmd.persist()
            }, { desc: `Loop point on ${track.name}` })
        },

        cleanPattern(pattern) {
            Utils.getTracksArray(pattern).forEach((track) => {
                this.cleanTrack(track)
            })
        },

        cleanTrack(track) {
            const oldNotes = track.notes.map(n => ({ ...n }))
            const oldLoopPointStep = track.loopPointStep
            const oldLoopPointBeat = track.loopPointBeat
            const oldLoopAtStep = track.loopAtStep
            track.notes = []
            track.loopPointStep = 0
            track.loopPointBeat = track.nbBeats
            track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
            cmd.record(() => {
                track.notes = oldNotes
                track.loopPointStep = oldLoopPointStep
                track.loopPointBeat = oldLoopPointBeat
                track.loopAtStep = oldLoopAtStep
                cmd.persist()
            }, { desc: `Clean ${track.name}` })
        },

        compactTrack(track) {
            const oldNotes = track.notes.map(n => ({ ...n }))
            const oldLoopPointStep = track.loopPointStep
            const oldLoopPointBeat = track.loopPointBeat
            const oldLoopAtStep = track.loopAtStep
            const result = Utils.addLoopToTrackIfPossible(track)
            if (result.changed) {
                cmd.record(() => {
                    track.notes = oldNotes
                    track.loopPointStep = oldLoopPointStep
                    track.loopPointBeat = oldLoopPointBeat
                    track.loopAtStep = oldLoopAtStep
                    cmd.persist()
                }, { desc: `Compact ${track.name}` })
            }
            return result
        },

        randomizeTrack(track, pattern) {
            const oldNotes = track.notes.map(n => ({ ...n }))
            const oldLoopPointStep = track.loopPointStep
            const oldLoopPointBeat = track.loopPointBeat
            const oldLoopAtStep = track.loopAtStep
            track.notes = []
            track.loopPointStep = 0
            track.loopPointBeat = track.nbBeats ?? pattern.nbBeats ?? 4
            track.loopAtStep = track.loopPointBeat * track.stepsPerBeat + track.loopPointStep
            const beats = track.nbBeats ?? pattern.nbBeats ?? 4
            const stepsPerBeat = track.stepsPerBeat ?? 4
            const totalSteps = beats * stepsPerBeat
            const noteCount = Math.max(1, Math.floor(totalSteps * (0.15 + Math.random() * 0.2)))
            const used = new Set()
            for (let i = 0; i < noteCount; i++) {
                let step
                do { step = Math.floor(Math.random() * totalSteps) } while (used.has(step))
                used.add(step)
                const beat = Math.floor(step / stepsPerBeat)
                const beatStep = step % stepsPerBeat
                const pitch = Math.floor(Math.random() * 13) - 6
                track.notes.push({ ...Utils.NOTE_DEFAULTS, beat, beatStep, pitch, velocity: 0.5 + Math.random() * 0.5 })
            }
            cmd.record(() => {
                track.notes = oldNotes
                track.loopPointStep = oldLoopPointStep
                track.loopPointBeat = oldLoopPointBeat
                track.loopAtStep = oldLoopAtStep
                cmd.persist()
            }, { desc: `Randomize ${track.name}` })
        },

        changeTrackSound(track, soundId) {
            const oldSoundId = track.soundId
            const oldUseAutoAssign = track.useAutoAssignSound
            const oldUseSoftSynth = track.useSoftSynth
            track.soundId = soundId
            track.useAutoAssignSound = false
            track.useSoftSynth = false
            cmd.persist()
            cmd.record(() => {
                track.soundId = oldSoundId
                track.useAutoAssignSound = oldUseAutoAssign
                track.useSoftSynth = oldUseSoftSynth
                cmd.persist()
            }, { desc: `Sound on ${track.name}` })
        },

        changeTrackName(track, newName) {
            const oldName = track.name
            track.name = newName
            cmd.persist()
            cmd.record(() => {
                track.name = oldName
                cmd.persist()
            }, { desc: `Rename track → ${newName}` })
        },

        getSoundIdFromUrl(url) {
            const entry = Object.entries(soundRegistry.sounds).find(([, s]) => s.url === url)
            return entry?.[0] ?? NOT_FOUND
        }
    }
}
