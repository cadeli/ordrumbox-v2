import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import MfResourcesLoader from '../loader/resources_loader.js'
import { bindAccordionToggles, buildAccordionGroup, fmt } from './components/panel_helpers.js'
import { OrSlider } from './components/or_slider.js'
import { logger } from "../core/logger.js"

const SYNTH_GROUP_DEFAULTS = {
    masterVolume: 0.8,
    slide: 0,
    vco1: { gain: 1, octave: 0, detune: 0, wave: 'sine' },
    vco2: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    vco3: { gain: 0, octave: 0, detune: 0, wave: 'sine' },
    filter: { type: 'lowpass', freq: 400, Q: 1, filterEnvelopeAmount: 0 },
    lfo: { target: 'NOT', wave: 'sine', freq: 0, depth: 0 },
    lfo2: { target: 'NOT', wave: 'sine', freq: 0, depth: 0 },
    noise: { mix: 0, filterType: 'highpass', filterFreq: 1000, filterQ: 1 },
    enveloppe: { attack: 0, decay: 0.12, sustain: 1, release: 0.05 }
}



const SYNTH_SLIDER_META = {
    'masterVolume': { min: 0, max: 1, step: 0.01 },
    'slide': { min: 0, max: 500, step: 1 },
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
    'filter.filterEnvelopeAmount': { min: 0, max: 1, step: 0.01, label: 'Env' },
    'lfo.freq': { min: 0, max: 20, step: 0.01 },
    'lfo.depth': { min: 0, max: 1, step: 0.01 },
    'lfo2.freq': { min: 0, max: 20, step: 0.01 },
    'lfo2.depth': { min: 0, max: 1, step: 0.01 },
    'noise.mix': { min: 0, max: 1, step: 0.01 },
    'noise.filterFreq': { min: 20, max: 20000, step: 1 },
    'noise.filterQ': { min: 0.1, max: 24, step: 0.1 },
    'enveloppe.attack': { min: 0, max: 2, step: 0.001 },
    'enveloppe.decay': { min: 0, max: 2, step: 0.001 },
    'enveloppe.sustain': { min: 0, max: 1, step: 0.01 },
    'enveloppe.release': { min: 0, max: 3, step: 0.001 }
}

const SYNTH_LFO_TARGETS = ['NOT', ...Object.keys(SYNTH_SLIDER_META).filter(k => !k.startsWith('lfo.') && !k.startsWith('lfo2.'))]
// Visual group merging: mapped group → array of _draft keys to display together
const SYNTH_GROUP_MERGE = {
    master: ['masterVolume', 'slide']
}
const SYNTH_GROUP_LABELS = {
    master: 'Master',
    filter: 'Flt',
    enveloppe: 'Env'
}
const SYNTH_GROUP_ORDER = ['master', 'vco1', 'vco2', 'vco3', 'filter', 'lfo', 'lfo2', 'noise', 'enveloppe']

export default class SynthEditor {
    constructor(host) {
        this.host = host
        this.panel = null
        this._editKey = null
        this._original = null
        this._draft = null
        this._loading = false
        this._loadFailed = false
        this._groupVisibility = {}
        this._sliders = []
        this._delegationBound = false
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

        // Destroy any previous OrSlider instances (cleans up event listeners)
        this._sliders.forEach(s => s.destroy())
        this._sliders = []
        const sliderConfigs = []

        const groupNames = this._getOrderedGroupNames()
        this._ensureGroupVisibility(groupNames)
        let html = `<div class="ss-header">
            <span class="ss-title">Soft Synth: ${this._esc(this._editKey)}</span>
            <div class="ss-actions">
                <button class="ne-btn active" data-action="synth-ok">OK</button>
                <button class="ne-btn" data-action="synth-cancel">Cancel</button>
            </div>
        </div>`
        html += `<div class="ss-canvas-wrap">
                <canvas id="ss-waveform" width="600" height="120"></canvas>
            </div>
        <div class="ss-body">`

        groupNames.forEach(groupName => {
            const merged = SYNTH_GROUP_MERGE[groupName]
            const isExpanded = this._groupVisibility[groupName]
            const fields = merged
                ? merged.map(key => ({ path: [key], key, val: this._draft[key] }))
                : (this._draft[groupName] && typeof this._draft[groupName] === 'object' && !Array.isArray(this._draft[groupName])
                    ? Object.entries(this._draft[groupName]).map(([key, val]) => ({ path: [groupName, key], key, val }))
                    : [{ path: [groupName], key: groupName, val: this._draft[groupName] }])

            const label = this._getGroupLabel(groupName)

            let groupContent = ''
            fields.forEach(({ path, key, val }) => {
                const meta = SYNTH_SLIDER_META[path.join('.')]
                const label = meta?.label ?? key
                if (typeof val === 'number') {
                    sliderConfigs.push({ path, val })
                    groupContent += this._renderControl(path, key, val)
                } else {
                    groupContent += `<div class="ss-row">
                        <label>${this._esc(label)}</label>
                        ${this._renderControl(path, key, val)}
                    </div>`
                }
            })

            html += buildAccordionGroup(this._esc(groupName), this._esc(label), this._esc(label), isExpanded, groupContent, {
                cssPrefix: 'ss',
                dataAttr: 'data-synth-group',
            })
        })

        html += '</div>'
        this.panel.innerHTML = html
        this._mountSliders(sliderConfigs)
        this._bindEvents()
        this._drawWaveform()
    }

