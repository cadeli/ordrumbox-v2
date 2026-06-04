/**
 * @vitest-environment jsdom
 *
 * Tests for the AudioEngine.upgradeToWorklets auto-upgrade feature.
 * Verifies that when appState.useWorklets is on, all strips + mixer
 * get upgraded to worklet mode.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import AudioEngine from '../src/audio/engine.js'
import WorkletBridge from '../src/audio/worklets/bridge.js'

// Mock the patterns engine module (engine.js uses it)
vi.mock('../src/patterns/engine.js', () => ({
    computeFlatNotesFromPattern: vi.fn(() => new Map()),
}))

vi.mock('../src/logic/services/instruments_manager.js', () => ({
    default: class { }
}))

// Mock WorkletBridge to track calls
vi.mock('../src/audio/worklets/bridge.js', () => ({
    default: {
        isAvailable: vi.fn(),
        upgrade: vi.fn().mockResolvedValue(true),
        upgradeLfos: vi.fn().mockResolvedValue(true),
        upgradeMixer: vi.fn().mockResolvedValue(true),
    }
}))

function makeAudioCtx() {
    return {
        sampleRate: 44100,
        currentTime: 0,
        destination: {},
        audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
        createGain: vi.fn(() => ({ gain: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(function () { return this }), disconnect: vi.fn() })),
        createOscillator: vi.fn(() => ({
            type: 'sine',
            frequency: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            detune: { value: 0, setValueAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn(),
            start: vi.fn(), stop: vi.fn()
        })),
        createBiquadFilter: vi.fn(() => ({
            type: 'allpass',
            frequency: { value: 1000, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            Q: { value: 1, setValueAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createWaveShaper: vi.fn(() => ({ curve: null, oversample: '4x', connect: vi.fn(function () { return this }), disconnect: vi.fn() })),
        createConvolver: vi.fn(() => ({ buffer: null, connect: vi.fn(function () { return this }), disconnect: vi.fn() })),
        createDelay: vi.fn(() => ({ delayTime: { value: 0.25, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(function () { return this }), disconnect: vi.fn() })),
        createStereoPanner: vi.fn(() => ({ pan: { value: 0, setTargetAtTime: vi.fn() }, connect: vi.fn(function () { return this }), disconnect: vi.fn() })),
        createDynamicsCompressor: vi.fn(() => ({
            threshold: { value: 0, setValueAtTime: vi.fn() },
            knee: { value: 0, setValueAtTime: vi.fn() },
            ratio: { value: 1, setValueAtTime: vi.fn() },
            attack: { value: 0, setValueAtTime: vi.fn() },
            release: { value: 0, setValueAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createAnalyser: vi.fn(() => ({
            fftSize: 0,
            frequencyBinCount: 512,
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createBuffer: vi.fn((ch, len, sr) => ({
            numberOfChannels: ch, length: len, sampleRate: sr,
            getChannelData: vi.fn(() => new Float32Array(len))
        })),
        createBufferSource: vi.fn(() => ({
            buffer: null, loop: false,
            connect: vi.fn(function () { return this }),
            start: vi.fn(), stop: vi.fn(),
            onended: null
        }))
    }
}

describe('AudioEngine.upgradeToWorklets', () => {
    let ctx, engine

    beforeEach(() => {
        ctx = makeAudioCtx()
        appState.useWorklets = 1
        appState.workletStatus = 'unknown'
        WorkletBridge.isAvailable.mockReturnValue(true)
        WorkletBridge.upgrade.mockClear().mockResolvedValue(true)
        WorkletBridge.upgradeLfos.mockClear().mockResolvedValue(true)
        WorkletBridge.upgradeMixer.mockClear().mockResolvedValue(true)

        engine = new AudioEngine({
            audioCtx: ctx,
            sounds: {},
            generatedSounds: {},
            patterns: [],
            TICK: 32,
            secondsPerBeat: 0.5
        })
    })

    it('returns true and sets status=active when worklets available', async () => {
        const result = await engine.upgradeToWorklets()
        expect(result).toBe(true)
        expect(appState.workletStatus).toBe('active')
    })

    it('calls upgradeMixer on the mixer', async () => {
        await engine.upgradeToWorklets()
        expect(WorkletBridge.upgradeMixer).toHaveBeenCalledWith(engine.mixer)
    })

    it('upgrades all existing strips via WorkletBridge.upgrade', async () => {
        // Add some strips before upgrading
        engine.mixer.addStrip('KICK')
        engine.mixer.addStrip('SNARE')
        await engine.upgradeToWorklets()
        expect(WorkletBridge.upgrade).toHaveBeenCalledTimes(2)
        expect(WorkletBridge.upgradeLfos).toHaveBeenCalledTimes(2)
    })

    it('returns false and sets status=unavailable when worklets not available', async () => {
        WorkletBridge.isAvailable.mockReturnValue(false)
        const result = await engine.upgradeToWorklets()
        expect(result).toBe(false)
        expect(appState.workletStatus).toBe('unavailable')
    })

    it('returns false and sets status=unavailable when upgradeMixer fails', async () => {
        WorkletBridge.upgradeMixer.mockResolvedValue(false)
        const result = await engine.upgradeToWorklets()
        expect(result).toBe(false)
        expect(appState.workletStatus).toBe('unavailable')
    })

    it('is idempotent: second call is a no-op', async () => {
        await engine.upgradeToWorklets()
        const calls1 = WorkletBridge.upgrade.mock.calls.length
        await engine.upgradeToWorklets()
        const calls2 = WorkletBridge.upgrade.mock.calls.length
        expect(calls2).toBe(calls1)  // no new calls
    })

    it('auto-upgrades new strips added after upgrade', async () => {
        await engine.upgradeToWorklets()
        WorkletBridge.upgrade.mockClear()
        WorkletBridge.upgradeLfos.mockClear()
        // Add a new strip after upgrade (sync call)
        console.log('Before addStrip: hooked=', engine.mixer._autoUpgradeHooked, 'status=', appState.workletStatus)
        engine.mixer.addStrip('HATS')
        console.log('After addStrip: upgrade calls=', WorkletBridge.upgrade.mock.calls.length)
        // The hook fires the upgrade immediately (mock resolves sync)
        expect(WorkletBridge.upgrade).toHaveBeenCalled()
        expect(WorkletBridge.upgradeLfos).toHaveBeenCalled()
    })

    it('does NOT auto-upgrade new strips if worklet upgrade failed', async () => {
        WorkletBridge.upgradeMixer.mockResolvedValue(false)
        await engine.upgradeToWorklets()
        WorkletBridge.upgrade.mockClear()
        engine.mixer.addStrip('HATS')
        expect(WorkletBridge.upgrade).not.toHaveBeenCalled()
    })

    it('does NOT auto-upgrade new strips if useWorklets=0', () => {
        appState.useWorklets = 0
        appState.workletStatus = 'unknown'
        WorkletBridge.upgrade.mockClear()
        // Don't call upgradeToWorklets, just add a strip
        engine.mixer.addStrip('HATS')
        expect(WorkletBridge.upgrade).not.toHaveBeenCalled()
    })
})

describe('AudioEngine.start with worklet auto-upgrade', () => {
    let ctx, engine

    beforeEach(() => {
        ctx = makeAudioCtx()
        appState.useWorklets = 0  // default off
        appState.workletStatus = 'unknown'
        WorkletBridge.upgradeMixer.mockClear().mockResolvedValue(true)
    })

    it('does NOT auto-upgrade when useWorklets=0', () => {
        engine = new AudioEngine({
            audioCtx: ctx, sounds: {}, generatedSounds: {}, patterns: [],
            TICK: 32, secondsPerBeat: 0.5
        })
        engine.start()
        expect(WorkletBridge.upgradeMixer).not.toHaveBeenCalled()
        expect(appState.workletStatus).toBe('unknown')
    })

    it('auto-upgrades when useWorklets=1 and not yet active', () => {
        appState.useWorklets = 1
        engine = new AudioEngine({
            audioCtx: ctx, sounds: {}, generatedSounds: {}, patterns: [],
            TICK: 32, secondsPerBeat: 0.5
        })
        engine.start()
        // upgradeMixer is called async; status updated on completion
        expect(WorkletBridge.upgradeMixer).toHaveBeenCalled()
    })

    it('does NOT re-upgrade if workletStatus=active', () => {
        appState.useWorklets = 1
        appState.workletStatus = 'active'
        engine = new AudioEngine({
            audioCtx: ctx, sounds: {}, generatedSounds: {}, patterns: [],
            TICK: 32, secondsPerBeat: 0.5
        })
        engine.start()
        expect(WorkletBridge.upgradeMixer).not.toHaveBeenCalled()
    })
})

describe('appState useWorklets / workletStatus', () => {
    beforeEach(() => {
        appState.useWorklets = 0
        appState.workletStatus = 'unknown'
    })

    it('default useWorklets=0', () => {
        expect(appState.useWorklets).toBe(0)
    })

    it('default workletStatus=unknown', () => {
        expect(appState.workletStatus).toBe('unknown')
    })

    it('reset() clears useWorklets and workletStatus', () => {
        appState.useWorklets = 1
        appState.workletStatus = 'active'
        appState.reset()
        expect(appState.useWorklets).toBe(0)
        expect(appState.workletStatus).toBe('unknown')
    })
})
