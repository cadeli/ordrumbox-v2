/**
 * WAV Export functional tests.
 *
 * Strategy:
 *  1. Mock OfflineAudioContext returns buffers filled with a known sine pattern
 *  2. Export a pattern through MfWavExporter.exportPatternToWav()
 *  3. Parse the WAV blob binary and verify header + encoded samples
 *
 * The mock renders a 60 Hz sine at 0.8 amplitude so the WAV encoder must
 * faithfully convert those float samples to 16-bit PCM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfWavExporter from '../src/audio/export/wav_exporter.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import MfPatterns from '../src/patterns/manager.js'
import { TICK } from '../src/core/constants.js'

// ─── WAV parser ───────────────────────────────────────────────────────────────

function parseWav(arrayBuffer) {
    const view = new DataView(arrayBuffer)
    const result = { riff: '', wave: '', fmt: {}, data: {}, sampleData: [] }

    result.riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
    result.fileSize = view.getUint32(4, true) + 8
    result.wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))

    result.fmt.chunkId = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15))
    result.fmt.chunkSize = view.getUint32(16, true)
    result.fmt.audioFormat = view.getUint16(20, true)
    result.fmt.numChannels = view.getUint16(22, true)
    result.fmt.sampleRate = view.getUint32(24, true)
    result.fmt.byteRate = view.getUint32(28, true)
    result.fmt.blockAlign = view.getUint16(32, true)
    result.fmt.bitsPerSample = view.getUint16(34, true)

    const dataOffset = 20 + result.fmt.chunkSize
    result.data.chunkId = String.fromCharCode(view.getUint8(dataOffset), view.getUint8(dataOffset + 1), view.getUint8(dataOffset + 2), view.getUint8(dataOffset + 3))
    result.data.chunkSize = view.getUint32(dataOffset + 4, true)

    const sampleStart = dataOffset + 8
    const totalSamples = result.data.chunkSize / 2
    const numCh = result.fmt.numChannels
    const frames = totalSamples / numCh

    result.sampleData = []
    for (let ch = 0; ch < numCh; ch++) {
        result.sampleData[ch] = new Float32Array(frames)
    }
    for (let i = 0; i < frames; i++) {
        for (let ch = 0; ch < numCh; ch++) {
            const offset = sampleStart + (i * numCh + ch) * 2
            const raw = view.getInt16(offset, true)
            result.sampleData[ch][i] = raw < 0 ? raw / 0x8000 : raw / 0x7FFF
        }
    }

    return result
}

// ─── Mock with known audio content ────────────────────────────────────────────

const MOCK_FREQUENCY = 60
const MOCK_AMPLITUDE = 0.8

class MockOfflineAudioContext {
    constructor(channels, length, sampleRate) {
        this.channels = channels
        this.length = length
        this.sampleRate = sampleRate
        this.currentTime = 0
        this.destination = { connect: vi.fn(), disconnect: vi.fn() }
        this.audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) }
    }

    createGain() {
        return {
            gain: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(), disconnect: vi.fn()
        }
    }
    createDynamicsCompressor() {
        return {
            threshold: { value: 0, setValueAtTime: vi.fn() }, knee: { value: 0, setValueAtTime: vi.fn() },
            ratio: { value: 0, setValueAtTime: vi.fn() }, attack: { value: 0, setValueAtTime: vi.fn() },
            release: { value: 0, setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn()
        }
    }
    createBiquadFilter() {
        return {
            type: 'lowpass', frequency: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            Q: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn()
        }
    }
    createOscillator() {
        return { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), frequency: { value: 0, setValueAtTime: vi.fn() } }
    }
    createAnalyser() { return { fftSize: 1024, connect: vi.fn(), disconnect: vi.fn() } }
    createBuffer(ch, len, sr) {
        return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) }
    }
    createBufferSource() {
        return {
            buffer: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), loop: false,
            playbackRate: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
        }
    }
    createStereoPanner() {
        return { pan: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
    }
    createWaveShaper() { return { curve: null, oversample: 'none', connect: vi.fn(), disconnect: vi.fn() } }
    createConvolver() { return { buffer: null, connect: vi.fn(), disconnect: vi.fn() } }
    createDelay() {
        return { delayTime: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
    }
    createConstantSource() {
        return {
            offset: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
            connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn()
        }
    }

    startRendering() {
        const { channels, length, sampleRate } = this
        return Promise.resolve({
            numberOfChannels: channels,
            length,
            sampleRate,
            getChannelData: (ch) => {
                const data = new Float32Array(length)
                for (let i = 0; i < length; i++) {
                    data[i] = Math.sin(2 * Math.PI * MOCK_FREQUENCY * i / sampleRate) * MOCK_AMPLITUDE
                }
                return data
            }
        })
    }
}

class MockAudioWorkletNode {
    constructor() {
        this.parameters = {
            get: () => ({
                value: 0, setValueAtTime: () => {}, setTargetAtTime: () => {},
                linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {},
            }),
        }
    }
    connect() { return this }
    disconnect() {}
}

global.OfflineAudioContext = MockOfflineAudioContext
global.AudioWorkletNode = MockAudioWorkletNode

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100

function makeTrack(name, soundId, notes, opts = {}) {
    return {
        name,
        soundId,
        bars: opts.bars ?? 1,
        barQuantize: opts.barQuantize ?? 4,
        mute: opts.mute ?? false,
        notes,
    }
}

function makeNote(bar, barStep, opts = {}) {
    return {
        bar, barStep,
        velocity: opts.velocity ?? 1,
        pitch: opts.pitch ?? 0,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WAV Export — functional end-to-end', () => {
    beforeEach(() => {
        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = new MfPatterns()
        soundRegistry.sounds = {
            'kick.wav': {
                url: 'kick.wav',
                buffer: { duration: 1, length: SAMPLE_RATE, getChannelData: () => new Float32Array(SAMPLE_RATE) },
                key: 'KICK',
            }
        }
    })

    // ── 1. WAV header structure ────────────────────────────────────────────────

    describe('Case 1: WAV header structure', () => {
        it('produces valid RIFF/WAVE headers', async () => {
            const pattern = {
                name: 'HeaderTest', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            expect(wav.riff).toBe('RIFF')
            expect(wav.wave).toBe('WAVE')
            expect(wav.fmt.chunkId).toBe('fmt ')
            expect(wav.data.chunkId).toBe('data')
        })

        it('fmt chunk has PCM format (1), 16-bit', async () => {
            const pattern = {
                name: 'FmtTest', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            expect(wav.fmt.audioFormat).toBe(1)
            expect(wav.fmt.bitsPerSample).toBe(16)
            expect(wav.fmt.numChannels).toBe(2)
            expect(wav.fmt.sampleRate).toBe(SAMPLE_RATE)
        })

        it('block align = numChannels × (bitsPerSample / 8)', async () => {
            const pattern = {
                name: 'BlockAlign', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            expect(wav.fmt.blockAlign).toBe(wav.fmt.numChannels * (wav.fmt.bitsPerSample / 8))
        })

        it('byteRate = sampleRate × blockAlign', async () => {
            const pattern = {
                name: 'ByteRate', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            expect(wav.fmt.byteRate).toBe(wav.fmt.sampleRate * wav.fmt.blockAlign)
        })
    })

    // ── 2. Duration / sample count ─────────────────────────────────────────────

    describe('Case 2: duration matches pattern parameters', () => {
        it('1 bar at 120 BPM → ~0.5s → ~22050 frames', async () => {
            const pattern = {
                name: 'Dur1Bar', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            const expectedFrames = Math.floor(SAMPLE_RATE * 0.5)
            expect(wav.sampleData[0].length).toBeCloseTo(expectedFrames, -2)
        })

        it('4 bars at 120 BPM → ~2s → ~88200 frames', async () => {
            const pattern = {
                name: 'Dur4Bar', bpm: 120, nbBars: 4,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            const expectedFrames = Math.floor(SAMPLE_RATE * 2)
            expect(wav.sampleData[0].length).toBeCloseTo(expectedFrames, -2)
        })

        it('2 loops doubles the duration', async () => {
            const pattern = {
                name: 'Dur2Loop', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob1 = await exporter.exportPatternToWav(pattern, 1)
            const blob2 = await exporter.exportPatternToWav(pattern, 2)

            const ab1 = await blob1.arrayBuffer()
            const ab2 = await blob2.arrayBuffer()
            const wav1 = parseWav(ab1)
            const wav2 = parseWav(ab2)

            expect(wav2.sampleData[0].length).toBeCloseTo(wav1.sampleData[0].length * 2, -2)
        })

        it('BPM change scales duration inversely', async () => {
            const make = (bpm) => ({
                name: 'BpmScale', bpm, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            })
            const exporter = new MfWavExporter()

            const blob60 = await exporter.exportPatternToWav(make(60), 1)
            const blob120 = await exporter.exportPatternToWav(make(120), 1)

            const wav60 = parseWav(await blob60.arrayBuffer())
            const wav120 = parseWav(await blob120.arrayBuffer())

            expect(wav60.sampleData[0].length).toBeGreaterThan(wav120.sampleData[0].length * 1.5)
        })
    })

    // ── 3. Audio content: sine wave encoded faithfully ─────────────────────────

    describe('Case 3: mock audio content is encoded in WAV', () => {
        it('sample data is not all zeros (mock sine is present)', async () => {
            const pattern = {
                name: 'ContentTest', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            let maxAbs = 0
            for (let i = 0; i < wav.sampleData[0].length; i++) {
                maxAbs = Math.max(maxAbs, Math.abs(wav.sampleData[0][i]))
            }
            expect(maxAbs).toBeGreaterThan(0)
        })

        it('peak amplitude is approximately 0.8 (mock amplitude)', async () => {
            const pattern = {
                name: 'PeakTest', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            let peak = 0
            for (let i = 0; i < wav.sampleData[0].length; i++) {
                peak = Math.max(peak, Math.abs(wav.sampleData[0][i]))
            }
            expect(peak).toBeGreaterThan(0.7)
            expect(peak).toBeLessThanOrEqual(1.0)
        })

        it('stereo channels both contain signal', async () => {
            const pattern = {
                name: 'StereoTest', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            expect(wav.sampleData.length).toBe(2)

            let maxL = 0, maxR = 0
            for (let i = 0; i < wav.sampleData[0].length; i++) {
                maxL = Math.max(maxL, Math.abs(wav.sampleData[0][i]))
                maxR = Math.max(maxR, Math.abs(wav.sampleData[1][i]))
            }
            expect(maxL).toBeGreaterThan(0)
            expect(maxR).toBeGreaterThan(0)
        })

        it('stereo channels have same peak (mock fills all channels identically)', async () => {
            const pattern = {
                name: 'StereoPeak', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            let peakL = 0, peakR = 0
            for (let i = 0; i < wav.sampleData[0].length; i++) {
                peakL = Math.max(peakL, Math.abs(wav.sampleData[0][i]))
                peakR = Math.max(peakR, Math.abs(wav.sampleData[1][i]))
            }
            expect(peakL).toBeCloseTo(peakR, 4)
        })
    })

    // ── 4. WAV binary size consistency ─────────────────────────────────────────

    describe('Case 4: WAV binary size is consistent', () => {
        it('blob size = 44 header + frames × channels × 2 bytes', async () => {
            const pattern = {
                name: 'SizeTest', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            const frames = wav.sampleData[0].length
            const expectedSize = 44 + frames * wav.fmt.numChannels * 2
            expect(blob.size).toBe(expectedSize)
        })

        it('data chunk size = frames × channels × 2', async () => {
            const pattern = {
                name: 'DataChunk', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            const frames = wav.sampleData[0].length
            const expectedDataSize = frames * wav.fmt.numChannels * 2
            expect(wav.data.chunkSize).toBe(expectedDataSize)
        })

        it('RIFF file size field matches actual blob size', async () => {
            const pattern = {
                name: 'RiffSize', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            expect(wav.fileSize).toBe(blob.size)
        })
    })

    // ── 5. Different patterns produce different WAVs ───────────────────────────

    describe('Case 5: different patterns produce different output', () => {
        it('2-bar WAV is longer than 1-bar WAV', async () => {
            const make = (nbBars) => ({
                name: 'Compare', bpm: 120, nbBars,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            })
            const exporter = new MfWavExporter()

            const wav1 = parseWav(await (await exporter.exportPatternToWav(make(1), 1)).arrayBuffer())
            const wav2 = parseWav(await (await exporter.exportPatternToWav(make(2), 1)).arrayBuffer())

            expect(wav2.sampleData[0].length).toBeGreaterThan(wav1.sampleData[0].length)
        })

        it('empty track list still produces valid WAV', async () => {
            const pattern = {
                name: 'EmptyTracks', bpm: 120, nbBars: 1,
                tracks: []
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            expect(wav.riff).toBe('RIFF')
            expect(wav.wave).toBe('WAVE')
            expect(wav.sampleData[0].length).toBeGreaterThan(0)
        })

        it('exported blob has audio/wav mime type', async () => {
            const pattern = {
                name: 'MimeTest', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            expect(blob.type).toBe('audio/wav')
        })
    })

    // ── 6. createBufferSource called per note ──────────────────────────────────

    describe('Case 6: engine scheduling', () => {
        it('createBufferSource is called when notes are present', async () => {
            const pattern = {
                name: 'SchedTest', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0), makeNote(0, 16),
                ])]
            }
            const exporter = new MfWavExporter()
            const spy = vi.spyOn(MockOfflineAudioContext.prototype, 'createBufferSource')
            spy.mockClear()

            await exporter.exportPatternToWav(pattern, 1)

            expect(spy).toHaveBeenCalled()
            spy.mockRestore()
        })
    })

    // ── 7. Sample precision — 16-bit quantization ──────────────────────────────

    describe('Case 7: 16-bit quantization', () => {
        it('all decoded samples are within -1..1', async () => {
            const pattern = {
                name: 'QuantTest', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            for (let ch = 0; ch < wav.fmt.numChannels; ch++) {
                for (let i = 0; i < wav.sampleData[ch].length; i++) {
                    expect(wav.sampleData[ch][i]).toBeGreaterThanOrEqual(-1)
                    expect(wav.sampleData[ch][i]).toBeLessThanOrEqual(1)
                }
            }
        })

        it('sample values are quantized (no float precision artifacts beyond 16-bit)', async () => {
            const pattern = {
                name: 'QuantPrecision', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()

            const view = new DataView(ab)
            const dataOffset = 20 + 16
            const sampleStart = dataOffset + 8
            const numCh = 2
            const frameCount = (ab.byteLength - sampleStart) / (numCh * 2)

            for (let i = 0; i < Math.min(100, frameCount); i++) {
                const raw = view.getInt16(sampleStart + i * numCh * 2, true)
                const decoded = raw / 0x7FFF
                expect(decoded).toBeGreaterThanOrEqual(-1)
                expect(decoded).toBeLessThanOrEqual(1)
            }
        })
    })

    // ── 8. Multi-loop export ──────────────────────────────────────────────────

    describe('Case 8: multi-loop export', () => {
        it('3 loops → 3× the samples of 1 loop', async () => {
            const pattern = {
                name: 'MultiLoop', bpm: 120, nbBars: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const wav1 = parseWav(await (await exporter.exportPatternToWav(pattern, 1)).arrayBuffer())
            const wav3 = parseWav(await (await exporter.exportPatternToWav(pattern, 3)).arrayBuffer())

            expect(wav3.sampleData[0].length).toBeCloseTo(wav1.sampleData[0].length * 3, -2)
        })
    })
})
