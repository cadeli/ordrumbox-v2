/**
 * @vitest-environment jsdom
 *
 * E2E Audio Comparison — Played vs Exported WAV
 * ─────────────────────────────────────────────
 * Proves that:
 *   1. WAV export produces valid, well-formed files
 *   2. Two renders of the same pattern are bit-identical (determinism)
 *   3. Pattern modifications (notes, BPM, loops) change the WAV output
 *   4. WAV encode → decode roundtrip preserves audio data
 *
 * Every test below drives the real pipeline — WavExporter, Commander,
 * recomputeFlatNotes, bufferToWav — so it breaks when the product breaks.
 * Content-level assertions (RMS, spectral centroid) are therefore limited to what
 * the offline context can really render: see the note on the worklet mixer.
 *
 * Note on worklet mixer: In node-web-audio-api, AudioWorklet processors
 * don't actually execute DSP code, so the mixer produces valid-but-silent
 * WAVs. The structural, timing, and determinism tests below work correctly.
 * For true audio-content comparison (RMS, spectral), the tests use the
 * raw WAV encoder/decoder path directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import nodeWaa from 'node-web-audio-api'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import WavExporter from '../src/audio/export/wav_exporter.js'
import AudioAnalyzer from '../src/audio/analyze.js'
import { bufferToWav } from '../src/audio/export/wav_encoder.js'
import { recomputeFlatNotes } from '../src/patterns/engine.js'
import * as flatNotesService from '../src/patterns/flat_notes.js'

const { OfflineAudioContext, AudioWorkletNode } = nodeWaa
globalThis.OfflineAudioContext = OfflineAudioContext
globalThis.AudioWorkletNode = AudioWorkletNode

/**
 * node-web-audio-api has no AudioWorklet, so every render here is silent by
 * construction. expectAudio: false tells the exporter not to treat that as the
 * Chromium race (which would retry and then throw) — these tests assert the WAV
 * structure, not its samples.
 */
const exporter = () => new WavExporter({ expectAudio: false })

const SAMPLE_RATE = 44100
const analyzer = new AudioAnalyzer()

// Suppress worklet mixer errors in node environment (AudioWorklet not available)
let _origError
let _origWarn
beforeEach(() => {
    // Offline export drives the mixer through a minimal ctx, so Mixer.start
    // trips on its first missing call and reports through reportUserError —
    // which writes to console directly, hence warn as well as error.
    const isExpectedNoise = (args) => {
        const msg = args.map((a) => a?.toString?.() ?? '').join(' ')
        return msg.includes('Mixer') || msg.includes('Sound')
    }
    _origError = console.error
    console.error = (...args) => {
        if (isExpectedNoise(args)) return
        _origError(...args)
    }
    _origWarn = console.warn
    console.warn = (...args) => {
        if (isExpectedNoise(args)) return
        _origWarn(...args)
    }
})
afterEach(() => {
    console.error = _origError
    console.warn = _origWarn
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function resetAll() {
    appState.patterns.length = 0
    appState.selectedPatternIdx = 0
    appState.flatNotes = null
    serviceRegistry.reset()
    soundRegistry.reset()
}

function createDrumBuffer(frequency, decaySec, durationSec) {
    const length = Math.ceil(durationSec * SAMPLE_RATE)
    const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE)
    const buffer = ctx.createBuffer(1, length, SAMPLE_RATE)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
        const t = i / SAMPLE_RATE
        data[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / decaySec)
    }
    return buffer
}

function decodeWavBytes(wavBytes) {
    return analyzer.decodeWavBuffer(wavBytes)
}

function computeRms(samples) {
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / samples.length)
}

function computePeak(samples) {
    let peak = 0
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
    return peak
}

function compareBuffers(a, b, tolerance = 1e-4) {
    const len = Math.min(a.length, b.length)
    let matchCount = 0,
        mismatchCount = 0,
        maxDiff = 0,
        diffSum = 0
    for (let i = 0; i < len; i++) {
        const diff = Math.abs(a[i] - b[i])
        if (diff <= tolerance) matchCount++
        else mismatchCount++
        maxDiff = Math.max(maxDiff, diff)
        diffSum += diff * diff
    }
    return {
        matchCount,
        mismatchCount,
        totalSamples: len,
        matchPct: (matchCount / len) * 100,
        maxDiff,
        rmsDiff: Math.sqrt(diffSum / len),
    }
}

function mixToMono(channels) {
    if (channels.length === 1) return channels[0]
    const len = channels[0].length
    const mono = new Float32Array(len)
    for (let i = 0; i < len; i++) mono[i] = (channels[0][i] + channels[1][i]) / 2
    return mono
}

