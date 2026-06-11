import {
    TICK,
    C3_FREQ,
    LFO_GAIN_MULTIPLIER,
    LFO_FREQ_OFFSET,
    FILTER_FREQ_MIN,
    FILTER_FREQ_MAX,
    NOTE_VELO_BALANCE,
    MIN_GAIN_VALUE,
    MIN_NOTE_RATIO,
    PITCH_RAMP_TIME,
} from '../core/constants.js'

const PAN_MAP = [0, 0.3, 0.5, -0.4, 0.4, -0.3, -0.2, 1]

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

export function toFiniteNumber(value, fallback = 0) {
    const num = Number(value)
    return Number.isFinite(num) ? num : fallback
}

export function computeOscFrequency(noteRatio, octave = 0, detune = 0) {
    const nRatio = computeNoteRatio(noteRatio)
    const oct = clamp(toFiniteNumber(octave, 0), -4, 4)
    const det = clamp(toFiniteNumber(detune, 0), -100, 100)
    return C3_FREQ * nRatio * Math.pow(2, oct + (det / 100))
}

export function computeNoteRatio(fpitch) {
    return Math.max(MIN_NOTE_RATIO, toFiniteNumber(fpitch, 1))
}

/**
 * Single source of truth for the LFO value calculation.
 *
 * Returns the LFO value in the same units as the base value of the control.
 * For 'filterFreq' and 'filterQ', if the LFO config {min,max} is in Hz/Q
 * (i.e. > 1), it is converted to normalized [0,1] so the result matches
 * the worklet's normalized domain.
 *
 * The worklet `strip_source.js` inlines the same formula. Both must
 * produce the same value for the same input (verified by tests).
 *
 * @param {Object|null} lfo  LFO config: { freq, min, max, phase }
 * @param {number} tick      Current tick position
 * @param {number} nbTicks   Total ticks in the pattern (unused for now)
 * @param {string|null} controlKey  Optional control key for normalization
 * @returns {number} LFO value in base units
 */
export function computeLfoValue(lfo, tick, nbTicks = TICK * 4, controlKey = null) {
    if (!lfo) return 0
    const freqVal = parseFloat(lfo.freq) || 1
    let min = parseFloat(lfo.min) || 0
    let max = parseFloat(lfo.max) || 1
    const phase = parseFloat(lfo.phase) || 0
    const wave = parseFloat(lfo.waveform) || 0

    if (controlKey === 'filterFreq' && (min > 1 || max > 1)) {
        const hzMin = Math.max(FILTER_FREQ_MIN, min)
        const hzMax = Math.max(FILTER_FREQ_MIN, max)
        min = Math.log10(hzMin / FILTER_FREQ_MIN) / 3
        max = Math.log10(hzMax / FILTER_FREQ_MIN) / 3
    } else if (controlKey === 'filterQ' && (min > 1 || max > 1)) {
        const qMin = Math.max(0.707, min)
        const qMax = Math.max(0.707, max)
        min = (qMin - 0.707) / 18
        max = (qMax - 0.707) / 18
    }

    // Period in ticks: 1 unit = 16 beats = 4 bars = 4 * TICK
    const periodInTicks = freqVal * 4 * TICK
    const currentPhase = (tick / periodInTicks) + phase

    let val = getLfoWaveformValue(currentPhase, wave)
    val = (val + 1) / 2
    val = min + val * (max - min)

    return Math.round(100 * val) / 100
}

/**
 * Shared LFO Waveform Math
 * Returns a value in [-1, 1] range.
 */
export function getLfoWaveformValue(phase, wave) {
    // Shift by -0.25 to start at minimum (-1) when phase=0
    const p = (phase - 0.25) - Math.floor(phase - 0.25)
    
    if (wave < 0.5) return Math.sin(2 * Math.PI * p) // Sine
    if (wave < 1.5) return p < 0.25 ? p * 4 - 1 : (p < 0.75 ? 3 - p * 4 : p * 4 - 5) // Tri
    if (wave < 2.5) return p * 2 - 1 // Saw
    if (wave < 3.5) return p < 0.5 ? 1 : -1 // Square
    
    // S&H
    return Math.sin(2 * Math.PI * Math.floor((phase - 0.25) * 8) / 8) 
}

export function computeAccent(noteVelo, accentAmount = 0.5) {
    const isAccented = noteVelo > 0.5
    const accentMultiplier = isAccented ? 1 + (accentAmount * 0.5) : 1
    const accentAttack = isAccented ? Math.min(PITCH_RAMP_TIME, 0) : 0
    const accentFilterBoost = isAccented ? accentAmount * 2000 : 0
    return { isAccented, accentMultiplier, accentAttack, accentFilterBoost }
}

export function computePeakFilterFreq(baseFreq, filterEnvelopeAmount) {
    const mFreq = baseFreq
    return mFreq + ((FILTER_FREQ_MAX - mFreq) * filterEnvelopeAmount)
}

export function computeAdsrEnvelopeParams(env, noteVelo, masterVolume = 0.8, accentMultiplier = 1) {
    const attackTime = env.attack ?? 0
    const decayTime = env.decay ?? 0
    const sustainLevel = env.sustain ?? 1
    const releaseTime = env.release ?? 0
    const peakGain = noteVelo * masterVolume * accentMultiplier
    return { attackTime, decayTime, sustainLevel, releaseTime, peakGain }
}

export function computeTrackPan(indexTrack) {
    return PAN_MAP[indexTrack] ?? 0
}
