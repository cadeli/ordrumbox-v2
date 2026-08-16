import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { PatternExporter } from '../patterns/exporter.js'
import { escapeHtml, downloadJson } from './components/panel_helpers.js'
import InstrumentsManager, { GM_DRUM_NAMES, GM_PROGRAM_NAMES } from '../logic/services/instruments_manager.js'
import Utils from '../core/utils.js'
import { TICK } from '../core/constants.js'
import { isMidiSupported, parseMidi, findAllNotes, extractProgramChanges, midiVelocityToNormalized } from '../logic/midi/midi_parser.js'
import { C3_MIDI_NOTE } from '../logic/midi/midi_exporter.js'
import { showToast } from './toast.js'
import { bindCloseButton, bindTabToggles } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import BasePanel from './base_panel.js'
import { logger, nameOr } from "../core/logger.js"
import { getCacheStats, clearPatternsCache, clearDrumkitsCache, clearSamplesCache, clearAllCache, formatBytes, formatDate, cacheSample, cacheDrumkits } from '../cache/idb_cache.js'

export default class ToolsPanel extends BasePanel {
    constructor() {
        super('tools-panel')
        this._wavLoops = null
        this.exportWavBtn = null
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
                    <button class="ne-btn" id="tp-export-json" title="Save the current pattern as a JSON file">Export JSON</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-midi" title="Export the current pattern to a Standard MIDI File (.mid)">Export MIDI</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-export-wav" title="Render the pattern to an audio WAV file">Export WAV</button>
                </div>
                <div id="tp-wav-loops-slot"></div>
            </div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="import">
                <div class="ne-row">
                    <button class="ne-btn" id="tp-import-json" title="Load a previously exported pattern from a JSON file">Import JSON</button>
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
                <div class="ne-row no-cursor" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 4px; margin-bottom: 4px;">
                    <label>Total:</label>
                    <span class="ne-val" id="cache-total-size">-</span>
                    <span class="ne-val" id="cache-total-count" style="margin-left: auto;"></span>
                </div>
                <div id="tp-cache-list" style="max-height: 140px; overflow-y: auto; font-size: var(--fs-sm); margin-bottom: 4px;"></div>
                <div id="tp-cache-btns" style="display: flex; flex-direction: column; gap: 3px;">
                    <button class="ne-btn" id="tp-cache-refresh" title="Refresh cache list">Refresh</button>
                    <button class="ne-btn" id="tp-cache-clear-patterns" title="Clear cached patterns from IDB">Clear Patterns</button>
                    <button class="ne-btn" id="tp-cache-clear-drumkits" title="Clear cached drumkits from IDB">Clear Drumkits</button>
                    <button class="ne-btn" id="tp-cache-clear-samples" title="Clear cached samples from IDB">Clear Samples</button>
                    <button class="ne-btn" id="tp-cache-clear-all" title="Clear all cached data from IDB" style="color: var(--color-danger);">Clear All Cache</button>
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

        this.container.querySelector('#tp-midi-enable').addEventListener('click', async () => {
            const btn = this.container.querySelector('#tp-midi-enable')
            if (!serviceRegistry.midiManager) {
                const { getMidiManagerService } = await import('../state/service_registry.js')
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

        bindCloseButton(this.container, () => this.hide())
        bindTabToggles(this.container)
    }

    subscribe() {
        playbackEvents.onToolsToggle.push((show) => {
            if (show) this.show()
            else this.hide()
        })
        
        playbackEvents.onPatternChange.push(() => {
            if (this.isVisible) {
                this.sync()
            }
        })
    }

    sync() {
        const pattern = appState.patterns[appState.selectedPatternNum]

        const outputSelect = this.container.querySelector('#tp-midi-output-select')
        const enableBtn = this.container.querySelector('#tp-midi-enable')

        if (serviceRegistry.midiManager) {
            serviceRegistry.midiManager.renderIndicators()
            enableBtn.textContent = serviceRegistry.midiManager.isReady ? 'Disable MIDI' : 'Enable MIDI'

            // Sync output list
            const outputs = serviceRegistry.midiManager.outputs
            const currentOutputId = serviceRegistry.midiManager.selectedOutputId
            
            // Only update if list changed or empty
            if (outputSelect.options.length !== outputs.length) {
                outputSelect.innerHTML = outputs.map(o => 
                    `<option value="${escapeHtml(o.id)}" ${o.id === currentOutputId ? 'selected' : ''}>${escapeHtml(nameOr(o.name, 'Unknown', 'ToolsPanel', 'name fallback'))}</option>`
                ).join('')
            } else {
                outputSelect.value = nameOr(currentOutputId, '', 'ToolsPanel', 'outputId fallback')
            }
        } else {
            // Default inactive state
            const support = isMidiSupported()
            this._setLedState('midiSupportLed', support, support ? 'Supported' : 'Unavailable')
            this._setLedState('midiReadyLed', false, 'Locked')
            this._setLedState('midiConnectedLed', false, 'None')
            this._setLedState('midiSyncLed', false, 'Internal')
            this._setLedState('midiActivityLed', false, 'Idle')
            if (outputSelect) outputSelect.innerHTML = '<option value="">MIDI Not Enabled</option>'
        }

        // Refresh cache stats if cache tab is visible
        if (this.isVisible) {
            this._refreshCacheStats()
        }
    }

    _setLedState(ledId, isOn, label) {
        const led = this.container.querySelector(`#${ledId}`)
        const text = this.container.querySelector(`#${ledId.replace('Led', 'Label')}`)
        if (led) {
            led.classList.toggle('midi-indicator-on', !!isOn)
            led.classList.toggle('midi-indicator-off', !isOn)
        }
        if (text) {
            text.innerText = label
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
                listEl.innerHTML = '<div style="color: var(--text-tertiary); padding: 4px 0;">No cached files</div>'
                return
            }

            const sorted = [...stats.entries].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
            const TYPE_LABELS = { patterns: 'PAT', drumkits: 'DK', samples: 'SMP' }

            listEl.innerHTML = sorted.map(e => {
                const label = TYPE_LABELS[e.type] ?? e.type
                const date = formatDate(e.savedAt)
                const size = formatBytes(e.size)
                return `<div style="display:flex; align-items:center; gap:4px; padding:2px 0; border-bottom:1px solid var(--border-subtle);" title="${escapeHtml(e.key)}">` +
                    `<span style="min-width:28px;color:var(--accent);font-weight:600;">${label}</span>` +
                    `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">${escapeHtml(e.key)}</span>` +
                    `<span style="color:var(--text-tertiary);min-width:52px;text-align:right;flex-shrink:0;">${size}</span>` +
                    `<span style="color:var(--text-tertiary);min-width:90px;text-align:right;flex-shrink:0;">${date}</span>` +
                    `</div>`
            }).join('')
        } catch (e) {
            logger.error('ToolsPanel', 'Failed to refresh cache stats', e)
        }
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
        playbackEvents.dispatchPatternChange()
        logger.debug('ToolsPanel', `Compaction finished. Total redundant notes removed: ${totalRemoved}`)
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
                const note = serviceRegistry.mfCmd?.addNote(track, beat, beatStep, pitch)
                if (note) note.velocity = 0.5 + Math.random() * 0.5
            }
        }
        serviceRegistry.audioEngine?.invalidateCache()
        playbackEvents.dispatchPatternChange()
    }

