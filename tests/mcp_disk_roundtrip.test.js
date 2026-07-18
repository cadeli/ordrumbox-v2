import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import { PatternExporter } from '../src/patterns/exporter.js'
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'

const TMP_DIR = resolve(import.meta.dirname, '__tmp_mcp_test__')

describe('Functional: MCP generate → disk save → import', () => {
    let mfCmd

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
    })

    afterEach(async () => {
        try {
            const files = await import('node:fs/promises').then(fs => fs.readdir(TMP_DIR))
            for (const f of files) await unlink(resolve(TMP_DIR, f))
            await import('node:fs/promises').then(fs => fs.rmdir(TMP_DIR))
        } catch {}
    })

    it('create → add notes → export → write disk → read back → reimport preserves everything', async () => {
        await mkdir(TMP_DIR, { recursive: true })

        const pattern = mfCmd.addPattern('McpTest')
        pattern.bpm = 90
        pattern.nbBeats = 8
        pattern.tags = ['hiphop', 'bass']

        const kick = mfCmd.addTrack(pattern, 'KICK')
        mfCmd.addNote(kick, 0, 0, 0)
        kick.notes[0].velocity = 0.95

        const snare = mfCmd.addTrack(pattern, 'SNARE')
        mfCmd.addNote(snare, 1, 0, 0)
        snare.notes[0].velocity = 0.85

        const bass = mfCmd.addTrack(pattern, 'BASS')
        mfCmd.addNote(bass, 0, 0, 0)
        mfCmd.addNote(bass, 0, 2, -5)
        mfCmd.addNote(bass, 1, 0, 3)
        bass.notes[0].velocity = 0.8
        bass.notes[1].velocity = 0.6
        bass.notes[2].velocity = 0.7

        const exported = PatternExporter.export(pattern)
        const filePath = resolve(TMP_DIR, 'mcptest.json')
        await writeFile(filePath, JSON.stringify(exported, null, 2) + '\n', 'utf8')

        const raw = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        expect(parsed).toBeInstanceOf(Object)
        expect(parsed.name).toBe('McpTest')
        expect(parsed.bpm).toBe(90)
        expect(parsed.nbBeats).toBe(8)

        const reimported = mfCmd.importPatternFromJson(parsed)

        expect(reimported.name).toBe('McpTest')
        expect(reimported.bpm).toBe(90)
        expect(reimported.nbBeats).toBe(8)
        expect(reimported.tags).toEqual(expect.objectContaining({ 0: 'hiphop', 1: 'bass' }))
        expect(reimported.tracks).toHaveLength(3)

        const k = reimported.tracks.find(t => t.name === 'KICK')
        expect(k).toBeDefined()
        expect(k.notes).toHaveLength(1)
        expect(k.notes[0].beat).toBe(0)
        expect(k.notes[0].beatStep).toBe(0)
        expect(k.notes[0].velocity).toBe(0.95)

        const s = reimported.tracks.find(t => t.name === 'SNARE')
        expect(s).toBeDefined()
        expect(s.notes).toHaveLength(1)
        expect(s.notes[0].beat).toBe(1)
        expect(s.notes[0].velocity).toBe(0.85)

        const b = reimported.tracks.find(t => t.name === 'BASS')
        expect(b).toBeDefined()
        expect(b.notes).toHaveLength(3)
        expect(b.notes[0].beat).toBe(0)
        expect(b.notes[0].beatStep).toBe(0)
        expect(b.notes[0].pitch).toBe(0)
        expect(b.notes[0].velocity).toBe(0.8)
        expect(b.notes[1].pitch).toBe(-5)
        expect(b.notes[2].beat).toBe(1)
        expect(b.notes[2].pitch).toBe(3)
    })

    it('multiple save cycles are stable (simulates create → addNotes → setBpm → setTags)', async () => {
        await mkdir(TMP_DIR, { recursive: true })

        const pattern = mfCmd.addPattern('CycleTest')
        pattern.bpm = 95
        pattern.nbBeats = 8
        const kick = mfCmd.addTrack(pattern, 'KICK')
        mfCmd.addNote(kick, 0, 0, 0)
        kick.notes[0].velocity = 0.9

        const filePath = resolve(TMP_DIR, 'cycletest.json')

        const save = async (p) => {
            const exported = PatternExporter.export(p)
            await writeFile(filePath, JSON.stringify(exported, null, 2) + '\n', 'utf8')
        }

        const load = async () => {
            const raw = await readFile(filePath, 'utf-8')
            return JSON.parse(raw)
        }

        await save(pattern)

        const p1 = await load()
        const r1 = mfCmd.importPatternFromJson(p1)
        r1.bpm = 128
        r1.tags = ['techno']
        await save(r1)

        const p2 = await load()
        const r2 = mfCmd.importPatternFromJson(p2)
        expect(r2.bpm).toBe(128)
        expect(r2.tags).toEqual(expect.objectContaining({ 0: 'techno' }))
        expect(r2.tracks).toHaveLength(1)
        expect(r2.tracks[0].notes).toHaveLength(1)

        r2.tags = ['techno', 'minimal']
        await save(r2)

        const p3 = await load()
        const r3 = mfCmd.importPatternFromJson(p3)
        expect(r3.bpm).toBe(128)
        expect(r3.tags).toEqual(expect.objectContaining({ 0: 'techno', 1: 'minimal' }))
        expect(r3.tracks[0].notes[0].beat).toBe(0)
    })

    it('empty tracks and notes survive disk round-trip', async () => {
        await mkdir(TMP_DIR, { recursive: true })

        const pattern = mfCmd.addPattern('EmptyTest')
        pattern.bpm = 100
        pattern.nbBeats = 8
        mfCmd.addTrack(pattern, 'KICK')

        const exported = PatternExporter.export(pattern)
        const filePath = resolve(TMP_DIR, 'emptytest.json')
        await writeFile(filePath, JSON.stringify(exported, null, 2) + '\n', 'utf8')

        const raw = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        expect(parsed.bpm).toBe(100)
        expect(parsed.nbBeats).toBe(8)
        const reimported = mfCmd.importPatternFromJson(parsed)

        expect(reimported.name).toBe('EmptyTest')
        expect(reimported.bpm).toBe(100)
        expect(reimported.nbBeats).toBe(8)
        expect(reimported.tracks).toHaveLength(1)
        expect(reimported.tracks[0].notes).toEqual([])
    })

    it('JSON on disk is always valid after each save step', async () => {
        await mkdir(TMP_DIR, { recursive: true })

        const pattern = mfCmd.addPattern('ValidJson')
        pattern.bpm = 135
        pattern.nbBeats = 8
        const kick = mfCmd.addTrack(pattern, 'KICK')
        mfCmd.addNote(kick, 0, 0, 0)
        kick.notes[0].velocity = 0.9
        kick.notes[0].every = 2

        const filePath = resolve(TMP_DIR, 'validjson.json')

        const saveAndVerify = async (p, label) => {
            const exported = PatternExporter.export(p)
            const json = JSON.stringify(exported, null, 2) + '\n'
            await writeFile(filePath, json, 'utf8')
            const raw = await readFile(filePath, 'utf-8')
            const parsed = JSON.parse(raw)
            expect(parsed).toBeInstanceOf(Object)
            expect(parsed.name).toBe('ValidJson')
            return parsed
        }

        const p1 = await saveAndVerify(pattern, 'initial')
        expect(p1.bpm).toBe(135)
        expect(p1.nbBeats).toBe(8)
        const r1 = mfCmd.importPatternFromJson(p1)
        r1.bpm = 140
        r1.nbBeats = 8
        await saveAndVerify(r1, 'after bpm')

        const p2 = await saveAndVerify(r1, 'after tags')
        const r2 = mfCmd.importPatternFromJson(p2)
        r2.tags = ['dark', 'techno']
        await saveAndVerify(r2, 'after tags set')

        const p3 = await saveAndVerify(r2, 'final')
        expect(p3.bpm).toBe(140)
        expect(p3.tags).toEqual(expect.arrayContaining(['dark', 'techno']))
        const r3 = mfCmd.importPatternFromJson(p3)
        expect(r3.bpm).toBe(140)
        expect(r3.nbBeats).toBe(8)
        expect(r3.tracks[0].notes[0].every).toBe(2)
    })
})
