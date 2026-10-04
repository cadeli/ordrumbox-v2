import Utils from '../../src/core/utils.js'
import { soundRegistry } from '../../src/state/sound_registry.js'

/**
 * Find notes at a specific beat/step position.
 * @param {object} track
 * @param {number} beat
 * @param {number} beatStep
 * @returns {object[]}
 */
export function isNoteAt(track, beat, beatStep) {
    return Object.values(track.notes).filter((n) => n.beatStep === beatStep && n.beat === beat)
}

export function kitIsLoaded(drumkit) {
    return Object.values(soundRegistry.sounds).some((sound) => sound.kitName === drumkit.name)
}

export function getTrackFromType(pattern, type) {
    return Utils.getTracksArray(pattern).find((track) => track.name === type) ?? null
}

export function getAllSoundsForType(soundKey) {
    return Object.values(soundRegistry.sounds).filter((s) => s.key === soundKey)
}
