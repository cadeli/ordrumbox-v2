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

import songService from '../src/logic/services/song_service.js'
import { idbPut, idbGet, idbKeys } from '../src/core/idb.js'

describe('SongService', () => {
    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        idbPut.mockClear()
        idbGet.mockClear()
        idbKeys.mockClear()
        serviceRegistry.cmd = {
            setSelectedPatternIdx: vi.fn(),
            resetPage: vi.fn(() => {
                appState.currentPage = 0
            }),
            recordTransaction: (_desc, fn) => fn(),
        }
    })

    describe('buildSongData', () => {
        it('serializes current appState into song data', () => {
            appState.patterns = [{ name: 'A', tracks: [], bpm: 120, beatCount: 4 }]
            appState.selectedPatternIdx = 0
            appState.songInfos.description = 'My song'
            appState.songInfos.date = '2025-01-01'

            const data = songService.buildSongData('TestSong')
            expect(data.version).toBeUndefined()
            expect(data.name).toBe('TestSong')
            expect(data.description).toBe('My song')
            expect(data.date).toBe('2025-01-01')
            expect(data.patterns).toHaveLength(1)
            expect(data.patterns[0].name).toBe('A')
            expect(data.selectedPatternIdx).toBe(0)
        })

        // Arrangements travel with the song: v2 of the .odbox format added them.
        it('carries the arrangements and the selected song', () => {
            appState.songs = [{ id: 'demo', name: 'Demo', bpm: 120, clips: [{ pattern: 'a', startBar: 0, bars: 2 }] }]
            appState.selectedSongIdx = 0

            const data = songService.buildSongData('TestSong')

            expect(data.songs).toHaveLength(1)
            expect(data.songs[0].clips).toEqual([{ pattern: 'a', startBar: 0, bars: 2 }])
            expect(data.selectedSongIdx).toBe(0)
        })

        it('writes an empty songs array when none exist', () => {
            appState.songs = []
            expect(songService.buildSongData('X').songs).toEqual([])
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
        it('replaces patterns and sets songInfos', async () => {
            appState.patterns = [{ name: 'old' }]
            const data = {
                name: 'Loaded',
                description: 'desc',
                date: '2025-06-01',
                patterns: [{ name: 'new1' }, { name: 'new2' }],
                selectedPatternIdx: 1,
            }
            const name = await songService.applyToAppState(data, 'fallback')
            expect(name).toBe('Loaded')
            expect(appState.patterns).toHaveLength(2)
            expect(appState.patterns[0].name).toBe('new1')
            expect(appState.songInfos.name).toBe('Loaded')
            expect(appState.songInfos.description).toBe('desc')
            expect(appState.songInfos.date).toBe('2025-06-01')
            expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalledWith(1)
            expect(appState.currentPage).toBe(0)
        })

        // .odbox files exported before the selectedPatternNum → selectedPatternIdx
        // rename still have to select their pattern.
        it('reads the legacy selectedPatternNum of an older file', async () => {
            const data = { patterns: [{ name: 'A' }, { name: 'B' }], selectedPatternNum: 1 }
            await songService.applyToAppState(data, 'Legacy')
            expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalledWith(1)
        })

        it('prefers selectedPatternIdx when a file carries both spellings', async () => {
            const data = {
                patterns: [{ name: 'A' }, { name: 'B' }],
                selectedPatternIdx: 0,
                selectedPatternNum: 1,
            }
            await songService.applyToAppState(data, 'Both')
            expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalledWith(0)
        })

        it('uses fallback name when data.name is null', async () => {
            const data = { patterns: [], selectedPatternIdx: 0 }
            const name = await songService.applyToAppState(data, 'FallbackName')
            expect(name).toBe('FallbackName')
            expect(appState.songInfos.name).toBe('FallbackName')
        })

        it('defaults the selected pattern to 0 when missing', async () => {
            const data = { patterns: [{ name: 'A' }] }
            await songService.applyToAppState(data, 'X')
            expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalledWith(0)
        })
    })

    describe('exportToFile', () => {
        it('returns data with .odbox filename', () => {
            appState.patterns = [{ name: 'P' }]
            const result = songService.exportToFile('My Song!')
            expect(result.filename).toBe('My_Song_.odbox')
            expect(result.data.exportedAt).toBeTypeOf('number')
            expect(result.data.version).toBeUndefined()
        })

        it('sanitizes special characters in filename', () => {
            const result = songService.exportToFile('a/b:c*d?e')
            expect(result.filename).toBe('a_b_c_d_e.odbox')
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

// Arrangements (v2) survive a save / load cycle, and a stale clip reference is
// reported instead of silently loading a broken arrangement.
describe('SongService — arrangements', () => {
    beforeEach(() => {
        appState.reset()
        serviceRegistry.cmd = {
            setSelectedPatternIdx: vi.fn(() => Promise.resolve()),
            resetPage: vi.fn(),
            recordTransaction: (_desc, fn) => fn(),
        }
    })

    it('restores arrangements whose pattern ids exist', async () => {
        const data = songService.buildSongData('S')
        data.songs = [{ id: 'demo', name: 'Demo', bpm: 95, clips: [{ pattern: 'a', startBar: 0, bars: 2 }] }]
        data.patterns = [{ id: 'a', name: 'A', tracks: [], beatCount: 8 }]

        await songService.applyToAppState(data, 'fallback')

        expect(appState.songs).toHaveLength(1)
        expect(appState.songs[0].bpm).toBe(95)
        expect(appState.songs[0].clips).toEqual([{ pattern: 'a', startBar: 0, bars: 2 }])
    })

    it('drops a clip referencing an unknown pattern id but keeps the song', async () => {
        const data = songService.buildSongData('S')
        data.patterns = [{ id: 'a', name: 'A', tracks: [] }]
        data.songs = [
            {
                id: 'demo',
                clips: [
                    { pattern: 'ghost', startBar: 0, bars: 1 },
                    { pattern: 'a', startBar: 4, bars: 1 },
                ],
            },
        ]

        await songService.applyToAppState(data, 'fallback')

        expect(appState.songs[0].clips).toEqual([{ pattern: 'a', startBar: 4, bars: 1 }])
    })

    it('clamps selectedSongIdx when the song disappears', async () => {
        const data = songService.buildSongData('S')
        data.patterns = [{ id: 'a', name: 'A', tracks: [] }]
        data.songs = []
        data.selectedSongIdx = 7

        await songService.applyToAppState(data, 'fallback')

        expect(appState.selectedSongIdx).toBe(0)
    })
})

// .odbox files exported before the retriggerNum → retriggerCount rename still
// have to keep their retrigger value (no fixPattern runs on this path).
describe('SongService - legacy note keys', () => {
    it('maps retriggerNum of an imported file onto retriggerCount', async () => {
        const data = {
            name: 'Legacy',
            patterns: [{ name: 'A', tracks: [{ name: 'KICK', notes: [{ beat: 0, retriggerNum: 4 }] }] }],
        }
        await songService.applyToAppState(data, 'Legacy')
        expect(appState.patterns[0].tracks[0].notes[0].retriggerCount).toBe(4)
        expect(appState.patterns[0].tracks[0].notes[0]).not.toHaveProperty('retriggerNum')
    })

    it('maps a legacy compact noteKeys header', async () => {
        const data = {
            name: 'Legacy',
            patterns: [
                {
                    name: 'A',
                    tracks: [{ name: 'KICK', noteKeys: ['beat', 'retriggerNum'], notes: [[0, 5]] }],
                },
            ],
        }
        await songService.applyToAppState(data, 'Legacy')
        expect(appState.patterns[0].tracks[0].noteKeys).toEqual(['beat', 'retriggerCount'])
    })
})
