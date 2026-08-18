// src/ui/track_editor.js — Coordinator
//
// Thin coordinator that delegates tab rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons for backward compatibility.

import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import Utils from '../core/utils.js'
import { createSignal, effect, batch } from '../core/signals.js'

import SynthEditor from './synth_editor.js'
import { OrSlider } from './components/or_slider.js'
import { OrKnob } from './components/or_knob.js'
import { OrTab } from './components/or_tab.js'
import { fmt, setViewBtn, knobFormat, renderOptions, renderIconChoices } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'
import { TICK } from '../core/constants.js'
import { isMobileLandscape, applyLayout, removeLayout } from './mobile_track_layout.js'
import LfoUiBridge from '../logic/lfo_ui_bridge.js'
import { analyzeSample, clearAnalysisCache, drawEnvelope } from '../audio/sample_analyzer.js'
import { logger } from '../core/logger.js'
import { recalcLoopDerived } from '../model/track_schema.js'

// ── Section imports ───────────────────────────────────────────────────
import GenerationSection from './track_editor/GenerationSection.js'
import FxSection from './track_editor/FxSection.js'
import SoundSection from './track_editor/SoundSection.js'
import ModulationSection from './track_editor/ModulationSection.js'
import LoopSection from './track_editor/LoopSection.js'

// ── Constants (import for local use + re-export for backward compat) ──
import { FX_DEFS, TAB_DEFS, ALL_TRACK_PROPS, KNOB_PROPS } from './track_editor/constants.js'
export { FX_DEFS, FILTER_TYPE_ICONS, FILTER_PROPS, KNOB_PROPS, TAB_DEFS, ALL_TRACK_PROPS, PROP_BY_KEY } from './track_editor/constants.js'

export default class TrackEditor extends BasePanel {
    /**
     * @param {object} [deps]  Optional dependency overrides (DI).
     *   When omitted the module-level singletons are used — identical to
     *   the pre-refactor behaviour, so existing callers and tests keep working.
     */
    constructor(deps = {}) {
        super('te-panel')

        // ── DI'd dependencies (with backward-compatible defaults) ────
        this._appState = deps.appState ?? appState
        this._serviceRegistry = deps.serviceRegistry ?? serviceRegistry
        this._soundRegistry = deps.soundRegistry ?? soundRegistry
        this._playbackEvents = deps.playbackEvents ?? playbackEvents

        // ── Shared state (tests access these directly) ───────────────
        this._track = null
        this._trackIdx = -1
        this._selectedPropKey = null
        this._rafId = null
        this._lastTick = -1
        this._isDragging = false
        this._sliders = new Map()
        this._lfoBridge = null
        this._delegationBound = false
        this._selectedLfoTarget = null
        this._prevFilterType = undefined
        this._knobs = []
        this._fxKnobs = []
        this._noteEditor = null
        this._knobDisposers = []

        // ── Sub-components ───────────────────────────────────────────
        this.synthEditor = new SynthEditor(this)
        this._tab = new OrTab({
            tabs: TAB_DEFS,
            defaultTab: 'fx',
            onChange: () => this.sync()
        })
        this._fxTab = new OrTab({
            tabs: FX_DEFS.map((fx, i) => ({ id: String(i), label: fx.label })),
            defaultTab: '0',
            css: {
                bar: 'te-mod-targets',
                btn: 'te-mod-btn',
                panel: 'fx-tab-panel',
                hidden: 'fx-tab-panel-hidden',
                dataAttr: 'fxTab',
                panelData: 'fxPanel',
            },
        })

        // ── Sections ─────────────────────────────────────────────────
        this._genSection = new GenerationSection(this)
        this._fxSection = new FxSection(this)
        this._sndSection = new SoundSection(this)
        this._modSection = new ModulationSection(this)
        this._loopSection = new LoopSection(this)
    }

    // Backward-compat setters for tests that set _activeTab / _activeFxTab
    set _activeTab(id) { /* noop — kept for test compat */ }
    set _activeFxTab(idx) { /* noop — kept for test compat */ }

    // ── Lifecycle ──────────────────────────────────────────────────

    setNoteEditor(editor) { this._noteEditor = editor }

    createDOM() {
        super.createDOM()
        this._neContainer = document.createElement('div')
        this._neContainer.id = 'ne-container'
        this._neContainer.style.display = 'none'
        document.body.appendChild(this._neContainer)
        this.synthEditor.createDOM()
    }

