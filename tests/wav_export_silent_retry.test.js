/**
 * The Chromium offline-rendering race: an OfflineAudioContext renders eagerly
 * and can play past a note's time before the messages posted to its AudioWorklet
 * reach the processor, which yields a perfectly valid but entirely SILENT export.
 *
 * It cannot be acknowledged away (the processor only exists once rendering
 * starts), so the exporter looks at the result and renders again with a longer
 * flush, then fails loudly instead of handing out a silent file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({ renderCount: 0, silentRenders: 0 }))

vi.mock('../src/audio/engine.js', () => ({
    default: class MockAudioEngine {
        mixer = { setBpm: vi.fn() }
        start = vi.fn().mockResolvedValue(undefined)
        syncAllTracks = vi.fn().mockResolvedValue(undefined)
        playNotes = vi.fn().mockResolvedValue(undefined)
    },
}))

import WavExporter from '../src/audio/export/wav_exporter.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { logger } from '../src/core/logger.js'

/** Renders silence for the first `silentRenders` contexts, then a real signal. */
class MockOfflineAudioContext {
    constructor(channels, length, sampleRate) {
        this.channels = channels
        this.length = length
        this.sampleRate = sampleRate
    }
    async startRendering() {
        const silent = hoisted.renderCount < hoisted.silentRenders
        hoisted.renderCount++
        const data = new Float32Array(this.length)
        if (!silent) data.fill(0.5, 0, Math.min(this.length, 100))
        return {
            numberOfChannels: this.channels,
            length: this.length,
            sampleRate: this.sampleRate,
            getChannelData: () => data,
        }
    }
}

/** Real timers would add 3 x 400 ms to every case. */
const originalSetTimeout = globalThis.setTimeout

describe('WavExporter — silent render retry', () => {
    /** One note on an unmuted track: the export is expected to make sound. */
    const withNote = () => ({
        name: 'Race',
        bpm: 120,
        beatCount: 1,
        tracks: [{ name: 'KICK', mute: false, notes: [{ beat: 0, beatStep: 0, velocity: 1 }] }],
    })
    const emptyPattern = () => ({ name: 'Empty', bpm: 120, beatCount: 1, tracks: [] })

    beforeEach(() => {
        hoisted.renderCount = 0
        hoisted.silentRenders = 0
        serviceRegistry.reset()
        soundRegistry.reset()
        globalThis.OfflineAudioContext = MockOfflineAudioContext
        // the flush is a wall-clock wait: skip it, the race is what is under test
        globalThis.setTimeout = (fn) => originalSetTimeout(fn, 0)
        vi.spyOn(logger, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        globalThis.setTimeout = originalSetTimeout
        vi.restoreAllMocks()
    })

    it('renders once when the first attempt has audio', async () => {
        const blob = await new WavExporter().exportPatternToWav(withNote(), 1)
        expect(hoisted.renderCount).toBe(1)
        expect(blob.type).toBe('audio/wav')
    })

    it('renders again when the first attempt came out silent, and returns that one', async () => {
        hoisted.silentRenders = 1
        const blob = await new WavExporter().exportPatternToWav(withNote(), 1)
        expect(hoisted.renderCount).toBe(2)
        expect(blob.size).toBeGreaterThan(44) // a header alone is 44 bytes
    })

    it('gives up after three silent attempts instead of writing a silent file', async () => {
        hoisted.silentRenders = 99
        await expect(new WavExporter().exportPatternToWav(withNote(), 1)).rejects.toThrow(/stayed silent after 3/)
        expect(hoisted.renderCount).toBe(3)
    })

    it('does not retry a pattern that is silent on purpose (no notes)', async () => {
        const blob = await new WavExporter().exportPatternToWav(emptyPattern(), 1)
        expect(hoisted.renderCount).toBe(1)
        expect(blob.type).toBe('audio/wav')
    })

    it('does not retry when every note sits on a muted track', async () => {
        const pattern = withNote()
        pattern.tracks[0].mute = true
        hoisted.silentRenders = 99
        await new WavExporter().exportPatternToWav(pattern, 1)
        expect(hoisted.renderCount).toBe(1)
    })

    it('retries a song export too', async () => {
        const song = { name: 'S', bpm: 120, loopBars: 1, clips: [{ pattern: 'p1', bar: 0, length: 1 }] }
        const patterns = [{ id: 'p1', name: 'P', bpm: 120, beatCount: 1, tracks: withNote().tracks }]
        hoisted.silentRenders = 2
        const blob = await new WavExporter().exportSongToWav(song, { patterns })
        expect(hoisted.renderCount).toBe(3)
        expect(blob.type).toBe('audio/wav')
    })
})
