import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import InstrumentsManager from '../logic/services/instruments_manager.js'
import drumkitService from '../logic/services/drumkit_service.js'
import { drawEnvelope } from '../audio/sample_analyzer.js'
import { hzToNote, formatNote } from '../core/hz_to_note.js'
import { showToast } from './toast.js'
import { downloadJson } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'
import { logger } from '../core/logger.js'

const TAG = 'DrumkitManager'

export default class DrumkitManager extends BasePanel {
    constructor() {
        super('dm-panel')
        this._selectedSoundKey = null
        this._listEl = null
        this._detailEl = null
    }

    createDOM() {
        super.createDOM()

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Drumkit Manager</span>
                <div class="dm-file-actions">
                    <button class="dm-icon-btn" id="dm-save-kit" title="Save current drumkit mapping">↓</button>
                    <button class="dm-icon-btn" id="dm-load-kit" title="Load drumkit mapping">↑</button>
                    <input type="file" id="dm-load-kit-file" style="display:none" accept="application/json,.json">
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
                <button class="ne-btn" id="dm-auto-detect" title="Auto-detect instruments for all tracks">Auto-detect all</button>
                <button class="ne-btn" id="dm-normalize-all" title="Normalize all samples to 0 dB peak">Normalize all</button>
                <input type="file" id="dm-add-file" style="display:none" accept=".wav,.flac,.mp3,.aac">
            </div>
        `

        this._listEl = this.container.querySelector('#dm-list')
        this._detailEl = this.container.querySelector('#dm-detail')

        this.container.querySelector('#dm-add-sample').addEventListener('click', () => {
            this.container.querySelector('#dm-add-file').click()
        })

        this.container.querySelector('#dm-add-file').addEventListener('change', (e) => {
            this._onAddSample(e)
        })

        this.container.querySelector('#dm-auto-detect').addEventListener('click', () => {
            this._onAutoDetectAll()
        })

        this.container.querySelector('#dm-normalize-all').addEventListener('click', () => {
            this._onNormalizeAll()
        })

        this.container.querySelector('#dm-save-kit').addEventListener('click', () => {
            this._saveCurrentKit()
        })
        this.container.querySelector('#dm-load-kit').addEventListener('click', () => {
            this.container.querySelector('#dm-load-kit-file').click()
        })
        this.container.querySelector('#dm-load-kit-file').addEventListener('change', (e) => {
            this._onLoadKitFile(e)
        })
    }

    subscribe() {
        playbackEvents.on("drumkitChange", () => { if (this.isVisible) this.sync() })
    }

    sync() {
        this._renderList()
        if (this._selectedSoundKey && !soundRegistry.sounds[this._selectedSoundKey]) {
            this._selectedSoundKey = null
        }
        if (this._selectedSoundKey) {
            this._renderDetail(this._selectedSoundKey)
        } else {
            this._detailEl.innerHTML = '<div class="dm-detail-empty">Select a sample from the list</div>'
        }
    }

    _saveCurrentKit() {
        const kit = drumkitService.exportCurrentKit()
        if (!kit) {
            showToast('No drumkit selected', 'warning')
            return
        }
        const safeName = kit.name.replaceAll(/[^a-z0-9_-]/gi, '_')
        downloadJson(kit, `ordrumbox-drumkit-${safeName}.json`)
        showToast(`Saved drumkit "${kit.name}"`, 'success')
    }

    async _onLoadKitFile(e) {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const data = JSON.parse(await file.text())
            const kitName = await drumkitService.restoreDrumkit(data)
            showToast(`Loaded drumkit "${kitName}"`, 'success')
            this._selectedSoundKey = null
            this.sync()
        } catch (err) {
            logger.warn(TAG, `Drumkit load failed: ${err.message}`)
            showToast('Invalid drumkit JSON', 'error')
        } finally {
            e.target.value = ''
        }
    }

    _renderList() {
        const sounds = drumkitService.getCurrentKitSounds()
        if (!sounds.length) {
            this._listEl.innerHTML = '<div class="dm-list-empty">No samples in this kit</div>'
            return
        }

        this._listEl.innerHTML = ''
        for (const s of sounds) {
            const item = document.createElement('div')
            item.className = 'dm-list-item' + (s.url === this._selectedSoundKey ? ' dm-selected' : '')
            item.dataset.key = s.url

            const playBtn = document.createElement('span')
            playBtn.className = 'dm-play-btn'
            playBtn.textContent = '\u25B6'
            playBtn.title = 'Audition'
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                this._audition(s.url)
            })

            const name = document.createElement('span')
            name.className = 'dm-list-name'
            name.textContent = `${s.display_name ?? s.url} [${s.kit_name}]`

            item.appendChild(playBtn)
            item.appendChild(name)
            item.addEventListener('click', () => this._selectSound(s.url))
            this._listEl.appendChild(item)
        }
    }

    _selectSound(key) {
        this._selectedSoundKey = key
        this._listEl.querySelectorAll('.dm-list-item').forEach(el => {
            el.classList.toggle('dm-selected', el.dataset.key === key)
        })
        this._renderDetail(key)
    }

    _renderDetail(key) {
        const sound = soundRegistry.sounds[key]
        if (!sound) {
            this._detailEl.innerHTML = '<div class="dm-detail-empty">Sample not found</div>'
            return
        }

        const analysis = drumkitService.getAnalysisInfo(sound)
        const im = new InstrumentsManager()
        const detected = im.findInstrumentFromFileName(sound.display_name ?? sound.url)
        const noteStr = analysis?.noteInfo ? formatNote(analysis.noteInfo) : '—'
        const peakDb = analysis?.peakDb != null ? analysis.peakDb.toFixed(1) : '—'
        const rmsDb = analysis?.rmsDb != null ? analysis.rmsDb.toFixed(1) : '—'
        const duration = analysis?.length != null ? (analysis.length * 1000).toFixed(0) + ' ms' : '—'

        const kitNames = soundRegistry.drumkitList.map(k => k.name)
        if (sound.kit_name && !kitNames.includes(sound.kit_name)) {
            kitNames.unshift(sound.kit_name)
        }
        const kitOptions = kitNames
            .map(name => `<option value="${name}" ${name === sound.kit_name ? 'selected' : ''}>${name}</option>`)
            .join('')

        const instOptions = InstrumentsManager.DATA?.instruments
            ?.map(i => `<option value="${i.id}" ${i.id === sound.key ? 'selected' : ''}>${i.id}</option>`)
            .join('') ?? ''

        const gainDb = sound.gainDb ?? 0
        const tune = sound.tune ?? 0
        const decayStr = sound.decay != null ? sound.decay + ' ms' : '—'
        const tooltipText = `${detected.id !== 'NOT_FOUND' ? 'Detected: ' + detected.id : 'No instrument detected'}\nPeak: ${peakDb} dB\nRMS: ${rmsDb} dB\nDuration: ${duration}\nDecay: ${decayStr}`

        this._detailEl.innerHTML = `
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
                        Peak: ${peakDb} dB | RMS: ${rmsDb} dB | ${duration} | Decay: ${decayStr}
                    </div>
                    <div class="dm-detail-actions">
                        <button class="ne-btn" id="dm-replace" title="Replace this sample with a WAV file">Replace</button>
                        <button class="ne-btn dm-danger" id="dm-remove" title="Remove this sample from the kit">Remove</button>
                        <input type="file" id="dm-replace-file" style="display:none" accept=".wav,.flac,.mp3,.aac">
                    </div>
                </div>
                <div class="dm-detail-right">
                    <div class="dm-detail-row">
                        <label>Kit:</label>
                        <select id="dm-kit-select" class="ne-input">${kitOptions}</select>
                    </div>
                    <div class="dm-detail-row" title="${this.esc(tooltipText)}">
                        <label>Instrument:</label>
                        <select id="dm-inst-select" class="ne-input">${instOptions}</select>
                    </div>
                    <div class="dm-detail-row">
                        <label>Gain:</label>
                        <span class="ne-val" id="dm-gain-val">${Number(gainDb).toFixed(1)} dB</span>
                        <input type="range" id="dm-gain" class="ne-slider" min="-24" max="6" step="0.1" value="${gainDb}">
                    </div>
                    <div class="dm-detail-row">
                        <label>Tune:</label>
                        <span class="ne-val" id="dm-tune-val">${noteStr}</span>
                        <input type="range" id="dm-tune" class="ne-slider" min="-12" max="12" step="0.1" value="${tune}">
                    </div>
                    <div class="dm-detail-row">
                        <label>Decay:</label>
                        <span class="ne-val" id="dm-decay-val">${decayStr}</span>
                        <input type="range" id="dm-decay" class="ne-slider" min="0" max="5000" step="10" value="${sound.decay ?? 0}">
                    </div>
                </div>
            </div>
        `

        if (analysis?.envelope) {
            const canvas = this._detailEl.querySelector('#dm-waveform')
            const ctx = canvas?.getContext('2d')
            if (ctx) {
                requestAnimationFrame(() => {
                    const w = (canvas.clientWidth && canvas.clientWidth > 0) ? canvas.clientWidth : 300
                    const h = (canvas.clientHeight && canvas.clientHeight > 0) ? canvas.clientHeight : 80
                    canvas.width = w
                    canvas.height = h
                    drawEnvelope(ctx, analysis.envelope, w, h)
                })
            }
        }

        this._detailEl.querySelector('#dm-detail-play')?.addEventListener('click', () => {
            this._audition(sound.url)
        })

        this._detailEl.querySelector('#dm-kit-select')?.addEventListener('change', (e) => {
            const displayName = drumkitService.moveToKit(key, e.target.value)
            if (displayName) showToast(`Moved "${displayName}" to kit "${e.target.value}"`, 'success')
            this.sync()
        })

        this._detailEl.querySelector('#dm-inst-select')?.addEventListener('change', (e) => {
            const displayName = drumkitService.setInstrument(key, e.target.value)
            if (displayName) showToast(`Set "${displayName}" to instrument "${e.target.value}"`, 'success')
            this.sync()
        })

        this._detailEl.querySelector('#dm-gain')?.addEventListener('input', (e) => {
            sound.gainDb = Number(e.target.value)
            this._detailEl.querySelector('#dm-gain-val').textContent = `${sound.gainDb.toFixed(1)} dB`
        })

        this._detailEl.querySelector('#dm-tune')?.addEventListener('input', (e) => {
            sound.tune = Number(e.target.value)
            const baseHz = analysis?.fundamentalHz ?? 440
            const tunedHz = baseHz * Math.pow(2, sound.tune / 12)
            this._detailEl.querySelector('#dm-tune-val').textContent = formatNote(hzToNote(tunedHz))
        })

        this._detailEl.querySelector('#dm-decay')?.addEventListener('input', (e) => {
            sound.decay = Number(e.target.value)
            this._detailEl.querySelector('#dm-decay-val').textContent = `${sound.decay} ms`
        })

        for (const controlId of ['dm-gain', 'dm-tune', 'dm-decay']) {
            this._detailEl.querySelector(`#${controlId}`)?.addEventListener('change', () => {
                playbackEvents.emit("drumkitChange")
            })
        }

        this._detailEl.querySelector('#dm-replace')?.addEventListener('click', () => {
            this._detailEl.querySelector('#dm-replace-file').click()
        })

        this._detailEl.querySelector('#dm-replace-file')?.addEventListener('change', (e) => {
            this._onReplaceSample(key, e)
        })

        this._detailEl.querySelector('#dm-remove')?.addEventListener('click', () => {
            this._removeSample(key)
        })
    }

    _audition(url) {
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

    _removeSample(soundKey) {
        const displayName = drumkitService.removeSample(soundKey)
        if (displayName) {
            this._selectedSoundKey = null
            showToast(`Removed "${displayName}"`, 'success')
            this.sync()
        }
    }

    async _onReplaceSample(soundKey, e) {
        const file = e.target.files?.[0]
        if (!file) return

        const ctx = serviceRegistry.audioCtx
        if (!ctx) return

        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            await drumkitService.replaceSampleBuffer(soundKey, buffer, file.name)
            showToast(`Replaced with "${file.name}"`, 'success')
            this.sync()
        } catch (err) {
            logger.warn(TAG, `Replace failed: ${err.message}`)
            showToast('Failed to decode WAV: ' + err.message, 'error')
        }
        e.target.value = ''
    }

    async _onAddSample(e) {
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

    async _onAutoDetectAll() {
        const ok = await drumkitService.autoDetectAll()
        if (ok) showToast('Auto-detect complete', 'success')
        else showToast('No pattern selected', 'warning')
    }

    _onNormalizeAll() {
        const count = drumkitService.normalizeAll()
        if (count > 0) {
            showToast(`Normalized ${count} sample(s)`, 'success')
            this.sync()
        } else {
            showToast('No samples to normalize', 'warning')
        }
    }
}