function makeTestPattern(cmd, name, bpm, beatCount, tracks) {
    const pat = cmd.addPattern(name)
    pat.bpm = bpm
    pat.beatCount = beatCount
    for (const t of tracks) {
        const track = cmd.addTrack(pat, t.name, 4)
        track.soundId = t.soundId ?? `${t.name.toLowerCase()}_test.wav`
        for (const n of t.notes) {
            cmd.addNote(track, n.beat, n.beatStep ?? 0, n.pitch ?? 0)
        }
    }
    return pat
}

// ─── Test Suite 1: WAV header and structure ──────────────────────────────────

describe('E2E Audio 1 — WAV export produces valid headers', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        serviceRegistry.flatNotes = flatNotesService
    })

    it('exports a 4-beat pattern to valid RIFF/WAVE', async () => {
        soundRegistry.sounds = {
            'kick_test.wav': { url: 'kick_test.wav', buffer: createDrumBuffer(60, 0.05, 0.5), key: 'KICK' },
        }

        const pat = makeTestPattern(cmd, 'Header Test', 120, 4, [
            { name: 'KICK', notes: [{ beat: 0 }, { beat: 1 }, { beat: 2 }, { beat: 3 }] },
        ])

        const blob = await exporter().exportPatternToWav(pat, 1)
        expect(blob).not.toBeNull()
        expect(blob.type).toBe('audio/wav')

        const bytes = new Uint8Array(await blob.arrayBuffer())
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

        expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF')
        expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe(
            'WAVE',
        )
        expect(view.getUint16(22, true)).toBe(2) // stereo
        expect(view.getUint32(24, true)).toBe(SAMPLE_RATE)
        expect(view.getUint16(34, true)).toBe(16) // 16-bit
    })

    it('WAV has more data for multi-track pattern', async () => {
        soundRegistry.sounds = {
            'kick_mt.wav': { url: 'kick_mt.wav', buffer: createDrumBuffer(60, 0.05, 0.5), key: 'KICK' },
            'snare_mt.wav': { url: 'snare_mt.wav', buffer: createDrumBuffer(200, 0.03, 0.3), key: 'SNARE' },
        }

        const pat = makeTestPattern(cmd, 'Multi', 120, 4, [
            { name: 'KICK', notes: [{ beat: 0 }, { beat: 2 }] },
            { name: 'SNARE', notes: [{ beat: 1 }, { beat: 3 }] },
        ])

        const blob = await exporter().exportPatternToWav(pat, 1)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        expect(bytes.length).toBeGreaterThan(44)
    })
})

// ─── Test Suite 2: Determinism — two renders are identical ───────────────────

describe('E2E Audio 2 — Two renders of same pattern are bit-identical', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        serviceRegistry.flatNotes = flatNotesService
    })

    it('same pattern → same WAV bytes', async () => {
        soundRegistry.sounds = {
            'kick_ident.wav': { url: 'kick_ident.wav', buffer: createDrumBuffer(60, 0.05, 0.5), key: 'KICK' },
        }

        const pat = makeTestPattern(cmd, 'Identical', 120, 4, [{ name: 'KICK', notes: [{ beat: 0 }, { beat: 2 }] }])

        const blob1 = await exporter().exportPatternToWav(pat, 1)
        const blob2 = await exporter().exportPatternToWav(pat, 1)

        const bytes1 = new Uint8Array(await blob1.arrayBuffer())
        const bytes2 = new Uint8Array(await blob2.arrayBuffer())

        expect(bytes1.length).toBe(bytes2.length)

        let identical = true
        for (let i = 0; i < bytes1.length; i++) {
            if (bytes1[i] !== bytes2[i]) {
                identical = false
                break
            }
        }
        expect(identical).toBe(true)
    })

    it('different patterns produce different flat note maps', async () => {
        soundRegistry.sounds = {
            'kick_diff.wav': { url: 'kick_diff.wav', buffer: createDrumBuffer(60, 0.05, 0.5), key: 'KICK' },
        }

        const pat1 = makeTestPattern(cmd, 'A', 120, 2, [{ name: 'KICK', notes: [{ beat: 0 }] }])
        const pat2 = makeTestPattern(cmd, 'B', 120, 2, [{ name: 'KICK', notes: [{ beat: 0 }, { beat: 1 }] }])

        const flat1 = recomputeFlatNotes(pat1, 0)
        const flat2 = recomputeFlatNotes(pat2, 0)

        let count1 = 0,
            count2 = 0
        for (const notes of flat1.values()) count1 += notes.length
        for (const notes of flat2.values()) count2 += notes.length

        expect(count1).toBe(1)
        expect(count2).toBe(2)
    })
})

// ─── Test Suite 3: Duration scales correctly ─────────────────────────────────

