import Utils from '../../src/core/utils.js'
import { soundRegistry } from '../../src/state/sound_registry.js'
import { recalcLoopDerived } from '../../src/model/track_schema.js'

/**
 * Find notes at a specific beat/step position.
 * @param {object} track
 * @param {number} beat
 * @param {number} beatStep
 * @returns {object[]}
 */
export function isNoteAt(track, beat, beatStep) {
    return Object.values(track.notes).filter(n => n.beatStep === beatStep && n.beat === beat)
}

export function kitIsLoaded(drumkit) {
    return Object.values(soundRegistry.sounds).some(sound => sound.kit_name === drumkit.name)
}

export function getTrackFromType(pattern, type) {
    return Utils.getTracksArray(pattern).find(track => track.name === type) ?? null
}

export function setNbBeats(cmd, pattern, newBeats) {
    const oldNbBeats = pattern.nbBeats
    const oldTrackStates = Utils.getTracksArray(pattern).map(track => ({
        track,
        nbBeats: track.nbBeats,
        loopAtStep: track.loopAtStep,
        loopPointBeat: track.loopPointBeat,
        loopPointStep: track.loopPointStep
    }))

    let oldBeats = pattern.nbBeats * (Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4)
    pattern.nbBeats = newBeats * 4
    Utils.getTracksArray(pattern).forEach((track, indexTrack) => {
        if (track.loopAtStep >= oldBeats) {
            track.loopAtStep = pattern.nbBeats * track.stepsPerBeat
            recalcLoopDerived(track)
        }
        track.nbBeats = pattern.nbBeats
    })
    cmd._persist()
    cmd._record(() => {
        pattern.nbBeats = oldNbBeats
        for (const { track, nbBeats, loopAtStep, loopPointBeat, loopPointStep } of oldTrackStates) {
            track.nbBeats = nbBeats
            track.loopAtStep = loopAtStep
            track.loopPointBeat = loopPointBeat
            track.loopPointStep = loopPointStep
        }
        cmd._persist()
    }, { desc: 'Set nb beats' })
}

export function getAllSoundsForType(soundKey) {
    return Object.values(soundRegistry.sounds).filter(s => s.key === soundKey)
}
