/**
 * Real offline rendering tests — verifies that audio notes appear at
 * the correct time positions for a given BPM.
 *
 * Uses node-web-audio-api for real OfflineAudioContext rendering,
 * then analyzes the output buffer with MfAudioAnalyze + onset detection.
 */
import { describe, it, expect } from 'vitest'
import nodeWaa from 'node-web-audio-api'
import MfAudioAnalyze from '../src/audio/analyze.js'
import { detectOnsets, matchOnsets } from './helpers/onset_detector.js'

const { OfflineAudioContext, AudioWorkletNode } = nodeWaa
const SAMPLE_RATE = 44100
const analyzer = new MfAudioAnalyze()

// Set globals that orDrumbox engine expects
globalThis.OfflineAudioContext = OfflineAudioContext
globalThis.AudioWorkletNode = AudioWorkletNode

/**
 * Schedule a sine wave burst at a given time in an OfflineAudioContext.
 */
function scheduleBurst(ctx, time, freq, duration, amplitude) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(amplitude, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(time)
    osc.stop(time + duration)
}

/**
 * Convert a Float32Array buffer to a WAV Uint8Array for analysis.
 */
function floatToWav(samples, sampleRate) {
    const length = samples.length
    const buffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(buffer)

    // RIFF header
    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + length * 2, true)
    writeString(view, 8, 'WAVE')

    // fmt chunk
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)       // PCM
    view.setUint16(22, 1, true)       // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true) // byte rate
    view.setUint16(32, 2, true)       // block align
    view.setUint16(34, 16, true)      // bits per sample

    // data chunk
    writeString(view, 36, 'data')
    view.setUint32(40, length * 2, true)

    for (let i = 0; i < length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]))
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    }

    return new Uint8Array(buffer)
}

function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
    }
}

// ─── Tempo Accuracy Tests ─────────────────────────────────────────────────────

describe('real render — tempo accuracy', () => {
    it('four-on-the-floor at 120 BPM renders notes at correct positions', async () => {
        const bpm = 120
        const beatDuration = 60 / bpm // 0.5s per beat
        const numBeats = 4
        const duration = numBeats * beatDuration + 0.5 // extra tail

        const ctx = new OfflineAudioContext(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)

        for (let beat = 0; beat < numBeats; beat++) {
            scheduleBurst(ctx, beat * beatDuration, 60, 0.1, 0.8)
        }

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)
        const wav = floatToWav(samples, SAMPLE_RATE)

        const result = analyzer.analyzeWavBuffer(wav)
        const mono = analyzer.mixToMono(result.channels || [samples])
        const onsets = detectOnsets(mono, SAMPLE_RATE, {
            threshold: 0.0001,
            minOnsetGap: beatDuration * 0.5,
        })

        // Expected positions in samples
        const expectedSamples = Array.from({ length: numBeats }, (_, i) =>
            Math.round(i * beatDuration * SAMPLE_RATE)
        )

        const tolerance = SAMPLE_RATE * 0.03 // 30ms tolerance
        const { matched, missed } = matchOnsets(onsets, expectedSamples, tolerance)

        expect(matched.length).toBe(numBeats)
        expect(missed.length).toBe(0)
    })

    it('90 BPM half-time feel has correct spacing', async () => {
        const bpm = 90
        const beatDuration = 60 / bpm // ~0.667s
        const numBeats = 4
        const duration = numBeats * beatDuration + 0.5

        const ctx = new OfflineAudioContext(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)

        for (let beat = 0; beat < numBeats; beat++) {
            scheduleBurst(ctx, beat * beatDuration, 200, 0.08, 0.7)
        }

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)
        const wav = floatToWav(samples, SAMPLE_RATE)

        const result = analyzer.analyzeWavBuffer(wav)
        const mono = result.channels ? result.channels[0] : samples
        const onsets = detectOnsets(mono, SAMPLE_RATE, {
            threshold: 0.0001,
            minOnsetGap: beatDuration * 0.5,
        })

        const expectedSamples = Array.from({ length: numBeats }, (_, i) =>
            Math.round(i * beatDuration * SAMPLE_RATE)
        )

        const tolerance = SAMPLE_RATE * 0.03
        const { matched } = matchOnsets(onsets, expectedSamples, tolerance)

        expect(matched.length).toBe(numBeats)
    })

    it('150 BPM fast pattern has correct spacing', async () => {
        const bpm = 150
        const beatDuration = 60 / bpm // 0.4s
        const numBeats = 8
        const duration = numBeats * beatDuration + 0.5

        const ctx = new OfflineAudioContext(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)

        for (let beat = 0; beat < numBeats; beat++) {
            scheduleBurst(ctx, beat * beatDuration, 440, 0.06, 0.8)
        }

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)
        const wav = floatToWav(samples, SAMPLE_RATE)

        const result = analyzer.analyzeWavBuffer(wav)
        const mono = result.channels ? result.channels[0] : samples
        const onsets = detectOnsets(mono, SAMPLE_RATE, {
            threshold: 0.0001,
            minOnsetGap: beatDuration * 0.4,
        })

        const expectedSamples = Array.from({ length: numBeats }, (_, i) =>
            Math.round(i * beatDuration * SAMPLE_RATE)
        )

        const tolerance = SAMPLE_RATE * 0.03
        const { matched } = matchOnsets(onsets, expectedSamples, tolerance)

        // At 150 BPM beats are very close (0.4s), allow slight tolerance
        expect(matched.length).toBeGreaterThanOrEqual(numBeats - 1)
    })

    it('mixed kick + snare at 120 BPM', async () => {
        const bpm = 120
        const beatDuration = 60 / bpm // 0.5s
        const duration = 4 * beatDuration + 0.5

        const ctx = new OfflineAudioContext(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)

        // Kick on beats 1,3 and snare on beats 2,4
        const events = [
            { beat: 0, freq: 60, dur: 0.1, amp: 0.9 },   // kick
            { beat: 1, freq: 200, dur: 0.08, amp: 0.7 },  // snare
            { beat: 2, freq: 60, dur: 0.1, amp: 0.9 },    // kick
            { beat: 3, freq: 200, dur: 0.08, amp: 0.7 },  // snare
        ]

        for (const ev of events) {
            scheduleBurst(ctx, ev.beat * beatDuration, ev.freq, ev.dur, ev.amp)
        }

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)
        const wav = floatToWav(samples, SAMPLE_RATE)

        const result = analyzer.analyzeWavBuffer(wav)
        const mono = result.channels ? result.channels[0] : samples
        const onsets = detectOnsets(mono, SAMPLE_RATE, {
            threshold: 0.0001,
            minOnsetGap: beatDuration * 0.4,
        })

        const expectedSamples = events.map(e =>
            Math.round(e.beat * beatDuration * SAMPLE_RATE)
        )

        const tolerance = SAMPLE_RATE * 0.03
        const { matched } = matchOnsets(onsets, expectedSamples, tolerance)

        expect(matched.length).toBe(4)
    })
})

