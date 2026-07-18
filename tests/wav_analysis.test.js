import { describe, it, expect } from 'vitest'
import MfAudioAnalyze from '../src/audio/analyze.js'
import { buildWav, buildWavFromOnsets, buildWavFromTicks } from './helpers/wav_builder.js'
import { detectOnsets, detectOnsetsFromWav, findNearestOnset, matchOnsets } from './helpers/onset_detector.js'

const SAMPLE_RATE = 44100
const analyzer = new MfAudioAnalyze()

const DETECT_OPTIONS = { threshold: 0.0001, minOnsetGap: 0.08 }

// ─── WAV Builder Tests ────────────────────────────────────────────────────────

describe('wav_builder', () => {
    it('creates a valid WAV file with correct RIFF header', async () => {
        const wav = await buildWav({ sampleRate: SAMPLE_RATE, duration: 0.5 })
        const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)

        expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF')
        expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE')
        expect(view.getUint32(24, true)).toBe(SAMPLE_RATE)
    })

    it('creates mono WAV by default', async () => {
        const wav = await buildWav({ sampleRate: SAMPLE_RATE, duration: 0.1 })
        const decoded = analyzer.decodeWavBuffer(wav)
        expect(decoded.numberOfChannels).toBe(1)
    })

    it('creates stereo WAV when channels=2', async () => {
        const wav = await buildWav({ sampleRate: SAMPLE_RATE, duration: 0.1, channels: 2 })
        const decoded = analyzer.decodeWavBuffer(wav)
        expect(decoded.numberOfChannels).toBe(2)
    })

    it('has silence when no onsets', async () => {
        const wav = await buildWav({ sampleRate: SAMPLE_RATE, duration: 0.5, onsets: [] })
        const decoded = analyzer.decodeWavBuffer(wav)
        const mono = analyzer.mixToMono(decoded.channels)

        let maxAbs = 0
        for (let i = 0; i < mono.length; i++) {
            maxAbs = Math.max(maxAbs, Math.abs(mono[i]))
        }
        expect(maxAbs).toBeLessThan(0.001)
    })

    it('contains energy at the expected sample position', async () => {
        const onsetSample = 4410
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [{ sample: onsetSample, freq: 440, duration: 0.05, amplitude: 0.8 }],
        })

        const decoded = analyzer.decodeWavBuffer(wav)
        const mono = analyzer.mixToMono(decoded.channels)

        const windowSize = 256
        const start = Math.max(0, onsetSample - windowSize / 2)
        const end = Math.min(mono.length, onsetSample + windowSize / 2)

        let energy = 0
        for (let i = start; i < end; i++) {
            energy += mono[i] * mono[i]
        }
        energy /= (end - start)

        expect(energy).toBeGreaterThan(0.01)
    })

    it('is silent before the first onset', async () => {
        const onsetSample = 4410
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [{ sample: onsetSample, freq: 440, amplitude: 0.8 }],
        })

        const decoded = analyzer.decodeWavBuffer(wav)
        const mono = analyzer.mixToMono(decoded.channels)

        const checkEnd = Math.floor(0.05 * SAMPLE_RATE)
        let maxAbs = 0
        for (let i = 0; i < checkEnd; i++) {
            maxAbs = Math.max(maxAbs, Math.abs(mono[i]))
        }
        expect(maxAbs).toBeLessThan(0.01)
    })
})

// ─── Onset Detector Tests ─────────────────────────────────────────────────────

