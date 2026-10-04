// src/ui/track_editor/constants.js
// Shared constants for TrackEditor sections — extracted from the monolith.

import { toFiniteNumber } from '../../core/numbers.js'
import Utils from '../../core/utils.js'
import { TRACK_VALUE_RANGES } from '../../model/track_schema.js'

// ── Format helpers ────────────────────────────────────────────────────

const fmtFreq = (v) => {
    const hz = Math.round(toFiniteNumber(v, 20, 'filterFreq'))
    return hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : hz + 'Hz'
}

const fmtPitch = (v) => {
    const n = Math.round(v)
    return (n >= 0 ? '+' : '') + String(Math.abs(n)).padStart(2, '0')
}

export const fmtVal = (key, v) => {
    if (key === 'filterFreq') return fmtFreq(v)
    if (key === 'filterQ') return v.toFixed(2)
    if (key === 'pitch') return fmtPitch(v)
    return v
}

/**
 * Fills min/max from the model's TRACK_VALUE_RANGES (single source of truth
 * with updateTrack's clamp) whenever the key has a range there. UI-only knobs
 * without a model range (decay, probability) keep their own literals.
 */
const withRange = (props) =>
    props.map((p) => {
        const r = TRACK_VALUE_RANGES[p.key]
        return r ? { ...p, min: r.min, max: r.max } : p
    })

// ── Filter ────────────────────────────────────────────────────────────

export const FILTER_TYPE_ICONS = {
    lowpass: 'LP',
    highpass: 'HP',
    bandpass: 'BP',
}

const FILTER_PROPS = withRange([
    { key: 'filterType', label: 'Type', type: 'icon', options: ['lowpass', 'highpass', 'bandpass'] },
    { key: 'filterFreq', label: 'Freq', step: 1, lfoKey: 'filterFreqLfo' },
    { key: 'filterQ', label: 'Q', step: 0.01, lfoKey: 'filterQLfo' },
])

// ── FX definitions ────────────────────────────────────────────────────

export const FX_DEFS = [
    { key: 'reverbAmount', label: 'Rev', controls: ['reverbAmount', 'reverbType'] },
    { key: 'delayDepth', label: 'Dly', controls: ['delayDepth', 'delayTime', 'delayType'] },
    { key: 'saturationAmount', label: 'Sat', controls: ['saturationAmount', 'saturationType'] },
    // The filter FX switches on filterType (allpass = off), so the key is
    // filterType: it names what the LED reads and what the toggle writes.
    { key: 'filterType', label: 'fltr', controls: ['filterType', 'filterFreq', 'filterQ'] },
]

// ── Knob bar definitions ──────────────────────────────────────────────

export const KNOB_PROPS = withRange([
    { key: 'velocity', label: 'Vel', step: 0.01, lfoKey: 'velocityLfo' },
    { key: 'pan', label: 'Pan', step: 0.01, lfoKey: 'panLfo' },
    { key: 'pitch', label: 'Pitch', step: 1, lfoKey: 'pitchLfo' },
    // Log scale: most of the arc covers 20–500 ms where the ear is sensitive,
    // instead of spending 90% of the travel above 1 s. min is 20 (not 0)
    // because SampleVoice floors the decay at 20 ms — and log10(0) is -Inf.
    // decay lives in the sound registry (not the track) → no model range.
    { key: 'decay', label: 'Decay', min: 20, max: 5000, step: 10, scale: 'log' },
])

// ── Tabs ──────────────────────────────────────────────────────────────

export const TAB_DEFS = [
    { id: 'fx', label: 'fx' },
    { id: 'snd', label: 'sound' },
    { id: 'mod', label: 'mod' },
    { id: 'loop', label: 'loop' },
    { id: 'gen', label: 'gen' },
]

// ── Generation groups ─────────────────────────────────────────────────

export const GROUPS = [
    {
        label: 'Basic / Transport',
        props: withRange([
            { key: 'auto', label: 'Auto', type: 'boolean' },
            { key: 'variation', label: 'Var Pos', step: 1 },
            { key: 'variation2', label: 'Var Prop', step: 1 },
            { key: 'probability', label: 'Prob', min: 0, max: 1, step: 0.01 },
        ]),
    },
    {
        label: 'Effects',
        props: withRange([
            { key: 'reverbAmount', label: 'Depth', step: 0.01 },
            {
                key: 'reverbType',
                label: 'Type',
                type: 'select',
                options: ['none', 'room', 'hall', 'plate', 'spring', 'gated'],
            },
            { key: 'delayDepth', label: 'Depth', step: 0.01 },
            {
                key: 'delayTime',
                label: 'Time',
                type: 'select',
                options: Utils.delayTimeValues,
                labels: Utils.delayTimeLabels,
            },
            { key: 'delayType', label: 'Type', type: 'select', options: ['none', 'slap', 'tape', 'pingpong'] },
            { key: 'saturationAmount', label: 'Depth', step: 0.01 },
            { key: 'saturationType', label: 'Type', type: 'select', options: ['soft', 'hard', 'tape'] },
        ]),
    },
    {
        label: 'Sound',
        props: [],
    },
    {
        label: 'Loop / Pattern',
        props: [],
    },
]

// ── Generation sub-tabs (Groove / Engine) ────────────────────────────

export const GEN_SUBTAB_DEFS = [
    { id: 'groove', label: 'Groove' },
    { id: 'engine', label: 'Engine' },
]

export const GEN_GROOVE_PROPS = withRange([
    { key: 'prob_pitch', label: 'Pitch', step: 1 },
    { key: 'prob_velocity', label: 'Velocity', step: 1 },
    { key: 'prob_silence', label: 'Silence', step: 1 },
    { key: 'prob_fill', label: 'Fill', step: 1 },
    { key: 'prob_ghost', label: 'Ghost', step: 1 },
    { key: 'pitch_range', label: 'Pitch Rng', step: 1 },
    { key: 'pitch_scale_lock', label: 'Scale Lock', type: 'boolean' },
])

export const GEN_ENGINE_PROPS = withRange([
    { key: 'prob_retrig', label: 'Retrig', step: 1 },
    { key: 'prob_euclid', label: 'Euclid', step: 1 },
    { key: 'prob_note', label: 'Note Prob', step: 1 },
    { key: 'prob_arp', label: 'Arp', step: 1 },
    {
        key: 'auto_variant',
        label: 'Variant',
        type: 'select',
        options: ['', 'basic', 'fill', 'roll', 'sparse', 'dense'],
    },
    {
        key: 'auto_density',
        label: 'Density',
        step: 0.01,
        format: (v) => (v < 0 ? 'Auto' : v.toFixed(2)),
    },
])

// ── Derived ───────────────────────────────────────────────────────────

export const ALL_TRACK_PROPS = [...GROUPS.flatMap((g) => g.props), ...FILTER_PROPS]
export const PROP_BY_KEY = new Map(ALL_TRACK_PROPS.map((p) => [p.key, p]))
