// tests/mcp_arrangements.test.js
// The MCP write path against a temp data dir (ORDRUMBOX_MCP_DATA_DIR), so
// arrangement building is exercised end to end without touching assets/data.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const LIBRARY = {
    infos: { name: 'Test song', description: '', date: '' },
    patterns: [
        { id: 'verse', name: 'Verse', bpm: 120, beatCount: 8, tracks: [] },
        { id: 'chorus', name: 'Chorus', bpm: 120, beatCount: 4, tracks: [] },
    ],
    songs: [],
}

let dataDir
let handleToolCall

/** Fresh module instance, the way each MCP process starts. */
const freshServer = async () => {
    vi.resetModules()
    return import('../ordrumboxMcpserver.mjs')
}

const call = async (tool, args) => {
    const res = await handleToolCall(tool, args)
    const text = res?.content?.[0]?.text ?? ''
    return { res, text, json: res.isError ? undefined : JSON.parse(text) }
}

const readIndex = async () => JSON.parse(await readFile(resolve(dataDir, 'song.json'), 'utf-8'))

beforeEach(async () => {
    dataDir = await mkdtemp(resolve(tmpdir(), 'odbox-mcp-'))
    await writeFile(resolve(dataDir, 'song.json'), JSON.stringify(LIBRARY, null, 2), 'utf8')
    process.env.ORDRUMBOX_MCP_DATA_DIR = dataDir
    // Imported after the env var is set: the module resolves it on every access.
    handleToolCall = (await freshServer()).handleToolCall
})

afterEach(async () => {
    delete process.env.ORDRUMBOX_MCP_DATA_DIR
    await rm(dataDir, { recursive: true, force: true })
})

