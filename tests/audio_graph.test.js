import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfStrip from '../src/audio/strip.js'
import MfSound from '../src/audio/sound.js'
import { MfGlobals } from '../src/core/globals.js'
import * as AudioMath from '../src/audio/math.js'

function createMockAudioCtx() {
    const node = {
        disconnect: vi.fn(),
        connect: vi.fn(),
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
    }
    const param = { ...node, value: 0 }
    return {
        currentTime: 10,
        sampleRate: 44100,
        destination: {},
        createGain: vi.fn(() => ({ ...node, gain: { ...param, value: 1 } })),
        createOscillator: vi.fn(() => ({ ...node, start: vi.fn(), stop: vi.fn(), frequency: { ...param }, detune: { ...param } })),
        createBiquadFilter: vi.fn(() => ({ ...node, type: 'lowpass', frequency: { ...param }, Q: { ...param } })),
        createDelay: vi.fn(() => ({ ...node, delayTime: { ...param } })),
        createConvolver: vi.fn(() => ({ ...node, buffer: null })),
        createStereoPanner: vi.fn(() => ({ ...node, pan: { ...param } })),
        createWaveShaper: vi.fn(() => ({ ...node, curve: null, oversample: '4x' })),
        createBuffer: vi.fn((ch, len, sr) => ({ numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: vi.fn(() => new Float32Array(len)) })),
    }
}

describe('Audio Graph Validity', () => {
    let mockCtx

    beforeEach(() => {
        mockCtx = createMockAudioCtx()
        MfGlobals.resetAll()
    })

    describe('MfStrip Robustness', () => {
        it('updateSaturation handles extreme and invalid amounts without NaN', () => {
            const strip = new MfStrip('TEST', mockCtx)
            
            // Extreme high
            strip.updateSaturation('soft', 999)
            expect(mockCtx.createGain().gain.setTargetAtTime).not.toHaveBeenCalledWith(NaN, expect.any(Number), expect.any(Number))
            
            // Extreme low
            strip.updateSaturation('soft', -999)
            expect(mockCtx.createGain().gain.setTargetAtTime).not.toHaveBeenCalledWith(NaN, expect.any(Number), expect.any(Number))

            // Invalid type
            strip.updateSaturation('invalid', 0.5)
            expect(strip.currentSaturationType).toBe('soft')
        })

        it('updateFilter handles extreme frequency values', () => {
            const strip = new MfStrip('TEST', mockCtx)
            
            // Very high freq
            strip.updateFilter('lowpass', 1000000, 1)
            // It should be normalized/clamped by Utils.normalizeTrackFilterFreqValue
            // Note: MfStrip uses Utils.normalizeTrackFilterFreqValue
            // We should check if those values sent to setTargetAtTime are finite
            const calls = strip.filter1.frequency.setTargetAtTime.mock.calls
            const lastFreq = calls[calls.length - 1][0]
            expect(Number.isFinite(lastFreq)).toBe(true)
            expect(lastFreq).toBeLessThanOrEqual(20000) 
        })

        it('updateLfo handles null or missing config gracefully', () => {
            const strip = new MfStrip('TEST', mockCtx)
            expect(() => strip.updateLfo('pitchLfo', null)).not.toThrow()
            expect(strip.lfos.pitchLfo.gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
        })

        it('createSaturationCurve produces valid Float32Array for all types', () => {
            const strip = new MfStrip('TEST', mockCtx)
            const types = ['soft', 'hard', 'tape']
            types.forEach(type => {
                const curve = strip.createSaturationCurve(type, 0.8)
                expect(curve).toBeInstanceOf(Float32Array)
                expect(curve.some(v => isNaN(v))).toBe(false)
                expect(curve.length).toBeGreaterThan(0)
            })
        })

        it('track effect bypass flags mute effects without clearing stored amounts', () => {
            const strip = new MfStrip('TEST', mockCtx)
            const sound = new MfSound(mockCtx, {}, {}, {})

            sound.updateStripFromTrack(strip, {
                name: 'TEST',
                reverbOn: false,
                reverbType: 'room',
                reverbAmount: 0.7,
                delayOn: false,
                delayType: 'tape',
                delayTime: 1,
                delayAmount: 0.6,
                saturationOn: false,
                saturationType: 'hard',
                saturationAmount: 0.5,
            }, mockCtx.currentTime)

            expect(strip.currentReverbAmount).toBe(0)
            expect(strip.currentDelayAmount).toBe(0)
            expect(strip.currentSaturationAmount).toBe(0)
        })
    })

    describe('AudioMath Safety', () => {
        it('computeOscFrequency always returns a finite number', () => {
            expect(Number.isFinite(AudioMath.computeOscFrequency(1, NaN, Infinity))).toBe(true)
            expect(Number.isFinite(AudioMath.computeOscFrequency(NaN, 0, 0))).toBe(true)
        })

        it('computeImpulseSampleData handles zero duration', () => {
            const preset = { duration: 0, decay: 0, preDelay: 0, tone: 1 }
            const data = AudioMath.computeImpulseSampleData(44100, preset)
            expect(data).toBeInstanceOf(Float32Array)
            expect(data.length).toBe(1) // Math.max(1, ...)
        })

        it('computeSaturationCurve handles amount > 1', () => {
            const curve = AudioMath.computeSaturationCurve('soft', 2.0)
            expect(curve.some(v => isNaN(v))).toBe(false)
            // Should be clamped to 1.0 internally
        })
    })
})