    _mountSliders(configs) {
        configs.forEach(({ path, val }) => {
            const pathStr = path.join('.')
            const placeholder = this.panel.querySelector(`[data-synth-slider="${this._esc(pathStr)}"]`)
            if (!placeholder) return

            const meta = SYNTH_SLIDER_META[pathStr] ?? {
                min: 0, max: Math.max(1, Math.ceil(val || 1)),
                step: Number.isInteger(val) ? 1 : 0.001,
            }

            const slider = new OrSlider({
                key:        pathStr,
                label:      meta.label ?? path[path.length - 1],
                min:        meta.min,
                max:        meta.max,
                step:       meta.step,
                value:      val,
                format:     fmt,
                dataAttr:   'data-synth-path',
                extraClass: 'ss-row',
                onChange:   v => this._onSliderChange(pathStr, v),
            })
            slider._isDelegated = true
            this._sliders.push(slider)
            placeholder.replaceWith(slider.createElement())
        })
    }

    _onSliderChange(pathStr, value) {
        this._setValue(pathStr, Number.isNaN(value) ? 0 : value)
        this._drawWaveform()
    }

    _ensureGroupVisibility(groupNames) {
        groupNames.forEach(groupName => {
            if (this._groupVisibility[groupName] === undefined) {
                this._groupVisibility[groupName] = true
            }
        })
    }

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

    _getGroupLabel(groupName) {
        if (SYNTH_GROUP_LABELS[groupName]) return SYNTH_GROUP_LABELS[groupName]
        if (/^vco\d+$/i.test(groupName)) return groupName.toUpperCase()
        return groupName
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
            // Placeholder for OrSlider — replaced after innerHTML is set
            return `<div class="ss-control" data-synth-slider="${pathAttr}"></div>`
        }