describe('MCP arrangement tools', () => {
    it('listArrangements reports the arrangements of song.json with pattern names', async () => {
        const index = await readIndex()
        index.songs = [{ id: 'a1', name: 'Intro', bpm: 120, clips: [{ pattern: 'verse', startBar: 0, bars: 2 }] }]
        await writeFile(resolve(dataDir, 'song.json'), JSON.stringify(index, null, 2), 'utf8')

        const { json } = await call('listArrangements', {})
        expect(json.count).toBe(1)
        expect(json.arrangements[0].name).toBe('Intro')
        expect(json.arrangements[0].clips[0]).toEqual({
            pattern: 'verse',
            patternName: 'Verse',
            startBar: 0,
            bars: 2,
        })
    })

    it('createArrangement writes an empty arrangement and selects it', async () => {
        const { json } = await call('createArrangement', { name: 'My arrangement', bpm: 95 })

        expect(json.arrangement.name).toBe('My arrangement')
        expect(json.arrangement.bpm).toBe(95)
        expect(json.arrangement.clips).toEqual([])

        const index = await readIndex()
        expect(index.songs).toHaveLength(1)
        expect(index.songs[0].clips).toEqual([])
        // The pattern library is untouched.
        expect(index.patterns).toEqual(LIBRARY.patterns)
    })

    it('createArrangement places the clips it is given', async () => {
        const { json } = await call('createArrangement', {
            name: 'Full',
            clips: [
                { patternName: 'Verse', startBar: 0 },
                { patternName: 'chorus', startBar: 2 },
                { patternName: 'Ghost', startBar: 4 },
            ],
        })

        expect(json.placedClips).toBe(2)
        expect(json.skippedClips).toEqual([{ patternName: 'Ghost', startBar: 4 }])
        expect(json.arrangement.clips).toEqual([
            { pattern: 'verse', patternName: 'Verse', startBar: 0, bars: 2 },
            { pattern: 'chorus', patternName: 'Chorus', startBar: 2, bars: 1 },
        ])
    })

    it('addPatternToArrangement targets an arrangement by name', async () => {
        await call('createArrangement', { name: 'First' })
        await call('createArrangement', { name: 'Second' })

        const { json } = await call('addPatternToArrangement', {
            patternName: 'Chorus',
            startBar: 4,
            arrangement: 'First',
        })

        expect(json.clip).toEqual({ pattern: 'chorus', startBar: 4, bars: 1 })
        expect(json.arrangement.name).toBe('First')

        const index = await readIndex()
        expect(index.songs.find((s) => s.name === 'First').clips).toEqual([{ pattern: 'chorus', startBar: 4, bars: 1 }])
        expect(index.songs.find((s) => s.name === 'Second').clips).toEqual([])
    })

    it('addPatternToArrangement honours an explicit clip length and allows overlaps', async () => {
        await call('createArrangement', { name: 'Layers' })
        await call('addPatternToArrangement', { patternName: 'Verse', startBar: 0 })
        const { json } = await call('addPatternToArrangement', { patternName: 'Chorus', startBar: 0, bars: 2 })

        expect(json.arrangement.clips).toHaveLength(2)
        expect(json.arrangement.clips.map((c) => c.pattern)).toEqual(['verse', 'chorus'])
        expect(json.arrangement.bars).toBe(2)
    })

    it('addPatternToArrangement fails loudly on an unknown pattern or arrangement', async () => {
        await call('createArrangement', { name: 'Only' })

        const unknownPattern = await call('addPatternToArrangement', { patternName: 'Nope' })
        expect(unknownPattern.res.isError).toBe(true)
        expect(unknownPattern.text).toContain('Nope')

        const unknownSong = await call('addPatternToArrangement', { patternName: 'Verse', arrangement: 'Nope' })
        expect(unknownSong.res.isError).toBe(true)

        expect((await readIndex()).songs[0].clips).toEqual([])
    })

    it('removePatternFromArrangement removes by bar, by pattern, or both', async () => {
        await call('createArrangement', {
            name: 'Mixed',
            clips: [
                { patternName: 'Verse', startBar: 0 },
                { patternName: 'Chorus', startBar: 0 },
                { patternName: 'Verse', startBar: 2 },
            ],
        })

        const byBar = await call('removePatternFromArrangement', { startBar: 0 })
        expect(JSON.parse(byBar.text).removed).toHaveLength(2)
        expect((await readIndex()).songs[0].clips).toEqual([{ pattern: 'verse', startBar: 2, bars: 2 }])

        await call('removePatternFromArrangement', { patternName: 'verse' })
        expect((await readIndex()).songs[0].clips).toEqual([])
    })

    it('removePatternFromArrangement needs a target and reports when nothing matches', async () => {
        await call('createArrangement', { name: 'Mixed' })

        expect((await call('removePatternFromArrangement', {})).res.isError).toBe(true)

        const miss = await call('removePatternFromArrangement', { startBar: 7 })
        expect(miss.res.isError).toBe(true)
        expect(miss.text).toContain('No matching clip')
    })

    it('an arrangement survives a write/reload cycle through song.json', async () => {
        await call('createArrangement', {
            name: 'Reload me',
            clips: [{ patternName: 'Verse', startBar: 0 }],
        })

        // Fresh process state: a new module instance re-reads the file.
        const listed = await (await freshServer()).handleToolCall('listArrangements', {})
        const { arrangements } = JSON.parse(listed.content[0].text)

        expect(arrangements).toHaveLength(1)
        expect(arrangements[0].clips).toEqual([{ pattern: 'verse', patternName: 'Verse', startBar: 0, bars: 2 }])
    })

    it('pattern writes keep the arrangements intact', async () => {
        await call('createArrangement', { name: 'Keep me', clips: [{ patternName: 'Verse', startBar: 0 }] })

        const created = await call('createNewPattern', { patternName: 'Bridge' })
        expect(created.res.isError).toBeUndefined()

        const index = await readIndex()
        expect(index.songs).toHaveLength(1)
        expect(index.songs[0].clips).toEqual([{ pattern: 'verse', startBar: 0, bars: 2 }])
        expect(index.patterns.map((p) => p.name)).toEqual(['Verse', 'Chorus', 'Bridge'])
    })

    it('every pattern of the library is reachable by name once loaded', async () => {
        await mkdir(resolve(dataDir, 'patterns'), { recursive: true })
        const { json } = await call('createArrangement', {
            name: 'Resolved',
            clips: [{ patternName: 'verse' }, { patternName: 'CHORUS' }],
        })

        expect(json.arrangement.clips.map((c) => c.patternName)).toEqual(['Verse', 'Chorus'])
    })
})
