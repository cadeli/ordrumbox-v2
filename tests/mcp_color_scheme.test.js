import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { tools, handleToolCall } from '../ordrumboxMcpserver.mjs'
import { COLOR_SCHEME_COUNT } from '../src/core/constants.js'

const toolByName = (name) => tools.find((t) => t.name === name)

describe('MCP setColorScheme', () => {
    let dataDir

    const settingsPath = () => join(dataDir, 'settings.json')
    const readSettings = async () => JSON.parse(await readFile(settingsPath(), 'utf8'))

    beforeEach(async () => {
        dataDir = await mkdtemp(join(tmpdir(), 'ordrumbox-mcp-scheme-'))
        process.env.ORDRUMBOX_MCP_DATA_DIR = dataDir
        await writeFile(
            settingsPath(),
            JSON.stringify({ version: 1, sampleDirs: ['kits'], maxSampleDirs: 10, colorScheme: 1 }, null, 4) + '\n',
            'utf8',
        )
    })

    afterEach(async () => {
        delete process.env.ORDRUMBOX_MCP_DATA_DIR
        await rm(dataDir, { recursive: true, force: true })
    })

    it('is registered with scheme as a required argument', () => {
        const tool = toolByName('setColorScheme')
        expect(tool).toBeTruthy()
        expect(tool.inputSchema.required).toContain('scheme')
        expect(COLOR_SCHEME_COUNT).toBe(3)
    })

    it('writes the scheme and keeps the other settings keys', async () => {
        const res = await handleToolCall('setColorScheme', { scheme: 3 })
        expect(res.isError).toBeFalsy()

        const out = JSON.parse(res.content[0].text)
        expect(out).toMatchObject({ scheme: 3, previous: 1 })

        const settings = await readSettings()
        expect(settings.colorScheme).toBe(3)
        expect(settings.sampleDirs).toEqual(['kits'])
        expect(settings.maxSampleDirs).toBe(10)
    })

    it('reports the scheme it replaced', async () => {
        await handleToolCall('setColorScheme', { scheme: 2 })
        const res = await handleToolCall('setColorScheme', { scheme: 1 })
        expect(JSON.parse(res.content[0].text)).toMatchObject({ scheme: 1, previous: 2 })
    })

    it.each([0, 4, 42, -1, 2.5, 'blue', ''])('falls back to 1 for %j', async (value) => {
        const res = await handleToolCall('setColorScheme', { scheme: value })
        expect(res.isError).toBeFalsy()
        expect(JSON.parse(res.content[0].text).scheme).toBe(1)
        expect((await readSettings()).colorScheme).toBe(1)
    })

    it('accepts the id as a numeric string', async () => {
        const res = await handleToolCall('setColorScheme', { scheme: '2' })
        expect(res.isError).toBeFalsy()
        expect((await readSettings()).colorScheme).toBe(2)
    })

    it('rejects a missing scheme without touching the file', async () => {
        const res = await handleToolCall('setColorScheme', {})
        expect(res.isError).toBe(true)
        expect(res.content[0].text).toMatch(/scheme is required/)
        expect((await readSettings()).colorScheme).toBe(1)
    })

    it('creates settings.json when it does not exist yet', async () => {
        await rm(settingsPath())
        const res = await handleToolCall('setColorScheme', { scheme: 2 })
        expect(res.isError).toBeFalsy()
        expect((await readSettings()).colorScheme).toBe(2)
    })

    it('refuses to overwrite an unparsable settings.json', async () => {
        await writeFile(settingsPath(), '{ not json', 'utf8')
        const res = await handleToolCall('setColorScheme', { scheme: 2 })
        expect(res.isError).toBe(true)
        expect(res.content[0].text).toMatch(/Invalid JSON/)
        expect(await readFile(settingsPath(), 'utf8')).toBe('{ not json')
    })
})
