import {
    TICK,
    C3_FREQ,
    MIN_NOTE_RATIO,
} from '../core/constants.js'
import Utils from '../core/utils.js'

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
    const waveName = lfo.type || lfo.waveform || 'sine'
    let wave = Utils.waveList.indexOf(waveName)
    if (wave === -1) wave = parseFloat(waveName) || 0

    if (controlKey === 'filterFreq' && (min > 1 || max > 1)) {
        min = Utils.hzToNormalizedTrackFilterFreq(min)
        max = Utils.hzToNormalizedTrackFilterFreq(max)
    } else if (controlKey === 'filterQ' && (min > 1 || max > 1)) {
        min = Utils.valueToNormalizedTrackFilterQ(min)
        max = Utils.valueToNormalizedTrackFilterQ(max)
    }

    // Frequency in cycles per 4 bars. 1.0 = 1 cycle per 4 bars (TICK * 4 ticks).
    // Clamp to [0, 2] as per requirements.
    const freqClamped = Math.min(2, freqVal)
    const currentPhase = (tick / (TICK * 4)) * freqClamped + phase

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
    const accentFilterBoost = isAccented ? accentAmount * 2000 : 0
    return { isAccented, accentMultiplier, accentFilterBoost }
}
