/**
 * Shared pattern/track/note builders for tests.
 *
 * Eliminates per-file duplication of the same 10-field note,
 * 12-field track, and 4-field pattern objects. Every field has
 * an explicit default via ?? so callers only override what they need.
 */

// ─── Note ────────────────────────────────────────────────────────────────────

const NOTE_DEFAULTS = {
    velocity: 0.8,
    pitch: 0,
    every: 1,
    pos: 0,
    prob: 1,
    retriggerNum: 1,
    rate: 1,
    arp: null,
    arpTriggerProbability: 1,
    euclidianFill: 0,
}

/**
 * Build a note object. Only beat and beatStep are required.
 * @param {number} beat
 * @param {number} beatStep
 * @param {object} [opts] - override any note field
 */
export function makeNote(beat, beatStep, opts = {}) {
    return { beat, beatStep, ...NOTE_DEFAULTS, ...opts }
}

// ─── Track ───────────────────────────────────────────────────────────────────

const TRACK_DEFAULTS = {
    nbBeats: 4,
    stepsPerBeat: 4,
    velocity: 1,
    pan: 0,
    pitch: 0,
    mute: false,
    solo: false,
    auto: false,
    soundId: 'NOT_DEFINED',
    useAutoAssignSound: true,
    useSoftSynth: false,
    mono: false,
    variation: 0,
    variation2: 0,
    filterType: 'allpass',
    filterFreq: 20,
    filterQ: 0.707,
    reverbType: 'none',
    reverbAmount: 0,
    delayType: 'tape',
    delayTime: 1,
    delayDepth: 0,
    saturationType: 'soft',
    saturationAmount: 0,
    sat: true,
    reverbOn: true,
    delayOn: true,
}

/**
 * Build a track object. Only name is required.
 * loopAtStep and loopPointBeat default from nbBeats * stepsPerBeat.
 * @param {string} name
 * @param {Array} [notes=[]]
 * @param {object} [opts] - override any track field
 */
export function makeTrack(name, notes = [], opts = {}) {
    const nbBeats = opts.nbBeats ?? TRACK_DEFAULTS.nbBeats
    const stepsPerBeat = opts.stepsPerBeat ?? TRACK_DEFAULTS.stepsPerBeat
    const loopAtStep = opts.loopAtStep ?? nbBeats * stepsPerBeat
    const loopPointBeat = opts.loopPointBeat ?? nbBeats

    return {
        name,
        notes,
        ...TRACK_DEFAULTS,
        ...opts,
        nbBeats,
        stepsPerBeat,
        loopAtStep,
        loopPointBeat,
        loopPointStep: opts.loopPointStep ?? 0,
    }
}

// ─── Pattern ─────────────────────────────────────────────────────────────────

/**
 * Build a complete pattern object.
 * @param {object} [opts]
 * @param {string}  [opts.name='Test']
 * @param {number}  [opts.bpm=120]
 * @param {number}  [opts.nbBeats=4]
 * @param {Array}   [opts.tracks=[]]
 */
export function makePattern(opts = {}) {
    return {
        name: opts.name ?? 'Test',
        bpm: opts.bpm ?? 120,
        nbBeats: opts.nbBeats ?? 4,
        _version: 0,
        tracks: opts.tracks ?? [],
    }
}

// ─── Parameter sets for it.each ──────────────────────────────────────────────

/**
 * Canonical parameter combinations that exercise different subdivisions
 * and tempos. Use with it.each(PARAM_SETS) to multiply coverage.
 *
 * Each entry: [stepsPerBeat, bpm, nbBeats, label]
 */
export const PARAM_SETS = [
    [4, 120, 4, 'standard'],
    [1, 120, 4, 'quarter-note steps'],
    [8, 120, 4, 'eighth-note steps'],
    [3, 145, 4, 'triplet + odd bpm'],
    [4, 80, 8, 'slow + long pattern'],
    [4, 200, 2, 'fast + short pattern'],
    [16, 120, 1, '16th-note + 1 beat'],
    [8, 93, 3, 'odd beats + odd bpm'],
]
