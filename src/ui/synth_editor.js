import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import MfResourcesLoader from '../loader/resources_loader.js'
const fmt = v => parseFloat(Number(v).toFixed(2))

const SYNTH_GROUP_DEFAULTS = {
    masterVolume: 0.8,
    slide: 0,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    vco2: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    vco3: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1, filterEnvelopeAmount: 0 },
    lfo: { target: 'NOT', wave: 'sine', freq: 0, depth: 0 },
    noise: { mix: 0, filterType: 'highpass', filterFreq: 1000, filterQ: 1 },
    enveloppe: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 }
}

const SYNTH_SLIDER_META = {
    masterVolume: { min: 0, max: 1, step: 0.01 },
    slide: { min: 0, max: 500, step: 1 },
    'vco1.gain': { min: 0, max: 1, step: 0.01 },
    'vco1.octave': { min: -4, max: 4, step: 1 },
    'vco1.detune': { min: -100, max: 100, step: 1 },
    'vco2.gain': { min: 0, max: 1, step: 0.01 },
    'vco2.octave': { min: -4, max: 4, step: 1 },
    'vco2.detune': { min: -100, max: 100, step: 1 },
    'vco3.gain': { min: 0, max: 1, step: 0.01 },
    'vco3.octave': { min: -4, max: 4, step: 1 },
    'vco3.detune': { min: -100, max: 100, step: 1 },
    'filter.freq': { min: 20, max: 20000, step: 1 },
    'filter.Q': { min: 0.1, max: 24, step: 0.1 },
    'filter.filterEnvelopeAmount': { min: 0, max: 1, step: 0.01 },
    'lfo.freq': { min: 0, max: 20, step: 0.01 },
    'lfo.depth': { min: 0, max: 1, step: 0.01 },
    'noise.mix': { min: 0, max: 1, step: 0.01 },
    'noise.filterFreq': { min: 20, max: 20000, step: 1 },
    'noise.filterQ': { min: 0.1, max: 24, step: 0.1 },
    'enveloppe.attack': { min: 0, max: 2, step: 0.001 },
    'enveloppe.decay': { min: 0, max: 2, step: 0.001 },
    'enveloppe.sustain': { min: 0, max: 1, step: 0.01 },
    'enveloppe.release': { min: 0, max: 3, step: 0.001 }
}

const SYNTH_LFO_TARGETS = [
    'NOT',
    'FLT',
    'VCO1',
    'VCO2',
    'VCO3',
    ...Object.keys(SYNTH_SLIDER_META)
]

