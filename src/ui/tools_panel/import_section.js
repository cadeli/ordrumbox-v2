// src/ui/tools_panel/import_section.js — Tools "Import" tab (MIDI file import).

import { showToast } from '../../core/notify.js'
import { logger } from '../../core/logger.js'
import MidiImportService from '../../logic/services/midi_import_service.js'

export default class ImportSection {
    #panel
    #midiImportService

    /** @param {import('../tools_panel.js').default} panel */
    constructor(panel) {
        this.#panel = panel
        this.#midiImportService = new MidiImportService()
    }

    html() {
        return `
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="import">
                <div class="ne-row">
                    <button class="ne-btn" id="tp-import-midi" title="Import a Standard MIDI File (.mid) into a new pattern">Import MIDI</button>
                    <input type="file" id="tp-import-midi-file" class="hidden-file-input" accept=".mid,.midi">
                </div>
            </div>
        `
    }

    bind() {
        const root = this.#panel.container
        const importMidiFile = root.querySelector('#tp-import-midi-file')
        root.querySelector('#tp-import-midi').addEventListener('click', () => importMidiFile.click())
        importMidiFile.addEventListener('change', (e) => this.onImportMidiFile(e))
    }

    async onImportMidiFile(e) {
        const file = e.target.files[0]
        if (!file) return

        try {
            const result = await this.#midiImportService.importFile(file)
            if (result?.warning) {
                showToast(result.warning, 'warning')
            } else if (result?.message) {
                showToast(result.message, 'success')
            }
        } catch (err) {
            logger.error('ToolsPanel', 'MIDI Import failed', err)
            showToast('MIDI Import failed: ' + err.message, 'error')
        }
        e.target.value = ''
    }
}
