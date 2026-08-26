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
                let pendingOps = 0
                const tx = {
                    oncomplete: null,
                    objectStore: () => ({
                        get: (key) => {
                            const req = { result: undefined, onsuccess: null, onerror: null }
                            pendingOps++
                            queueMicrotask(() => { req.result = store[key]; req.onsuccess?.(); if (--pendingOps === 0 && tx.oncomplete) queueMicrotask(() => tx.oncomplete?.()) })
                            return req
                        },
                        put: (value, key) => {
                            const req = { onsuccess: null, onerror: null }
                            pendingOps++
                            queueMicrotask(() => { store[key] = value; req.onsuccess?.(); if (--pendingOps === 0 && tx.oncomplete) queueMicrotask(() => tx.oncomplete?.()) })
                            return req
                        },
                        delete: (key) => {
                            const req = { onsuccess: null, onerror: null }
                            pendingOps++
                            queueMicrotask(() => { delete store[key]; req.onsuccess?.(); if (--pendingOps === 0 && tx.oncomplete) queueMicrotask(() => tx.oncomplete?.()) })
                            return req
                        },
                        getAllKeys: () => {
                            const req = { result: [], onsuccess: null, onerror: null }
                            pendingOps++
                            queueMicrotask(() => { req.result = Object.keys(store); req.onsuccess?.(); if (--pendingOps === 0 && tx.oncomplete) queueMicrotask(() => tx.oncomplete?.()) })
                            return req
                        },
                        getAll: () => {
                            const req = { result: [], onsuccess: null, onerror: null }
                            pendingOps++
                            queueMicrotask(() => { req.result = Object.values(store); req.onsuccess?.(); if (--pendingOps === 0 && tx.oncomplete) queueMicrotask(() => tx.oncomplete?.()) })
                            return req
                        },
                        clear: () => {
                            const req = { onsuccess: null, onerror: null }
                            pendingOps++
                            queueMicrotask(() => { for (const k in store) delete store[k]; req.onsuccess?.(); if (--pendingOps === 0 && tx.oncomplete) queueMicrotask(() => tx.oncomplete?.()) })
                            return req
                        },
                        openCursor: () => {
                            const req = { result: null, onsuccess: null, onerror: null }
                            const keys = Object.keys(store)
                            let idx = 0
                            pendingOps++
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
                                if (!keys.length) { if (--pendingOps === 0 && tx.oncomplete) queueMicrotask(() => tx.oncomplete?.()) }
                            }
                            queueMicrotask(fire)
                            return req
                        },
                    }),
                }
                return tx
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

    // ── Version validation ──────────────────────────────────────────

    it('getCachedPatterns returns null when stored version differs', async () => {
        const db = await new Promise((resolve) => {
            const req = globalThis.indexedDB.open('ordrumbox')
            req.onsuccess = () => resolve(req.result)
        })
        const tx = db.transaction('patterns', 'readwrite')
        tx.objectStore('patterns').put(
            { data: { old: true }, savedAt: Date.now(), size: 10, version: '0.0.1', store: 'patterns' },
            'song_data'
        )
        await new Promise(r => { tx.oncomplete = r })
        db.close()

        const result = await cache.getCachedPatterns()
        expect(result).toBeNull()
    })

    it('getCachedDrumkits returns null when stored version differs', async () => {
        const db = await new Promise((resolve) => {
            const req = globalThis.indexedDB.open('ordrumbox')
            req.onsuccess = () => resolve(req.result)
        })
        const tx = db.transaction('drumkits', 'readwrite')
        tx.objectStore('drumkits').put(
            { data: { old: true }, savedAt: Date.now(), size: 10, version: '0.0.1', store: 'drumkits' },
            'drumkits_data'
        )
        await new Promise(r => { tx.oncomplete = r })
        db.close()

        const result = await cache.getCachedDrumkits()
        expect(result).toBeNull()
    })

    it('getCachedSample returns null when stored version differs', async () => {
        const db = await new Promise((resolve) => {
            const req = globalThis.indexedDB.open('ordrumbox')
            req.onsuccess = () => resolve(req.result)
        })
        const tx = db.transaction('samples', 'readwrite')
        tx.objectStore('samples').put(
            { data: new ArrayBuffer(64), savedAt: Date.now(), size: 64, version: '0.0.1', store: 'samples' },
            'stale.wav'
        )
        await new Promise(r => { tx.oncomplete = r })
        db.close()

        const result = await cache.getCachedSample('stale.wav')
        expect(result).toBeNull()
    })

    // ── TTL expiry ──────────────────────────────────────────────────

    it('getCachedPatterns returns null when TTL expired (8 days old)', async () => {
        const db = await new Promise((resolve) => {
            const req = globalThis.indexedDB.open('ordrumbox')
            req.onsuccess = () => resolve(req.result)
        })
        const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
        const tx = db.transaction('patterns', 'readwrite')
        tx.objectStore('patterns').put(
            { data: { expired: true }, savedAt: eightDaysAgo, size: 10, version: '2.0.0', store: 'patterns' },
            'song_data'
        )
        await new Promise(r => { tx.oncomplete = r })
        db.close()

        const result = await cache.getCachedPatterns()
        expect(result).toBeNull()
    })

    it('getCachedSample accepts entries within TTL (15 days old, 30-day TTL)', async () => {
        const buf = new ArrayBuffer(256)
        await cache.cacheSample('recent.wav', buf)
        const db = await new Promise((resolve) => {
            const req = globalThis.indexedDB.open('ordrumbox')
            req.onsuccess = () => resolve(req.result)
        })
        const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000
        const tx = db.transaction('samples', 'readwrite')
        tx.objectStore('samples').put(
            { data: buf, savedAt: fifteenDaysAgo, size: 256, version: '2.0.0', store: 'samples' },
            'fresh.wav'
        )
        await new Promise(r => { tx.oncomplete = r })
        db.close()

        const result = await cache.getCachedSample('fresh.wav')
        expect(result).toBe(buf)
    })

    it('getCachedSample returns null when TTL expired (31 days old)', async () => {
        const db = await new Promise((resolve) => {
            const req = globalThis.indexedDB.open('ordrumbox')
            req.onsuccess = () => resolve(req.result)
        })
        const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000
        const tx = db.transaction('samples', 'readwrite')
        tx.objectStore('samples').put(
            { data: new ArrayBuffer(64), savedAt: thirtyOneDaysAgo, size: 64, version: '2.0.0', store: 'samples' },
            'old.wav'
        )
        await new Promise(r => { tx.oncomplete = r })
        db.close()

        const result = await cache.getCachedSample('old.wav')
        expect(result).toBeNull()
    })

    it('wrapWithMeta includes version field', async () => {
        await cache.cachePatterns({ versioned: true })
        const db = await new Promise((resolve) => {
            const req = globalThis.indexedDB.open('ordrumbox')
            req.onsuccess = () => resolve(req.result)
        })
        const tx = db.transaction('patterns', 'readonly')
        const raw = await new Promise((resolve) => {
            const req = tx.objectStore('patterns').get('song_data')
            req.onsuccess = () => resolve(req.result)
        })
        db.close()

        expect(raw).toHaveProperty('version')
        expect(raw).toHaveProperty('store', 'patterns')
        expect(typeof raw.size).toBe('number')
        expect(typeof raw.savedAt).toBe('number')
    })
})
