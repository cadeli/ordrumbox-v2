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
            cmd._persist()
            cmd._record(() => {
                pattern.tracks.splice(trackIndex, 1)
                cmd._persist()
            }, { desc: 'Add track' })
            return track
        },

        removeTrack(pattern, trackIdx) {
            const tracks = pattern.tracks
            if (trackIdx < 0 || trackIdx >= tracks.length) return
            const removed = tracks[trackIdx]
            const removedNotes = removed.notes.map(n => ({ ...n }))
            tracks.splice(trackIdx, 1)
            cmd._persist()
            cmd._record(() => {
                tracks.splice(trackIdx, 0, removed)
                removed.notes = removedNotes
                cmd._persist()
            }, { desc: 'Remove track' })
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
            cmd._persist()
            cmd._record(() => {
                track.stepsPerBeat = oldStepsPerBeat
                track.loopPointStep = oldLoopPointStep
                track.loopAtStep = oldLoopAtStep
                track.notes = oldNotes
                cmd._persist()
            }, { desc: 'Inc steps per bar' })
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
            cmd._persist()
            cmd._record(() => {
                track.loopAtStep = oldLoopAtStep
                track.loopPointBeat = oldLoopPointBeat
                track.loopPointStep = oldLoopPointStep
                cmd._persist()
            }, { desc: 'Inc loop point' })
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
            cmd._record(() => {
                track.notes = oldNotes
                track.loopPointStep = oldLoopPointStep
                track.loopPointBeat = oldLoopPointBeat
                track.loopAtStep = oldLoopAtStep
                cmd._persist()
            }, { desc: 'Clean track' })
        },

        compactTrack(track) {
            const oldNotes = track.notes.map(n => ({ ...n }))
            const oldLoopPointStep = track.loopPointStep
            const oldLoopPointBeat = track.loopPointBeat
            const oldLoopAtStep = track.loopAtStep
            const result = Utils.addLoopToTrackIfPossible(track)
            if (result.changed) {
                cmd._record(() => {
                    track.notes = oldNotes
                    track.loopPointStep = oldLoopPointStep
                    track.loopPointBeat = oldLoopPointBeat
                    track.loopAtStep = oldLoopAtStep
                    cmd._persist()
                }, { desc: 'Compact tracks' })
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
            cmd._record(() => {
                track.notes = oldNotes
                track.loopPointStep = oldLoopPointStep
                track.loopPointBeat = oldLoopPointBeat
                track.loopAtStep = oldLoopAtStep
                cmd._persist()
            }, { desc: 'Randomize track' })
        },

        changeTrackSound(track, soundId) {
            const oldSoundId = track.soundId
            const oldUseAutoAssign = track.useAutoAssignSound
            const oldUseSoftSynth = track.useSoftSynth
            track.soundId = soundId
            track.useAutoAssignSound = false
            track.useSoftSynth = false
            cmd._persist()
            cmd._record(() => {
                track.soundId = oldSoundId
                track.useAutoAssignSound = oldUseAutoAssign
                track.useSoftSynth = oldUseSoftSynth
                cmd._persist()
            }, { desc: 'Change track sound' })
        },

        changeTrackName(track, newName) {
            const oldName = track.name
            track.name = newName
            cmd._persist()
            cmd._record(() => {
                track.name = oldName
                cmd._persist()
            }, { desc: 'Change track name' })
        },

        getSoundIdFromUrl(url) {
            const entry = Object.entries(soundRegistry.sounds).find(([, s]) => s.url === url)
            return entry?.[0] ?? NOT_FOUND
        }
    }
}