export default class SynthEditor {
    constructor(host) {
        this.host = host
        this.panel = null
        this._editKey = null
        this._original = null
        this._draft = null
        this._loading = false
        this._loadFailed = false
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

    getGeneratedSoundKeys() {
        return Object.keys(soundRegistry.generatedSounds || {}).sort((a, b) => a.localeCompare(b))
    }

    async ensureGeneratedSoundsLoaded() {
        if (this._loading || this._loadFailed) return
        if (this.getGeneratedSoundKeys().length > 0) return

        this._loading = true
        try {
            await serviceRegistry.mfResourcesLoader?.loadGeneratedSounds(MfResourcesLoader.GENERATED_SOUNDS_URL)
            serviceRegistry.audioEngine?.updateGeneratedSounds(soundRegistry.generatedSounds)
        } catch (error) {
            this._loadFailed = true
            console.error('SynthEditor: failed to load generated sounds', error)
        } finally {
            this._loading = false
        }
    }

    openEditor() {
        const track = this.host._track
        if (!track) return
        this.ensureGeneratedSoundsLoaded()

        const key = track.synthSoundKey
        const generatedSound = soundRegistry.generatedSounds?.[key]
        if (!key || !generatedSound) return

        this._editKey = key
        this._original = this._clone(generatedSound)
        this._draft = this._clone(generatedSound)
        this._hydrateDraft()

        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
        this.host.container.style.display = 'none'
        this._renderEditor()
        this.panel.style.display = 'block'
    }

    _renderEditor() {
        if (!this._draft || !this._editKey) return

        const groupNames = Object.keys(this._draft)
        let html = `<div class="ss-header">
            <span class="ss-title">Soft Synth: ${this._esc(this._editKey)}</span>
            <div class="ss-actions">
                <button class="ne-btn active" data-action="synth-ok">OK</button>
                <button class="ne-btn" data-action="synth-cancel">Cancel</button>
            </div>
        </div><div class="ss-body">`

        groupNames.forEach(groupName => {
            const value = this._draft[groupName]
            const fields = value && typeof value === 'object' && !Array.isArray(value)
                ? Object.entries(value).map(([key, val]) => ({ path: [groupName, key], key, val }))
                : [{ path: [groupName], key: groupName, val: value }]

            html += `<div class="ss-group">
                <div class="ss-group-label">${this._esc(groupName)}</div>
                <div class="ss-grid">`

            fields.forEach(({ path, key, val }) => {
                html += `<div class="ss-row">
                    <label>${this._esc(key)}</label>
                    ${this._renderControl(path, key, val)}
                </div>`
            })

            html += `</div></div>`
        })

        html += '</div>'
        this.panel.innerHTML = html
        this._bindEvents()
    }

    _hydrateDraft() {
        if (!this._draft) return
        Object.entries(SYNTH_GROUP_DEFAULTS).forEach(([key, defaultValue]) => {
            if (defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
                if (!this._draft[key] || typeof this._draft[key] !== 'object' || Array.isArray(this._draft[key])) {
                    this._draft[key] = this._clone(defaultValue)
                    return
                }
                Object.entries(defaultValue).forEach(([childKey, childDefault]) => {
                    if (this._draft[key][childKey] === undefined) this._draft[key][childKey] = childDefault
                })
            } else if (this._draft[key] === undefined) {
                this._draft[key] = defaultValue
            }
        })
    }

    _renderControl(path, key, val) {
        const pathAttr = this._esc(path.join('.'))
        const options = this._getOptions(path, key)
        if (options) {
            const opts = options.map(opt => {
                const optionValue = typeof opt === 'object' ? opt.value : opt
                const optionLabel = typeof opt === 'object' ? opt.label : opt
                const selected = String(optionValue) === String(val) ? ' selected' : ''
                return `<option value="${this._esc(optionValue)}"${selected}>${this._esc(optionLabel)}</option>`
            }).join('')
            return `<select data-synth-path="${pathAttr}">${opts}</select>`
        }

        if (typeof val === 'boolean') {
            return `<button class="ne-btn ${val ? 'active' : ''}" data-synth-path="${pathAttr}" data-synth-type="boolean">${val ? 'ON' : 'OFF'}</button>`
        }

        if (typeof val === 'number') {
            const meta = SYNTH_SLIDER_META[path.join('.')] ?? { min: 0, max: Math.max(1, Math.ceil(val || 1)), step: Number.isInteger(val) ? 1 : 0.001 }
            return `<div class="ss-control">
                <input type="range" min="${meta.min}" max="${meta.max}" step="${meta.step}" value="${val}" data-synth-path="${pathAttr}">
                <span class="ne-val">${fmt(val)}</span>`
                + `</div>`
        }

        return `<input type="text" value="${this._esc(val ?? '')}" data-synth-path="${pathAttr}">`
    }

    _getOptions(path, key) {
        if (key === 'wave') return Utils.waveList
        if (path[0] === 'filter' && key === 'type') return Utils.filterTypeList
        if (path[0] === 'noise' && key === 'filterType') return Utils.filterTypeList
        if (path[0] === 'lfo' && key === 'target') {
            return SYNTH_LFO_TARGETS.map(target => ({
                value: target,
                label: target === 'NOT' ? 'off' : target
            }))
        }
        return null
    }

    _bindEvents() {
        this.panel.querySelectorAll('input[data-synth-path]').forEach(input => {
            input.addEventListener('input', () => this._onInput(input))
        })
        this.panel.querySelectorAll('select[data-synth-path]').forEach(select => {
            select.addEventListener('change', () => this._setValue(select.dataset.synthPath, select.value))
        })
        this.panel.querySelectorAll('button[data-synth-type="boolean"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const next = !this._getValue(btn.dataset.synthPath)
                this._setValue(btn.dataset.synthPath, next)
                btn.textContent = next ? 'ON' : 'OFF'
                btn.classList.toggle('active', next)
            })
        })
        this.panel.querySelector('[data-action="synth-ok"]')?.addEventListener('click', () => this._closeEditor(true))
        this.panel.querySelector('[data-action="synth-cancel"]')?.addEventListener('click', () => this._closeEditor(false))
    }

    _onInput(input) {
        const current = this._getValue(input.dataset.synthPath)
        const value = typeof current === 'number' ? parseFloat(input.value) : input.value
        this._setValue(input.dataset.synthPath, Number.isNaN(value) ? 0 : value)
        const valueEl = input.nextElementSibling
        if (valueEl?.classList.contains('ne-val')) valueEl.textContent = fmt(value)
    }

    _getValue(pathString) {
        const path = pathString.split('.')
        return path.reduce((obj, key) => obj?.[key], this._draft)
    }

    _setValue(pathString, value) {
        const path = pathString.split('.')
        let target = this._draft
        for (let i = 0; i < path.length - 1; i++) {
            target = target[path[i]]
        }
        target[path[path.length - 1]] = value
        this._previewDraft()
    }

    _previewDraft() {
        if (!this._editKey || !this._draft) return
        soundRegistry.generatedSounds[this._editKey] = this._clone(this._draft)
        serviceRegistry.audioEngine?.updateGeneratedSounds(soundRegistry.generatedSounds)
    }

    _closeEditor(shouldSave) {
        if (shouldSave && this._editKey && this._draft) {
            soundRegistry.generatedSounds[this._editKey] = this._clone(this._draft)
            serviceRegistry.audioEngine?.updateGeneratedSounds(soundRegistry.generatedSounds)
            serviceRegistry.audioEngine?.invalidateCache?.()
            playbackEvents.onPatternChange.forEach(fn => fn())
        } else if (!shouldSave && this._editKey && this._original) {
            soundRegistry.generatedSounds[this._editKey] = this._clone(this._original)
            serviceRegistry.audioEngine?.updateGeneratedSounds(soundRegistry.generatedSounds)
        }

        this.panel.style.display = 'none'
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
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
    }

    _clone(value) {
        return JSON.parse(JSON.stringify(value))
    }

    _esc(str) {
        if (typeof str !== 'string') return String(str ?? '')
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    }
}
