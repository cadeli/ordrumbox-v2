// src/audio/step_lfo.js — Per-step LFO modulation push to mixer strips.

import { computeTrackLfoValues } from '../logic/lfo_engine.js'

const LFO_SMOOTHING = 0.005

/**
 * Apply per-step LFO values onto mixer strips for tracks that have LFOs.
 * Hot path (called every tick) — classic for-loop is deliberate.
 *
 * @param {import('./mixer.js').default} mixer
 * @param {object} pattern
 * @param {number} tick
 * @param {number} atTime — AudioContext time
 * @param {number} TICK
 */
export async function pushStepLfo(mixer, pattern, tick, atTime, TICK) {
    if (!pattern?.tracks) return
    const nbTicks = TICK * pattern.nbBeats
    const bpm = pattern.bpm
    const tracks = Object.values(pattern.tracks)

    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i]
        const hasLfo =
            track.velocityLfo != null ||
            track.panLfo != null ||
            track.pitchLfo != null ||
            track.filterFreqLfo != null ||
            track.filterQLfo != null
        if (!hasLfo) continue

        let strip = mixer.strips[track.name]
        if (!strip?.stripNode) {
            strip = await mixer.getOrCreateStrip(track.name)
            if (!strip?.stripNode) continue
        }

        const lfoValues = computeTrackLfoValues(track, tick, nbTicks, bpm)

        if (track.velocityLfo) {
            const finalVelo = Math.max(0, Math.min(2, lfoValues.velocity))
            strip.output.gain.setTargetAtTime(finalVelo, atTime, LFO_SMOOTHING)
        }

        if (track.panLfo) {
            const basePan = track.pan ?? 0
            const finalPan = Math.max(-1, Math.min(1, basePan + lfoValues.pan))
            strip.pan.pan.setTargetAtTime(finalPan, atTime, LFO_SMOOTHING)
        }

        if (track.filterFreqLfo) {
            const baseFreq = track.filterFreq ?? 20
            const finalFreq = Math.max(20, Math.min(20000, baseFreq + lfoValues.filterFreq))
            strip.stripNode.parameters.get('cutoff')?.setTargetAtTime(finalFreq, atTime, LFO_SMOOTHING)
        }

        if (track.filterQLfo) {
            const baseQ = track.filterQ ?? 0.707
            const finalQ = Math.max(0.707, Math.min(18.707, baseQ + lfoValues.filterQ))
            strip.stripNode.parameters.get('q')?.setTargetAtTime(finalQ, atTime, LFO_SMOOTHING)
        }
    }
}
