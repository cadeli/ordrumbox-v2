import { computeLfoValue } from '../audio/math.js'

/**
 * LFO-capable keys of a track. Typing the map with these literal keys makes
 * `track[lfoKey]` a safe indexed access (no implicit any) for callers.
 * @typedef {keyof import('../model/track_schema.js').Track} TrackKey
 */

/** @type {Array<{lfoKey: TrackKey, resultKey: string}>} */
export const LFO_MAP = [
    { lfoKey: 'velocityLfo', resultKey: 'velocity' },
    { lfoKey: 'panLfo', resultKey: 'pan' },
    { lfoKey: 'pitchLfo', resultKey: 'pitch' },
    { lfoKey: 'filterFreqLfo', resultKey: 'filterFreq' },
    { lfoKey: 'filterQLfo', resultKey: 'filterQ' },
]

/**
 * @param {import('../model/track_schema.js').Track} track
 * @param {number} tick
 * @param {number} tickCount
 * @param {number} bpm
 * @returns {Record<string, number>}
 */
export function computeTrackLfoValues(track, tick, tickCount, bpm) {
    const values = {}
    for (const { lfoKey, resultKey } of LFO_MAP) {
        const lfo = track[lfoKey]
        values[resultKey] = lfo ? computeLfoValue(lfo, tick, tickCount, resultKey, null, bpm) : 0
    }
    return values
}
