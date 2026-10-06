import Defaults from '../patterns/defaults.js'

/**
 * The only properties applyTrackToStrip reads. This models what the module
 * actually uses rather than the full Track type, whose other fields are ignored
 * here.
 * @typedef {object} StripParams
 * @property {string}  [filterType]
 * @property {number}  [filterFreq]
 * @property {boolean} [filterFreqLfo]
 * @property {number}  [filterQ]
 * @property {boolean} [filterQLfo]
 * @property {string}  [saturationType]
 * @property {boolean} [sat]
 * @property {number}  [saturationAmount]
 * @property {string}  [reverbType]
 * @property {boolean} [reverbOn]
 * @property {number}  [reverbAmount]
 * @property {string}  [delayType]
 * @property {boolean} [delayOn]
 * @property {number}  [delayTime]
 * @property {number}  [delayDepth]
 * @property {number}  [velocity]
 * @property {number}  [velocityLfo]
 * @property {number}  [pan]
 * @property {number}  [panLfo]
 * @property {boolean} [mute]
 */
/**
 * Apply track/params properties to a Web Audio strip.
 *
 * Single source of truth for mapping track properties to strip method calls
 * (filter, saturation, reverb, delay, velocity, pan, mute).
 *
 * LFO values are pre-computed in JS and pushed to strip parameters
 * at each step boundary by the engine — not handled here.
 *
 * @param {import('./strip.js').default} strip - target strip node
 * @param {StripParams} track - the track properties this module reads
 * @param {number}  time    - audio context currentTime for ramp scheduling
 * @param {object}  [opts]  - optional overrides
 * @param {boolean} [opts.skipVelocityPan=false] - skip velocity/pan gain ramp
 * @param {boolean} [opts.readDefaults=true]      - read missing props from Defaults
 */
export function applyTrackToStrip(strip, track, time, opts) {
    if (!strip || !track) return
    const skipVelocityPan = opts?.skipVelocityPan === true
    const readDefaults = opts?.readDefaults !== false

    if (track.filterType !== undefined) {
        strip.updateFilter(
            track.filterType,
            track.filterFreqLfo ? undefined : track.filterFreq,
            track.filterQLfo ? undefined : track.filterQ,
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

    if (!skipVelocityPan) {
        const trackVelo = readDefaults ? (track.velocity ?? Defaults.getTrackProp(track, 'velocity')) : track.velocity
        if (trackVelo !== undefined && !track.velocityLfo) strip.output.gain.setTargetAtTime(trackVelo, time, 0.01)

        const trackPan = readDefaults ? (track.pan ?? Defaults.getTrackProp(track, 'pan')) : track.pan
        if (trackPan !== undefined && !track.panLfo) strip.pan.pan.setTargetAtTime(trackPan, time, 0.01)
    }

    if (track.mute === true) {
        strip.output.gain.setTargetAtTime(0, time, 0.01)
    } else if (track.mute === false && !track.velocityLfo) {
        strip.output.gain.setTargetAtTime(track.velocity ?? 1.0, time, 0.01)
    }
}

/**
 * Same as {@link applyTrackToStrip} without the defaults fallback, for UI-driven
 * changes where absent fields must stay untouched (Engine.updateStrip).
 *
 * It used to be a second name for "a track", which read as if there were two
 * kinds of object; it takes the very same one.
 *
 * @param {import('./strip.js').default} strip  - target strip node
 * @param {object} track  - the track whose params are applied
 * @param {number} time   - audio context currentTime
 */
export function applyTrackParamsToStrip(strip, track, time) {
    applyTrackToStrip(strip, track, time, { readDefaults: false })
}
