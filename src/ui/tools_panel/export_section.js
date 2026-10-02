// src/ui/tools_panel/export_section.js — Tools "Export" tab (MIDI / WAV + loops slider).

import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { showToast } from '../../core/notify.js'
import { OrSlider } from '../components/or_slider.js'
import { logger, nameOr } from '../../core/logger.js'
import MidiExporter from '../../logic/midi/midi_exporter.js'

export default class ExportSection {
    #panel
    #wavLoops
    #wavBtn
    #songBtn

    /** @param {import('../tools_panel.js').default} panel */
    constructor(panel) {
        this.#panel = panel
        this.#wavLoops = null
        this.#wavBtn = null
        this.#songBtn = null
    }

    get wavLoops() {
        return this.#wavLoops
    }

    get wavBtn() {
        return this.#wavBtn
    }

    get songBtn() {
        return this.#songBtn
    }

    html() {
        return `
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="export">
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-midi" title="Export the current pattern to a Standard MIDI File (.mid)">Export MIDI</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-wav" title="Render the pattern to an audio WAV file">Export WAV</button>
                </div>
                <div id="tp-wav-loops-slot"></div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-song-wav" title="Render the whole song arrangement (every clip, layered) to a WAV file">Export Song</button>
                </div>
            </div>
        `
    }

    bind() {
        const root = this.#panel.container
        this.#wavLoops = new OrSlider({
            key: 'tp-wav-loops',
            label: 'Loops',
            min: 1,
            max: 32,
            step: 1,
            value: 1,
            format: (v) => String(Math.round(v)),
        })
        root.querySelector('#tp-wav-loops-slot').replaceWith(this.#wavLoops.createElement())

        this.#wavBtn = root.querySelector('#tp-export-wav')
        this.#wavBtn.addEventListener('click', () => this.exportWav())

        this.#songBtn = root.querySelector('#tp-export-song-wav')
        this.#songBtn.addEventListener('click', () => this.exportSongWav())

        root.querySelector('#tp-export-midi').addEventListener('click', () => this.exportMidi())
    }

    async exportMidi() {
        try {
            const pattern = appState.patterns[appState.selectedPatternIdx]
            if (!pattern) {
                showToast('No pattern selected', 'warning')
                return
            }
            const exporter = new MidiExporter()
            const loops = Math.round(this.#wavLoops.getValue())
            exporter.download(
                pattern,
                `ordrumbox-${nameOr(pattern.name, 'pattern', 'ToolsPanel', 'midi name fallback')}.mid`,
                { loops },
            )
        } catch (e) {
            logger.error('ToolsPanel', 'MIDI Export failed', e)
            showToast('MIDI Export failed: ' + e.message, 'error')
        }
    }

    /**
     * Render the whole arrangement to a WAV: every clip of the selected song,
     * layered, at the song's tempo.
     */
    async exportSongWav() {
        const song = appState.songs?.[appState.selectedSongIdx ?? 0]
        if (!song) {
            showToast('No song arrangement to export', 'warning')
            return
        }
        if (!song.clips?.length) {
            showToast(`"${nameOr(song.name, 'song', 'ToolsPanel', 'song name fallback')}" has no clip`, 'warning')
            return
        }

        const originalText = this.#songBtn.textContent
        this.#songBtn.disabled = true
        this.#songBtn.textContent = 'Exporting...'

        try {
            if (!serviceRegistry.wavExporter) {
                const { default: WavExporter } = await import('../../audio/export/wav_exporter.js')
                serviceRegistry.wavExporter = new WavExporter()
            }
            const blob = await serviceRegistry.wavExporter.exportSongToWav(song)
            serviceRegistry.wavExporter.downloadWav(
                blob,
                `ordrumbox-${nameOr(song.name, 'song', 'ToolsPanel', 'song wav name fallback')}.wav`,
            )
            showToast(`Song "${nameOr(song.name, 'song', 'ToolsPanel', 'song name fallback')}" exported`, 'success')
        } catch (e) {
            logger.error('ToolsPanel', 'Song WAV Export failed', e)
            showToast('Song WAV export failed: ' + e.message, 'error')
        } finally {
            this.#songBtn.disabled = false
            this.#songBtn.textContent = originalText
        }
    }

    async exportWav() {
        const pattern = appState.patterns[appState.selectedPatternIdx]
        if (!pattern) return

        const originalText = this.#wavBtn.textContent
        this.#wavBtn.disabled = true
        this.#wavBtn.textContent = 'Exporting...'

        try {
            if (!serviceRegistry.wavExporter) {
                const { default: WavExporter } = await import('../../audio/export/wav_exporter.js')
                serviceRegistry.wavExporter = new WavExporter()
            }

            const loops = Math.round(this.#wavLoops.getValue())
            const blob = await serviceRegistry.wavExporter.exportPatternToWav(pattern, loops)
            serviceRegistry.wavExporter.downloadWav(
                blob,
                `ordrumbox-${nameOr(pattern.name, 'pattern', 'ToolsPanel', 'wav name fallback')}.wav`,
            )
        } catch (e) {
            logger.error('ToolsPanel', 'WAV Export failed', e)
            showToast('WAV Export failed', 'error')
        } finally {
            this.#wavBtn.disabled = false
            this.#wavBtn.textContent = originalText
        }
    }
}
