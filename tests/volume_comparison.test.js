/**
 * Functional test: renders sample-only and synth-only patterns through the
 * real orDrumbox audio pipeline, then compares peak and RMS levels.
 *
 * Uses node-web-audio-api for real OfflineAudioContext + AudioWorklet rendering.
 */
import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'fs'
import nodeWaa from 'node-web-audio-api'
import MfAudioAnalyze from '../src/audio/analyze.js'
import { bufferToWav } from '../src/audio/export/wav_encoder.js'

const { OfflineAudioContext, AudioWorkletNode } = nodeWaa
const SAMPLE_RATE = 44100
const analyzer = new MfAudioAnalyze()

globalThis.OfflineAudioContext = OfflineAudioContext
globalThis.AudioWorkletNode = AudioWorkletNode

function computePeakRms(samples) {
    let peak = 0
    let sumSq = 0
    for (let i = 0; i < samples.length; i++) {
        const abs = Math.abs(samples[i])
        if (abs > peak) peak = abs
        sumSq += samples[i] * samples[i]
    }
    const rms = Math.sqrt(sumSq / samples.length)
    return { peak, rms }
}

function decodeWavBlob(blob) {
    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)

    let offset = 12
    let sampleRate = 0
    let numberOfChannels = 0
    let bitsPerSample = 0
    let dataOffset = -1
    let dataSize = 0

    while (offset + 8 <= view.byteLength) {
        const chunkId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
        const chunkSize = view.getUint32(offset + 4, true)
        const chunkDataOffset = offset + 8

        if (chunkId === 'fmt ') {
            numberOfChannels = view.getUint16(chunkDataOffset + 2, true)
            sampleRate = view.getUint32(chunkDataOffset + 4, true)
            bitsPerSample = view.getUint16(chunkDataOffset + 14, true)
        } else if (chunkId === 'data') {
            dataOffset = chunkDataOffset
            dataSize = chunkSize
            break
        }
        offset = chunkDataOffset + chunkSize
    }

    if (dataOffset < 0) throw new Error('No data chunk found')

    const channels = []
    const bytesPerSample = bitsPerSample / 8
    const numSamples = Math.floor(dataSize / (bytesPerSample * numberOfChannels))

    for (let ch = 0; ch < numberOfChannels; ch++) {
        const channelData = new Float32Array(numSamples)
        for (let i = 0; i < numSamples; i++) {
            const byteOffset = dataOffset + (i * numberOfChannels + ch) * bytesPerSample
            if (bitsPerSample === 16) {
                channelData[i] = view.getInt16(byteOffset, true) / 32768
            } else if (bitsPerSample === 32) {
                channelData[i] = view.getFloat32(byteOffset, true)
            }
        }
        channels.push(channelData)
    }

    return { sampleRate, numberOfChannels, channels, bitsPerSample }
}

async function renderPattern(pattern, sounds, generatedSounds) {
    const { default: MfWavExporter } = await import('../src/audio/export/wav_exporter.js')
    const { soundRegistry } = await import('../src/state/sound_registry.js')
    const { serviceRegistry } = await import('../src/state/service_registry.js')
    const patternsManager = await import('../src/patterns/manager.js')

    soundRegistry.reset()
    serviceRegistry.reset()
    serviceRegistry.mfPatterns = patternsManager

    Object.assign(soundRegistry.sounds, sounds)
    Object.assign(soundRegistry.generatedSounds, generatedSounds)

    const exporter = new MfWavExporter()
    const blob = await exporter.exportPatternToWav(pattern, 1)

    const ab = await blob.arrayBuffer()
    return new Uint8Array(ab)
}

