// src/ui/synth_editor.js — Coordinator
//
// Thin coordinator that delegates rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons.
// Knob instances are kept alive between renders via setValue().

import { soundRegistry as _soundRegistrySingleton } from '../state/sound_registry.js'
import { serviceRegistry as _serviceRegistrySingleton } from '../state/service_registry.js'
import { playbackEvents as _playbackEventsSingleton } from '../state/playback_events.js'
import { syncKnobs } from './components/sync_helpers.js'
import { showToast } from './toast.js'

import GroupsSection from './synth_editor/groups_section.js'
import WaveformSection from './synth_editor/waveform_section.js'
import PresetSection from './synth_editor/preset_section.js'
import { SYNTH_PARAM_META, SYNTH_GROUP_DEFAULTS } from './synth_editor/constants.js'

/**
 * SynthEditor — soft-synth parameter editor sub-panel.
 * Renders rotary knobs, wave icon selectors, and ADSR waveform preview.
 */
export default class SynthEditor {
    /**
     * @param {object} host  Parent (trackEditor) reference.
     * @param {object} [deps]  Optional dependency overrides (DI).
     */
    constructor(host, deps = {}) {
        this.host = host
        this.panel = null

        this._soundRegistry = deps.soundRegistry ?? _soundRegistrySingleton
        this._serviceRegistry = deps.serviceRegistry ?? _serviceRegistrySingleton
        this._playbackEvents = deps.playbackEvents ?? _playbackEventsSingleton

        this._editKey = null
        this._original = null
        this._draft = null
        this._loading = false
        this._loadFailed = false
        this._loadPromise = null
        this._delegationBound = false
        this._cardBypassed = {}
        this._waveTab = 'wave'

        /** @type {Map<string, OrKnob>} knob instances kept alive between renders */
        this._knobMap = new Map()

        this._groups = new GroupsSection(this)
        this._waveform = new WaveformSection(this)
        this._presets = new PresetSection(this)
    }

    /** @returns {OrKnob[]} flat array of current knob instances. */
    get _knobs() {
        return [...this._knobMap.values()]
    }

    createDOM() {
        this.panel = document.createElement('div')
        this.panel.id = 'soft-synth-panel'
        this.panel.classList.add('workspace-panel')
        this.panel.style.display = 'none'
        this._scrollEl = document.createElement('div')
        this._scrollEl.className = 'ss-scroll'
        this.panel.appendChild(this._scrollEl)
    }

    dispose() {
        this.panel?.remove()
    }

    /** @returns {string[]} sorted keys of loaded synth presets. */
    getGeneratedSoundKeys() {
        return this._presets.getGeneratedSoundKeys()
    }

    /** Loads generated sounds from disk if not already loaded. */
    async ensureGeneratedSoundsLoaded() {
        return this._presets.ensureGeneratedSoundsLoaded()
    }

    /** Opens the editor for the current track's synth sound. */
    async openEditor() {
        const track = this.host._track
        if (!track) return
        await this.ensureGeneratedSoundsLoaded()

        const key = track.synthSoundKey
        const generatedSound = this._soundRegistry.generatedSounds?.[key]
        if (!key || !generatedSound) return

        if (!this._presets.loadPreset(key)) return
        this._showSynthPanel()
        this._renderEditor()
    }

    /** Shows the panel (standalone or for current track). */
    async showPanel() {
        await this.ensureGeneratedSoundsLoaded()

        const track = this.host._track
        const key = track?.synthSoundKey
        const generatedSound = key ? this._soundRegistry.generatedSounds?.[key] : null

        if (key && generatedSound) {
            this._presets.loadPreset(key)
            this._renderEditor()
        } else {
            const keys = this.getGeneratedSoundKeys()
            if (keys.length > 0) {
                this._presets.loadPreset(keys[0])
                this._renderEditor()
            } else {
                this._scrollEl.innerHTML = `
                <div class="ss-body ss-body-empty">
                    No synth presets loaded.
                </div>`
                this._bindEvents()
            }
        }

        this._showSynthPanel()
    }

    /** Hides the panel, committing live-previewed changes. */
    hidePanel() {
        if (this.panel.style.display !== 'flex') return
        if (this._editKey && this._draft) {
            this._closeEditor(true)
        } else {
            this._hideSynthPanel()
            if (this.host._track) {
                this.host.sync()
            }
        }
    }

    // ─── Panel visibility ──────────────────────────────────────────────

    _showSynthPanel() {
        this.panel.style.display = 'flex'
    }

    _hideSynthPanel() {
        this.panel.style.display = 'none'
    }

    // ─── Rendering ─────────────────────────────────────────────────────

    /** Renders the full editor: groups, footer, knobs, waveform. */
    _renderEditor() {
        if (!this._draft || !this._editKey) return

        const knobConfigs = []
        let html = this._presets.renderFooter()
        html += this._groups.render(knobConfigs)

        this._scrollEl.innerHTML = html
        this._syncKnobs(knobConfigs)
        this._bindEvents()
        this._waveform.draw()
    }

