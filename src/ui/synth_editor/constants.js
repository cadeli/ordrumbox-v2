// src/ui/synth_editor/constants.js
// Shared constants for the SynthEditor sub-modules.

import Utils from '../../core/utils.js'

export const WAVE_ICONS = {
    sine:     '<svg viewBox="0 0 24 14"><path d="M0 7 C3 7,3 1,6 1 C9 1,9 13,12 13 C15 13,15 1,18 1 C21 1,21 7,24 7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    triangle: '<svg viewBox="0 0 24 14"><polyline points="0,12 6,2 12,12 18,2 24,12" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    sawtooth: '<svg viewBox="0 0 24 14"><polyline points="0,12 12,2 12,12 24,2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    square:   '<svg viewBox="0 0 24 14"><polyline points="0,12 0,2 6,2 6,12 12,12 12,2 18,2 18,12 24,12 24,2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    random:   '<svg viewBox="0 0 24 14"><polyline points="1,7 4,2 7,12 10,4 13,10 16,3 19,11 22,5 24,7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
}

export const FILTER_ICONS = {
    lowpass:  '<svg viewBox="0 0 24 14"><path d="M2 2 C8 2,14 12,22 12" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/><line x1="22" y1="2" x2="22" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/></svg>',
    highpass: '<svg viewBox="0 0 24 14"><path d="M2 12 C8 12,14 2,22 2" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/><line x1="22" y1="2" x2="22" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/></svg>',
    bandpass: '<svg viewBox="0 0 24 14"><path d="M2 12 C6 12,10 2,12 2 C14 2,18 12,22 12" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/><line x1="22" y1="2" x2="22" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity="0.4"/></svg>',
}

export const FM_ALGO_ICONS = {
    0: '2→1',
    1: '3→1',
    2: '3→2→1',
    3: '2+3→1',
    4: '2↔1',
}

export const SYNTH_GROUP_DEFAULTS = {
    masterVolume: 0.8,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    vco2: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    vco3: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1, filterEnvelopeAmount: 0 },
    fm: { amount: 0, algo: 0 },
    lfo: { target: 'NOT', wave: 'sine', freq: 0, depth: 0, sync: 'off' },
    lfo2: { target: 'NOT', wave: 'sine', freq: 0, depth: 0, sync: 'off' },
    noise: { mix: 0, filterType: 'highpass', filterFreq: 1000, filterQ: 1 },
    enveloppe: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 },
    modEnvelope: { attack: 0, decay: 0.12, sustain: 0, release: 0.1, target: 'off' },
}

export const MOD_ENV_TARGETS = [
    { value: 'off',   label: 'Off' },
    { value: 'filter', label: 'Filter' },
    { value: 'pitch',  label: 'Pitch' },
    { value: 'fm',     label: 'FM' },
    { value: 'shape',  label: 'Shape' },
]

const VCO_PARAM_DEFS = { gain: { min: 0, max: 1, step: 0.01 }, octave: { min: -4, max: 4, step: 1 }, detune: { min: -100, max: 100, step: 1 } }
export const SYNTH_PARAM_META = Object.fromEntries([
    ['masterVolume', { min: 0, max: 1, step: 0.01, unit: '' }],
    ...['vco1', 'vco2', 'vco3'].flatMap(vco =>
        Object.entries(VCO_PARAM_DEFS).map(([k, v]) => [`${vco}.${k}`, { ...v, unit: k === 'gain' ? '' : k === 'octave' ? 'oct' : 'ct' }])
    ),
    ['filter.freq', { min: 20, max: 20000, step: 1, unit: 'Hz' }],
    ['filter.Q', { min: 0.1, max: 24, step: 0.1, unit: '' }],
    ['filter.filterEnvelopeAmount', { min: 0, max: 1, step: 0.01, label: 'Env', unit: '' }],
    ['lfo.freq', { min: 0, max: 20, step: 0.01, unit: 'Hz' }],
    ['lfo.depth', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['lfo2.freq', { min: 0, max: 20, step: 0.01, unit: 'Hz' }],
    ['lfo2.depth', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['noise.mix', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['noise.filterFreq', { min: 20, max: 20000, step: 1, unit: 'Hz' }],
    ['noise.filterQ', { min: 0.1, max: 24, step: 0.1, unit: '' }],
    ['fm.amount', { min: 0, max: 1, step: 0.01, label: 'FM', unit: '' }],
    ['fm.algo', { min: 0, max: 4, step: 1, label: 'Algo', unit: '' }],
    ['enveloppe.attack', { min: 0, max: 0.5, step: 0.001, unit: 's' }],
    ['enveloppe.decay', { min: 0, max: 1.0, step: 0.001, unit: 's' }],
    ['enveloppe.sustain', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['enveloppe.release', { min: 0, max: 0.5, step: 0.001, unit: 's' }],
    ['modEnvelope.attack', { min: 0, max: 0.5, step: 0.001, unit: 's' }],
    ['modEnvelope.decay', { min: 0, max: 1.0, step: 0.001, unit: 's' }],
    ['modEnvelope.sustain', { min: 0, max: 1, step: 0.01, unit: '' }],
    ['modEnvelope.release', { min: 0, max: 0.5, step: 0.001, unit: 's' }],
])

export const SYNTH_LFO_TARGETS = ['NOT', ...Object.keys(SYNTH_PARAM_META).filter(k => !k.startsWith('lfo.') && !k.startsWith('lfo2.'))]
export const SYNTH_GROUP_MERGE = {
    master: ['masterVolume']
}
export const SYNTH_GROUP_LABELS = {
    master: 'Master',
    filter: 'Flt',
    fm: 'FM',
    lfo: 'LFO1',
    enveloppe: 'Env',
    modEnvelope: 'ModEnv',
}
export const SYNTH_GROUP_ORDER = ['master', 'vco1', 'vco2', 'vco3', 'filter', 'fm', 'lfo', 'lfo2', 'noise', 'enveloppe', 'modEnvelope']
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

/** Ordered list of group names for iteration. */
export const ALL_GROUP_NAMES = Object.keys(SYNTH_GROUP_DEFAULTS)
