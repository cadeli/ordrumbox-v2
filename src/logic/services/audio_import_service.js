import { logger } from '../../core/logger.js'
import { appState } from '../../state/app_state.js'
import { playbackEvents } from '../../state/event_bus.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { instrumentsManager } from './instruments_manager/index.js'
import { cacheSample, cacheDrumkits } from '../../cache/idb_cache.js'
import { EVENTS } from '../../core/events.js'

export default class AudioImportService {
    /**
     * Import a directory of audio files as a new drumkit.
     * @param {FileList} files - files from webkitdirectory input
     * @returns {Promise<{kitName: string, fileCount: number, warning?: string}>}
     */
    async importDirectory(files) {
        const audioFiles = Array.from(files).filter((f) => /\.(wav|flac|mp3|aac)$/i.test(f.name))
        if (audioFiles.length === 0) {
            return { kitName: '', fileCount: 0, warning: 'No audio files found in selected directory' }
        }

        const firstPath = files[0].webkitRelativePath ?? ''
        const kitName = firstPath.split('/')[0] ?? 'imported'

        const audioCtx = serviceRegistry.audioCtx
        const instruments = []

        for (const file of audioFiles) {
            const fileName = file.name
            const instrument = instrumentsManager.findInstrumentFromFileName(fileName)
            const key = instrument.id

            const rawBuffer = await file.arrayBuffer()
            const arrayBuffer = rawBuffer.slice(0)
            const buffer = await audioCtx.decodeAudioData(rawBuffer)

            soundRegistry.sounds[fileName] = {
                kitName: kitName,
                url: fileName,
                key,
                index: Object.keys(soundRegistry.sounds).length + 1,
                display_name: fileName,
                buffer,
                duration: Math.floor(buffer.duration * 1000),
                isLoad: true,
                playStatus: false,
            }

            instruments.push({ display_name: fileName, key, url: fileName })
            cacheSample(fileName, arrayBuffer).catch((e) => {
                logger.warn('AudioImport', `Failed to cache sample "${fileName}"`, e)
            })
        }

        soundRegistry.drumkits[kitName] = { instruments }

        const existingIdx = soundRegistry.drumkitList.findIndex((d) => d.name === kitName)
        if (existingIdx >= 0) {
            soundRegistry.drumkitList[existingIdx] = { name: kitName, instruments }
            appState.selectedDrumkitIdx = existingIdx
        } else {
            soundRegistry.drumkitList.push({ name: kitName, instruments })
            appState.selectedDrumkitIdx = soundRegistry.drumkitList.length - 1
        }

        await cacheDrumkits(Object.fromEntries(soundRegistry.drumkitList.map((d) => [d.name, d])))

        playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)

        return { kitName, fileCount: audioFiles.length }
    }

    async autoAssignSounds() {
        const pattern = appState.selectedPattern
        if (!pattern) {
            return { warning: 'No pattern selected' }
        }

        const { getAutoAssignService } = await import('../../state/service_loader.js')
        const autoAssign = await getAutoAssignService()

        autoAssign.autoAssignSounds(pattern)
        return { message: 'Auto-assign complete' }
    }
}
