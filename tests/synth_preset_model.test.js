// tests/synth_preset_model.test.js
/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SynthPresetModel from '../src/ui/synth_editor/synth_preset_model.js'
import { cacheGeneratedSounds } from '../src/cache/idb_cache.js'

vi.mock('../src/cache/idb_cache.js', () => ({
    cacheGeneratedSounds: vi.fn().mockResolvedValue(undefined),
}))

const makeSound = (overrides = {}) => ({
    masterVolume: 0.8,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    vco2: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    vco3: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1 },
    lfo: { target: 'NOT', wave: 'sine', freq: 0, depth: 0, sync: 'off' },
    envelope: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 },
    ...overrides,
})

function makeModel(sounds = { BASS1: makeSound() }) {
    const soundRegistry = { generatedSounds: sounds }
    const setGeneratedSounds = vi.fn()
    const serviceRegistry = { audioEngine: { setGeneratedSounds }, audioCtx: { currentTime: 0 } }
    const model = new SynthPresetModel({ soundRegistry, serviceRegistry })
    return { model, soundRegistry, setGeneratedSounds }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('subscribe / notify', () => {
    it('notifies subscribers on loadPreset and stops after unsubscribe', () => {
        const { model } = makeModel({ A: makeSound(), B: makeSound() })
        const listener = vi.fn()
        const off = model.subscribe(listener)

        model.loadPreset('A')
        expect(listener).toHaveBeenCalledTimes(1)

        off()
        model.loadPreset('B')
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('notify() re-renders subscribers for out-of-band mutations', () => {
        const { model } = makeModel()
        const listener = vi.fn()
        model.subscribe(listener)

        model.notify()
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('clearSession() is silent (nothing left to render)', () => {
        const { model } = makeModel()
        const listener = vi.fn()
        model.subscribe(listener)
        model.loadPreset('BASS1')
        listener.mockClear()

        model.clearSession()
        expect(listener).not.toHaveBeenCalled()
    })
})

describe('loadPreset', () => {
    it('clones original and draft, and hydrates missing groups with defaults', () => {
        const { model } = makeModel({ BASS1: makeSound() })
        expect(model.loadPreset('BASS1')).toBe(true)

        expect(model.editKey).toBe('BASS1')
        expect(model.original).toBeDefined()
        expect(model.draft).not.toBe(model.original)
        expect(model.draft.noise.filterType).toBe('highpass')
        expect(model.draft.subGain).toBe(0)
        expect(model.draft.masterVolume).toBe(0.8)
    })

    it('returns false for a missing key and keeps the session', () => {
        const { model } = makeModel({ BASS1: makeSound() })
        model.loadPreset('BASS1')
        const draftBefore = model.draft

        expect(model.loadPreset('DOES_NOT_EXIST')).toBe(false)
        expect(model.editKey).toBe('BASS1')
        expect(model.draft).toBe(draftBefore)
    })

    it('flushes a pending preview before switching preset', async () => {
        const { model, soundRegistry } = makeModel({ A: makeSound(), B: makeSound() })
        model.loadPreset('A')
        model.draft.masterVolume = 0.11
        model.commit(true)

        model.loadPreset('B')

        expect(soundRegistry.generatedSounds.A.masterVolume).toBe(0.11)
        expect(model.editKey).toBe('B')

        await new Promise((resolve) => requestAnimationFrame(resolve))
        await new Promise((resolve) => requestAnimationFrame(resolve))
        expect(soundRegistry.generatedSounds.A.masterVolume).toBe(0.11)
    })

    it('soundKeys returns sorted keys of the registry', () => {
        const { model } = makeModel({ SYNTH1: makeSound(), BASS1: makeSound(), ALPHA: makeSound() })
        expect(model.soundKeys).toEqual(['ALPHA', 'BASS1', 'SYNTH1'])
    })
})

describe('commit / flush', () => {
    it('commit() writes the draft to the registry and persists it', () => {
        const { model, soundRegistry, setGeneratedSounds } = makeModel()
        model.loadPreset('BASS1')
        model.draft.masterVolume = 0.5

        model.commit()

        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.5)
        expect(setGeneratedSounds).toHaveBeenCalledTimes(1)
        expect(vi.mocked(cacheGeneratedSounds)).toHaveBeenCalledTimes(1)
    })

    it('commit(true) coalesces a burst into a single animation frame', () => {
        const { model, soundRegistry } = makeModel()
        model.loadPreset('BASS1')
        const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')

        model.draft.masterVolume = 0.3
        model.commit(true)
        model.draft.masterVolume = 0.5
        model.commit(true)
        model.draft.filter.freq = 1200
        model.commit(true)

        expect(rafSpy).toHaveBeenCalledTimes(1)
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.8)
        rafSpy.mockRestore()
    })

    it('flush() commits the pending preview synchronously and cancels the frame', async () => {
        const { model, soundRegistry, setGeneratedSounds } = makeModel()
        model.loadPreset('BASS1')
        model.draft.masterVolume = 0.61
        model.commit(true)

        model.flush()

        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.61)
        expect(setGeneratedSounds).toHaveBeenCalledTimes(1)

        await new Promise((resolve) => requestAnimationFrame(resolve))
        await new Promise((resolve) => requestAnimationFrame(resolve))
        expect(setGeneratedSounds).toHaveBeenCalledTimes(1)
    })

    it('flush() is a no-op without a pending commit', () => {
        const { model, setGeneratedSounds } = makeModel()
        model.loadPreset('BASS1')

        model.flush()
        expect(setGeneratedSounds).not.toHaveBeenCalled()
    })
})

describe('revert / clearSession', () => {
    it('revert() restores the original into the registry and the draft', () => {
        const { model, soundRegistry } = makeModel()
        model.loadPreset('BASS1')
        model.draft.masterVolume = 0.1

        model.revert()

        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.8)
        expect(model.draft.masterVolume).toBe(0.8)
    })

    it('revert() without a session does nothing', () => {
        const { model, setGeneratedSounds } = makeModel()
        model.revert()
        expect(setGeneratedSounds).not.toHaveBeenCalled()
    })

    it('clearSession() cancels a pending commit and drops the state', async () => {
        const { model, soundRegistry, setGeneratedSounds } = makeModel()
        model.loadPreset('BASS1')
        model.draft.masterVolume = 0.42
        model.commit(true)

        model.clearSession()

        expect(model.editKey).toBeNull()
        expect(model.draft).toBeNull()
        expect(model.original).toBeNull()
        expect(model.cardBypassed).toEqual({})

        await new Promise((resolve) => requestAnimationFrame(resolve))
        await new Promise((resolve) => requestAnimationFrame(resolve))
        expect(setGeneratedSounds).not.toHaveBeenCalled()
        expect(soundRegistry.generatedSounds.BASS1.masterVolume).toBe(0.8)
    })

    it('setCardBypassed / hydrateCardBypassed derive card state', () => {
        const { model } = makeModel()
        model.setCardBypassed('filter', true)
        expect(model.cardBypassed.filter).toBe(true)

        model.draft = { vco2: { gain: 0 }, bypassFilter: true, bypassLfo2: true }
        model.hydrateCardBypassed()
        expect(model.cardBypassed).toMatchObject({
            vco1: false,
            vco2: true,
            vco3: false,
            filter: true,
            lfo2: true,
            lfo: false,
        })
    })
})

describe('computeLfoMod', () => {
    it('returns 0 for NOT target, zero depth or zero freq', () => {
        const { model } = makeModel()
        expect(model.computeLfoMod({ target: 'NOT', wave: 'sine', freq: 1, depth: 1 }, 0)).toBe(0)
        expect(model.computeLfoMod({ target: 'vco1.octave', wave: 'sine', freq: 1, depth: 0 }, 0)).toBe(0)
        expect(model.computeLfoMod({ target: 'vco1.octave', wave: 'sine', freq: 0, depth: 1 }, 0)).toBe(0)
    })

    it('scales a sine modulation by depth and the target scale', () => {
        const { model } = makeModel()
        expect(model.computeLfoMod({ target: 'vco1.octave', wave: 'sine', freq: 1, depth: 0.5 }, 0)).toBeCloseTo(-0.5, 5)
        expect(model.computeLfoMod({ target: 'filter.freq', wave: 'sine', freq: 1, depth: 0.5 }, 0)).toBeCloseTo(-500, 5)
    })

    it('falls back to the audio context time when no time is given', () => {
        const { model } = makeModel()
        // serviceRegistry.audioCtx.currentTime = 0, freq=1 → same as time 0
        expect(model.computeLfoMod({ target: 'vco1.octave', wave: 'sine', freq: 1, depth: 0.5 })).toBeCloseTo(-0.5, 5)
    })
})
