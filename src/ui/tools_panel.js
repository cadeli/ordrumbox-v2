import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { PatternExporter } from '../patterns/exporter.js'
import { escapeHtml, downloadJson, renderOptions } from './components/panel_helpers.js'
import MidiImportService from '../logic/services/midi_import_service.js'
import WavImportService from '../logic/services/wav_import_service.js'
import Utils from '../core/utils.js'
import { MAX_IMPORT_SIZE } from '../core/constants.js'
import { validatePatternJson } from '../logic/commands/pattern_import.js'
import { showToast } from './toast.js'
import { bindCloseButton, bindTabToggles } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import BasePanel from './base_panel.js'
import MidiIndicatorView from './midi_indicator_view.js'
import { logger, nameOr } from "../core/logger.js"
import { getCacheStats, getCachedDrumkits, clearPatternsCache, clearDrumkitsCache, clearSamplesCache, clearAllCache, removeCacheEntry, formatBytes, formatDate, cacheDrumkits, cacheGeneratedSounds } from '../cache/idb_cache.js'
import { idbGet } from '../core/idb.js'
import { isMobileViewport } from '../core/constants.js'
import MidiExporter from '../logic/midi/midi_exporter.js'

export default class ToolsPanel extends BasePanel {
    constructor() {
        super('tools-panel')
        this._wavLoops = null
        this.exportWavBtn = null
        this._midiImportService = new MidiImportService()
        this._wavImportService = new WavImportService()
    }

