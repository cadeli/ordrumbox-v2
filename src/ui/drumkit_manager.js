import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import InstrumentsManager from '../logic/services/instruments_manager.js'
import { analyzeSample, clearAnalysisCache, drawEnvelope } from '../audio/sample_analyzer.js'
import { hzToNote, formatNote } from '../core/hz_to_note.js'
import { showToast } from './toast.js'
import { bindCloseButton } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'
import { logger } from '../core/logger.js'

const TAG = 'DrumkitManager'

export default class DrumkitManager extends BasePanel {
    constructor() {
        super('dm-panel')
        this._selectedSoundKey = null
        this._listEl = null
        this._detailEl = null
        this._audioCtx = null
    }

    createDOM() {
        super.createDOM()

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Drumkit Manager</span>
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
                <input type="file" id="dm-add-file" style="display:none" accept=".wav">
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
    }

    subscribe() {
        playbackEvents.onDrumkitManagerToggle.push((show) => {
            if (show) this.show(); else this.hide()
        })
        playbackEvents.onToolsToggle.push(() => this.hide())
        playbackEvents.onOutputToggle.push(() => this.hide())
        playbackEvents.onAboutToggle.push(() => this.hide())
        playbackEvents.onDrumkitChange.push(() => { if (this.isVisible) this.sync() })
    }

    show() {
        super.show(['te-panel', 'ne-panel', 'tools-panel', 'output-panel', 'about-panel', 'soft-synth-panel'])
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
    }

    sync() {
        this._audioCtx = serviceRegistry.audioCtx
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
            ?.map(i => `<option value="${i.id}" ${i.id === detected.id ? 'selected' : ''}>${i.id}</option>`)
            .join('') ?? ''

        const tooltipText = `${detected.id !== 'NOT_FOUND' ? 'Detected: ' + detected.id : 'No instrument detected'}\nPeak: ${peakDb} dB\nRMS: ${rmsDb} dB\nDuration: ${duration}`

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
                        Peak: ${peakDb} dB | RMS: ${rmsDb} dB | ${duration}
                    </div>
                    <div class="dm-detail-actions">
                        <button class="ne-btn" id="dm-replace" title="Replace this sample with a WAV file">Replace</button>
                        <button class="ne-btn dm-danger" id="dm-remove" title="Remove this sample from the kit">Remove</button>
                        <input type="file" id="dm-replace-file" style="display:none" accept=".wav">
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
                        <span class="ne-val" id="dm-gain-val">${peakDb} dB</span>
                        <input type="range" id="dm-gain" class="ne-slider" min="-24" max="6" step="0.1" value="0">
                    </div>
                    <div class="dm-detail-row">
                        <label>Tune:</label>
                        <span class="ne-val" id="dm-tune-val">${noteStr}</span>
                        <input type="range" id="dm-tune" class="ne-slider" min="-12" max="12" step="0.1" value="0">
                    </div>
                </div>
            </div>
        `

        if (analysis?.envelope) {
            const canvas = this._detailEl.querySelector('#dm-waveform')
            const ctx = canvas?.getContext('2d')
            if (ctx) {
                requestAnimationFrame(() => {
                    const w = canvas.clientWidth || 300
                    const h = canvas.clientHeight || 80
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

        this._detailEl.querySelector('#dm-gain')?.addEventListener('input', (e) => {
            this._detailEl.querySelector('#dm-gain-val').textContent = `${Number(e.target.value).toFixed(1)} dB`
        })

        this._detailEl.querySelector('#dm-tune')?.addEventListener('input', (e) => {
            const semitones = Number(e.target.value)
            const baseHz = analysis?.fundamentalHz ?? 440
            const tunedHz = baseHz * Math.pow(2, semitones / 12)
            this._detailEl.querySelector('#dm-tune-val').textContent = formatNote(hzToNote(tunedHz))
        })

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
        source.buffer = sound.buffer
        source.connect(ctx.destination)
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