    _showNoteEditorForTrack(track, trackIdx) {
        if (!this._noteEditor) return
        this._noteEditor.container.style.display = 'block'
        const firstNote = track.notes?.[0]
        if (firstNote) {
            const stepsPerBeat = track.stepsPerBeat ?? 4
            const pos = (firstNote.beat ?? 0) * stepsPerBeat + (firstNote.beatStep ?? 0)
            this._noteEditor.showInline({
                track, trackIdx, note: firstNote, pos,
                beat: firstNote.beat ?? 0, beatStep: firstNote.beatStep ?? 0
            })
        } else {
            this._noteEditor.showEmptyInline({ track, trackIdx })
        }
    }

    subscribe() {
        this._playbackEvents.onTrackSelect.push((data) => {
            if (!data) return
            if (this.isVisible) {
                this._track = data.track
                this._trackIdx = data.trackIdx
                this.sync()
                this._showNoteEditorForTrack(data.track, data.trackIdx)
            }
        })
        this._playbackEvents.onPlaybackStart.push(() => this._startStepWatch())
        this._playbackEvents.onPlaybackStop.push(() => this._stopStepWatch())
        this._playbackEvents.onDrumkitChange.push(() => { if (this._track) this.sync() })
        this._playbackEvents.onPatternChange.push(() => {
            if (this._isDragging) return
            if (!this._track) return
            const pattern = this._appState.patterns[this._appState.selectedPatternNum]
            if (!pattern?.tracks) return
            const newIdx = pattern.tracks.findIndex(t => t?.name === this._track.name)
            if (newIdx === -1) {
                this._track = null
                this._trackIdx = -1
                if (this.isVisible) this.sync()
                return
            }
            if (pattern.tracks[newIdx] !== this._track) {
                this._track = pattern.tracks[newIdx]
                this._trackIdx = newIdx
                if (this.isVisible) this.sync()
            }
        })
    }

    // ── Step watch (LFO animation) ─────────────────────────────────

    _startStepWatch() {
        if (this._rafId) return
        this._lastTick = -1
        const tick = () => {
            const transport = this._serviceRegistry.transport
            if (!transport?.isRunning) { this._rafId = null; return }
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
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null }
        this._lastTick = -1
        if (this._lfoBridge) { this._lfoBridge.destroy(); this._lfoBridge = null }
    }

    _lfoValuesForTick(tick) {
        if (!this._track) return null
        const pattern = this._appState.patterns[this._appState.selectedPatternNum]
        if (!pattern) return null
        const nbTicks = TICK * pattern.nbBeats
        if (!this._lfoBridge) this._lfoBridge = new LfoUiBridge(this._serviceRegistry.audioCtx)
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
        const transport = this._serviceRegistry.transport
        if (!transport) return
        const tick = transport.tick
        const result = this._lfoValuesForTick(tick)
        if (!result) return
        const values = result instanceof Promise ? await result : result
        if (values && transport.tick === tick) this._applyLfoValues(values)
    }

    // ── Show / Sync / Hide ─────────────────────────────────────────

    show({ track, trackIdx }) {
        this._track = track
        this._trackIdx = trackIdx
        super.show()
        void this.synthEditor.ensureGeneratedSoundsLoaded()
        if (this._serviceRegistry.transport?.isRunning) this._startStepWatch()
        setViewBtn('edit', true)
    }

