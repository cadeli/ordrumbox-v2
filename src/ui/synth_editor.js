import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import MfResourcesLoader from '../loader/resources_loader.js'
import { fmt, buildAccordionGroup } from './components/panel_helpers.js'
import { escapeHtml as _esc } from './components/ui_utils.js'
import { OrKnob } from './components/or_knob.js'
import { logger } from '../core/logger.js'

const WAVE_ICONS = {
    sine:     '<svg viewBox="0 0 24 14"><path d="M0 7 C3 7,3 1,6 1 C9 1,9 13,12 13 C15 13,15 1,18 1 C21 1,21 7,24 7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    triangle: '<svg viewBox="0 0 24 14"><polyline points="0,12 6,2 12,12 18,2 24,12" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    sawtooth: '<svg viewBox="0 0 24 14"><polyline points="0,12 12,2 12,12 24,2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    square:   '<svg viewBox="0 0 24 14"><polyline points="0,12 0,2 6,2 6,12 12,12 12,2 18,2 18,12 24,12 24,2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    random:   '<svg viewBox="0 0 24 14"><polyline points="0,7 2,3 4,11 6,5 8,10 10,2 12,9 14,4 16,12 18,6 20,8 22,3 24,7" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
}

const FILTER_ICONS = {
    lowpass:  'LP', highpass: 'HP', bandpass: 'BP', peaking: 'PK',
    lowshelf: 'LS', highshelf: 'HS', notch: 'NT', allpass: 'AP',
}

const SYNTH_GROUP_DEFAULTS = {
    masterVolume: 0.8,
    slide: 0,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    vco2: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    vco3: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1, filterEnvelopeAmount: 0 },
    fm: { amount: 0 },
    lfo: { target: 'NOT', wave: 'sine', freq: 0, depth: 0, sync: 'off' },
    lfo2: { target: 'NOT', wave: 'sine', freq: 0, depth: 0, sync: 'off' },
    noise: { mix: 0, filterType: 'highpass', filterFreq: 1000, filterQ: 1 },
    enveloppe: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 }
}

/** Parameter metadata: min, max, step, unit for each synth path. */
const SYNTH_PARAM_META = {
    'masterVolume': { min: 0, max: 1, step: 0.01, unit: '' },
    'slide': { min: 0, max: 500, step: 1, unit: 'ms' },
    'vco1.gain': { min: 0, max: 1, step: 0.01, unit: '' },
    'vco1.octave': { min: -4, max: 4, step: 1, unit: 'oct' },
    'vco1.detune': { min: -100, max: 100, step: 1, unit: 'ct' },
    'vco2.gain': { min: 0, max: 1, step: 0.01, unit: '' },
    'vco2.octave': { min: -4, max: 4, step: 1, unit: 'oct' },
    'vco2.detune': { min: -100, max: 100, step: 1, unit: 'ct' },
    'vco3.gain': { min: 0, max: 1, step: 0.01, unit: '' },
    'vco3.octave': { min: -4, max: 4, step: 1, unit: 'oct' },
    'vco3.detune': { min: -100, max: 100, step: 1, unit: 'ct' },
    'filter.freq': { min: 20, max: 20000, step: 1, unit: 'Hz' },
    'filter.Q': { min: 0.1, max: 24, step: 0.1, unit: '' },
    'filter.filterEnvelopeAmount': { min: 0, max: 1, step: 0.01, label: 'Env', unit: '' },
    'lfo.freq': { min: 0, max: 20, step: 0.01, unit: 'Hz' },
    'lfo.depth': { min: 0, max: 1, step: 0.01, unit: '' },
    'lfo2.freq': { min: 0, max: 20, step: 0.01, unit: 'Hz' },
    'lfo2.depth': { min: 0, max: 1, step: 0.01, unit: '' },
    'noise.mix': { min: 0, max: 1, step: 0.01, unit: '' },
    'noise.filterFreq': { min: 20, max: 20000, step: 1, unit: 'Hz' },
    'noise.filterQ': { min: 0.1, max: 24, step: 0.1, unit: '' },
    'fm.amount': { min: 0, max: 1, step: 0.01, label: 'FM', unit: '' },
    'enveloppe.attack': { min: 0, max: 0.5, step: 0.001, unit: 's' },
    'enveloppe.decay': { min: 0, max: 1.0, step: 0.001, unit: 's' },
    'enveloppe.sustain': { min: 0, max: 1, step: 0.01, unit: '' },
    'enveloppe.release': { min: 0, max: 0.5, step: 0.001, unit: 's' }
}

