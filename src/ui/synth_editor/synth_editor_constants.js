// src/ui/synth_editor/synth_editor_constants.js
// Shared constants for the SynthEditor sub-modules.

export const WAVE_ICONS = {
    sine: '<svg viewBox="0 0 24 14"><path d="M0 7 C3 7,3 1,6 1 C9 1,9 13,12 13 C15 13,15 1,18 1 C21 1,21 7,24 7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    triangle:
        '<svg viewBox="0 0 24 14"><polyline points="0,12 6,2 12,12 18,2 24,12" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    sawtooth:
        '<svg viewBox="0 0 24 14"><polyline points="0,12 12,2 12,12 24,2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    square: '<svg viewBox="0 0 24 14"><polyline points="0,12 0,2 6,2 6,12 12,12 12,2 18,2 18,12 24,12 24,2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    random: '<svg viewBox="0 0 24 14"><polyline points="1,7 4,2 7,12 10,4 13,10 16,3 19,11 22,5 24,7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
}

export const FILTER_ICONS = {
    lowpass:
        '<svg viewBox="0 0 24 14"><path d="M2 2 C8 2,14 12,22 12" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/><line x1="22" y1="2" x2="22" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/></svg>',
    highpass:
        '<svg viewBox="0 0 24 14"><path d="M2 12 C8 12,14 2,22 2" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/><line x1="22" y1="2" x2="22" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/></svg>',
    bandpass:
        '<svg viewBox="0 0 24 14"><path d="M2 12 C6 12,10 2,12 2 C14 2,18 12,22 12" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/><line x1="22" y1="2" x2="22" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/></svg>',
}

export const FM_ALGO_ICONS = {
    0: '1',
    1: '2',
    2: '3',
    3: '4',
    4: '5',
}

export const FM_ALGO_LABELS = {
    0: '2→1',
    1: '3→1',
    2: '3→2→1',
    3: '2+3→1',
    4: '2↔1',
}

export const SYNTH_GROUP_DEFAULTS = {
    masterVolume: 0.8,
    subGain: 0,
    pitchPunch: 0,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    vco2: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    vco3: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1, drive: 0 },
    filterEnv: { filterEnvelopeAmount: 0 },
    fm: { amount: 0, algo: 0 },
    lfo: { target: 'NOT', wave: 'sine', freq: 0, depth: 0, sync: 'off' },
    lfo2: { target: 'NOT', wave: 'sine', freq: 0, depth: 0, sync: 'off' },
    noise: { mix: 0, filterType: 'highpass', filterFreq: 1000, filterQ: 1 },
    envelope: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 },
    modEnvelope: { attack: 0, decay: 0.12, sustain: 0, release: 0.1, target: 'off' },
}

export const MOD_ENV_TARGETS = [
    { value: 'off', label: 'Off' },
    { value: 'filter', label: 'Filter' },
    { value: 'pitch', label: 'Pitch' },
    { value: 'fm', label: 'FM' },
    { value: 'shape', label: 'Shape' },
]