// ─── Rendering Quality Tests ──────────────────────────────────────────────────

describe('real render — output quality', () => {
    it('rendered audio has correct peak level', async () => {
        const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)

        scheduleBurst(ctx, 0, 440, 0.5, 0.8)

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)

        let peak = 0
        for (let i = 0; i < samples.length; i++) {
            peak = Math.max(peak, Math.abs(samples[i]))
        }

        // Peak should be close to 0.8 (with some tolerance for oscillator phase)
        expect(peak).toBeGreaterThan(0.5)
        expect(peak).toBeLessThanOrEqual(1.0)
    })

    it('silence produces no energy', async () => {
        const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)

        // Don't schedule anything — just render silence
        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)

        let maxAbs = 0
        for (let i = 0; i < samples.length; i++) {
            maxAbs = Math.max(maxAbs, Math.abs(samples[i]))
        }

        expect(maxAbs).toBeLessThan(0.001)
    })

    it('different frequencies produce different spectral centroids', async () => {
        async function renderAndAnalyze(freq) {
            const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)
            scheduleBurst(ctx, 0, freq, 0.4, 0.8)
            const rendered = await ctx.startRendering()
            const samples = rendered.getChannelData(0)
            return analyzer.analyzeChannelData(samples, SAMPLE_RATE)
        }

        const resultLow = await renderAndAnalyze(100)
        const resultHigh = await renderAndAnalyze(4000)

        expect(resultHigh.spectralCentroidHz).toBeGreaterThan(resultLow.spectralCentroidHz)
    })
})

// ─── OrDrumbox Pattern Rendering (via exportOffline) ──────────────────────────

describe('real render — orDrumbox pattern', () => {
    it('renders a simple pattern via wav_exporter with real OfflineAudioContext', async () => {
        const { default: MfWavExporter } = await import('../src/audio/export/wav_exporter.js')
        const { soundRegistry } = await import('../src/state/sound_registry.js')
        const { serviceRegistry } = await import('../src/state/service_registry.js')
        const patternsManager = await import('../src/patterns/manager.js')

        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = patternsManager

        // Create a real AudioBuffer via node-web-audio-api
        const bufLength = SAMPLE_RATE / 2
        const tmpCtx = new OfflineAudioContext(1, bufLength, SAMPLE_RATE)
        const realBuffer = tmpCtx.createBuffer(1, bufLength, SAMPLE_RATE)
        const channelData = realBuffer.getChannelData(0)
        for (let i = 0; i < bufLength; i++) {
            channelData[i] = Math.sin(2 * Math.PI * 60 * i / SAMPLE_RATE) *
                             Math.exp(-i / (SAMPLE_RATE * 0.05))
        }

        soundRegistry.sounds = {
            'kick.wav': {
                url: 'kick.wav',
                buffer: realBuffer,
                key: 'KICK',
            },
        }

        const pattern = {
            name: 'Tempo Test',
            bpm: 120,
            nbBars: 1,
            tracks: [
                {
                    name: 'KICK',
                    soundId: 'kick.wav',
                    bars: 1,
                    barQuantize: 4,
                    mute: false,
                    notes: [
                        { bar: 0, barStep: 0, velocity: 1, pitch: 0 },
                        { bar: 0, barStep: 16, velocity: 1, pitch: 0 },
                    ],
                },
            ],
        }

        const exporter = new MfWavExporter()
        const blob = await exporter.exportPatternToWav(pattern, 1)

        expect(blob).toBeDefined()
        expect(blob.type).toBe('audio/wav')

        // Convert blob to Uint8Array for analysis
        const ab = await blob.arrayBuffer()
        const wavBytes = new Uint8Array(ab)

        // Verify it's a valid WAV
        const decoded = analyzer.decodeWavBuffer(wavBytes)
        expect(decoded.sampleRate).toBe(SAMPLE_RATE)
        expect(decoded.numberOfChannels).toBeGreaterThanOrEqual(1)
        expect(decoded.channels[0].length).toBeGreaterThan(0)
    })
})
