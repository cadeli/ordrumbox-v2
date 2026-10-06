import { logger } from './logger.js'
import { ensurePatternId } from './ids.js'
import { migrateLegacyPatternKeys } from './note_schema.js'
import { migrateLegacySongKeys } from './legacy_keys.js'

const DB_NAME = 'ordrumbox'
const DB_VERSION = 8

const ALL_STORES = ['settings', 'songs', 'patterns', 'drumkits', 'samples', 'generated_sounds']

/**
 * Executor for the IDB request promises: `resolve` takes no value here, so
 * TypeScript must be told `resolve()` is callable (default Promise<T> typing
 * would otherwise require an argument).
 * @typedef {(resolve: (value?: any) => void, reject: (reason?: any) => void) => void} IdbExecutor
 */

/**
 * Renames `nbBeats` to `beatCount` on one persisted song or pattern.
 * Walks the shapes actually stored: a song ({patterns: [...]}) or a bare
 * pattern, each pattern and each of its tracks. Returns true when something
 * moved.
 * @param {any} node
 * @returns {boolean}
 */
function renameNbBeats(node) {
    if (!node || typeof node !== 'object') return false
    let changed = false
    if (Object.prototype.hasOwnProperty.call(node, 'nbBeats')) {
        if (node.beatCount === undefined) node.beatCount = node.nbBeats
        delete node.nbBeats
        changed = true
    }
    if (Array.isArray(node.patterns)) {
        for (const pattern of node.patterns) changed = renameNbBeats(pattern) || changed
    }
    if (Array.isArray(node.tracks)) {
        for (const track of node.tracks) changed = renameNbBeats(track) || changed
    }
    return changed
}

/**
 * Give every pattern in a stored song or pattern-cache entry a stable id.
 *
 * Both shapes have to be handled: the `songs` store holds raw song blobs, the
 * `patterns` cache holds `{data, savedAt, ...}` envelopes. Ids are only minted
 * when absent, so re-running this is harmless.
 * @param {any} value
 * @returns {boolean} whether anything changed
 */
function assignPatternIds(value) {
    if (!value || typeof value !== 'object') return false
    const taken = new Set()
    /** @param {any} node @returns {boolean} */
    const walk = (node) => {
        if (!node || typeof node !== 'object') return false
        let changed = false
        if (Array.isArray(node.patterns)) {
            for (const pattern of node.patterns) {
                const before = pattern?.id
                ensurePatternId(pattern, taken)
                if (pattern?.id !== before) changed = true
            }
        }
        return changed
    }
    if (Array.isArray(value.patterns)) return walk(value)
    if (value.data && typeof value.data === 'object') return walk(value.data)
    return false
}

/**
 * Rewrite the legacy spelling of a note key (LEGACY_NOTE_KEY_ALIASES) across a
 * stored record. Handles the three shapes the stores carry: a raw song
 * ({patterns}), a bare pattern ({tracks}) and a `{data}` envelope around either.
 * @param {any} value
 * @returns {boolean} whether anything changed
 */
function migrateStoredNoteKeys(value) {
    if (!value || typeof value !== 'object') return false
    if (Array.isArray(value.patterns)) {
        let changed = false
        for (const pattern of value.patterns) changed = migrateLegacyPatternKeys(pattern) || changed
        return changed
    }
    if (value.data && typeof value.data === 'object') return migrateStoredNoteKeys(value.data)
    return migrateLegacyPatternKeys(value)
}

/**
 * Rewrite every legacy key of a stored record: the note and track keys through
 * migrateLegacyPatternKeys(), plus — on a raw song — `loopBars` and the clip
 * keys, through migrateLegacySongKeys(). The same three shapes as
 * migrateStoredNoteKeys() (raw song / bare pattern / `{data}` envelope).
 * @param {any} value
 * @returns {boolean} whether anything changed
 */
function migrateStoredLegacyKeys(value) {
    if (!value || typeof value !== 'object') return false
    if (value.data && typeof value.data === 'object') return migrateStoredLegacyKeys(value.data)
    let changed = false
    if (Array.isArray(value.patterns)) {
        for (const pattern of value.patterns) changed = migrateLegacyPatternKeys(pattern) || changed
        return migrateLegacySongKeys(value) || changed
    }
    return migrateLegacyPatternKeys(value)
}

/**
 * Schema migrations keyed by the DB_VERSION they ship with:
 *     8: (db, tx) => { ... }
 * They run inside `onupgradeneeded` when upgrading from a version < 8, so add
 * an entry here (and bump DB_VERSION) whenever persisted data changes shape.
 */