    /**
     * Syncs knob instances: reuse existing via setValue(), create new only for new paths,
     * destroy orphaned knobs. Keeps instances alive between renders.
     */
    _syncKnobs(configs) {
        this._knobMap = syncKnobs({
            container: this.panel,
            configs,
            selector: 'ss-knob-placeholder',
            prev: this._knobMap,
            paramMeta: SYNTH_PARAM_META,
            onChange: (key, val) => this._onKnobChange(key, val),
        })
    }

    _onKnobChange(pathStr, value) {
        this._setValue(pathStr, Number.isNaN(value) ? 0 : value)
        this._waveform.draw()
    }

    // ─── Draft hydration ───────────────────────────────────────────────

    /** Fills missing draft fields with defaults. */
    _hydrateDraft() {
        if (!this._draft) return
        for (const [key, defaultValue] of Object.entries(SYNTH_GROUP_DEFAULTS)) {
            if (this._isPlainObject(defaultValue)) {
                if (!this._isPlainObject(this._draft[key])) {
                    this._draft[key] = structuredClone(defaultValue)
                    continue
                }
                for (const [childKey, childDefault] of Object.entries(defaultValue)) {
                    if (this._draft[key][childKey] === undefined) this._draft[key][childKey] = childDefault
                }
            } else if (this._draft[key] === undefined) {
                this._draft[key] = defaultValue
            }
        }
    }

    // ─── Event handling ────────────────────────────────────────────────

    _bindEvents() {
        if (this._delegationBound) return

        this.panel.addEventListener('click', (e) => this._handleClick(e))
        this.panel.addEventListener('change', (e) => {
            const { target } = e
            if (target.tagName === 'SELECT' && target.dataset.synthPath) {
                this._setValue(target.dataset.synthPath, target.value)
                this._waveform.draw()
            }
            if (target.tagName === 'SELECT' && target.dataset.action === 'synth-preset') {
                this._presets.selectPreset(target.value)
            }
        })

        this._delegationBound = true
    }

    _handleClick(e) {
        const { target } = e
        if (this._handlePowerBtn(target, e)) return
        if (this._handleWaveTab(target)) return
        if (this._handleBooleanBtn(target)) return
        if (this._handleIconBtn(target)) return
        if (this._handleAction(target)) return
        this._handlePresetNav(target)
    }

    _handlePowerBtn(target, e) {
        const powerBtn = target.closest('[data-power-card]')
        if (!powerBtn) return false
        e.stopPropagation()
        const groupName = powerBtn.dataset.powerCard
        this._cardBypassed[groupName] = !this._cardBypassed[groupName]
        const card = this.panel.querySelector(`[data-ss-card="${groupName}"]`)
        if (card) card.classList.toggle('bypassed', this._cardBypassed[groupName])
        powerBtn.classList.toggle('active', !this._cardBypassed[groupName])

        const draftGroup = this._draft?.[groupName]
        if (groupName.startsWith('vco') && draftGroup && typeof draftGroup === 'object') {
            if (this._cardBypassed[groupName]) {
                draftGroup._savedGain = draftGroup.gain ?? 0
                draftGroup.gain = 0
            } else {
                draftGroup.gain = draftGroup._savedGain ?? (groupName === 'vco1' ? 1 : 0)
                delete draftGroup._savedGain
            }
        } else {
            const flagMap = { noise: 'bypassNoise', filter: 'bypassFilter', enveloppe: 'bypassEnv', lfo: 'bypassLfo1', lfo2: 'bypassLfo2', fm: 'bypassFm' }
            const flag = flagMap[groupName]
            if (flag) this._draft[flag] = this._cardBypassed[groupName]
        }

        this._waveform.draw()
        this._previewDraft()
        return true
    }

    _handleWaveTab(target) {
        const waveTab = target.closest('[data-wave-tab]')
        if (!waveTab) return false
        this.panel.querySelectorAll('[data-wave-tab]').forEach(t => t.classList.remove('active'))
        waveTab.classList.add('active')
        this._waveTab = waveTab.dataset.waveTab
        this._waveform.draw()
        return true
    }

    _handleBooleanBtn(target) {
        if (target.dataset.synthType !== 'boolean') return false
        const next = !this._getValue(target.dataset.synthPath)
        this._setValue(target.dataset.synthPath, next)
        target.textContent = next ? 'ON' : 'OFF'
        target.classList.toggle('active', next)
        this._waveform.draw()
        return true
    }

