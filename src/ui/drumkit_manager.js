import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import InstrumentsManager from '../logic/services/instruments_manager.js'
import { analyzeSample, clearAnalysisCache, drawEnvelope } from '../audio/sample_analyzer.js'
import { hzToNote, formatNote } from '../core/hz_to_note.js'
import { showToast } from './toast.js'
import { bindCloseButton, downloadJson } from './components/panel_helpers.js'
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
                <button class="ne-close">&times;</button>
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

        bindCloseButton(this.container, () => this.hide())

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
        playbackEvents.onDrumkitManagerToggle.push((show) => {
            if (show) this.show(); else this.hide()
        })
        playbackEvents.onDrumkitChange.push(() => { if (this.isVisible) this.sync() })
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

    _getCurrentKitSounds() {
        return Object.entries(soundRegistry.sounds)
            .map(([url, s]) => ({ url, instrumentKey: s.key, ...s }))
    }

    _currentKitName() {
        return soundRegistry.drumkitList[appState.selectedDrumkitNum]?.name ?? null
    }

    _exportCurrentKit() {
        const name = this._currentKitName()
        if (!name) return null

        const instruments = Object.values(soundRegistry.sounds)
            .filter(sound => sound.kit_name === name)
            .map(sound => ({
                url: sound.url,
                display_name: sound.display_name,
                key: sound.key,
                rootMidi: sound.rootMidi ?? null,
                peakDb: sound.peakDb ?? null,
                decay: sound.decay ?? null,
                gainDb: sound.gainDb ?? 0,
                tune: sound.tune ?? 0,
            }))

        return { version: 1, name, instruments }
    }

    _saveCurrentKit() {
        const kit = this._exportCurrentKit()
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
            await this._restoreDrumkit(data)
        } catch (err) {
            logger.warn(TAG, `Drumkit load failed: ${err.message}`)
            showToast('Invalid drumkit JSON', 'error')
        } finally {
            e.target.value = ''
        }
    }

    /** Restore a drumkit mapping and the editable per-sample settings. */
    async _restoreDrumkit(data) {
        if (!data || typeof data.name !== 'string' || !Array.isArray(data.instruments)) {
            throw new Error('Missing drumkit name or instruments')
        }

        const instruments = data.instruments
            .filter(sample => typeof sample?.url === 'string' && typeof sample?.key === 'string')
            .map(sample => ({
                url: sample.url,
                display_name: sample.display_name ?? sample.url,
                key: sample.key,
                rootMidi: sample.rootMidi ?? null,
                peakDb: sample.peakDb ?? null,
                decay: sample.decay ?? null,
                gainDb: sample.gainDb ?? 0,
                tune: sample.tune ?? 0,
            }))
        if (!instruments.length) throw new Error('No valid instruments')

        const kit = { name: data.name, instruments: structuredClone(instruments) }
        const existingIndex = soundRegistry.drumkitList.findIndex(entry => entry.name === kit.name)
        if (existingIndex === -1) soundRegistry.drumkitList.push(kit)
        else soundRegistry.drumkitList.splice(existingIndex, 1, kit)
        soundRegistry.drumkits[kit.name] = { name: kit.name, instruments: structuredClone(instruments) }

        for (const sample of instruments) {
            const sound = soundRegistry.sounds[sample.url]
            if (!sound) continue
            Object.assign(sound, sample, { kit_name: kit.name })
        }

        const kitIndex = soundRegistry.drumkitList.findIndex(entry => entry.name === kit.name)
        appState.selectedDrumkitNum = kitIndex
        appState.selectedDrumkit = kit.name
        try {
            await serviceRegistry.mfResourcesLoader?.loadMissingSamplesFromDrumkits([kit])
            await serviceRegistry.mfCmd?.autoAssignSoundsForNewDrumkit?.()
        } catch (err) {
            logger.warn(TAG, `Some samples could not be loaded for "${kit.name}": ${err.message}`)
            showToast(`Loaded mapping for "${kit.name}"; some samples are unavailable`, 'warning')
        }

        playbackEvents.dispatchDrumkitChange()
        this._selectedSoundKey = null
        this.sync()
        showToast(`Loaded drumkit "${kit.name}"`, 'success')
    }

    _renderList() {
        const sounds = this._getCurrentKitSounds()
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

        const analysis = sound.buffer ? analyzeSample(sound.buffer) : null
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
            this._moveToKit(key, e.target.value)
        })

        this._detailEl.querySelector('#dm-inst-select')?.addEventListener('change', (e) => {
            this._setInstrument(key, e.target.value)
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
                playbackEvents.dispatchDrumkitChange()
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

    _moveToKit(soundKey, newKitName) {
        const sound = soundRegistry.sounds[soundKey]
        if (!sound) return
        const oldKitName = sound.kit_name

        if (oldKitName === newKitName) return

        sound.kit_name = newKitName

        const oldKit = soundRegistry.drumkits[oldKitName]
        if (oldKit?.instruments) {
            oldKit.instruments = oldKit.instruments.filter(i => i.url !== soundKey)
        }
        const oldListEntry = soundRegistry.drumkitList.find(d => d.name === oldKitName)
        if (oldListEntry?.instruments) {
            oldListEntry.instruments = oldListEntry.instruments.filter(i => i.url !== soundKey)
        }

        let newKit = soundRegistry.drumkits[newKitName]
        if (!newKit) {
            newKit = { instruments: [] }
            soundRegistry.drumkits[newKitName] = newKit
        }
        const instEntry = { display_name: sound.display_name, key: sound.key, url: soundKey }
        newKit.instruments.push(instEntry)

        let newListEntry = soundRegistry.drumkitList.find(d => d.name === newKitName)
        if (!newListEntry) {
            newListEntry = { name: newKitName, instruments: [] }
            soundRegistry.drumkitList.push(newListEntry)
        }
        newListEntry.instruments.push(instEntry)

        showToast(`Moved "${sound.display_name}" to kit "${newKitName}"`, 'success')
        playbackEvents.dispatchDrumkitChange()
        this.sync()
    }

    /**
     * Persist a manually chosen instrument in every representation of a sample.
     * Auto-assign resolves samples from `soundRegistry.sounds`, while kit lists
     * are used by the rest of the UI and loaders; they must remain in sync.
     */
    _setInstrument(soundKey, instrumentKey) {
        const sound = soundRegistry.sounds[soundKey]
        if (!sound || !instrumentKey || sound.key === instrumentKey) return

        sound.key = instrumentKey
        const kitName = sound.kit_name
        const updateInstrumentEntry = (kit) => {
            kit?.instruments?.forEach(entry => {
                if (entry.url === soundKey) entry.key = instrumentKey
            })
        }

        updateInstrumentEntry(soundRegistry.drumkits[kitName])
        updateInstrumentEntry(soundRegistry.drumkitList.find(kit => kit.name === kitName))

        showToast(`Set "${sound.display_name}" to instrument "${instrumentKey}"`, 'success')
        playbackEvents.dispatchDrumkitChange()
        this.sync()
    }

    _removeSample(soundKey) {
        const sound = soundRegistry.sounds[soundKey]
        if (!sound) return

        const kitName = sound.kit_name
        delete soundRegistry.sounds[soundKey]

        const kit = soundRegistry.drumkits[kitName]
        if (kit?.instruments) {
            kit.instruments = kit.instruments.filter(i => i.url !== soundKey)
        }
        const listEntry = soundRegistry.drumkitList.find(d => d.name === kitName)
        if (listEntry?.instruments) {
            listEntry.instruments = listEntry.instruments.filter(i => i.url !== soundKey)
        }

        this._selectedSoundKey = null
        showToast(`Removed "${sound.display_name}"`, 'success')
        playbackEvents.dispatchDrumkitChange()
        this.sync()
    }

    async _onReplaceSample(soundKey, e) {
        const file = e.target.files?.[0]
        if (!file) return

        const ctx = serviceRegistry.audioCtx
        if (!ctx) return

        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            const oldSound = soundRegistry.sounds[soundKey]
            if (!oldSound) return

            clearAnalysisCache(oldSound.buffer)
            oldSound.buffer = buffer
            oldSound.display_name = file.name
            oldSound.duration = Math.floor(buffer.duration * 1000)

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
            const fileName = file.name
            const im = new InstrumentsManager()
            const instrument = im.findInstrumentFromFileName(fileName)
            const key = instrument.id
            const kitName = soundRegistry.drumkitList[appState.selectedDrumkitNum]?.name ?? 'imported'

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

            const kit = soundRegistry.drumkits[kitName] ?? { instruments: [] }
            kit.instruments.push({ display_name: fileName, key, url: fileName })
            soundRegistry.drumkits[kitName] = kit

            const listEntry = soundRegistry.drumkitList.find(d => d.name === kitName)
            if (listEntry) {
                listEntry.instruments.push({ display_name: fileName, key, url: fileName })
            }

            showToast(`Added "${fileName}" to kit "${kitName}"`, 'success')
            playbackEvents.dispatchDrumkitChange()
            this.sync()
        } catch (err) {
            logger.warn(TAG, `Add sample failed: ${err.message}`)
            showToast('Failed to decode WAV: ' + err.message, 'error')
        }
        e.target.value = ''
    }

    async _onAutoDetectAll() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) {
            showToast('No pattern selected', 'warning')
            return
        }
        const { getAutoAssignService } = await import('../state/service_registry.js')
        const autoAssign = await getAutoAssignService()
        autoAssign.autoAssignSounds(pattern)
        showToast('Auto-detect complete', 'success')
    }

    _onNormalizeAll() {
        const sounds = this._getCurrentKitSounds()
        let count = 0
        for (const s of sounds) {
            if (!s.buffer) continue
            const analysis = analyzeSample(s.buffer)
            if (!analysis?.peakLinear || analysis.peakLinear <= 0) continue

            const gainDb = -analysis.peakDb
            const gainLinear = Math.pow(10, gainDb / 20)

            const ctx = serviceRegistry.audioCtx
            if (!ctx) continue

            const newBuffer = ctx.createBuffer(
                s.buffer.numberOfChannels,
                s.buffer.length,
                s.buffer.sampleRate
            )
            for (let ch = 0; ch < s.buffer.numberOfChannels; ch++) {
                const input = s.buffer.getChannelData(ch)
                const output = newBuffer.getChannelData(ch)
                for (let i = 0; i < input.length; i++) {
                    output[i] = input[i] * gainLinear
                }
            }

            clearAnalysisCache(s.buffer)
            soundRegistry.sounds[s.key].buffer = newBuffer
            count++
        }

        if (count > 0) {
            showToast(`Normalized ${count} sample(s)`, 'success')
            this.sync()
        } else {
            showToast('No samples to normalize', 'warning')
        }
    }
}