    sync() {
        if (!this._track) return

        const soundInfo = this._sndSection._getSoundInfo()

        let headerHtml = `<div class="ne-header">
            <span class="ne-track">Track: ${this.esc(this._track.name)}${soundInfo ? ' - ' + this.esc(soundInfo) : ''}</span>
        </div>`

        let sampleBarHtml = this._renderSampleBar()
        let knobBarHtml = this._renderKnobBar()

        // ── Snapshot existing instances for reuse ──────────────────
        const prevSliders = new Map(this._sliders)
        this._sliders.clear()
        const prevFxKnobs = new Map(this._fxKnobs.map(k => [k._key, k]))
        this._fxKnobs = []
        const prevKnobs = new Map(this._knobs.map(k => [k._key, k]))

        let tabBarHtml = this._tab.renderBar()

        let panelsHtml = ''

        const TAB_PANEL_MAP = {
            gen:  () => this._genSection.render(),
            fx:   () => this._fxSection.render(),
            snd:  () => this._sndSection.render(),
            mod:  () => this._modSection.render(),
            loop: () => this._loopSection.render()
        }

        for (const tab of TAB_DEFS) {
            const isHidden = this._tab.isHidden(tab.id)
            const panelFn = TAB_PANEL_MAP[tab.id]
            const content = panelFn ? panelFn() : ''
            panelsHtml += `<div class="ne-tab-panel ${isHidden ? 'ne-tab-panel-hidden' : ''}" data-tab-panel="${tab.id}">${content}</div>`
        }

        if (this._neContainer && this._neContainer.parentElement && this._neContainer.parentElement !== document.body) {
            document.body.appendChild(this._neContainer)
        }

        this.container.innerHTML = `<div class="track-editor">${headerHtml + sampleBarHtml + knobBarHtml + tabBarHtml + `<div class="te-scroll">${panelsHtml}</div>`}</div>`
        const teElement = this.container.querySelector('.track-editor') ?? this.container
        this._tab.bindTo(teElement)

        // Mount main sliders
        this._sliders.forEach(s => {
            const row = this.container.querySelector(`.ne-row[data-or-slider="${s._key}"]`)
            if (row) {
                s.mount(row)
                const input = row.querySelector('input')
                if (input) {
                    input.addEventListener('change', () => {
                        this._isDragging = false
                        this._playbackEvents.dispatchPatternChange([this._track])
                    })
                }
            }
        })

        // Mount FX knobs
        this._fxKnobs.forEach(k => {
            const row = this.container.querySelector(`.ne-row[data-or-slider="${k._key}"]`)
            if (row) k.mount(row)
        })

        // ── Knob bar (keep-alive: reuse OrKnob instances) ───────────
        for (const d of this._knobDisposers) d()
        this._knobDisposers = []

        KNOB_PROPS.forEach(def => {
            const placeholder = this.container.querySelector(`[data-or-knob="${def.key}"]`)
            if (!placeholder) return
            const isDecay = def.key === 'decay'
            const sound = isDecay ? this._soundRegistry.sounds[this._track?.soundId] : null
            const initialVal = isDecay ? (sound?.decay ?? 0) : (this._track[def.key] ?? def.min)
            const [getVal, setVal] = createSignal(initialVal)

            const onChange = (v) => {
                setVal(v)
                if (isDecay) { if (sound) sound.decay = v }
                else { this._track[def.key] = v }
                this._playbackEvents.dispatchTrackParamChange(this._track)
                if (isDecay) this._drawSampleWaveform()
            }

            let knob = prevKnobs.get(def.key)
            if (knob) {
                knob._onChange = onChange
                knob.setValue(initialVal)
            } else {
                knob = new OrKnob({
                    key: def.key,
                    label: def.label,
                    min: def.min,
                    max: def.max,
                    step: def.step,
                    value: initialVal,
                    format: knobFormat(def),
                    unit: def.key === 'velocity' ? '%' : def.key === 'pitch' ? 'st' : isDecay ? 'ms' : '',
                    onChange
                })
            }
            const el = knob.createElement()
            el.removeAttribute('data-prop')
            placeholder.replaceWith(el)
            this._knobs.push(knob)

            this._knobDisposers.push(effect(() => {
                knob.setValue(getVal())
            }))
        })

        // ── Destroy orphaned instances that weren't reused ────────
        for (const [key, slider] of prevSliders) {
            if (!this._sliders.has(key)) slider.destroy()
        }
        for (const [key, knob] of prevFxKnobs) {
            if (!this._fxKnobs.some(k => k._key === key)) knob.destroy()
        }
        for (const [key, knob] of prevKnobs) {
            if (!this._knobs.some(k => k._key === key)) knob.destroy()
        }

        if (this.synthEditor?.panel?.style?.display !== 'block') {
            this.container.style.display = 'block'
        }
        this._bindEvents()
        this._drawSampleWaveform()

        if (isMobileLandscape()) {
            applyLayout(this.container, this._neContainer)
            if (this._track) this._showNoteEditorForTrack(this._track, this._trackIdx)
        } else {
            removeLayout(this.container)
        }
    }

    // ── Sample bar ─────────────────────────────────────────────────