const SYNTH_LFO_TARGETS = ['NOT', ...Object.keys(SYNTH_PARAM_META).filter(k => !k.startsWith('lfo.') && !k.startsWith('lfo2.'))]
const SYNTH_GROUP_MERGE = {
    master: ['masterVolume', 'slide']
}
const SYNTH_GROUP_LABELS = {
    master: 'Master',
    filter: 'Flt',
    fm: 'FM',
    lfo: 'LFO1',
    enveloppe: 'Env'
}
const SYNTH_GROUP_ORDER = ['master', 'vco1', 'vco2', 'vco3', 'filter', 'fm', 'lfo', 'lfo2', 'noise', 'enveloppe']
const VCO_RE = /^vco\d+$/i

const LFO_SYNC_OPTIONS = [
    { value: 'off', label: 'free' },
    { value: '1/1', label: '1/1' },
    { value: '1/2', label: '1/2' },
    { value: '1/4', label: '1/4' },
    { value: '1/8', label: '1/8' },
    { value: '1/16', label: '1/16' },
    { value: '1/8T', label: '1/8T' },
    { value: '1/16T', label: '1/16T' },
]

/** Waveform drawing uses a fixed sample buffer, allocated once. */
const WAVE_BUFFER = new Float32Array(1024)

/**
 * SynthEditor — soft-synth parameter editor sub-panel.
 * Renders rotary knobs, wave icon selectors, and ADSR waveform preview.
 */
export default class SynthEditor {
    constructor(host) {
        this.host = host
        this.panel = null
        this._editKey = null
        this._original = null
        this._draft = null
        this._loading = false
        this._loadFailed = false
        this._knobs = []
        this._delegationBound = false
        this._cardCollapsed = {}
        this._cardBypassed = {}
        this._waveTab = 'wave'
    }

    createDOM() {
        this.panel = document.createElement('div')
        this.panel.id = 'soft-synth-panel'
        this.panel.style.display = 'none'
        document.body.appendChild(this.panel)
    }

    dispose() {
        this.panel?.remove()
    }

    /** @returns {string[]} sorted keys of loaded synth presets. */
    getGeneratedSoundKeys() {
        return Object.keys(soundRegistry.generatedSounds ?? {}).sort((a, b) => a.localeCompare(b))
    }

    /** Loads generated sounds from disk if not already loaded. */
    async ensureGeneratedSoundsLoaded() {
        if (this._loadFailed) return
        if (this.getGeneratedSoundKeys().length > 0) return
        if (this._loadPromise) return this._loadPromise

        this._loading = true
        this._loadPromise = (async () => {
            try {
                await serviceRegistry.mfResourcesLoader?.loadGeneratedSounds(MfResourcesLoader.GENERATED_SOUNDS_URL)
                serviceRegistry.audioEngine?.updateGeneratedSounds(soundRegistry.generatedSounds)
            } catch (error) {
                this._loadFailed = true
                logger.error('SynthEditor', 'SynthEditor: failed to load generated sounds', error)
            } finally {
                this._loading = false
                this._loadPromise = null
            }
        })()
        return this._loadPromise
    }

    /** Opens the editor for the current track's synth sound. */
    async openEditor() {
        const track = this.host._track
        if (!track) return
        await this.ensureGeneratedSoundsLoaded()

        const key = track.synthSoundKey
        const generatedSound = soundRegistry.generatedSounds?.[key]
        if (!key || !generatedSound) return

        if (!this._loadPreset(key)) return
        this._showSynthPanel()
        this._renderEditor()
    }

    /** Shows the panel (standalone or for current track). */
    async showPanel() {
        await this.ensureGeneratedSoundsLoaded()

        const track = this.host._track
        const key = track?.synthSoundKey
        const generatedSound = key ? soundRegistry.generatedSounds?.[key] : null

        if (key && generatedSound) {
            this._loadPreset(key)
            this._renderEditor()
        } else {
            const keys = this.getGeneratedSoundKeys()
            if (keys.length > 0) {
                this._loadPreset(keys[0])
                this._renderEditor()
            } else {
                this.panel.innerHTML = `<div class="ss-header">
                    <span class="ss-title">Soft Synth</span>
                </div>
                <div class="ss-body" style="padding:20px;color:#666;">
                    No synth presets loaded.
                </div>`
                this._bindEvents()
            }
        }

        this._showSynthPanel()
    }

