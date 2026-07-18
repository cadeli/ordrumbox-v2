import { logger } from "../core/logger.js"
/**
 * track_schema.js — Single source of truth for the track structure.
 *
 * ## Compact Format
 *
 * Tracks in the JSON pattern format omit properties at their default value.
 * The loader (fixer.js) restores missing properties from TRACK_DEFAULTS.
 *
 * Properties that are recalculated on the fly (loopPointBeat, loopPointStep)
 * are never serialized.
 *
 * ## Default Values
 *
 * @typedef {Object} TrackDefaults
 *
 * @property {string}  name                 - Track display name (e.g. "KICK", "SNARE"). Default: ""
 * @property {boolean} useAutoAssignSound   - Auto-assign sound by name. Default: true
 * @property {string}  soundId              - Assigned sound URL. Default: "NOT_DEFINED"
 * @property {number}  nbBeats              - Number of beats in the track. Default: 4
 * @property {number}  stepsPerBeat         - Steps per beat (subdivision). Default: 4
 * @property {number|null} loopAtStep       - Loop point in steps (null = auto). Default: null
 * @property {number}  swingResolution      - Swing grid resolution (1–8). Default: 1
 * @property {number}  swingAmount          - Swing intensity (0–1). Default: 0
 * @property {number}  velocity             - Track velocity multiplier (0–1). Default: 1
 * @property {Object|null} velocityLfo      - LFO modulating velocity. Default: null
 * @property {number}  pitch                - Track pitch offset (semitones). Default: 0
 * @property {Object|null} pitchLfo         - LFO modulating pitch. Default: null
 * @property {number}  pan                  - Stereo pan (-1=left, 0=center, 1=right). Default: 0
 * @property {Object|null} panLfo           - LFO modulating pan. Default: null
 * @property {boolean} solo                 - Solo mode. Default: false
 * @property {boolean} mute                 - Mute mode. Default: false
 * @property {boolean} auto                 - Auto mode. Default: false
 * @property {boolean} useSoftSynth         - Use built-in synth instead of sample. Default: false
 * @property {boolean} mono                 - Mono mode. Default: false
 * @property {number}  variation            - Track variation amount (0–100). Default: 0
 * @property {number}  variation2           - Track variation 2 amount (0–100). Default: 0
 * @property {string}  filterType           - Filter type. Default: "allpass"
 * @property {Object|null} filterFreqLfo    - LFO modulating filter frequency. Default: null
 * @property {number}  filterFreq           - Filter frequency (Hz). Default: 20
 * @property {number}  filterLfoFreq        - Filter LFO frequency. Default: 0
 * @property {Object|null} filterQLfo       - LFO modulating filter Q. Default: null
 * @property {number}  filterQ              - Filter resonance (Q). Default: 0.707
 * @property {string}  reverbType           - Reverb algorithm. Default: "none"
 * @property {number}  reverbAmount         - Reverb wet/dry (0–1). Default: 0
 * @property {string}  delayType            - Delay algorithm. Default: "tape"
 * @property {number}  delayTime            - Delay time multiplier. Default: 1
 * @property {number}  delayDepth           - Delay wet/dry (0–1). Default: 0
 * @property {string}  fxSelected           - Selected FX slot. Default: "reverb"
 * @property {string}  saturationType       - Saturation algorithm. Default: "soft"
 * @property {number}  saturationAmount     - Saturation drive (0–1). Default: 0
 * @property {boolean} sat                  - Saturation enabled. Default: true
 * @property {boolean} reverbOn             - Reverb enabled. Default: true
 * @property {boolean} delayOn              - Delay enabled. Default: true
 * @property {string|null} synthSoundKey    - Synth preset key. Default: null
 * @property {number}  sampleDecay          - Sample decay time. Default: 0.5
 * @property {Array}   notes                - Note array (objects or compact arrays). Default: []
 */
export const TRACK_DEFAULTS = {
    name: "",
    useAutoAssignSound: true,
    soundId: "NOT_DEFINED",
    nbBeats: 4,
    stepsPerBeat: 4,
    loopAtStep: null,
    swingResolution: 1,
    swingAmount: 0,
    velocity: 1,
    velocityLfo: null,
    pitch: 0,
    pitchLfo: null,
    pan: 0,
    panLfo: null,
    solo: false,
    mute: false,
    auto: false,
    useSoftSynth: false,
    mono: false,
    variation: 0,
    variation2: 0,
    filterType: "allpass",
    filterFreqLfo: null,
    filterFreq: 20,
    filterLfoFreq: 0,
    filterQLfo: null,
    filterQ: 0.707,
    reverbType: "none",
    reverbAmount: 0,
    delayType: "tape",
    delayTime: 1,
    delayDepth: 0,
    fxSelected: "reverb",
    saturationType: "soft",
    saturationAmount: 0,
    sat: true,
    reverbOn: true,
    delayOn: true,
    synthSoundKey: null,
    sampleDecay: 0.5,
    notes: []
};

/**
 * Normalizes a track object by applying default values
 * for missing properties.
 */
export function normalizeTrack(track = {}) {
    const t = track ?? (logger.warn('TrackSchema', 'track null/undefined'), {});
    const { notes: inputNotes, ...rest } = t;
    const normalized = { ...TRACK_DEFAULTS, ...rest };
    normalized.notes = Array.isArray(inputNotes) ? [...inputNotes] : [];
    return normalized;
}

/**
 * Properties that are recalculated on the fly (derived).
 * Never exported or imported in the compact format.
 */
export const TRACK_RECALCULATED = ["loopPointBeat", "loopPointStep"];

/**
 * Numeric range constraints for track properties.
 * Used by updateTrack() and MCP tools to clamp values.
 */
export const TRACK_VALUE_RANGES = {
    velocity:      { min: 0,    max: 1 },
    pan:           { min: -1,   max: 1 },
    pitch:         { min: -24,  max: 24 },
    nbBeats:          { min: 1,    max: 16 },
    stepsPerBeat:   { min: 1,    max: 8 },
    loopAtStep:    { min: 0,    max: 1024 },
    swingResolution: { min: 1,  max: 8 },
    swingAmount:   { min: 0,    max: 1 },
    filterFreq:    { min: 20,   max: 20000 },
    filterQ:       { min: 0.1,  max: 24 },
    reverbAmount:  { min: 0,    max: 1 },
    delayTime:     { min: 0,    max: 4 },
    delayDepth:   { min: 0,    max: 1 },
    saturationAmount: { min: 0, max: 1 },
    sampleDecay:   { min: 0,    max: 2 },
    variation:     { min: 0,    max: 100 },
    variation2:    { min: 0,    max: 100 },
};

/**
 * Recalculates loopPointBeat and loopPointStep from loopAtStep and stepsPerBeat.
 */
export function recalcLoopDerived(track) {
    track.loopPointBeat = Math.floor(track.loopAtStep / track.stepsPerBeat)
    track.loopPointStep = track.loopAtStep % track.stepsPerBeat
}
