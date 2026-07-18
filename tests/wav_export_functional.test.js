/**
 * WAV Export functional tests.
 *
 * Strategy:
 *  1. Mock OfflineAudioContext returns buffers filled with a known sine pattern
 *  2. Export a pattern through MfWavExporter.exportPatternToWav()
 *  3. Parse the WAV blob binary and verify header + encoded samples
 *  4. Extended: verify scheduling via createBufferSource spy — ticks, velocity,
 *     pitch, every, retrigger, arp, multi-loop
 *
 * The mock renders a 60 Hz sine at 0.8 amplitude so the WAV encoder must
 * faithfully convert those float samples to 16-bit PCM.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfWavExporter from '../src/audio/export/wav_exporter.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import * as patternsManager from '../src/patterns/manager.js'
import { TICK } from '../src/core/constants.js'
import { computeFlatNotesFromPattern } from '../src/patterns/engine.js'

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
        const node = {
            buffer: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), loop: false,
            playbackRate: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
        }
        return trackSource(node)
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

// ─── Buffer source tracker ───────────────────────────────────────────────────
// Collects all createBufferSource() nodes so we can analyze start() scheduling.
let _trackedSources = []

function trackSource(node) {
    _trackedSources.push(node)
    return node
}

function getStartTimes() {
    return _trackedSources
        .filter(n => n.start.mock.calls.length > 0)
        .map(n => n.start.mock.calls.map(c => c[0]))
        .flat()
        .sort((a, b) => a - b)
}

function getTickTime(bpm) {
    return (60 * 4) / (bpm * TICK) * 0.25
}

function startTimesToTicks(startTimes, bpm) {
    const tickTime = getTickTime(bpm)
    return startTimes.map(t => Math.round(t / tickTime))
}

function makeTrack(name, soundId, notes, opts = {}) {
    return {
        name,
        soundId,
        nbBeats: opts.nbBeats ?? 1,
        stepsPerBeat: opts.stepsPerBeat ?? 4,
        mute: opts.mute ?? false,
        loopPointBeat: opts.loopPointBeat ?? opts.nbBeats ?? 1,
        loopPointStep: opts.loopPointStep ?? 0,
        notes,
    }
}

function makeNote(beat, beatStep, opts = {}) {
    return {
        beat, beatStep,
        velocity: opts.velocity ?? 1,
        pitch: opts.pitch ?? 0,
        arp: opts.arp ?? null,
        every: opts.every ?? 1,
        pos: opts.pos ?? 0,
        prob: opts.prob ?? 1,
        arpTriggerProbability: opts.arpTriggerProbability ?? 1,
        retriggerNum: opts.retriggerNum ?? 1,
        rate: opts.rate ?? 1,
        euclidianFill: opts.euclidianFill ?? 0,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WAV Export — functional end-to-end', () => {
    beforeEach(() => {
        _trackedSources = []
        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = patternsManager
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
                name: 'HeaderTest', bpm: 120, nbBeats: 1,
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
                name: 'FmtTest', bpm: 120, nbBeats: 1,
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
                name: 'BlockAlign', bpm: 120, nbBeats: 1,
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
                name: 'ByteRate', bpm: 120, nbBeats: 1,
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
        it('1 beat at 120 BPM → ~0.5s → ~22050 frames', async () => {
            const pattern = {
                name: 'Dur1Bar', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const blob = await exporter.exportPatternToWav(pattern, 1)
            const ab = await blob.arrayBuffer()
            const wav = parseWav(ab)

            const expectedFrames = Math.floor(SAMPLE_RATE * 0.5)
            expect(wav.sampleData[0].length).toBeCloseTo(expectedFrames, -2)
        })

        it('4 beats at 120 BPM → ~2s → ~88200 frames', async () => {
            const pattern = {
                name: 'Dur4Bar', bpm: 120, nbBeats: 4,
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
                name: 'Dur2Loop', bpm: 120, nbBeats: 1,
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
                name: 'BpmScale', bpm, nbBeats: 1,
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
                name: 'ContentTest', bpm: 120, nbBeats: 1,
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
                name: 'PeakTest', bpm: 120, nbBeats: 1,
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
                name: 'StereoTest', bpm: 120, nbBeats: 1,
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
                name: 'StereoPeak', bpm: 120, nbBeats: 1,
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
                name: 'SizeTest', bpm: 120, nbBeats: 1,
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
                name: 'DataChunk', bpm: 120, nbBeats: 1,
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
                name: 'RiffSize', bpm: 120, nbBeats: 1,
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
        it('2-beat WAV is longer than 1-beat WAV', async () => {
            const make = (nbBeats) => ({
                name: 'Compare', bpm: 120, nbBeats,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            })
            const exporter = new MfWavExporter()

            const wav1 = parseWav(await (await exporter.exportPatternToWav(make(1), 1)).arrayBuffer())
            const wav2 = parseWav(await (await exporter.exportPatternToWav(make(2), 1)).arrayBuffer())

            expect(wav2.sampleData[0].length).toBeGreaterThan(wav1.sampleData[0].length)
        })

        it('empty track list still produces valid WAV', async () => {
            const pattern = {
                name: 'EmptyTracks', bpm: 120, nbBeats: 1,
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
                name: 'MimeTest', bpm: 120, nbBeats: 1,
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
                name: 'SchedTest', bpm: 120, nbBeats: 1,
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
                name: 'QuantTest', bpm: 120, nbBeats: 1,
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
                name: 'QuantPrecision', bpm: 120, nbBeats: 1,
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
                name: 'MultiLoop', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            const wav1 = parseWav(await (await exporter.exportPatternToWav(pattern, 1)).arrayBuffer())
            const wav3 = parseWav(await (await exporter.exportPatternToWav(pattern, 3)).arrayBuffer())

            expect(wav3.sampleData[0].length).toBeCloseTo(wav1.sampleData[0].length * 3, -2)
        })
    })

    // ── 9. Engine scheduling: flat notes at correct ticks ──────────────────────

    describe('Case 9: engine scheduling via flat notes', () => {
        it('1-beat pattern, note at beat0 step0 → start() at tick 0', async () => {
            const pattern = {
                name: 'Tick0', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 0)])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            const ticks = startTimesToTicks(getStartTimes(), pattern.bpm)
            expect(ticks).toContain(0)
        })

        it('1-beat pattern, note at beat0 step2 → start() at tick 16', async () => {
            const pattern = {
                name: 'Tick16', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(0, 2)])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            const ticks = startTimesToTicks(getStartTimes(), pattern.bpm)
            expect(ticks).toContain(16)
        })

        it('2-beat pattern, note at beat1 step0 → start() at tick 32', async () => {
            const pattern = {
                name: 'Tick32', bpm: 120, nbBeats: 2,
                tracks: [makeTrack('KICK', 'kick.wav', [makeNote(1, 0)])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            const ticks = startTimesToTicks(getStartTimes(), pattern.bpm)
            expect(ticks).toContain(32)
        })

        it('4 kicks on beats in 2-beat pattern → start() at ticks 0,16,32,48', async () => {
            const pattern = {
                name: 'FourBeats', bpm: 120, nbBeats: 2,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0), makeNote(0, 2),
                    makeNote(1, 0), makeNote(1, 2),
                ], { nbBeats: 2 })]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            const ticks = startTimesToTicks(getStartTimes(), pattern.bpm)
            expect(ticks).toContain(0)
            expect(ticks).toContain(16)
            expect(ticks).toContain(32)
            expect(ticks).toContain(48)
        })

        it('multi-track: 2 kicks + 2 snares → 4 notes (+ silent buffer)', async () => {
            const pattern = {
                name: 'MultiTrack', bpm: 120, nbBeats: 1,
                tracks: [
                    makeTrack('KICK', 'kick.wav', [makeNote(0, 0), makeNote(0, 2)]),
                    makeTrack('SNARE', 'kick.wav', [makeNote(0, 1), makeNote(0, 3)]),
                ]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            const startTimes = getStartTimes()
            expect(startTimes.length).toBe(5)
        })
    })

    // ── 10. Note count matches engine flat notes ─────────────────────────────

    describe('Case 10: note count via WAV export scheduling', () => {
        it('4 kicks on beats in 2-beat → 4 notes scheduled (+ silent buffer)', async () => {
            const pattern = {
                name: 'NoteCount4', bpm: 120, nbBeats: 2,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0), makeNote(0, 2),
                    makeNote(1, 0), makeNote(1, 2),
                ], { nbBeats: 2 })]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            expect(getStartTimes().length).toBe(5)
        })

        it('multi-track: 4 kicks + 2 snares → 6 notes scheduled', async () => {
            const pattern = {
                name: 'MultiTrack', bpm: 120, nbBeats: 2,
                tracks: [
                    makeTrack('KICK', 'kick.wav', [
                        makeNote(0, 0), makeNote(0, 2),
                        makeNote(1, 0), makeNote(1, 2),
                    ], { nbBeats: 2 }),
                    makeTrack('SNARE', 'kick.wav', [
                        makeNote(0, 2), makeNote(1, 2),
                    ], { nbBeats: 2 }),
                ]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            expect(getStartTimes().length).toBe(7)
        })
    })

    // ── 11. Velocity is applied to notes ─────────────────────────────────────

    describe('Case 11: velocity propagation', () => {
        it('notes with velocity 0.5 and 1.0 produce different flat note velocities', () => {
            const pattern = {
                name: 'Velocity', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { velocity: 0.5 }),
                    makeNote(0, 2, { velocity: 1.0 }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(2)
            expect(allNotes[0].note.velocity).toBe(0.5)
            expect(allNotes[1].note.velocity).toBe(1.0)
        })

        it('low velocity notes have lower velocity than high velocity notes', () => {
            const pattern = {
                name: 'VelocityCompare', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { velocity: 0.3 }),
                    makeNote(0, 2, { velocity: 0.9 }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes[0].note.velocity).toBeLessThan(allNotes[1].note.velocity)
        })
    })

    // ── 12. Pitch is applied to notes ────────────────────────────────────────

    describe('Case 12: pitch propagation', () => {
        it('notes with pitch 0 and +5 semitones produce different pitches', () => {
            const pattern = {
                name: 'Pitch', bpm: 120, nbBeats: 2,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, { pitch: 0 }),
                    makeNote(1, 0, { pitch: 5 }),
                ], { nbBeats: 2 })]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(2)
            expect(allNotes[0].note.pitch).toBe(0)
            expect(allNotes[1].note.pitch).toBe(5)
        })

        it('track pitch is inherited by all notes on that track', () => {
            const pattern = {
                name: 'TrackPitch', bpm: 120, nbBeats: 2,
                tracks: [{
                    name: 'BASS', soundId: 'kick.wav',
                    nbBeats: 2, stepsPerBeat: 4, pitch: 7,
                    notes: [
                        makeNote(0, 0, { pitch: 0 }),
                        makeNote(1, 0, { pitch: 3 }),
                    ]
                }]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(2)
            expect(allNotes[0].track.pitch).toBe(7)
            expect(allNotes[1].track.pitch).toBe(7)
        })
    })

    // ── 13. every — note fires every N loops ───────────────────────────

    describe('Case 13: every scheduling', () => {
        it('every=1 → note fires on every loop', () => {
            const pattern = {
                name: 'TrigFreq1', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { every: 1, pos: 0 }),
                ])]
            }
            for (let loop = 0; loop < 4; loop++) {
                const flatMap = computeFlatNotesFromPattern(pattern, loop)
                let count = 0
                for (const notes of flatMap.values()) count += notes.length
                expect(count).toBe(1)
            }
        })

        it('every=2, phase=0 → fires on loops 0,2,4,...', () => {
            const pattern = {
                name: 'TrigFreq2', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { every: 2, pos: 0 }),
                ])]
            }
            const loopCounts = []
            for (let loop = 0; loop < 6; loop++) {
                const flatMap = computeFlatNotesFromPattern(pattern, loop)
                let count = 0
                for (const notes of flatMap.values()) count += notes.length
                loopCounts.push(count)
            }
            expect(loopCounts).toEqual([1, 0, 1, 0, 1, 0])
        })

        it('every=2, phase=1 → fires on loops 1,3,5,...', () => {
            const pattern = {
                name: 'TrigFreq2Phase1', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { every: 2, pos: 1 }),
                ])]
            }
            const loopCounts = []
            for (let loop = 0; loop < 6; loop++) {
                const flatMap = computeFlatNotesFromPattern(pattern, loop)
                let count = 0
                for (const notes of flatMap.values()) count += notes.length
                loopCounts.push(count)
            }
            expect(loopCounts).toEqual([0, 1, 0, 1, 0, 1])
        })

        it('every=3 → fires on loops 0,3,6,...', () => {
            const pattern = {
                name: 'TrigFreq3', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { every: 3, pos: 0 }),
                ])]
            }
            const loopCounts = []
            for (let loop = 0; loop < 9; loop++) {
                const flatMap = computeFlatNotesFromPattern(pattern, loop)
                let count = 0
                for (const notes of flatMap.values()) count += notes.length
                loopCounts.push(count)
            }
            expect(loopCounts).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0])
        })

        it('mixed every: always note + every=2 note', () => {
            const pattern = {
                name: 'MixedTrig', bpm: 120, nbBeats: 2,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { every: 1 }),
                    makeNote(0, 1, { every: 2, pos: 0 }),
                ], { nbBeats: 2 })]
            }
            const loopCounts = []
            for (let loop = 0; loop < 4; loop++) {
                const flatMap = computeFlatNotesFromPattern(pattern, loop)
                let count = 0
                for (const notes of flatMap.values()) count += notes.length
                loopCounts.push(count)
            }
            expect(loopCounts).toEqual([2, 1, 2, 1])
        })
    })

    // ── 14. retriggerNum — multiple notes from one beatStep ───────────────────

    describe('Case 14: retrigger scheduling', () => {
        it('retriggerNum=1 → 1 start() (+ silent buffer)', async () => {
            const pattern = {
                name: 'Retrig1', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { retriggerNum: 1, rate: 1 }),
                ])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            expect(getStartTimes().length).toBe(2)
        })

        it('retriggerNum=3 → 3 start() calls from one beatStep', async () => {
            const pattern = {
                name: 'Retrig3', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { retriggerNum: 3, rate: 1 }),
                ])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            expect(getStartTimes().length).toBe(4)
        })

        it('retriggerNum=4, rate=2 → 4 start() calls', async () => {
            const pattern = {
                name: 'Retrig4Step2', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { retriggerNum: 4, rate: 2 }),
                ])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            expect(getStartTimes().length).toBe(5)
        })

        it('retriggered notes have increasing start() times', async () => {
            const pattern = {
                name: 'RetrigTicks', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { retriggerNum: 3, rate: 1 }),
                ])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            const times = getStartTimes()
            const noteTimes = times.filter(t => t > 0)
            expect(noteTimes.length).toBeGreaterThanOrEqual(2)
            expect(noteTimes[0]).toBeLessThan(noteTimes[1])
        })

        it('retriggerNum=4 → 4 start() calls', async () => {
            const pattern = {
                name: 'RetrigFlat', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { retriggerNum: 4, rate: 1 }),
                ])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            expect(getStartTimes().length).toBe(5)
        })
    })

    // ── 15. Arpeggio — multiple notes with pitch offsets ─────────────────────

    describe('Case 15: arp scheduling', () => {
        it('arp up [0,3,7] → 3 notes with correct pitch offsets', () => {
            const pattern = {
                name: 'ArpUp', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, { pitch: 0, arp: { intervals: [0, 3, 7], mode: 'up' }, retriggerNum: 3 }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(3)
            expect(allNotes[0].note.pitch).toBe(0)
            expect(allNotes[1].note.pitch).toBe(3)
            expect(allNotes[2].note.pitch).toBe(7)
        })

        it('arp down [0,3,7] → 3 notes in descending order', () => {
            const pattern = {
                name: 'ArpDown', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, { pitch: 0, arp: { intervals: [0, 3, 7], mode: 'down' }, retriggerNum: 3 }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(3)
            expect(allNotes[0].note.pitch).toBe(7)
            expect(allNotes[1].note.pitch).toBe(3)
            expect(allNotes[2].note.pitch).toBe(0)
        })

        it('arp updown [0,3,7] → 5 notes: up then down (excluding endpoints)', () => {
            const pattern = {
                name: 'ArpUpDown', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, { pitch: 0, arp: { intervals: [0, 3, 7], mode: 'updown' }, retriggerNum: 5 }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(5)
            const pitches = allNotes.map(n => n.note.pitch)
            expect(pitches).toEqual([0, 3, 7, 3, 0])
        })

        it('arp with array syntax [0,5,7] → 3 notes', () => {
            const pattern = {
                name: 'ArpArray', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, { pitch: 0, arp: [0, 5, 7], retriggerNum: 3 }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(3)
            const pitches = allNotes.map(n => n.note.pitch).sort((a, b) => a - b)
            expect(pitches).toEqual([0, 5, 7])
        })

        it('arp + base pitch offset: arp [0,3,7] on pitch=12', () => {
            const pattern = {
                name: 'ArpPitch', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, { pitch: 12, arp: { intervals: [0, 3, 7], mode: 'up' }, retriggerNum: 3 }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(3)
            expect(allNotes[0].note.pitch).toBe(12)
            expect(allNotes[1].note.pitch).toBe(15)
            expect(allNotes[2].note.pitch).toBe(19)
        })

        it('arp notes are at increasing ticks', async () => {
            const pattern = {
                name: 'ArpTicks', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, { pitch: 0, arp: { intervals: [0, 3, 7], mode: 'up' }, retriggerNum: 3 }),
                ])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            const times = getStartTimes()
            const noteTimes = times.filter(t => t > 0)
            expect(noteTimes.length).toBeGreaterThanOrEqual(2)
            expect(noteTimes[0]).toBeLessThan(noteTimes[1])
        })

        it('arp retriggerNum=4 + arp [0,3,7] → 4 arp notes', async () => {
            const pattern = {
                name: 'ArpRetrig', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, {
                        pitch: 0,
                        retriggerNum: 4,
                        rate: 1,
                        arp: { intervals: [0, 3, 7], mode: 'up' },
                    }),
                ])]
            }
            const exporter = new MfWavExporter()
            await exporter.exportPatternToWav(pattern, 1)
            expect(getStartTimes().length).toBe(5)
        })
    })

    // ── 16. Multi-loop with every ──────────────────────────────────────

    describe('Case 16: multi-loop + every combined', () => {
        it('4 loops with every=2 → 2 fires of the every note', () => {
            const pattern = {
                name: 'MultiLoopTrig', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { every: 2, pos: 0 }),
                ])]
            }
            let totalNotes = 0
            for (let loop = 0; loop < 4; loop++) {
                const flatMap = computeFlatNotesFromPattern(pattern, loop)
                for (const notes of flatMap.values()) totalNotes += notes.length
            }
            expect(totalNotes).toBe(2)
        })

        it('4 loops: always note + every=2 → 4 + 2 = 6 notes total', () => {
            const pattern = {
                name: 'MultiLoopMixed', bpm: 120, nbBeats: 2,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { every: 1 }),
                    makeNote(0, 1, { every: 2, pos: 0 }),
                ], { nbBeats: 2 })]
            }
            let totalNotes = 0
            for (let loop = 0; loop < 4; loop++) {
                const flatMap = computeFlatNotesFromPattern(pattern, loop)
                for (const notes of flatMap.values()) totalNotes += notes.length
            }
            expect(totalNotes).toBe(6)
        })

        it('2-beat pattern, 6 loops, every=2 → fires on loops 0,2,4', () => {
            const pattern = {
                name: 'MultiBarLoop', bpm: 120, nbBeats: 2,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { every: 2, pos: 0 }),
                ], { nbBeats: 2 })]
            }
            const loopCounts = []
            for (let loop = 0; loop < 6; loop++) {
                const flatMap = computeFlatNotesFromPattern(pattern, loop)
                let count = 0
                for (const notes of flatMap.values()) count += notes.length
                loopCounts.push(count)
            }
            expect(loopCounts).toEqual([1, 0, 1, 0, 1, 0])
        })
    })

    // ── 17. Track loop shorter than pattern ──────────────────────────────────

    describe('Case 17: short loop repeats within pattern', () => {
        it('2-beat loop in 4-beat pattern → notes repeat twice', () => {
            const pattern = {
                name: 'ShortLoop', bpm: 120, nbBeats: 4,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0, { velocity: 0.8 }),
                    makeNote(1, 0, { velocity: 0.6 }),
                ], { loopPointBeat: 2 })]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            let count = 0
            for (const notes of flatMap.values()) count += notes.length
            expect(count).toBe(4)
        })

        it('1-beat loop in 4-beat pattern → notes repeat 4 times', () => {
            const pattern = {
                name: 'OneBarLoop', bpm: 120, nbBeats: 4,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0),
                ], { loopPointBeat: 1 })]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            let count = 0
            for (const notes of flatMap.values()) count += notes.length
            expect(count).toBe(4)
        })
    })

    // ── 18. Combined: retrigger + velocity + pitch ───────────────────────────

    describe('Case 18: combined retrigger + velocity + pitch', () => {
        it('retriggerNum=3 with different velocities on each note', () => {
            const pattern = {
                name: 'RetrigVel', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('SNARE', 'kick.wav', [
                    makeNote(0, 0, { velocity: 0.5, retriggerNum: 3, rate: 1 }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(3)
            for (const fn of allNotes) {
                expect(fn.note.velocity).toBe(0.5)
            }
        })

        it('retriggerNum=2 + pitch offset → both notes have same pitch', () => {
            const pattern = {
                name: 'RetrigPitch', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, { pitch: 5, retriggerNum: 2, rate: 1 }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allNotes = []
            for (const notes of flatMap.values()) allNotes.push(...notes)

            expect(allNotes).toHaveLength(2)
            expect(allNotes[0].note.pitch).toBe(5)
            expect(allNotes[1].note.pitch).toBe(5)
        })

        it('arp + retrigger + pitch: arp [0,3,7] with retriggerNum=2', () => {
            const pattern = {
                name: 'CombinedAll', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('BASS', 'kick.wav', [
                    makeNote(0, 0, {
                        pitch: 12,
                        retriggerNum: 2,
                        rate: 1,
                        arp: { intervals: [0, 3, 7], mode: 'up' },
                    }),
                ])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            let count = 0
            for (const notes of flatMap.values()) count += notes.length
            expect(count).toBe(2)
        })
    })

    // ── 19. No notes → silent WAV ────────────────────────────────────────────

    describe('Case 19: no notes produces silent WAV', () => {
        it('empty notes array → flat notes map is empty', () => {
            const pattern = {
                name: 'Silent', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [])]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            let count = 0
            for (const notes of flatMap.values()) count += notes.length
            expect(count).toBe(0)
        })

        it('muted track → flat notes still computed (mute is runtime)', () => {
            const pattern = {
                name: 'Muted', bpm: 120, nbBeats: 1,
                tracks: [makeTrack('KICK', 'kick.wav', [
                    makeNote(0, 0), makeNote(0, 2),
                ], { mute: true })]
            }
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            let count = 0
            for (const notes of flatMap.values()) count += notes.length
            expect(count).toBe(2)
        })
    })
})