    /** Hides the panel, optionally committing changes. */
    hidePanel() {
        if (this.panel.style.display !== 'flex') return
        if (this._editKey && this._draft) {
            this._closeEditor(false)
        } else {
            this._hideSynthPanel()
            if (this.host._track) {
                this.host.sync()
            }
        }
    }

    // ─── Preset management ────────────────────────────────────────────────

    /**
     * Loads a preset into the draft.
     * @returns {boolean} whether the preset was loaded
     */
    _loadPreset(key) {
        const sound = soundRegistry.generatedSounds?.[key]
        if (!sound) return false
        this._editKey = key
        this._original = structuredClone(sound)
        this._draft = structuredClone(sound)
        this._hydrateDraft()
        return true
    }

    /** Commits a sound to the registry and notifies the audio engine. */
    _commitSound(key, sound) {
        soundRegistry.generatedSounds[key] = structuredClone(sound)
        serviceRegistry.audioEngine?.updateGeneratedSounds(soundRegistry.generatedSounds)
    }

    _showSynthPanel() {
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
        this.host.container.style.display = 'none'
        this.panel.style.display = 'flex'
        const synthBtn = document.querySelector('.tb-view-btn:nth-child(2)')
        if (synthBtn) synthBtn.classList.add('actif')
    }

    _hideSynthPanel() {
        this.panel.style.display = 'none'
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        const synthBtn = document.querySelector('.tb-view-btn:nth-child(2)')
        if (synthBtn) synthBtn.classList.remove('actif')
    }

    // ─── Rendering ────────────────────────────────────────────────────────

    /** Renders the full editor: header, waveform, groups, footer. */
    _renderEditor() {
        if (!this._draft || !this._editKey) return

        this._destroyKnobs()
        const knobConfigs = []

        let html = this._buildHeader()
        html += this._buildWaveSection()
        html += this._buildGroups(knobConfigs)
        html += this._buildFooter()

        this.panel.innerHTML = html
        this._mountKnobs(knobConfigs)
        this._bindEvents()
        this._drawWaveform()
    }

    /** @returns {string} header HTML with preset title. */
    _buildHeader() {
        return `<div class="ss-title">Soft Synth : ${_esc(this._editKey)}</div>`
    }

    /** @returns {string} waveform canvas with Wave/Scope tabs. */
    _buildWaveSection() {
        return `<div class="ss-wave-row">
            <button class="ss-wave-tab active" data-wave-tab="wave">Wave</button>
            <button class="ss-wave-tab" data-wave-tab="scope">Scope</button>
            <canvas id="ss-waveform" width="800" height="88"></canvas>
        </div>`
    }

    /** @returns {string} accordion groups HTML. Pushes knob configs to the array. */
    _buildGroups(knobConfigs) {
        const groupNames = this._getOrderedGroupNames()
        let html = '<div class="ss-body">'

        for (const groupName of groupNames) {
            const isCollapsed = this._cardCollapsed[groupName] ?? false
            const content = this._buildGroupContent(groupName, knobConfigs)
            const label = this._getGroupLabel(groupName)
            const shortLabel = SYNTH_GROUP_LABELS[groupName] ?? (VCO_RE.test(groupName) ? groupName.toUpperCase() : groupName.slice(0, 3))

            html += buildAccordionGroup(groupName, label, shortLabel, !isCollapsed, content, {
                cssPrefix: 'ss',
                dataAttr: 'data-synth-group',
                gridClass: 'ss-card-body',
                labelClass: 'ss-group-label',
            })
        }

        return `${html}</div>`
    }

    /**
     * Builds the inner content for a single group.
     * @param {string} groupName
     * @param {Array} knobConfigs — mutated, knob paths are pushed here
     * @returns {string} HTML
     */
    _buildGroupContent(groupName, knobConfigs) {
        const merged = SYNTH_GROUP_MERGE[groupName]
        const fields = merged
            ? merged.map(key => ({ path: [key], key, val: this._draft[key] }))
            : this._isPlainObject(this._draft[groupName])
                ? Object.entries(this._draft[groupName]).map(([key, val]) => ({ path: [groupName, key], key, val }))
                : [{ path: [groupName], key: groupName, val: this._draft[groupName] }]

        return fields.map(({ path, key, val }) => {
            const pathStr = path.join('.')
            const paramLabel = SYNTH_PARAM_META[pathStr]?.label ?? key
            return this._buildField(path, key, val, pathStr, paramLabel, knobConfigs)
        }).join('')
    }