    _handleIconBtn(target) {
        const waveIcon = target.closest('.ss-wave-icon, .ss-ft-icon, .ss-fm-icon')
        if (!waveIcon) return false
        const path = waveIcon.dataset.synthPath
        const val = waveIcon.dataset.waveVal
        this._setValue(path, val)
        const scope = waveIcon.closest('.ne-row') ?? waveIcon.closest('.ss-group')
        scope?.querySelectorAll('.ss-wave-icon, .ss-ft-icon, .ss-fm-icon').forEach(b => b.classList.remove('selected'))
        waveIcon.classList.add('selected')
        this._waveform.draw()
        return true
    }

    _handleAction(target) {
        const action = target.dataset.action
        if (action === 'synth-revert') this._revertPreset()
        else if (action === 'synth-duplicate') this._presets.duplicatePreset()
        else if (action === 'synth-rename') this._presets.renamePreset()
        else if (action === 'synth-randomize') this._presets.randomizePreset()
        else if (action === 'synth-new') this._presets.newPreset()
        else if (action === 'synth-delete') this._presets.deletePreset()
        else if (action === 'synth-export') this._exportSynth()
        else if (action === 'synth-import') this._importSynth()
        else return false
        return true
    }

    _handlePresetNav(target) {
        const nav = target.closest('[data-preset-nav]')
        if (!nav) return
        const dir = parseInt(nav.dataset.presetNav, 10)
        this._presets.navigatePreset(dir)
    }

    // ─── Value access ──────────────────────────────────────────────────

    /** @param {string} pathString dot-separated path */
    _getValue(pathString) {
        return pathString.split('.').reduce((obj, key) => obj?.[key], this._draft)
    }

    /** Sets a nested draft value and triggers preview. */
    _setValue(pathString, value) {
        const path = pathString.split('.')
        let target = this._draft
        for (let i = 0; i < path.length - 1; i++) {
            target = target[path[i]]
        }
        target[path.at(-1)] = value
        this._previewDraft()
    }

    _previewDraft() {
        if (!this._editKey || !this._draft) return
        this._presets.commitSound(this._editKey, this._draft)
    }

    // ─── Close / save / revert ─────────────────────────────────────────

    _revertPreset() {
        if (!this._editKey || !this._original) return
        this._presets.commitSound(this._editKey, this._original)
        this._draft = structuredClone(this._original)
        this._renderEditor()
        this._serviceRegistry.audioEngine?.invalidateCache?.()
        this._playbackEvents.batch(() => {
            this._playbackEvents.emit('trackParamChange', this.host._track)
            this._playbackEvents.emit('patternChange', [this.host._track])
        })
    }

    // ─── Value access ──────────────────────────────────────────────────

    _exportSynth() {
        const sounds = this._soundRegistry.generatedSounds
        if (!sounds || Object.keys(sounds).length === 0) {
            showToast('No synth sounds loaded', 'info')
            return
        }
        downloadJson(sounds, 'ordrumbox-synth-sounds.json')
        showToast('Synth sounds exported', 'success')
    }

    _importSynth() {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.addEventListener('change', async () => {
            const file = input.files?.[0]
            if (!file) return
            try {
                const text = await file.text()
                const data = JSON.parse(text)
                if (!data || typeof data !== 'object' || Array.isArray(data)) {
                    showToast('Invalid synth file: expected a JSON object', 'error')
                    return
                }
                const sr = this._soundRegistry
                let count = 0
                for (const [key, val] of Object.entries(data)) {
                    if (val && typeof val === 'object') {
                        sr.generatedSounds[key] = val
                        count++
                    }
                }
                this._serviceRegistry.audioEngine?.updateGeneratedSounds(sr.generatedSounds)
                this._presets._persist()
                this._presets.ensureGeneratedSoundsLoaded()
                this._renderEditor()
                showToast(`Imported ${count} synth sound(s)`, 'success')
            } catch (err) {
                showToast('Import failed: ' + err.message, 'error')
            }
        })
        input.click()
    }

    _closeEditor(shouldSave) {
        if (shouldSave && this._editKey && this._draft) {
            this._presets.commitSound(this._editKey, this._draft)
            this._serviceRegistry.audioEngine?.invalidateCache?.()
            this._playbackEvents.batch(() => {
                this._playbackEvents.emit('trackParamChange', this.host._track)
                this._playbackEvents.emit('patternChange', [this.host._track])
            })
        } else if (!shouldSave && this._editKey && this._original) {
            this._presets.commitSound(this._editKey, this._original)
        }

        this._hideSynthPanel()
        if (this.host._track) {
            this.host.sync()
        }
        this._editKey = null
        this._original = null
        this._draft = null
    }

    reset() {
        this.panel.style.display = 'none'
        this._editKey = null
        this._original = null
        this._draft = null
        this._loading = false
        this._loadFailed = false
        this._cardBypassed = {}
        this._waveTab = 'wave'
    }

    // ─── Utilities ─────────────────────────────────────────────────────

    /** @returns {boolean} true if value is a plain object (not array, not null). */
    _isPlainObject(val) {
        return val != null && typeof val === 'object' && !Array.isArray(val)
    }
}
