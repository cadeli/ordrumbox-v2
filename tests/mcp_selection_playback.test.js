import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { tools, handleToolCall, resetLibraryCache } from '../ordrumboxMcpserver.mjs'

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

    it('selectPattern is registered', () => {
        expect(toolByName('selectPattern')).toBeTruthy()
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
})
