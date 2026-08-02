import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import Utils from '../core/utils.js'

import InstrumentsManager from '../logic/services/instruments_manager.js'
import MfAutoAssign from '../logic/services/auto_assign.js'
import SynthEditor from './synth_editor.js'
import { OrSlider } from './components/or_slider.js'
import { OrKnob } from './components/or_knob.js'
import { bindCloseButton, bindVisibilityToggles, buildAccordionGroup, fmt, pitchToNoteName, setViewBtn } from './components/panel_helpers.js'
import { recalcLoopDerived } from '../model/track_schema.js'
import BasePanel from './base_panel.js'
import { TICK } from '../core/constants.js'
import LfoUiBridge from '../logic/lfo_ui_bridge.js'
import { analyzeSample, clearAnalysisCache, drawEnvelope } from '../audio/sample_analyzer.js'
import { logger } from "../core/logger.js"

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
    if (key === 'filterQ') return v.toFixed(2)
    if (key === 'pitch') return fmtPitch(v)
    return fmt(v)
}

const FILTER_TYPE_ICONS = {
    lowpass:  'LP',
    highpass: 'HP',
    bandpass: 'BP',
}

const FILTER_PROPS = [
    { key: 'filterType', label: 'Type', type: 'icon', options: ['lowpass', 'highpass', 'bandpass'] },
    { key: 'filterFreq', label: 'Freq', min: 0, max: 1, step: 0.01, lfo: 'filterFreqLfo' },
    { key: 'filterQ', label: 'Q', min: 0, max: 1, step: 0.01, lfo: 'filterQLfo',
      normalize: v => Utils.valueToNormalizedTrackFilterQ(v),
      denormalize: v => Utils.normalizedTrackFilterQToValue(v) }
]

const FX_DEFS = [
    { key: 'reverbAmount', label: 'Reverb', controls: ['reverbAmount', 'reverbType'] },
    { key: 'delayDepth', label: 'Delay', controls: ['delayDepth', 'delayTime', 'delayType'] },
    { key: 'saturationAmount', label: 'Sat', controls: ['saturationAmount', 'saturationType'] },
    { key: 'filterFreq', label: 'Filter', controls: ['filterType', 'filterFreq', 'filterQ'] }
]

const FX_TOGGLE_DEFS = [
    { key: 'reverbAmount', controls: ['reverbAmount'] },
    { key: 'delayDepth', controls: ['delayDepth'] },
    { key: 'saturationAmount', controls: ['saturationAmount'] }
]

const KNOB_PROPS = [
    { key: 'velocity',    label: 'Vel',   min: 0,  max: 1,  step: 0.01, lfo: 'velocityLfo' },
    { key: 'pan',         label: 'Pan',   min: -1, max: 1,  step: 0.01, lfo: 'panLfo' },
    { key: 'pitch',       label: 'Pitch', min: -24, max: 24, step: 1,   lfo: 'pitchLfo' },
    { key: 'sampleDecay', label: 'Decay', min: 0,  max: 2,  step: 0.01 }
]

const TAB_DEFS = [
    { id: 'fx',   label: 'fx' },
    { id: 'snd',  label: 'sound' },
    { id: 'mod',  label: 'modulation' },
    { id: 'loop', label: 'loop' },
    { id: 'gen',  label: 'generation' }
]

