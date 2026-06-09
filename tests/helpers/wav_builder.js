/**
 * Synthetic WAV builder for tests.
 *
 * Generates WAV files with known audio content (sine wave bursts at
 * precise sample positions) for testing audio analysis pipelines.
 *
 * Usage:
 *   import { buildWav, buildWavFromOnsets } from './helpers/wav_builder.js'
 *
 *   // Build a WAV with a 440 Hz sine burst at sample 44100
 *   const wav = buildWav({ sampleRate: 44100, onsets: [{ sample: 44100, freq: 440, duration: 0.05 }] })
 *
 *   // Build from logical positions (seconds)
 *   const wav = buildWavFromOnsets({ bpm: 120, onsets: [{ time: 0, freq: 440 }, { time: 0.5, freq: 880 }] })
 */

import { bufferToWav } from '../../src/audio/export/wav_encoder.js'

const DEFAULT_SAMPLE_RATE = 44100

/**
 * Create a sine wave burst at a specific sample position.
 *
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} totalSamples - Total number of samples in the buffer
 * @param {number} startSample - Start position of the burst
 * @param {number} freq - Frequency of the sine wave in Hz
 * @param {number} duration - Duration of the burst in seconds
 * @param {number} amplitude - Peak amplitude (0..1)
 * @returns {Float32Array} - The burst signal (same length as totalSamples, zero-padded)
 */
function createBurst(sampleRate, totalSamples, startSample, freq, duration, amplitude) {
    const signal = new Float32Array(totalSamples)
    const burstLength = Math.floor(duration * sampleRate)
    const endSample = Math.min(startSample + burstLength, totalSamples)
    const attackSamples = Math.min(Math.floor(0.002 * sampleRate), burstLength) // 2ms attack

    for (let i = startSample; i < endSample; i++) {
        const t = (i - startSample) / sampleRate
        const relIndex = i - startSample
        // Sharp attack, then exponential decay
        const attack = relIndex < attackSamples ? relIndex / attackSamples : 1
        const decay = Math.exp(-t * 15)
        signal[i] = amplitude * attack * Math.sin(2 * Math.PI * freq * t) * decay
    }

    return signal
}

/**
 * Build a WAV file (Uint8Array) from synthetic audio content.
 *
 * @param {Object} options
 * @param {number} [options.sampleRate=44100] - Sample rate
 * @param {number} [options.duration] - Total duration in seconds (auto-computed if not set)
 * @param {number} [options.channels=1] - Number of channels (1=mono, 2=stereo)
 * @param {Array<{ sample: number, freq?: number, duration?: number, amplitude?: number }>} options.onsets
 *   Array of onset positions. Each onset creates a sine wave burst at the given sample index.
 *   - sample: start sample position
 *   - freq: frequency in Hz (default 440)
 *   - duration: burst duration in seconds (default 0.05)
 *   - amplitude: peak amplitude 0..1 (default 0.8)
 * @returns {Uint8Array} - Complete WAV file as bytes
 */
export async function buildWav(options) {
    const {
        sampleRate = DEFAULT_SAMPLE_RATE,
        channels = 1,
        onsets = [],
        duration,
    } = options

    // Compute total samples
    let totalSamples
    if (duration) {
        totalSamples = Math.ceil(duration * sampleRate)
    } else {
        // Auto-compute from last onset
        const lastOnset = onsets.reduce((max, o) => Math.max(max, o.sample), 0)
        totalSamples = lastOnset + sampleRate // 1 second after last onset
    }

    // Mix all bursts into a single mono signal
    const monoSignal = new Float32Array(totalSamples)
    for (const onset of onsets) {
        const freq = onset.freq ?? 440
        const dur = onset.duration ?? 0.05
        const amp = onset.amplitude ?? 0.8
        const burst = createBurst(sampleRate, totalSamples, onset.sample, freq, dur, amp)
        for (let i = 0; i < totalSamples; i++) {
            monoSignal[i] += burst[i]
        }
    }

    // Clamp to [-1, 1]
    for (let i = 0; i < totalSamples; i++) {
        monoSignal[i] = Math.max(-1, Math.min(1, monoSignal[i]))
    }

    // Build channels array
    const channelData = []
    if (channels === 1) {
        channelData.push(monoSignal)
    } else {
        // Stereo: copy mono to both channels
        channelData.push(new Float32Array(monoSignal))
        channelData.push(new Float32Array(monoSignal))
    }

    // Create AudioBuffer-like object and encode to WAV
    const audioBuffer = {
        numberOfChannels: channels,
        length: totalSamples,
        sampleRate,
        getChannelData: (ch) => channelData[ch],
    }

    const blob = bufferToWav(audioBuffer)

    // Convert Blob to Uint8Array
    return await blobToArrayBuffer(blob)
}

/**
 * Build a WAV file from onset positions specified in seconds.
 *
 * @param {Object} options
 * @param {number} options.bpm - BPM for time calculations
 * @param {number} [options.sampleRate=44100] - Sample rate
 * @param {Array<{ time: number, freq?: number, duration?: number, amplitude?: number }>} options.onsets
 *   Array of onset positions in seconds.
 * @returns {Uint8Array} - Complete WAV file as bytes
 */
export async function buildWavFromOnsets(options) {
    const { bpm, sampleRate = DEFAULT_SAMPLE_RATE, onsets = [], ...rest } = options

    const sampleOnsets = onsets.map(o => ({
        ...o,
        sample: Math.round(o.time * sampleRate),
    }))

    return buildWav({ sampleRate, onsets: sampleOnsets, ...rest })
}

/**
 * Build a WAV file simulating a drum pattern at specific step positions.
 *
 * @param {Object} options
 * @param {number} options.bpm - BPM
 * @param {number} [options.ticksPerBar=32] - Ticks per bar (orDrumbox uses 32)
 * @param {number} [options.sampleRate=44100] - Sample rate
 * @param {Array<{ tick: number, freq?: number, duration?: number, amplitude?: number }>} options.onsets
 *   Array of onset positions in engine ticks.
 * @returns {Uint8Array} - Complete WAV file as bytes
 */
export async function buildWavFromTicks(options) {
    const { bpm, ticksPerBar = 32, sampleRate = DEFAULT_SAMPLE_RATE, onsets = [], ...rest } = options

    // Convert ticks to seconds: tickTime = (60 * 4) / (bpm * ticksPerBar) * 0.25
    const tickTime = (60 * 4) / (bpm * ticksPerBar) * 0.25

    const sampleOnsets = onsets.map(o => ({
        ...o,
        sample: Math.round(o.tick * tickTime * sampleRate),
    }))

    return buildWav({ sampleRate, onsets: sampleOnsets, ...rest })
}

/**
 * Convert a Blob to Uint8Array (for Node.js / jsdom environments).
 *
 * @param {Blob} blob
 * @returns {Promise<Uint8Array>}
 */
async function blobToArrayBuffer(blob) {
    if (typeof blob.arrayBuffer === 'function') {
        const ab = await blob.arrayBuffer()
        return new Uint8Array(ab)
    }
    // Fallback: read via FileReader (jsdom)
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(new Uint8Array(reader.result))
        reader.onerror = reject
        reader.readAsArrayBuffer(blob)
    })
}