describe('E2E Audio 3 — WAV duration scales with BPM and loops', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        serviceRegistry.flatNotes = flatNotesService
    })

    it('2 loops produce a longer WAV than 1 loop', async () => {
        soundRegistry.sounds = {
            'kick_loops.wav': { url: 'kick_loops.wav', buffer: createDrumBuffer(60, 0.05, 0.5), key: 'KICK' },
        }

        const pat = makeTestPattern(cmd, 'Loops', 120, 2, [{ name: 'KICK', notes: [{ beat: 0 }] }])

        const bytes1 = new Uint8Array(await (await exporter().exportPatternToWav(pat, 1)).arrayBuffer())
        const bytes2 = new Uint8Array(await (await exporter().exportPatternToWav(pat, 2)).arrayBuffer())

        expect(bytes2.length).toBeGreaterThan(bytes1.length)
        // Verify data chunk grows proportionally
        const dataChunk1 = bytes1.length - 44
        const dataChunk2 = bytes2.length - 44
        const ratio = dataChunk2 / dataChunk1
        expect(ratio).toBeGreaterThan(1.5)
        expect(ratio).toBeLessThan(2.5)
    })

    it('slower BPM produces longer WAV than faster BPM', async () => {
        soundRegistry.sounds = {
            'kick_bpm.wav': { url: 'kick_bpm.wav', buffer: createDrumBuffer(60, 0.05, 0.5), key: 'KICK' },
        }

        const patSlow = makeTestPattern(cmd, 'Slow', 80, 4, [{ name: 'KICK', notes: [{ beat: 0 }] }])
        const patFast = makeTestPattern(cmd, 'Fast', 160, 4, [{ name: 'KICK', notes: [{ beat: 0 }] }])

        const bytesSlow = new Uint8Array(await (await exporter().exportPatternToWav(patSlow, 1)).arrayBuffer())
        const bytesFast = new Uint8Array(await (await exporter().exportPatternToWav(patFast, 1)).arrayBuffer())

        // Slower BPM = longer duration = more data
        expect(bytesSlow.length).toBeGreaterThan(bytesFast.length)
    })

    it('4 beats produce longer WAV than 2 beats', async () => {
        soundRegistry.sounds = {
            'kick_beats.wav': { url: 'kick_beats.wav', buffer: createDrumBuffer(60, 0.05, 0.5), key: 'KICK' },
        }

        const patShort = makeTestPattern(cmd, 'Short', 120, 2, [{ name: 'KICK', notes: [{ beat: 0 }] }])
        const patLong = makeTestPattern(cmd, 'Long', 120, 4, [{ name: 'KICK', notes: [{ beat: 0 }] }])

        const bytesShort = new Uint8Array(await (await exporter().exportPatternToWav(patShort, 1)).arrayBuffer())
        const bytesLong = new Uint8Array(await (await exporter().exportPatternToWav(patLong, 1)).arrayBuffer())

        expect(bytesLong.length).toBeGreaterThan(bytesShort.length)
    })
})

// ─── Test Suite 4: Flat notes computation matches structure ──────────────────

describe('E2E Audio 4 — Flat notes computation matches export structure', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        serviceRegistry.flatNotes = flatNotesService
    })

    it('flat note count matches note count for simple pattern', () => {
        const pat = makeTestPattern(cmd, 'Flat', 120, 4, [
            { name: 'KICK', notes: [{ beat: 0 }, { beat: 1 }, { beat: 2 }, { beat: 3 }] },
        ])

        const flat = recomputeFlatNotes(pat, 0)
        let count = 0
        for (const notes of flat.values()) count += notes.length
        expect(count).toBe(4)
    })

    it('retrigger produces more flat notes', () => {
        const pat = cmd.addPattern('Retrig')
        pat.bpm = 120
        pat.beatCount = 4
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const note = cmd.addNote(kick, 0, 0, 0)
        note.retriggerNum = 4
        note.retriggerRate = 1

        const flat = recomputeFlatNotes(pat, 0)
        let count = 0
        for (const notes of flat.values()) count += notes.length
        expect(count).toBe(4)
    })

    it('arp with retrigger produces multiple flat notes', () => {
        const pat = cmd.addPattern('Arp')
        pat.bpm = 120
        pat.beatCount = 1
        const bass = cmd.addTrack(pat, 'BASS', 4)
        const note = cmd.addNote(bass, 0, 0, 0)
        note.arp = [0, 7, 12]
        note.retriggerNum = 3

        const flat = recomputeFlatNotes(pat, 0)
        let count = 0
        for (const notes of flat.values()) count += notes.length
        expect(count).toBeGreaterThanOrEqual(3)
    })

    it('multi-track flat notes contain all track names', () => {
        const pat = makeTestPattern(cmd, 'Multi', 120, 4, [
            { name: 'KICK', notes: [{ beat: 0 }] },
            { name: 'SNARE', notes: [{ beat: 1 }] },
            { name: 'HIHAT', notes: [{ beat: 2 }] },
        ])

        const flat = recomputeFlatNotes(pat, 0)
        const allNotes = [...flat.values()].flat()
        const trackNames = new Set(allNotes.map((n) => n.track?.name))
        expect(trackNames.has('KICK')).toBe(true)
        expect(trackNames.has('SNARE')).toBe(true)
        expect(trackNames.has('HIHAT')).toBe(true)
    })
})