const VCO_PARAM_DEFS = {
    gain: { min: 0, max: 1, step: 0.01 },
    octave: { min: -4, max: 4, step: 1 },
    detune: { min: -100, max: 100, step: 1 },
}
export const SYNTH_PARAM_META = Object.fromEntries([
    ['masterVolume', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['subGain', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['pitchPunch', { min: 0, max: 1, step: 0.01, unit: '' }],
    ...['vco1', 'vco2', 'vco3'].flatMap((vco) =>
        Object.entries(VCO_PARAM_DEFS).map(([k, v]) => [
            `${vco}.${k}`,
            { ...v, unit: k === 'gain' ? '' : k === 'octave' ? 'oct' : 'ct' },
        ]),
    ),
    ['filter.freq', { min: 20, max: 20000, step: 1, unit: 'Hz' }],
    ['filter.Q', { min: 0.1, max: 24, step: 0.1, unit: '' }],
    ['filter.drive', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['filterEnv.filterEnvelopeAmount', { min: 0, max: 1, step: 0.01, label: 'Env', unit: '' }],
    ['lfo.freq', { min: 0.01, max: 5, step: 0.01, unit: 'Hz', scale: 'log' }],
    ['lfo.depth', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['lfo2.freq', { min: 0.01, max: 5, step: 0.01, unit: 'Hz', scale: 'log' }],
    ['lfo2.depth', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['noise.mix', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['noise.filterFreq', { min: 20, max: 20000, step: 1, unit: 'Hz' }],
    ['noise.filterQ', { min: 0.1, max: 24, step: 0.1, unit: '' }],
    ['fm.amount', { min: 0, max: 1, step: 0.01, label: 'FM', unit: '' }],
    ['fm.algo', { min: 0, max: 4, step: 1, label: 'Algo', unit: '' }],
    ['envelope.attack', { min: 0, max: 0.5, step: 0.001, unit: 's' }],
    ['envelope.decay', { min: 0, max: 1.0, step: 0.001, unit: 's' }],
    ['envelope.sustain', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['envelope.release', { min: 0, max: 0.5, step: 0.001, unit: 's' }],
    ['modEnvelope.attack', { min: 0, max: 0.5, step: 0.001, unit: 's' }],
    ['modEnvelope.decay', { min: 0, max: 1.0, step: 0.001, unit: 's' }],
    ['modEnvelope.sustain', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['modEnvelope.release', { min: 0, max: 0.5, step: 0.001, unit: 's' }],
])

export const SYNTH_LFO_TARGETS = [
    'NOT',
    ...Object.keys(SYNTH_PARAM_META).filter((k) => !k.startsWith('lfo.') && !k.startsWith('lfo2.')),
]
export const SYNTH_GROUP_MERGE = {
    master: ['masterVolume', 'subGain', 'pitchPunch'],
}
export const SYNTH_GROUP_LABELS = {
    scope: 'Scope',
    master: 'Master',
    filter: 'Flt',
    filterEnv: 'FltEnv',
    fm: 'FM',
    lfo: 'LFO1',
    envelope: 'Env',
    modEnvelope: 'ModEnv',
}
export const SYNTH_GROUP_ORDER = [
    'scope',
    'vco1',
    'vco2',
    'vco3',
    'fm',
    'filter',
    'filterEnv',
    'lfo',
    'lfo2',
    'noise',
    'master',
    'envelope',
    'modEnvelope',
]
export const VCO_RE = /^vco\d+$/i
export const LFO_RE = /^lfo\d*$/i

export const LFO_SYNC_OPTIONS = [
    { value: 'off', label: 'free' },
    { value: '1/1', label: '1/1' },
    { value: '1/2', label: '1/2' },
    { value: '1/4', label: '1/4' },
    { value: '1/8', label: '1/8' },
    { value: '1/16', label: '1/16' },
    { value: '1/8T', label: '1/8T' },
    { value: '1/16T', label: '1/16T' },
]

/** Waveform drawing uses a fixed sample buffer, allocated once. */
export const WAVE_BUFFER = new Float32Array(1024)

/**
 * LFO target → scale factor applied to raw waveform value.
 * raw * scale = the modulation amount in the target's display units.
 * Matches the worklet synth_voice_source.js #lfoValue() mapping.
 */
export const LFO_TARGET_SCALE = {
    'vco1.octave': 1,
    'vco1.detune': 100,
    'vco1.gain': 1,
    'vco2.octave': 1,
    'vco2.detune': 100,
    'vco2.gain': 1,
    'vco3.octave': 1,
    'vco3.detune': 100,
    'vco3.gain': 1,
    'filter.freq': 1000,
    'filter.Q': 24,
    'filter.drive': 1,
    'filterEnv.filterEnvelopeAmount': 1,
    masterVolume: 1,
    'noise.mix': 1,
    'noise.filterFreq': 10000,
    'noise.filterQ': 24,
    'fm.amount': 1,
    'fm.algo': 1,
    subGain: 1,
    pitchPunch: 1,
    'envelope.attack': 0.25,
    'envelope.decay': 0.5,
    'envelope.sustain': 0.5,
    'envelope.release': 0.25,
    'modEnvelope.attack': 0.25,
    'modEnvelope.decay': 0.5,
    'modEnvelope.sustain': 0.5,
    'modEnvelope.release': 0.25,
}

/** Group card → draft flag holding its bypassed state. */
export const CARD_BYPASS_FLAGS = {
    noise: 'bypassNoise',
    filter: 'bypassFilter',
    filterEnv: 'bypassFilterEnv',
    envelope: 'bypassEnv',
    lfo: 'bypassLfo1',
    lfo2: 'bypassLfo2',
    fm: 'bypassFm',
    modEnvelope: 'bypassModEnv',
}
