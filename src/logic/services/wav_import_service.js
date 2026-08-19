import { appState } from '../../state/app_state.js'
import { playbackEvents } from '../../state/playback_events.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import InstrumentsManager from './instruments_manager.js'
import { logger } from '../../core/logger.js'
import { showToast } from '../../ui/toast.js'
import { cacheSample, cacheDrumkits } from '../../cache/idb_cache.js'

export default class WavImportService {
    /**
     * Import a directory of audio files as a new drumkit.
     * @param {FileList} files - files from webkitdirectory input
     * @returns {Promise<{kitName: string, fileCount: number}>}
     */
    async importDirectory(files) {
        const wavFiles = Array.from(files).filter(f => /\.(wav|flac|mp3|aac)$/i.test(f.name))
        if (wavFiles.length === 0) {
            showToast('No audio files found in selected directory', 'warning')
            return { kitName: '', fileCount: 0 }
        }

        const firstPath = files[0].webkitRelativePath ?? ''
        const kitName = firstPath.split('/')[0] ?? 'imported'

        const im = new InstrumentsManager()
        const audioCtx = serviceRegistry.audioCtx
        const instruments = []

        for (const file of wavFiles) {
            const fileName = file.name
            const instrument = im.findInstrumentFromFileName(fileName)
            const key = instrument.id

            const rawBuffer = await file.arrayBuffer()
            const arrayBuffer = rawBuffer.slice(0)
            const buffer = await audioCtx.decodeAudioData(rawBuffer)

            soundRegistry.sounds[fileName] = {
                kit_name: kitName,
                url: fileName,
                key,
                index: Object.keys(soundRegistry.sounds).length + 1,
                display_name: fileName,
                buffer,
                duration: Math.floor(buffer.duration * 1000),
                isLoad: true,
                playStatus: false
            }

            instruments.push({ display_name: fileName, key, url: fileName })
            cacheSample(fileName, arrayBuffer).catch(() => {})
        }

        soundRegistry.drumkits[kitName] = { instruments }

        const existingIdx = soundRegistry.drumkitList.findIndex(d => d.name === kitName)
        if (existingIdx >= 0) {
            soundRegistry.drumkitList[existingIdx] = { name: kitName, instruments }
            appState.selectedDrumkitNum = existingIdx
        } else {
            soundRegistry.drumkitList.push({ name: kitName, instruments })
            appState.selectedDrumkitNum = soundRegistry.drumkitList.length - 1
        }

        await cacheDrumkits(Object.fromEntries(soundRegistry.drumkitList.map(d => [d.name, d])))

        playbackEvents.emit("drumkitChange")

        showToast(`Imported ${wavFiles.length} WAV files as drumkit "${kitName}"`, 'success')

        return { kitName, fileCount: wavFiles.length }
    }

    async autoAssignSounds() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) {
            showToast('No pattern selected', 'warning')
            return
        }

        const { getAutoAssignService } = await import('../../state/service_registry.js')
        const autoAssign = await getAutoAssignService()

        autoAssign.autoAssignSounds(pattern)
        showToast('Auto-assign complete', 'success')
    }
}