        return `<input type="text" value="${this._esc(val ?? '')}" data-synth-path="${pathAttr}">`
    }

    _getOptions(path, key) {
        if (key === 'wave') return Utils.waveList
        if (path[0] === 'filter' && key === 'type') return Utils.filterTypeList
        if (path[0] === 'noise' && key === 'filterType') return Utils.filterTypeList
        if ((path[0] === 'lfo' || path[0] === 'lfo2') && key === 'target') {
            return SYNTH_LFO_TARGETS.map(target => ({
                value: target,
                label: target === 'NOT' ? 'off' : target
            }))
        }
        return null
    }

    _bindEvents() {
        bindAccordionToggles(this.panel, (key) => {
            this._groupVisibility[key] = !this._groupVisibility[key]
            return Array.from(this.panel.querySelectorAll('[data-synth-group]'))
                .find(group => group.dataset.synthGroup === key)
        })

        if (this._delegationBound) return

        // Event delegation for all inputs, selects and buttons
        this.panel.addEventListener('input', (e) => {
            const target = e.target
            if (target.dataset.synthPath) {
                const slider = this._sliders.find(s => s._input === target)
                if (slider) {
                    slider.handleInput(e)
                } else if (target.tagName === 'INPUT') {
                    this._onInput(target)
                }
            }
        })

        this.panel.addEventListener('keydown', (e) => {
            const target = e.target
            if (target.dataset.synthPath && target.type === 'range') {
                const slider = this._sliders.find(s => s._input === target)
                slider?.handleKeydown(e)
            }
        })

        this.panel.addEventListener('change', (e) => {
            const target = e.target
            if (target.tagName === 'SELECT' && target.dataset.synthPath) {
                this._setValue(target.dataset.synthPath, target.value)
            }
        })

        this.panel.addEventListener('click', (e) => {
            const btn = e.target.closest('button')
            if (!btn) return

            if (btn.dataset.synthType === 'boolean') {
                const next = !this._getValue(btn.dataset.synthPath)
                this._setValue(btn.dataset.synthPath, next)
                btn.textContent = next ? 'ON' : 'OFF'
                btn.classList.toggle('active', next)
            } else if (btn.dataset.action === 'synth-ok') {
                this._closeEditor(true)
            } else if (btn.dataset.action === 'synth-cancel') {
                this._closeEditor(false)
            }
        })

        this._delegationBound = true
    }

    _drawWaveform() {
        const canvas = this.panel.querySelector('#ss-waveform')
        if (!canvas || !this._draft) return
        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const h = canvas.height
        const mid = h / 2

        ctx.fillStyle = '#0d0d1a'
        ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = '#333'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, mid)
        ctx.lineTo(w, mid)
        ctx.stroke()

        this._drawOscillators(ctx, w, mid)
        this._drawAdsrEnvelope(ctx, w, mid)
    }

    _drawOscillators(ctx, w, mid) {
        const draft = this._draft
        const vcos = [
            { wave: draft.vco1?.wave ?? (logger.warn('SE', 'vco1.wave fallback'), 'sine'), gain: draft.vco1?.gain ?? 1, octave: draft.vco1?.octave ?? 0, detune: draft.vco1?.detune ?? 0 },
            { wave: draft.vco2?.wave ?? (logger.warn('SE', 'vco2.wave fallback'), 'sine'), gain: draft.vco2?.gain ?? 0, octave: draft.vco2?.octave ?? 0, detune: draft.vco2?.detune ?? 0 },
            { wave: draft.vco3?.wave ?? (logger.warn('SE', 'vco3.wave fallback'), 'sine'), gain: draft.vco3?.gain ?? 0, octave: draft.vco3?.octave ?? 0, detune: draft.vco3?.detune ?? 0 }
        ]

        const masterVol = draft.masterVolume ?? 1.0
        const cycles = 4
        const sampleRate = 1024
        const samplesPerCycle = Math.floor(sampleRate / cycles)
        const mix = new Float32Array(sampleRate)

        vcos.forEach(vco => {
            if (vco.gain <= 0) return
            const freqMult = Math.pow(2, vco.octave) * Math.pow(2, vco.detune / 1200)
            for (let i = 0; i < sampleRate; i++) {
                const t = i / sampleRate
                const phase = (t * cycles * freqMult * samplesPerCycle) % samplesPerCycle
                const p = phase / samplesPerCycle
                let val = 0
                switch (vco.wave) {
                    case 'sine': val = Math.sin(2 * Math.PI * p); break
                    case 'square': val = Math.sin(2 * Math.PI * p) >= 0 ? 1 : -1; break
                    case 'sawtooth': val = 2 * p - 1; break
                    case 'triangle': val = 4 * Math.abs(p - 0.5) - 1; break
                    default: val = Math.sin(2 * Math.PI * p)
                }
                mix[i] += val * vco.gain
            }
        })

        let maxVal = 0
        for (let i = 0; i < sampleRate; i++) {
            if (Math.abs(mix[i]) > maxVal) maxVal = Math.abs(mix[i])
        }
        if (maxVal > 0) {
            for (let i = 0; i < sampleRate; i++) {
                mix[i] = (mix[i] / maxVal) * masterVol
            }
        }

        ctx.beginPath()
        ctx.strokeStyle = '#00ff88'
        ctx.lineWidth = 2
        for (let i = 0; i < sampleRate; i++) {
            const x = (i / sampleRate) * w
            const y = mid - mix[i] * (mid - 4)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.stroke()
    }

    _drawAdsrEnvelope(ctx, w, mid) {
        const draft = this._draft
        const attack = draft.enveloppe?.attack ?? 0
        const decay = draft.enveloppe?.decay ?? 0.12
        const sustain = draft.enveloppe?.sustain ?? 1
        const release = draft.enveloppe?.release ?? 0.05
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
        ctx.strokeStyle = '#e94560'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.moveTo(scaleX(pts[0].t), scaleY(pts[0].v))
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(scaleX(pts[i].t), scaleY(pts[i].v))
        }
        ctx.stroke()
        ctx.setLineDash([])

        ctx.fillStyle = 'rgba(233, 69, 96, 0.15)'
        ctx.beginPath()
        ctx.moveTo(scaleX(pts[0].t), scaleY(pts[0].v))
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(scaleX(pts[i].t), scaleY(pts[i].v))
        }
        ctx.closePath()
        ctx.fill()
    }

    _onInput(input) {
        const current = this._getValue(input.dataset.synthPath)
        const value = typeof current === 'number' ? parseFloat(input.value) : input.value
        this._setValue(input.dataset.synthPath, Number.isNaN(value) ? 0 : value)
        const valueEl = input.nextElementSibling
        if (valueEl?.classList.contains('ne-val')) valueEl.textContent = fmt(value)
        this._drawWaveform()
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
            playbackEvents.dispatchPatternChange()
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
