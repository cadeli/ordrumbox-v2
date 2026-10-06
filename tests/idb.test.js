import { describe, it, expect, vi, beforeEach } from 'vitest'

function createMockIDB() {
    const stores = {}

    function ensureStore(name) {
        if (!stores[name]) stores[name] = {}
        return stores[name]
    }

    function createDb() {
        const db = {
            close: vi.fn(),
            get objectStoreNames() {
                return Object.keys(stores)
            },
            transaction: (storeName, _mode) => {
                const store = ensureStore(storeName)
                return {
                    objectStore: () => ({
                        get: (key) => {
                            const req = { result: undefined, onsuccess: null, onerror: null }
                            queueMicrotask(() => {
                                req.result = store[key]
                                req.onsuccess?.()
                            })
                            return req
                        },
                        put: (value, key) => {
                            const req = { onsuccess: null, onerror: null }
                            queueMicrotask(() => {
                                store[key] = value
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
                        openCursor: () => {
                            const req = { result: null, onsuccess: null, onerror: null }
                            const keys = Object.keys(store)
                            let idx = 0
                            const fire = () => {
                                if (idx < keys.length) {
                                    const key = keys[idx]
                                    req.result = {
                                        key,
                                        value: store[key],
                                        continue: () => {
                                            idx++
                                            queueMicrotask(fire)
                                        },
                                    }
                                } else {
                                    req.result = null
                                }
                                req.onsuccess?.()
                            }
                            queueMicrotask(fire)
                            return req
                        },
                    }),
                }
            },
        }
        return db
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

describe('IndexedDB helpers', () => {
    let idbModule, mockIDB

    beforeEach(async () => {
        // The shared connection is module state: reset so every test starts with
        // a fresh openDb() against this test's indexedDB mock.
        vi.resetModules()
        mockIDB = createMockIDB()
        globalThis.indexedDB = mockIDB
        Object.defineProperty(globalThis, 'navigator', {
            value: { storage: { estimate: vi.fn() } },
            writable: true,
            configurable: true,
        })
        idbModule = await import('../src/core/idb.js')
    })

    it('openDb resolves with the db instance', async () => {
        const db = await idbModule.openDb()
        expect(db).toBeDefined()
        expect(typeof db.close).toBe('function')
    })

    it('idbPut stores and idbGet retrieves a value', async () => {
        await idbModule.idbPut('settings', 'bpm', 140)
        const val = await idbModule.idbGet('settings', 'bpm')
        expect(val).toBe(140)
    })

    it('idbGet returns undefined for missing key', async () => {
        const val = await idbModule.idbGet('settings', 'nonexistent')
        expect(val).toBeUndefined()
    })

    it('idbDelete removes a stored value', async () => {
        await idbModule.idbPut('songs', 'song1', { name: 'Test' })
        await idbModule.idbDelete('songs', 'song1')
        const val = await idbModule.idbGet('songs', 'song1')
        expect(val).toBeUndefined()
    })

    it('idbKeys returns all keys in a store', async () => {
        await idbModule.idbPut('songs', 'k1', 'v1')
        await idbModule.idbPut('songs', 'k2', 'v2')
        const keys = await idbModule.idbKeys('songs')
        expect(keys).toContain('k1')
        expect(keys).toContain('k2')
    })

    it('idbKeys returns empty array for empty store', async () => {
        const keys = await idbModule.idbKeys('settings')
        expect(Array.isArray(keys)).toBe(true)
    })

    it('getStorageReport returns a snapshot with store keys', async () => {
        await idbModule.idbPut('settings', 'test', 1)
        const report = await idbModule.getStorageReport()
        expect(report).toHaveProperty('stores')
        expect(report.stores).toHaveProperty('settings')
        expect(report.stores.settings).toContain('test')
    })

    it('different stores are isolated', async () => {
        await idbModule.idbPut('settings', 'key1', 'settingsVal')
        await idbModule.idbPut('songs', 'key1', 'songsVal')
        const s1 = await idbModule.idbGet('settings', 'key1')
        const s2 = await idbModule.idbGet('songs', 'key1')
        expect(s1).toBe('settingsVal')
        expect(s2).toBe('songsVal')
    })

    it('getStorageReport handles missing navigator.storage gracefully', async () => {
        Object.defineProperty(globalThis, 'navigator', {
            value: {},
            writable: true,
            configurable: true,
        })
        const report = await idbModule.getStorageReport()
        expect(report).toHaveProperty('stores')
    })

    it('idbClearStore removes all entries from a store', async () => {
        await idbModule.idbPut('patterns', 'k1', 'v1')
        await idbModule.idbPut('patterns', 'k2', 'v2')
        await idbModule.idbClearStore('patterns')
        const keys = await idbModule.idbKeys('patterns')
        expect(keys).toHaveLength(0)
    })

    it('idbGetAll returns all values in a store', async () => {
        await idbModule.idbPut('drumkits', 'a', 10)
        await idbModule.idbPut('drumkits', 'b', 20)
        const all = await idbModule.idbGetAll('drumkits')
        expect(all).toContain(10)
        expect(all).toContain(20)
    })

    it('idbGetAllEntries returns all key-value pairs', async () => {
        await idbModule.idbPut('samples', 'kick.wav', new ArrayBuffer(1024))
        await idbModule.idbPut('samples', 'snare.wav', new ArrayBuffer(2048))
        const entries = await idbModule.idbGetAllEntries('samples')
        expect(entries).toHaveLength(2)
        expect(entries.map((e) => e.key)).toContain('kick.wav')
        expect(entries.map((e) => e.key)).toContain('snare.wav')
    })

    it('idbClearStore only affects the target store', async () => {
        await idbModule.idbPut('patterns', 'p1', 'pat1')
        await idbModule.idbPut('songs', 's1', 'song1')
        await idbModule.idbClearStore('patterns')
        const patternKeys = await idbModule.idbKeys('patterns')
        const songKeys = await idbModule.idbKeys('songs')
        expect(patternKeys).toHaveLength(0)
        expect(songKeys).toContain('s1')
    })

    it('reuses a single connection across operations', async () => {
        const openSpy = vi.spyOn(mockIDB, 'open')
        await idbModule.idbPut('settings', 'a', 1)
        await idbModule.idbGet('settings', 'a')
        await idbModule.idbKeys('settings')
        await idbModule.idbClearStore('settings')
        expect(openSpy).toHaveBeenCalledTimes(1)
    })

    it('reopens the connection after a version change from another tab', async () => {
        const openSpy = vi.spyOn(mockIDB, 'open')
        await idbModule.idbPut('settings', 'k', 'v')

        const db = await idbModule.openDb()
        db.onversionchange()

        expect(db.close).toHaveBeenCalled()
        expect(await idbModule.idbGet('settings', 'k')).toBe('v')
        expect(openSpy).toHaveBeenCalledTimes(2)
    })

    it('reopens the connection after the browser closed it', async () => {
        const openSpy = vi.spyOn(mockIDB, 'open')
        await idbModule.idbPut('settings', 'k', 'v')

        const db = await idbModule.openDb()
        db.onclose()

        expect(await idbModule.idbGet('settings', 'k')).toBe('v')
        expect(openSpy).toHaveBeenCalledTimes(2)
    })

    it('retries once when the held connection is already dead', async () => {
        await idbModule.idbPut('settings', 'k', 'v')
        const db = await idbModule.openDb()
        const openSpy = vi.spyOn(mockIDB, 'open')
        db.transaction = () => {
            const err = new Error('database is closed')
            err.name = 'InvalidStateError'
            throw err
        }

        expect(await idbModule.idbGet('settings', 'k')).toBe('v')
        expect(openSpy).toHaveBeenCalledTimes(1)
    })

    it('propagates a non-InvalidStateError without reopening', async () => {
        await idbModule.idbPut('settings', 'k', 'v')
        const db = await idbModule.openDb()
        const openSpy = vi.spyOn(mockIDB, 'open')
        db.transaction = () => {
            const err = new Error('boom')
            err.name = 'AbortError'
            throw err
        }

        await expect(idbModule.idbGet('settings', 'k')).rejects.toThrow('boom')
        expect(openSpy).not.toHaveBeenCalled()
    })

    it('creates every store on first open through onupgradeneeded', async () => {
        const created = []
        const fakeDb = {
            close: vi.fn(),
            objectStoreNames: { contains: (name) => created.includes(name) },
            createObjectStore: (name) => created.push(name),
        }
        globalThis.indexedDB = {
            open: () => {
                const req = { result: fakeDb, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }
                queueMicrotask(() => {
                    req.onupgradeneeded?.({ oldVersion: 0 })
                    req.onsuccess?.()
                })
                return req
            },
        }

        const db = await idbModule.openDb()

        expect(db).toBe(fakeDb)
        expect(created).toEqual(['settings', 'songs', 'patterns', 'drumkits', 'samples', 'generated_sounds'])
    })

    it('runUpgrades creates missing stores only', () => {
        const created = ['settings']
        const db = {
            objectStoreNames: { contains: (name) => created.includes(name) },
            createObjectStore: (name) => created.push(name),
        }

        idbModule.runUpgrades(db, 0, 4, null)

        expect(created).toEqual(['settings', 'songs', 'patterns', 'drumkits', 'samples', 'generated_sounds'])
    })

    it('runUpgrades runs only migrations inside (oldVersion, newVersion]', () => {
        const calls = []
        idbModule.MIGRATIONS[90] = (db, tx) => calls.push(`90:${tx}`)
        idbModule.MIGRATIONS[91] = () => calls.push('91')
        try {
            const db = { objectStoreNames: { contains: () => true }, createObjectStore: vi.fn() }

            idbModule.runUpgrades(db, 89, 90, 'tx')
            expect(calls).toEqual(['90:tx'])

            calls.length = 0
            idbModule.runUpgrades(db, 90, 91, 'tx')
            expect(calls).toEqual(['91'])

            calls.length = 0
            idbModule.runUpgrades(db, 91, 92, 'tx')
            expect(calls).toEqual([])
            expect(db.createObjectStore).not.toHaveBeenCalled()
        } finally {
            delete idbModule.MIGRATIONS[90]
            delete idbModule.MIGRATIONS[91]
        }
    })

    // ─── MIGRATIONS[5]: nbBeats → beatCount ─────────────────────────────────

    /**
     * Fake cursor walk that mimics IDB: the request fires only once the caller
     * has assigned onsuccess, and continue() re-enters it with the next row.
     */
    function fakeStoreWith(entries) {
        let fire = null
        const store = {
            openCursor: () => {
                const request = { onsuccess: null, result: null }
                let i = 0
                const step = () => {
                    if (i >= entries.length) {
                        request.result = null
                        request.onsuccess?.()
                        return
                    }
                    request.result = {
                        key: entries[i].key,
                        value: entries[i].value,
                        update: (v) => {
                            entries[i].value = v
                        },
                        continue: () => {
                            i += 1
                            step()
                        },
                    }
                    request.onsuccess?.()
                }
                fire = step
                return request
            },
        }
        return { store, start: () => fire?.() }
    }

    /** Same cursor fake as runMigration5, parameterised by version. */
    function runMigrationN(version, storesByName) {
        const handles = []
        const db = { objectStoreNames: { contains: (n) => Object.hasOwn(storesByName, n) } }
        const tx = {
            objectStore: (name) => {
                const h = fakeStoreWith(storesByName[name])
                handles.push(h)
                return h.store
            },
        }
        idbModule.MIGRATIONS[version](db, tx)
        for (const h of handles) h.start()
    }

    const runMigration6 = (stores) => runMigrationN(6, stores)

    function runMigration5(storesByName) {
        const handles = []
        const db = { objectStoreNames: { contains: (n) => Object.hasOwn(storesByName, n) } }
        const tx = {
            objectStore: (name) => {
                const h = fakeStoreWith(storesByName[name])
                handles.push(h)
                return h.store
            },
        }
        idbModule.MIGRATIONS[5](db, tx)
        for (const h of handles) h.start()
    }

    describe('MIGRATIONS[5] renames nbBeats to beatCount', () => {
        it('rewrites songs stored raw, on patterns and their tracks', () => {
            const songs = [
                {
                    key: 'my song',
                    value: {
                        name: 'my song',
                        patterns: [
                            { name: 'A', nbBeats: 8, tracks: [{ name: 'KICK', nbBeats: 8 }] },
                            { name: 'B', nbBeats: 3, tracks: [{ name: 'SNARE', nbBeats: 3 }] },
                        ],
                    },
                },
            ]

            runMigration5({ songs })

            const song = songs[0].value
            expect(song.patterns[0].beatCount).toBe(8)
            expect(song.patterns[0].tracks[0].beatCount).toBe(8)
            expect(song.patterns[1].beatCount).toBe(3)
            expect(song.patterns[1].tracks[0].beatCount).toBe(3)
            expect(JSON.stringify(song)).not.toContain('nbBeats')
        })

        it('rewrites the {data} envelope used by the patterns cache', () => {
            const patterns = [
                {
                    key: 'song.json',
                    value: {
                        data: { patterns: [{ nbBeats: 16, tracks: [{ nbBeats: 16 }] }] },
                        savedAt: 1700000000000,
                        store: 'patterns',
                    },
                },
            ]

            runMigration5({ patterns })

            const entry = patterns[0].value
            expect(entry.data.patterns[0].beatCount).toBe(16)
            expect(entry.data.patterns[0].tracks[0].beatCount).toBe(16)
            // The cache TTL must not be refreshed by the migration.
            expect(entry.savedAt).toBe(1700000000000)
        })

        it('leaves already-migrated data alone', () => {
            const songs = [{ key: 'ok', value: { patterns: [{ beatCount: 4, tracks: [{ beatCount: 4 }] }] } }]

            runMigration5({ songs })

            expect(songs[0].value.patterns[0].beatCount).toBe(4)
        })

        it('does not overwrite a beatCount already present', () => {
            const songs = [{ key: 'both', value: { patterns: [{ nbBeats: 8, beatCount: 6, tracks: [] }] } }]

            runMigration5({ songs })

            expect(songs[0].value.patterns[0].beatCount).toBe(6)
            expect(songs[0].value.patterns[0].nbBeats).toBeUndefined()
        })

        // ─── MIGRATIONS[6]: stable pattern ids ─────────────────────────────────────

        describe('MIGRATIONS[6] assigns stable pattern ids', () => {
            it('mints ids on a raw song blob', () => {
                const songs = [{ key: 'my song', value: { name: 'my song', patterns: [{ name: 'Rock', tracks: [] }] } }]

                runMigration6({ songs })

                expect(songs[0].value.patterns[0].id).toBe('rock')
            })

            it('mints ids inside the {data} envelope of the patterns cache', () => {
                const patterns = [
                    {
                        key: 'song.json',
                        value: { data: { patterns: [{ name: 'Bass Line', tracks: [] }] }, savedAt: 42 },
                    },
                ]

                runMigration6({ patterns })

                expect(patterns[0].value.data.patterns[0].id).toBe('bass-line')
                expect(patterns[0].value.savedAt).toBe(42)
            })

            it('de-duplicates same-named patterns in one song', () => {
                const songs = [
                    {
                        key: 'dup',
                        value: {
                            patterns: [
                                { name: 'Same', tracks: [] },
                                { name: 'Same', tracks: [] },
                            ],
                        },
                    },
                ]

                runMigration6({ songs })

                const ids = songs[0].value.patterns.map((p) => p.id)
                expect(new Set(ids).size).toBe(2)
            })

            // Re-running must not re-slug, or a rename would silently break clips.
            it('never overwrites an existing id', () => {
                const songs = [{ key: 's', value: { patterns: [{ id: 'kept', name: 'Renamed', tracks: [] }] } }]

                runMigration6({ songs })

                expect(songs[0].value.patterns[0].id).toBe('kept')
            })

            it('is a no-op without a transaction', () => {
                const db = { objectStoreNames: { contains: () => true } }
                expect(() => idbModule.MIGRATIONS[6](db, null)).not.toThrow()
            })
        })

        // ─── MIGRATIONS[7]: retriggerNum → retriggerCount ────────────────────────────

        const runMigration7 = (stores) => runMigrationN(7, stores)

        describe('MIGRATIONS[7] renames retriggerNum to retriggerCount', () => {
            it('rewrites object notes of every pattern of a raw song', () => {
                const songs = [
                    {
                        key: 'my song',
                        value: {
                            name: 'my song',
                            patterns: [
                                { name: 'A', tracks: [{ name: 'KICK', notes: [{ beat: 0, retriggerNum: 3 }] }] },
                                { name: 'B', tracks: [{ name: 'SNARE', notes: [{ beat: 1, retriggerNum: 1 }] }] },
                            ],
                        },
                    },
                ]

                runMigration7({ songs })

                const song = songs[0].value
                expect(song.patterns[0].tracks[0].notes[0].retriggerCount).toBe(3)
                expect(song.patterns[1].tracks[0].notes[0].retriggerCount).toBe(1)
                expect(JSON.stringify(song)).not.toContain('retriggerNum')
            })

            it('rewrites the compact noteKeys header as well as the notes', () => {
                const songs = [
                    {
                        key: 'compact',
                        value: {
                            patterns: [
                                {
                                    name: 'A',
                                    tracks: [
                                        { name: 'KICK', noteKeys: ['velocity', 'retriggerNum'], notes: [[0.9, 4]] },
                                    ],
                                },
                            ],
                        },
                    },
                ]

                runMigration7({ songs })

                const track = songs[0].value.patterns[0].tracks[0]
                expect(track.noteKeys).toEqual(['velocity', 'retriggerCount'])
                // Positional: the value stays in its slot, only the name moves.
                expect(track.notes[0]).toEqual([0.9, 4])
            })

            it('rewrites the {data} envelope used by the patterns cache', () => {
                const patterns = [
                    {
                        key: 'song.json',
                        value: {
                            data: { tracks: [{ name: 'BASS', notes: [{ beat: 2, retriggerNum: 5 }] }] },
                            savedAt: 1700000000000,
                        },
                    },
                ]

                runMigration7({ patterns })

                const entry = patterns[0].value
                expect(entry.data.tracks[0].notes[0].retriggerCount).toBe(5)
                // The cache TTL must not be refreshed by the migration.
                expect(entry.savedAt).toBe(1700000000000)
            })

            it('leaves already-migrated data alone', () => {
                const songs = [
                    {
                        key: 'ok',
                        value: { patterns: [{ tracks: [{ notes: [{ beat: 0, retriggerCount: 2 }] }] }] },
                    },
                ]

                runMigration7({ songs })

                expect(songs[0].value.patterns[0].tracks[0].notes[0].retriggerCount).toBe(2)
            })

            it('is a no-op without a transaction', () => {
                const db = { objectStoreNames: { contains: () => true } }
                expect(() => idbModule.MIGRATIONS[7](db, null)).not.toThrow()
            })
        })

        // ─── MIGRATIONS[8]: soundId → sampleId, startBar/bars → measure keys ─────────

        const runMigration8 = (stores) => runMigrationN(8, stores)

        describe('MIGRATIONS[8] renames the measure-era keys', () => {
            it('rewrites track soundId and the clip keys of a raw song', () => {
                const songs = [
                    {
                        key: 'my song',
                        value: {
                            name: 'my song',
                            loopBars: 8,
                            clips: [
                                { pattern: 'verse', startBar: 0, bars: 2 },
                                { pattern: 'chorus', startBar: 2, bars: 4 },
                            ],
                            patterns: [
                                { name: 'A', tracks: [{ name: 'KICK', soundId: 'kick01' }] },
                                { name: 'B', tracks: [{ name: 'SNARE', soundId: 'snare01' }] },
                            ],
                        },
                    },
                ]

                runMigration8({ songs })

                const song = songs[0].value
                expect(song.patterns[0].tracks[0].sampleId).toBe('kick01')
                expect(song.patterns[1].tracks[0].sampleId).toBe('snare01')
                expect(song.loopMeasureCount).toBe(8)
                expect(song.clips).toEqual([
                    { pattern: 'verse', startMeasure: 0, measureCount: 2 },
                    { pattern: 'chorus', startMeasure: 2, measureCount: 4 },
                ])
                expect(JSON.stringify(song)).not.toContain('soundId')
                expect(JSON.stringify(song)).not.toContain('startBar')
                expect(JSON.stringify(song)).not.toContain('loopBars')
            })

            it('rewrites the {data} envelope used by the patterns cache', () => {
                const patterns = [
                    {
                        key: 'song.json',
                        value: {
                            data: { tracks: [{ name: 'BASS', soundId: 'bass01' }] },
                            savedAt: 1700000000000,
                        },
                    },
                ]

                runMigration8({ patterns })

                const entry = patterns[0].value
                expect(entry.data.tracks[0].sampleId).toBe('bass01')
                // The cache TTL must not be refreshed by the migration.
                expect(entry.savedAt).toBe(1700000000000)
            })

            it('leaves already-migrated data alone', () => {
                const songs = [
                    {
                        key: 'ok',
                        value: {
                            loopMeasureCount: 4,
                            clips: [{ pattern: 'a', startMeasure: 0, measureCount: 1 }],
                            patterns: [{ tracks: [{ sampleId: 'kick01' }] }],
                        },
                    },
                ]

                runMigration8({ songs })

                const song = songs[0].value
                expect(song.clips[0]).toEqual({ pattern: 'a', startMeasure: 0, measureCount: 1 })
                expect(song.patterns[0].tracks[0].sampleId).toBe('kick01')
                expect(song.loopMeasureCount).toBe(4)
            })

            it('keeps the current key when a record carries both spellings', () => {
                const songs = [
                    {
                        key: 'both',
                        value: {
                            patterns: [{ tracks: [{ soundId: 'old', sampleId: 'new' }] }],
                            clips: [{ pattern: 'a', startBar: 3, startMeasure: 1, bars: 2, measureCount: 5 }],
                        },
                    },
                ]

                runMigration8({ songs })

                const song = songs[0].value
                expect(song.patterns[0].tracks[0].sampleId).toBe('new')
                expect(song.clips[0].startMeasure).toBe(1)
                expect(song.clips[0].measureCount).toBe(5)
            })

            it('is a no-op without a transaction', () => {
                const db = { objectStoreNames: { contains: () => true } }
                expect(() => idbModule.MIGRATIONS[8](db, null)).not.toThrow()
            })
        })

        it('is a no-op when there is no transaction', () => {
            const db = { objectStoreNames: { contains: () => true } }
            expect(() => idbModule.MIGRATIONS[5](db, null)).not.toThrow()
        })
    })
})
