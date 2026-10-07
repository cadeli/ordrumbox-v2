import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { tools, handleToolCall, resetLibraryCache } from '../ordrumboxMcpserver.mjs'
import { PlaybackController } from '../ordrumboxMcpPlayback.mjs'

const toolByName = (name) => tools.find((t) => t.name === name)

const LIBRARY = {
    patterns: [
        { id: 'alpha', name: 'Alpha', bpm: 100, beatCount: 4, tracks: [] },
        { id: 'beta', name: 'Beta', bpm: 140, beatCount: 8, tracks: [{ name: 'KICK' }] },
    ],
    songs: [],
}

describe('MCP selectPattern', () => {
    let dataDir

    beforeEach(async () => {
        dataDir = await mkdtemp(join(tmpdir(), 'ordrumbox-mcp-select-'))
        process.env.ORDRUMBOX_MCP_DATA_DIR = dataDir
        await writeFile(join(dataDir, 'song.json'), JSON.stringify(LIBRARY), 'utf8')
        appState.reset()
        serviceRegistry.reset()
        resetLibraryCache()
    })

    afterEach(async () => {
        delete process.env.ORDRUMBOX_MCP_DATA_DIR
        await rm(dataDir, { recursive: true, force: true })
    })

    it('selectPattern, playPattern and stopPlayback are registered', () => {
        expect(toolByName('selectPattern')).toBeTruthy()
        expect(toolByName('playPattern')).toBeTruthy()
        expect(toolByName('stopPlayback')).toBeTruthy()
    })

    it('selects a pattern by name, case-insensitively', async () => {
        const res = await handleToolCall('selectPattern', { patternName: 'BETA' })
        expect(res.isError).toBeFalsy()

        const result = JSON.parse(res.content[0].text)
        expect(result).toMatchObject({ index: 1, name: 'Beta', bpm: 140, beatCount: 8, tracks: 1 })
        expect(appState.selectedPatternIdx).toBe(1)
        expect(appState.selectedPattern.name).toBe('Beta')
    })

    it('selects a pattern by index', async () => {
        const res = await handleToolCall('selectPattern', { index: 0 })
        const result = JSON.parse(res.content[0].text)
        expect(result.index).toBe(0)
        expect(result.name).toBe('Alpha')
        expect(appState.selectedPattern.name).toBe('Alpha')
    })

    it('returns the current selection when called without arguments', async () => {
        await handleToolCall('selectPattern', { patternName: 'Beta' })
        const res = await handleToolCall('selectPattern', {})
        expect(JSON.parse(res.content[0].text).name).toBe('Beta')
    })

    it('rejects an unknown pattern name', async () => {
        const res = await handleToolCall('selectPattern', { patternName: 'Nope' })
        expect(res.isError).toBe(true)
        expect(res.content[0].text).toMatch(/Pattern not found/)
    })

    it('rejects an out-of-range index', async () => {
        const res = await handleToolCall('selectPattern', { index: 99 })
        expect(res.isError).toBe(true)
        expect(res.content[0].text).toMatch(/Invalid pattern index/)
    })

    it('playPattern without any selection reports a clear error', async () => {
        await writeFile(join(dataDir, 'song.json'), JSON.stringify({ patterns: [], songs: [] }), 'utf8')
        resetLibraryCache()

        const res = await handleToolCall('playPattern', {})
        expect(res.isError).toBe(true)
        expect(res.content[0].text).toMatch(/No pattern selected/)
    })
})

/**
 * Headless stand-in for the browser page: the evaluate callbacks of
 * PlaybackController read `globalThis.__e2e`, so running them with
 * `this = globalThis` reproduces the app side without a browser.
 */
function makeStubPage(running = false) {
    const page = {
        _running: running,
        evaluate: (fn, arg) => Promise.resolve(fn.call(globalThis, arg)),
        goto: async () => {},
        waitForFunction: async () => true,
        waitForSelector: async () => {},
        waitForTimeout: async () => {},
        // The real .tb-start click toggles transport.isRunning; mirror that.
        locator: () => ({
            click: async () => {
                const app = globalThis.__e2e
                if (app?.serviceRegistry?.transport) {
                    app.serviceRegistry.transport.isRunning = !app.serviceRegistry.transport.isRunning
                }
                page._running = !page._running
            },
        }),
    }
    return page
}

function installFakeApp(patterns, { running = false } = {}) {
    const state = {
        appState: {
            patterns,
            selectedPatternIdx: 0,
            get selectedPattern() {
                return this.patterns[this.selectedPatternIdx]
            },
        },
        serviceRegistry: {
            transport: { isRunning: running },
            audioCtx: { state: 'running' },
            cmd: {
                setSelectedPatternIdx: async (index) => {
                    state.appState.selectedPatternIdx = index
                },
            },
        },
        playbackEvents: { on: () => {} },
    }
    globalThis.__e2e = state
    return state
}

function makeController(running = false) {
    const page = makeStubPage(running)
    const browser = {
        newContext: async () => ({ newPage: async () => page }),
        close: async () => {},
    }
    const playwright = { chromium: { launch: async () => browser } }
    return { controller: new PlaybackController({ playwright, startServer: false }), page }
}

describe('MCP PlaybackController', () => {
    const patterns = LIBRARY.patterns

    beforeEach(() => {
        delete globalThis.__mcpTriggerCount
    })

    afterEach(() => {
        delete globalThis.__e2e
        delete globalThis.__mcpTriggerCount
    })

    it('play selects the pattern, starts the transport and reports the state', async () => {
        installFakeApp(patterns)
        const { controller } = makeController(false)

        const result = await controller.play({ patternName: 'Beta', seconds: 0 })
        expect(result).toMatchObject({
            playing: true,
            audioContextState: 'running',
            pattern: 'Beta',
            bpm: 140,
            beatCount: 8,
            tracks: 1,
            triggeredNotes: 0,
            listenedSeconds: 0,
        })
        expect(globalThis.__e2e.appState.selectedPatternIdx).toBe(1)
    })

    it('play without a patternName plays the app-selected pattern', async () => {
        installFakeApp(patterns)
        const { controller } = makeController(false)

        const result = await controller.play({ seconds: 0 })
        expect(result.pattern).toBe('Alpha')
        expect(result.playing).toBe(true)
    })

    it('play leaves an already running transport alone', async () => {
        installFakeApp(patterns, { running: true })
        const { controller, page } = makeController(true)

        const result = await controller.play({ patternName: 'Beta', seconds: 0 })
        expect(result.playing).toBe(true)
        expect(page._running).toBe(true)
    })

    it('stop halts a running transport', async () => {
        installFakeApp(patterns, { running: true })
        const { controller } = makeController(true)

        const result = await controller.stop()
        expect(result.playing).toBe(false)
    })

    it('stop without a session reports an idle state', async () => {
        const { controller } = makeController(false)
        const result = await controller.stop()
        expect(result).toEqual({ playing: false, reason: 'no active playback session' })
    })

    it('selectPattern inside the app resolves the index and returns the pattern', async () => {
        installFakeApp(patterns)
        const { controller } = makeController(false)

        const result = await controller.selectPattern('beta')
        expect(result).toMatchObject({ index: 1, name: 'Beta', bpm: 140, beatCount: 8, tracks: 1 })
    })

    it('dispose closes the browser', async () => {
        installFakeApp(patterns)
        const { controller } = makeController(false)
        await controller.play({ seconds: 0 })
        expect(controller.isReady).toBe(true)
        await controller.dispose()
        expect(controller.isReady).toBe(false)
    })
})