    /**
     * Builds HTML for a single field (knob, icon row, select, or boolean).
     * @returns {string}
     */
    _buildField(path, key, val, pathStr, paramLabel, knobConfigs) {
        const options = this._getOptions(path, key)

        if (key === 'wave' && options) {
            return this._buildIconRow(paramLabel, pathStr, val, 'ss-wave-icon', WAVE_ICONS)
        }
        if ((pathStr === 'filter.type' || pathStr === 'noise.filterType') && options) {
            return this._buildIconRow(paramLabel, pathStr, val, 'ss-ft-icon', FILTER_ICONS)
        }
        if (options) {
            return this._buildSelectRow(paramLabel, pathStr, val, options)
        }
        if (typeof val === 'number') {
            knobConfigs.push({ path, val, key: pathStr, label: paramLabel })
            return `<div class="ne-row" data-ss-knob-placeholder="${_esc(pathStr)}"></div>`
        }
        if (typeof val === 'boolean') {
            return `<div class="ne-row">
                <span class="ss-param-label">${_esc(paramLabel)}</span>
                <button class="ss-tb-btn ${val ? 'active' : ''}" data-synth-path="${_esc(pathStr)}" data-synth-type="boolean" style="font-size:9px;height:22px;padding:0 8px;">${val ? 'ON' : 'OFF'}</button>
            </div>`
        }
        return ''
    }

    /** @returns {string} icon button row HTML (wave or filter type). */
    _buildIconRow(paramLabel, pathStr, val, cssClass, icons) {
        const options = this._getIconOptions(pathStr)
        return `<div class="ne-row ss-icon-row">
            <span class="ss-param-label">${_esc(paramLabel)}</span>
            ${this._renderIconRow(options, pathStr, val, cssClass, icons)}
        </div>`
    }

    /** Resolves icon options from path. */
    _getIconOptions(pathStr) {
        if (pathStr.startsWith('vco') && pathStr.endsWith('.wave')) return Utils.waveList
        if (pathStr === 'filter.type' || pathStr === 'noise.filterType') return Utils.filterTypeList
        return []
    }

    /** @returns {string} select dropdown row HTML. */
    _buildSelectRow(paramLabel, pathStr, val, options) {
        const opts = options.map(opt => {
            const optionValue = typeof opt === 'object' ? opt.value : opt
            const optionLabel = typeof opt === 'object' ? opt.label : opt
            const selected = String(optionValue) === String(val) ? ' selected' : ''
            return `<option value="${_esc(optionValue)}"${selected}>${_esc(optionLabel)}</option>`
        }).join('')
        return `<div class="ne-row">
            <span class="ss-param-label">${_esc(paramLabel)}</span>
            <select data-synth-path="${_esc(pathStr)}">${opts}</select>
        </div>`
    }

    /** @returns {string} footer HTML with OK/Cancel buttons. */
    _buildFooter() {
        return `<div class="ss-footer">
            <button class="ss-tb-btn" data-action="synth-ok" title="Save">OK</button>
            <button class="ss-tb-btn" data-action="synth-cancel" title="Cancel">Cancel</button>
        </div>`
    }

    /** Renders icon buttons (wave shapes, filter types). */
    _renderIconRow(options, pathStr, val, cssClass, icons) {
        return options.map(opt => {
            const v = typeof opt === 'object' ? opt.value : opt
            const sel = String(v) === String(val) ? ' selected' : ''
            return `<button class="${cssClass}${sel}" data-synth-path="${_esc(pathStr)}" data-wave-val="${_esc(v)}" title="${_esc(v)}">${icons[v] ?? v}</button>`
        }).join('')
    }

    // ─── Knob mounting ────────────────────────────────────────────────────

    /** Destroys all knob instances and clears the array. */
    _destroyKnobs() {
        this._knobs.forEach(k => k.destroy())
        this._knobs = []
    }