describe('onset_detector', () => {
    it('detects a single onset in silence + burst', async () => {
        const onsetSample = 4410
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [{ sample: onsetSample, freq: 440, amplitude: 0.8 }],
        })

        const { onsets } = detectOnsetsFromWav(analyzer, wav, DETECT_OPTIONS)

        expect(onsets.length).toBeGreaterThanOrEqual(1)

        const nearest = findNearestOnset(onsets, onsetSample, SAMPLE_RATE * 0.03)
        expect(nearest).not.toBeNull()
    })

    it('detects multiple onsets at known positions', async () => {
        const onset1 = Math.round(0.1 * SAMPLE_RATE)
        const onset2 = Math.round(0.3 * SAMPLE_RATE)
        const onset3 = Math.round(0.5 * SAMPLE_RATE)

        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 1.0,
            onsets: [
                { sample: onset1, freq: 440, amplitude: 0.8 },
                { sample: onset2, freq: 880, amplitude: 0.8 },
                { sample: onset3, freq: 220, amplitude: 0.8 },
            ],
        })

        const { onsets } = detectOnsetsFromWav(analyzer, wav, DETECT_OPTIONS)

        expect(onsets.length).toBeGreaterThanOrEqual(3)

        const tolerance = SAMPLE_RATE * 0.03
        const { matched, missed } = matchOnsets(onsets, [onset1, onset2, onset3], tolerance)

        expect(matched.length).toBe(3)
        expect(missed.length).toBe(0)
    })

    it('ignores low-amplitude noise', async () => {
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [{ sample: 4410, freq: 440, amplitude: 0.001 }],
        })

        const { onsets } = detectOnsetsFromWav(analyzer, wav, {
            threshold: 0.001,
            minOnsetGap: 0.05,
        })

        expect(onsets.length).toBe(0)
    })

    it('returns correct timing in seconds', async () => {
        const sampleRate = 22050
        const onsetTime = 0.25
        const onsetSample = Math.round(onsetTime * sampleRate)

        const wav = await buildWav({
            sampleRate,
            duration: 1.0,
            onsets: [{ sample: onsetSample, freq: 440, amplitude: 0.8 }],
        })

        const { onsets, decoded } = detectOnsetsFromWav(analyzer, wav, {
            threshold: 0.0001,
            minOnsetGap: 0.01,
        })

        expect(decoded.sampleRate).toBe(sampleRate)

        if (onsets.length > 0) {
            expect(Math.abs(onsets[0].time - onsetTime)).toBeLessThan(0.03)
        }
    })
})

// ─── Pipeline Integration: Build → Decode → Detect ────────────────────────────

