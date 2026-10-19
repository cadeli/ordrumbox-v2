import { playbackEvents } from '../state/event_bus.js'
import { soundRegistry } from '../state/sound_registry.js'
import { showToast } from '../core/notify.js'
import BasePanel from './base_panel.js'
import { logger } from '../core/logger.js'
import { EVENTS } from '../core/events.js'

import DetailSection from './drumkit_manager/detail_section.js'
import ImportSection from './drumkit_manager/import_section.js'

export default class DrumkitManager extends BasePanel {
    #selectedSoundKey
    #knobs
    #listEl
    #detailEl
    #drumkitChangeDebounce
    #detail
    #importSection
    #serviceRegistry

    get knobs() {
        return this.#knobs
    }
    set knobs(v) {
        this.#knobs = v
    }
    get selectedSoundKey() {
        return this.#selectedSoundKey
    }
    set selectedSoundKey(v) {
        this.#selectedSoundKey = v
    }
    get serviceRegistry() {
        return this.#serviceRegistry
    }

    constructor({ serviceRegistry: sr = null } = {}) {
        super('dm-panel')
        this.#serviceRegistry = sr
        this.#selectedSoundKey = null
        this.#listEl = null
        this.#detailEl = null
        this.#knobs = []
        this.#drumkitChangeDebounce = null
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

        this.#detail = new DetailSection(this, this.#detailEl)
        this.#importSection = new ImportSection(this)

        this.listen(this.container.querySelector('#dm-add-sample'), 'click', () => {
            ;/** @type {HTMLElement} */ (this.container.querySelector('#dm-add-file')).click()
        })

        this.listen(this.container.querySelector('#dm-add-file'), 'change', (e) => {
            this.#importSection.onAddSample(e)
        })

        this.listen(this.container.querySelector('#dm-auto-detect'), 'click', () => {
            this.#importSection.onAutoDetectAll()
        })

        this.listen(this.container.querySelector('#dm-normalize-all'), 'click', () => {
            this.#importSection.onNormalizeAll()
        })

        this.listen(this.container.querySelector('#dm-import-dir'), 'click', () => {
            ;/** @type {HTMLElement} */ (this.container.querySelector('#dm-import-dir-file')).click()
        })
        this.listen(this.container.querySelector('#dm-import-dir-file'), 'change', (e) => {
            this.#importSection.onImportDir(e)
        })

        this.listen(this.container.querySelector('#dm-save-kit'), 'click', () => {
            this.#importSection.saveCurrentKit()
        })
        this.listen(this.container.querySelector('#dm-load-kit'), 'click', () => {
            ;/** @type {HTMLElement} */ (this.container.querySelector('#dm-load-kit-file')).click()
        })
        this.listen(this.container.querySelector('#dm-load-kit-file'), 'change', (e) => {
            this.#importSection.onLoadKitFile(e)
        })
    }

    /** Public API kept for tests/external callers. */
    onKnobChange(sound, key, value) {
        this.#onKnobChange(sound, key, value)
    }
    selectSound(key) {
        this.#selectSound(key)
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
            const sounds = this.#serviceRegistry.drumkitService.getCurrentKitSounds()
            if (sounds.length) {
                this.#selectedSoundKey = sounds[0].url
            }
        }
        this.#renderList()
        if (this.#selectedSoundKey) {
            this.#detail.renderDetail(this.#selectedSoundKey)
        } else {
            this.#detailEl.innerHTML = '<div class="dm-detail-empty">Select a sample from the list</div>'
        }
    }

    #renderList() {
        const sounds = this.#serviceRegistry.drumkitService.getCurrentKitSounds()
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
        this.#detail.renderDetail(key)
    }

    #onKnobChange(sound, key, value) {
        if (key === 'gain') sound.gainDb = value
        else if (key === 'tune') sound.tune = value
        else if (key === 'decay') {
            sound.decay = value
            this.#detail.drawWaveform(sound, this.#serviceRegistry.drumkitService.getAnalysisInfo(sound))
        }
        clearTimeout(this.#drumkitChangeDebounce)
        this.#drumkitChangeDebounce = setTimeout(() => playbackEvents.emit(EVENTS.DRUMKIT_CHANGE), 200)
    }

    audition(url) {
        const ctx = this.#serviceRegistry?.audioCtx
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

    removeSample(soundKey) {
        const displayName = this.#serviceRegistry.drumkitService.removeSample(soundKey)
        if (displayName) {
            this.#selectedSoundKey = null
            showToast(`Removed "${displayName}"`, 'success')
            this.sync()
        }
    }

    async onReplaceSample(soundKey, e) {
        const input = /** @type {HTMLInputElement} */ (e.target)
        const file = input.files?.[0]
        if (!file) return

        const ctx = this.#serviceRegistry?.audioCtx
        if (!ctx) return

        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            const replaced = await this.#serviceRegistry.drumkitService.replaceSampleBuffer(soundKey, buffer, file.name)
            if (!replaced) {
                showToast(`Sample "${soundKey}" is no longer in the kit`, 'warning')
            } else {
                showToast(`Replaced with "${file.name}"`, 'success')
            }
            this.sync()
        } catch (err) {
            logger.warn('DrumkitManager', `Replace failed: ${err.message}`)
            showToast('Failed to decode WAV: ' + err.message, 'error')
        }
        input.value = ''
    }
}
