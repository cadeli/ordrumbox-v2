import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { idbGet, idbPut, idbKeys } from '../../core/idb.js'
import { downloadJson } from '../../ui/components/panel_helpers.js'
import { logger } from '../../core/logger.js'

const SONGS_STORE = 'songs'
const SONG_VERSION = 1

class SongService {
    /**
     * Build the serializable song data from current appState.
     * @param {string} songName
     * @returns {object}
     */
    buildSongData(songName) {
        return {
            version: SONG_VERSION,
            name: songName,
            description: appState.songInfos?.description ?? '',
            date: appState.songInfos?.date ?? '',
            patterns: JSON.parse(JSON.stringify(appState.patterns)),
            selectedPatternNum: appState.selectedPatternNum,
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
     * @returns {Promise<object|null>}
     */
    async load(key) {
        const data = await idbGet(SONGS_STORE, key)
        if (!data?.patterns) return null
        return data
    }

    /**
     * Apply loaded/imported song data to appState.
     * @param {object} data — { name, description, date, patterns, selectedPatternNum }
     * @param {string} fallbackName
     * @returns {string} resolved song name
     */
    applyToAppState(data, fallbackName) {
        const name = data.name ?? fallbackName

        appState.patterns.length = 0
        for (const pat of data.patterns) appState.patterns.push(pat)

        appState.songInfos.name = name
        appState.songInfos.description = data.description ?? ''
        appState.songInfos.date = data.date ?? ''

        serviceRegistry.cmd.setSelectedPatternNum(data.selectedPatternNum ?? 0)
        appState.currentPage = 0

        return name
    }

    /**
     * Export song as a downloadable .odbox JSON file.
     * @param {string} songName
     */
    exportToFile(songName) {
        const data = this.buildSongData(songName)
        data.exportedAt = Date.now()
        const safeName = songName.replace(/[^a-zA-Z0-9_-]/g, '_')
        downloadJson(data, `${safeName}.odbox`)
        logger.info('SongService', `Song "${songName}" exported`)
    }

    /**
     * Parse and validate an imported song file content.
     * @param {string} text — raw JSON string
     * @returns {object|null} parsed data or null if invalid
     */
    parseImportedFile(text) {
        const data = JSON.parse(text)
        if (!data?.patterns || !Array.isArray(data.patterns)) {
            return null
        }
        return data
    }
}

export default new SongService()
