import { playbackEvents } from '../state/event_bus.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import InstrumentsManager, { instrumentsManager } from '../logic/services/instruments_manager/index.js'
import drumkitService from '../logic/services/drumkit_service.js'
import { drawDecayMarker, drawEnvelope } from '../audio/sample_analyzer.js'
import { formatNote } from '../core/hz_to_note.js'
import { NOT_FOUND } from '../core/constants.js'
import { showToast } from '../core/notify.js'
import { downloadJson, renderOptions, knobFormat } from './components/ui_utils.js'
import { escapeHtml } from './components/ui_utils.js'
import { syncKnobs } from './components/sync_helpers.js'
import { sampleWaveformTheme } from './theme.js'
import BasePanel from './base_panel.js'
import { logger } from '../core/logger.js'
import AudioImportService from '../logic/services/audio_import_service.js'
import { EVENTS } from '../core/events.js'

const TAG = 'DrumkitManager'

// Gain/Tune/Decay knobs for the selected sample. Decay intentionally mirrors
// the range/step of track_editor's KNOB_PROPS decay entry so both panels
// commit the same values through the same widget.
const SOUND_KNOB_DEFS = [
    { key: 'gain', label: 'Gain', min: -24, max: 6, step: 0.1, unit: 'dB', format: (v) => v.toFixed(1) },
    {
        key: 'tune',
        label: 'Tune',
        min: -12,
        max: 12,
        step: 0.1,
        unit: 'st',
        format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
    },
    {
        key: 'decay',
        label: 'Decay',
        min: 20,
        max: 5000,
        step: 10,
        scale: 'log',
        unit: '',
        format: knobFormat({ key: 'decay' }),
    },
]

export default class DrumkitManager extends BasePanel {
    #selectedSoundKey
    #knobs
    #listEl
    #detailEl
    #audioImportService
    #drumkitChangeDebounce

    get knobs() {
        return this.#knobs
    }
    get selectedSoundKey() {
        return this.#selectedSoundKey
    }
    set selectedSoundKey(v) {
        this.#selectedSoundKey = v
    }

    onKnobChange(sound, key, value) {
        this.#onKnobChange(sound, key, value)
    }
    selectSound(key) {
        this.#selectSound(key)
    }

    constructor() {
        super('dm-panel')
        this.#selectedSoundKey = null
        this.#listEl = null
        this.#detailEl = null
        this.#knobs = []
        this.#drumkitChangeDebounce = null
        this.#audioImportService = new AudioImportService()
    }

