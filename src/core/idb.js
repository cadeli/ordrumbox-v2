const DB_NAME = 'ordrumbox'
const DB_VERSION = 4

const ALL_STORES = ['settings', 'songs', 'patterns', 'drumkits', 'samples', 'generated_sounds']

export function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
            const db = request.result
            for (const name of ALL_STORES) {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name)
                }
            }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export async function idbGet(storeName, key) {
    const db = await openDb()
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly')
            const req = tx.objectStore(storeName).get(key)
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    } finally {
        db.close()
    }
}

export async function idbPut(storeName, key, value) {
    const db = await openDb()
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite')
            const req = tx.objectStore(storeName).put(value, key)
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
        })
    } finally {
        db.close()
    }
}

export async function idbDelete(storeName, key) {
    const db = await openDb()
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite')
            const req = tx.objectStore(storeName).delete(key)
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
        })
    } finally {
        db.close()
    }
}

export async function idbKeys(storeName) {
    const db = await openDb()
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly')
            const req = tx.objectStore(storeName).getAllKeys()
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    } finally {
        db.close()
    }
}

export async function idbClearStore(storeName) {
    const db = await openDb()
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite')
            const req = tx.objectStore(storeName).clear()
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
        })
    } finally {
        db.close()
    }
}

export async function idbGetAll(storeName) {
    const db = await openDb()
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly')
            const req = tx.objectStore(storeName).getAll()
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    } finally {
        db.close()
    }
}

export async function idbGetAllEntries(storeName) {
    const db = await openDb()
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly')
            const req = tx.objectStore(storeName).openCursor()
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
        })
    } finally {
        db.close()
    }
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
    } catch { /* storage estimate unavailable */ }

    try {
        const db = await openDb()
        const storeNames = [...db.objectStoreNames]
        for (const name of storeNames) {
            const keys = await new Promise((resolve, reject) => {
                const tx = db.transaction(name, 'readonly')
                const req = tx.objectStore(name).getAllKeys()
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
            })
            report.stores[name] = keys
        }
        db.close()
    } catch { /* idb unavailable */ }

    return report
}