    /**
     * Mounts OrKnob instances into placeholder elements.
     * Replaces each placeholder with the knob's own DOM element.
     */
    _mountKnobs(configs) {
        for (const { path, val, key: pathStr, label } of configs) {
            const placeholder = this.panel.querySelector(`[data-ss-knob-placeholder="${_esc(pathStr)}"]`)
            if (!placeholder) continue

            const meta = SYNTH_PARAM_META[pathStr] ?? {
                min: 0, max: Math.max(1, Math.ceil(val ?? 1)),
                step: Number.isInteger(val) ? 1 : 0.001,
            }

            const knob = new OrKnob({
                key:      pathStr,
                label:    label,
                min:      meta.min,
                max:      meta.max,
                step:     meta.step,
                value:    val,
                format:   fmt,
                unit:     meta.unit ?? '',
                onChange: v => this._onKnobChange(pathStr, v),
            })
            this._knobs.push(knob)
            placeholder.replaceWith(knob.createElement())
        }
    }

    /** Callback for knob value changes. */
    _onKnobChange(pathStr, value) {
        this._setValue(pathStr, Number.isNaN(value) ? 0 : value)
        this._drawWaveform()
    }

    // ─── Group ordering / labels ──────────────────────────────────────────

    /** @returns {string[]} group names in display order. */
    _getOrderedGroupNames() {
        const mergedKeys = new Set(Object.values(SYNTH_GROUP_MERGE).flat())
        const draftKeys = Object.keys(this._draft)
        const allGroups = new Set(SYNTH_GROUP_ORDER)

        for (const [group, keys] of Object.entries(SYNTH_GROUP_MERGE)) {
            if (keys.some(k => draftKeys.includes(k))) allGroups.add(group)
        }
        for (const name of draftKeys) {
            if (!mergedKeys.has(name)) allGroups.add(name)
        }

        return [...allGroups].sort((a, b) => {
            const ai = SYNTH_GROUP_ORDER.indexOf(a)
            const bi = SYNTH_GROUP_ORDER.indexOf(b)
            if (ai !== -1 && bi !== -1) return ai - bi
            if (ai !== -1) return -1
            if (bi !== -1) return 1
            return a.localeCompare(b)
        })
    }

    /** @returns {string} display label for a group. */
    _getGroupLabel(groupName) {
        return SYNTH_GROUP_LABELS[groupName] ?? (VCO_RE.test(groupName) ? groupName.toUpperCase() : groupName)
    }

    // ─── Draft hydration / options ────────────────────────────────────────

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

    /**
     * Returns option list for a given path/key, or null if it's a direct value.
     * @returns {Array|null}
     */
    _getOptions(path, key) {
        const isLfo = path[0] === 'lfo' || path[0] === 'lfo2'
        if (key === 'wave') return Utils.waveList
        if (path[0] === 'filter' && key === 'type') return Utils.filterTypeList
        if (path[0] === 'noise' && key === 'filterType') return Utils.filterTypeList
        if (isLfo && key === 'target') {
            return SYNTH_LFO_TARGETS.map(target => ({ value: target, label: target === 'NOT' ? 'off' : target }))
        }
        if (isLfo && key === 'sync') return LFO_SYNC_OPTIONS
        return null
    }

    // ─── Event handling ───────────────────────────────────────────────────

    _bindEvents() {
        if (this._delegationBound) return

        this.panel.addEventListener('click', (e) => this._handleClick(e))
        this.panel.addEventListener('change', (e) => {
            const { target } = e
            if (target.tagName === 'SELECT' && target.dataset.synthPath) {
                this._setValue(target.dataset.synthPath, target.value)
                this._drawWaveform()
            }
        })

        this._delegationBound = true
    }

    _handleClick(e) {
        const { target } = e
        if (this._handlePowerBtn(target, e)) return
        if (this._handleAccordionToggle(target)) return
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
        return true
    }

    /** Handles accordion group toggle (collapse/expand). */
    _handleAccordionToggle(target) {
        const toggleBtn = target.closest('.ne-group-accordion-toggle[data-toggle]')
        if (!toggleBtn) return false
        const groupName = toggleBtn.dataset.toggle
        this._cardCollapsed[groupName] = !this._cardCollapsed[groupName]
        const card = this.panel.querySelector(`[data-synth-group="${groupName}"]`)
        if (card) {
            card.classList.toggle('collapsed', this._cardCollapsed[groupName])
            card.classList.toggle('expanded', !this._cardCollapsed[groupName])
        }
        toggleBtn.classList.toggle('active', !this._cardCollapsed[groupName])
        const icon = toggleBtn.querySelector('.ne-group-accordion-icon')
        if (icon) icon.innerHTML = this._cardCollapsed[groupName] ? '+' : '&minus;'
        return true
    }

