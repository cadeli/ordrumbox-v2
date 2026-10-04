import { logger } from '../core/logger.js'

/** Logger tag for every warning this module emits. */
const TAG = 'fx_values'

/**
 * Allowed values of the audio effect parameters: oscillator/LFO waveform, filter
 * type, delay time.
 *
 * These are the single source of truth for BOTH sides of the wire. The UI picks a
 * value by INDEX in these lists (`WAVE_TYPES.indexOf(name)`) and the synth voice
 * turns the name into the integer the worklet expects (`waveToInt`), so the
 * order here is a contract: it used to be duplicated as `WAVE_TO_INT` /
 * `FILTER_TO_INT` inside worklet_synth_voice.js, and the UI's list was a SUBSET
 * of the worklet's (no `notch`), which is exactly the kind of drift a second
 * copy causes.
 */

/** Oscillator and LFO waveforms. `random` is a deterministic sample & hold. */
export const WAVE_TYPES = ['sine', 'triangle', 'sawtooth', 'square', 'random']

/**
 * Filter types exposed by the track editor. The worklet also implements `notch`
 * (FILTER_TO_INT below), reachable only from a hand-written pattern.
 */
export const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass']

/** Every filter type the synth voice worklet can render, UI-exposed or not. */
const ALL_FILTER_TYPES = [...FILTER_TYPES, 'notch']

/** name → the integer the synth-voice worklet expects. */
export const WAVE_TO_INT = Object.fromEntries(WAVE_TYPES.map((name, i) => [name, i]))
export const FILTER_TO_INT = Object.fromEntries(ALL_FILTER_TYPES.map((name, i) => [name, i]))

/**
 * @param {string} wave - a waveform name
 * @returns {number} worklet code, 0 (`sine`) for an unknown name
 */
export function waveToInt(wave) {
    return WAVE_TO_INT[wave] ?? 0
}

/**
 * @param {string} type - a filter type name
 * @returns {number} worklet code, 0 (`lowpass`) for an unknown name
 */
export function filterToInt(type) {
    return FILTER_TO_INT[type] ?? 0
}

/** Delay time multipliers, in beats: 1/16 … 4. */
export const DELAY_TIME_VALUES = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4]

/** Same slots, as note lengths. */
export const DELAY_TIME_LABELS = ['1/16', '1/8', '1/4', '1/2', '1', '2', '4']

/**
 * Delay time in seconds. The value is a multiplier in BEATS, so it follows the
 * tempo.
 *
 * @param {number} delayTimeValue - a DELAY_TIME_VALUES entry, or any beat count
 * @param {number} bpm
 * @returns {number} seconds; 1 beat when the value is not finite
 */
export function getDelayTimeInSeconds(delayTimeValue, bpm) {
    const num = Number(delayTimeValue)
    // 0 is a valid delayTime (TRACK_VALUE_RANGES.delayTime.min = 0) — only non-finite falls back.
    if (!Number.isFinite(num)) {
        logger.warn(TAG, 'invalid delayTimeValue, using 1 beat', delayTimeValue)
        return (60 / bpm) * 1
    }
    return (60 / bpm) * num
}