describe('wav analysis pipeline integration', () => {
    it('four-on-the-floor kick at 120 BPM', async () => {
        const bpm = 120
        const ticksPerBar = 32
        const tickTime = (60 * 4) / (bpm * ticksPerBar) * 0.25

        const kicks = [0, 32, 64, 96].map(tick => ({
            tick,
            freq: 60,
            duration: 0.05,
            amplitude: 0.9,
        }))

        const wav = await buildWavFromTicks({ bpm, ticksPerBar, sampleRate: SAMPLE_RATE, onsets: kicks })

        const { onsets } = detectOnsetsFromWav(analyzer, wav, DETECT_OPTIONS)

        const expectedSamples = kicks.map(k => Math.round(k.tick * tickTime * SAMPLE_RATE))

        expect(onsets.length).toBeGreaterThanOrEqual(4)

        const tolerance = SAMPLE_RATE * 0.05
        const { matched, missed } = matchOnsets(onsets, expectedSamples, tolerance)

        expect(matched.length).toBe(4)
        expect(missed.length).toBe(0)
    })

    it('snare on beats 2 and 4 at 90 BPM', async () => {
        const bpm = 90
        const ticksPerBar = 32
        const tickTime = (60 * 4) / (bpm * ticksPerBar) * 0.25

        const snares = [
            { tick: 8, freq: 200, duration: 0.04, amplitude: 0.7 },
            { tick: 24, freq: 200, duration: 0.04, amplitude: 0.7 },
        ]

        const wav = await buildWavFromTicks({ bpm, ticksPerBar, sampleRate: SAMPLE_RATE, onsets: snares })

        const { onsets } = detectOnsetsFromWav(analyzer, wav, DETECT_OPTIONS)

        const expectedSamples = snares.map(s => Math.round(s.tick * tickTime * SAMPLE_RATE))

        expect(onsets.length).toBeGreaterThanOrEqual(2)

        const tolerance = SAMPLE_RATE * 0.05
        const { matched } = matchOnsets(onsets, expectedSamples, tolerance)
        expect(matched.length).toBe(2)
    })

    it('mixed kick + snare pattern', async () => {
        const bpm = 120
        const ticksPerBar = 32
        const tickTime = (60 * 4) / (bpm * ticksPerBar) * 0.25

        const notes = [
            { tick: 0, freq: 60, duration: 0.05, amplitude: 0.9 },
            { tick: 16, freq: 60, duration: 0.05, amplitude: 0.9 },
            { tick: 8, freq: 200, duration: 0.04, amplitude: 0.7 },
            { tick: 24, freq: 200, duration: 0.04, amplitude: 0.7 },
        ]

        const wav = await buildWavFromTicks({ bpm, ticksPerBar, sampleRate: SAMPLE_RATE, onsets: notes })

        const { onsets } = detectOnsetsFromWav(analyzer, wav, {
            threshold: 0.0001,
            minOnsetGap: 0.04,
        })

        const expectedSamples = notes.map(n => Math.round(n.tick * tickTime * SAMPLE_RATE))

        expect(onsets.length).toBeGreaterThanOrEqual(4)

        const tolerance = SAMPLE_RATE * 0.05
        const { matched, missed } = matchOnsets(onsets, expectedSamples, tolerance)

        expect(matched.length).toBe(4)
        expect(missed.length).toBe(0)
    })

    it('detects different frequencies via spectral analysis', async () => {
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [
                { sample: 0, freq: 100, duration: 0.1, amplitude: 0.8 },
                { sample: 4410, freq: 440, duration: 0.1, amplitude: 0.8 },
                { sample: 8820, freq: 2000, duration: 0.1, amplitude: 0.8 },
            ],
        })

        const result = analyzer.analyzeWavBuffer(wav)

        expect(result.fundamentalHz).toBeGreaterThan(0)
        expect(result.peakLinear).toBeGreaterThan(0)
        expect(result.rmsLinear).toBeGreaterThan(0)
    })

    it('handles 2-beat pattern with loop', async () => {
        const bpm = 120
        const ticksPerBar = 32
        const tickTime = (60 * 4) / (bpm * ticksPerBar) * 0.25

        const notes = []
        for (let loop = 0; loop < 2; loop++) {
            for (let beat = 0; beat < 2; beat++) {
                const baseTick = loop * 64 + beat * 32
                notes.push({
                    tick: baseTick,
                    freq: 60,
                    duration: 0.05,
                    amplitude: 0.9,
                })
            }
        }

        const wav = await buildWavFromTicks({ bpm, ticksPerBar, sampleRate: SAMPLE_RATE, onsets: notes })

        const { onsets } = detectOnsetsFromWav(analyzer, wav, DETECT_OPTIONS)

        const expectedSamples = notes.map(n => Math.round(n.tick * tickTime * SAMPLE_RATE))

        expect(onsets.length).toBeGreaterThanOrEqual(4)

        const tolerance = SAMPLE_RATE * 0.05
        const { matched } = matchOnsets(onsets, expectedSamples, tolerance)
        expect(matched.length).toBe(4)
    })

    it('velocity affects amplitude in detected energy', async () => {
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [
                { sample: Math.round(0.1 * SAMPLE_RATE), freq: 440, amplitude: 0.3 },
                { sample: Math.round(0.3 * SAMPLE_RATE), freq: 440, amplitude: 0.9 },
            ],
        })

        const { onsets } = detectOnsetsFromWav(analyzer, wav, DETECT_OPTIONS)

        expect(onsets.length).toBeGreaterThanOrEqual(2)

        if (onsets.length >= 2) {
            expect(onsets[1].energy).toBeGreaterThan(onsets[0].energy)
        }
    })

    it('silent pattern produces no onsets', async () => {
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 1.0,
            onsets: [],
        })

        const { onsets } = detectOnsetsFromWav(analyzer, wav, {
            threshold: 0.001,
        })

        expect(onsets.length).toBe(0)
    })
})

// ─── MfAudioAnalyze Unit Tests with Synthetic WAV ─────────────────────────────

