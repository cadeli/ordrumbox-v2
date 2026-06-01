import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MfResourcesLoader from '../src/loader/resources_loader.js'

vi.mock('../src/state/app_state.js', () => {
    const state = { patterns: [] }
    return { appState: state, __esModule: true }
})

vi.mock('../src/state/sound_registry.js', () => {
    const state = {
        drumkitList: [],
        sounds: {},
        scales: {},
        generatedSounds: {},
        reset() { this.drumkitList = []; this.sounds = {}; this.scales = {}; this.generatedSounds = {} }
    }
    return { soundRegistry: state, __esModule: true }
})

vi.mock('../src/state/service_registry.js', () => {
    const reg = { audioCtx: null, mfCmd: null }
    return { serviceRegistry: reg, __esModule: true }
})

vi.mock('../src/patterns/fixer.js', () => ({
    fixPatterns: vi.fn((p) => p),
    getUnloadedSamplesFromDrumkits: vi.fn(() => [])
}))

function makeJsonResponse(data) {
    return {
        ok: true,
        json: () => Promise.resolve(data)
    }
}

function makeErrorResponse(status = 404) {
    return { ok: false, status }
}

describe('MfResourcesLoader', () => {
    let loader
    let fetchSpy

    beforeEach(async () => {
        loader = new MfResourcesLoader()
        fetchSpy = vi.fn()
        globalThis.fetch = fetchSpy
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'log').mockImplementation(() => {})
        const { serviceRegistry } = await import('../src/state/service_registry.js')
        serviceRegistry.mfCmd = { importPatternFromJson: vi.fn() }
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('loadJsonResource', () => {
        it('fetches JSON and calls onLoad callback', async () => {
            const data = [{ name: 'test' }]
            fetchSpy.mockResolvedValue(makeJsonResponse(data))
            const cb = vi.fn()

            const result = await loader.loadJsonResource('test.json', cb)

            expect(cb).toHaveBeenCalledWith(data)
            expect(result).toEqual(data)
        })

        it('throws on HTTP error', async () => {
            fetchSpy.mockResolvedValue(makeErrorResponse(500))

            await expect(loader.loadJsonResource('fail.json', vi.fn()))
                .rejects.toThrow('HTTP 500')
        })

        it('throws on network error', async () => {
            fetchSpy.mockRejectedValue(new Error('Network error'))

            await expect(loader.loadJsonResource('fail.json', vi.fn()))
                .rejects.toThrow('Network error')
        })
    })

    describe('loadDrumkitList', () => {
        it('loads drumkits into soundRegistry', async () => {
            const { soundRegistry } = await import('../src/state/sound_registry.js')
            const kits = { real: { name: 'real', samples: [] } }
            fetchSpy.mockResolvedValue(makeJsonResponse(kits))

            await loader.loadDrumkitList('drumkits.json')

            expect(soundRegistry.drumkitList).toHaveLength(1)
            expect(loader.isDrumkitListLoaded).toBe(true)
        })

        it('calls complete callback', async () => {
            fetchSpy.mockResolvedValue(makeJsonResponse({}))
            const cb = vi.fn()

            await loader.loadDrumkitList('drumkits.json', cb)

            expect(cb).toHaveBeenCalled()
        })
    })

    describe('loadPatterns', () => {
        it('loads patterns into appState', async () => {
            const { appState } = await import('../src/state/app_state.js')
            const { serviceRegistry } = await import('../src/state/service_registry.js')
            serviceRegistry.mfCmd = { importPatternFromJson: vi.fn() }

            const patterns = [{ name: 'P1', bpm: 120, nbBars: 4, tracks: [] }]
            fetchSpy.mockResolvedValue(makeJsonResponse(patterns))

            await loader.loadPatterns('patterns.json')

            expect(serviceRegistry.mfCmd.importPatternFromJson).toHaveBeenCalledTimes(1)
        })

        it('calls complete callback', async () => {
            const { serviceRegistry } = await import('../src/state/service_registry.js')
            serviceRegistry.mfCmd = { importPatternFromJson: vi.fn() }
            fetchSpy.mockResolvedValue(makeJsonResponse([]))
            const cb = vi.fn()

            await loader.loadPatterns('patterns.json', cb)

            expect(cb).toHaveBeenCalled()
        })

        it('resets soundId when useAutoAssignSound is not false', async () => {
            const { serviceRegistry } = await import('../src/state/service_registry.js')
            serviceRegistry.mfCmd = { importPatternFromJson: vi.fn() }
            const patterns = [{
                name: 'P1', bpm: 120, nbBars: 4,
                tracks: [{ name: 'KICK', soundId: 'kick.wav', useAutoAssignSound: true, notes: [] }]
            }]
            fetchSpy.mockResolvedValue(makeJsonResponse(patterns))

            await loader.loadPatterns('patterns.json')

            const imported = serviceRegistry.mfCmd.importPatternFromJson.mock.calls[0][0]
            expect(imported.tracks[0].soundId).toBe('NOT_DEFINED')
        })

        it('keeps soundId when useAutoAssignSound is false', async () => {
            const { serviceRegistry } = await import('../src/state/service_registry.js')
            serviceRegistry.mfCmd = { importPatternFromJson: vi.fn() }
            const patterns = [{
                name: 'P1', bpm: 120, nbBars: 4,
                tracks: [{ name: 'KICK', soundId: 'kick.wav', useAutoAssignSound: false, notes: [] }]
            }]
            fetchSpy.mockResolvedValue(makeJsonResponse(patterns))

            await loader.loadPatterns('patterns.json')

            const imported = serviceRegistry.mfCmd.importPatternFromJson.mock.calls[0][0]
            expect(imported.tracks[0].soundId).toBe('kick.wav')
        })

        it('skips tracks with soundId NOT_DEFINED', async () => {
            const { serviceRegistry } = await import('../src/state/service_registry.js')
            serviceRegistry.mfCmd = { importPatternFromJson: vi.fn() }
            const patterns = [{
                name: 'P1', bpm: 120, nbBars: 4,
                tracks: [{ name: 'KICK', soundId: 'NOT_DEFINED', notes: [] }]
            }]
            fetchSpy.mockResolvedValue(makeJsonResponse(patterns))

            await loader.loadPatterns('patterns.json')

            const imported = serviceRegistry.mfCmd.importPatternFromJson.mock.calls[0][0]
            expect(imported.tracks[0].soundId).toBe('NOT_DEFINED')
        })
    })

    describe('loadScales', () => {
        it('loads scales into soundRegistry', async () => {
            const { soundRegistry } = await import('../src/state/sound_registry.js')
            const scales = { major: [0, 2, 4, 5, 7, 9, 11] }
            fetchSpy.mockResolvedValue(makeJsonResponse(scales))

            await loader.loadScales('scales.json')

            expect(soundRegistry.scales.major).toEqual([0, 2, 4, 5, 7, 9, 11])
        })
    })

    describe('loadGeneratedSounds', () => {
        it('loads generated sounds into soundRegistry', async () => {
            const { soundRegistry } = await import('../src/state/sound_registry.js')
            const gen = { synth1: { type: 'sine' } }
            fetchSpy.mockResolvedValue(makeJsonResponse(gen))

            await loader.loadGeneratedSounds('gen.json')

            expect(soundRegistry.generatedSounds.synth1).toEqual({ type: 'sine' })
        })
    })

    describe('ensureResourcesLoaded', () => {
        it('loads patterns when empty', async () => {
            const { appState } = await import('../src/state/app_state.js')
            const { serviceRegistry } = await import('../src/state/service_registry.js')
            const { soundRegistry } = await import('../src/state/sound_registry.js')
            serviceRegistry.mfCmd = { importPatternFromJson: vi.fn() }
            appState.patterns.length = 0
            soundRegistry.drumkitList.length = 0
            Object.keys(soundRegistry.sounds).forEach(k => delete soundRegistry.sounds[k])

            fetchSpy
                .mockResolvedValueOnce(makeJsonResponse([]))
                .mockResolvedValueOnce(makeJsonResponse({}))

            await loader.ensureResourcesLoaded()

            expect(loader.isPatternsLoading).toBe(false)
        })

        it('skips loading if already loading', async () => {
            const { appState } = await import('../src/state/app_state.js')
            appState.patterns.length = 0
            loader.isPatternsLoading = true

            await loader.ensureResourcesLoaded()

            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('skips if patternsLoadFailed', async () => {
            const { appState } = await import('../src/state/app_state.js')
            appState.patterns.length = 0
            loader.patternsLoadFailed = true

            await loader.ensureResourcesLoaded()

            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('skips sample loading if already loading', async () => {
            const { appState } = await import('../src/state/app_state.js')
            const { soundRegistry } = await import('../src/state/sound_registry.js')
            const { serviceRegistry } = await import('../src/state/service_registry.js')
            serviceRegistry.mfCmd = { importPatternFromJson: vi.fn() }
            appState.patterns = [{ name: 'p' }]
            soundRegistry.drumkitList = [{ name: 'real', samples: [] }]
            Object.keys(soundRegistry.sounds).forEach(k => delete soundRegistry.sounds[k])
            loader.isSamplesLoading = true

            await loader.ensureResourcesLoaded()

            expect(loader.isSamplesLoading).toBe(true)
        })
    })

    describe('audioCtx', () => {
        it('creates AudioContext if not provided', () => {
            const mockCtx = { createGain: vi.fn() }
            globalThis.AudioContext = class { constructor() { return mockCtx } }

            const l = new MfResourcesLoader()
            const ctx = l.audioCtx

            expect(ctx).toBe(mockCtx)
        })

        it('throws if AudioContext not available', () => {
            delete globalThis.AudioContext
            delete globalThis.webkitAudioContext

            const l = new MfResourcesLoader()
            expect(() => l.audioCtx).toThrow('AudioContext is not available')
        })

        it('reuses provided audioCtx', () => {
            const mockCtx = { test: true }
            const l = new MfResourcesLoader(mockCtx)
            expect(l.audioCtx).toBe(mockCtx)
        })
    })

    describe('loadSample', () => {
        it('loads and decodes a sample', async () => {
            const mockBuffer = { duration: 1.5 }
            const mockArrayBuffer = new ArrayBuffer(8)
            const mockCtx = {
                decodeAudioData: vi.fn().mockResolvedValue(mockBuffer)
            }
            loader = new MfResourcesLoader(mockCtx)
            fetchSpy.mockResolvedValue({
                ok: true,
                arrayBuffer: () => Promise.resolve(mockArrayBuffer)
            })

            const result = await loader.loadSample({ url: 'kick.wav', key: 'K' }, 'real')

            expect(result.url).toBe('kick.wav')
            expect(result.key).toBe('K')
            expect(result.kit_name).toBe('real')
            expect(result.buffer).toBe(mockBuffer)
            expect(result.isLoad).toBe(true)
            const { soundRegistry } = await import('../src/state/sound_registry.js')
            expect(soundRegistry.sounds['kick.wav']).toBe(result)
        })

        it('throws on HTTP error', async () => {
            const mockCtx = { decodeAudioData: vi.fn() }
            loader = new MfResourcesLoader(mockCtx)
            fetchSpy.mockResolvedValue({ ok: false, status: 404 })

            await expect(loader.loadSample({ url: 'missing.wav' }, 'real'))
                .rejects.toThrow('HTTP 404')
        })
    })

    describe('loadMissingSamplesFromDrumkits', () => {
        it('resolves empty when no samples to load', async () => {
            const { soundRegistry } = await import('../src/state/sound_registry.js')
            const samples = Object.values(soundRegistry.sounds)
            const result = await loader.loadMissingSamplesFromDrumkits([], vi.fn())
            expect(result).toEqual([])
        })
    })

    describe('onSoundsProgress', () => {
        it('does nothing without document', () => {
            expect(() => loader.onSoundsProgress(50)).not.toThrow()
        })
    })
})