    createDOM() {
        super.createDOM()

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Drumkit Manager</span>
                <div class="dm-file-actions">
                    <button class="dm-icon-btn" id="dm-save-kit" title="Export drumkit mapping">↓</button>
                    <button class="dm-icon-btn" id="dm-load-kit" title="Import drumkit mapping">↑</button>
                    <input type="file" id="dm-load-kit-file" class="hidden-file-input" accept="application/json,.json">
                </div>
            </div>
            <div class="dm-body">
                <div class="dm-list" id="dm-list"></div>
                <div class="dm-detail" id="dm-detail">
                    <div class="dm-detail-empty">Select a sample from the list</div>
                </div>
            </div>
            <div class="dm-actions">
                <button class="ne-btn" id="dm-add-sample" title="Add a WAV file to the current kit">Add sample</button>
                <button class="ne-btn" id="dm-import-dir" title="Import a folder of WAV files as a new drumkit (auto-matched to instruments)">Import Directory</button>
                <button class="ne-btn" id="dm-auto-detect" title="Auto-detect instruments for all tracks">Auto-detect all</button>
                <button class="ne-btn" id="dm-normalize-all" title="Normalize all samples to 0 dB peak">Normalize all</button>
                <input type="file" id="dm-add-file" class="hidden-file-input" accept=".wav,.flac,.mp3,.aac">
                <input type="file" id="dm-import-dir-file" class="hidden-file-input" accept=".wav,.flac" webkitdirectory directory multiple>
            </div>
        `

        this.#listEl = this.container.querySelector('#dm-list')
        this.#detailEl = this.container.querySelector('#dm-detail')

        this.listen(this.container.querySelector('#dm-add-sample'), 'click', () => {
            ;/** @type {HTMLElement} */ (this.container.querySelector('#dm-add-file')).click()
        })

        this.listen(this.container.querySelector('#dm-add-file'), 'change', (e) => {
            this.#onAddSample(e)
        })

        this.listen(this.container.querySelector('#dm-auto-detect'), 'click', () => {
            this.#onAutoDetectAll()
        })

        this.listen(this.container.querySelector('#dm-normalize-all'), 'click', () => {
            this.#onNormalizeAll()
        })

        this.listen(this.container.querySelector('#dm-import-dir'), 'click', () => {
            ;/** @type {HTMLElement} */ (this.container.querySelector('#dm-import-dir-file')).click()
        })
        this.listen(this.container.querySelector('#dm-import-dir-file'), 'change', (e) => {
            this.#onImportDir(e)
        })

        this.listen(this.container.querySelector('#dm-save-kit'), 'click', () => {
            this.#saveCurrentKit()
        })
        this.listen(this.container.querySelector('#dm-load-kit'), 'click', () => {
            ;/** @type {HTMLElement} */ (this.container.querySelector('#dm-load-kit-file')).click()
        })
        this.listen(this.container.querySelector('#dm-load-kit-file'), 'change', (e) => {
            this.#onLoadKitFile(e)
        })
    }

    subscribe() {
        this.sub(playbackEvents, EVENTS.DRUMKIT_CHANGE, () => {
            if (this.isVisible) this.sync()
        })
    }

    onDestroy() {
        clearTimeout(this.#drumkitChangeDebounce)
    }

    sync() {
        if (this.#selectedSoundKey && !soundRegistry.sounds[this.#selectedSoundKey]) {
            this.#selectedSoundKey = null
        }
        if (!this.#selectedSoundKey) {
            const sounds = drumkitService.getCurrentKitSounds()
            if (sounds.length) {
                this.#selectedSoundKey = sounds[0].url
            }
        }
        this.#renderList()
        if (this.#selectedSoundKey) {
            this.#renderDetail(this.#selectedSoundKey)
        } else {
            this.#detailEl.innerHTML = '<div class="dm-detail-empty">Select a sample from the list</div>'
        }
    }

    #saveCurrentKit() {
        const kit = drumkitService.exportCurrentKit()
        if (!kit) {
            showToast('No drumkit selected', 'warning')
            return
        }
        const safeName = kit.name.replaceAll(/[^a-z0-9_-]/gi, '_')
        downloadJson(kit, `ordrumbox-drumkit-${safeName}.json`)
        showToast(`Saved drumkit "${kit.name}"`, 'success')
    }

    async #onLoadKitFile(e) {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const data = JSON.parse(await file.text())
            const kitName = await drumkitService.restoreDrumkit(data)
            showToast(`Loaded drumkit "${kitName}"`, 'success')
            this.#selectedSoundKey = null
            this.sync()
        } catch (err) {
            logger.warn(TAG, `Drumkit load failed: ${err.message}`)
            showToast('Invalid drumkit JSON', 'error')
        } finally {
            e.target.value = ''
        }
    }

    async #onImportDir(e) {
        const files = e.target.files
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
                this.#selectedSoundKey = null
                this.sync()
            }
        } catch (err) {
            logger.error(TAG, 'Directory import failed', err)
            showToast('Import failed: ' + err.message, 'error')
        }
        e.target.value = ''
    }

    #renderList() {
        const sounds = drumkitService.getCurrentKitSounds()
        if (!sounds.length) {
            this.#listEl.innerHTML = '<div class="dm-list-empty">No samples in this kit</div>'
            return
        }

        this.#listEl.innerHTML = ''
        for (const s of sounds) {
            const item = document.createElement('div')
            item.className = 'dm-list-item' + (s.url === this.#selectedSoundKey ? ' dm-selected' : '')
            item.dataset.key = s.url

            const name = document.createElement('span')
            name.className = 'dm-list-name'
            name.textContent = `${s.display_name ?? s.url} [${s.kitName}]`

            item.appendChild(name)
            this.listen(item, 'click', () => this.#selectSound(s.url))
            this.#listEl.appendChild(item)
        }
    }

    #selectSound(key) {
        this.#selectedSoundKey = key
        this.#listEl.querySelectorAll('.dm-list-item').forEach((el) => {
            el.classList.toggle('dm-selected', el.dataset.key === key)
        })
        this.#renderDetail(key)
    }

    #renderDetail(key) {
        const sound = soundRegistry.sounds[key]
        if (!sound) {
            this.#detailEl.innerHTML = '<div class="dm-detail-empty">Sample not found</div>'
            return
        }

        const analysis = drumkitService.getAnalysisInfo(sound)
        const detected = instrumentsManager.findInstrumentFromFileName(sound.display_name ?? sound.url)
        const noteStr = analysis?.noteInfo ? formatNote(analysis.noteInfo) : '—'
        const peakDb = analysis?.peakDb != null ? analysis.peakDb.toFixed(1) : '—'
        const rmsDb = analysis?.rmsDb != null ? analysis.rmsDb.toFixed(1) : '—'
        const duration = analysis?.durationSec != null ? (analysis.durationSec * 1000).toFixed(0) + ' ms' : '—'
        const decayStr = sound.decay != null ? sound.decay + ' ms' : '—'
        const tooltipText = `${detected.id !== NOT_FOUND ? 'Detected: ' + detected.id : 'No instrument detected'}\nPeak: ${peakDb} dB\nRMS: ${rmsDb} dB\nDuration: ${duration}\nDecay: ${decayStr}`

        const kitNames = soundRegistry.drumkitList.map((k) => k.name)
        if (sound.kitName && !kitNames.includes(sound.kitName)) {
            kitNames.unshift(sound.kitName)
        }
        const kitOptions = renderOptions(kitNames, sound.kitName, { escape: escapeHtml })

        const instOptions = InstrumentsManager.DATA?.instruments
            ? renderOptions(
                  InstrumentsManager.DATA.instruments.map((i) => i.id),
                  sound.key,
                  { escape: escapeHtml },
              )
            : ''

        this.#detailEl.innerHTML = `
            <div class="dm-detail-header">
                <button class="dm-play-btn dm-play-large" id="dm-detail-play" title="Audition">\u25B6</button>
                <span class="dm-detail-filename">${this.esc(sound.display_name ?? sound.url)}</span>
            </div>
            <div class="dm-detail-columns">
                <div class="dm-detail-left">
                    <div class="dm-waveform-container">
                        <canvas id="dm-waveform" class="dm-waveform" width="300" height="80"></canvas>
                    </div>
                    <div class="dm-detail-info">
                        ${noteStr} · ${duration} · ${peakDb} dB peak · ${rmsDb} dB RMS
                    </div>
                    <div class="dm-detail-actions">
                        <button class="ne-btn" id="dm-replace" title="Replace this sample with a WAV file">Replace</button>
                        <button class="ne-btn dm-danger" id="dm-remove" title="Remove this sample from the kit">Remove</button>
                        <input type="file" id="dm-replace-file" class="hidden-file-input" accept=".wav,.flac,.mp3,.aac">
                    </div>
                </div>
                <div class="dm-detail-right">
                    <div class="dm-select-row">
                        <div class="ne-row no-cursor">
                            <label>Kit:</label>
                            <select id="dm-kit-select">${kitOptions}</select>
                        </div>
                        <div class="ne-row no-cursor" title="${this.esc(tooltipText)}">
                            <label>Instrument:</label>
                            <select id="dm-inst-select">${instOptions}</select>
                        </div>
                    </div>
                    <div class="or-knob-bar">
                        <div data-or-knob="gain"></div>
                        <div data-or-knob="tune"></div>
                        <div data-or-knob="decay"></div>
                    </div>
                </div>
            </div>
        `

        this.#syncKnobs(sound)
        this.#drawWaveform(sound, analysis, { resize: true })

        this.listen(this.#detailEl.querySelector('#dm-detail-play'), 'click', () => {
            this.#audition(sound.url)
        })

        this.listen(this.#detailEl.querySelector('#dm-kit-select'), 'change', (e) => {
            const displayName = drumkitService.moveToKit(key, /** @type {HTMLInputElement} */ (e.target).value)
            if (displayName)
                showToast(
                    `Moved "${displayName}" to kit "${/** @type {HTMLInputElement} */ (e.target).value}"`,
                    'success',
                )
            this.sync()
        })

        this.listen(this.#detailEl.querySelector('#dm-inst-select'), 'change', (e) => {
            const displayName = drumkitService.setInstrument(key, /** @type {HTMLInputElement} */ (e.target).value)
            if (displayName)
                showToast(
                    `Set "${displayName}" to instrument "${/** @type {HTMLInputElement} */ (e.target).value}"`,
                    'success',
                )
            this.sync()
        })

        this.listen(this.#detailEl.querySelector('#dm-replace'), 'click', () => {
            this.#detailEl.querySelector('#dm-replace-file').click()
        })

        this.listen(this.#detailEl.querySelector('#dm-replace-file'), 'change', (e) => {
            this.#onReplaceSample(key, e)
        })

        this.listen(this.#detailEl.querySelector('#dm-remove'), 'click', () => {
            this.#removeSample(key)
        })
    }

    // ── Gain / Tune / Decay knobs ─────────────────────────────────────
    // Same OrKnob widget and keep-alive pattern as track_editor's knob bar
    // (see track_editor.js #syncKnobs / sync_helpers.js), so this panel
    // looks and behaves like the rest of the app instead of raw <input
    // type="range"> sliders.

    #syncKnobs(sound) {
        const values = { gain: sound.gainDb ?? 0, tune: sound.tune ?? 0, decay: sound.decay ?? 0 }
        this.#knobs = [
            ...syncKnobs({
                container: this.#detailEl,
                configs: SOUND_KNOB_DEFS.map((def) => ({
                    ...def,
                    val: values[def.key],
                    onChange: (v) => this.#onKnobChange(sound, def.key, v),
                })),
                prev: new Map(this.#knobs.map((k) => [k.key, k])),
            }).values(),
        ]
    }

    #onKnobChange(sound, key, value) {
        if (key === 'gain') sound.gainDb = value
        else if (key === 'tune') sound.tune = value
        else if (key === 'decay') {
            sound.decay = value
            this.#drawWaveform(sound, drumkitService.getAnalysisInfo(sound))
        }
        // Debounced: dragging a knob fires onChange continuously, and a full
        // resync (list + detail rebuild) on every tick would fight the drag.
        // The knob already reflects the live value; other panels/persistence
        // catch up once the drag settles.
        clearTimeout(this.#drumkitChangeDebounce)
        this.#drumkitChangeDebounce = setTimeout(() => playbackEvents.emit(EVENTS.DRUMKIT_CHANGE), 200)
    }

    // ── Waveform ───────────────────────────────────────────────────────
    // Mirrors track_editor's #drawSampleWaveform(): same envelope colors and
    // the same decay-cutoff marker line, so a sample looks the same whether
    // it's being tuned from a track or from the drumkit manager.

    #drawWaveform(sound, analysis, { resize = false } = {}) {
        const canvas = this.#detailEl.querySelector('#dm-waveform')
        if (!canvas || !analysis?.envelope?.length) return

        const draw = () => {
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            const dpr = window.devicePixelRatio || 1
            const theme = sampleWaveformTheme(2 * dpr)
            drawEnvelope(ctx, analysis.envelope, canvas.width, canvas.height, theme)

            drawDecayMarker(ctx, sound, canvas.width, canvas.height, theme, dpr)
        }

        if (resize) {
            requestAnimationFrame(() => {
                const dpr = window.devicePixelRatio || 1
                const w = canvas.clientWidth && canvas.clientWidth > 0 ? Math.round(canvas.clientWidth * dpr) : 300
                const h = canvas.clientHeight && canvas.clientHeight > 0 ? Math.round(canvas.clientHeight * dpr) : 80
                canvas.width = w
                canvas.height = h
                draw()
            })
        } else {
            draw()
        }
    }

    #audition(url) {
        const ctx = serviceRegistry.audioCtx
        if (!ctx) return
        const sound = soundRegistry.sounds[url]
        if (!sound?.buffer) return

        const source = ctx.createBufferSource()
        const gain = ctx.createGain()
        source.buffer = sound.buffer
        source.detune.value = (sound.tune ?? 0) * 100
        gain.gain.value = Math.pow(10, (sound.gainDb ?? 0) / 20)
        source.connect(gain)
        gain.connect(ctx.destination)
        source.start()
    }

    #removeSample(soundKey) {
        const displayName = drumkitService.removeSample(soundKey)
        if (displayName) {
            this.#selectedSoundKey = null
            showToast(`Removed "${displayName}"`, 'success')
            this.sync()
        }
    }

    async #onReplaceSample(soundKey, e) {
        const file = e.target.files?.[0]
        if (!file) return

        const ctx = serviceRegistry.audioCtx
        if (!ctx) return

        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            const replaced = await drumkitService.replaceSampleBuffer(soundKey, buffer, file.name)
            if (!replaced) {
                showToast(`Sample "${soundKey}" is no longer in the kit`, 'warning')
            } else {
                showToast(`Replaced with "${file.name}"`, 'success')
            }
            this.sync()
        } catch (err) {
            logger.warn(TAG, `Replace failed: ${err.message}`)
            showToast('Failed to decode WAV: ' + err.message, 'error')
        }
        e.target.value = ''
    }

    async #onAddSample(e) {
        const file = e.target.files?.[0]
        if (!file) return

        const ctx = serviceRegistry.audioCtx
        if (!ctx) return

        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            const { fileName, kitName } = await drumkitService.addSample(file, buffer)
            showToast(`Added "${fileName}" to kit "${kitName}"`, 'success')
            this.sync()
        } catch (err) {
            logger.warn(TAG, `Add sample failed: ${err.message}`)
            showToast('Failed to decode WAV: ' + err.message, 'error')
        }
        e.target.value = ''
    }

    async #onAutoDetectAll() {
        const ok = await drumkitService.autoDetectAll()
        if (ok) showToast('Auto-detect complete', 'success')
        else showToast('No pattern selected', 'warning')
    }

    #onNormalizeAll() {
        const count = drumkitService.normalizeAll()
        if (count > 0) {
            showToast(`Normalized ${count} sample(s)`, 'success')
            this.sync()
        } else {
            showToast('No samples to normalize', 'warning')
        }
    }
}
