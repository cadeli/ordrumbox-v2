import { idbGet, idbPut, idbDelete, idbKeys, idbClearStore, idbGetAllEntries } from '../core/idb.js'
import { logger } from '../core/logger.js'

const PATTERNS_STORE = 'patterns'
const DRUMKITS_STORE = 'drumkits'
const SAMPLES_STORE = 'samples'
const SETTINGS_STORE = 'settings'
const SONGS_STORE = 'songs'
const GENERATED_SOUNDS_STORE = 'generated_sounds'

const SONG_KEY = 'song_data'
const DRUMKITS_KEY = 'drumkits_data'

function measureBytes(value) {
    if (value instanceof ArrayBuffer) return value.byteLength
    if (ArrayBuffer.isView(value)) return value.byteLength
    try {
        return new Blob([JSON.stringify(value)]).size
    } catch {
        return 0
    }
}

function wrapWithMeta(value) {
    return { data: value, savedAt: Date.now(), size: measureBytes(value) }
}

function unwrap(entry) {
    if (entry && typeof entry === 'object' && 'data' in entry) return entry.data
    return entry
}

function extractMeta(entry) {
    if (!entry) return { size: 0, savedAt: null }
    if ('size' in entry && 'savedAt' in entry) {
        return { size: entry.size, savedAt: entry.savedAt }
    }
    return { size: measureBytes(entry), savedAt: entry?.savedAt ?? null }
}

function accumulateStats(stats, entries, typeKey) {
    for (const { key, value } of entries) {
        const { size, savedAt } = extractMeta(value)
        stats[typeKey].count++
        stats[typeKey].bytes += size
        stats.entries.push({ key, type: typeKey, size, savedAt })
    }
}

export async function cachePatterns(json) {
    try {
        await idbPut(PATTERNS_STORE, SONG_KEY, wrapWithMeta(json))
        logger.debug('IdbCache', 'Patterns cached')
    } catch (e) {
        logger.warn('IdbCache', 'Failed to cache patterns', e)
    }
}

export async function getCachedPatterns() {
    try {
        const entry = await idbGet(PATTERNS_STORE, SONG_KEY) ?? null
        return unwrap(entry)
    } catch {
        return null
    }
}

export async function cacheDrumkits(json) {
    try {
        await idbPut(DRUMKITS_STORE, DRUMKITS_KEY, wrapWithMeta(json))
        logger.debug('IdbCache', 'Drumkits cached')
    } catch (e) {
        logger.warn('IdbCache', 'Failed to cache drumkits', e)
    }
}

export async function getCachedDrumkits() {
    try {
        const entry = await idbGet(DRUMKITS_STORE, DRUMKITS_KEY) ?? null
        return unwrap(entry)
    } catch {
        return null
    }
}

export async function cacheSample(url, arrayBuffer) {
    try {
        await idbPut(SAMPLES_STORE, url, wrapWithMeta(arrayBuffer))
    } catch (e) {
        logger.warn('IdbCache', `Failed to cache sample "${url}"`, e)
    }
}

export async function getCachedSample(url) {
    try {
        const entry = await idbGet(SAMPLES_STORE, url) ?? null
        return unwrap(entry)
    } catch {
        return null
    }
}

const GEN_SOUNDS_KEY = 'generated_sounds_data'

export async function cacheGeneratedSounds(json) {
    try {
        await idbPut(GENERATED_SOUNDS_STORE, GEN_SOUNDS_KEY, wrapWithMeta(json))
        logger.debug('IdbCache', 'Generated sounds cached')
    } catch (e) {
        logger.warn('IdbCache', 'Failed to cache generated sounds', e)
    }
}

export async function getCachedGeneratedSounds() {
    try {
        const entry = await idbGet(GENERATED_SOUNDS_STORE, GEN_SOUNDS_KEY) ?? null
        return unwrap(entry)
    } catch {
        return null
    }
}

export async function removeCacheEntry(type, key) {
    const store = type === 'patterns' ? PATTERNS_STORE
        : type === 'drumkits' ? DRUMKITS_STORE
        : type === 'samples' ? SAMPLES_STORE
        : null
    if (!store) return
    await idbDelete(store, key)
    logger.debug('IdbCache', `Removed ${type} entry: "${key}"`)
}

export async function clearPatternsCache() {
    await idbClearStore(PATTERNS_STORE)
    logger.debug('IdbCache', 'Patterns cache cleared')
}

export async function clearDrumkitsCache() {
    await idbClearStore(DRUMKITS_STORE)
    logger.debug('IdbCache', 'Drumkits cache cleared')
}

export async function clearSamplesCache() {
    await idbClearStore(SAMPLES_STORE)
    logger.debug('IdbCache', 'Samples cache cleared')
}

export async function clearAllCache() {
    await Promise.all([
        idbClearStore(PATTERNS_STORE),
        idbClearStore(DRUMKITS_STORE),
        idbClearStore(SAMPLES_STORE),
        idbClearStore(SETTINGS_STORE),
        idbClearStore(SONGS_STORE),
        idbClearStore(GENERATED_SOUNDS_STORE),
    ])
    logger.debug('IdbCache', 'All cache cleared')
}

/**
 * Returns detailed cache info: per-type totals plus a flat list of entries.
 * Each entry: { key, type, size, savedAt }
 */
export async function getCacheStats() {
    const stats = {
        patterns: { count: 0, bytes: 0 },
        drumkits: { count: 0, bytes: 0 },
        samples: { count: 0, bytes: 0 },
        settings: { count: 0, bytes: 0 },
        songs: { count: 0, bytes: 0 },
        generated_sounds: { count: 0, bytes: 0 },
        totalBytes: 0,
        entries: [],
    }

    const extractMeta = (entry) => {
        if (entry && typeof entry === 'object' && 'data' in entry) {
            return { size: entry.size ?? measureBytes(entry.data), savedAt: entry.savedAt ?? null }
        }
        return { size: measureBytes(entry), savedAt: null }
    }

    try {
        const [patternEntries, drumkitEntries, sampleEntries, settingsEntries, songEntries, genSoundEntries] = await Promise.all([
            idbGetAllEntries(PATTERNS_STORE).catch(() => []),
            idbGetAllEntries(DRUMKITS_STORE).catch(() => []),
            idbGetAllEntries(SAMPLES_STORE).catch(() => []),
            idbGetAllEntries(SETTINGS_STORE).catch(() => []),
            idbGetAllEntries(SONGS_STORE).catch(() => []),
            idbGetAllEntries(GENERATED_SOUNDS_STORE).catch(() => []),
        ])

        accumulateStats(stats, patternEntries, 'patterns')
        accumulateStats(stats, drumkitEntries, 'drumkits')
        accumulateStats(stats, sampleEntries, 'samples')
        accumulateStats(stats, settingsEntries, 'settings')
        accumulateStats(stats, songEntries, 'songs')
        accumulateStats(stats, genSoundEntries, 'generated_sounds')

        stats.totalBytes = stats.patterns.bytes + stats.drumkits.bytes + stats.samples.bytes
            + stats.settings.bytes + stats.songs.bytes + stats.generated_sounds.bytes
    } catch (e) {
        logger.warn('IdbCache', 'Failed to compute cache stats', e)
    }

    return stats
}

export function formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

export function formatDate(timestamp) {
    if (timestamp == null) return '-'
    const d = new Date(timestamp)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
