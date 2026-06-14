/**
 * track_schema.js — Single source of truth for the track structure.
 */

export const TRACK_DEFAULTS = {
    name: "",
    useAutoAssignSound: true,
    soundId: "NOT_DEFINED",
    bars: 4,
    barQuantize: 4,
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
    delayAmount: 0,
    fxSelected: "reverb",
    saturationType: "soft",
    saturationAmount: 0,
    saturationOn: true,
    reverbOn: true,
    delayOn: true,
    synthSoundKey: null,
    sampleLength: 1,
    notes: []
};

/**
 * Normalizes a track object by applying default values
 * for missing properties.
 */
export function normalizeTrack(track = {}) {
    const t = track || {};
    const { notes: inputNotes, ...rest } = t;
    const normalized = { ...TRACK_DEFAULTS, ...rest };
    normalized.notes = Array.isArray(inputNotes) ? [...inputNotes] : [];
    return normalized;
}

/**
 * Properties that are recalculated on the fly (derived).
 */
export const TRACK_RECALCULATED = ["loopPointBar", "loopPointStep"];

/**
 * Recalculates loopPointBar and loopPointStep from loopAtStep and barQuantize.
 */
export function recalcLoopDerived(track) {
    track.loopPointBar = Math.floor(track.loopAtStep / track.barQuantize)
    track.loopPointStep = track.loopAtStep % track.barQuantize
}
