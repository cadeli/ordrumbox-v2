/**
 * Onset detector for WAV audio analysis.
 *
 * Detects note onsets in WAV audio using energy-based onset detection
 * on the amplitude envelope. Works with the MfAudioAnalyze class.
 *
 * Usage:
 *   import { detectOnsets, detectOnsetsFromWav } from './helpers/onset_detector.js'
 *   import MfAudioAnalyze from '../src/audio/analyze.js'
 *
 *   const analyzer = new MfAudioAnalyze()
 *   const onsets = detectOnsetsFromWav(analyzer, wavBytes, { sampleRate: 44100 })
 *   // → [{ sample: 44100, time: 1.0, energy: 0.8 }]
 */

import MfAudioAnalyze from '../../src/audio/analyze.js'

/**
 * Detect onsets from raw Float32Array audio data using energy-based detection.
 *
 * @param {Float32Array} samples - Mono audio samples
 * @param {number} sampleRate - Sample rate in Hz
 * @param {Object} [options]
 * @param {number} [options.windowSize=256] - Analysis window size in samples
 * @param {number} [options.hopSize=128] - Hop size between windows
 * @param {number} [options.threshold=0.001] - Energy threshold for onset detection
 * @param {number} [options.minOnsetGap=0.02] - Minimum gap between onsets in seconds
 * @returns {Array<{ sample: number, time: number, energy: number }>} - Detected onsets
 */
export function detectOnsets(samples, sampleRate, options = {}) {
    const {
        windowSize = 256,
        hopSize = 128,
        threshold = 0.001,
        minOnsetGap = 0.02,
    } = options

    const minOnsetSamples = Math.floor(minOnsetGap * sampleRate)
    const onsets = []
    let lastOnsetSample = -Infinity

    // Compute energy per window
    const numWindows = Math.floor((samples.length - windowSize) / hopSize) + 1
    if (numWindows < 1) return onsets

    const energies = new Float64Array(numWindows)

    for (let w = 0; w < numWindows; w++) {
        const offset = w * hopSize
        let energy = 0
        for (let i = 0; i < windowSize && offset + i < samples.length; i++) {
            const s = samples[offset + i]
            energy += s * s
        }
        energies[w] = energy / windowSize
    }

    // Find local maxima: windows where energy is above threshold and
    // higher than both neighbors (or at boundary)
    for (let w = 0; w < numWindows; w++) {
        if (energies[w] < threshold) continue

        const isLocalMax = (w === 0 || energies[w] >= energies[w - 1]) &&
                           (w === numWindows - 1 || energies[w] >= energies[w + 1])

        if (isLocalMax) {
            const onsetSample = w * hopSize

            if (onsetSample - lastOnsetSample >= minOnsetSamples) {
                onsets.push({
                    sample: onsetSample,
                    time: onsetSample / sampleRate,
                    energy: energies[w],
                })
                lastOnsetSample = onsetSample
            }
        }
    }

    return onsets
}

/**
 * Detect onsets from a WAV file (Uint8Array) using MfAudioAnalyze for decoding.
 *
 * @param {MfAudioAnalyze} analyzer - Instance of MfAudioAnalyze
 * @param {Uint8Array} wavBytes - Complete WAV file as bytes
 * @param {Object} [options]
 * @param {number} [options.windowSize=1024] - Analysis window size
 * @param {number} [options.hopSize=512] - Hop size between windows
 * @param {number} [options.threshold=0.05] - Energy threshold
 * @param {number} [options.minOnsetGap=0.02] - Minimum gap between onsets in seconds
 * @returns {{ onsets: Array<{ sample: number, time: number, energy: number }>, decoded: Object }}
 *   Detected onsets plus the decoded WAV metadata
 */
export function detectOnsetsFromWav(analyzer, wavBytes, options = {}) {
    const decoded = analyzer.decodeWavBuffer(wavBytes)
    const mono = analyzer.mixToMono(decoded.channels)

    const onsets = detectOnsets(mono, decoded.sampleRate, options)

    return {
        onsets,
        decoded: {
            sampleRate: decoded.sampleRate,
            numberOfChannels: decoded.numberOfChannels,
            bitsPerSample: decoded.bitsPerSample,
            duration: mono.length / decoded.sampleRate,
        },
    }
}

/**
 * Find the nearest onset to an expected position.
 *
 * @param {Array<{ sample: number, time: number, energy: number }>} detectedOnsets
 * @param {number} expectedSample - Expected sample position
 * @param {number} toleranceSamples - Tolerance in samples
 * @returns {{ sample: number, time: number, energy: number } | null} - Nearest onset or null
 */
export function findNearestOnset(detectedOnsets, expectedSample, toleranceSamples) {
    let best = null
    let bestDist = Infinity

    for (const onset of detectedOnsets) {
        const dist = Math.abs(onset.sample - expectedSample)
        if (dist < bestDist && dist <= toleranceSamples) {
            bestDist = dist
            best = onset
        }
    }

    return best
}

/**
 * Verify that expected onsets are present in detected onsets.
 *
 * @param {Array<{ sample: number }>} detectedOnsets - Detected onset positions
 * @param {number[]} expectedSamples - Expected sample positions
 * @param {number} toleranceSamples - Tolerance in samples for matching
 * @returns {{ matched: number[], missed: number[], extra: number[] }}
 *   - matched: expected positions that were found
 *   - missed: expected positions not found
 *   - extra: detected positions not matching any expected
 */
export function matchOnsets(detectedOnsets, expectedSamples, toleranceSamples) {
    const matched = []
    const missed = []
    const extra = []

    const usedDetected = new Set()

    for (const expected of expectedSamples) {
        let found = false
        for (let i = 0; i < detectedOnsets.length; i++) {
            if (usedDetected.has(i)) continue
            if (Math.abs(detectedOnsets[i].sample - expected) <= toleranceSamples) {
                matched.push(expected)
                usedDetected.add(i)
                found = true
                break
            }
        }
        if (!found) {
            missed.push(expected)
        }
    }

    for (let i = 0; i < detectedOnsets.length; i++) {
        if (!usedDetected.has(i)) {
            extra.push(detectedOnsets[i].sample)
        }
    }

    return { matched, missed, extra }
}