    _handleWaveTab(target) {
        const waveTab = target.closest('[data-wave-tab]')
        if (!waveTab) return false
        this.panel.querySelectorAll('[data-wave-tab]').forEach(t => t.classList.remove('active'))
        waveTab.classList.add('active')
        this._waveTab = waveTab.dataset.waveTab
        this._drawWaveform()
        return true
    }

    _handleBooleanBtn(target) {
        if (target.dataset.synthType !== 'boolean') return false
        const next = !this._getValue(target.dataset.synthPath)
        this._setValue(target.dataset.synthPath, next)
        target.textContent = next ? 'ON' : 'OFF'
        target.classList.toggle('active', next)
        this._drawWaveform()
        return true
    }

    _handleIconBtn(target) {
        const waveIcon = target.closest('.ss-wave-icon, .ss-ft-icon')
        if (!waveIcon) return false
        const path = waveIcon.dataset.synthPath
        const val = waveIcon.dataset.waveVal
        this._setValue(path, val)
        const row = waveIcon.closest('.ss-wave-icons')
        row.querySelectorAll('.ss-wave-icon, .ss-ft-icon').forEach(b => b.classList.remove('selected'))
        waveIcon.classList.add('selected')
        this._drawWaveform()
        return true
    }

    _handleAction(target) {
        const action = target.dataset.action
        if (action === 'synth-ok') this._closeEditor(true)
        else if (action === 'synth-cancel') this._closeEditor(false)
        else if (action === 'synth-duplicate') this._duplicatePreset()
        else if (action === 'synth-rename') this._renamePreset()
        else if (action === 'synth-randomize') this._randomizePreset()
        else return false
        return true
    }

    _handlePresetNav(target) {
        const nav = target.closest('[data-preset-nav]')
        if (!nav) return
        const dir = parseInt(nav.dataset.presetNav, 10)
        this._navigatePreset(dir)
    }

    // ─── Preset actions ───────────────────────────────────────────────────

    _navigatePreset(dir) {
        const keys = this.getGeneratedSoundKeys()
        if (keys.length === 0) return
        const idx = keys.indexOf(this._editKey)
        const next = (idx + dir + keys.length) % keys.length
        if (!this._loadPreset(keys[next])) return
        this._renderEditor()
    }

    _duplicatePreset() {
        if (!this._draft || !this._editKey) return
        const newKey = `${this._editKey}_copy`
        this._commitSound(newKey, this._draft)
        this._editKey = newKey
        this._original = structuredClone(this._draft)
        this._renderEditor()
    }

    _renamePreset() {
        if (!this._editKey) return
        const newName = prompt('Rename preset:', this._editKey)
        if (!newName || newName === this._editKey) return
        this._commitSound(newName, this._draft)
        delete soundRegistry.generatedSounds[this._editKey]
        serviceRegistry.audioEngine?.updateGeneratedSounds(soundRegistry.generatedSounds)
        this._editKey = newName
        this._original = structuredClone(this._draft)
        this._renderEditor()
    }

    _randomizePreset() {
        if (!this._draft) return
        const randomize = (obj, prefix = '') => {
            for (const [key, val] of Object.entries(obj)) {
                const path = prefix ? `${prefix}.${key}` : key
                if (this._isPlainObject(val)) {
                    randomize(val, path)
                } else if (typeof val === 'number') {
                    const meta = SYNTH_PARAM_META[path]
                    obj[key] = meta
                        ? meta.min + Math.random() * (meta.max - meta.min)
                        : Math.random()
                }
            }
        }
        randomize(this._draft)
        this._hydrateDraft()
        this._renderEditor()
    }

    // ─── Waveform drawing ─────────────────────────────────────────────────

    _drawWaveform() {
        const canvas = this.panel.querySelector('#ss-waveform')
        if (!canvas || !this._draft) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const w = canvas.width
        const h = canvas.height
        const mid = h / 2

        ctx.fillStyle = '#0d0d1a'
        ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = '#2D3438'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(w, mid)
        ctx.stroke()

        if (this._waveTab === 'wave') {
            this._drawOscillators(ctx, w, mid)
        }
        this._drawAdsrEnvelope(ctx, w, mid)
    }