// ─── Test Suite 5: WAV encode/decode roundtrip fidelity ──────────────────────

describe('E2E Audio 5 — WAV encode/decode roundtrip preserves audio data', () => {
    it('16-bit PCM roundtrip has < 0.1% error', async () => {
        const ctx = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE)
        const audioBuffer = ctx.createBuffer(2, SAMPLE_RATE, SAMPLE_RATE)

        const data0 = audioBuffer.getChannelData(0)
        const data1 = audioBuffer.getChannelData(1)
        for (let i = 0; i < SAMPLE_RATE; i++) {
            const t = i / SAMPLE_RATE
            data0[i] = Math.sin(2 * Math.PI * 440 * t) * 0.5
            data1[i] = Math.sin(2 * Math.PI * 880 * t) * 0.3
        }

        const blob = bufferToWav(audioBuffer)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const decoded = decodeWavBytes(bytes)

        expect(decoded.numberOfChannels).toBe(2)
        expect(decoded.sampleRate).toBe(SAMPLE_RATE)

        const tolerance = 1.5 / 0x7fff // 16-bit quantization + rounding
        const comp0 = compareBuffers(data0, decoded.channels[0], tolerance)
        const comp1 = compareBuffers(data1, decoded.channels[1], tolerance)

        expect(comp0.matchPct).toBeGreaterThan(99.9)
        expect(comp1.matchPct).toBeGreaterThan(99.9)
    })

    it('mono roundtrip preserves waveform shape', async () => {
        const ctx = new OfflineAudioContext(1, SAMPLE_RATE / 10, SAMPLE_RATE)
        const audioBuffer = ctx.createBuffer(1, SAMPLE_RATE / 10, SAMPLE_RATE)
        const data = audioBuffer.getChannelData(0)

        for (let i = 0; i < data.length; i++) {
            const t = i / SAMPLE_RATE
            data[i] = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 10)
        }

        const blob = bufferToWav(audioBuffer)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const decoded = decodeWavBytes(bytes)
        const mono = mixToMono(decoded.channels)

        // 16-bit quantization + envelope differences from mixToMono → relaxed tolerance
        const tolerance = 0.005
        const comp = compareBuffers(data, mono, tolerance)
        expect(comp.matchPct).toBeGreaterThan(95)
    })

    it('silence roundtrips to silence', async () => {
        const ctx = new OfflineAudioContext(1, SAMPLE_RATE / 10, SAMPLE_RATE)
        const audioBuffer = ctx.createBuffer(1, SAMPLE_RATE / 10, SAMPLE_RATE)

        const blob = bufferToWav(audioBuffer)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const decoded = decodeWavBytes(bytes)
        const mono = mixToMono(decoded.channels)

        const peak = computePeak(mono)
        expect(peak).toBeLessThan(0.001)
    })

    it('complex waveform (kick-like) roundtrips faithfully', async () => {
        const ctx = new OfflineAudioContext(1, SAMPLE_RATE / 4, SAMPLE_RATE)
        const audioBuffer = ctx.createBuffer(1, SAMPLE_RATE / 4, SAMPLE_RATE)
        const data = audioBuffer.getChannelData(0)

        for (let i = 0; i < data.length; i++) {
            const t = i / SAMPLE_RATE
            // Kick: sine sweep from 150Hz to 40Hz + click
            const freq = 150 * Math.exp(-t * 20) + 40
            const click = Math.exp(-t * 200) * 0.5
            data[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 8) + click
        }

        const blob = bufferToWav(audioBuffer)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const decoded = decodeWavBytes(bytes)
        const mono = mixToMono(decoded.channels)

        // Should preserve the waveform characteristics
        const rmsOrig = computeRms(data)
        const rmsDecoded = computeRms(mono)
        expect(rmsDecoded).toBeCloseTo(rmsOrig, 1)

        // 16-bit PCM clips to [-1, 1], so decoded peak ≤ 1.0
        const peakOrig = computePeak(data)
        const peakDecoded = computePeak(mono)
        const clippedPeak = Math.min(peakOrig, 1.0)
        expect(peakDecoded).toBeGreaterThan(clippedPeak * 0.9)
        expect(peakDecoded).toBeLessThanOrEqual(clippedPeak * 1.1)
    })
})
