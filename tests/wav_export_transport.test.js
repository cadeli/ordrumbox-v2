/**
 * WavExporter must never swap out serviceRegistry.transport: seq/sound/UI
 * services keep reading start/tick/isRunning on the live transport while an
 * export runs, and synth voices read transport.bpm for auto-release timing.
 * Only the bpm value is changed in place and restored afterwards — even when
 * the render fails.
 *
 * Engine is mocked here: this file targets the transport handover only,
 * not the rendering pipeline (covered by wav_export_functional.test.js).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
    playNotesImpl: async () => {},
}))

vi.mock('../src/audio/engine.js', () => ({
    default: class MockAudioEngine {
        mixer = { setBpm: vi.fn() }
        start = vi.fn().mockResolvedValue(undefined)
        playNotes = (...args) => hoisted.playNotesImpl(...args)
    },
}))

import WavExporter from '../src/audio/export/wav_exporter.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

class MockOfflineAudioContext {
    constructor(channels, length, sampleRate) {
        this.channels = channels
        this.length = length
        this.sampleRate = sampleRate
    }
    async startRendering() {
        return {
            numberOfChannels: this.channels,
            length: this.length,
            sampleRate: this.sampleRate,
            getChannelData: () => new Float32Array(this.length),
        }
    }
}
globalThis.OfflineAudioContext = MockOfflineAudioContext

describe('WAV export — live transport preservation', () => {
    const pattern = { name: 'TransportTest', bpm: 128, beatCount: 1, tracks: [] }

    beforeEach(() => {
        serviceRegistry.reset()
        soundRegistry.reset()
        hoisted.playNotesImpl = async () => {}
    })

    it('mutates bpm in place (same object) during render, then restores it', async () => {
        const transport = { bpm: 98, isRunning: true, tick: 42, start: vi.fn() }
        serviceRegistry.transport = transport

        const during = []
        hoisted.playNotesImpl = () => {
            during.push({ sameObject: serviceRegistry.transport === transport, bpm: serviceRegistry.transport?.bpm })
        }

        await new WavExporter().exportPatternToWav(pattern, 1)

        expect(during.length).toBeGreaterThan(0)
        expect(during.every((d) => d.sameObject)).toBe(true)
        expect(during[0].bpm).toBe(128)

        expect(serviceRegistry.transport).toBe(transport)
        expect(transport.bpm).toBe(98)
        expect(transport.isRunning).toBe(true)
        expect(transport.tick).toBe(42)
        expect(typeof transport.start).toBe('function')
    })

    it('restores the transport bpm even when the render fails', async () => {
        const transport = { bpm: 98, isRunning: true, tick: 0 }
        serviceRegistry.transport = transport
        hoisted.playNotesImpl = () => {
            throw new Error('render failed')
        }

        await expect(new WavExporter().exportPatternToWav(pattern, 1)).rejects.toThrow('render failed')

        expect(serviceRegistry.transport).toBe(transport)
        expect(transport.bpm).toBe(98)
        expect(transport.isRunning).toBe(true)
    })

    it('removes the temporary stub when no transport existed', async () => {
        serviceRegistry.transport = null

        let bpmDuringRender = null
        hoisted.playNotesImpl = () => {
            bpmDuringRender = serviceRegistry.transport?.bpm ?? null
        }

        await new WavExporter().exportPatternToWav(pattern, 1)

        expect(bpmDuringRender).toBe(128)
        expect(serviceRegistry.transport).toBeNull()
    })
})
