import { appState } from '../../state/app_state.js'
import { getServices } from '../../state/service_loader.js'
import { idbGet, idbPut, idbKeys } from '../../core/idb.js'

import { logger } from '../../core/logger.js'
import { clamp } from '../../core/numbers.js'
import { normalizeSongs } from '../../model/song_schema.js'
import { showToast } from '../../core/notify.js'

const SONGS_STORE = 'songs'
// NB: there is no song-format version any more. It was written into every saved
// record and never read, so it looked like a migration gate that could not fire.
// The IDB schema version that IS read lives in core/idb.js (DB_VERSION +
// MIGRATIONS); a song-format migration would gate the same way, on read.

/**
 * A song record as persisted by IndexedDB: the song data plus its metadata and
 * the current pattern index.
 * @typedef {object} SongRecord
 * @property {string} name  the song name, also its IndexedDB key
 * @property {string} [description]
 * @property {string} [date]
 * @property {number} [savedAt]
 * @property {number} [exportedAt]
 * @property {import('../../model/pattern_schema.js').Pattern[]} patterns the .odbox
 *           patterns, pushed as-is (an app export is already normalized; see
 *           applyToAppState for why fixPattern must NOT run here)
 * @property {import('../../model/song_schema.js').Song[]} songs
 * @property {number} [selectedPatternIdx]
 * @property {number} [selectedPatternNum] former name of selectedPatternIdx
 * @property {number} [selectedSongIdx]
 */

class SongService {
    #loadGeneration = 0

    /**
     * Build the serializable song data from current appState.
     * @param {string} songName
     * @returns {SongRecord}
     */
    buildSongData(songName) {
        return {
            name: songName,
            description: appState.songInfos?.description ?? '',
            date: appState.songInfos?.date ?? '',
            patterns: JSON.parse(JSON.stringify(appState.patterns)),
            selectedPatternIdx: appState.selectedPatternIdx,
            songs: JSON.parse(JSON.stringify(appState.songs ?? [])),
            selectedSongIdx: appState.selectedSongIdx ?? 0,
        }
    }

    /**
     * Save song to IndexedDB.
     * @param {string} songName
     * @returns {Promise<void>}
     */
    async save(songName) {
        const data = this.buildSongData(songName)
        data.savedAt = Date.now()
        await idbPut(SONGS_STORE, songName, data)
        logger.info('SongService', `Song "${songName}" saved`)
    }

    /**
     * List all saved song keys from IndexedDB.
     * @returns {Promise<string[]>}
     */
    async listKeys() {
        return idbKeys(SONGS_STORE)
    }

    /**
     * Load a song from IndexedDB by key.
     * @param {string} key
     * @returns {Promise<SongRecord|null>}
     */
    async load(key) {
        const data = await idbGet(SONGS_STORE, key)
        if (!data?.patterns) return null
        return data
    }

    /**
     * Apply loaded/imported song data to appState.
     * @param {SongRecord} data
     * @param {string} fallbackName
     * @returns {Promise<string>} resolved song name
     */
    async applyToAppState(data, fallbackName) {
        const name = data.name ?? fallbackName
        const gen = ++this.#loadGeneration

        // One undoable history entry for the whole song load/import.
        // Awaited: setSelectedPatternIdx is async (samples + auto-assign) and
        // the recorded redo state must include what it writes.
        // Validated against the incoming patterns' own ids, before they are
        // pushed: a clip can only reference an id the file actually carries.
        const ids = new Set((data.patterns ?? []).map((p) => p?.id).filter(Boolean))
        const { songs, dropped } = normalizeSongs(data.songs, ids)

        await getServices().cmd.recordTransaction('Load song', async () => {
            appState.patterns.length = 0
            for (const pat of data.patterns) {
                appState.patterns.push(pat)
            }

            appState.songInfos.name = name
            appState.songInfos.description = data.description ?? ''
            appState.songInfos.date = data.date ?? ''

            appState.songs = songs
            appState.selectedSongIdx = clamp(data.selectedSongIdx ?? 0, 0, Math.max(0, songs.length - 1))
            if (dropped.length > 0) {
                const names = dropped.map((d) => d.pattern).join(', ')
                showToast(`Ignored ${dropped.length} song clip(s) referencing an unknown pattern: ${names}`, 'warning')
            }

            await getServices().cmd.setSelectedPatternIdx(data.selectedPatternIdx ?? 0)
            getServices().cmd.resetPage()
        })

        if (this.#loadGeneration !== gen) return name
        return name
    }

    /**
     * Build export data for a downloadable .odbox JSON file.
     * @param {string} songName
     * @returns {{ data: object, filename: string }}
     */
    exportToFile(songName) {
        const data = this.buildSongData(songName)
        data.exportedAt = Date.now()
        const safeName = songName.replace(/[^a-zA-Z0-9_-]/g, '_')
        logger.info('SongService', `Song "${songName}" exported`)
        return { data, filename: `${safeName}.odbox` }
    }

    /**
     * Parse and validate an imported song file content.
     * @param {string} text - raw JSON string
     * @returns {SongRecord|null} parsed data or null if invalid
     */
    parseImportedFile(text) {
        const data = JSON.parse(text)
        if (!data?.patterns || !Array.isArray(data.patterns)) {
            logger.warn('SongService', 'Imported file has no valid patterns array')
            return null
        }
        return data
    }
}

export default new SongService()