describe('volume comparison — sample vs synth', () => {
    it('sample-only and synth-only patterns produce comparable peak and RMS levels', async () => {
        const bpm = 120
        const nbBeats = 1
        const velocity = 0.8

        const bufLength = Math.floor(SAMPLE_RATE * 0.5)
        const tmpCtx = new OfflineAudioContext(1, bufLength, SAMPLE_RATE)
        const realBuffer = tmpCtx.createBuffer(1, bufLength, SAMPLE_RATE)
        const ch = realBuffer.getChannelData(0)
        for (let i = 0; i < bufLength; i++) {
            ch[i] = Math.sin(2 * Math.PI * 100 * i / SAMPLE_RATE) *
                     Math.exp(-i / (SAMPLE_RATE * 0.05))
        }

        const sounds = {
            'kick.wav': { url: 'kick.wav', buffer: realBuffer, key: 'KICK' },
        }

        const generatedSounds = {
            BASS1: {
                masterVolume: 0.35,
                slide: 0,
                vco1: { wave: 'sine', octave: 0, detune: 0, gain: 0.8 },
                vco2: { wave: 'triangle', octave: 0, detune: 0, gain: 0.4 },
                vco3: { wave: 'sawtooth', octave: 0, detune: 0, gain: 0.15 },
                enveloppe: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.2 },
                filter: { type: 'lowpass', freq: 320, Q: 1, filterEnvelopeAmount: 0 },
                noise: { mix: 0, filterType: 'highpass', filterFreq: 1000, filterQ: 1 },
                lfo: { wave: 'sine', freq: 0, depth: 0, target: 'NOT' },
            },
        }

        const makeTrack = (overrides) => ({
            name: 'KICK',
            nbBeats: 1,
            stepsPerBeat: 16,
            mute: false,
            velocity,
            pan: 0,
            filterType: 'allpass',
            filterFreq: 1000,
            filterQ: 0,
            sat: false,
            reverbOn: false,
            delayOn: false,
            ...overrides,
        })

        const notes = [
            { beat: 0, beatStep: 0, velocity, pitch: 0 },
            { beat: 0, beatStep: 8, velocity, pitch: 0 },
            { beat: 0, beatStep: 16, velocity, pitch: 0 },
            { beat: 0, beatStep: 24, velocity, pitch: 0 },
        ]

        const samplePattern = {
            name: 'Sample Test',
            bpm,
            nbBeats,
            tracks: [
                makeTrack({
                    name: 'KICK',
                    soundId: 'kick.wav',
                    useSoftSynth: false,
                    synthSoundKey: null,
                    notes,
                }),
            ],
        }

        const synthPattern = {
            name: 'Synth Test',
            bpm,
            nbBeats,
            tracks: [
                makeTrack({
                    name: 'BASS',
                    soundId: null,
                    useSoftSynth: true,
                    synthSoundKey: 'BASS1',
                    notes,
                }),
            ],
        }

        const sampleWavBytes = await renderPattern(samplePattern, sounds, {})
        const synthWavBytes = await renderPattern(synthPattern, {}, generatedSounds)

        const outDir = '/tmp/ordrumbox-volume-test'
        try { mkdirSync(outDir, { recursive: true }) } catch (_) {}
        writeFileSync(`${outDir}/sample.wav`, sampleWavBytes)
        writeFileSync(`${outDir}/synth.wav`, synthWavBytes)
        console.log(`[VOLUME] WAV files written to ${outDir}/`)

        const sampleDecoded = decodeWavBlob(sampleWavBytes)
        const synthDecoded = decodeWavBlob(synthWavBytes)

        const sampleMono = analyzer.mixToMono(sampleDecoded.channels)
        const synthMono = analyzer.mixToMono(synthDecoded.channels)

        const sampleMetrics = computePeakRms(sampleMono)
        const synthMetrics = computePeakRms(synthMono)

        console.log(`[VOLUME] Sample — peak: ${sampleMetrics.peak.toFixed(4)}, RMS: ${sampleMetrics.rms.toFixed(4)}`)
        console.log(`[VOLUME] Synth  — peak: ${synthMetrics.peak.toFixed(4)}, RMS: ${synthMetrics.rms.toFixed(4)}`)

        const peakRatio = synthMetrics.peak / sampleMetrics.peak
        const rmsRatio = synthMetrics.rms / sampleMetrics.rms
        const peakDbDiff = 20 * Math.log10(peakRatio)
        const rmsDbDiff = 20 * Math.log10(rmsRatio)

        console.log(`[VOLUME] Peak ratio (synth/sample): ${peakRatio.toFixed(3)} (${peakDbDiff.toFixed(1)} dB)`)
        console.log(`[VOLUME] RMS ratio  (synth/sample): ${rmsRatio.toFixed(3)} (${rmsDbDiff.toFixed(1)} dB)`)

        expect(sampleMetrics.peak).toBeGreaterThan(0.01)
        expect(synthMetrics.peak).toBeGreaterThan(0.01)
        expect(sampleMetrics.rms).toBeGreaterThan(0.001)
        expect(synthMetrics.rms).toBeGreaterThan(0.001)

        expect(peakDbDiff).toBeGreaterThan(-12)
        expect(peakDbDiff).toBeLessThan(12)
        expect(rmsDbDiff).toBeGreaterThan(-12)
        expect(rmsDbDiff).toBeLessThan(12)
    })
})
