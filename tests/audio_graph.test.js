import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfStrip from '../src/audio/strip.js'
import MfSound from '../src/audio/sound.js'
import { MfGlobals } from '../src/core/globals.js'
import * as AudioMath from '../src/audio/math.js'
import { makeParam, makeNode, installWorkletMocks } from './helpers/worklet_mocks.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAudioCtx() {
    return {
        currentTime: 10,
        sampleRate: 44100,
        destination: {},
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
        createAnalyser: vi.fn(() => ({
            fftSize: 256,
            frequencyBinCount: 128,
            connect: vi.fn(() => {}),
            disconnect: vi.fn(() => {}),
            getByteTimeDomainData: vi.fn(() => {}),
        })),
    }
}

function makeMockMixer() {
    return {
        analyser: { fft: { __analyser: true } },
        lfo: { __master_lfo: true },
        getOrCreateStrip: vi.fn(async () => null),
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Audio Graph Validity', () => {
    let mockCtx

    beforeEach(() => {
        mockCtx = makeAudioCtx()
        MfGlobals.resetAll()
        installWorkletMocks()
    })

    describe('MfStrip Robustness (unified worklet API)', () => {
        it('updateSaturation handles extreme and invalid amounts without NaN', async () => {
            const strip = await MfStrip.create('TEST', mockCtx)

            strip.updateSaturation('soft', 999)
            expect(strip.stripNode.parameters.get('satDrive').setTargetAtTime)
                .not.toHaveBeenCalledWith(NaN, expect.any(Number), expect.any(Number))

            strip.updateSaturation('soft', -999)
            expect(strip.stripNode.parameters.get('satDrive').setTargetAtTime)
                .not.toHaveBeenCalledWith(NaN, expect.any(Number), expect.any(Number))

            strip.updateSaturation('invalid', 0.5)
            expect(strip.currentSaturationType).toBe('soft')
        })

        it('updateSaturation clamps internal drive to finite values for any amount', async () => {
            const strip = await MfStrip.create('TEST', mockCtx)
            strip.updateSaturation('soft', 999)
            const driveCalls = strip.stripNode.parameters.get('satDrive').setTargetAtTime.mock.calls
            const last = driveCalls[driveCalls.length - 1][0]
            expect(Number.isFinite(last)).toBe(true)
        })

        it('updateFilter handles extreme frequency values without producing NaN', async () => {
            const strip = await MfStrip.create('TEST', mockCtx)
            strip.updateFilter('lowpass', 1_000_000, 1)
            const cutoff = strip.stripNode.parameters.get('cutoff')
            const last = cutoff.setTargetAtTime.mock.calls.at(-1)[0]
            expect(Number.isFinite(last)).toBe(true)
        })

        it('updateFilter handles NaN frequency without producing NaN', async () => {
            const strip = await MfStrip.create('TEST', mockCtx)
            expect(() => strip.updateFilter('lowpass', NaN, 0.5)).not.toThrow()
            const cutoff = strip.stripNode.parameters.get('cutoff')
            const last = cutoff.setTargetAtTime.mock.calls.at(-1)[0]
            expect(Number.isFinite(last)).toBe(true)
        })

        it('updateLfo handles null or missing config gracefully', async () => {
            const strip = await MfStrip.create('TEST', mockCtx)
            expect(() => strip.updateLfo('pitchLfo', null)).not.toThrow()
            expect(strip.stripNode.parameters.get('lfoPitchDepth').setTargetAtTime)
                .toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number))
        })

        it('updateLfo with finite config does not throw for any LFO channel', async () => {
            const strip = await MfStrip.create('TEST', mockCtx)
            const lfos = ['pitchLfo', 'velocityLfo', 'panLfo', 'filterFreqLfo', 'filterQLfo'];
            for (const key of lfos) {
                expect(() => strip.updateLfo(key, { freq: 1, min: 0, max: 0.5 })).not.toThrow()
            }
        })

        it('every saturation type produces a finite drive value', async () => {
            const strip = await MfStrip.create('TEST', mockCtx)
            for (const type of ['soft', 'hard', 'tape']) {
                strip.updateSaturation(type, 0.8)
                const last = strip.stripNode.parameters.get('satDrive').setTargetAtTime.mock.calls.at(-1)[0]
                expect(Number.isFinite(last)).toBe(true)
            }
        })
    })

    describe('AudioMath Safety', () => {
        it('computeOscFrequency always returns a finite number', () => {
            expect(Number.isFinite(AudioMath.computeOscFrequency(1, NaN, Infinity))).toBe(true)
            expect(Number.isFinite(AudioMath.computeOscFrequency(NaN, 0, 0))).toBe(true)
        })
    })

    describe('MfSound Bypass Behaviour', () => {
        it('track effect bypass flags mute effects without clearing stored amounts', async () => {
            const strip = await MfStrip.create('TEST', mockCtx)
            const mixer = makeMockMixer()
            const sound = new MfSound(mockCtx, mixer, {}, {})

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

            // Effect busses are set to 0 (muted)
            expect(strip.currentReverbAmount).toBe(0)
            expect(strip.currentDelayAmount).toBe(0)
            expect(strip.currentSaturationAmount).toBe(0)
        })
    })
})