    _drawOscillators(ctx, w, mid) {
        const vcos = this._buildVcoArray()
        const masterVol = this._draft.masterVolume ?? 1.0
        const cycles = 4
        const sampleRate = WAVE_BUFFER.length
        const samplesPerCycle = Math.floor(sampleRate / cycles)

        WAVE_BUFFER.fill(0)

        for (const vco of vcos) {
            if (vco.gain <= 0) continue
            const freqMult = Math.pow(2, vco.octave) * Math.pow(2, vco.detune / 1200)
            for (let i = 0; i < sampleRate; i++) {
                const t = i / sampleRate
                const p = ((t * cycles * freqMult * samplesPerCycle) % samplesPerCycle) / samplesPerCycle
                let val
                switch (vco.wave) {
                    case 'sine': val = Math.sin(2 * Math.PI * p); break
                    case 'square': val = Math.sin(2 * Math.PI * p) >= 0 ? 1 : -1; break
                    case 'sawtooth': val = 2 * p - 1; break
                    case 'triangle': val = 4 * Math.abs(p - 0.5) - 1; break
                    default: val = Math.sin(2 * Math.PI * p)
                }
                WAVE_BUFFER[i] += val * vco.gain
            }
        }

        let maxVal = 0
        for (let i = 0; i < sampleRate; i++) {
            if (Math.abs(WAVE_BUFFER[i]) > maxVal) maxVal = Math.abs(WAVE_BUFFER[i])
        }
        if (maxVal > 0) {
            for (let i = 0; i < sampleRate; i++) {
                WAVE_BUFFER[i] = (WAVE_BUFFER[i] / maxVal) * masterVol
            }
        }

        ctx.beginPath()
        ctx.strokeStyle = '#8EEA3B'
        ctx.lineWidth = 1.5
        for (let i = 0; i < sampleRate; i++) {
            const x = (i / sampleRate) * w
            const y = mid - WAVE_BUFFER[i] * (mid - 4)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.stroke()
    }

    _buildVcoArray() {
        return [1, 2, 3].map(n => {
            const v = this._draft[`vco${n}`] ?? {}
            return {
                wave: v.wave ?? 'sine',
                gain: v.gain ?? (n === 1 ? 1 : 0),
                octave: v.octave ?? 0,
                detune: v.detune ?? 0
            }
        })
    }

    _drawAdsrPath(ctx, pts, scaleX, scaleY) {
        ctx.moveTo(scaleX(pts[0].t), scaleY(pts[0].v))
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(scaleX(pts[i].t), scaleY(pts[i].v))
        }
    }

    _drawAdsrEnvelope(ctx, w, mid) {
        const { attack = 0, decay = 0.12, sustain = 1, release = 0.05 } = this._draft.enveloppe ?? {}
        const totalTime = Math.max(attack + decay + 0.3 + release, 0.5)

        const scaleX = (t) => (t / totalTime) * w
        const scaleY = (v) => mid - v * (mid - 4)
        const pts = [
            { t: 0, v: 0 },
            { t: attack, v: 1 },
            { t: attack + decay, v: sustain },
            { t: totalTime - release, v: sustain },
            { t: totalTime, v: 0 }
        ]

        ctx.beginPath()
        ctx.strokeStyle = '#F24C4C'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        this._drawAdsrPath(ctx, pts, scaleX, scaleY)
        ctx.stroke()
        ctx.setLineDash([])

        ctx.fillStyle = 'rgba(242, 76, 76, 0.15)'
        ctx.beginPath()
        this._drawAdsrPath(ctx, pts, scaleX, scaleY)
        ctx.closePath()
        ctx.fill()
    }

    // ─── Value access ─────────────────────────────────────────────────────

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
        this._commitSound(this._editKey, this._draft)
    }

    // ─── Close / reset ────────────────────────────────────────────────────

    _closeEditor(shouldSave) {
        if (shouldSave && this._editKey && this._draft) {
            this._commitSound(this._editKey, this._draft)
            serviceRegistry.audioEngine?.invalidateCache?.()
            playbackEvents.dispatchPatternChange([this.host._track])
        } else if (!shouldSave && this._editKey && this._original) {
            this._commitSound(this._editKey, this._original)
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
        this._cardCollapsed = {}
        this._cardBypassed = {}
        this._waveTab = 'wave'
    }

    // ─── Utilities ────────────────────────────────────────────────────────

    /** @returns {boolean} true if value is a plain object (not array, not null). */
    _isPlainObject(val) {
        return val != null && typeof val === 'object' && !Array.isArray(val)
    }
}
