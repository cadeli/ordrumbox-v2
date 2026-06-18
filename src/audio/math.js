import {
    TICK,
    C3_FREQ,
    MIN_NOTE_RATIO,
} from '../core/constants.js'
import Utils from '../core/utils.js'
import { logger } from "../core/logger.js"

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
 * Two modes:
 *   - tick-based: computeLfoValue(lfo, tick, nbTicks, controlKey)
 *   - time-based: computeLfoValue(lfo, null, null, controlKey, audioTime, bpm)
 *
 * @param {Object|null} lfo  LFO config: { freq, min, max, phase }
 * @param {number|null} tick      Current tick position (for tick-based mode)
 * @param {number|null} nbTicks   Total ticks in the pattern (for tick-based mode)
 * @param {string|null} controlKey  Optional control key for normalization
 * @param {number|null} audioTime   AudioContext.currentTime (for time-based mode)
 * @param {number|null} bpm         Current BPM (for time-based mode)
 * @returns {number} LFO value in base units
 */
export function computeLfoValue(lfo, tick, nbTicks = TICK * 4, controlKey = null, audioTime = null, bpm = null) {
    if (!lfo) return 0
    const freqVal = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','pf',lfo.freq,1),1))(parseFloat(lfo.freq)))
    let min = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','pf',lfo.min,0),0))(parseFloat(lfo.min)))
    let max = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','pf',lfo.max,1),1))(parseFloat(lfo.max)))
    const phase = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','pf',lfo.phase,0),0))(parseFloat(lfo.phase)))
    const waveName = lfo.type || lfo.waveform || 'sine'
    let wave = Utils.waveList.indexOf(waveName)
    if (wave === -1) wave = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','pf',waveName,0),0))(parseFloat(waveName)))

    if (controlKey === 'filterFreq' && (min > 1 || max > 1)) {
        min = Utils.hzToNormalizedTrackFilterFreq(min)
        max = Utils.hzToNormalizedTrackFilterFreq(max)
    } else if (controlKey === 'filterQ' && (min > 1 || max > 1)) {
        min = Utils.valueToNormalizedTrackFilterQ(min)
        max = Utils.valueToNormalizedTrackFilterQ(max)
    }

    // Frequency in cycles per 4 bars. 1.0 = 1 cycle per 4 bars.
    // Clamp to [0, 2] as per requirements.
    const freqClamped = Math.min(2, freqVal)

    let currentPhase
    if (audioTime != null && bpm != null) {
        // Time-based: matches worklet _computeLfo exactly
        const patternDuration = 16 * (60 / bpm) // 4 bars = 16 beats in seconds
        currentPhase = (audioTime / patternDuration) * freqClamped + phase
    } else {
        // Tick-based: for MIDI export and tests
        currentPhase = (tick / (TICK * 4)) * freqClamped + phase
    }

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
    
    // S&H — deterministic pseudo-random, new value at each LFO cycle boundary
    const cycle = Math.floor(phase)
    let rng = ((cycle * 1234567 + 890123) | 0)
    rng ^= rng << 13
    rng ^= rng >> 17
    rng ^= rng << 5
    return (rng | 0) / 2147483648
}

export function computeAccent(noteVelo, accentAmount = 0.5) {
    const isAccented = noteVelo > 0.5
    const accentMultiplier = isAccented ? 1 + (accentAmount * 0.5) : 1
    const accentFilterBoost = isAccented ? accentAmount * 2000 : 0
    return { isAccented, accentMultiplier, accentFilterBoost }
}
