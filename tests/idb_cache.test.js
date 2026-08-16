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

describe('IDB Cache', () => {
    let cache

    beforeEach(async () => {
        globalThis.indexedDB = createMockIDB()
        Object.defineProperty(globalThis, 'navigator', {
            value: { storage: { estimate: vi.fn() } },
            writable: true,
            configurable: true,
        })
        cache = await import('../src/cache/idb_cache.js')
    })

    it('caches and retrieves patterns', async () => {
        const data = { patterns: [{ name: 'test' }], infos: { name: 'Test' } }
        await cache.cachePatterns(data)
        const result = await cache.getCachedPatterns()
        expect(result).toEqual(data)
    })

    it('getCachedPatterns returns null when empty', async () => {
        const result = await cache.getCachedPatterns()
        expect(result).toBeNull()
    })

    it('caches and retrieves drumkits', async () => {
        const data = { kick: { name: 'Kick', instruments: [] } }
        await cache.cacheDrumkits(data)
        const result = await cache.getCachedDrumkits()
        expect(result).toEqual(data)
    })

    it('getCachedDrumkits returns null when empty', async () => {
        const result = await cache.getCachedDrumkits()
        expect(result).toBeNull()
    })

    it('caches and retrieves samples', async () => {
        const buf = new ArrayBuffer(1024)
        await cache.cacheSample('kick.wav', buf)
        const result = await cache.getCachedSample('kick.wav')
        expect(result).toBe(buf)
    })

    it('getCachedSample returns null when empty', async () => {
        const result = await cache.getCachedSample('nonexistent.wav')
        expect(result).toBeNull()
    })

    it('clearPatternsCache clears patterns store', async () => {
        await cache.cachePatterns({ patterns: [] })
        await cache.clearPatternsCache()
        const result = await cache.getCachedPatterns()
        expect(result).toBeNull()
    })

    it('clearDrumkitsCache clears drumkits store', async () => {
        await cache.cacheDrumkits({ kick: {} })
        await cache.clearDrumkitsCache()
        const result = await cache.getCachedDrumkits()
        expect(result).toBeNull()
    })

    it('clearSamplesCache clears samples store', async () => {
        await cache.cacheSample('a.wav', new ArrayBuffer(100))
        await cache.clearSamplesCache()
        const result = await cache.getCachedSample('a.wav')
        expect(result).toBeNull()
    })

    it('clearAllCache clears all cache stores', async () => {
        await cache.cachePatterns({ patterns: [] })
        await cache.cacheDrumkits({ kick: {} })
        await cache.cacheSample('a.wav', new ArrayBuffer(100))
        await cache.clearAllCache()
        expect(await cache.getCachedPatterns()).toBeNull()
        expect(await cache.getCachedDrumkits()).toBeNull()
        expect(await cache.getCachedSample('a.wav')).toBeNull()
    })

    it('getCacheStats returns correct counts', async () => {
        await cache.cachePatterns({ patterns: [] })
        await cache.cacheDrumkits({ kick: {}, snare: {} })
        await cache.cacheSample('kick.wav', new ArrayBuffer(1024))
        await cache.cacheSample('snare.wav', new ArrayBuffer(2048))
        const stats = await cache.getCacheStats()
        expect(stats.patterns.count).toBe(1)
        expect(stats.drumkits.count).toBe(1)
        expect(stats.samples.count).toBe(2)
        expect(stats.samples.bytes).toBe(3072)
        expect(stats.totalBytes).toBeGreaterThan(0)
        expect(Array.isArray(stats.entries)).toBe(true)
        expect(stats.entries.length).toBe(4)
    })

    it('getCacheStats entries contain key, type, size, savedAt', async () => {
        await cache.cachePatterns({ patterns: [] })
        const stats = await cache.getCacheStats()
        const entry = stats.entries.find(e => e.type === 'patterns')
        expect(entry).toBeDefined()
        expect(entry.key).toBe('song_data')
        expect(typeof entry.size).toBe('number')
        expect(typeof entry.savedAt).toBe('number')
    })

    it('getCachedPatterns returns unwrapped data', async () => {
        await cache.cachePatterns({ patterns: [1, 2] })
        const result = await cache.getCachedPatterns()
        expect(result).toEqual({ patterns: [1, 2] })
        expect(result.savedAt).toBeUndefined()
    })

    it('getCachedSample returns unwrapped ArrayBuffer', async () => {
        const buf = new ArrayBuffer(512)
        await cache.cacheSample('test.wav', buf)
        const result = await cache.getCachedSample('test.wav')
        expect(result).toBe(buf)
        expect(result.savedAt).toBeUndefined()
    })

    it('formatBytes formats correctly', () => {
        expect(cache.formatBytes(0)).toBe('0 B')
        expect(cache.formatBytes(1024)).toBe('1.0 KB')
        expect(cache.formatBytes(1048576)).toBe('1.0 MB')
    })

    it('formatDate formats timestamp correctly', () => {
        expect(cache.formatDate(null)).toBe('-')
        expect(cache.formatDate(0)).toMatch(/^\d{4}-\d{2}-\d{2}/)
        const ts = new Date(2025, 5, 15, 14, 30).getTime()
        expect(cache.formatDate(ts)).toBe('2025-06-15 14:30')
    })
})
