import { describe, it, expect } from 'vitest'
import {
    bufferToWav,
    computeWavExportDuration,
    computeWavExportSamples,
} from '../src/audio/export/wav_encoder.js'

function createMockAudioBuffer(channels, length, sampleRate) {
    return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: (channelIndex) => {
            const data = new Float32Array(length)
            for (let i = 0; i < length; i++) {
                data[i] = Math.sin(i * 0.01) * 0.5
            }
            return data
        }
    }
}

describe('wavEncoder - bufferToWav', () => {
    it('creates a Blob with audio/wav type', () => {
        const buffer = createMockAudioBuffer(2, 100, 44100)
        const blob = bufferToWav(buffer)
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('audio/wav')
    })

    it('creates correct size for mono buffer', () => {
        const length = 100
        const expectedSize = length * 1 * 2 + 44
        const buffer = createMockAudioBuffer(1, length, 44100)
        const blob = bufferToWav(buffer)
        expect(blob.size).toBe(expectedSize)
    })

    it('creates correct size for stereo buffer', () => {
        const length = 100
        const expectedSize = length * 2 * 2 + 44
        const buffer = createMockAudioBuffer(2, length, 44100)
        const blob = bufferToWav(buffer)
        expect(blob.size).toBe(expectedSize)
    })

    it('writes valid RIFF header', async () => {
        const buffer = createMockAudioBuffer(1, 10, 44100)
        const blob = bufferToWav(buffer)
        const arrayBuffer = await blob.arrayBuffer()
        const view = new DataView(arrayBuffer)

        // Check "RIFF"
        expect(String.fromCharCode(view.getUint8(0))).toBe('R')
        expect(String.fromCharCode(view.getUint8(1))).toBe('I')
        expect(String.fromCharCode(view.getUint8(2))).toBe('F')
        expect(String.fromCharCode(view.getUint8(3))).toBe('F')

        // Check "WAVE"
        expect(String.fromCharCode(view.getUint8(8))).toBe('W')
        expect(String.fromCharCode(view.getUint8(9))).toBe('A')
        expect(String.fromCharCode(view.getUint8(10))).toBe('V')
        expect(String.fromCharCode(view.getUint8(11))).toBe('E')
    })

    it('writes correct sample rate in header', async () => {
        const buffer = createMockAudioBuffer(1, 10, 48000)
        const blob = bufferToWav(buffer)
        const arrayBuffer = await blob.arrayBuffer()
        const view = new DataView(arrayBuffer)
        const sampleRate = view.getUint32(24, true)
        expect(sampleRate).toBe(48000)
    })

    it('clamps samples to -1..1 range', async () => {
        const buffer = {
            numberOfChannels: 1,
            length: 4,
            sampleRate: 44100,
            getChannelData: () => {
                const data = new Float32Array(4)
                data[0] = 1.5
                data[1] = -1.5
                data[2] = 0.5
                data[3] = -0.5
                return data
            }
        }
        const blob = bufferToWav(buffer)
        const arrayBuffer = await blob.arrayBuffer()
        const view = new DataView(arrayBuffer)
        // Data starts at offset 44
        const sample0 = view.getInt16(44, true)
        const sample1 = view.getInt16(46, true)
        // 1.5 should be clamped to 0x7FFF
        expect(sample0).toBe(0x7FFF)
        // -1.5 should be clamped to -0x8000
        expect(sample1).toBe(-0x8000)
    })
})

describe('wavEncoder - computeWavExportDuration', () => {
    it('computes duration for 1 bar at 120 BPM', () => {
        const duration = computeWavExportDuration(120, 1, 1)
        expect(duration).toBeCloseTo(0.5, 5)
    })

    it('computes duration for 4 bars at 120 BPM', () => {
        const duration = computeWavExportDuration(120, 4, 1)
        expect(duration).toBeCloseTo(2, 5)
    })

    it('scales with numLoops', () => {
        const d1 = computeWavExportDuration(120, 4, 1)
        const d2 = computeWavExportDuration(120, 4, 2)
        expect(d2).toBeCloseTo(d1 * 2, 5)
    })
})

describe('wavEncoder - computeWavExportSamples', () => {
    it('computes samples for 1 second at 44100 Hz', () => {
        const samples = computeWavExportSamples(60, 1, 1, 44100)
        expect(samples).toBe(44100)
    })

    it('computes samples for 4 bars at 120 BPM', () => {
        const samples = computeWavExportSamples(120, 4, 1, 44100)
        expect(samples).toBeCloseTo(44100 * 2, 0)
    })
})
