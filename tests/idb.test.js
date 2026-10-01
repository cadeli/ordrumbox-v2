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

    it('idbReport returns report object with stores', async () => {
        await idbModule.idbPut('settings', 'test', 1)
        const report = await idbModule.idbReport()
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

    it('idbReport handles missing navigator.storage gracefully', async () => {
        Object.defineProperty(globalThis, 'navigator', {
            value: {},
            writable: true,
            configurable: true,
        })
        const report = await idbModule.idbReport()
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
})
