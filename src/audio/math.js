import { logger } from '../core/logger.js'
import { TICK, C3_FREQ, MIN_NOTE_RATIO } from '../core/constants.js'
import { clamp, toFiniteNumber } from '../core/numbers.js'
import Utils from '../core/utils.js'

/** Beats in one LFO cycle: `freq` counts cycles per 4 beats. */
const BEATS_PER_LFO_CYCLE = 4

export function safeDisconnect(node) {
    if (!node || typeof node.disconnect !== 'function') return
    try {
        node.disconnect()
    } catch (e) {
        logger.warn('Math', 'safeDisconnect: node already disconnected', e)
    }
}

/**
 * @param {number} detuneSemitones  detune in SEMITONES, clamped to +-1 (the
 *   worklet's own oscNDetune is in cents and is a different quantity — do not
 *   feed one to the other)
 */
export function computeOscFrequency(noteRatio, octave = 0, detuneSemitones = 0) {
    const nRatio = computeNoteRatio(noteRatio)
    const oct = clamp(toFiniteNumber(octave, 0), -4, 4)
    const det = clamp(toFiniteNumber(detuneSemitones, 0), -1, 1)
    return C3_FREQ * nRatio * Math.pow(2, oct + det)
}

export function computeNoteRatio(fpitch) {
    return Math.max(MIN_NOTE_RATIO, toFiniteNumber(fpitch, 1))
}

/**
 * Single source of truth for the LFO value calculation.
 *
 * Returns the LFO value in the same units as the base value of the control.
 *
 * The worklet `lfo_ui_source.js` inlines the same formula. Both must
 * produce the same value for the same input (verified by tests).
 *
 * One cycle spans 4 beats in both modes (`freq` = cycles per 4 beats):
 *   - tick-based: computeLfoValue(lfo, tick, ...) — the only mode src uses;
 *   - time-based: computeLfoValue(lfo, null, ..., audioTime, bpm) — reached only
 *     when a caller passes an audioTime, which none does today.
 *
 * @param {Object|null} lfo  LFO config: { freq, min, max, phase }
 * @param {number|null} tick      Current tick position (for tick-based mode)
 * @param {number|null} nbTicks   unused, kept for the call signature
 * @param {string|null} [controlKey]  unused, kept for the call signature
 * @param {number|null} audioTime   AudioContext.currentTime (for time-based mode)
 * @param {number|null} bpm         Current BPM (for time-based mode)
 * @returns {number} LFO value in base units
 */
export function computeLfoValue(lfo, tick, nbTicks, controlKey, audioTime = null, bpm = null) {
    if (!lfo) return 0
    const freqVal = toFiniteNumber(parseFloat(lfo.freq), 1, 'lfo.freq')
    const min = toFiniteNumber(parseFloat(lfo.min), 0, 'lfo.min')
    const max = toFiniteNumber(parseFloat(lfo.max), 1, 'lfo.max')
    const phase = toFiniteNumber(parseFloat(lfo.phase), 0, 'lfo.phase')
    const waveName = lfo.type ?? lfo.waveform ?? 'sine'
    let wave = Utils.waveList.indexOf(waveName)
    if (wave === -1) wave = toFiniteNumber(parseFloat(waveName), 0, 'waveName')

    // Frequency in cycles per 4 beats. 1.0 = 1 cycle per 4 beats.
    // Clamp to [0, 2] as per requirements.
    const freqClamped = Math.min(2, freqVal)

    let currentPhase
    if (audioTime != null && bpm != null) {
        // Time-based, same 4-beat cycle as the tick branch. This used to divide by
        // 16 * (60 / bpm), i.e. 16 beats, which ran the LFO 4x slower than `freq`
        // claims (and 4x slower than the tick branch and the worklet).
        const cycleSeconds = BEATS_PER_LFO_CYCLE * (60 / bpm)
        currentPhase = (audioTime / cycleSeconds) * freqClamped + phase
    } else {
        // Tick-based: for MIDI export and tests
        currentPhase = (tick / (TICK * BEATS_PER_LFO_CYCLE)) * freqClamped + phase
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
    const p = phase - 0.25 - Math.floor(phase - 0.25)

    if (wave < 0.5) return Math.sin(2 * Math.PI * p) // Sine
    if (wave < 1.5) return p < 0.25 ? p * 4 - 1 : p < 0.75 ? 3 - p * 4 : p * 4 - 5 // Tri
    if (wave < 2.5) return p * 2 - 1 // Saw
    if (wave < 3.5) return p < 0.5 ? 1 : -1 // Square

    // S&H — deterministic pseudo-random, new value at each LFO cycle boundary
    const cycle = Math.floor(phase)
    let rng = (cycle * 1234567 + 890123) | 0
    rng ^= rng << 13
    rng ^= rng >> 17
    rng ^= rng << 5
    return (rng | 0) / 2147483648
}

export function computeAccent(noteVelo, accentAmount = 0.5) {
    const isAccented = noteVelo > 0.5
    const accentMultiplier = isAccented ? 1 + accentAmount * 0.5 : 1
    const accentFilterBoost = isAccented ? accentAmount * 2000 : 0
    return { isAccented, accentMultiplier, accentFilterBoost }
}

const SYNC_NOTE_HZ = {
    '1/1': 0.25,
    '1/2': 0.5,
    '1/4': 1,
    '1/8': 2,
    '1/16': 4,
    '1/8T': (2 * 2) / 3,
    '1/16T': (4 * 2) / 3,
}

export function syncToHz(syncValue, bpm) {
    if (!syncValue || syncValue === 'off' || !bpm || bpm <= 0) return null
    const base = SYNC_NOTE_HZ[syncValue]
    if (base === undefined) {
        logger.warn('Math', 'syncToHz: unknown sync label', syncValue)
        return null
    }
    return base * (bpm / 60)
}
