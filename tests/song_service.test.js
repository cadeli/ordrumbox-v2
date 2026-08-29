/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

vi.mock('../src/core/idb.js', () => ({
    idbPut: vi.fn().mockResolvedValue(undefined),
    idbGet: vi.fn().mockResolvedValue(null),
    idbKeys: vi.fn().mockResolvedValue([]),
}))

vi.mock('../src/ui/components/panel_helpers.js', () => ({
    downloadJson: vi.fn(),
}))

import songService from '../src/logic/services/song_service.js'
import { idbPut, idbGet, idbKeys } from '../src/core/idb.js'
import { downloadJson } from '../src/ui/components/panel_helpers.js'

describe('SongService', () => {
    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        idbPut.mockClear()
        idbGet.mockClear()
        idbKeys.mockClear()
        downloadJson.mockClear()
        serviceRegistry.cmd = { setSelectedPatternNum: vi.fn() }
    })

    describe('buildSongData', () => {
        it('serializes current appState into song data', () => {
            appState.patterns = [{ name: 'A', tracks: [], bpm: 120, nbBeats: 4 }]
            appState.selectedPatternNum = 0
            appState.songInfos.description = 'My song'
            appState.songInfos.date = '2025-01-01'

            const data = songService.buildSongData('TestSong')
            expect(data.version).toBe(1)
            expect(data.name).toBe('TestSong')
            expect(data.description).toBe('My song')
            expect(data.date).toBe('2025-01-01')
            expect(data.patterns).toHaveLength(1)
            expect(data.patterns[0].name).toBe('A')
            expect(data.selectedPatternNum).toBe(0)
        })

        it('returns a deep copy of patterns', () => {
            appState.patterns = [{ name: 'A', tracks: [] }]
            const data = songService.buildSongData('X')
            data.patterns[0].name = 'MUTATED'
            expect(appState.patterns[0].name).toBe('A')
        })

        it('defaults description and date to empty strings', () => {
            appState.songInfos.description = ''
            appState.songInfos.date = ''
            const data = songService.buildSongData('X')
            expect(data.description).toBe('')
            expect(data.date).toBe('')
        })
    })

    describe('save', () => {
        it('calls idbPut with correct args and adds savedAt', async () => {
            appState.patterns = [{ name: 'P' }]
            await songService.save('MySong')
            expect(idbPut).toHaveBeenCalledOnce()
            expect(idbPut.mock.calls[0][0]).toBe('songs')
            expect(idbPut.mock.calls[0][1]).toBe('MySong')
            expect(idbPut.mock.calls[0][2].savedAt).toBeTypeOf('number')
        })
    })

    describe('listKeys', () => {
        it('delegates to idbKeys', async () => {
            idbKeys.mockResolvedValue(['song1', 'song2'])
            const keys = await songService.listKeys()
            expect(keys).toEqual(['song1', 'song2'])
            expect(idbKeys).toHaveBeenCalledWith('songs')
        })
    })

    describe('load', () => {
        it('returns data when found', async () => {
            const fakeData = { patterns: [{ name: 'X' }], name: 'X' }
            idbGet.mockResolvedValue(fakeData)
            const result = await songService.load('X')
            expect(result).toBe(fakeData)
        })

        it('returns null when data has no patterns', async () => {
            idbGet.mockResolvedValue({ name: 'X' })
            const result = await songService.load('X')
            expect(result).toBeNull()
        })

        it('returns null when data is null', async () => {
            idbGet.mockResolvedValue(null)
            const result = await songService.load('missing')
            expect(result).toBeNull()
        })
    })

    describe('applyToAppState', () => {
        it('replaces patterns and sets songInfos', () => {
            appState.patterns = [{ name: 'old' }]
            const data = {
                name: 'Loaded',
                description: 'desc',
                date: '2025-06-01',
                patterns: [{ name: 'new1' }, { name: 'new2' }],
                selectedPatternNum: 1,
            }
            const name = songService.applyToAppState(data, 'fallback')
            expect(name).toBe('Loaded')
            expect(appState.patterns).toHaveLength(2)
            expect(appState.patterns[0].name).toBe('new1')
            expect(appState.songInfos.name).toBe('Loaded')
            expect(appState.songInfos.description).toBe('desc')
            expect(appState.songInfos.date).toBe('2025-06-01')
            expect(serviceRegistry.cmd.setSelectedPatternNum).toHaveBeenCalledWith(1)
            expect(appState.currentPage).toBe(0)
        })

        it('uses fallback name when data.name is null', () => {
            const data = { patterns: [], selectedPatternNum: 0 }
            const name = songService.applyToAppState(data, 'FallbackName')
            expect(name).toBe('FallbackName')
            expect(appState.songInfos.name).toBe('FallbackName')
        })

        it('defaults selectedPatternNum to 0 when missing', () => {
            const data = { patterns: [{ name: 'A' }] }
            songService.applyToAppState(data, 'X')
            expect(serviceRegistry.cmd.setSelectedPatternNum).toHaveBeenCalledWith(0)
        })
    })

    describe('exportToFile', () => {
        it('calls downloadJson with .odbox extension', () => {
            appState.patterns = [{ name: 'P' }]
            songService.exportToFile('My Song!')
            expect(downloadJson).toHaveBeenCalledOnce()
            const args = downloadJson.mock.calls[0]
            expect(args[1]).toBe('My_Song_.odbox')
            expect(args[0].exportedAt).toBeTypeOf('number')
            expect(args[0].version).toBe(1)
        })

        it('sanitizes special characters in filename', () => {
            songService.exportToFile('a/b:c*d?e')
            expect(downloadJson.mock.calls[0][1]).toBe('a_b_c_d_e.odbox')
        })
    })

    describe('parseImportedFile', () => {
        it('parses valid JSON with patterns array', () => {
            const text = JSON.stringify({ patterns: [{ name: 'A' }], name: 'X' })
            const result = songService.parseImportedFile(text)
            expect(result).toEqual({ patterns: [{ name: 'A' }], name: 'X' })
        })

        it('returns null for JSON without patterns', () => {
            const result = songService.parseImportedFile('{"name":"X"}')
            expect(result).toBeNull()
        })

        it('returns null for JSON with patterns as non-array', () => {
            const result = songService.parseImportedFile('{"patterns":"not-array"}')
            expect(result).toBeNull()
        })

        it('returns null for invalid JSON', () => {
            expect(() => songService.parseImportedFile('not json')).toThrow()
        })
    })
})
