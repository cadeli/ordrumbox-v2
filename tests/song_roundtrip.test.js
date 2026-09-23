/**
 * @vitest-environment jsdom
 *
 * Song & Project Persistence Roundtrip tests
 * ──────────────────────────────────────────
 * Validates that an entire orDrumbox project (multi-pattern, polyrhythmic,
 * samples + softsynth tracks, LFOs, note modulations, and song metadata)
 * survives persistence to storage and export/import without any data loss.
 *
 * Covers:
 *   1. Full project State → IndexedDB → State roundtrip (zero data loss)
 *   2. Full project State → .odbox file (JSON) → State roundtrip
 *   3. Multi-project storage isolation (Song A and Song B in same database)
 *   4. Edge cases & error handling (corrupted file, missing keys, special characters)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import songService from '../src/logic/services/song_service.js'
import Commander from '../src/logic/commands/cmd.js'

// ─── IndexedDB in-memory mock for persistence testing ───────────────────────

function createMockIDB() {
    const stores = {}

    function ensureStore(name) {
        if (!stores[name]) stores[name] = {}
        return stores[name]
    }

    function createDb() {
        return {
            close: vi.fn(),
            get objectStoreNames() {
                return Object.keys(stores)
            },
            transaction: (storeName) => {
                const store = ensureStore(storeName)
                return {
                    objectStore: () => ({
                        get: (key) => {
                            const req = { result: undefined, onsuccess: null, onerror: null }
                            queueMicrotask(() => {
                                req.result = store[key] ? JSON.parse(JSON.stringify(store[key])) : undefined
                                req.onsuccess?.()
                            })
                            return req
                        },
                        put: (value, key) => {
                            const req = { onsuccess: null, onerror: null }
                            queueMicrotask(() => {
                                store[key] = JSON.parse(JSON.stringify(value))
                                req.onsuccess?.()
                            })
                            return req
                        },
                        delete: (key) => {
                            const req = { onsuccess: null, onerror: null }
                            queueMicrotask(() => {
                                delete store[key]
                                req.onsuccess?.()
                            })
                            return req
                        },
                        getAllKeys: () => {
                            const req = { result: [], onsuccess: null, onerror: null }
                            queueMicrotask(() => {
                                req.result = Object.keys(store)
                                req.onsuccess?.()
                            })
                            return req
                        },
                        getAll: () => {
                            const req = { result: [], onsuccess: null, onerror: null }
                            queueMicrotask(() => {
                                req.result = Object.values(store)
                                req.onsuccess?.()
                            })
                            return req
                        },
                        clear: () => {
                            const req = { onsuccess: null, onerror: null }
                            queueMicrotask(() => {
                                for (const k in store) delete store[k]
                                req.onsuccess?.()
                            })
                            return req
                        },
                    }),
                }
            },
        }
    }

    return {
        open: () => {
            const req = { result: null, onsuccess: null, onerror: null }
            queueMicrotask(() => {
                req.result = createDb()
                req.onsuccess?.()
            })
            return req
        },
    }
}

// ─── Test fixture: complex multi-pattern project ────────────────────────────

function buildComplexProject() {
    return {
        patterns: [
            {
                name: 'Intro_Beat',
                bpm: 124,
                nbBeats: 4,
                description: 'Smooth intro with filtered hats',
                tracks: [
                    {
                        name: 'KICK',
                        soundId: 'acoustic/kick_01.wav',
                        useAutoAssignSound: true,
                        useSoftSynth: false,
                        nbBeats: 4,
                        stepsPerBeat: 4,
                        loopAtStep: 16,
                        velocity: 0.95,
                        pan: 0,
                        pitch: 0,
                        filterCutoff: 12000,
                        filterResonance: 1,
                        filterType: 'lowpass',
                        mute: false,
                        solo: false,
                        notes: [
                            { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0, pos: 0, prob: 1 },
                            { beat: 1, beatStep: 0, velocity: 0.85, pitch: 0, pos: 1, prob: 1 },
                            { beat: 2, beatStep: 0, velocity: 0.9, pitch: 0, pos: 2, prob: 1 },
                            { beat: 3, beatStep: 0, velocity: 0.8, pitch: 0, pos: 3, prob: 0.9 },
                        ],
                    },
                    {
                        name: 'SNARE',
                        soundId: 'acoustic/snare_01.wav',
                        useAutoAssignSound: true,
                        useSoftSynth: false,
                        nbBeats: 4,
                        stepsPerBeat: 4,
                        loopAtStep: 16,
                        velocity: 0.8,
                        pan: 0.1,
                        pitch: 0,
                        filterCutoff: 15000,
                        filterResonance: 1,
                        filterType: 'off',
                        mute: false,
                        solo: false,
                        notes: [
                            { beat: 1, beatStep: 0, velocity: 0.85, pitch: 0, arp: [0, 7], retriggerNum: 2, pos: 0 },
                            { beat: 3, beatStep: 0, velocity: 0.9, pitch: 0, arp: [0, 12], retriggerNum: 1, pos: 1 },
                        ],
                    },
                    {
                        name: 'BASS_SYNTH',
                        soundId: '',
                        useAutoAssignSound: false,
                        useSoftSynth: true,
                        synthSoundKey: 'SUB_BASS_V1',
                        nbBeats: 4,
                        stepsPerBeat: 4,
                        loopAtStep: 16,
                        velocity: 0.75,
                        pan: -0.15,
                        pitch: -12,
                        filterCutoff: 850,
                        filterResonance: 3.2,
                        filterType: 'lowpass',
                        mute: false,
                        solo: false,
                        notes: [
                            { beat: 0, beatStep: 0, velocity: 0.9, pitch: -12, len: 4, pos: 0 },
                            { beat: 0, beatStep: 2, velocity: 0.7, pitch: -10, len: 2, pos: 1 },
                            { beat: 1, beatStep: 2, velocity: 0.8, pitch: -7, len: 2, pos: 2 },
                            { beat: 2, beatStep: 0, velocity: 0.85, pitch: -5, len: 4, pos: 3 },
                        ],
                    },
                ],
            },
            {
                name: 'Drop_Poly',
                bpm: 132,
                nbBeats: 8,
                description: 'Polyrhythmic drop with euclidean fill',
                tracks: [
                    {
                        name: 'KICK_MAIN',
                        soundId: 'electronic/kick_909.wav',
                        useAutoAssignSound: true,
                        useSoftSynth: false,
                        nbBeats: 8,
                        stepsPerBeat: 4,
                        loopAtStep: 32,
                        velocity: 1.0,
                        pan: 0,
                        pitch: 0,
                        mute: false,
                        solo: true,
                        notes: [
                            { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0 },
                            { beat: 1, beatStep: 0, velocity: 0.9, pitch: 0 },
                            { beat: 2, beatStep: 0, velocity: 1.0, pitch: 0 },
                            { beat: 3, beatStep: 0, velocity: 0.9, pitch: 0 },
                            { beat: 4, beatStep: 0, velocity: 1.0, pitch: 0 },
                            { beat: 5, beatStep: 0, velocity: 0.9, pitch: 0 },
                            { beat: 6, beatStep: 0, velocity: 1.0, pitch: 0 },
                            { beat: 7, beatStep: 0, velocity: 0.95, pitch: 0 },
                        ],
                    },
                    {
                        name: 'PERC_TRIPLET',
                        soundId: 'electronic/conga.wav',
                        useAutoAssignSound: false,
                        useSoftSynth: false,
                        nbBeats: 8,
                        stepsPerBeat: 3,
                        loopAtStep: 24,
                        velocity: 0.7,
                        pan: 0.4,
                        pitch: 3,
                        mute: false,
                        solo: false,
                        notes: [
                            { beat: 0, beatStep: 1, velocity: 0.6, pitch: 3, euclidianFill: 3 },
                            { beat: 2, beatStep: 2, velocity: 0.75, pitch: 5, euclidianFill: 2 },
                        ],
                    },
                ],
            },
            {
                name: 'Outro_Ambient',
                bpm: 100,
                nbBeats: 2,
                description: 'Minimal ambient outro',
                tracks: [
                    {
                        name: 'PAD',
                        soundId: '',
                        useAutoAssignSound: false,
                        useSoftSynth: true,
                        synthSoundKey: 'WARM_PAD',
                        nbBeats: 2,
                        stepsPerBeat: 4,
                        loopAtStep: 8,
                        velocity: 0.5,
                        pan: 0,
                        pitch: 0,
                        mute: false,
                        solo: false,
                        notes: [{ beat: 0, beatStep: 0, velocity: 0.6, pitch: 0, len: 8 }],
                    },
                ],
            },
        ],
        songInfos: {
            name: 'Cyberpunk Odyssey',
            description: 'A 3-part electronic journey with live synths and acoustic drums',
            date: '2026-09-17',
        },
        selectedPatternNum: 1,
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Song & Project Persistence Roundtrip', () => {
    let mockIDB

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        // Set up real Commander and History for state manipulation
        const cmd = new Commander()
        serviceRegistry.cmd = cmd
        serviceRegistry.seq = { setBpm: vi.fn(), toggleStartStop: vi.fn() }
        serviceRegistry.patterns = { applyFlatNotes: vi.fn() }

        // Install in-memory mock of IndexedDB
        mockIDB = createMockIDB()
        globalThis.indexedDB = mockIDB
    })

    describe('Roundtrip 1: State → IndexedDB → State (Zero Data Loss)', () => {
        it('preserves complete project structure, all patterns, tracks, notes and metadata', async () => {
            const project = buildComplexProject()

            // 1. Populate appState with the complex project
            appState.patterns = structuredClone(project.patterns)
            appState.songInfos.name = project.songInfos.name
            appState.songInfos.description = project.songInfos.description
            appState.songInfos.date = project.songInfos.date
            appState.selectedPatternNum = project.selectedPatternNum

            // 2. Persist to storage via SongService
            await songService.save('Cyberpunk Odyssey')

            // 3. Completely wipe appState memory (simulate browser restart / new session)
            appState.reset()
            expect(appState.patterns).toEqual([])
            expect(appState.songInfos.name).toBe('')
            expect(appState.selectedPatternNum).toBe(0)

            // 4. Load from storage via SongService
            const loadedData = await songService.load('Cyberpunk Odyssey')
            expect(loadedData).not.toBeNull()
            expect(loadedData.version).toBe(1)
            expect(loadedData.savedAt).toBeTypeOf('number')

            // 5. Apply loaded data back to appState
            const appliedName = songService.applyToAppState(loadedData, 'Fallback')
            expect(appliedName).toBe('Cyberpunk Odyssey')

            // 6. Deep assertions: Verify zero data loss across all dimensions
            expect(appState.patterns).toHaveLength(3)
            expect(appState.selectedPatternNum).toBe(1)
            expect(appState.songInfos.name).toBe('Cyberpunk Odyssey')
            expect(appState.songInfos.description).toBe(project.songInfos.description)
            expect(appState.songInfos.date).toBe(project.songInfos.date)

            // Pattern 0 (Intro_Beat)
            const p0 = appState.patterns[0]
            expect(p0.name).toBe('Intro_Beat')
            expect(p0.bpm).toBe(124)
            expect(p0.nbBeats).toBe(4)
            expect(p0.description).toBe('Smooth intro with filtered hats')
            expect(p0.tracks).toHaveLength(3)

            // Track 0 (KICK): sample track
            const kick = p0.tracks[0]
            expect(kick.name).toBe('KICK')
            expect(kick.soundId).toBe('acoustic/kick_01.wav')
            expect(kick.useAutoAssignSound).toBe(true)
            expect(kick.useSoftSynth).toBe(false)
            expect(kick.velocity).toBe(0.95)
            expect(kick.filterCutoff).toBe(12000)
            expect(kick.notes).toHaveLength(4)
            expect(kick.notes[0]).toEqual({ beat: 0, beatStep: 0, velocity: 1.0, pitch: 0, pos: 0, prob: 1 })

            // Track 1 (SNARE): note modulations (arp, retrigger)
            const snare = p0.tracks[1]
            expect(snare.notes).toHaveLength(2)
            expect(snare.notes[0].arp).toEqual([0, 7])
            expect(snare.notes[0].retriggerNum).toBe(2)
            expect(snare.notes[1].arp).toEqual([0, 12])

            // Track 2 (BASS_SYNTH): softsynth track
            const bass = p0.tracks[2]
            expect(bass.useSoftSynth).toBe(true)
            expect(bass.synthSoundKey).toBe('SUB_BASS_V1')
            expect(bass.pitch).toBe(-12)
            expect(bass.filterCutoff).toBe(850)
            expect(bass.filterResonance).toBe(3.2)
            expect(bass.notes).toHaveLength(4)
            expect(bass.notes[0].len).toBe(4)

            // Pattern 1 (Drop_Poly): polyrhythmic tracks & solo flag
            const p1 = appState.patterns[1]
            expect(p1.name).toBe('Drop_Poly')
            expect(p1.bpm).toBe(132)
            expect(p1.nbBeats).toBe(8)
            expect(p1.tracks[0].solo).toBe(true)
            expect(p1.tracks[1].stepsPerBeat).toBe(3) // Triplet grid
            expect(p1.tracks[1].loopAtStep).toBe(24)
            expect(p1.tracks[1].notes[0].euclidianFill).toBe(3)

            // Pattern 2 (Outro_Ambient): minimal ambient outro
            const p2 = appState.patterns[2]
            expect(p2.name).toBe('Outro_Ambient')
            expect(p2.bpm).toBe(100)
            expect(p2.nbBeats).toBe(2)
            expect(p2.tracks[0].synthSoundKey).toBe('WARM_PAD')
        })
    })

    describe('Roundtrip 2: State → .odbox File (JSON export) → State', () => {
        it('exports to a downloadable .odbox file and re-imports with full fidelity', () => {
            const project = buildComplexProject()

            appState.patterns = structuredClone(project.patterns)
            appState.songInfos.name = 'Techno Project 2026'
            appState.songInfos.description = 'Full export test'
            appState.songInfos.date = '2026-09-17'
            appState.selectedPatternNum = 2

            // 1. Export to file format
            const { data, filename } = songService.exportToFile('Techno Project 2026')
            expect(filename).toBe('Techno_Project_2026.odbox')
            expect(data.version).toBe(1)
            expect(data.exportedAt).toBeTypeOf('number')

            // 2. Simulate saving to disk and reading back (raw string transfer)
            const rawJsonString = JSON.stringify(data, null, 2)

            // 3. Reset application state completely
            appState.reset()
            expect(appState.patterns).toEqual([])

            // 4. Parse imported file content
            const parsedData = songService.parseImportedFile(rawJsonString)
            expect(parsedData).not.toBeNull()

            // 5. Apply back to state
            const loadedName = songService.applyToAppState(parsedData, 'Default')
            expect(loadedName).toBe('Techno Project 2026')

            // 6. Assert fidelity
            expect(appState.patterns).toHaveLength(3)
            expect(appState.selectedPatternNum).toBe(2)
            expect(appState.patterns[0].name).toBe('Intro_Beat')
            expect(appState.patterns[1].name).toBe('Drop_Poly')
            expect(appState.patterns[2].name).toBe('Outro_Ambient')
            expect(appState.patterns[1].tracks[1].stepsPerBeat).toBe(3)
        })
    })

    describe('Roundtrip 3: Multi-project Storage Isolation', () => {
        it('keeps separate songs isolated in IndexedDB without cross-contamination', async () => {
            // Save Song Alpha
            appState.patterns = [
                { name: 'Alpha_1', bpm: 110, nbBeats: 4, tracks: [] },
                { name: 'Alpha_2', bpm: 115, nbBeats: 4, tracks: [] },
            ]
            appState.songInfos.description = 'Alpha project'
            await songService.save('Song_Alpha')

            // Save Song Beta with completely different patterns
            appState.patterns = [{ name: 'Beta_Heavy', bpm: 150, nbBeats: 8, tracks: [] }]
            appState.songInfos.description = 'Beta project'
            await songService.save('Song_Beta')

            // Verify both keys exist in storage
            const keys = await songService.listKeys()
            expect(keys).toContain('Song_Alpha')
            expect(keys).toContain('Song_Beta')

            // Load Song Alpha and verify
            const alphaData = await songService.load('Song_Alpha')
            expect(alphaData.patterns).toHaveLength(2)
            expect(alphaData.patterns[0].name).toBe('Alpha_1')
            expect(alphaData.description).toBe('Alpha project')

            // Load Song Beta and verify
            const betaData = await songService.load('Song_Beta')
            expect(betaData.patterns).toHaveLength(1)
            expect(betaData.patterns[0].name).toBe('Beta_Heavy')
            expect(betaData.description).toBe('Beta project')

            // Overwrite Song Alpha: ensure Song Beta is unchanged
            songService.applyToAppState(alphaData)
            appState.patterns.push({ name: 'Alpha_3', bpm: 120, nbBeats: 4, tracks: [] })
            await songService.save('Song_Alpha')

            const reloadedAlpha = await songService.load('Song_Alpha')
            const reloadedBeta = await songService.load('Song_Beta')
            expect(reloadedAlpha.patterns).toHaveLength(3)
            expect(reloadedBeta.patterns).toHaveLength(1)
        })
    })

    describe('Roundtrip 4: Edge Cases and Robustness', () => {
        it('returns null for non-existent song in IndexedDB', async () => {
            const data = await songService.load('Does_Not_Exist')
            expect(data).toBeNull()
        })

        it('handles song names with special characters, slashes, and unicode correctly', async () => {
            const specialName = 'D&B / Bass-Boosted #1 (2026) 🚀'
            appState.patterns = [{ name: 'P1', bpm: 174, nbBeats: 4, tracks: [] }]
            appState.songInfos.description = 'Special characters test'

            // Save and load via IDB
            await songService.save(specialName)
            const loaded = await songService.load(specialName)
            expect(loaded).not.toBeNull()
            expect(loaded.name).toBe(specialName)

            // Export to file sanitizes filename safely
            const { filename } = songService.exportToFile(specialName)
            expect(filename).not.toContain('/')
            expect(filename).not.toContain('#')
            expect(filename).toMatch(/\.odbox$/)
        })

        it('rejects corrupted or non-pattern JSON gracefully', () => {
            expect(() => songService.parseImportedFile('{ not json')).toThrow()
            expect(songService.parseImportedFile('{"foo": "bar"}')).toBeNull()
            expect(songService.parseImportedFile('{"patterns": "not an array"}')).toBeNull()
        })

        it('handles project with empty patterns array without crashing', async () => {
            appState.patterns = []
            appState.songInfos.name = 'Empty Project'
            await songService.save('Empty Project')

            const loaded = await songService.load('Empty Project')
            expect(loaded).not.toBeNull()
            expect(loaded.patterns).toEqual([])

            songService.applyToAppState(loaded, 'Fallback')
            expect(appState.patterns).toEqual([])
        })
    })
})