export const MIGRATIONS = {
    /**
     * v5: `nbBeats` → `beatCount`, on every song and cached pattern.
     *
     * Written request-chained rather than with async/await on purpose: the
     * versionchange transaction auto-commits as soon as the microtask queue
     * drains, so awaiting a request here would close the store before the
     * cursor could be read. `cursor.continue()` keeps it alive for the walk.
     * @param {IDBDatabase} db
     * @param {IDBTransaction|null} tx
     */
    5: (db, tx) => {
        if (!tx) return
        for (const storeName of ['songs', 'patterns']) {
            if (!db.objectStoreNames.contains(storeName)) continue
            const store = tx.objectStore(storeName)
            const request = store.openCursor()
            request.onsuccess = () => {
                const cursor = request.result
                if (!cursor) return
                // Cached patterns are stored as {data, savedAt, ...} envelopes;
                // saved songs are stored raw.
                const value = cursor.value
                if (renameNbBeats(value) || (value?.data && renameNbBeats(value.data))) {
                    cursor.update(value)
                }
                cursor.continue()
            }
        }
    },

    /**
     * v6: stable pattern ids + an (empty) `songs` array.
     *
     * Arrangements reference patterns by id, so every already-persisted pattern
     * needs one. Songs stored before v6 have no `songs` key at all, which the
     * loader already treats as "no arrangement".
     * @param {IDBDatabase} db
     * @param {IDBTransaction|null} tx
     */
    6: (db, tx) => {
        if (!tx) return
        for (const storeName of ['songs', 'patterns']) {
            if (!db.objectStoreNames.contains(storeName)) continue
            const store = tx.objectStore(storeName)
            const request = store.openCursor()
            request.onsuccess = () => {
                const cursor = request.result
                if (!cursor) return
                if (assignPatternIds(cursor.value)) cursor.update(cursor.value)
                cursor.continue()
            }
        }
    },

    /**
     * v7: `retriggerNum` → `retriggerCount`, in the notes of every song and
     * cached pattern (object notes and the compact `noteKeys` header alike).
     *
     * Same request-chained walk as v5: see the note there. Files outside the
     * DB (.odbox, built-in assets) are mapped on read instead, by
     * migrateLegacyPatternKeys() — the settings/samples stores carry no notes.
     * @param {IDBDatabase} db
     * @param {IDBTransaction|null} tx
     */
    7: (db, tx) => {
        if (!tx) return
        for (const storeName of ['songs', 'patterns']) {
            if (!db.objectStoreNames.contains(storeName)) continue
            const store = tx.objectStore(storeName)
            const request = store.openCursor()
            request.onsuccess = () => {
                const cursor = request.result
                if (!cursor) return
                if (migrateStoredNoteKeys(cursor.value)) cursor.update(cursor.value)
                cursor.continue()
            }
        }
    },

    /**
     * v8: the measure rename of persisted keys — `track.soundId` → `sampleId`
     * (both in cached patterns and in a song's embedded patterns) and the
     * arrangement keys `startBar`/`bars` → `startMeasure`/`measureCount`,
     * `loopBars` → `loopMeasureCount`.
     *
     * Same request-chained walk as v5/v7: see the note there. Files outside the
     * DB (.odbox, built-in assets, imported JSON) are mapped on read instead:
     * migrateLegacyPatternKeys() for patterns, normalizeSong() for songs.
     * @param {IDBDatabase} db
     * @param {IDBTransaction|null} tx
     */
    8: (db, tx) => {
        if (!tx) return
        for (const storeName of ['songs', 'patterns']) {
            if (!db.objectStoreNames.contains(storeName)) continue
            const store = tx.objectStore(storeName)
            const request = store.openCursor()
            request.onsuccess = () => {
                const cursor = request.result
                if (!cursor) return
                if (migrateStoredLegacyKeys(cursor.value)) cursor.update(cursor.value)
                cursor.continue()
            }
        }
    },
}

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

/**
 * Builds a diagnostic snapshot of the database and the storage estimate.
 * Named getStorageReport: it computes and returns, it does not report anything
 * to the user (and `usageRatio` is a number, not a formatted percentage).
 * @returns {Promise<{usageBytes?: number, quotaBytes?: number, usageRatio?: number|null, stores: Object<string, IDBValidKey[]>}>}
 */
export async function getStorageReport() {
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
