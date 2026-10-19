// src/ui/drumkit_manager/import_section.js
// Import / save / load / normalize actions for the drumkit manager.

import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/event_bus.js'
import drumkitService from '../../logic/services/drumkit_service.js'
import AudioImportService from '../../logic/services/audio_import_service.js'
import { showToast } from '../../core/notify.js'
import { downloadJson } from '../components/ui_utils.js'
import { logger } from '../../core/logger.js'
import { EVENTS } from '../../core/events.js'

const TAG = 'DrumkitManager'

export default class ImportSection {
    #editor
    #audioImportService

    /** @param {import('../drumkit_manager.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#audioImportService = new AudioImportService({ registry: serviceRegistry })
    }

    get audioImportService() {
        return this.#audioImportService
    }

    saveCurrentKit() {
        const kit = drumkitService.exportCurrentKit()
        if (!kit) {
            showToast('No drumkit selected', 'warning')
            return
        }
        const safeName = kit.name.replaceAll(/[^a-z0-9_-]/gi, '_')
        downloadJson(kit, `ordrumbox-drumkit-${safeName}.json`)
        showToast(`Saved drumkit "${kit.name}"`, 'success')
    }

    /** @param {Event} e */
    async onLoadKitFile(e) {
        const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]
        if (!file) return

        try {
            const data = JSON.parse(await file.text())
            const kitName = await drumkitService.restoreDrumkit(data)
            showToast(`Loaded drumkit "${kitName}"`, 'success')
            this.#editor.selectedSoundKey = null
            this.#editor.sync()
        } catch (err) {
            logger.warn(TAG, `Drumkit load failed: ${err.message}`)
            showToast('Invalid drumkit JSON', 'error')
        } finally {
            /** @type {HTMLInputElement} */ (e.target).value = ''
        }
    }

    /** @param {Event} e */
    async onImportDir(e) {
        const files = /** @type {HTMLInputElement} */ (e.target).files
        if (!files || files.length === 0) return

        try {
            const { kitName, fileCount, warning } = await this.#audioImportService.importDirectory(files)
            if (warning) {
                showToast(warning, 'warning')
                return
            }
            if (fileCount > 0) {
                const assignResult = await this.#audioImportService.autoAssignSounds()
                if (assignResult?.warning) {
                    showToast(assignResult.warning, 'warning')
                }
                serviceRegistry.audioEngine?.invalidateCache()
                playbackEvents.emit(EVENTS.PATTERN_CHANGE)
                showToast(`Imported ${fileCount} files into kit "${kitName}"`, 'success')
                this.#editor.selectedSoundKey = null
                this.#editor.sync()
            }
        } catch (err) {
            logger.error(TAG, 'Directory import failed', err)
            showToast('Import failed: ' + err.message, 'error')
        }
        /** @type {HTMLInputElement} */ (e.target).value = ''
    }

    /** @param {Event} e */
    async onAddSample(e) {
        const addInput = /** @type {HTMLInputElement} */ (e.target)
        const file = addInput.files?.[0]
        if (!file) return

        const ctx = serviceRegistry.audioCtx
        if (!ctx) return

        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            const { fileName, kitName } = await drumkitService.addSample(file, buffer)
            showToast(`Added "${fileName}" to kit "${kitName}"`, 'success')
            this.#editor.sync()
        } catch (err) {
            logger.warn(TAG, `Add sample failed: ${err.message}`)
            showToast('Failed to decode WAV: ' + err.message, 'error')
        }
        addInput.value = ''
    }

    async onAutoDetectAll() {
        const ok = await drumkitService.autoDetectAll()
        if (ok) showToast('Auto-detect complete', 'success')
        else showToast('No pattern selected', 'warning')
    }

    onNormalizeAll() {
        const count = drumkitService.normalizeAll()
        if (count > 0) {
            showToast(`Normalized ${count} sample(s)`, 'success')
            this.#editor.sync()
        } else {
            showToast('No samples to normalize', 'warning')
        }
    }
}
