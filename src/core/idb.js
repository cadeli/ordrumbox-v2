import { logger } from './logger.js'

const DB_NAME = 'ordrumbox'
const DB_VERSION = 8

const ALL_STORES = ['settings', 'songs', 'patterns', 'drumkits', 'samples', 'generated_sounds']

/**
 * Executor for the IDB request promises: `resolve` takes no value here, so
 * TypeScript must be told `resolve()` is callable (default Promise<T> typing
 * would otherwise require an argument).
 * @typedef {(resolve: (value?: any) => void, reject: (reason?: any) => void) => void} IdbExecutor
 */

export const MIGRATIONS = {}

/** Creates missing stores, then runs every migration in (oldVersion, newVersion]. */
/** @param {IDBDatabase} db @param {number} oldVersion @param {number} newVersion @param {IDBTransaction|null} [tx] */
export function runUpgrades(db, oldVersion, newVersion, tx = null) {
    for (const name of ALL_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
    }

    const versions = Object.keys(MIGRATIONS)
        .map(Number)
        .filter((version) => version > oldVersion && version <= newVersion)
        .sort((a, b) => a - b)

    for (const version of versions) {
        /** @type {Record<number, (db: IDBDatabase, tx: IDBTransaction|null) => void>} */ (MIGRATIONS)[version](db, tx)
    }
}

/** @type {Promise<IDBDatabase> | null} */
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
/** @param {string} storeName @param {IDBTransactionMode} mode @param {(store: IDBObjectStore) => Promise<any>} run */
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

/** @param {string} storeName @param {IDBValidKey} key */
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

/** @param {string} storeName @param {IDBValidKey} key @param {any} value */
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

/** @param {string} storeName @param {IDBValidKey} key */
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

/** @param {string} storeName */
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

/** @param {string} storeName */
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

/** @param {string} storeName */
export function idbGetAllEntries(storeName) {
    return withStore(
        storeName,
        'readonly',
        (store) =>
            new Promise((resolve, reject) => {
                const req = store.openCursor()
                /** @type {Array<{key: IDBValidKey, value: unknown}>} */
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

/**
 * Builds a diagnostic snapshot of the database and the storage estimate.
 * Named getStorageReport: it computes and returns, it does not report anything
 * to the user (and `usageRatio` is a number, not a formatted percentage).
 * @returns {Promise<{usageBytes?: number, quotaBytes?: number, usageRatio?: number|null, stores: Object<string, IDBValidKey[]>}>}
 */
export async function getStorageReport() {
    /** @type {{usageBytes?: number, quotaBytes?: number, usageRatio?: number|null, stores: Record<string, IDBValidKey[]>}} */
    const report = { stores: {} }
    try {
        const est = await navigator.storage?.estimate?.()
        if (est) {
            report.usageBytes = est.usage ?? 0
            report.quotaBytes = est.quota ?? 0
            report.usageRatio = est.quota > 0 ? est.usage / est.quota : null
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
