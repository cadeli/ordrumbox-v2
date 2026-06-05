import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfStrip from '../src/audio/strip.js'
import MfSound from '../src/audio/sound.js'
import WorkletLoader from '../src/audio/worklets/loader.js'
import { MfGlobals } from '../src/core/globals.js'
import * as AudioMath from '../src/audio/math.js'

// ─── Worklet + AudioContext mocks ───────────────────────────────────────────

function makeParam(v = 0) {
    return {
        value: v,
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        connect: vi.fn(),
    }
}

function makeNode(extra = {}) {
    return { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), ...extra }
}

const STRIP_PARAM_NAMES = [
    'cutoff', 'q', 'filterMode',
    'satType', 'satDrive', 'satOut', 'satMix',
    'revRoom', 'revDamp', 'revWidth', 'revMix',
    'dlyTimeL', 'dlyTimeR', 'dlyFb', 'dlyMix', 'dlyMode',
    'volume', 'pan',
    'lfoPitchFreq', 'lfoPitchWave', 'lfoPitchDepth',
    'lfoVeloFreq', 'lfoVeloWave', 'lfoVeloDepth',
    'lfoPanFreq', 'lfoPanWave', 'lfoPanDepth',
    'lfoCutFreq', 'lfoCutWave', 'lfoCutDepth',
    'lfoQFreq', 'lfoQWave', 'lfoQDepth'
];

function installWorkletMocks() {
    vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
    vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
    vi.spyOn(WorkletLoader, 'createNode').mockImplementation((_ctx, name) => {
        const paramNames = name === 'strip' ? STRIP_PARAM_NAMES : []
        const params = new Map()
        for (const n of paramNames) params.set(n, makeParam())
        return { ...makeNode(), parameters: params }
    })
}

function makeAudioCtx() {
    return {
        currentTime: 10,
        sampleRate: 44100,
        destination: {},
        createGain: vi.fn(() => ({ ...makeNode(), gain: makeParam(1) })),
        createStereoPanner: vi.fn(() => ({ ...makeNode(), pan: makeParam(0) })),
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

        it('computeImpulseSampleData handles zero duration', () => {
            const preset = { duration: 0, decay: 0, preDelay: 0, tone: 1 }
            const data = AudioMath.computeImpulseSampleData(44100, preset)
            expect(data).toBeInstanceOf(Float32Array)
            expect(data.length).toBe(1) // Math.max(1, …)
        })

        it('computeSaturationCurve handles amount > 1', () => {
            const curve = AudioMath.computeSaturationCurve('soft', 2.0)
            expect(curve.some(v => isNaN(v))).toBe(false)
        })

        it('computeSaturationCurve handles negative amount without NaN', () => {
            const curve = AudioMath.computeSaturationCurve('soft', -1)
            expect(curve.some(v => isNaN(v))).toBe(false)
        })

        it('computeSaturationCurve returns a Float32Array for all 3 types', () => {
            for (const type of ['soft', 'hard', 'tape']) {
                const curve = AudioMath.computeSaturationCurve(type, 0.5)
                expect(curve).toBeInstanceOf(Float32Array)
                expect(curve.length).toBeGreaterThan(0)
            }
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

        it('updateStripFromTrack with empty track does not throw', async () => {
            const strip = await MfStrip.create('TEST', mockCtx)
            const mixer = makeMockMixer()
            const sound = new MfSound(mockCtx, mixer, {}, {})

            expect(() => sound.updateStripFromTrack(strip, { name: 'TEST' }, mockCtx.currentTime)).not.toThrow()
        })
    })
})
