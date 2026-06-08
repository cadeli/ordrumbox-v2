import MfDefaults from '../patterns/defaults.js'

/**
 * Apply track parameters to a Web Audio strip.
 *
 * This is the single source of truth for mapping track properties to strip
 * method calls (filter, saturation, reverb, delay, LFOs, velocity, pan, mute).
 *
 * @param {MfStrip} strip   – target strip node
 * @param {object}  track   – track object with all parameter properties
 * @param {number}  time    – audio context currentTime for ramp scheduling
 * @param {object}  [opts]  – optional overrides
 * @param {boolean} [opts.skipVelocityPan=false] – skip velocity/pan gain ramp
 */
export function applyTrackToStrip(strip, track, time, opts) {
    if (!strip || !track) return
    const skipVP = opts?.skipVelocityPan === true

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

    if (track.pitchLfo) strip.updateLfo('pitchLfo', track.pitchLfo)
    if (track.velocityLfo) strip.updateLfo('velocityLfo', track.velocityLfo)
    if (track.panLfo) strip.updateLfo('panLfo', track.panLfo)
    if (track.filterFreqLfo) strip.updateLfo('filterFreqLfo', track.filterFreqLfo)
    if (track.filterQLfo) strip.updateLfo('filterQLfo', track.filterQLfo)

    if (!skipVP) {
        const trackVelo = track.velocity ?? MfDefaults.getTrackProp(track, 'velocity')
        strip.output.gain.setTargetAtTime(trackVelo, time, 0.01)

        const trackPan = track.pan ?? MfDefaults.getTrackProp(track, 'pan')
        strip.pan.pan.setTargetAtTime(trackPan, time, 0.01)
    }
}

/**
 * Apply a params object (with mute support) to a strip.
 * Used by AudioEngine.updateStrip for UI-driven parameter changes.
 *
 * @param {MfStrip} strip   – target strip node
 * @param {object}  params  – partial track/params object
 * @param {number}  time    – audio context currentTime
 */
export function applyParamsToStrip(strip, params, time) {
    if (!strip || !params) return

    if (params.filterType !== undefined)
        strip.updateFilter(params.filterType, params.filterFreq, params.filterQ)

    if (params.reverbType !== undefined || params.reverbAmount !== undefined || params.reverbOn !== undefined)
        strip.updateReverb(params.reverbType, params.reverbOn === false ? 0 : params.reverbAmount)

    if (params.delayType !== undefined || params.delayTime !== undefined || params.delayAmount !== undefined || params.delayOn !== undefined)
        strip.updateDelay(params.delayType, params.delayTime, params.delayOn === false ? 0 : params.delayAmount)

    if (params.saturationType !== undefined || params.saturationAmount !== undefined || params.saturationOn !== undefined)
        strip.updateSaturation(params.saturationType, params.saturationOn === false ? 0 : params.saturationAmount)

    if (params.velocity !== undefined) strip.output.gain.setTargetAtTime(params.velocity, time, 0.01)
    if (params.pan !== undefined)      strip.pan.pan.setTargetAtTime(params.pan, time, 0.01)

    if (params.mute === true) {
        strip.output.gain.setTargetAtTime(0, time, 0.01)
    } else if (params.mute === false) {
        strip.output.gain.setTargetAtTime(params.velocity ?? 1.0, time, 0.01)
    }

    if (params.pitchLfo      !== undefined) strip.updateLfo('pitchLfo',      params.pitchLfo)
    if (params.velocityLfo   !== undefined) strip.updateLfo('velocityLfo',   params.velocityLfo)
    if (params.panLfo        !== undefined) strip.updateLfo('panLfo',        params.panLfo)
    if (params.filterFreqLfo !== undefined) strip.updateLfo('filterFreqLfo', params.filterFreqLfo)
    if (params.filterQLfo    !== undefined) strip.updateLfo('filterQLfo',    params.filterQLfo)
}
