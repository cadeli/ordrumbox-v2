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
            transaction: (storeName, mode) => {
                const store = ensureStore(storeName)
                return {
                    objectStore: () => ({
                        get: (key) => {
                            const req = { result: undefined, onsuccess: null, onerror: null }
                            queueMicrotask(() => { req.result = store[key]; req.onsuccess?.() })
                            return req
                        },
                        put: (value, key) => {
                            const req = { onsuccess: null, onerror: null }
                            queueMicrotask(() => { store[key] = value; req.onsuccess?.() })
                            return req
                        },
                        delete: (key) => {
                            const req = { onsuccess: null, onerror: null }
                            queueMicrotask(() => { delete store[key]; req.onsuccess?.() })
                            return req
                        },
                        getAllKeys: () => {
                            const req = { result: [], onsuccess: null, onerror: null }
                            queueMicrotask(() => { req.result = Object.keys(store); req.onsuccess?.() })
                            return req
                        },
                        getAll: () => {
                            const req = { result: [], onsuccess: null, onerror: null }
                            queueMicrotask(() => { req.result = Object.values(store); req.onsuccess?.() })
                            return req
                        },
                        clear: () => {
                            const req = { onsuccess: null, onerror: null }
                            queueMicrotask(() => { for (const k in store) delete store[k]; req.onsuccess?.() })
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
        expect(entries.map(e => e.key)).toContain('kick.wav')
        expect(entries.map(e => e.key)).toContain('snare.wav')
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
})