const GROUPS = [
    {
        label: 'Basic / Transport',
        props: [
            { key: 'auto', label: 'Auto', type: 'boolean' },
            { key: 'variation', label: 'Var Pos', min: 0, max: 100, step: 1 },
            { key: 'variation2', label: 'Var Prop', min: 0, max: 100, step: 1 },
        ]
    },
    {
        label: 'Effects',
        props: [
            { key: 'reverbAmount', label: 'Depth', min: 0, max: 1, step: 0.01 },
            { key: 'reverbType', label: 'Type', type: 'select', options: ['none', 'room', 'hall', 'plate', 'spring', 'gated'] },
            { key: 'delayDepth', label: 'Depth', min: 0, max: 1, step: 0.01 },
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

const ALL_TRACK_PROPS = [...GROUPS.flatMap(g => g.props), ...FILTER_PROPS]
const PROP_BY_KEY = new Map(ALL_TRACK_PROPS.map(p => [p.key, p]))

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
        this._lfoBridge = null
        this._delegationBound = false
        this._selectedLfoTarget = null
        this.synthEditor = new SynthEditor(this)
        this._noteEditMode = false
        this._selectedNote = null
        this._noteSliders = []
        this._knobs = []
        this._fxKnobs = []
        this._activeTab = 'fx'
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
            if (!data) {
                if (this._noteEditMode) {
                    this._noteEditMode = false
                    this._selectedNote = null
                    this._noteSliders.forEach(s => s.destroy())
                    this._noteSliders = []
                    if (this.isVisible) this.sync()
                }
                return
            }
            if (this.isVisible && data.track === this._track) {
                this._noteEditMode = true
                this._selectedNote = data
                this._noteSliders.forEach(s => s.destroy())
                this._noteSliders = []
                this.sync()
                return
            }
            this.hide()
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
        playbackEvents.onSynthToggle.push(() => {
            const synthVisible = this.synthEditor?.panel?.style?.display === 'flex'
            if (synthVisible) {
                this.synthEditor.hidePanel()
            } else {
                this.hide()
                void this.synthEditor.showPanel()
            }
            setViewBtn('grid', !synthVisible && this.synthEditor?.panel?.style?.display !== 'flex')
            setViewBtn('synth', this.synthEditor?.panel?.style?.display === 'flex')
            setViewBtn('edit', false)
        })
        playbackEvents.onEditToggle.push(() => {
            const noteEditor = document.getElementById('ne-panel')
            const isNoteOpen = noteEditor?.style?.display === 'block'
            if (this.isVisible || isNoteOpen) {
                this.hide()
                playbackEvents.dispatchNoteSelect(null)
            } else {
                const pattern = appState.patterns[appState.selectedPatternNum]
                const idx = appState.selectedTrackNum
                const track = pattern?.tracks?.[idx]
                if (track) {
                    this.show({ track, trackIdx: idx })
                }
            }
            const split = this.isVisible
            document.getElementById('pattern-panel')?.classList.toggle('pp-split', split)
            this.container?.classList.toggle('pp-split', split)
            setViewBtn('edit', split)
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
        if (this._lfoBridge) {
            this._lfoBridge.destroy()
            this._lfoBridge = null
        }
    }

    _lfoValuesForTick(tick) {
        if (!this._track) return null
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return null
        const nbTicks = TICK * pattern.nbBeats

        if (!this._lfoBridge) {
            this._lfoBridge = new LfoUiBridge(serviceRegistry.audioCtx)
        }

        return this._lfoBridge.compute(this._track, tick, nbTicks)
    }

    _applyLfoValues(lfoValues) {
        if (!lfoValues || !this._track) return
        ALL_TRACK_PROPS.forEach(p => {
            if (!p.lfo || !this._track[p.lfo]) return
            const ctrl = this._sliders.get(p.key) ?? this._fxKnobs.find(kn => kn._key === p.key)
            if (!ctrl) return
            const raw = lfoValues[p.key] ?? 0
            ctrl.setValue(p.denormalize ? p.denormalize(raw) : raw)
        })
        KNOB_PROPS.forEach(p => {
            if (p.lfo && this._track[p.lfo]) {
                const knob = this._knobs.find(k => k._key === p.key)
                if (knob) knob.setValue(lfoValues[p.key] ?? 0)
            }
        })
    }

    async _updateLfoSliders() {
        if (!this._track || !this.isVisible) return
        const transport = serviceRegistry.transport
        if (!transport) return
        const tick = transport.tick
        const result = this._lfoValuesForTick(tick)
        if (!result) return

        const values = result instanceof Promise ? await result : result
        if (values && transport.tick === tick) {
            this._applyLfoValues(values)
        }
    }

    show({ track, trackIdx }) {
        this._track = track
        this._trackIdx = trackIdx
        super.show()
        void this.synthEditor.ensureGeneratedSoundsLoaded()
        if (serviceRegistry.transport?.isRunning) {
            this._startStepWatch()
        }
        setViewBtn('edit', true)
    }

    sync() {
        if (!this._track) return

        if (this._noteEditMode) {
            this._syncNoteEditMode()
            return
        }

        // Migrate filterQ from normalized [0,1] to raw Q [0.707, 18.707] if needed
        if (this._track.filterQ < 0.707) {
            this._track.filterQ = Utils.normalizedTrackFilterQToValue(this._track.filterQ)
        }

        const vis = appState.trackEditorVisibility
        const soundInfo = this._getSoundInfo()
        
        let headerHtml = `<div class="ne-header">
            <span class="ne-track">Track: ${this.esc(this._track.name)}${soundInfo ? ' - ' + this.esc(soundInfo) : ''}</span>
            <button class="ne-close">&times;</button>
        </div>`

        let sampleBarHtml = this._renderSampleBar()
        let knobBarHtml = this._renderKnobBar()

        this._sliders.forEach(s => s.destroy())
        this._sliders.clear()
        this._fxKnobs.forEach(k => k.destroy())
        this._fxKnobs = []

        let tabBarHtml = '<div class="ne-tab-bar">'
        for (const tab of TAB_DEFS) {
            const cls = tab.id === this._activeTab ? ' active' : ''
            tabBarHtml += `<button class="ne-tab-btn${cls}" data-ne-tab="${tab.id}">${tab.label}</button>`
        }
        tabBarHtml += '</div>'

        let panelsHtml = ''

        const renderGroupProps = (group) => {
            let html = ''
            group.props.forEach(p => {
                const val = this._track[p.key]
                const isSelected = this._selectedPropKey === p.key ? 'selected' : ''
                const hasLfo = p.lfo && this._track[p.lfo] ? 'has-lfo' : ''
                if (p.type === 'boolean') {
                    const active = val ? 'active' : ''
                    html += `<div class="ne-row ${isSelected} ${hasLfo}" data-prop="${p.key}">
                             <label>${p.label}</label>
                             <button class="ne-btn ${active}" data-key="${p.key}">${val ? 'ON' : 'OFF'}</button>
                             </div>`
                } else if (p.type === 'select') {
                    html += `<div class="ne-row ${isSelected} ${hasLfo}" data-prop="${p.key}">
                             <label>${p.label}</label>
                             <select data-key="${p.key}">`
                    p.options.forEach((opt, idx) => {
                        const label = p.labels ? p.labels[idx] : opt
                        const sel = String(opt) === String(val) ? ' selected' : ''
                        html += `<option value="${opt}"${sel}>${label}</option>`
                    })
                    html += `</select></div>`
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
                        normalize: p.normalize ?? ((v) => {
                            if (p.key === 'filterFreq' && v > 1) return Utils.hzToNormalizedTrackFilterFreq(v)
                            return v
                        }),
                        denormalize: p.denormalize ?? ((v) => v),
                        onChange: (v, key) => {
                            this._isDragging = true
                            this._track[key] = v
                            playbackEvents.dispatchTrackParamChange(this._track)
                        }
                    })
                    s._isDelegated = true
                    this._sliders.set(p.key, s)
                    html += s.toHTML()
                }
            })
            return html
        }

        const TAB_PANEL_MAP = {
            gen: () => renderGroupProps(GROUPS[0]),
            fx: () => this._renderFxGroup(),
            snd: () => this._renderSoundPanel(),
            mod: () => this._renderLfoGroup(),
            loop: () => this._renderLoopPanel()
        }

        for (const tab of TAB_DEFS) {
            const vis = tab.id === this._activeTab ? '' : ' style="display:none"'
            const panelFn = TAB_PANEL_MAP[tab.id]
            const content = panelFn ? panelFn() : ''
            panelsHtml += `<div class="ne-tab-panel" data-tab-panel="${tab.id}"${vis}>${content}</div>`
        }

        this.container.innerHTML = headerHtml + sampleBarHtml + knobBarHtml + tabBarHtml + panelsHtml
        
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
                        playbackEvents.dispatchPatternChange([this._track])
                    })
                }
            }
        })

        // Mount FX knobs
        this._fxKnobs.forEach(k => {
            const row = this.container.querySelector(`.ne-row[data-or-slider="${k._key}"]`)
            if (row) k.mount(row)
        })

        this._knobs.forEach(k => k.destroy())
        this._knobs = []
        KNOB_PROPS.forEach(def => {
            const placeholder = this.container.querySelector(`[data-or-knob="${def.key}"]`)
            if (!placeholder) return
            const knob = new OrKnob({
                key: def.key,
                label: def.label,
                min: def.min,
                max: def.max,
                step: def.step,
                value: this._track[def.key] ?? def.min,
                format: def.key === 'velocity'
                    ? v => Math.round(v * 100)
                    : def.key === 'pitch'
                        ? v => `${v >= 0 ? '+' : ''}${v}`
                        : def.key === 'sampleDecay'
                            ? v => v.toFixed(2)
                            : fmt,
                unit: def.key === 'velocity' ? '%' : def.key === 'pitch' ? 'st' : def.key === 'sampleDecay' ? 's' : '',
                onChange: (v) => {
                    this._track[def.key] = v
                    playbackEvents.dispatchTrackParamChange(this._track)
                    if (def.key === 'sampleDecay') this._drawSampleWaveform()
                }
            })
            this._knobs.push(knob)
            const el = knob.createElement()
            el.removeAttribute('data-prop')
            el.removeAttribute('data-or-slider')
            placeholder.replaceWith(el)
        })

        if (this.synthEditor?.panel?.style?.display !== 'block') {
            this.container.style.display = 'block'
        }
        this.reposition()
        this._bindEvents()
        this._drawSampleWaveform()
    }

    _renderSampleBar() {
        const track = this._track
        if (track.useSoftSynth) return ''
        const soundId = track.soundId ?? ''
        const sound = soundRegistry.sounds[soundId]
        if (!sound?.buffer) return ''
        const analysis = analyzeSample(sound.buffer)
        const pitchStr = analysis?.noteInfo
            ? `${analysis.noteInfo.note}${analysis.noteInfo.octave}`
            : '—'
        const durStr = analysis?.length != null ? (analysis.length * 1000).toFixed(0) + ' ms' : '—'
        const peakStr = analysis?.peakDb != null ? analysis.peakDb.toFixed(1) + ' dB' : '—'
        return `<div class="te-sample-bar">
            <div class="te-sample-left">
                <span class="te-sample-info" title="Pitch / Duration / Peak">${pitchStr} · ${durStr} · ${peakStr}</span>
                <button class="te-load-btn" data-action="load-sample" title="Import sample to replace current">📁</button>
                <input type="file" class="te-load-input" style="display:none" accept=".wav,.flac,.mp3,.aac">
            </div>
            <canvas class="te-waveform" width="500" height="48"></canvas>
        </div>`
    }

    _renderKnobBar() {
        return `<div class="te-knob-bar">
            <div data-or-knob="velocity"></div>
            <div data-or-knob="pan"></div>
            <div data-or-knob="pitch"></div>
            <div data-or-knob="sampleDecay"></div>
        </div>`
    }

    _drawSampleWaveform() {
        const canvas = this.container?.querySelector('.te-waveform')
        if (!canvas) return
        const sound = soundRegistry.sounds[this._track?.soundId]
        if (!sound?.buffer) return
        const analysis = analyzeSample(sound.buffer)
        if (!analysis?.envelope?.length) return
        const ctx = canvas.getContext('2d')
        drawEnvelope(ctx, analysis.envelope, canvas.width, canvas.height, '#00fff5')

        const decay = this._track.sampleDecay ?? 0.5
        const totalSec = sound.buffer.duration
        if (totalSec > 0) {
            const ratio = Math.min(decay / totalSec, 1)
            const x = ratio * canvas.width
            ctx.strokeStyle = '#f5e642'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, canvas.height)
            ctx.stroke()
        }
    }

    _onLoadSample() {
        const input = this.container?.querySelector('.te-load-input')
        if (input) input.click()
    }

    async _onSampleFileSelected(e) {
        const file = e.target.files?.[0]
        if (!file || !this._track) return
        const ctx = serviceRegistry.audioCtx
        if (!ctx) return
        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            const soundId = this._track.soundId ?? ''
            const oldSound = soundRegistry.sounds[soundId]
            if (oldSound) {
                clearAnalysisCache(oldSound.buffer)
                oldSound.buffer = buffer
                oldSound.display_name = file.name
                oldSound.duration = Math.floor(buffer.duration * 1000)
            } else {
                soundRegistry.sounds[soundId] = {
                    url: soundId,
                    key: soundId,
                    display_name: file.name,
                    buffer,
                    duration: Math.floor(buffer.duration * 1000),
                    isLoad: true
                }
            }
            this.sync()
            playbackEvents.dispatchPatternChange([this._track])
        } catch (err) {
            logger.warn('TrackEditor', `Sample import failed: ${err.message}`)
        }
        e.target.value = ''
    }

    _syncNoteEditMode() {
        const data = this._selectedNote
        if (!data || !this._track) return

        const { note, beat, beatStep } = data
        this._noteSliders.forEach(s => s.destroy())
        this._noteSliders = []

        let headerHtml = `<div class="ne-header">
            <span class="ne-track">Note: ${this.esc(this._track.name)} [beat ${beat} step ${beatStep}]</span>
            <button class="ne-close" data-action="close-note-edit">&times;</button>
        </div>`

        const NOTE_GROUPS = [
            { label: 'Vel / Pitch / Pan', props: [
                { key: 'velocity', label: 'Vel', min: 0, max: 1, step: 0.01 },
                { key: 'pitch', label: 'Pitch', min: -24, max: 24, step: 1 },
                { key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.01 }
            ]},
            { label: 'Triggers', props: [
                { key: 'every', label: 'Every', min: 1, max: 16, step: 1 },
                { key: 'pos', label: 'Pos', min: 0, max: 15, step: 1 },
                { key: 'prob', label: 'Prob', min: 0, max: 1, step: 0.01 }
            ]},
            { label: 'Retrig', props: [
                { key: 'retriggerNum', label: 'Retrig', min: 1, max: 16, step: 1 },
                { key: 'rate', label: 'Rate', min: 1, max: 16, step: 1 },
                { key: 'euclidianFill', label: 'Eucl', min: 0, max: 16, step: 1 },
                { key: 'arpTriggerProbability', label: 'Prob', min: 0, max: 1, step: 0.01 }
            ]}
        ]
        const shortLabels = { 'Vel / Pitch / Pan': 'VPP', Triggers: 'Trig', Retrig: 'Retr' }

        let bodyHtml = `<div class="ne-body">`
        NOTE_GROUPS.forEach((g, idx) => {
            const visKey = ['levels', 'triggers', 'retrig'][idx]
            const isExpanded = appState.noteEditorVisibility?.[visKey] ?? true
            let groupContent = ''
            g.props.forEach(p => {
                groupContent += `<div data-ne-slider="${p.key}"></div>`
            })
            bodyHtml += buildAccordionGroup(visKey, g.label, shortLabels[g.label], isExpanded, groupContent)
        })
        bodyHtml += '</div>'

        this.container.innerHTML = headerHtml + bodyHtml

        NOTE_GROUPS.forEach(g => {
            g.props.forEach(p => {
                const placeholder = this.container.querySelector(`[data-ne-slider="${p.key}"]`)
                if (!placeholder) return
                const slider = new OrSlider({
                    key: p.key,
                    label: p.label,
                    min: p.min,
                    max: p.max,
                    step: p.step,
                    value: note[p.key] ?? p.min,
                    format: p.key === 'pitch'
                        ? v => `${fmt(v)} ${pitchToNoteName(v, this._track?.pitch ?? 0)}`
                        : fmt,
                    onChange: v => {
                        note[p.key] = v
                        playbackEvents.dispatchTrackParamChange(this._track)
                    }
                })
                this._noteSliders.push(slider)
                placeholder.replaceWith(slider.createElement())
            })
        })

        if (this.synthEditor?.panel?.style?.display !== 'block') {
            this.container.style.display = 'block'
        }
        this.reposition()
        this._bindNoteEditEvents()
    }

    _bindNoteEditEvents() {
        this.container.querySelector('[data-action="close-note-edit"]')?.addEventListener('click', () => {
            this._noteEditMode = false
            this._selectedNote = null
            this._noteSliders.forEach(s => s.destroy())
            this._noteSliders = []
            this.sync()
        })
    }

    _renderLoopPanel(isExpanded) {
        const beats = this._track.nbBeats ?? 4
        const stepsPerBeat = this._track.stepsPerBeat ?? 4
        const loopAtStep = this._track.loopAtStep ?? (beats * stepsPerBeat)
        const maxSteps = beats * stepsPerBeat
        const swing = this._track.swingAmount ?? 0

        const fmtLoopPoint = (step) => {
            const b = Math.floor((step - 1) / stepsPerBeat) + 1
            const s = ((step - 1) % stepsPerBeat) + 1
            return `${b}.${s}`
        }

        let content = ''
        const loopProps = [
            { key: 'stepsPerBeat', label: 'Steps/Beat', min: 1, max: 8, step: 1, val: stepsPerBeat },
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

        return content
    }

    _renderFxGroup() {
        let tabsHtml = '<div class="te-mod-targets">'
        FX_DEFS.forEach((fx, i) => {
            const on = this._isFxOn(fx)
            const ledClass = on ? 'lfo-led on' : 'lfo-led'
            const activeClass = i === this._activeFxTab ? ' active' : ''
            tabsHtml += `<div class="te-mod-btn${activeClass}">
                <span class="${ledClass}" data-fx-toggle-btn="${fx.key}"></span>
                <span data-fx-tab="${i}">${fx.label}</span></div>`
        })
        tabsHtml += '</div>'

        let content = tabsHtml
        FX_DEFS.forEach((fx, idx) => {
            const on = this._isFxOn(fx)
            const ledClass = on ? 'lfo-led on' : 'lfo-led'
            const hiddenStyle = idx !== this._activeFxTab ? ' style="display:none"' : ''

            content += `<div class="fx-tab-panel"${hiddenStyle} data-fx-panel="${idx}">`

            fx.controls.forEach(ck => {
                const prop = PROP_BY_KEY.get(ck)
                if (!prop) return
                const val = this._track[ck]
                if (prop.type === 'icon') {
                    const icons = FILTER_TYPE_ICONS
                    content += `<div class="ne-row fx-icon-row" data-prop="${ck}">
                        <label style="min-width:20px">${prop.label}</label>
                        <div class="fx-icon-group" data-fx-icon-key="${ck}">
                        ${prop.options.map(opt => {
                            const sel = String(opt) === String(val) ? ' selected' : ''
                            return `<button class="fx-icon-btn${sel}" data-fx-icon-val="${opt}" title="${opt}">${icons[opt] ?? opt}</button>`
                        }).join('')}
                        </div></div>`
                } else if (prop.type === 'select') {
                    content += `<div class="ne-row" data-prop="${ck}">
                        <label style="min-width:20px">${prop.label}</label>
                        <select data-key="${ck}">`
                    prop.options.forEach((opt, idx2) => {
                        const label = prop.labels ? prop.labels[idx2] : opt
                        const sel = String(opt) === String(val) ? ' selected' : ''
                        content += `<option value="${opt}"${sel}>${label}</option>`
                    })
                    content += `</select></div>`
                } else {
                    const hasLfo = prop.lfo && this._track[prop.lfo] ? 'has-lfo' : ''
                    const isSelected = this._selectedPropKey === ck ? 'selected' : ''
                    const knob = new OrKnob({
                        key: ck,
                        label: prop.label,
                        min: prop.min,
                        max: prop.max,
                        step: prop.step,
                        value: val ?? prop.min,
                        extraClass: `${isSelected} ${hasLfo}`.trim(),
                        format: (v) => fmtVal(ck, v),
                        onChange: (v) => {
                            this._track[ck] = v
                            playbackEvents.dispatchTrackParamChange(this._track)
                        }
                    })
                    this._fxKnobs.push(knob)
                    content += knob.toHTML()
                }
            })

            content += `</div>`
        })

        return content
    }

    _isFxOn(fx) {
        if (fx.key === 'filterFreq') return true
        const amount = Number(this._track[fx.key] ?? 0)
        return Number.isFinite(amount) && amount > 0
    }

    _renderSoundPanel(isExpanded) {
        const auto = this._track.useAutoAssignSound !== false
        const ledClass = auto ? 'lfo-led on' : 'lfo-led'
        const generatedSoundKeys = this.synthEditor.getGeneratedSoundKeys()
        const currentGeneratedSound = this._track.useSoftSynth === true
            ? (this._track.synthSoundKey ?? (logger.warn('TrackEditor', 'synthSoundKey fallback'), 'BASS1'))
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

        const NL = '&#10;'
        const currentSound = soundRegistry.sounds[currentSoundId]
        const sampleTooltip = currentSound
            ? [
                `Kit: ${currentSound.kit_name ?? '?'}`,
                `URL: ${currentSound.url ?? '?'}`,
                `Instrument: ${currentSound.key ?? '?'}`,
                `Synth: ${this._track.useSoftSynth === true ? 'yes' : 'no'}`,
                `Size: ${currentSound.buffer?.length != null ? currentSound.buffer.length.toLocaleString() + ' samples' : '?'}`,
                `Length: ${currentSound.duration != null ? currentSound.duration + ' ms' : '?'}`
            ].join(NL)
            : ''

        let content = ''
        content += `<div class="ne-row"><label>Instr</label><select data-sound="instrument">`
        instrumentIds.forEach(id => {
            const sel = id === currentName ? ' selected' : ''
            content += `<option value="${id}"${sel}>${id}</option>`
        })
        content += `</select></div>
        <div class="ne-row"><label title="${sampleTooltip}">Sample</label><select data-sound="sample">`
        if (matchingSounds.length === 0) {
            content += `<option value="">— no samples —</option>`
        } else {
            matchingSounds.forEach(s => {
                const sel = s.url === currentSoundId ? ' selected' : ''
                const label = `${s.url ?? '??'}`
                content += `<option value="${s.url}"${sel}>${label}</option>`
            })
        }
        content += `</select></div>
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
                </div>`

        const monoActive = this._track.mono ? 'active' : ''
        const monoLabel = this._track.mono ? 'ON' : 'OFF'
        return `<div class="ne-row"><label>Mono</label><button class="ne-btn ${monoActive}" data-key="mono">${monoLabel}</button></div>
        <div class="ne-row"><button class="${ledClass}" data-action="toggle-auto" title="${auto ? 'Disable' : 'Enable'} auto-assign"></button> <label>auto</label></div>` + content
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
            const sortKeyA = a.display_name != null && a.display_name !== '' ? a.display_name : (logger.warn('TrackEditor', 'display_name sort fallback'), a.url ?? '')
            const sortKeyB = b.display_name != null && b.display_name !== '' ? b.display_name : (logger.warn('TrackEditor', 'display_name sort fallback'), b.url ?? '')
            return sortKeyA.localeCompare(sortKeyB)
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
            return this._track.synthSoundKey ?? (logger.warn('TrackEditor', 'synthSoundKey null fallback'), null)
        }
        const sound = soundRegistry.sounds[this._track.soundId]
        if (!sound) return null
        const kit = sound.kit_name ?? (logger.warn('TrackEditor', 'kit_name fallback'), '')
        const name = sound.display_name ?? (logger.warn('TrackEditor', 'display_name fallback'), sound.key ?? (logger.warn('TrackEditor', 'sound.key fallback'), sound.url ?? (logger.warn('TrackEditor', 'sound.url fallback'), '')))
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

    _renderLfoGroup() {
        if (!this._track) return ''

        const LFO_PROPS = [...ALL_TRACK_PROPS, ...KNOB_PROPS].filter(p => p.lfo)
        if (!LFO_PROPS.length) return ''

        if (!this._selectedLfoTarget || !LFO_PROPS.find(p => p.key === this._selectedLfoTarget)) {
            this._selectedLfoTarget = LFO_PROPS[0].key
        }

        const prop = LFO_PROPS.find(p => p.key === this._selectedLfoTarget) ?? LFO_PROPS[0]
        const lfoKey = prop.lfo
        const lfo = this._track[lfoKey]

        const ledClass = lfo ? 'lfo-led on' : 'lfo-led'
        const ledTitle = lfo ? 'Disable LFO' : 'Enable LFO'
        const freq = lfo ? lfo.freq : 1
        const min = lfo ? lfo.min : prop.min
        const max = lfo ? lfo.max : prop.max
        const phase = lfo ? lfo.phase : 0
        const type = lfo ? (lfo.type ?? 'sine') : 'sine'

        let content = `<div class="te-mod-targets">`
        LFO_PROPS.forEach(p => {
            const isActive = p.key === this._selectedLfoTarget
            const lfoOn = !!this._track[p.lfo]
            const ledClass = lfoOn ? 'lfo-led on' : 'lfo-led'
            const activeClass = isActive ? ' active' : ''
            content += `<div class="te-mod-btn${activeClass}">
                <span class="${ledClass}" data-lfo-toggle-btn="${p.key}"></span>
                <span data-lfo-select-btn="${p.key}">${p.label}</span></div>`
        })
        content += `</div>
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
                <label>Phase</label>
                <input type="range" min="0" max="1" step="0.01" value="${phase}" data-lfo-key="phase">
                <span class="ne-val">${fmt(phase)}</span>
            </div>`

        return content
    }

    _bindEvents() {
        if (this._delegationBound) {
            return
        }

        // Event delegation for all inputs, selects and buttons
        this.container.addEventListener('input', (e) => {
            const target = e.target
            const key = target.dataset.key ?? target.dataset.lfoKey ?? target.dataset.loop
            if (!key) return

            // Check if it's an OrSlider
            const slider = Array.from(this._sliders.values()).find(s => s._input === target)
            if (slider) {
                slider.handleInput(e)
                if (key === 'sampleDecay') this._drawSampleWaveform()
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
            if (target.classList.contains('te-load-input')) {
                this._onSampleFileSelected(e)
                return
            }
            if (target.tagName === 'SELECT') {
                if (target.dataset.key) this._onSelect(target)
                else if (target.dataset.lfoTypeSelect) {
                    this._onLfoSelect(target)
                } else if (target.dataset.sound) {
                    // Logic from original handlers
                    if (target.dataset.sound === 'instrument') this._onInstrumentChange(target)
                    else if (target.dataset.sound === 'sample') this._onSampleChange(target)
                    else if (target.dataset.sound === 'generated') this._onGeneratedChange(target)
                }
            } else if (target.type === 'range') {
                this._isDragging = false
                playbackEvents.dispatchPatternChange([this._track])
            }
        })

        this.container.addEventListener('click', (e) => {
            const target = e.target

            if (target.dataset.lfoToggleBtn) {
                this._onLfoToggleBtn(target.dataset.lfoToggleBtn)
                return
            }
            if (target.dataset.lfoSelectBtn) {
                this._onLfoSelectBtn(target.dataset.lfoSelectBtn)
                return
            }
            if (target.dataset.fxToggleBtn) {
                this._toggleFxByKey(target.dataset.fxToggleBtn)
                return
            }
            if (target.dataset.fxTab) {
                this._onFxTab({ dataset: { fxTab: target.dataset.fxTab } })
                return
            }
            if (target.dataset.fxIconVal) {
                this._onFxIcon(target)
                return
            }

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
            } else if (btn.dataset.action === 'load-sample') {
                this._onLoadSample()
            } else if (btn.dataset.neTab) {
                this._onTabClick(btn.dataset.neTab)
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
        playbackEvents.dispatchPatternChange([this._track])
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
        playbackEvents.dispatchPatternChange([this._track])
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
        playbackEvents.dispatchPatternChange([this._track])
    }

    _onTabClick(tabId) {
        if (tabId === this._activeTab) return
        this._activeTab = tabId
        this.sync()
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
        playbackEvents.dispatchPatternChange([this._track])
    }

    _onRowClick(propKey) {
        this._selectedPropKey = propKey
        this.sync()
    }

    _toggleFx(btn) {
        const key = btn.dataset.fxToggle
        this._toggleFxByKey(key)
    }

    _toggleFxByKey(key) {
        const isOn = Number(this._track[key] ?? 0) > 0
        this._track[key] = isOn ? 0 : 0.5
        this.sync()
        playbackEvents.dispatchPatternChange([this._track])
    }

    _onFxTab(btn) {
        const tabIdx = parseInt(btn.dataset.fxTab, 10)
        this._activeFxTab = tabIdx
        const fxPanel = this.container.querySelector('[data-tab-panel="fx"]')
        if (fxPanel) {
            fxPanel.querySelectorAll('.te-mod-btn').forEach(b => b.classList.remove('active'))
            fxPanel.querySelectorAll('.te-mod-btn')[tabIdx]?.classList.add('active')
        }
        this.container.querySelectorAll('.fx-tab-panel').forEach(p => {
            p.style.display = p.dataset.fxPanel === String(tabIdx) ? '' : 'none'
        })
    }

    _onFxIcon(btn) {
        if (!this._track) return
        const key = btn.dataset.fxIconVal
        const group = btn.closest('[data-fx-icon-key]')
        if (!group) return
        const propKey = group.dataset.fxIconKey
        this._track[propKey] = key
        group.querySelectorAll('.fx-icon-btn').forEach(b => b.classList.remove('selected'))
        btn.classList.add('selected')
        playbackEvents.dispatchTrackParamChange(this._track)
    }

    _toggleLfo() {
        const prop = [...ALL_TRACK_PROPS, ...KNOB_PROPS].find(p => p.key === this._selectedLfoTarget)
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
        playbackEvents.dispatchPatternChange([this._track])
    }

    _onLfoSelectBtn(targetKey) {
        this._selectedLfoTarget = targetKey
        this.sync()
    }

    _onLfoToggleBtn(targetKey) {
        this._selectedLfoTarget = targetKey
        const allLfoProps = [...ALL_TRACK_PROPS, ...KNOB_PROPS].filter(p => p.lfo)
        const prop = allLfoProps.find(p => p.key === targetKey)
        if (!prop) return
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
        playbackEvents.dispatchTrackParamChange(this._track)
        playbackEvents.dispatchPatternChange([this._track])
    }

    _onLfoSlider(input) {
        this._isDragging = true
        const prop = [...ALL_TRACK_PROPS, ...KNOB_PROPS].find(p => p.key === this._selectedLfoTarget)
        if (!prop) return
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
        const prop = [...ALL_TRACK_PROPS, ...KNOB_PROPS].find(p => p.key === this._selectedLfoTarget)
        if (!prop) return
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
        document.getElementById('pattern-panel')?.classList.remove('pp-split')
        this.container?.classList.remove('pp-split')
        
        this._track = null
        this._trackIdx = -1
        this._selectedPropKey = null
        this._lastTick = -1
        this._noteEditMode = false
        this._selectedNote = null
        this._noteSliders.forEach(s => s.destroy())
        this._noteSliders = []
        this._knobs.forEach(k => k.destroy())
        this._knobs = []
        this._fxKnobs.forEach(k => k.destroy())
        this._fxKnobs = []
        if (this._lfoBridge) {
            this._lfoBridge.destroy()
            this._lfoBridge = null
        }
        setViewBtn('edit', false)
    }

    /** Skip vertical reposition when in side-by-side split mode. */
    reposition() {
        if (this.container?.classList.contains('pp-split')) return
        super.reposition()
    }

    _onLoopSlider(input) {
        if (!this._track) return
        this._isDragging = true
        const key = input.dataset.loop
        const val = key === 'swingAmount' ? parseFloat(input.value) : parseInt(input.value)
        const oldStepsPerBeat = this._track.stepsPerBeat

        this._track[key] = val

        if (key === 'stepsPerBeat') {
            if (this._track.notes) {
                this._track.notes.forEach(note => {
                    const steppc = note.steppc ?? Math.round((note.beatStep * 100) / (oldStepsPerBeat ?? 4))
                    note.beatStep = Math.min(Math.round((steppc / 100) * val), val - 1)
                })
            }
        }

        const maxSteps = (this._track.nbBeats ?? 4) * (this._track.stepsPerBeat ?? 4)
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
            playbackEvents.dispatchPatternChange([this._track])
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
