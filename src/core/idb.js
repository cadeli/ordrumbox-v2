import { logger } from './logger.js'

const DB_NAME = 'ordrumbox'
const DB_VERSION = 4

const ALL_STORES = ['settings', 'songs', 'patterns', 'drumkits', 'samples', 'generated_sounds']

/**
 * Executor for the IDB request promises: `resolve` takes no value here, so
 * TypeScript must be told `resolve()` is callable (default Promise<T> typing
 * would otherwise require an argument).
 * @typedef {(resolve: () => void, reject: (reason?: unknown) => void) => void} IdbExecutor
 */

/**
 * Schema migrations keyed by the DB_VERSION they ship with:
 *     5: (db, tx) => { ... }
 * They run inside `onupgradeneeded` when upgrading from a version < 5, so add
 * an entry here (and bump DB_VERSION) whenever persisted data changes shape.
 */
export const MIGRATIONS = {}

/** Creates missing stores, then runs every migration in (oldVersion, newVersion]. */
export function runUpgrades(db, oldVersion, newVersion, tx = null) {
    for (const name of ALL_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
    }

    const versions = Object.keys(MIGRATIONS)
        .map(Number)
        .filter((version) => version > oldVersion && version <= newVersion)
        .sort((a, b) => a - b)

    for (const version of versions) {
        MIGRATIONS[version](db, tx)
    }
}

let dbPromise = null

/**
 * Returns the shared connection, opening it on first use. The connection lives
 * for the whole session (one open/close per operation is wasteful); it is
 * dropped on close / version change / failed open so the next call reopens.
 */
export function openDb() {
    if (dbPromise) return dbPromise

    const promise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onupgradeneeded = (event) => {
            runUpgrades(request.result, event.oldVersion ?? 0, DB_VERSION, request.transaction)
        }
        request.onsuccess = () => {
            const db = request.result
            const invalidate = () => {
                if (dbPromise === promise) dbPromise = null
            }
            db.onversionchange = () => {
                db.close()
                invalidate()
            }
            db.onclose = invalidate
            resolve(db)
        }
        request.onerror = () => reject(request.error)
        request.onblocked = () => logger.warn('Idb', 'Database open blocked by another tab')
    })

    dbPromise = promise
    promise.catch(() => {
        if (dbPromise === promise) dbPromise = null
    })

    return promise
}

/**
 * Runs `run(store)` inside a transaction on the shared connection, reopening
 * the connection once if it turns out to be closed (e.g. another tab bumped
 * DB_VERSION and forced a version change).
 */
async function withStore(storeName, mode, run) {
    const db = await openDb()
    try {
        return await run(db.transaction(storeName, mode).objectStore(storeName))
    } catch (e) {
        if (e?.name !== 'InvalidStateError') throw e
        // The shared connection was closed under us (version change from another
        // tab, or a connection error): drop it and retry once on a fresh one.
        if (dbPromise !== null) {
            dbPromise = null
            try {
                db.close()
            } catch {
                // already closed
            }
        }
        const fresh = await openDb()
        return run(fresh.transaction(storeName, mode).objectStore(storeName))
    }
}

export function idbGet(storeName, key) {
    return withStore(
        storeName,
        'readonly',
        (store) =>
            new Promise((resolve, reject) => {
                const req = store.get(key)
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
            }),
    )
}

export function idbPut(storeName, key, value) {
    return withStore(
        storeName,
        'readwrite',
        (store) =>
            new Promise(
                /** @type {IdbExecutor} */ (
                    (resolve, reject) => {
                        const req = store.put(value, key)
                        req.onsuccess = () => resolve()
                        req.onerror = () => reject(req.error)
                    }
                ),
            ),
    )
}

export function idbDelete(storeName, key) {
    return withStore(
        storeName,
        'readwrite',
        (store) =>
            new Promise(
                /** @type {IdbExecutor} */ (
                    (resolve, reject) => {
                        const req = store.delete(key)
                        req.onsuccess = () => resolve()
                        req.onerror = () => reject(req.error)
                    }
                ),
            ),
    )
}

export function idbKeys(storeName) {
    return withStore(
        storeName,
        'readonly',
        (store) =>
            new Promise((resolve, reject) => {
                const req = store.getAllKeys()
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
            }),
    )
}

export function idbClearStore(storeName) {
    return withStore(
        storeName,
        'readwrite',
        (store) =>
            new Promise(
                /** @type {IdbExecutor} */ (
                    (resolve, reject) => {
                        const req = store.clear()
                        req.onsuccess = () => resolve()
                        req.onerror = () => reject(req.error)
                    }
                ),
            ),
    )
}

export function idbGetAll(storeName) {
    return withStore(
        storeName,
        'readonly',
        (store) =>
            new Promise((resolve, reject) => {
                const req = store.getAll()
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
            }),
    )
}

export function idbGetAllEntries(storeName) {
    return withStore(
        storeName,
        'readonly',
        (store) =>
            new Promise((resolve, reject) => {
                const req = store.openCursor()
                const entries = []
                req.onsuccess = () => {
                    const cursor = req.result
                    if (cursor) {
                        entries.push({ key: cursor.key, value: cursor.value })
                        cursor.continue()
                    } else {
                        resolve(entries)
                    }
                }
                req.onerror = () => reject(req.error)
            }),
    )
}

export async function idbReport() {
    const report = { stores: {} }
    try {
        const est = await navigator.storage?.estimate?.()
        if (est) {
            report.usageBytes = est.usage ?? 0
            report.quotaBytes = est.quota ?? 0
            report.usagePct = est.quota > 0 ? ((est.usage / est.quota) * 100).toFixed(2) + '%' : 'N/A'
        }
    } catch (e) {
        logger.warn('Idb', 'Storage estimate unavailable', e)
    }

    try {
        const db = await openDb()
        const storeNames = [...db.objectStoreNames]
        for (const name of storeNames) {
            const keys = await withStore(
                name,
                'readonly',
                (store) =>
                    new Promise((resolve, reject) => {
                        const req = store.getAllKeys()
                        req.onsuccess = () => resolve(req.result)
                        req.onerror = () => reject(req.error)
                    }),
            )
            report.stores[name] = keys
        }
    } catch (e) {
        logger.warn('Idb', 'IDB unavailable for store listing', e)
    }

    return report
}
