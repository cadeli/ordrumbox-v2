/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfWavExporter from '../src/audio/export/wav_exporter.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import * as patternsManager from '../src/patterns/manager.js'

// Mock OfflineAudioContext
class MockOfflineAudioContext {
    constructor(channels, length, sampleRate) {
        this.channels = channels
        this.length = length
        this.sampleRate = sampleRate
        this.currentTime = 0
        this.destination = {
            connect: vi.fn(),
            disconnect: vi.fn()
        }
        // AudioWorklet is supported in OfflineAudioContext; provide a no-op stub
        // so WorkletLoader.ensureLoaded() resolves and the test can exercise the
        // full worklet-based export path.
        this.audioWorklet = {
            addModule: vi.fn().mockResolvedValue(undefined)
        }
    }

    createGain() { return { gain: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createDynamicsCompressor() { return { threshold: { value: 0, setValueAtTime: vi.fn() }, knee: { value: 0, setValueAtTime: vi.fn() }, ratio: { value: 0, setValueAtTime: vi.fn() }, attack: { value: 0, setValueAtTime: vi.fn() }, release: { value: 0, setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, Q: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createOscillator() { return { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), frequency: { value: 0, setValueAtTime: vi.fn() } } }
    createAnalyser() { return { fftSize: 1024, connect: vi.fn(), disconnect: vi.fn() } }
    createBuffer(ch, len, sr) { return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) } }
    createBufferSource() { return { buffer: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), loop: false, playbackRate: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() } } }
    createStereoPanner() { return { pan: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createWaveShaper() { return { curve: null, oversample: 'none', connect: vi.fn(), disconnect: vi.fn() } }
    createConvolver() { return { buffer: null, connect: vi.fn(), disconnect: vi.fn() } }
    createDelay() { return { delayTime: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() } }
    createConstantSource() { return { offset: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() } }

    startRendering() {
        return Promise.resolve({
            numberOfChannels: this.channels,
            length: this.length,
            sampleRate: this.sampleRate,
            getChannelData: (ch) => new Float32Array(this.length)
        })
    }
}

global.OfflineAudioContext = MockOfflineAudioContext

// Stub AudioWorkletNode globally so WorkletLoader.createNode can instantiate
// worklet nodes without throwing. The test never inspects the actual audio
// signal — it just needs the export path to complete the worklet graph
// construction without errors.
class MockAudioWorkletNode {
    constructor(_ctx, _name, _options) {
        this.parameters = {
            get: () => ({
                value: 0,
                setValueAtTime: () => {},
                setTargetAtTime: () => {},
                linearRampToValueAtTime: () => {},
                cancelScheduledValues: () => {},
            }),
        }
    }
    connect() { return this }
    disconnect() {}
}
global.AudioWorkletNode = MockAudioWorkletNode

describe('WAV Exporter', () => {
    beforeEach(() => {
        soundRegistry.reset()
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = patternsManager
        // Mock sounds
        soundRegistry.sounds = {
            'kick.wav': { url: 'kick.wav', buffer: { duration: 1, length: 44100, getChannelData: () => new Float32Array(44100) }, key: 'KICK' }
        }
    })

    it('successfully schedules notes in offline context', async () => {
        const pattern = {
            name: 'Test Pattern',
            bpm: 120,
            nbBeats: 1,
            tracks: [
                {
                    name: 'KICK',
                    soundId: 'kick.wav',
                    nbBeats: 1,
                    stepsPerBeat: 4,
                    mute: false,
                    notes: [
                        { beat: 0, beatStep: 0, velocity: 1, pitch: 0 }
                    ]
                }
            ]
        }

        const exporter = new MfWavExporter()
        
        // Spy on AudioContext.createBufferSource to see if something is played
        const createBufferSourceSpy = vi.spyOn(MockOfflineAudioContext.prototype, 'createBufferSource')
        
        const blob = await exporter.exportPatternToWav(pattern, 1)
        expect(blob.type).toBe('audio/wav')
        
        // Verify that playNotes was called and it created a buffer source
        expect(createBufferSourceSpy).toHaveBeenCalled()
    })

    it('calculates correct total duration for the offline context', async () => {
        const pattern = {
            name: 'Tempo Test',
            bpm: 120,
            nbBeats: 2,
            tracks: []
        }
        
        let capturedArgs = null
        const orig = global.OfflineAudioContext
        global.OfflineAudioContext = function(...args) {
            capturedArgs = args
            return new orig(...args)
        }
        
        const exporter = new MfWavExporter()
        await exporter.exportPatternToWav(pattern, 1)
        
        global.OfflineAudioContext = orig
        
        // TICK=32, TICK_TIME=(60*4)/(120*32)*0.25=0.015625
        // duration = 2 * 32 * 1 * 0.015625 = 1 second
        // samples = 1 * 44100 = 44100
        expect(capturedArgs[0]).toBe(2)
        expect(capturedArgs[1]).toBe(44100)
        expect(capturedArgs[2]).toBe(44100)
    })
})
