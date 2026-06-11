import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import Utils from '../core/utils.js'
import { computeLfoValue } from '../audio/math.js'
import { TICK } from '../core/constants.js'
import InstrumentsManager from '../logic/services/instruments_manager.js'
import MfAutoAssign from '../logic/services/auto_assign.js'
import SynthEditor from './synth_editor.js'
import { OrSlider } from './components/or_slider.js'
import { bindCloseButton, bindVisibilityToggles, positionBelowPatternPanel } from './panel_helpers.js'
import { recalcLoopDerived } from '../model/track_schema.js'
import BasePanel from './base_panel.js'

const fmt = v => parseFloat(Number(v).toFixed(2))
const fmtFreq = v => {
    const hz = Utils.normalizeTrackFilterFreqValue(v)
    return hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : Math.round(hz) + 'Hz'
}
const fmtVal = (key, v) => key === 'filterFreq' ? fmtFreq(v) : fmt(v)

const GROUPS = [
    {
        label: 'Basic / Transport',
        props: [
            { key: 'mute', label: 'Mute', type: 'boolean' },
            { key: 'mono', label: 'Mono', type: 'boolean' },
            { key: 'auto', label: 'Auto', type: 'boolean' },

        ]
    },
    {
        label: 'Levels / Pitch',
        props: [
            { key: 'velocity', label: 'Velo', min: 0, max: 1, step: 0.01, lfo: 'velocityLfo' },
            { key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.01, lfo: 'panLfo' },
            { key: 'pitch', label: 'Pitch', min: -24, max: 24, step: 1, lfo: 'pitchLfo' },
            { key: 'sampleLength', label: 'Len', min: 0, max: 1, step: 0.01 }
        ]
    },
    {
        label: 'Filters',
        props: [
            { key: 'filterType', label: 'Type', type: 'select', options: Utils.filterTypeList },
            { key: 'filterFreq', label: 'Freq', min: 0, max: 1, step: 0.01, lfo: 'filterFreqLfo' },
            { key: 'filterQ', label: 'Q', min: 0, max: 1, step: 0.01, lfo: 'filterQLfo' }
        ]
    },
    {
        label: 'Effects',
        props: [
            { key: 'reverbAmount', label: 'RevV', min: 0, max: 1, step: 0.01 },
            { key: 'reverbType', label: 'RevT', type: 'select', options: ['none', 'room', 'hall', 'plate', 'spring', 'gated'] },
            { key: 'delayAmount', label: 'DelV', min: 0, max: 1, step: 0.01 },
            { key: 'delayTime', label: 'DelT', type: 'select', options: Utils.delayTimeValues, labels: Utils.delayTimeLabels },
            { key: 'delayType', label: 'DelTy', type: 'select', options: ['none', 'slap', 'tape', 'pingpong'] },
            { key: 'saturationAmount', label: 'SatV', min: 0, max: 1, step: 0.01 },
            { key: 'saturationType', label: 'SatT', type: 'select', options: ['soft', 'hard', 'tape'] }
        ]
    }
]

export default class TrackEditor extends BasePanel {
    constructor() {
        super('te-panel')
        this._track = null
        this._trackIdx = -1
        this._selectedPropKey = null
        this._rafId = null
        this._isDragging = false
        this._sliders = new Map()
        this.synthEditor = new SynthEditor(this)
    }

    createDOM() {
        super.createDOM()
        this.synthEditor.createDOM()
    }

