import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { PatternExporter } from '../patterns/exporter.js'
import InstrumentsManager from '../logic/services/instruments_manager.js'
import Utils from '../core/utils.js'
import { isMidiSupported } from '../logic/midi/parser.js'
import { bindCloseButton, bindPanelToggles, hidePanelsById, injectUiCss, positionBelowPatternPanel } from './panel_helpers.js'
import { OrSlider } from './components/or_slider.js'

export default class ToolsPanel {
    constructor() {
        this.container = null
        this.nameInput = null
        this._wavLoops = null
        this.exportWavBtn = null
    }

    injectCSS() {
        injectUiCss()
    }

    init() {
        this.injectCSS()
        this.createDOM()
        this.subscribe()
    }

    createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'tools-panel'
        this.container.style.display = 'none'
        
        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Tools</span>
                <div class="ne-toggles">
                    <button class="ne-toggle active" data-toggle="pattern">Pattern</button>
                    <button class="ne-toggle active" data-toggle="export">Export</button>
                    <button class="ne-toggle active" data-toggle="import">Import</button>
                    <button class="ne-toggle active" data-toggle="midi">MIDI</button>
                </div>
                <button class="ne-close">&times;</button>
            </div>
            <div class="ne-body">
                <div class="ne-group">
                    <div class="ne-group-label">Pattern Settings</div>
                    <div class="ne-grid">
                        <div class="ne-row no-cursor">
                            <label>Name</label>
                            <input type="text" class="ne-input" id="tp-pattern-name" placeholder="Pattern Name">
                        </div>
                        <div class="ne-row">
                            <button class="ne-btn" id="tp-compact">Compact Tracks</button>
                        </div>
                    </div>
                </div>
                <div class="ne-group">
                    <div class="ne-group-label">Export</div>
                    <div class="ne-grid">
                        <div class="ne-row">
                            <button class="ne-btn" id="tp-export-json">Export JSON</button>
                        </div>
                        <div class="ne-row">
                            <button class="ne-btn" id="tp-export-midi">Export MIDI</button>
                        </div>
                        <div class="ne-row">
                            <button class="ne-btn" id="tp-export-wav">Export WAV</button>
                        </div>
                        <div id="tp-wav-loops-slot"></div>
                    </div>
                </div>
                <div class="ne-group">
                    <div class="ne-group-label">Import</div>
                    <div class="ne-grid">
                        <div class="ne-row">
                            <button class="ne-btn" id="tp-import-json">Import JSON</button>
                            <input type="file" id="tp-import-file" style="display: none" accept=".json">
                        </div>
                        <div class="ne-row">
                            <button class="ne-btn" id="tp-import-wav">Import WAV</button>
                            <input type="file" id="tp-import-wav-file" style="display: none" accept=".wav">
                        </div>
                    </div>
                </div>
                <div class="ne-group">
                    <div class="ne-group-label">MIDI</div>
                    <div class="ne-grid">
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
                        <div class="ne-row">
                            <label>Output:</label>
                            <select id="tp-midi-output-select"></select>
                        </div>
                        <div class="ne-row">
                            <button class="ne-btn" id="tp-midi-enable">Enable MIDI</button>
                        </div>
                        <div class="ne-row">
                            <button class="ne-btn" id="tp-midi-sync">Toggle Sync</button>
                        </div>
                    </div>
                </div>
            </div>
        `
        document.body.appendChild(this.container)
        
        this.nameInput = this.container.querySelector('#tp-pattern-name')
        this.nameInput.addEventListener('input', () => this._onNameChange())
        
        this.container.querySelector('#tp-compact').addEventListener('click', () => this._compactPattern())
        
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

        const importWavFile = this.container.querySelector('#tp-import-wav-file')
        this.container.querySelector('#tp-import-wav').addEventListener('click', () => importWavFile.click())
        importWavFile.addEventListener('change', (e) => this._onImportWavFile(e))

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
            this._sync()
        })

        this.container.querySelector('#tp-midi-sync').addEventListener('click', () => {
            if (serviceRegistry.midiManager) {
                serviceRegistry.midiManager.toggleExternalSync()
                this._sync()
            } else {
                alert('Enable MIDI first')
            }
        })

        const outputSelect = this.container.querySelector('#tp-midi-output-select')
        outputSelect.addEventListener('change', () => {
            if (serviceRegistry.midiManager) {
                serviceRegistry.midiManager.setSelectedOutput(outputSelect.value)
            }
        })

        bindCloseButton(this.container, () => this.hide())

        const groupMap = { pattern: 0, export: 1, import: 2, midi: 3 }
        bindPanelToggles(this.container, (key) => {
            const groups = this.container.querySelectorAll('.ne-body > .ne-group')
            return groups[groupMap[key]]
        })
    }

    subscribe() {
        playbackEvents.onToolsToggle.push((show) => {
            if (show) this.show()
            else this.hide()
        })
        
        playbackEvents.onPatternChange.push(() => {
            if (this.container && this.container.style.display !== 'none') {
                this._sync()
            }
        })

        // Hide if other selections happen
        playbackEvents.onTrackSelect.push((data) => {
            if (data) this.hide()
        })
        playbackEvents.onNoteSelect.push((data) => {
            if (data) this.hide()
        })
    }

    _sync() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (pattern && this.nameInput && document.activeElement !== this.nameInput) {
            this.nameInput.value = pattern.name || ''
        }

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
                    `<option value="${o.id}" ${o.id === currentOutputId ? 'selected' : ''}>${o.name || 'Unknown'}</option>`
                ).join('')
            } else {
                outputSelect.value = currentOutputId || ''
            }
        } else {
            // Default inactive state
            const support = isMidiSupported()
            this._setLedState('midiSupportLed', support, support ? 'Supported' : 'Unavailable')
            this._setLedState('midiReadyLed', false, 'Locked')
            this._setLedState('midiConnectedLed', false, 'None')
            this._setLedState('midiSyncLed', false, 'Internal')
            this._setLedState('midiActivityLed', false, 'Idle')
            outputSelect.innerHTML = '<option value="">MIDI Not Enabled</option>'
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

    _onNameChange() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (pattern) {
            pattern.name = this.nameInput.value
            // We only need to trigger pattern change to update other UI components (like Toolbar)
            playbackEvents.onPatternChange.forEach(fn => fn())
        }
    }

    _compactPattern() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern || !pattern.tracks) return

        let totalRemoved = 0
        Object.values(pattern.tracks).forEach(track => {
            const result = Utils.compacteTrackWithLoop(track)
            if (result.changed) {
                totalRemoved += result.removedNotes
            }
        })

        if (totalRemoved > 0 || true) {
            // Always refresh if button pressed to be sure
            serviceRegistry.audioEngine?.invalidateCache()
            playbackEvents.onPatternChange.forEach(fn => fn())
            console.log(`Compaction finished. Total redundant notes removed: ${totalRemoved}`)
        }
    }

    _exportJson() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const data = PatternExporter.export(pattern)
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ordrumbox-${pattern.name || 'pattern'}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    async _exportMidi() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const { default: MidiExporter } = await import('../logic/midi/midi_exporter.js')
        const exporter = new MidiExporter()
        const loops = Math.round(this._wavLoops.getValue())
        exporter.download(pattern, `ordrumbox-${pattern.name || 'pattern'}.mid`, { loops })
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
            serviceRegistry.mfWavExporter.downloadWav(blob, `ordrumbox-${pattern.name || 'pattern'}.wav`)
        } catch (e) {
            console.error('WAV Export failed', e)
            alert('WAV Export failed')
        } finally {
            this.exportWavBtn.disabled = false
            this.exportWavBtn.textContent = originalText
        }
    }

    _onImportFile(e) {
        const file = e.target.files[0]
        if (!file) return
        
        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result)
                const newPattern = serviceRegistry.mfCmd.importPatternFromJson(data)
                const newIdx = appState.patterns.indexOf(newPattern)
                if (newIdx !== -1) {
                    await serviceRegistry.mfCmd.setSelectedPatternNum(newIdx)
                    playbackEvents.onPatternChange.forEach(fn => fn())
                    this.hide()
                }
            } catch (err) {
                console.error('Import failed', err)
                alert('Import failed: ' + err.message)
            }
        }
        reader.readAsText(file)
        e.target.value = '' // Reset for next time
    }

    async _onImportWavFile(e) {
        const file = e.target.files[0]
        if (!file) return

        try {
            const audioCtx = serviceRegistry.audioCtx
            if (!audioCtx) {
                alert('Audio context not available')
                return
            }

            const arrayBuffer = await file.arrayBuffer()
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

            const pattern = appState.patterns[appState.selectedPatternNum]
            const tracks = Object.values(pattern?.tracks ?? {})
            const track = tracks[appState.selectedTrackNum]
            if (!track) {
                alert('No track selected')
                return
            }

            const im = new InstrumentsManager()
            const detectedInstrument = im.findInstrumentFromFileName(file.name)
            const instrumentType = detectedInstrument?.id && detectedInstrument.id !== 'NOT_FOUND' 
                ? detectedInstrument.id 
                : file.name.replace('.wav', '').toUpperCase()

            const url = `custom/${file.name}`
            const sound = {
                url: url,
                key: instrumentType,
                buffer: audioBuffer,
                duration: Math.floor(audioBuffer.duration * 1000),
                kit_name: soundRegistry.drumkitList[appState.selectedDrumkitNum]?.name ?? 'custom',
                display_name: file.name.replace('.wav', ''),
                isLoad: true,
                playStatus: false,
                index: Object.keys(soundRegistry.sounds).length + 1
            }

            soundRegistry.sounds[url] = sound

            const kit = soundRegistry.drumkitList[appState.selectedDrumkitNum]
            if (kit) {
                kit.instruments.push({
                    url: url,
                    key: sound.key,
                    display_name: sound.display_name,
                    instrument: instrumentType
                })
            }

            track.soundId = url
            track.useAutoAssignSound = false
            track.useSoftSynth = false
            track.name = instrumentType
            playbackEvents.onPatternChange.forEach(fn => fn())
            playbackEvents.onDrumkitChange.forEach(fn => fn())

            // Play the imported sound immediately
            if (serviceRegistry.audioEngine) {
                serviceRegistry.audioEngine.simpleBeep(appState.selectedTrackNum)
            }

            console.log('=== Kits & Instruments ===')
            soundRegistry.drumkitList.forEach(kit => {
                console.log(`Kit: ${kit.name}`)
                kit.instruments.forEach(inst => {
                    console.log(`  - ${inst.display_name ?? inst.key} | type: ${inst.key ?? 'N/A'} | url: ${inst.url}`)
                })
            })
            console.log('==========================')

            alert(`Sample "${file.name}" imported to kit "${kit?.name ?? 'N/A'}" as ${instrumentType} and assigned to track: ${track.name}`)
        } catch (err) {
            console.error('WAV Import failed', err)
            alert('WAV Import failed: ' + err.message)
        }
        e.target.value = ''
    }

    show() {
        hidePanelsById(['te-panel', 'ne-panel', 'output-panel', 'about-panel'])
        
        this.container.style.display = 'block'
        this._sync()
        this.reposition()
    }

    hide() {
        this.container.style.display = 'none'
    }

    reposition() {
        positionBelowPatternPanel(this.container)
    }
}