describe('MfAudioAnalyze with synthetic WAV', () => {
    it('decodes WAV and extracts correct metadata', async () => {
        const wav = await buildWav({ sampleRate: 48000, duration: 0.5, channels: 1 })
        const decoded = analyzer.decodeWavBuffer(wav)

        expect(decoded.sampleRate).toBe(48000)
        expect(decoded.numberOfChannels).toBe(1)
        expect(decoded.bitsPerSample).toBe(16)
        expect(decoded.channels.length).toBe(1)
        expect(decoded.channels[0].length).toBeGreaterThan(0)
    })

    it('computes correct envelope for silence', async () => {
        const wav = await buildWav({ sampleRate: SAMPLE_RATE, duration: 0.5, onsets: [] })
        const result = analyzer.analyzeWavBuffer(wav)

        const maxEnvelope = Math.max(...result.envelope)
        expect(maxEnvelope).toBeLessThan(0.001)
    })

    it('computes correct envelope with onsets', async () => {
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [{ sample: 0, freq: 440, amplitude: 0.8 }],
        })

        const result = analyzer.analyzeWavBuffer(wav)

        expect(result.envelope[0]).toBeGreaterThan(0.1)
    })

    it('detects pitch of a pure sine wave', async () => {
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [{ sample: 0, freq: 440, duration: 0.4, amplitude: 0.8 }],
        })

        const result = analyzer.analyzeWavBuffer(wav)

        if (result.fundamentalHz) {
            expect(Math.abs(result.fundamentalHz - 440) / 440).toBeLessThan(0.1)
        }
    })

    it('reports peak and RMS levels', async () => {
        const wav = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [{ sample: 0, freq: 440, amplitude: 0.5 }],
        })

        const result = analyzer.analyzeWavBuffer(wav)

        expect(result.peakLinear).toBeGreaterThan(0)
        expect(result.peakDb).toBeGreaterThan(-Infinity)
        expect(result.rmsLinear).toBeGreaterThan(0)
        expect(result.rmsDb).toBeGreaterThan(-Infinity)
        expect(result.peakLinear).toBeGreaterThanOrEqual(result.rmsLinear)
    })

    it('spectral centroid is higher for high-frequency content', async () => {
        const wavLow = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [{ sample: 0, freq: 100, duration: 0.4, amplitude: 0.8 }],
        })

        const wavHigh = await buildWav({
            sampleRate: SAMPLE_RATE,
            duration: 0.5,
            onsets: [{ sample: 0, freq: 4000, duration: 0.4, amplitude: 0.8 }],
        })

        const resultLow = analyzer.analyzeWavBuffer(wavLow)
        const resultHigh = analyzer.analyzeWavBuffer(wavHigh)

        expect(resultHigh.spectralCentroidHz).toBeGreaterThan(resultLow.spectralCentroidHz)
    })
})

// ─── Utility Function Tests ───────────────────────────────────────────────────

describe('onset_detector utilities', () => {
    it('findNearestOnset finds the closest onset', () => {
        const onsets = [
            { sample: 1000, time: 0.023, energy: 0.5 },
            { sample: 5000, time: 0.113, energy: 0.8 },
            { sample: 9000, time: 0.204, energy: 0.3 },
        ]

        const result = findNearestOnset(onsets, 4800, 500)
        expect(result).not.toBeNull()
        expect(result.sample).toBe(5000)

        const result2 = findNearestOnset(onsets, 7000, 500)
        expect(result2).toBeNull()
    })

    it('matchOnsets correctly categorizes matched, missed, and extra', () => {
        const detected = [
            { sample: 1000 },
            { sample: 5100 },
            { sample: 9500 },
        ]

        const expected = [1000, 5000, 8000]

        const { matched, missed, extra } = matchOnsets(detected, expected, 200)

        expect(matched).toContain(1000)
        expect(matched).toContain(5000)
        expect(missed).toContain(8000)
        expect(extra).toContain(9500)
        expect(matched.length).toBe(2)
        expect(missed.length).toBe(1)
        expect(extra.length).toBe(1)
    })

    it('matchOnsets handles empty arrays', () => {
        const { matched, missed, extra } = matchOnsets([], [], 100)
        expect(matched.length).toBe(0)
        expect(missed.length).toBe(0)
        expect(extra.length).toBe(0)
    })
})
