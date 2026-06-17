import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import Utils from '../core/utils.js'

import InstrumentsManager from '../logic/services/instruments_manager.js'
import MfAutoAssign from '../logic/services/auto_assign.js'
import SynthEditor from './synth_editor.js'
import { OrSlider } from './components/or_slider.js'
import { bindVisibilityToggles, buildAccordionGroup, fmt } from './components/panel_helpers.js'
import { recalcLoopDerived } from '../model/track_schema.js'
import BasePanel from './base_panel.js'
import { computeLfoValue } from '../audio/math.js'
import { TICK } from '../core/constants.js'

const fmtFreq = v => {
    const hz = Utils.normalizeTrackFilterFreqValue(v)
    return hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : Math.round(hz) + 'Hz'
}
const fmtPitch = v => {
    const n = Math.round(v)
    return (n >= 0 ? '+' : '') + String(Math.abs(n)).padStart(2, '0')
}
const fmtVal = (key, v) => {
    if (key === 'filterFreq') return fmtFreq(v)
    if (key === 'pitch') return fmtPitch(v)
    return fmt(v)
}

const FX_DEFS = [
    { key: 'reverbOn', label: 'Reverb', controls: ['reverbAmount', 'reverbType'] },
    { key: 'delayOn', label: 'Delay', controls: ['delayAmount', 'delayTime', 'delayType'] },
    { key: 'saturationOn', label: 'Disto', controls: ['saturationAmount', 'saturationType'] }
]

const FX_TOGGLE_DEFS = [
    { key: 'reverbOn', controls: ['reverbAmount'] },
    { key: 'delayOn', controls: ['delayAmount'] },
    { key: 'saturationOn', controls: ['saturationAmount'] }
]

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
            { key: 'velocity', label: 'Vel', min: 0, max: 1, step: 0.01, lfo: 'velocityLfo' },
            { key: 'pan', label: 'Pano', min: -1, max: 1, step: 0.01, lfo: 'panLfo' },
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
            { key: 'reverbAmount', label: 'Depth', min: 0, max: 1, step: 0.01 },
            { key: 'reverbType', label: 'Type', type: 'select', options: ['none', 'room', 'hall', 'plate', 'spring', 'gated'] },
            { key: 'delayAmount', label: 'Amount', min: 0, max: 1, step: 0.01 },
            { key: 'delayTime', label: 'Time', type: 'select', options: Utils.delayTimeValues, labels: Utils.delayTimeLabels },
            { key: 'delayType', label: 'Type', type: 'select', options: ['none', 'slap', 'tape', 'pingpong'] },
            { key: 'saturationAmount', label: 'Depth', min: 0, max: 1, step: 0.01 },
            { key: 'saturationType', label: 'Type', type: 'select', options: ['soft', 'hard', 'tape'] }
        ]
    },
    {
        label: 'Sound',
        props: []
    },
    {
        label: 'Loop / Pattern',
        props: []
    }
]

