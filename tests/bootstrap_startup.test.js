/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { appState } from '../src/state/app_state.js'
import { showToast } from '../src/core/notify.js'
import { logger } from '../src/core/logger.js'

vi.mock('../src/core/notify.js', () => ({
    showToast: vi.fn(),
}))

vi.mock('../src/core/idb.js', () => ({
    idbReport: vi.fn(async () => ({ usagePct: 1, usageBytes: 1, quotaBytes: 100, stores: {} })),
}))

function makeResourcesLoader(overrides = {}) {
    return {
        loadSettings: vi.fn(async () => {}),
        loadSong: vi.fn(async () => {}),
        loadDrumkitList: vi.fn(async () => {}),
        loadGeneratedSounds: vi.fn(async () => {}),
        restoreSession: vi.fn(),
        ...overrides,
    }
}

async function flushStartup() {
    // scheduleAfterFirstPaint: rAF → requestIdleCallback (setTimeout fallback)
    await vi.advanceTimersByTimeAsync(50)
    // let loadStartupResources async chain settle
    for (let i = 0; i < 20; i++) await Promise.resolve()
    await vi.advanceTimersByTimeAsync(50)
    for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('bootstrap/startup', () => {
    beforeEach(() => {
        serviceRegistry.reset()
        soundRegistry.reset()
        appState.reset()
        vi.clearAllMocks()
        vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'setTimeout', 'clearTimeout'] })
        window.requestIdleCallback = (cb) => setTimeout(cb, 0)
        delete window.__e2e
    })

    afterEach(() => {
        vi.useRealTimers()
        delete window.requestIdleCallback
        delete window.__e2e
    })

    async function startWith(loader = makeResourcesLoader()) {
        serviceRegistry.resourcesLoader = loader
        serviceRegistry.cmd = {
            setSelectedDrumkitNum: vi.fn(),
            setSelectedPatternNum: vi.fn(),
        }
        const { startAfterFirstPaint } = await import('../src/bootstrap/startup.js')
        startAfterFirstPaint()
        await flushStartup()
        return loader
    }

    it('loads startup resources and installs the e2e hook', async () => {
        const loader = await startWith()

        expect(loader.loadSettings).toHaveBeenCalled()
        expect(loader.loadSong).toHaveBeenCalled()
        expect(window.__e2e).toBeTruthy()
        expect(window.__e2e.ready).toBe(true)
        expect(window.__e2e.appState).toBe(appState)
        expect(window.__e2e.serviceRegistry).toBe(serviceRegistry)
        expect(window.__e2e.soundRegistry).toBe(soundRegistry)
    })

    it('does not restore session when patterns are empty', async () => {
        const loader = await startWith()
        expect(loader.restoreSession).not.toHaveBeenCalled()
    })

    it('restores session when patterns exist', async () => {
        appState.patterns = [{ name: 'P1', tracks: [] }]
        const loader = await startWith()
        expect(loader.restoreSession).toHaveBeenCalled()
        expect(serviceRegistry.cmd.setSelectedPatternNum).toHaveBeenCalled()
        expect(serviceRegistry.cmd.setSelectedDrumkitNum).toHaveBeenCalled()
    })

    it('loads drumkit list when empty', async () => {
        const loader = await startWith()
        expect(loader.loadDrumkitList).toHaveBeenCalled()
        expect(loader.loadGeneratedSounds).toHaveBeenCalled()
    })

    it('skips drumkit load when already populated', async () => {
        soundRegistry.drumkitList = [{ name: '8bits' }]
        const loader = await startWith()
        expect(loader.loadDrumkitList).not.toHaveBeenCalled()
    })

    it('shows error toast when resource loading fails', async () => {
        // Expected failure path: silence the deliberate logger.error output.
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
        const loader = makeResourcesLoader({
            loadSettings: vi.fn(async () => {
                throw new Error('boom')
            }),
        })
        await startWith(loader)

        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Failed to load resources'), 'error')
        expect(window.__e2e?.ready).toBe(true)
        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })
})
