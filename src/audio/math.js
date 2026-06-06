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
    GAIN_ATTACK_RAMP,
    RELEASE_TIME,
    STOP_BUFFER,
    STOP_EXTRA_BUFFER,
    DELAY_FILTER_FREQ,
    DELAY_FEEDBACK,
} from '../core/constants.js'

export const SATURATION_TYPES = Object.freeze(["soft", "hard", "tape"])

export const REVERB_PRESETS = Object.freeze({
    none: { duration: 0, decay: 0, preDelay: 0, tone: 1 },
    room: { duration: 0.8, decay: 2.2, preDelay: 0.008, tone: 0.85 },
    hall: { duration: 2.4, decay: 3.8, preDelay: 0.02, tone: 0.75 },
    plate: { duration: 1.6, decay: 2.8, preDelay: 0.012, tone: 0.9 },
    spring: { duration: 1.2, decay: 2.4, preDelay: 0.01, tone: 0.65 },
    gated: { duration: 0.7, decay: 1.4, preDelay: 0.004, tone: 0.8, gated: true }
})

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

export function computeLfoFrequency(configFreq, bpm) {
    // 1 unit = 16 beats period. So configFreq=2 means 32 beats period.
    const periodInBeats = (toFiniteNumber(configFreq, 1) || 1) * 16
    const periodInSeconds = periodInBeats * (60 / bpm)
    return 1 / periodInSeconds
}

export function computeLfoValueFromTick(lfo, tick) {
    return computeLfoValue(lfo, tick, TICK * 4, null)
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

    // Period in ticks: 1 unit = 16 beats = 16 * TICK
    const periodInTicks = freqVal * 16 * TICK
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
    const p = phase - Math.floor(phase)
    if (wave < 0.5) return Math.sin(2 * Math.PI * p) // Sine
    if (wave < 1.5) return p < 0.25 ? p * 4 : (p < 0.75 ? 2 - p * 4 : p * 4 - 4) // Tri
    if (wave < 2.5) return p * 2 - 1 // Saw
    if (wave < 3.5) return p < 0.5 ? 1 : -1 // Square
    
    // S&H: simplified for UI
    return Math.sin(2 * Math.PI * Math.floor(phase * 8) / 8) 
}

export function computeLfoDepth(min, max) {
    return max - min
}

export function computeSaturationCurve(type = "soft", amount = 0) {
    const normalizedAmount = Math.min(1, Math.max(0, Number(amount) || 0))
    const samples = 1024
    const curve = new Float32Array(samples)
    for (let i = 0; i < samples; i++) {
        const x = (i * 2 / (samples - 1)) - 1
        if (normalizedAmount <= 0) {
            curve[i] = x
            continue
        }
        switch (type) {
            case "hard": {
                const k = 1 + (normalizedAmount * 80)
                curve[i] = Math.max(-1, Math.min(1, x * k))
                break
            }
            case "tape": {
                const k = 1 + (normalizedAmount * 12)
                curve[i] = Math.atan(k * x) / Math.atan(k)
                break
            }
            case "soft":
            default: {
                const k = 1 + (normalizedAmount * 40)
                curve[i] = Math.tanh(k * x) / Math.tanh(k)
                break
            }
        }
    }
    return curve
}

export function computeImpulseSampleData(sampleRate, preset, channelIndex = 0) {
    const length = Math.max(1, Math.floor(sampleRate * preset.duration))
    const data = new Float32Array(length)
    for (let i = 0; i < length; i++) {
        const t = i / sampleRate
        const decay = Math.pow(1 - (i / length), preset.decay)
        const delayed = t >= preset.preDelay ? 1 : 0
        const gatedGain = preset.gated && i > length * 0.65 ? 0.2 : 1
        const noise = (Math.random() * 2 - 1)
        const springRipple = preset === REVERB_PRESETS.spring
            ? Math.sin((i / sampleRate) * 170) * 0.25 + Math.sin((i / sampleRate) * 510) * 0.1
            : 0
        data[i] = (noise * preset.tone + springRipple) * decay * delayed * gatedGain
    }
    return data
}

export function computeDriveGain(saturationAmount) {
    const normalizedAmount = Math.min(1, Math.max(0, Number(saturationAmount) || 0))
    return 1 + (normalizedAmount * 6)
}

export function computeOutputGain(saturationAmount) {
    const normalizedAmount = Math.min(1, Math.max(0, Number(saturationAmount) || 0))
    return 1 - (normalizedAmount * 0.15)
}

export function computeDelaySettings(type) {
    switch (type) {
        case 'slap':
            return { feedback: DELAY_FEEDBACK.tape, filterFreq: DELAY_FILTER_FREQ.tape }
        case 'pingpong':
            return { feedback: DELAY_FEEDBACK.analog, filterFreq: DELAY_FILTER_FREQ.analog }
        case 'tape':
        default:
            return { feedback: DELAY_FEEDBACK.digital, filterFreq: DELAY_FILTER_FREQ.digital }
    }
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
