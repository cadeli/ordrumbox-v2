import MfDefaults from '../patterns/defaults.js'

/**
 * Apply track/params properties to a Web Audio strip.
 *
 * Single source of truth for mapping track properties to strip method calls
 * (filter, saturation, reverb, delay, LFOs, velocity, pan, mute).
 *
 * @param {MfStrip} strip   – target strip node
 * @param {object}  track   – track object with all parameter properties
 * @param {number}  time    – audio context currentTime for ramp scheduling
 * @param {object}  [opts]  – optional overrides
 * @param {boolean} [opts.skipVelocityPan=false] – skip velocity/pan gain ramp
 * @param {boolean} [opts.readDefaults=true]      – read missing props from MfDefaults
 */
export function applyTrackToStrip(strip, track, time, opts) {
    if (!strip || !track) return
    const skipVP = opts?.skipVelocityPan === true
    const readDefaults = opts?.readDefaults !== false

    if (track.filterType) strip.updateFilter(track.filterType, track.filterFreq, track.filterQ)

    if (track.saturationType !== undefined || track.saturationOn !== undefined) {
        strip.updateSaturation(track.saturationType, track.saturationOn === false ? 0 : track.saturationAmount)
    }
    if (track.reverbType !== undefined || track.reverbOn !== undefined) {
        strip.updateReverb(track.reverbType, track.reverbOn === false ? 0 : track.reverbAmount)
    }
    if (track.delayType !== undefined || track.delayOn !== undefined) {
        strip.updateDelay(track.delayType, track.delayTime, track.delayOn === false ? 0 : track.delayAmount)
    }

    if (track.pitchLfo !== undefined) strip.updateLfo('pitchLfo', track.pitchLfo)
    if (track.velocityLfo !== undefined) strip.updateLfo('velocityLfo', track.velocityLfo)
    if (track.panLfo !== undefined) strip.updateLfo('panLfo', track.panLfo)
    if (track.filterFreqLfo !== undefined) strip.updateLfo('filterFreqLfo', track.filterFreqLfo)
    if (track.filterQLfo !== undefined) strip.updateLfo('filterQLfo', track.filterQLfo)

    if (!skipVP) {
        const trackVelo = readDefaults
            ? (track.velocity ?? MfDefaults.getTrackProp(track, 'velocity'))
            : track.velocity
        if (trackVelo !== undefined) strip.output.gain.setTargetAtTime(trackVelo, time, 0.01)

        const trackPan = readDefaults
            ? (track.pan ?? MfDefaults.getTrackProp(track, 'pan'))
            : track.pan
        if (trackPan !== undefined) strip.pan.pan.setTargetAtTime(trackPan, time, 0.01)
    }

    if (track.mute === true) {
        strip.output.gain.setTargetAtTime(0, time, 0.01)
    } else if (track.mute === false) {
        strip.output.gain.setTargetAtTime(track.velocity ?? 1.0, time, 0.01)
    }
}

/**
 * Apply a params object (with mute support) to a strip.
 * Used by AudioEngine.updateStrip for UI-driven parameter changes.
 *
 * Delegates to applyTrackToStrip with readDefaults=false.
 *
 * @param {MfStrip} strip   – target strip node
 * @param {object}  params  – partial track/params object
 * @param {number}  time    – audio context currentTime
 */
export function applyParamsToStrip(strip, params, time) {
    applyTrackToStrip(strip, params, time, { readDefaults: false })
}