    _exportJson() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        downloadJson(PatternExporter.export(pattern), `ordrumbox-${pattern.name ?? 'pattern'}.json`)
    }

    async _exportMidi() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const { default: MidiExporter } = await import('../logic/midi/midi_exporter.js')
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
            if (!serviceRegistry.mfWavExporter) {
                const { default: MfWavExporter } = await import('../audio/export/wav_exporter.js')
                serviceRegistry.mfWavExporter = new MfWavExporter()
            }
            
            const loops = Math.round(this._wavLoops.getValue())
            const blob = await serviceRegistry.mfWavExporter.exportPatternToWav(pattern, loops)
            serviceRegistry.mfWavExporter.downloadWav(blob, `ordrumbox-${nameOr(pattern.name, 'pattern', 'ToolsPanel', 'wav name fallback')}.wav`)
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

        const MAX_IMPORT_SIZE = 10 * 1024 * 1024 // 10 MB
        if (file.size > MAX_IMPORT_SIZE) {
            showToast('File too large (max 10 MB)', 'error')
            e.target.value = ''
            return
        }

        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result)

                if (!data || typeof data !== 'object' || Array.isArray(data)) {
                    showToast('Invalid pattern: expected a JSON object', 'error')
                    return
                }
                const tracks = data.tracks
                if (tracks != null && (typeof tracks !== 'object' || Array.isArray(tracks) === false)) {
                    // tracks can be object or array, both are fine
                }
                const trackEntries = Object.values(tracks ?? {})
                if (trackEntries.length > 64) {
                    showToast('Too many tracks (max 64)', 'error')
                    return
                }
                let totalNotes = 0
                for (const t of trackEntries) {
                    totalNotes += Object.values(t?.notes ?? {}).length
                    if (totalNotes > 10000) {
                        showToast('Too many notes (max 10000)', 'error')
                        return
                    }
                }

                const newPattern = serviceRegistry.mfCmd.importPatternFromJson(data)
                const newIdx = appState.patterns.indexOf(newPattern)
                if (newIdx !== -1) {
                    await serviceRegistry.mfCmd.setSelectedPatternNum(newIdx)
                    playbackEvents.dispatchPatternChange()
                    this.hide()
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
            logger.debug('MidiImport', `parsing "${file.name}" (${file.size} bytes)`)
            const arrayBuffer = await file.arrayBuffer()
            const midiData = parseMidi(new Uint8Array(arrayBuffer))

            logger.debug('MidiImport', `format: ${midiData.header.format}, tracks: ${midiData.tracks.length}, division: ${midiData.header.division}, tempo: ${midiData.header.tempo ?? 'none'}`)

            const notes = findAllNotes(midiData)

            if (notes.length === 0) {
                logger.warn('MidiImport', 'no Note On events found — file may be type-0 with track 0 only, or empty')
                showToast('No MIDI notes found in file', 'warning')
                return
            }

            logger.debug('MidiImport', `found ${notes.length} note-on events`)

            const channelPrograms = extractProgramChanges(midiData)
            logger.debug('MidiImport', `program changes: ${[...channelPrograms.entries()].map(([ch, pr]) => `ch${ch}=pr${pr}`).join(', ') || 'none'}`)

            const im = new InstrumentsManager()

            // Build channel → MIDI track name map from note events
            const channelTrackNames = new Map()
            for (const note of notes) {
                if (!channelTrackNames.has(note.channel)) {
                    channelTrackNames.set(note.channel, midiData.trackNames[note.trackIdx] ?? '')
                }
            }

            // Group notes by channel
            const channelNotes = new Map()
            for (const note of notes) {
                if (!channelNotes.has(note.channel)) channelNotes.set(note.channel, [])
                channelNotes.get(note.channel).push(note)
            }

            logger.debug('MidiImport', `channels with notes: ${[...channelNotes.keys()].join(', ')} (${[...channelNotes.values()].map(n => n.length).join('+')} notes)`)

            // Build track definitions: one per instrument
            const trackDefs = []
            const skippedChannels = []

            const resolveRootMidi = (trackName) => {
                const upper = trackName?.trim().toUpperCase() ?? ''
                for (const sound of Object.values(soundRegistry.sounds ?? {})) {
                    if (sound.rootMidi != null && upper.includes(sound.key?.toUpperCase() ?? '')) {
                        return sound.rootMidi
                    }
                }
                return C3_MIDI_NOTE
            }

            for (const [channel, chNotes] of channelNotes) {
                const program = channelPrograms.get(channel) ?? 0
                const midiTrackName = channelTrackNames.get(channel) ?? ''

                logger.warn('MidiImport', `── Channel ${channel}, program=${program}, name="${midiTrackName}", notes=${chNotes.length} ──`)

                const isDrumChannel = channel === 9

                // Step 1: Try program-based lookup first (melodic) - SKIP for drum channel (9)
                if (!isDrumChannel) {
                    const melodicInst = im.findInstrumentFromMidiProgram(channel, program)
                    if (melodicInst.id !== 'NOT_FOUND' && !melodicInst.drum) {
                        const trackName = melodicInst.id
                        if (!trackDefs.some(d => d.trackName === trackName)) {
                            trackDefs.push({ trackName, groupNotes: chNotes, baseNote: resolveRootMidi(trackName), midiTrackName, program, channel, isDrum: false })
                            logger.warn('MidiImport', `  → ${trackName} (tier1: findInstrumentFromMidiProgram ch=${channel} prog=${program})`)
                        }
                        continue
                    }
                }

                // Step 2: Drums: sub-group by note number
                const noteGroups = new Map()
                for (const note of chNotes) {
                    if (!noteGroups.has(note.note)) noteGroups.set(note.note, [])
                    noteGroups.get(note.note).push(note)
                }

                let drumFound = false
                for (const [noteNum, grpNotes] of noteGroups) {
                    let drumInst = im.findInstrumentFromMidi(channel, noteNum)
                    let matchMethod = drumInst.id !== 'NOT_FOUND' ? 'findInstrumentFromMidi' : null
                    if (drumInst.id === 'NOT_FOUND') {
                        const gmName = GM_DRUM_NAMES[noteNum]
                        if (gmName) {
                            drumInst = im.findInstrumentFromFileName(gmName)
                            if (drumInst.id !== 'NOT_FOUND') matchMethod = `GM_DRUM_NAMES[${noteNum}]="${gmName}" → findInstrumentFromFileName`
                        }
                        if (drumInst.id === 'NOT_FOUND') {
                            logger.warn('MidiImport', `  note ${noteNum}: aucun instrument trouvé`)
                            continue
                        }
                    }

                    const trackName = drumInst.id
                    if (!trackDefs.some(d => d.trackName === trackName)) {
                        trackDefs.push({ trackName, groupNotes: grpNotes, baseNote: noteNum, midiTrackName, program, channel, isDrum: true, key: noteNum })
                        drumFound = true
                        logger.warn('MidiImport', `  → ${trackName} (tier2: ${matchMethod}, note=${noteNum})`)
                    }
                }

                if (drumFound) continue

                // Step 3: Name-based fallback
                if (midiTrackName) {
                    const nameInst = im.findByName(midiTrackName)
                    if (nameInst) {
                        const trackName = nameInst.id
                        if (!trackDefs.some(d => d.trackName === trackName)) {
                            trackDefs.push({ trackName, groupNotes: chNotes, baseNote: resolveRootMidi(trackName), midiTrackName, program, channel, isDrum: false })
                            logger.warn('MidiImport', `  → ${trackName} (tier3: findByName "${midiTrackName}")`)
                        }
                        continue
                    }
                }

                // Step 4: Program-only fallback (any channel)
                const programInst = im.findInstrumentFromMidiProgramAnyChannel(program)
                if (programInst.id !== 'NOT_FOUND') {
                    const trackName = programInst.id
                    if (!trackDefs.some(d => d.trackName === trackName)) {
                        trackDefs.push({ trackName, groupNotes: chNotes, baseNote: resolveRootMidi(trackName), midiTrackName, program, channel, isDrum: false })
                        logger.warn('MidiImport', `  → ${trackName} (tier4: findInstrumentFromMidiProgramAnyChannel prog=${program})`)
                    }
                } else {
                    skippedChannels.push(channel)
                    logger.warn('MidiImport', `  → SKIPPED (aucun instrument trouvé pour ch=${channel} prog=${program})`)
                }
            }

            // Fallback: assign unresolved channels to first unused instrument
            if (skippedChannels.length > 0) {
                const allInstIds = [...im.byId.keys()].sort()
                const usedIds = new Set(trackDefs.map(d => d.trackName))
                let fallbackIdx = 0

                for (const channel of skippedChannels) {
                    while (fallbackIdx < allInstIds.length && usedIds.has(allInstIds[fallbackIdx])) {
                        fallbackIdx++
                    }
                    if (fallbackIdx >= allInstIds.length) continue

                    const instId = allInstIds[fallbackIdx]
                    const chNotes = channelNotes.get(channel)
                    trackDefs.push({ trackName: instId, groupNotes: chNotes, baseNote: resolveRootMidi(instId), midiTrackName: channelTrackNames.get(channel) ?? '', program: channelPrograms.get(channel) ?? 0, channel, isDrum: false })
                    usedIds.add(instId)
                    fallbackIdx++
                }
            }

            // Summary trace
            const drumkitList = soundRegistry.drumkitList
            const selDrumkitName = drumkitList?.[appState.selectedDrumkitNum]?.name ?? ''

            const resolveSampleUrl = (trackName) => {
                for (const sound of Object.values(soundRegistry.sounds)) {
                    if (sound.kit_name === selDrumkitName && trackName.toUpperCase().includes(sound.key.toUpperCase())) {
                        return sound.url
                    }
                }
                for (const sound of Object.values(soundRegistry.sounds)) {
                    if (trackName.toUpperCase().includes(sound.key.toUpperCase())) {
                        return sound.url
                    }
                }
                return null
            }

            logger.warn('MidiImport', `═══ IMPORT SUMMARY: ${trackDefs.length} track(s) ═══`)
            for (const def of trackDefs) {
                const sampleUrl = resolveSampleUrl(def.trackName) ?? '?'
                if (def.isDrum) {
                    const gmName = GM_DRUM_NAMES[def.key] ?? ''
                    logger.warn('MidiImport', `  original: "ch: ${def.channel}, key: ${def.key}${gmName ? ', ' + gmName : ''}" → ${def.trackName} (${def.groupNotes.length} notes) [${sampleUrl}]`)
                } else {
                    const gmProgName = GM_PROGRAM_NAMES[def.program] ?? ''
                    logger.warn('MidiImport', `  original: "ch: ${def.channel}, program: ${def.program}${gmProgName ? ', ' + gmProgName : ''}" → ${def.trackName} (${def.groupNotes.length} notes) [${sampleUrl}]`)
                }
            }
            logger.warn('MidiImport', `═══════════════════════════════════════════`)

            if (trackDefs.length === 0) {
                logger.warn('MidiImport', 'no matching instruments — dumping channel/note summary:')
                for (const [channel, chNotes] of channelNotes) {
                    const noteNums = [...new Set(chNotes.map(n => n.note))].sort((a, b) => a - b)
                    logger.warn('MidiImport', `  ch${channel}: notes [${noteNums.join(', ')}], program=${channelPrograms.get(channel) ?? 'none'}, count=${chNotes.length}`)
                }
                showToast('No matching instruments found in MIDI file', 'warning')
                return
            }

            const baseName = file.name.replace(/\.midi?$/i, '')
            const mfCmd = serviceRegistry.mfCmd
            const bpm = midiData.header.tempo ? Math.round(60000000 / midiData.header.tempo) : 120
            const PPQN = midiData.header.division ?? 96
            const TICK_RATIO = PPQN / TICK
            const MAX_BEATS = 32
            const MAX_PATTERNS = 16

            // Compute total beats needed
            let maxTick = 0
            for (const def of trackDefs) {
                for (const note of def.groupNotes) {
                    if (note.absTick > maxTick) maxTick = note.absTick
                }
            }
            const totalEngineTicks = Math.round(maxTick / TICK_RATIO)
            const totalBeats = Math.max(1, Math.ceil(totalEngineTicks / TICK))

            const numPatterns = Math.min(MAX_PATTERNS, Math.ceil(totalBeats / MAX_BEATS))
            const beatsPerPattern = MAX_BEATS

            logger.debug('MidiImport', `maxTick=${maxTick}, PPQN=${PPQN}, TICK_RATIO=${TICK_RATIO.toFixed(3)}, totalBeats=${totalBeats}, patterns=${numPatterns}, beatsPerPattern=${beatsPerPattern}`)

            for (let p = 0; p < numPatterns; p++) {
                const patBeats = beatsPerPattern
                const patStartBeat = p * beatsPerPattern
                const patEndBeat = patStartBeat + patBeats

                const suffix = numPatterns > 1 ? ` ${p + 1}/${numPatterns}` : ''
                const pattern = mfCmd.addPattern(`${baseName}${suffix}`)
                pattern.nbBeats = patBeats
                pattern.bpm = bpm

                const patStartTick = patStartBeat * TICK
                const patEndTick = patEndBeat * TICK

                for (const def of trackDefs) {
                    const track = mfCmd.addTrack(pattern, def.trackName)
                    const ticksPerStep = TICK / (track.stepsPerBeat ?? 4)

                    let noteCount = 0
                    for (const note of def.groupNotes) {
                        const engineTicks = Math.round(note.absTick / TICK_RATIO)
                        if (engineTicks < patStartTick || engineTicks >= patEndTick) continue

                        const beat = Math.floor(engineTicks / TICK) - patStartBeat
                        const beatStep = Math.round((engineTicks % TICK) / ticksPerStep)
                        const pitch = note.note - def.baseNote

                        mfCmd.addNote(track, beat, beatStep, pitch)
                        const addedNote = track.notes.at(-1)
                        if (addedNote) {
                            addedNote.velocity = midiVelocityToNormalized(note.velocity)
                        }
                        noteCount++
                    }
                    logger.debug('MidiImport', `pattern "${pattern.name}" track "${def.trackName}": ${noteCount} notes placed`)
                }
            }

            const newIdx = appState.patterns.length - 1
            await mfCmd.setSelectedPatternNum(newIdx)

            serviceRegistry.audioEngine?.invalidateCache()
            const msg = numPatterns > 1
                ? `MIDI imported: ${trackDefs.length} track(s) into ${numPatterns} patterns ("${baseName} 1/${numPatterns}" … "${baseName} ${numPatterns}/${numPatterns}")`
                : `MIDI imported: ${trackDefs.length} track(s) into "${baseName}"`
            showToast(msg, 'success')

        } catch (err) {
            logger.error('ToolsPanel', 'MIDI Import failed', err)
            logger.error('MidiImport', `failed: ${err.message}`)
            showToast('MIDI Import failed: ' + err.message, 'error')
        }
        e.target.value = ''
    }

    async _onImportDir(e) {
        const files = e.target.files
        if (!files || files.length === 0) return

        try {
            const wavFiles = Array.from(files).filter(f => /\.(wav|flac|mp3|aac)$/i.test(f.name))
            if (wavFiles.length === 0) {
                showToast('No audio files found in selected directory', 'warning')
                return
            }

            // Get drumkit name from directory path (webkitRelativePath = "dirname/file.wav")
            const firstPath = files[0].webkitRelativePath ?? ''
            const kitName = firstPath.split('/')[0] ?? 'imported'

            const im = new InstrumentsManager()
            const audioCtx = serviceRegistry.audioCtx
            const instruments = []
            let index = 0

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

            // Add/replace this drumkit only
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

            playbackEvents.dispatchDrumkitChange()

            showToast(`Imported ${wavFiles.length} WAV files as drumkit "${kitName}"`, 'success')

            this._autoAssignSounds()

            serviceRegistry.audioEngine?.invalidateCache()
            playbackEvents.dispatchPatternChange()

        } catch (err) {
            logger.error('ToolsPanel', 'Directory import failed', err)
            showToast('Import failed: ' + err.message, 'error')
        }
        e.target.value = ''
    }

    async _autoAssignSounds() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) {
            showToast('No pattern selected', 'warning')
            return
        }
        
        // Get the auto-assign service
        const { getAutoAssignService } = await import('../state/service_registry.js')
        const autoAssign = await getAutoAssignService()
        
        autoAssign.autoAssignSounds(pattern)
        showToast('Auto-assign complete', 'success')
    }
}