export default class TrackEditor extends BasePanel {
    constructor() {
        super('te-panel')
        this._track = null
        this._trackIdx = -1
        this._selectedPropKey = null
        this._rafId = null
        this._lastTick = -1
        this._isDragging = false
        this._activeFxTab = 0
        this._sliders = new Map()
        this._delegationBound = false
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
            this._startStepWatch()
        })
        playbackEvents.onPlaybackStop.push(() => {
            this._stopStepWatch()
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

    _startStepWatch() {
        if (this._rafId) return
        this._lastTick = -1
        const tick = () => {
            const transport = serviceRegistry.transport
            if (!transport?.isRunning) {
                this._rafId = null
                return
            }
            this._rafId = requestAnimationFrame(tick)
            const currentTick = transport.tick
            if (currentTick !== this._lastTick) {
                this._lastTick = currentTick
                this._updateLfoSliders()
            }
        }
        this._rafId = requestAnimationFrame(tick)
    }

    _stopStepWatch() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId)
            this._rafId = null
        }
        this._lastTick = -1
    }

    _getLocalLfoValues() {
        if (!this._track) return null
        const transport = serviceRegistry.transport
        if (!transport) return null
        const tick = transport.tick ?? 0
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return null
        const nbTicks = TICK * pattern.nbBars
        const bpm = appState.bpm ?? 120
        const controls = {
            velocity: 'velocityLfo',
            pan: 'panLfo',
            pitch: 'pitchLfo',
            filterFreq: 'filterFreqLfo',
            filterQ: 'filterQLfo'
        }
        const values = {}
        for (const [key, lfoKey] of Object.entries(controls)) {
            const lfo = this._track[lfoKey]
            values[key] = lfo ? computeLfoValue(lfo, tick, nbTicks, key, null, bpm) : 0
        }
        return values
    }

    _updateLfoSliders() {
        if (!this._track || !this.isVisible) return
        const lfoValues = this._getLocalLfoValues()
        if (!lfoValues) return

        GROUPS.forEach(g => {
            g.props.forEach(p => {
                if (p.lfo && this._track[p.lfo]) {
                    const s = this._sliders.get(p.key)
                    if (s) {
                        const renderedVal = lfoValues[p.key] ?? 0
                        s.setValue(renderedVal)
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
            this._startStepWatch()
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
            effects: 'FX',
            sound: 'Snd',
            loop: 'Lp'
        }

        GROUPS.forEach((g, idx) => {
            const visKey = ['basic', 'levels', 'filters', 'effects', 'sound', 'loop'][idx]
            const isExpanded = vis[visKey]

            if (g.label === 'Effects') {
                bodyHtml += this._renderFxGroup(isExpanded)
                return
            }
            if (g.label === 'Sound') {
                const soundExpanded = vis.sound
                const loopExpanded = vis.loop
                bodyHtml += `<div class="ne-group-sound-loop-wrapper">`
                bodyHtml += this._renderSoundPanel(soundExpanded)
                bodyHtml += this._renderLoopPanel(loopExpanded)
                bodyHtml += `</div>`
                return
            }
            if (g.label === 'Loop / Pattern') {
                return
            }
            let groupContent = ''
            g.props.forEach(p => {
                const val = this._track[p.key]
                const isSelected = this._selectedPropKey === p.key ? 'selected' : ''
                const hasLfo = p.lfo && this._track[p.lfo] ? 'has-lfo' : ''
                
                if (p.type === 'boolean') {
                    const active = val ? 'active' : ''
                    groupContent += `<div class="ne-row ${isSelected} ${hasLfo}" data-prop="${p.key}">
                             <label>${p.label}</label>
                             <button class="ne-btn ${active}" data-key="${p.key}">${val ? 'ON' : 'OFF'}</button>
                             </div>`
                } else if (p.type === 'select') {
                    groupContent += `<div class="ne-row ${isSelected} ${hasLfo}" data-prop="${p.key}">
                             <label>${p.label}</label>
                             <select data-key="${p.key}">`
                    p.options.forEach((opt, idx) => {
                        const label = p.labels ? p.labels[idx] : opt
                        const sel = String(opt) === String(val) ? ' selected' : ''
                        groupContent += `<option value="${opt}"${sel}>${label}</option>`
                    })
                    groupContent += `</select></div>`
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
                        denormalize: (v) => v,
                        onChange: (v, key) => {
                            this._isDragging = true
                            this._track[key] = v
                            playbackEvents.dispatchTrackParamChange(this._track)
                        }
                    })
                    s._isDelegated = true
                    this._sliders.set(p.key, s)
                    groupContent += s.toHTML()
                }
            })
            bodyHtml += buildAccordionGroup(visKey, g.label, shortLabels[visKey], isExpanded, groupContent)

            // LFO Sub-panel — rendered right after its parent group (Filters or Levels)
            if (this._selectedPropKey && visKey !== 'effects') {
                const prop = this._findProp(this._selectedPropKey)
                const propGroupIdx = prop ? GROUPS.findIndex(g => g.props.includes(prop)) : -1
                const propVisKey = ['basic', 'levels', 'filters', 'effects'][propGroupIdx]
                if (prop && prop.lfo && propVisKey === visKey && isExpanded) {
                    bodyHtml += this._renderLfoPanel(prop)
                }
            }
        })

        bodyHtml += '</div>'
        this.container.innerHTML = headerHtml + bodyHtml
        
        // Mount main sliders
        this._sliders.forEach(s => {
            const row = this.container.querySelector(`.ne-row[data-or-slider="${s._key}"]`)
            if (row) {
                s.mount(row)
                // Reset dragging on release
                const input = row.querySelector('input')
                if (input) {
                    input.addEventListener('change', () => {
                        this._isDragging = false
                        playbackEvents.dispatchPatternChange()
                    })
                }
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

        let content = ''
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
            s._isDelegated = true
            this._sliders.set(p.key, s)
            content += s.toHTML()
        })

        return buildAccordionGroup('loop', 'Loop / Pattern', 'Lp', isExpanded, content)
    }

    _renderFxGroup(isExpanded) {
        let html = `<div class="ne-group ${isExpanded ? 'expanded' : 'collapsed'}" data-group="effects">
            <button class="ne-group-accordion-toggle ne-toggle ${isExpanded ? 'active' : ''}" data-toggle="effects" title="Effects">
                <span class="ne-group-accordion-icon">${isExpanded ? '&minus;' : '+'}</span>
                <span class="ne-group-accordion-label">FX</span>
            </button>
            <div class="ne-group-content">
                <div class="ne-group-label fx-header">
                    <span>Effects</span>
                    <span class="fx-tabs">`

        if (isExpanded) {
            FX_DEFS.forEach((fx, i) => {
                const activeClass = i === this._activeFxTab ? ' active' : ''
                html += `<button class="fx-tab-btn${activeClass}" data-fx-tab="${i}" title="${fx.label}">${i + 1}</button>`
            })
        }

        html += `</span></div>`

        FX_DEFS.forEach((fx, idx) => {
            const on = this._isFxOn(fx)
            const ledClass = on ? 'lfo-led on' : 'lfo-led'
            const hiddenStyle = idx !== this._activeFxTab && isExpanded ? ' style="display:none"' : ''

            html += `<div class="fx-tab-panel"${hiddenStyle} data-fx-panel="${idx}">
                <div class="ne-grid">
                    <div class="ne-row">
                        <button class="${ledClass}" data-fx-toggle="${fx.key}" title="${on ? 'Disable' : 'Enable'} ${fx.label}"></button>
                        <label style="min-width:24px;margin-right:8px">${fx.label}</label>
                    </div>`

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
                    s._isDelegated = true
                    this._sliders.set(ck, s)
                    html += s.toHTML()
                }
            })

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

        let content = ''
        content += `<div class="ne-row"><label>Instr</label><select data-sound="instrument">`
        instrumentIds.forEach(id => {
            const sel = id === currentName ? ' selected' : ''
            content += `<option value="${id}"${sel}>${id}</option>`
        })
        content += `</select></div>
                <div class="ne-row"><label>Sample</label><select data-sound="sample">`
        if (matchingSounds.length === 0) {
            content += `<option value="">— no samples —</option>`
        } else {
            matchingSounds.forEach(s => {
                const sel = s.url === currentSoundId ? ' selected' : ''
                const label = `${s.kitName} / ${s.display_name || s.url}`
                content += `<option value="${s.url}"${sel}>${label}</option>`
            })
        }
        content += `</select></div>
            </div>
            <div class="ne-grid">
                <div class="ne-row" style="border-top:1px solid #444;margin-top:6px;padding-top:6px">
                    <label>Synth</label>
                    <select data-sound="generated">
                        <option value="none"${currentGeneratedSound === 'none' ? ' selected' : ''}>none</option>`
        generatedSoundKeys.forEach(key => {
            const sel = key === currentGeneratedSound ? ' selected' : ''
            content += `<option value="${this.esc(key)}"${sel}>${this.esc(key)}</option>`
        })
        if (this._track.useSoftSynth === true && !generatedSoundKeys.includes(currentGeneratedSound)) {
            content += `<option value="${this.esc(currentGeneratedSound)}" selected>${this.esc(currentGeneratedSound)}</option>`
        }
        content += `</select></div>
                <div class="ne-row" data-sound-edit-row style="display:${currentGeneratedSound === 'none' ? 'none' : 'flex'}">
                    <label>Edit</label>
                    <button class="ne-btn" data-action="edit-synth">Edit</button>
                </div>
            </div>`

        return buildAccordionGroup('sound', 'Sound', 'Snd', isExpanded, content, {
            labelClass: 'ne-group-label',
            labelHtml: `<button class="${ledClass}" data-action="toggle-auto" title="${auto ? 'Disable' : 'Enable'} auto-assign"></button> autoassign`,
        })
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
        const freq = lfo ? lfo.freq : 1
        const min = lfo ? lfo.min : prop.min
        const max = lfo ? lfo.max : prop.max
        const phase = lfo ? lfo.phase : 0
        const type = lfo ? (lfo.type || 'sine') : 'sine'

        let lfoHtml = `<div class="ne-group lfo-panel">
            <div class="lfo-header">
                <button class="${ledClass}" data-action="toggle-lfo" title="${ledTitle}"></button>
                <div class="ne-group-label">LFO: ${prop.label}</div>
            </div>
            <div class="ne-grid">
            <div class="ne-row">
                <label>Type</label>
                <select data-lfo-type-select>
                    ${Utils.waveList.map(w => `<option value="${w}" ${w === type ? 'selected' : ''}>${w}</option>`).join('')}
                </select>
            </div>
            <div class="ne-row">
                <label>Freq</label>
                <input type="range" min="0.1" max="2" step="0.1" value="${freq}" data-lfo-key="freq">
                <span class="ne-val">${fmt(freq)}</span>
            </div>
            <div class="ne-row">
                <label>Range</label>
                <div class="ne-range-container">
                    <input type="range" min="${prop.min}" max="${prop.max}" step="${prop.step}" 
                        value="${min}" data-lfo-key="min" title="Min">
                    <input type="range" min="${prop.min}" max="${prop.max}" step="${prop.step}" 
                        value="${max}" data-lfo-key="max" title="Max">
                </div>
                <span class="ne-val" style="min-width:60px">${fmt(min)}..${fmt(max)}</span>
            </div>
            <div class="ne-row">
                <label>Phas</label>
                <input type="range" min="0" max="1" step="0.01" value="${phase}" data-lfo-key="phase">
                <span class="ne-val">${fmt(phase)}</span>
            </div>
            </div></div>`
        return lfoHtml
    }

    _bindEvents() {
        bindVisibilityToggles(this.container, appState.trackEditorVisibility, () => this.sync())

        if (this._delegationBound) {
            return
        }

        // Event delegation for all inputs, selects and buttons
        this.container.addEventListener('input', (e) => {
            const target = e.target
            const key = target.dataset.key || target.dataset.lfoKey || target.dataset.loop
            if (!key) return

            // Check if it's an OrSlider
            const slider = Array.from(this._sliders.values()).find(s => s._input === target)
            if (slider) {
                slider.handleInput(e)
            } else if (target.dataset.lfoKey) {
                this._onLfoSlider(target)
            } else if (target.dataset.loop) {
                // _onLoopSlider expects an input object with value and dataset
                this._onLoopSlider(target)
            }
        })

        this.container.addEventListener('keydown', (e) => {
            const target = e.target
            if (target.type === 'range') {
                const slider = Array.from(this._sliders.values()).find(s => s._input === target)
                slider?.handleKeydown(e)
            }
        })

        this.container.addEventListener('change', (e) => {
            const target = e.target
            if (target.tagName === 'SELECT') {
                if (target.dataset.key) this._onSelect(target)
                else if (target.dataset.sound) {
                    // Logic from original handlers
                    if (target.dataset.sound === 'instrument') this._onInstrumentChange(target)
                    else if (target.dataset.sound === 'sample') this._onSampleChange(target)
                    else if (target.dataset.sound === 'generated') this._onGeneratedChange(target)
                } else if (target.closest('.lfo-panel')) {
                    this._onLfoSelect(target)
                }
            } else if (target.type === 'range') {
                this._isDragging = false
                playbackEvents.dispatchPatternChange()
            }
        })

        this.container.addEventListener('click', (e) => {
            const target = e.target
            const btn = target.closest('button')
            if (!btn) {
                const row = target.closest('.ne-row[data-prop]')
                if (row && target.tagName !== 'INPUT' && target.tagName !== 'SELECT') {
                    this._onRowClick(row.dataset.prop)
                }
                return
            }

            if (btn.classList.contains('ne-close')) {
                this.hide()
            } else if (btn.dataset.key) {
                this._onToggle(btn)
            } else if (btn.dataset.fxToggle) {
                this._toggleFx(btn)
            } else if (btn.dataset.fxTab) {
                this._onFxTab(btn)
            } else if (btn.dataset.action === 'toggle-lfo') {
                this._toggleLfo()
            } else if (btn.dataset.action === 'toggle-auto') {
                this._toggleAuto()
            } else if (btn.dataset.action === 'edit-synth') {
                this.synthEditor.openEditor()
            }
        })

        this._delegationBound = true
    }

    _onInstrumentChange = async (target) => {
        const newName = target.value
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
    }

    _onSampleChange = async (target) => {
        const url = target.value
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
    }

    _onGeneratedChange = async (target) => {
        const key = target.value
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
    }

    _toggleAuto() {
        this._track.useAutoAssignSound = this._track.useAutoAssignSound === false
        if (this._track.useAutoAssignSound) {
            this._track.useSoftSynth = false
            this._track.synthSoundKey = null
            const aa = new MfAutoAssign()
            aa.autoAssignTrackSounds(this._track)
        }
        this.sync()
        playbackEvents.dispatchPatternChange()
    }

    _onRowClick(propKey) {
        this._selectedPropKey = propKey
        this.sync()
    }

    _toggleFx(btn) {
        const key = btn.dataset.fxToggle
        const fx = FX_TOGGLE_DEFS.find(def => def.key === key)
        this._track[key] = fx ? !this._isFxOn(fx) : !this._track[key]
        this.sync()
        playbackEvents.dispatchPatternChange()
    }

    _onFxTab(btn) {
        const tabIdx = parseInt(btn.dataset.fxTab, 10)
        this._activeFxTab = tabIdx
        this.container.querySelectorAll('.fx-tab-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.container.querySelectorAll('.fx-tab-panel').forEach(p => {
            p.style.display = p.dataset.fxPanel === String(tabIdx) ? '' : 'none'
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
        // Ensure engine is notified immediately
        playbackEvents.dispatchTrackParamChange(this._track)
        // Also dispatch pattern change so it gets saved
        playbackEvents.dispatchPatternChange()
    }

    _onLfoSlider(input) {
        this._isDragging = true
        const prop = this._findProp(this._selectedPropKey)
        let lfo = this._track[prop.lfo]
        if (!lfo) {
            lfo = this._track[prop.lfo] = { type: 'sine', freq: 1, min: prop.min, max: prop.max, phase: 0 }
            this.sync()
        }
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
        let lfo = this._track[prop.lfo]
        if (!lfo) {
            lfo = this._track[prop.lfo] = { type: sel.value, freq: 1, min: prop.min, max: prop.max, phase: 0 }
            this.sync()
        }
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
        this._lastTick = -1
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