    _renderSampleBar() {
        const track = this._track
        if (track.useSoftSynth) return ''
        const soundId = track.soundId ?? ''
        const sound = this._soundRegistry.sounds[soundId]
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
                <button class="te-load-btn" data-action="load-sample" title="Import sample to replace current">↑</button>
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
            <div data-or-knob="decay"></div>
        </div>`
    }

    _drawSampleWaveform() {
        const canvas = this.container?.querySelector('.te-waveform')
        if (!canvas) return
        const sound = this._soundRegistry.sounds[this._track?.soundId]
        if (!sound?.buffer) return
        const analysis = analyzeSample(sound.buffer)
        if (!analysis?.envelope?.length) return
        const ctx = canvas.getContext('2d')
        drawEnvelope(ctx, analysis.envelope, canvas.width, canvas.height, '#00fff5')
        const decaySec = (sound.decay ?? 0) / 1000
        const totalSec = sound.buffer.duration
        if (totalSec > 0) {
            const ratio = Math.min(decaySec / totalSec, 1)
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
        const ctx = this._serviceRegistry.audioCtx
        if (!ctx) return
        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            const soundId = this._track.soundId ?? ''
            const oldSound = this._soundRegistry.sounds[soundId]
            if (oldSound) {
                clearAnalysisCache(oldSound.buffer)
                oldSound.buffer = buffer
                oldSound.display_name = file.name
                oldSound.duration = Math.floor(buffer.duration * 1000)
            } else {
                this._soundRegistry.sounds[soundId] = {
                    url: soundId, key: soundId, display_name: file.name,
                    buffer, duration: Math.floor(buffer.duration * 1000), isLoad: true
                }
            }
            this.sync()
            this._playbackEvents.dispatchPatternChange([this._track])
        } catch (err) {
            logger.warn('TrackEditor', `Sample import failed: ${err.message}`)
        }
        e.target.value = ''
    }

    // ── Backward-compat delegations to sections ────────────────────

    _renderFxGroup()              { return this._fxSection.render() }
    _renderSoundPanel()           { return this._sndSection.render() }
    _renderLfoGroup()             { return this._modSection.render() }
    _renderLoopPanel()            { return this._loopSection.render() }
    _isFxOn(fx)                   { return this._fxSection.isFxOn(fx) }

    _toggleFxByKey(key) {
        this._fxSection.toggleFxByKey(key)
        this.sync()
        this._playbackEvents.dispatchPatternChange([this._track])
    }

    _onFxIcon(target) {
        this._fxSection.onFxIcon(target)
        this.sync()
        this._playbackEvents.dispatchPatternChange([this._track])
    }

    _onFxTab(btn)                 { this._fxSection.onFxTab(btn) }

    _onLfoSelectBtn(k) {
        this._modSection.onSelectBtn(k)
        this.sync()
    }

    _onLfoToggleBtn(k) {
        this._modSection.onToggleBtn(k)
        this.sync()
        this._playbackEvents.dispatchTrackParamChange(this._track)
        this._playbackEvents.dispatchPatternChange([this._track])
    }

    _onLfoSlider(input) {
        const needsSync = this._modSection.onSlider(input)
        if (needsSync) this.sync()
        this._playbackEvents.dispatchTrackParamChange(this._track)
    }

    _onLfoSelect(sel) {
        this._modSection.onSelect(sel)
        this._playbackEvents.dispatchTrackParamChange(this._track)
    }

    _toggleLfoForTarget(k) {
        this._modSection._toggleLfoForTarget(k)
        this.sync()
        this._playbackEvents.dispatchTrackParamChange(this._track)
        this._playbackEvents.dispatchPatternChange([this._track])
    }

    _toggleLfo() {
        this._toggleLfoForTarget(this._selectedLfoTarget)
    }

    _getPreferredSampleForInstrument(id) { return this._sndSection._getPreferredSampleForInstrument(id) }
    _getCurrentInstrumentName(ids, keys) { return this._sndSection._getCurrentInstrumentName(ids, keys) }
    _getSoundInfo()                       { return this._sndSection._getSoundInfo() }
    _getSelectedDrumkitName()             { return this._sndSection._getSelectedDrumkitName() }
    _getAllKitSamples()                   { return this._sndSection._getAllKitSamples() }
    _sortSamplesForCurrentKit(samples)    { return this._sndSection._sortSamplesForCurrentKit(samples) }
    _getSamplesForInstrument(id)          { return this._sndSection._getSamplesForInstrument(id) }
    _getCurrentSoundUrl()                 { return this._sndSection._getCurrentSoundUrl() }

    // ── Event delegation ───────────────────────────────────────────

    _bindEvents() {
        if (this._delegationBound) return

        this.container.addEventListener('input', (e) => {
            const target = e.target
            const key = target.dataset.key ?? target.dataset.lfoKey ?? target.dataset.loop
            if (!key) return
            const slider = Array.from(this._sliders.values()).find(s => s._input === target)
            if (slider) {
                slider.handleInput(e)
                if (key === 'decay') this._drawSampleWaveform()
            } else if (target.dataset.lfoKey) {
                this._onLfoSlider(target)
            } else if (target.dataset.loop) {
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
                else if (target.dataset.lfoTypeSelect) this._onLfoSelect(target)
                else if (target.dataset.sound) {
                    if (target.dataset.sound === 'instrument') this._sndSection.onInstrumentChange(target)
                    else if (target.dataset.sound === 'sample') this._sndSection.onSampleChange(target)
                    else if (target.dataset.sound === 'generated') this._sndSection.onGeneratedChange(target)
                }
            } else if (target.type === 'range') {
                this._isDragging = false
                this._playbackEvents.dispatchPatternChange([this._track])
            }
        })

        this.container.addEventListener('click', (e) => {
            const target = e.target
            if (target.dataset.lfoToggleBtn)  { this._onLfoToggleBtn(target.dataset.lfoToggleBtn); return }
            if (target.dataset.lfoSelectBtn)  { this._onLfoSelectBtn(target.dataset.lfoSelectBtn); return }
            if (target.dataset.fxToggleBtn)   { this._toggleFxByKey(target.dataset.fxToggleBtn); return }
            if (target.dataset.fxTab)         { this._onFxTab({ dataset: { fxTab: target.dataset.fxTab } }); return }
            if (target.dataset.fxIconVal)     { this._onFxIcon(target); return }

            const btn = target.closest('button')
            if (!btn) {
                const row = target.closest('.ne-row[data-prop]')
                if (row && target.tagName !== 'INPUT' && target.tagName !== 'SELECT') {
                    this._onRowClick(row.dataset.prop)
                }
                return
            }

            if (btn.dataset.key)            this._onToggle(btn)
            else if (btn.dataset.action === 'toggle-auto')  this._sndSection.toggleAuto()
            else if (btn.dataset.action === 'edit-synth')   this.synthEditor.openEditor()
            else if (btn.dataset.action === 'load-sample')  this._onLoadSample()
        })

        this._delegationBound = true
    }

    _onRowClick(propKey) {
        this._selectedPropKey = propKey
        this.sync()
    }

    _onSelect(sel) {
        if (!this._track) return
        const key = sel.dataset.key
        let val = sel.value
        if (key === 'delayTime') val = parseFloat(val)
        this._track[key] = val
        this._playbackEvents.dispatchTrackParamChange(this._track)
    }

    _onToggle(btn) {
        if (!this._track) return
        const key = btn.dataset.key
        this._track[key] = !this._track[key]
        btn.textContent = this._track[key] ? 'ON' : 'OFF'
        btn.classList.toggle('active', this._track[key])
        this._playbackEvents.dispatchTrackParamChange(this._track)
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
        if (this._track.loopAtStep > maxSteps) this._track.loopAtStep = maxSteps

        recalcLoopDerived(this._track)

        if (input.nextElementSibling) {
            input.nextElementSibling.textContent = key === 'swingAmount' ? fmt(val) : val
        }

        const loopSlider = this._sliders.get('loopAtStep')
        if (loopSlider) {
            loopSlider.setMax?.(maxSteps)
            if (key !== 'loopAtStep') loopSlider.setValue(this._track.loopAtStep)
        }

        if (key === 'loopAtStep') {
            this._playbackEvents.dispatchLoopPointChange({
                trackIdx: this._trackIdx, loopAtStep: this._track.loopAtStep
            })
        }

        if (key === 'swingAmount') {
            this._playbackEvents.dispatchTrackParamChange(this._track)
        } else {
            this._playbackEvents.dispatchPatternChange([this._track])
        }
    }

    // ── Hide ───────────────────────────────────────────────────────

    hide() {
        if (!this.isVisible) return
        if (this.container) removeLayout(this.container)
        super.hide()
        this.synthEditor.reset()
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        this.container?.classList.remove('pp-split')

        this._track = null
        this._trackIdx = -1
        this._selectedPropKey = null
        this._lastTick = -1
        for (const d of this._knobDisposers) d()
        this._knobDisposers = []
        this._knobs.forEach(k => k.destroy())
        this._knobs = []
        this._fxKnobs.forEach(k => k.destroy())
        this._fxKnobs = []
        if (this._lfoBridge) { this._lfoBridge.destroy(); this._lfoBridge = null }
        if (this._noteEditor) this._noteEditor.hide()
        setViewBtn('edit', false)
    }
}


