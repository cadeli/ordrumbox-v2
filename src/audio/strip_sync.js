import MfDefaults from '../patterns/defaults.js'

/**
 * Apply track/params properties to a Web Audio strip.
 *
 * Single source of truth for mapping track properties to strip method calls
 * (filter, saturation, reverb, delay, velocity, pan, mute).
 *
 * LFO values are pre-computed in JS and pushed to strip parameters
 * at each step boundary by the engine — not handled here.
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

    if (track.filterType) {
        strip.updateFilter(
            track.filterType,
            track.filterFreqLfo ? undefined : track.filterFreq,
            track.filterQLfo ? undefined : track.filterQ
        )
    }

    if (track.saturationType !== undefined || track.sat !== undefined) {
        strip.updateSaturation(track.saturationType, track.sat === false ? 0 : track.saturationAmount)
    }
    if (track.reverbType !== undefined || track.reverbOn !== undefined) {
        strip.updateReverb(track.reverbType, track.reverbOn === false ? 0 : track.reverbAmount)
    }
    if (track.delayType !== undefined || track.delayOn !== undefined) {
        strip.updateDelay(track.delayType, track.delayTime, track.delayOn === false ? 0 : track.delayDepth)
    }

    if (!skipVP) {
        const trackVelo = readDefaults
            ? (track.velocity ?? MfDefaults.getTrackProp(track, 'velocity'))
            : track.velocity
        if (trackVelo !== undefined && !track.velocityLfo) strip.output.gain.setTargetAtTime(trackVelo, time, 0.01)

        const trackPan = readDefaults
            ? (track.pan ?? MfDefaults.getTrackProp(track, 'pan'))
            : track.pan
        if (trackPan !== undefined && !track.panLfo) strip.pan.pan.setTargetAtTime(trackPan, time, 0.01)
    }

    if (track.mute === true) {
        strip.output.gain.setTargetAtTime(0, time, 0.01)
    } else if (track.mute === false && !track.velocityLfo) {
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
