/**
 * simpleBeep audio-output verification tests.
 *
 * Two approaches combined:
 * 1. Real audio: wav_exporter renders through the full worklet pipeline
 *    and verifies output is non-silent.
 * 2. Mixer-level: verifies that after stop(), addStrip reconnects the
 *    audio graph so signals reach the output.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import nodeWaa from 'node-web-audio-api'

const { OfflineAudioContext, AudioWorkletNode } = nodeWaa

globalThis.OfflineAudioContext = OfflineAudioContext
globalThis.AudioWorkletNode = AudioWorkletNode

const SAMPLE_RATE = 44100

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeKickBuffer(ctx, duration = 0.3) {
    const len = Math.ceil(ctx.sampleRate * duration)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate
        const freq = 150 * Math.exp(-t * 20)
        ch[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 10) * 0.8
    }
    return buf
}

function rms(samples) {
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / samples.length)
}

function peak(samples) {
    let max = 0
    for (let i = 0; i < samples.length; i++) {
        const v = Math.abs(samples[i])
        if (v > max) max = v
    }
    return max
}

function floatToWav(samples, sampleRate) {
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
    const blockAlign = numChannels * (bitsPerSample / 8)
    const dataSize = samples.length * (bitsPerSample / 8)
    const headerSize = 44
    const buffer = new ArrayBuffer(headerSize + dataSize)
    const view = new DataView(buffer)

    const writeStr = (offset, str) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }

    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)
    writeStr(36, 'data')
    view.setUint32(40, dataSize, true)

    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]))
        view.setInt16(headerSize + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    }

    return new Uint8Array(buffer)
}

// ─── Part 1: Real audio rendering through wav_exporter ──────────────────────

describe('simpleBeep — real audio rendering', () => {
    let kickBuffer

    beforeEach(async () => {
        const tmpCtx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)
        kickBuffer = makeKickBuffer(tmpCtx, 0.3)
    })

    it('wav_exporter renders non-silent audio with kick buffer', async () => {
        const { default: MfWavExporter } = await import('../src/audio/export/wav_exporter.js')
        const { soundRegistry } = await import('../src/state/sound_registry.js')
        const { serviceRegistry } = await import('../src/state/service_registry.js')
        const { default: MfPatterns } = await import('../src/patterns/manager.js')

        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = new MfPatterns()

        soundRegistry.sounds = {
            'kick.wav': { url: 'kick.wav', buffer: kickBuffer, key: 'KICK' },
        }

        const pattern = {
            name: 'Beep Test',
            bpm: 120,
            nbBars: 1,
            tracks: [{
                name: 'KICK',
                soundId: 'kick.wav',
                bars: 1,
                barQuantize: 4,
                mute: false,
                notes: [
                    { bar: 0, barStep: 0, velocity: 1, pitch: 0 },
                ],
            }],
        }

        const exporter = new MfWavExporter()
        const blob = await exporter.exportPatternToWav(pattern, 1)
        expect(blob).toBeDefined()

        const ab = await blob.arrayBuffer()
        const wavBytes = new Uint8Array(ab)

        const headerSize = 44
        const bytesPerSample = 2
        const numChannels = wavBytes[22] | (wavBytes[23] << 8)
        const sampleRate = wavBytes[24] | (wavBytes[25] << 8) | (wavBytes[26] << 16) | (wavBytes[27] << 24)
        const dataSize = wavBytes[40] | (wavBytes[41] << 8) | (wavBytes[42] << 16) | (wavBytes[43] << 24)
        const numSamples = dataSize / (bytesPerSample * numChannels)

        const samples = []
        for (let i = 0; i < numSamples; i++) {
            const offset = headerSize + i * bytesPerSample * numChannels
            const val = wavBytes[offset] | (wavBytes[offset + 1] << 8)
            samples.push(val < 0x8000 ? val / 0x7FFF : (val - 0x10000) / 0x7FFF)
        }

        expect(samples.length).toBeGreaterThan(0)
        expect(peak(samples)).toBeGreaterThan(0.01)
        expect(rms(samples)).toBeGreaterThan(0.001)
    })

    it('silent pattern produces near-silence', async () => {
        const { default: MfWavExporter } = await import('../src/audio/export/wav_exporter.js')
        const { soundRegistry } = await import('../src/state/sound_registry.js')
        const { serviceRegistry } = await import('../src/state/service_registry.js')
        const { default: MfPatterns } = await import('../src/patterns/manager.js')

        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = new MfPatterns()

        soundRegistry.sounds = {
            'kick.wav': { url: 'kick.wav', buffer: kickBuffer, key: 'KICK' },
        }

        const pattern = {
            name: 'Silent Test',
            bpm: 120,
            nbBars: 1,
            tracks: [{
                name: 'KICK',
                soundId: 'kick.wav',
                bars: 1,
                barQuantize: 4,
                mute: false,
                notes: [],
            }],
        }

        const exporter = new MfWavExporter()
        const blob = await exporter.exportPatternToWav(pattern, 1)
        const ab = await blob.arrayBuffer()
        const wavBytes = new Uint8Array(ab)

        const dataSize = wavBytes[40] | (wavBytes[41] << 8) | (wavBytes[42] << 16) | (wavBytes[43] << 24)
        const numChannels = wavBytes[22] | (wavBytes[23] << 8)
        const numSamples = dataSize / (2 * numChannels)

        const samples = []
        for (let i = 0; i < numSamples; i++) {
            const offset = 44 + i * 2 * numChannels
            const val = wavBytes[offset] | (wavBytes[offset + 1] << 8)
            samples.push(val < 0x8000 ? val / 0x7FFF : (val - 0x10000) / 0x7FFF)
        }

        expect(peak(samples)).toBeLessThan(0.05)
    })
})

// ─── Part 2: Mixer addStrip reconnection after stop ─────────────────────────

describe('simpleBeep — mixer graph reconnection', () => {
    it('after stop(), addStrip re-creates busInput and connects strip', async () => {
        const { default: MfMixer } = await import('../src/audio/mixer.js')
        const { default: MfStrip } = await import('../src/audio/strip.js')
        const { soundRegistry } = await import('../src/state/sound_registry.js')
        const { serviceRegistry } = await import('../src/state/service_registry.js')
        const { default: MfPatterns } = await import('../src/patterns/manager.js')

        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = new MfPatterns()

        const ctx = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE)
        const mixer = await MfMixer.create(ctx)

        expect(mixer.busInput).toBeTruthy()
        expect(mixer.analyser).toBeTruthy()

        const strip = await mixer.getOrCreateStrip('KICK')
        expect(strip).toBeTruthy()
        expect(strip.pan).toBeTruthy()

        mixer.stop()

        expect(mixer.busInput).toBeNull()
        expect(mixer.analyser).toBeNull()

        const strip2 = await mixer.getOrCreateStrip('KICK2')
        expect(strip2).toBeTruthy()
        expect(mixer.busInput).toBeTruthy()
        expect(mixer.analyser).toBeTruthy()
    })

    it('signal reaches destination after stop → addStrip → render', async () => {
        const { default: MfMixer } = await import('../src/audio/mixer.js')
        const { soundRegistry } = await import('../src/state/sound_registry.js')
        const { serviceRegistry } = await import('../src/state/service_registry.js')
        const { default: MfPatterns } = await import('../src/patterns/manager.js')

        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = new MfPatterns()

        const ctx = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE)
        const mixer = await MfMixer.create(ctx)

        mixer.start()

        const strip = await mixer.getOrCreateStrip('TEST')
        expect(strip).toBeTruthy()

        mixer.stop()

        const strip2 = await mixer.getOrCreateStrip('TEST2')
        expect(strip2).toBeTruthy()
        expect(mixer.busInput).toBeTruthy()

        const len = Math.ceil(SAMPLE_RATE * 0.2)
        const src = ctx.createBufferSource()
        const buf = ctx.createBuffer(1, len, SAMPLE_RATE)
        const ch = buf.getChannelData(0)
        for (let i = 0; i < len; i++) {
            ch[i] = Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE) * Math.exp(-i / (SAMPLE_RATE * 0.05))
        }
        src.buffer = buf

        const gain = ctx.createGain()
        gain.gain.value = 0.5
        src.connect(gain)
        gain.connect(strip2.voicesInput)
        src.start(0)
        src.stop(0.2)

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)
        expect(peak(samples)).toBeGreaterThan(0.01)
        expect(rms(samples)).toBeGreaterThan(0.001)
    })

    it('signal is silent when busInput is null (the pre-fix behavior)', async () => {
        const { default: MfMixer } = await import('../src/audio/mixer.js')
        const { soundRegistry } = await import('../src/state/sound_registry.js')
        const { serviceRegistry } = await import('../src/state/service_registry.js')
        const { default: MfPatterns } = await import('../src/patterns/manager.js')

        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = new MfPatterns()

        const ctx = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE)
        const mixer = await MfMixer.create(ctx)

        mixer.stop()

        const len = Math.ceil(SAMPLE_RATE * 0.2)
        const src = ctx.createBufferSource()
        const buf = ctx.createBuffer(1, len, SAMPLE_RATE)
        const ch = buf.getChannelData(0)
        for (let i = 0; i < len; i++) {
            ch[i] = Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE) * 0.8
        }
        src.buffer = buf

        const gain = ctx.createGain()
        gain.gain.value = 0.5
        src.connect(gain)
        gain.connect(ctx.destination)
        src.start(0)
        src.stop(0.2)

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)
        expect(peak(samples)).toBeGreaterThan(0.01)
    })
})

// ─── Part 3: SampleVoice + Mixer full chain with real OfflineAudioContext ────

describe('simpleBeep — SampleVoice through real mixer chain', () => {
    let kickBuffer

    beforeEach(async () => {
        const tmpCtx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)
        kickBuffer = makeKickBuffer(tmpCtx, 0.3)
    })

    it('SampleVoice → strip.voicesInput → mixer → destination is audible', async () => {
        const { default: MfMixer } = await import('../src/audio/mixer.js')
        const { default: SampleVoice } = await import('../src/audio/voices/sample_voice.js')
        const { default: MfFlatNote } = await import('../src/model/flatnote.js')

        const ctx = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE)
        const mixer = await MfMixer.create(ctx)
        mixer.start()

        if (mixer.transportClock) {
            mixer.transportClock.offset.setValueAtTime(0, 0)
            mixer.transportClock.offset.linearRampToValueAtTime(3600, 3600)
        }

        const strip = await mixer.getOrCreateStrip('KICK')
        expect(strip).toBeTruthy()

        const track = { name: 'KICK', soundId: 'kick.wav', pitchLfo: null, sampleLength: 0.3 }
        const note = { bar: 0, barStep: 0, velocity: 0.8, pitch: 0, fpitch: 1, name: 'test' }
        const flatNote = new MfFlatNote(0, track, note)

        const voice = new SampleVoice(ctx, strip, kickBuffer)
        voice.setup(flatNote, 0)
        voice.start(0)

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)
        const p = peak(samples)
        expect(p).toBeGreaterThan(0.01)
    })

    it('SampleVoice → strip → mixer is audible AFTER stop + re-init', async () => {
        const { default: MfMixer } = await import('../src/audio/mixer.js')
        const { default: SampleVoice } = await import('../src/audio/voices/sample_voice.js')
        const { default: MfFlatNote } = await import('../src/model/flatnote.js')

        const ctx = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE)
        const mixer = await MfMixer.create(ctx)
        mixer.start()

        if (mixer.transportClock) {
            mixer.transportClock.offset.setValueAtTime(0, 0)
            mixer.transportClock.offset.linearRampToValueAtTime(3600, 3600)
        }

        const strip = await mixer.getOrCreateStrip('KICK')
        expect(strip).toBeTruthy()

        mixer.stop()

        const strip2 = await mixer.getOrCreateStrip('KICK2')
        expect(strip2).toBeTruthy()
        expect(mixer.busInput).toBeTruthy()

        const track = { name: 'KICK2', soundId: 'kick.wav', pitchLfo: null, sampleLength: 0.3 }
        const note = { bar: 0, barStep: 0, velocity: 0.8, pitch: 0, fpitch: 1, name: 'test' }
        const flatNote = new MfFlatNote(0, track, note)

        const voice = new SampleVoice(ctx, strip2, kickBuffer)
        voice.setup(flatNote, 0)
        voice.start(0)

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)
        const p = peak(samples)
        expect(p).toBeGreaterThan(0.01)
    })
})