    createDOM() {
        super.createDOM()
        
        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Tools</span>
            </div>
            <div class="ne-tab-bar">
                <button class="ne-tab-btn active" data-ne-tab="pattern">Pattern</button>
                <button class="ne-tab-btn" data-ne-tab="export">Export</button>
                <button class="ne-tab-btn" data-ne-tab="import">Import</button>
                <button class="ne-tab-btn" data-ne-tab="midi-status">Status</button>
                <button class="ne-tab-btn" data-ne-tab="midi">MIDI</button>
                <button class="ne-tab-btn" data-ne-tab="cache">Cache</button>
            </div>
            <div class="ne-tab-panel" data-tab-panel="pattern">
                <div class="ne-row">
                    <button class="ne-btn" id="tp-compact" title="Detect repeating note patterns and add loop points to minimize notes">Compact Tracks</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-rnd" title="Write random notes into each track of the current pattern">Rnd</button>
                </div>
            </div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="export">
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-json" title="Save the current pattern as a JSON file">Export PATTERN</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-midi" title="Export the current pattern to a Standard MIDI File (.mid)">Export MIDI</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-wav" title="Render the pattern to an audio WAV file">Export WAV</button>
                </div>
                <div id="tp-wav-loops-slot"></div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-drumkit" title="Export the current drumkit list as a JSON file">Export DRUMKIT</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-synth" title="Export generated synth sounds as a JSON file">Export SYNTH</button>
                </div>
            </div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="import">
                <div class="ne-row">
                    <button class="ne-btn" id="tp-import-json" title="Load a previously exported pattern from a JSON file">Import PATTERN</button>
                    <input type="file" id="tp-import-file" style="display: none" accept=".json">
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-import-midi" title="Import a Standard MIDI File (.mid) into a new pattern">Import MIDI</button>
                    <input type="file" id="tp-import-midi-file" style="display: none" accept=".mid,.midi">
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-import-dir" title="Import a folder of WAV files as a new drumkit (auto-matched to instruments)">Import Directory</button>
                    <input type="file" id="tp-import-dir-file" style="display: none" accept=".wav,.flac" webkitdirectory directory multiple>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-import-drumkit" title="Import a drumkit from a JSON file">Import DRUMKIT</button>
                    <input type="file" id="tp-import-drumkit-file" style="display: none" accept=".json">
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-import-synth" title="Import generated synth sounds from a JSON file">Import SYNTH</button>
                    <input type="file" id="tp-import-synth-file" style="display: none" accept=".json">
                </div>
            </div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="midi-status">
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiSupportLed"></button>
                    <label>Support:</label>
                    <span class="ne-val" id="midiSupportLabel">Checking...</span>
                </div>
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiReadyLed"></button>
                    <label>Ready:</label>
                    <span class="ne-val" id="midiReadyLabel">Locked</span>
                </div>
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiConnectedLed"></button>
                    <label>Inputs:</label>
                    <span class="ne-val" id="midiConnectedLabel">None</span>
                </div>
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiSyncLed"></button>
                    <label>Ext Sync:</label>
                    <span class="ne-val" id="midiSyncLabel">Internal</span>
                </div>
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiActivityLed"></button>
                    <label>Activity:</label>
                    <span class="ne-val" id="midiActivityLabel">Idle</span>
                </div>
            </div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="midi">
                <div class="ne-row">
                    <label>Output:</label>
                    <select id="tp-midi-output-select"></select>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-midi-enable" title="Connect or disconnect the MIDI output device">Enable MIDI</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-midi-sync" title="Toggle between internal clock and external MIDI clock sync">Toggle Sync</button>
                </div>
            </div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="cache">
                <div class="ne-row no-cursor tp-cache-header">
                    <label>Total:</label>
                    <span class="ne-val" id="cache-total-size">-</span>
                    <span class="ne-val tp-cache-count" id="cache-total-count"></span>
                </div>
                <div id="tp-cache-list" class="tp-cache-list"></div>
                <div id="tp-cache-btns">
                    <button class="ne-btn" id="tp-cache-refresh" title="Refresh cache list">Refresh</button>
                    <button class="ne-btn" id="tp-cache-clear-patterns" title="Clear cached patterns from IDB">Clear Patterns</button>
                    <button class="ne-btn" id="tp-cache-clear-drumkits" title="Clear cached drumkits from IDB">Clear Drumkits</button>
                    <button class="ne-btn" id="tp-cache-clear-samples" title="Clear cached samples from IDB">Clear Samples</button>
                    <button class="ne-btn tp-cache-danger" id="tp-cache-clear-all" title="Clear all cached data">Factory Reset</button>
                </div>
            </div>
        `
        
        this.container.querySelector('#tp-compact').addEventListener('click', () => this._compactPattern())
        this.container.querySelector('#tp-rnd').addEventListener('click', () => this._randomizePattern())
        
        this.container.querySelector('#tp-export-json').addEventListener('click', () => this._exportJson())
        
        this._wavLoops = new OrSlider({
            key:    'tp-wav-loops',
            label:  'Loops',
            min:    1,
            max:    32,
            step:   1,
            value:  1,
            format: v => String(Math.round(v)),
        })
        this.container.querySelector('#tp-wav-loops-slot').replaceWith(this._wavLoops.createElement())
        
        this.exportWavBtn = this.container.querySelector('#tp-export-wav')
        this.exportWavBtn.addEventListener('click', () => this._exportWav())
        
        this.container.querySelector('#tp-export-midi').addEventListener('click', () => this._exportMidi())
        
        const importFile = this.container.querySelector('#tp-import-file')
        this.container.querySelector('#tp-import-json').addEventListener('click', () => importFile.click())
        importFile.addEventListener('change', (e) => this._onImportFile(e))

        const importMidiFile = this.container.querySelector('#tp-import-midi-file')
        this.container.querySelector('#tp-import-midi').addEventListener('click', () => importMidiFile.click())
        importMidiFile.addEventListener('change', (e) => this._onImportMidiFile(e))

        const importDirFile = this.container.querySelector('#tp-import-dir-file')
        this.container.querySelector('#tp-import-dir').addEventListener('click', () => importDirFile.click())
        importDirFile.addEventListener('change', (e) => this._onImportDir(e))

        this.container.querySelector('#tp-export-drumkit').addEventListener('click', () => this._exportDrumkit())
        this.container.querySelector('#tp-export-synth').addEventListener('click', () => this._exportSynth())

        const importDrumkitFile = this.container.querySelector('#tp-import-drumkit-file')
        this.container.querySelector('#tp-import-drumkit').addEventListener('click', () => importDrumkitFile.click())
        importDrumkitFile.addEventListener('change', (e) => this._onImportDrumkit(e))

        const importSynthFile = this.container.querySelector('#tp-import-synth-file')
        this.container.querySelector('#tp-import-synth').addEventListener('click', () => importSynthFile.click())
        importSynthFile.addEventListener('change', (e) => this._onImportSynth(e))

        this.container.querySelector('#tp-midi-enable').addEventListener('click', async () => {
            const btn = this.container.querySelector('#tp-midi-enable')
            if (!serviceRegistry.midiManager) {
                const { getMidiManagerService } = await import('../state/service_loader.js')
                await getMidiManagerService()
            }
            
            if (serviceRegistry.midiManager.isReady) {
                serviceRegistry.midiManager.disable()
                btn.textContent = 'Enable MIDI'
            } else {
                await serviceRegistry.midiManager.init()
                btn.textContent = 'Disable MIDI'
            }
            this.sync()
        })

        this.container.querySelector('#tp-midi-sync').addEventListener('click', () => {
            if (serviceRegistry.midiManager) {
                serviceRegistry.midiManager.toggleExternalSync()
                this.sync()
            } else {
                showToast('Enable MIDI first', 'info')
            }
        })

        const outputSelect = this.container.querySelector('#tp-midi-output-select')
        outputSelect.addEventListener('change', () => {
            if (serviceRegistry.midiManager) {
                serviceRegistry.midiManager.setSelectedOutput(outputSelect.value)
            }
        })

        this.container.querySelector('#tp-cache-refresh').addEventListener('click', () => this._refreshCacheStats())
        this.container.querySelector('#tp-cache-clear-patterns').addEventListener('click', async () => {
            await clearPatternsCache()
            showToast('Patterns cache cleared', 'success')
            this._refreshCacheStats()
        })
        this.container.querySelector('#tp-cache-clear-drumkits').addEventListener('click', async () => {
            await clearDrumkitsCache()
            showToast('Drumkits cache cleared', 'success')
            this._refreshCacheStats()
        })
        this.container.querySelector('#tp-cache-clear-samples').addEventListener('click', async () => {
            await clearSamplesCache()
            showToast('Samples cache cleared', 'success')
            this._refreshCacheStats()
        })
        this.container.querySelector('#tp-cache-clear-all').addEventListener('click', async () => {
            await clearAllCache()
            showToast('All cache cleared', 'success')
            this._refreshCacheStats()
        })
        this.container.querySelector('#tp-cache-list').addEventListener('click', async (e) => {
            const viewBtn = e.target.closest('.tp-cache-item-view')
            if (viewBtn) {
                const { cacheType, cacheKey } = viewBtn.dataset
                await this._showCacheJson(cacheType, cacheKey)
                return
            }
            const delBtn = e.target.closest('.tp-cache-item-del')
            if (!delBtn) return
            const { cacheType, cacheKey } = delBtn.dataset
            if (!window.confirm(`Remove "${cacheKey}" from ${cacheType} cache?`)) return
            await removeCacheEntry(cacheType, cacheKey)
            this._refreshCacheStats()
        })

        this._midiView = new MidiIndicatorView(this.container)

        bindCloseButton(this.container, () => playbackEvents.emit("toolsToggle", false))
        bindTabToggles(this.container)
    }

    subscribe() {}

    sync() {
        const pattern = appState.patterns[appState.selectedPatternNum]

        const outputSelect = this.container.querySelector('#tp-midi-output-select')
        const enableBtn = this.container.querySelector('#tp-midi-enable')

        if (serviceRegistry.midiManager) {
            this._midiView.connect(serviceRegistry.midiManager)
            this._midiView.sync(serviceRegistry.midiManager)
            enableBtn.textContent = serviceRegistry.midiManager.isReady ? 'Disable MIDI' : 'Enable MIDI'

            // Sync output list
            const outputs = serviceRegistry.midiManager.outputs
            const currentOutputId = serviceRegistry.midiManager.selectedOutputId
            
            // Only update if list changed or empty
            if (outputSelect.options.length !== outputs.length) {
                const values = outputs.map(o => o.id)
                const labels = outputs.map(o => nameOr(o.name, 'Unknown', 'ToolsPanel', 'name fallback'))
                outputSelect.innerHTML = renderOptions(values, currentOutputId, { labels, escape: escapeHtml })
            } else {
                outputSelect.value = nameOr(currentOutputId, '', 'ToolsPanel', 'outputId fallback')
            }
        } else {
            this._midiView.disconnect()
            this._midiView.sync(null)
            if (outputSelect) outputSelect.innerHTML = '<option value="">MIDI Not Enabled</option>'
        }

        // Refresh cache stats if cache tab is visible
        if (this.isVisible) {
            this._refreshCacheStats()
        }
    }

    async _refreshCacheStats() {
        try {
            const stats = await getCacheStats()
            const q = (sel) => this.container.querySelector(sel)

            q('#cache-total-size').textContent = formatBytes(stats.totalBytes)
            q('#cache-total-count').textContent = `${stats.entries.length} file(s)`

            const listEl = q('#tp-cache-list')
            if (stats.entries.length === 0) {
                listEl.innerHTML = '<div class="tp-cache-empty">No cached files</div>'
                return
            }

            const drumkits = await getCachedDrumkits()
            const urlToKit = {}
            if (drumkits && typeof drumkits === 'object') {
                for (const [kitName, kit] of Object.entries(drumkits)) {
                    const instruments = kit?.instruments ?? []
                    for (const inst of instruments) {
                        if (inst.url) urlToKit[inst.url] = kitName
                    }
                }
            }

            const sorted = [...stats.entries].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
            const TYPE_LABELS = { patterns: 'PAT', drumkits: 'DK', samples: 'SMP', settings: 'SET', songs: 'SONG', generated_sounds: 'SYN' }
            const isDesktop = !isMobileViewport()

            listEl.innerHTML = sorted.map(e => {
                const label = TYPE_LABELS[e.type] ?? e.type
                const date = formatDate(e.savedAt)
                const size = formatBytes(e.size)
                const kitName = e.type === 'samples' ? (urlToKit[e.key] ?? '') : ''
                const tooltip = e.type === 'samples' && kitName
                    ? `${e.key}\nDrumkit: ${kitName}`
                    : e.key
                const canView = isDesktop && e.type !== 'samples'
                return `<div class="tp-cache-item" title="${escapeHtml(tooltip)}">` +
                    `<span class="tp-cache-item-label">${label}</span>` +
                    `<span class="tp-cache-item-key">${escapeHtml(e.key)}</span>` +
                    (kitName ? `<span class="tp-cache-item-kit" title="${escapeHtml(kitName)}">${escapeHtml(kitName)}</span>` : `<span class="tp-cache-item-kit"></span>`) +
                    `<span class="tp-cache-item-size">${size}</span>` +
                    `<span class="tp-cache-item-date">${date}</span>` +
                    (canView ? `<button class="tp-cache-item-view" data-cache-type="${e.type}" data-cache-key="${escapeHtml(e.key)}" title="View JSON">&#x1F441;</button>` : '') +
                    `<button class="tp-cache-item-del" data-cache-type="${e.type}" data-cache-key="${escapeHtml(e.key)}" title="Remove">&#x2715;</button>` +
                    `</div>`
            }).join('')
        } catch (e) {
            logger.error('ToolsPanel', 'Failed to refresh cache stats', e)
        }
    }

    async _showCacheJson(type, key) {
        const storeMap = { patterns: 'patterns', drumkits: 'drumkits', settings: 'settings', songs: 'songs', generated_sounds: 'generated_sounds' }
        const store = storeMap[type]
        if (!store) return
        try {
            const raw = await idbGet(store, key)
            if (!raw) {
                showToast('Entry not found in cache', 'info')
                return
            }
            const data = raw?.data ?? raw
            const json = JSON.stringify(data, null, 2)
            this._openJsonModal(key, json)
        } catch (e) {
            logger.error('ToolsPanel', 'Failed to read cache entry', e)
            showToast('Failed to read cache entry', 'error')
        }
    }

    _openJsonModal(title, json) {
        this._closeJsonModal()
        const overlay = document.createElement('div')
        overlay.className = 'tp-json-modal-overlay'
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._closeJsonModal()
        })

        const modal = document.createElement('div')
        modal.className = 'tp-json-modal'

        const header = document.createElement('div')
        header.className = 'tp-json-modal-header'
        const titleSpan = document.createElement('span')
        titleSpan.className = 'tp-json-modal-title'
        titleSpan.textContent = title
        const closeBtn = document.createElement('button')
        closeBtn.className = 'tp-json-modal-close'
        closeBtn.innerHTML = '&#x2715;'
        closeBtn.addEventListener('click', () => this._closeJsonModal())
        header.append(titleSpan, closeBtn)

        const pre = document.createElement('pre')
        pre.className = 'tp-json-modal-body'
        pre.textContent = json

        modal.append(header, pre)
        overlay.appendChild(modal)
        document.body.appendChild(overlay)

        const onKey = (e) => {
            if (e.key === 'Escape') {
                this._closeJsonModal()
                document.removeEventListener('keydown', onKey)
            }
        }
        document.addEventListener('keydown', onKey)
        this._jsonModalCleanup = () => document.removeEventListener('keydown', onKey)
    }

    _closeJsonModal() {
        this._jsonModalCleanup?.()
        this._jsonModalCleanup = null
        document.querySelector('.tp-json-modal-overlay')?.remove()
    }

    _compactPattern() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern || !pattern.tracks) return

        let totalRemoved = 0
        Utils.getTracksArray(pattern).forEach(track => {
            const result = Utils.addLoopToTrackIfPossible(track)
            if (result.changed) {
                totalRemoved += result.removedNotes
            }
        })

        serviceRegistry.audioEngine?.invalidateCache()
        playbackEvents.emit("noteChange")
        playbackEvents.emit("patternChange")

    }

    _randomizePattern() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const tracks = Utils.getTracksArray(pattern)
        for (const track of tracks) {
            const beats = track.nbBeats ?? pattern.nbBeats ?? 4
            const stepsPerBeat = track.stepsPerBeat ?? 4
            const totalSteps = beats * stepsPerBeat
            const noteCount = Math.max(1, Math.floor(totalSteps * (0.15 + Math.random() * 0.2)))
            const used = new Set()
            for (let i = 0; i < noteCount; i++) {
                let step
                do { step = Math.floor(Math.random() * totalSteps) } while (used.has(step))
                used.add(step)
                const beat = Math.floor(step / stepsPerBeat)
                const beatStep = step % stepsPerBeat
                const pitch = Math.floor(Math.random() * 13) - 6
                const note = serviceRegistry.cmd?.addNote(track, beat, beatStep, pitch)
                if (note) note.velocity = 0.5 + Math.random() * 0.5
            }
        }
        serviceRegistry.audioEngine?.invalidateCache()
        playbackEvents.emit("noteChange")
        playbackEvents.emit("patternChange")
    }

    _exportJson() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        downloadJson(PatternExporter.export(pattern), `ordrumbox-${pattern.name ?? 'pattern'}.json`)
    }

    async _exportMidi() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const exporter = new MidiExporter()
        const loops = Math.round(this._wavLoops.getValue())
        exporter.download(pattern, `ordrumbox-${nameOr(pattern.name, 'pattern', 'ToolsPanel', 'midi name fallback')}.mid`, { loops })
    }

    async _exportWav() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        
        const originalText = this.exportWavBtn.textContent
        this.exportWavBtn.disabled = true
        this.exportWavBtn.textContent = 'Exporting...'
        
        try {
            if (!serviceRegistry.wavExporter) {
                const { default: WavExporter } = await import('../audio/export/wav_exporter.js')
                serviceRegistry.wavExporter = new WavExporter()
            }
            
            const loops = Math.round(this._wavLoops.getValue())
            const blob = await serviceRegistry.wavExporter.exportPatternToWav(pattern, loops)
            serviceRegistry.wavExporter.downloadWav(blob, `ordrumbox-${nameOr(pattern.name, 'pattern', 'ToolsPanel', 'wav name fallback')}.wav`)
        } catch (e) {
            logger.error('ToolsPanel', 'WAV Export failed', e)
            showToast('WAV Export failed', 'error')
        } finally {
            this.exportWavBtn.disabled = false
            this.exportWavBtn.textContent = originalText
        }
    }

    _onImportFile(e) {
        const file = e.target.files[0]
        if (!file) return

        if (file.size > MAX_IMPORT_SIZE) {
            showToast('File too large (max 10 MB)', 'error')
            e.target.value = ''
            return
        }

        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result)

                const validation = validatePatternJson(data)
                if (!validation.ok) {
                    showToast(`Invalid pattern: ${validation.error}`, 'error')
                    return
                }

                const newPattern = serviceRegistry.cmd.importPatternFromJson(data)
                const newIdx = appState.patterns.indexOf(newPattern)
                if (newIdx !== -1) {
                    await serviceRegistry.cmd.setSelectedPatternNum(newIdx)
                    playbackEvents.emit("patternStructureChange")
                    playbackEvents.emit("patternChange")
                    playbackEvents.emit("toolsToggle", false)
                }
            } catch (err) {
                logger.error('ToolsPanel', 'Import failed', err)
                showToast('Import failed: ' + err.message, 'error')
            }
        }
        reader.readAsText(file)
        e.target.value = '' // Reset for next time
    }

    async _onImportMidiFile(e) {
        const file = e.target.files[0]
        if (!file) return

        try {
            await this._midiImportService.importFile(file)
        } catch (err) {
            logger.error('ToolsPanel', 'MIDI Import failed', err)
            showToast('MIDI Import failed: ' + err.message, 'error')
        }
        e.target.value = ''
    }

    async _onImportDir(e) {
        const files = e.target.files
        if (!files || files.length === 0) return

        try {
            const { kitName, fileCount } = await this._wavImportService.importDirectory(files)
            if (fileCount > 0) {
                await this._wavImportService.autoAssignSounds()
                serviceRegistry.audioEngine?.invalidateCache()
                playbackEvents.emit("patternChange")
            }
        } catch (err) {
            logger.error('ToolsPanel', 'Directory import failed', err)
            showToast('Import failed: ' + err.message, 'error')
        }
        e.target.value = ''
    }

    _exportDrumkit() {
        const drumkits = soundRegistry.drumkitList
        if (!drumkits || drumkits.length === 0) {
            showToast('No drumkits loaded', 'info')
            return
        }
        downloadJson(drumkits, 'ordrumbox-drumkits.json')
    }

    _exportSynth() {
        const sounds = soundRegistry.generatedSounds
        if (!sounds || Object.keys(sounds).length === 0) {
            showToast('No synth sounds loaded', 'info')
            return
        }
        downloadJson(sounds, 'ordrumbox-synth-sounds.json')
    }

    _onImportDrumkit(e) {
        const file = e.target.files[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result)
                if (!Array.isArray(data)) {
                    showToast('Invalid drumkit file: expected a JSON array', 'error')
                    return
                }
                for (const kit of data) {
                    if (!kit.name || !Array.isArray(kit.instruments)) {
                        showToast('Invalid drumkit entry: missing name or instruments', 'error')
                        return
                    }
                }
                for (const kit of data) {
                    const existing = soundRegistry.drumkitList.findIndex(k => k.name === kit.name)
                    if (existing !== -1) {
                        soundRegistry.drumkitList[existing] = kit
                    } else {
                        soundRegistry.drumkitList.push(kit)
                    }
                }
                await cacheDrumkits(soundRegistry.drumkitList)
                showToast(`Imported ${data.length} drumkit(s)`, 'success')
            } catch (err) {
                logger.error('ToolsPanel', 'Drumkit import failed', err)
                showToast('Import failed: ' + err.message, 'error')
            }
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    _onImportSynth(e) {
        const file = e.target.files[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result)
                if (!data || typeof data !== 'object' || Array.isArray(data)) {
                    showToast('Invalid synth file: expected a JSON object', 'error')
                    return
                }
                const count = Object.keys(data).length
                Object.assign(soundRegistry.generatedSounds, data)
                await cacheGeneratedSounds(soundRegistry.generatedSounds)
                serviceRegistry.audioEngine?.updateGeneratedSounds?.(soundRegistry.generatedSounds)
                showToast(`Imported ${count} synth sound(s)`, 'success')
            } catch (err) {
                logger.error('ToolsPanel', 'Synth import failed', err)
                showToast('Import failed: ' + err.message, 'error')
            }
        }
        reader.readAsText(file)
        e.target.value = ''
    }
}