    subscribe() {
        playbackEvents.onTrackSelect.push((data) => {
            if (!data) { this.hide(); return }
            playbackEvents.dispatchNoteSelect(null)
            this.show(data)
        })
        playbackEvents.onNoteSelect.push((data) => {
            if (data) this.hide()
        })
        playbackEvents.onOutputToggle.push(() => this.hide())
        playbackEvents.onPlaybackStart.push(() => {
            this._startAnimation()
        })
        playbackEvents.onPlaybackStop.push(() => {
            if (this._rafId) {
                cancelAnimationFrame(this._rafId)
                this._rafId = null
            }
        })
        playbackEvents.onDrumkitChange.push(() => {
            if (this._track) this.sync()
        })
        playbackEvents.onPatternChange.push(() => {
            if (this._isDragging) return
            if (!this._track) return
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern?.tracks) { this.hide(); return }
            const newIdx = pattern.tracks.findIndex(t => t?.name === this._track.name)
            if (newIdx === -1) {
                this.hide()
                return
            }
            if (pattern.tracks[newIdx] !== this._track) {
                this._track = pattern.tracks[newIdx]
                this._trackIdx = newIdx
                this.sync()
            }
        })
    }

    _startAnimation() {
        if (this._rafId) return
        const animate = () => {
            const transport = serviceRegistry.transport
            if (!transport?.isRunning) {
                this._rafId = null
                return
            }
            this._rafId = requestAnimationFrame(animate)
            this._updateLfoSliders()
        }
        this._rafId = requestAnimationFrame(animate)
    }

    _updateLfoSliders() {
        if (!this._track || !this.isVisible) return
        const transport = serviceRegistry.transport
        if (!transport?.isRunning) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        const nbTicks = TICK * (pattern?.nbBars ?? 4)
        const tick = transport.tick ?? 0

        GROUPS.forEach(g => {
            g.props.forEach(p => {
                if (p.lfo && this._track[p.lfo]) {
                    const s = this._sliders.get(p.key)
                    if (s) {
                        const lfoVal = computeLfoValue(this._track[p.lfo], tick, nbTicks, p.key)
                        s.setValue(lfoVal)
                    }
                }
            })
        })
    }

    show({ track, trackIdx }) {
        this._track = track
        this._trackIdx = trackIdx
        super.show(['ne-panel', 'tools-panel', 'output-panel', 'about-panel'])
        void this.synthEditor.ensureGeneratedSoundsLoaded()
        if (serviceRegistry.transport?.isRunning) {
            this._startAnimation()
        }
    }

    sync() {
        if (!this._track) return

        const vis = appState.trackEditorVisibility
        const soundInfo = this._getSoundInfo()
        
        let headerHtml = `<div class="ne-header">
            <span class="ne-track">Track: ${this.esc(this._track.name)}${soundInfo ? ' - ' + this.esc(soundInfo) : ''}</span>
            <button class="ne-close">&times;</button>
        </div>`

        let bodyHtml = `<div class="ne-body">`

        this._sliders.forEach(s => s.destroy())
        this._sliders.clear()

        const shortLabels = {
            basic: 'Basic',
            levels: 'Lvl',
            filters: 'Flt',
            effects: 'FX'
        }

        GROUPS.forEach((g, idx) => {
            const visKey = ['basic', 'levels', 'filters', 'effects'][idx]
            const isExpanded = vis[visKey]

            if (g.label === 'Effects') {
                bodyHtml += this._renderFxGroup(isExpanded)
                return
            }
            bodyHtml += `<div class="ne-group ${isExpanded ? 'expanded' : 'collapsed'}" data-group="${visKey}">
                <button class="ne-group-accordion-toggle ne-toggle ${isExpanded ? 'active' : ''}" data-toggle="${visKey}" title="${g.label}">
                    <span class="ne-group-accordion-icon">${isExpanded ? '&minus;' : '+'}</span>
                    <span class="ne-group-accordion-label">${shortLabels[visKey]}</span>
                </button>
                <div class="ne-group-content">
                    <div class="ne-group-label">${g.label}</div>
                    <div class="ne-grid">`
            g.props.forEach(p => {
                const val = this._track[p.key]
                const isSelected = this._selectedPropKey === p.key ? 'selected' : ''
                const hasLfo = p.lfo && this._track[p.lfo] ? 'has-lfo' : ''
                
                if (p.type === 'boolean') {
                    const active = val ? 'active' : ''
                    bodyHtml += `<div class="ne-row ${isSelected} ${hasLfo}" data-prop="${p.key}">
                             <label>${p.label}</label>
                             <button class="ne-btn ${active}" data-key="${p.key}">${val ? 'ON' : 'OFF'}</button>
                             </div>`
                } else if (p.type === 'select') {
                    bodyHtml += `<div class="ne-row ${isSelected} ${hasLfo}" data-prop="${p.key}">
                             <label>${p.label}</label>
                             <select data-key="${p.key}">`
                    p.options.forEach((opt, idx) => {
                        const label = p.labels ? p.labels[idx] : opt
                        const sel = String(opt) === String(val) ? ' selected' : ''
                        bodyHtml += `<option value="${opt}"${sel}>${label}</option>`
                    })
                    bodyHtml += `</select></div>`
                } else {
                    const s = new OrSlider({
                        key: p.key,
                        label: p.label,
                        min: p.min,
                        max: p.max,
                        step: p.step,
                        value: val ?? p.min,
                        hasLfo: !!(p.lfo && this._track[p.lfo]),
                        extraClass: isSelected,
                        format: (v) => fmtVal(p.key, v),
                        normalize: (v) => {
                            if (p.key === 'filterFreq' && v > 1) return Utils.hzToNormalizedTrackFilterFreq(v)
                            if (p.key === 'filterQ' && v > 1) return Utils.valueToNormalizedTrackFilterQ(v)
                            return v
                        },
                        denormalize: (v) => v, // We keep the slider in [0..1] range for normalized props
                        onChange: (v, key) => {
                            this._isDragging = true
                            this._track[key] = v
                            playbackEvents.dispatchTrackParamChange(this._track)
                        }
                    })
                    this._sliders.set(p.key, s)
                    bodyHtml += s.toHTML()
                }
            })
            bodyHtml += `</div></div></div>`
        })

        // LFO Sub-panel (visible if parent prop is visible)
        if (this._selectedPropKey) {
            const prop = this._findProp(this._selectedPropKey)
            if (prop && prop.lfo) {
                const groupIdx = GROUPS.findIndex(g => g.props.includes(prop))
                const visKey = ['basic', 'levels', 'filters', 'effects'][groupIdx]
                if (vis[visKey]) {
                    bodyHtml += this._renderLfoPanel(prop)
                }
            }
        }

        // Sound Sub-panel
        bodyHtml += this._renderSoundPanel(vis.sound)

        // Loop / Pattern Sub-panel
        bodyHtml += this._renderLoopPanel(vis.loop)

        bodyHtml += '</div>'
        this.container.innerHTML = headerHtml + bodyHtml
        
        // Mount main sliders
        this._sliders.forEach(s => {
            const row = this.container.querySelector(`.ne-row[data-or-slider="${s._key}"]`)
            if (row) {
                s.mount(row)
                // Reset dragging on release
                s._input.addEventListener('change', () => {
                    this._isDragging = false
                    playbackEvents.dispatchPatternChange()
                })
            }
        })

        if (this.synthEditor?.panel?.style?.display !== 'block') {
            this.container.style.display = 'block'
        }
        this.reposition()
        this._bindEvents()
    }

    _renderLoopPanel(isExpanded) {
        const bars = this._track.bars ?? 4
        const barQuantize = this._track.barQuantize ?? 4
        const loopAtStep = this._track.loopAtStep ?? (bars * barQuantize)
        const maxSteps = bars * barQuantize
        const swing = this._track.swingAmount ?? 0

        const fmtLoopPoint = (step) => {
            const b = Math.floor((step - 1) / barQuantize) + 1
            const s = ((step - 1) % barQuantize) + 1
            return `${b}.${s}`
        }

        let html = `<div class="ne-group ${isExpanded ? 'expanded' : 'collapsed'}" data-group="loop">
            <button class="ne-group-accordion-toggle ne-toggle ${isExpanded ? 'active' : ''}" data-toggle="loop" title="Loop">
                <span class="ne-group-accordion-icon">${isExpanded ? '&minus;' : '+'}</span>
                <span class="ne-group-accordion-label">Lp</span>
            </button>
            <div class="ne-group-content">
                <div class="ne-group-label">Loop / Pattern</div>
                <div class="ne-grid">`

        const loopProps = [
            { key: 'barQuantize', label: 'Steps/Bar', min: 1, max: 8, step: 1, val: barQuantize },
            { key: 'bars',        label: 'Bars',      min: 1, max: 8, step: 1, val: bars },
            { key: 'loopAtStep',  label: 'Loop Point', min: 1, max: maxSteps, step: 1, val: loopAtStep, format: fmtLoopPoint },
            { key: 'swingAmount', label: 'Swing',     min: 0, max: 1, step: 0.01, val: swing }
        ]

        loopProps.forEach(p => {
            const s = new OrSlider({
                key: p.key,
                label: p.label,
                min: p.min,
                max: p.max,
                step: p.step,
                value: p.val,
                format: p.format,
                dataAttr: 'data-loop',
                onChange: (v, key) => this._onLoopSlider({ dataset: { loop: key }, value: v })
            })
            this._sliders.set(p.key, s)
            html += s.toHTML()
        })

        html += `</div></div></div>`
        return html
    }

    _renderFxGroup(isExpanded) {
        const fxDefs = [
            { key: 'reverbOn', label: 'Rev', controls: ['reverbAmount', 'reverbType'] },
            { key: 'delayOn', label: 'Del', controls: ['delayAmount', 'delayTime', 'delayType'] },
            { key: 'saturationOn', label: 'Sat', controls: ['saturationAmount', 'saturationType'] }
        ]

        let html = `<div class="ne-group ${isExpanded ? 'expanded' : 'collapsed'}" data-group="effects">
            <button class="ne-group-accordion-toggle ne-toggle ${isExpanded ? 'active' : ''}" data-toggle="effects" title="Effects">
                <span class="ne-group-accordion-icon">${isExpanded ? '&minus;' : '+'}</span>
                <span class="ne-group-accordion-label">FX</span>
            </button>
            <div class="ne-group-content">
                <div class="ne-group-label">Effects</div>`

        if (isExpanded) {
            html += `<div class="fx-tabs">`
            fxDefs.forEach((fx, i) => {
                const activeClass = i === 0 ? ' active' : ''
                html += `<button class="fx-tab-btn${activeClass}" data-fx-tab="${i}" title="${fx.label}">${i + 1}</button>`
            })
            html += `</div>`
        }

        fxDefs.forEach((fx, idx) => {
            const on = this._isFxOn(fx)
            const ledClass = on ? 'lfo-led on' : 'lfo-led'
            const hiddenStyle = idx > 0 && isExpanded ? ' style="display:none"' : ''

            html += `<div class="fx-tab-panel"${hiddenStyle} data-fx-panel="${idx}">
                <div class="ne-grid">
                    <div class="ne-row">
                        <button class="${ledClass}" data-fx-toggle="${fx.key}" title="${on ? 'Disable' : 'Enable'} ${fx.label}"></button>
                        <label style="min-width:24px;margin-right:8px">${fx.label}</label>
                    </div>`

            if (on) {
                fx.controls.forEach(ck => {
                    const prop = GROUPS.flatMap(g => g.props).find(p => p.key === ck)
                    if (!prop) return
                    const val = this._track[ck]
                    if (prop.type === 'select') {
                        html += `<div class="ne-row" data-prop="${ck}">
                            <label style="min-width:20px">${prop.label}</label>
                            <select data-key="${ck}">`
                        prop.options.forEach((opt, idx2) => {
                            const label = prop.labels ? prop.labels[idx2] : opt
                            const sel = String(opt) === String(val) ? ' selected' : ''
                            html += `<option value="${opt}"${sel}>${label}</option>`
                        })
                        html += `</select></div>`
                    } else {
                        const s = new OrSlider({
                            key: ck,
                            label: prop.label,
                            min: prop.min,
                            max: prop.max,
                            step: prop.step,
                            value: val ?? prop.min,
                            onChange: (v, key) => {
                                this._track[key] = v
                                playbackEvents.dispatchTrackParamChange(this._track)
                            }
                        })
                        this._sliders.set(ck, s)
                        html += s.toHTML()
                    }
                })
            }

            html += `</div></div>`
        })

        html += `</div></div>`
        return html
    }

    _isFxOn(fx) {
        if (typeof this._track[fx.key] === 'boolean') return this._track[fx.key]
        const amount = Number(this._track[fx.controls[0]] ?? 0)
        return Number.isFinite(amount) && amount > 0
    }

    _renderSoundPanel(isExpanded) {
        const auto = this._track.useAutoAssignSound !== false
        const ledClass = auto ? 'lfo-led on' : 'lfo-led'
        const generatedSoundKeys = this.synthEditor.getGeneratedSoundKeys()
        const currentGeneratedSound = this._track.useSoftSynth === true
            ? (this._track.synthSoundKey || 'BASS1')
            : 'none'

        const keysWithSamples = new Set(
            soundRegistry.drumkitList.flatMap(kit => kit.instruments.map(s => s.key))
        )
        const instrumentIds = InstrumentsManager.DATA.instruments
            .map(i => i.id)
            .filter(id => keysWithSamples.has(id))
            .sort()
        const currentName = this._getCurrentInstrumentName(instrumentIds, keysWithSamples)
        const currentSoundId = this._getCurrentSoundUrl()
        const matchingSounds = this._getSamplesForInstrument(currentName)

        let html = `<div class="ne-group ${isExpanded ? 'expanded' : 'collapsed'}" data-group="sound">
            <button class="ne-group-accordion-toggle ne-toggle ${isExpanded ? 'active' : ''}" data-toggle="sound" title="Sound">
                <span class="ne-group-accordion-icon">${isExpanded ? '&minus;' : '+'}</span>
                <span class="ne-group-accordion-label">Snd</span>
            </button>
            <div class="ne-group-content">
                <div class="ne-group-label">
                    <button class="${ledClass}" data-action="toggle-auto" title="${auto ? 'Disable' : 'Enable'} auto-assign"></button>
                    autoassign
                </div>
                <div class="ne-grid">
                    <div class="ne-row">
                        <label>Instr</label>
                        <select data-sound="instrument">`
        instrumentIds.forEach(id => {
            const sel = id === currentName ? ' selected' : ''
            html += `<option value="${id}"${sel}>${id}</option>`
        })
        html += `</select></div>
                <div class="ne-row">
                    <label>Sample</label>
                    <select data-sound="sample">`
        if (matchingSounds.length === 0) {
            html += `<option value="">— no samples —</option>`
        } else {
            matchingSounds.forEach(s => {
                const sel = s.url === currentSoundId ? ' selected' : ''
                const label = `${s.kitName} / ${s.display_name || s.url}`
                html += `<option value="${s.url}"${sel}>${label}</option>`
            })
        }
        html += `</select></div>
            </div>
            <div class="ne-grid">
                <div class="ne-row" style="border-top:1px solid #444;margin-top:6px;padding-top:6px">
                    <label>Gen</label>
                    <select data-sound="generated">
                        <option value="none"${currentGeneratedSound === 'none' ? ' selected' : ''}>none</option>`
        generatedSoundKeys.forEach(key => {
            const sel = key === currentGeneratedSound ? ' selected' : ''
            html += `<option value="${this.esc(key)}"${sel}>${this.esc(key)}</option>`
        })
        if (this._track.useSoftSynth === true && !generatedSoundKeys.includes(currentGeneratedSound)) {
            html += `<option value="${this.esc(currentGeneratedSound)}" selected>${this.esc(currentGeneratedSound)}</option>`
        }
        html += `</select></div>
                <div class="ne-row" data-sound-edit-row style="display:${currentGeneratedSound === 'none' ? 'none' : 'flex'}">
                    <label>Edit</label>
                    <button class="ne-btn" data-action="edit-synth">Edit</button>
                </div>
            </div>
        </div></div>`
        return html
    }

    _getSelectedDrumkitName() {
        return soundRegistry.drumkitList[appState.selectedDrumkitNum]?.name ?? ''
    }

    _getAllKitSamples() {
        return soundRegistry.drumkitList.flatMap(kit =>
            kit.instruments.map(s => ({ ...s, kitName: kit.name }))
        )
    }

    _sortSamplesForCurrentKit(samples) {
        const selectedKitName = this._getSelectedDrumkitName()
        return [...samples].sort((a, b) => {
            const aSelected = a.kitName === selectedKitName ? 0 : 1
            const bSelected = b.kitName === selectedKitName ? 0 : 1
            if (aSelected !== bSelected) return aSelected - bSelected
            const kitCompare = String(a.kitName ?? '').localeCompare(String(b.kitName ?? ''))
            if (kitCompare !== 0) return kitCompare
            return (a.display_name || a.url).localeCompare(b.display_name || b.url)
        })
    }

    _getSamplesForInstrument(instrumentId) {
        return this._sortSamplesForCurrentKit(
            this._getAllKitSamples().filter(s => s.key === instrumentId)
        )
    }

    _getPreferredSampleForInstrument(instrumentId) {
        return this._getSamplesForInstrument(instrumentId)[0] ?? null
    }

    _getCurrentSoundUrl() {
        const soundId = this._track.soundId ?? ''
        return soundRegistry.sounds[soundId]?.url ?? soundId
    }

    _getSoundInfo() {
        if (this._track.useSoftSynth === true) {
            return this._track.synthSoundKey || null
        }
        const sound = soundRegistry.sounds[this._track.soundId]
        if (!sound) return null
        const kit = sound.kit_name || ''
        const name = sound.display_name || sound.key || sound.url || ''
        return kit ? `${kit}/${name}` : name
    }

    _getCurrentInstrumentName(instrumentIds, keysWithSamples) {
        if (keysWithSamples.has(this._track.name)) return this._track.name
        const soundKey = soundRegistry.sounds[this._getCurrentSoundUrl()]?.key
        if (soundKey && keysWithSamples.has(soundKey)) return soundKey
        return instrumentIds[0] ?? 'KICK'
    }

    _findProp(key) {
        for (const g of GROUPS) {
            for (const p of g.props) {
                if (p.key === key) return p
            }
        }
        return null
    }

    _renderLfoPanel(prop) {
        const lfoKey = prop.lfo
        const lfo = this._track[lfoKey]
        
        const ledClass = lfo ? 'lfo-led on' : 'lfo-led'
        const ledTitle = lfo ? 'Disable LFO' : 'Enable LFO'
        let lfoHtml = `<div class="ne-group lfo-panel">
            <div class="lfo-header">
                <button class="${ledClass}" data-action="toggle-lfo" title="${ledTitle}"></button>
                <div class="ne-group-label">LFO: ${prop.label}</div>
            </div>
            <div class="ne-grid">`
        
        if (lfo) {
            lfoHtml += `<div class="ne-row">
                <label>Freq</label>
                <input type="range" min="0.1" max="16" step="0.1" value="${lfo.freq}" data-lfo-key="freq">
                <span class="ne-val">${fmt(lfo.freq)}</span>
            </div>`
            lfoHtml += `<div class="ne-row">
                <label>Range</label>
                <div class="ne-range-container">
                    <input type="range" min="${prop.min}" max="${prop.max}" step="${prop.step}" 
                        value="${lfo.min}" data-lfo-key="min" title="Min">
                    <input type="range" min="${prop.min}" max="${prop.max}" step="${prop.step}" 
                        value="${lfo.max}" data-lfo-key="max" title="Max">
                </div>
                <span class="ne-val" style="min-width:60px">${fmt(lfo.min)}..${fmt(lfo.max)}</span>
            </div>`
            lfoHtml += `<div class="ne-row">
                <label>Phas</label>
                <input type="range" min="0" max="1" step="0.01" value="${lfo.phase}" data-lfo-key="phase">
                <span class="ne-val">${fmt(lfo.phase)}</span>
            </div>`
        }
        
        lfoHtml += `</div></div>`
        return lfoHtml
    }

    _bindEvents() {
        bindVisibilityToggles(this.container, appState.trackEditorVisibility, () => this.sync())

        this.container.querySelectorAll('select[data-key]').forEach(sel => {
            sel.addEventListener('change', () => this._onSelect(sel))
        })
        this.container.querySelectorAll('.ne-btn[data-key]').forEach(btn => {
            btn.addEventListener('click', () => this._onToggle(btn))
        })
        this.container.querySelectorAll('.ne-row[data-prop]').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return
                this._onRowClick(row.dataset.prop)
            })
        })
        
        const lfoPanel = this.container.querySelector('.lfo-panel')
        if (lfoPanel) {
            lfoPanel.querySelectorAll('input[type=range]').forEach(input => {
                input.addEventListener('input', () => this._onLfoSlider(input))
                input.addEventListener('change', () => {
                    this._isDragging = false
                    playbackEvents.dispatchPatternChange()
                })
            })
            lfoPanel.querySelectorAll('select').forEach(sel => {
                sel.addEventListener('change', () => this._onLfoSelect(sel))
            })
            lfoPanel.querySelector('[data-action="toggle-lfo"]')?.addEventListener('click', () => this._toggleLfo())
        }

        this.container.querySelectorAll('[data-fx-toggle]').forEach(btn => {
            btn.addEventListener('click', () => this._toggleFx(btn))
        })

        this.container.querySelectorAll('[data-fx-tab]').forEach(btn => {
            btn.addEventListener('click', () => this._onFxTab(btn))
        })

        this.container.querySelector('[data-action="toggle-auto"]')?.addEventListener('click', () => {
            this._track.useAutoAssignSound = this._track.useAutoAssignSound === false
            if (this._track.useAutoAssignSound) {
                this._track.useSoftSynth = false
                this._track.synthSoundKey = null
                const aa = new MfAutoAssign()
                aa.autoAssignTrackSounds(this._track)
            }
            this.sync()
            playbackEvents.dispatchPatternChange()
        })
        this.container.querySelector('[data-sound="instrument"]')?.addEventListener('change', async (e) => {
            const newName = e.target.value
            serviceRegistry.mfCmd.changeTrackName(this._track, newName)
            const firstSample = this._getPreferredSampleForInstrument(newName)
            if (firstSample) {
                if (!soundRegistry.sounds[firstSample.url]?.buffer) {
                    await serviceRegistry.mfResourcesLoader.loadSample(firstSample, firstSample.kitName)
                }
                serviceRegistry.mfCmd.changeTrackSound(this._track, firstSample.url)
            }
            this.sync()
            playbackEvents.dispatchPatternChange()
        })
        this.container.querySelector('[data-sound="sample"]')?.addEventListener('change', async (e) => {
            const url = e.target.value
            if (!soundRegistry.sounds[url]?.buffer) {
                let foundKit, foundSample
                for (const kit of soundRegistry.drumkitList) {
                    const s = kit.instruments.find(i => i.url === url)
                    if (s) { foundKit = kit; foundSample = s; break }
                }
                if (foundSample && foundKit) {
                    await serviceRegistry.mfResourcesLoader.loadSample(foundSample, foundKit.name)
                }
            }
            serviceRegistry.mfCmd.changeTrackSound(this._track, url)
            playbackEvents.dispatchPatternChange()
        })
        this.container.querySelector('[data-sound="generated"]')?.addEventListener('change', async (e) => {
            const key = e.target.value
            if (key === 'none') {
                this._track.useSoftSynth = false
            } else {
                if (!soundRegistry.generatedSounds[key]) {
                    await this.synthEditor.ensureGeneratedSoundsLoaded()
                }
                this._track.useSoftSynth = true
                this._track.useAutoAssignSound = false
                this._track.synthSoundKey = key
            }
            this.sync()
            playbackEvents.dispatchPatternChange()
        })
        this.container.querySelector('[data-action="edit-synth"]')?.addEventListener('click', () => {
            this.synthEditor.openEditor()
        })

        bindCloseButton(this.container, () => this.hide())
    }

    _onRowClick(propKey) {
        this._selectedPropKey = propKey
        this.sync()
    }

    _toggleFx(btn) {
        const key = btn.dataset.fxToggle
        const fx = [
            { key: 'reverbOn', controls: ['reverbAmount'] },
            { key: 'delayOn', controls: ['delayAmount'] },
            { key: 'saturationOn', controls: ['saturationAmount'] }
        ].find(def => def.key === key)
        this._track[key] = fx ? !this._isFxOn(fx) : !this._track[key]
        this.sync()
        playbackEvents.dispatchPatternChange()
    }

    _onFxTab(btn) {
        const tabIdx = btn.dataset.fxTab
        this.container.querySelectorAll('.fx-tab-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.container.querySelectorAll('.fx-tab-panel').forEach(p => {
            p.style.display = p.dataset.fxPanel === tabIdx ? '' : 'none'
        })
    }

    _toggleLfo() {
        const prop = this._findProp(this._selectedPropKey)
        if (!prop || !prop.lfo) return
        if (this._track[prop.lfo]) {
            delete this._track[prop.lfo]
        } else {
            this._track[prop.lfo] = {
                type: 'sine',
                freq: 1,
                min: prop.min,
                max: prop.max,
                phase: 0
            }
        }
        this.sync()
        playbackEvents.dispatchPatternChange()
    }

    _onLfoSlider(input) {
        this._isDragging = true
        const prop = this._findProp(this._selectedPropKey)
        const lfo = this._track[prop.lfo]
        if (!lfo) return
        const key = input.dataset.lfoKey
        lfo[key] = parseFloat(input.value)
        
        if (key === 'min' || key === 'max') {
            const row = input.closest?.('.ne-row')
            const valEl = row?.querySelector('.ne-val')
            if (valEl) valEl.textContent = `${fmt(lfo.min)}..${fmt(lfo.max)}`
        } else {
            if (input.nextElementSibling) {
                input.nextElementSibling.textContent = fmt(input.value)
            }
        }
        playbackEvents.dispatchTrackParamChange(this._track)
    }

    _onLfoSelect(sel) {
        const prop = this._findProp(this._selectedPropKey)
        const lfo = this._track[prop.lfo]
        if (!lfo) return
        lfo.type = sel.value
        playbackEvents.dispatchTrackParamChange(this._track)
    }

    hide() {
        if (!this.isVisible) return
        super.hide()
        this.synthEditor.reset()
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        
        this._track = null
        this._trackIdx = -1
        this._selectedPropKey = null
    }

    _onLoopSlider(input) {
        if (!this._track) return
        this._isDragging = true
        const key = input.dataset.loop
        const val = key === 'swingAmount' ? parseFloat(input.value) : parseInt(input.value)
        const oldBarQuantize = this._track.barQuantize

        if (key === 'bars') {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (pattern) {
                pattern.nbBars = val
                pattern.tracks.forEach(t => {
                    t.bars = val
                    const maxSteps = val * (t.barQuantize ?? 4)
                    if (t.loopAtStep > maxSteps) {
                        t.loopAtStep = maxSteps
                        recalcLoopDerived(t)
                    }
                })
            }
        } else {
            this._track[key] = val
        }

        if (key === 'barQuantize') {
            if (this._track.notes) {
                this._track.notes.forEach(note => {
                    const steppc = note.steppc ?? Math.round((note.barStep * 100) / (oldBarQuantize || 4))
                    note.barStep = Math.floor((steppc / 100) * val)
                })
            }
        }

        const maxSteps = (this._track.bars ?? 4) * (this._track.barQuantize ?? 4)
        if (this._track.loopAtStep > maxSteps) {
            this._track.loopAtStep = maxSteps
        }

        recalcLoopDerived(this._track)

        if (input.nextElementSibling) {
            input.nextElementSibling.textContent = key === 'swingAmount' ? fmt(val) : val
        }
        
        const loopSlider = this._sliders.get('loopAtStep')
        if (loopSlider) {
            loopSlider.setMax?.(maxSteps)
            if (key !== 'loopAtStep') {
                loopSlider.setValue(this._track.loopAtStep)
            }
        }
        
        if (key === 'loopAtStep') {
            playbackEvents.dispatchLoopPointChange({
                trackIdx: this._trackIdx,
                loopAtStep: this._track.loopAtStep
            })
        }
        
        if (key === 'swingAmount') {
            playbackEvents.dispatchTrackParamChange(this._track)
        } else {
            playbackEvents.dispatchPatternChange()
        }
    }

    _onSelect(sel) {
        if (!this._track) return
        const key = sel.dataset.key
        let val = sel.value
        if (key === 'delayTime') val = parseFloat(val)
        this._track[key] = val
        playbackEvents.dispatchTrackParamChange(this._track)
    }

    _onToggle(btn) {
        if (!this._track) return
        const key = btn.dataset.key
        this._track[key] = !this._track[key]
        btn.textContent = this._track[key] ? 'ON' : 'OFF'
        btn.classList.toggle('active', this._track[key])
        playbackEvents.dispatchTrackParamChange(this._track)
    }
}
