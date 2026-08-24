// src/ui/track_editor/constants.js
// Shared constants for TrackEditor sections — extracted from the monolith.

import Utils from '../../core/utils.js'

// ── Format helpers ────────────────────────────────────────────────────

export const fmtFreq = v => {
    const hz = Math.round(Utils.toFiniteNumber(v, 20, 'filterFreq'))
    return hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : hz + 'Hz'
}

export const fmtPitch = v => {
    const n = Math.round(v)
    return (n >= 0 ? '+' : '') + String(Math.abs(n)).padStart(2, '0')
}

export const fmtVal = (key, v) => {
    if (key === 'filterFreq') return fmtFreq(v)
    if (key === 'filterQ') return v.toFixed(2)
    if (key === 'pitch') return fmtPitch(v)
    return v
}

// ── Filter ────────────────────────────────────────────────────────────

export const FILTER_TYPE_ICONS = {
    lowpass:  'LP',
    highpass: 'HP',
    bandpass: 'BP',
}

export const FILTER_PROPS = [
    { key: 'filterType', label: 'Type', type: 'icon', options: ['lowpass', 'highpass', 'bandpass'] },
    { key: 'filterFreq', label: 'Freq', min: 20, max: 20000, step: 1, lfo: 'filterFreqLfo' },
    { key: 'filterQ', label: 'Q', min: 0.707, max: 18.707, step: 0.01, lfo: 'filterQLfo' }
]

// ── FX definitions ────────────────────────────────────────────────────

export const FX_DEFS = [
    { key: 'reverbAmount', label: 'Rev', controls: ['reverbAmount', 'reverbType'] },
    { key: 'delayDepth', label: 'Dly', controls: ['delayDepth', 'delayTime', 'delayType'] },
    { key: 'saturationAmount', label: 'Sat', controls: ['saturationAmount', 'saturationType'] },
    { key: 'filterFreq', label: 'fltr', controls: ['filterType', 'filterFreq', 'filterQ'] }
]

// ── Knob bar definitions ──────────────────────────────────────────────

export const KNOB_PROPS = [
    { key: 'velocity',    label: 'Vel',   min: 0,  max: 1,  step: 0.01, lfo: 'velocityLfo' },
    { key: 'pan',         label: 'Pan',   min: -1, max: 1,  step: 0.01, lfo: 'panLfo' },
    { key: 'pitch',       label: 'Pitch', min: -24, max: 24, step: 1,   lfo: 'pitchLfo' },
    { key: 'decay', label: 'Decay', min: 0,  max: 5000, step: 10 }
]

// ── Tabs ──────────────────────────────────────────────────────────────

export const TAB_DEFS = [
    { id: 'fx',   label: 'fx' },
    { id: 'snd',  label: 'sound' },
    { id: 'mod',  label: 'mod' },
    { id: 'loop', label: 'loop' },
    { id: 'gen',  label: 'gen' }
]

// ── Generation groups ─────────────────────────────────────────────────

export const GROUPS = [
    {
        label: 'Basic / Transport',
        props: [
            { key: 'auto', label: 'Auto', type: 'boolean' },
            { key: 'variation', label: 'Var Pos', min: 0, max: 100, step: 1 },
            { key: 'variation2', label: 'Var Prop', min: 0, max: 100, step: 1 },
            { key: 'probability', label: 'Prob', min: 0, max: 1, step: 0.01 },
        ]
    },
    {
        label: 'Effects',
        props: [
            { key: 'reverbAmount', label: 'Depth', min: 0, max: 1, step: 0.01 },
            { key: 'reverbType', label: 'Type', type: 'select', options: ['none', 'room', 'hall', 'plate', 'spring', 'gated'] },
            { key: 'delayDepth', label: 'Depth', min: 0, max: 1, step: 0.01 },
            { key: 'delayTime', label: 'Time', type: 'select', options: Utils.delayTimeValues, labels: Utils.delayTimeLabels },
            { key: 'delayType', label: 'Type', type: 'select', options: ['none', 'slap', 'tape', 'pingpong'] },
            { key: 'saturationAmount', label: 'Depth', min: 0, max: 1, step: 0.01 },
            { key: 'saturationType', label: 'Type', type: 'select', options: ['soft', 'hard', 'tape'] }
        ]
    },
    {
        label: 'Sound',
        props: []
    },
    {
        label: 'Loop / Pattern',
        props: []
    }
]

// ── Derived ───────────────────────────────────────────────────────────

export const ALL_TRACK_PROPS = [...GROUPS.flatMap(g => g.props), ...FILTER_PROPS]
export const PROP_BY_KEY = new Map(ALL_TRACK_PROPS.map(p => [p.key, p]))
