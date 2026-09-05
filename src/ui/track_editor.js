// src/ui/track_editor.js — Coordinator
//
// Thin coordinator that delegates tab rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons.

import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import Utils from '../core/utils.js'

import SynthEditor from './synth_editor.js'
import { OrKnob } from './components/or_knob.js'
import { OrTab } from './components/or_tab.js'
import { syncComponentMap } from './components/sync_helpers.js'
import { fmt, setViewBtn, knobFormat, renderIconChoices, setPatternPanelHidden } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'
import { TICK } from '../core/constants.js'
import { isMobileLandscape, applyLayout, removeLayout } from './mobile_track_layout.js'
import LfoUiBridge from '../logic/lfo_ui_bridge.js'
import { color } from './theme.js'
import { analyzeSample, clearAnalysisCache, drawEnvelope } from '../audio/sample_analyzer.js'
import { logger } from '../core/logger.js'
import { recalcLoopDerived } from '../model/track_schema.js'

// ── Section imports ───────────────────────────────────────────────────
import GenerationSection from './track_editor/generation_section.js'
import FxSection from './track_editor/fx_section.js'
import SoundSection from './track_editor/sound_section.js'
import ModulationSection from './track_editor/modulation_section.js'
import LoopSection from './track_editor/loop_section.js'

// ── Constants ────────────────────────────────────────────────────────
import { FX_DEFS, TAB_DEFS, ALL_TRACK_PROPS, KNOB_PROPS } from './track_editor/constants.js'

export default class TrackEditor extends BasePanel {
    /**
     * @param {object} [deps]  Optional dependency overrides (DI).
     *   When omitted the module-level singletons are used.
     */
    constructor(deps = {}) {
        super('te-panel')

        // ── DI'd dependencies with fallback to module singletons ────
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
        this._prevFilterType = undefined
        this._knobs = []
        this._fxKnobs = []
        this._noteEditor = null

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

    // ── Lifecycle ──────────────────────────────────────────────────

    setNoteEditor(editor) { this._noteEditor = editor }

    createDOM() {
        super.createDOM()
        this._neContainer = document.createElement('div')
        this._neContainer.id = 'ne-container'
        this._neContainer.style.display = 'none'
        this.container.appendChild(this._neContainer)
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
        this._playbackEvents.on("trackSelect", (data) => {
            if (!data) return
            if (this.isVisible) {
                this._track = data.track
                this._trackIdx = data.trackIdx
                this.sync()
                this._showNoteEditorForTrack(data.track, data.trackIdx)
            }
        })
        this._playbackEvents.on("playbackStart", () => this._startStepWatch())
        this._playbackEvents.on("playbackStop", () => this._stopStepWatch())
        this._playbackEvents.on("drumkitChange", () => { if (this._track) this.sync() })
        this._playbackEvents.on("patternChange", () => {
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
            const ctrl = this._sliders.get(p.key) ?? this._fxKnobs.find(kn => kn.key === p.key)
            if (!ctrl) return
            const raw = lfoValues[p.key] ?? 0
            ctrl.setValue(p.denormalize ? p.denormalize(raw) : raw)
        })
        KNOB_PROPS.forEach(p => {
            if (p.lfo && this._track[p.lfo]) {
                const knob = this._knobs.find(k => k.key === p.key)
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
        const prevFxKnobs = new Map(this._fxKnobs.map(k => [k.key, k]))
        this._fxKnobs = []

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

        // Detach ne-container before innerHTML wipe (it lives in #te-panel,
        // not inside .track-editor, but innerHTML on #te-panel would destroy it)
        const neC = this._preserveNeContainer()

        this.container.innerHTML = `<div class="track-editor">${headerHtml + sampleBarHtml + knobBarHtml + tabBarHtml + `<div class="te-scroll">${panelsHtml}</div>`}</div>`

        this._restoreNeContainer(neC)
        const teElement = this.container.querySelector('.track-editor') ?? this.container
        this._tab.bindTo(teElement)

        // Mount main sliders
        this._sliders.forEach(s => {
            const row = this.container.querySelector(`.ne-row[data-or-slider="${s.key}"]`)
            if (row) {
                s.mount(row)
                const input = row.querySelector('input')
                if (input) {
                    input.addEventListener('change', () => {
                        this._isDragging = false
                        this._emitTrackChange()
                    })
                }
            }
        })

        // Mount FX knobs
        this._fxKnobs.forEach(k => {
            const row = this.container.querySelector(`.ne-row[data-or-slider="${k.key}"]`)
            if (row) k.mount(row)
        })

        // ── Knob bar (keep-alive: reuse OrKnob instances) ───────────
        this._syncKnobs()

        // ── Destroy orphaned slider/fxKnob instances ──────────────
        for (const [key, slider] of prevSliders) {
            if (!this._sliders.has(key)) slider.destroy()
        }
        for (const [key, knob] of prevFxKnobs) {
            if (!this._fxKnobs.some(k => k.key === key)) knob.destroy()
        }

        if (this.synthEditor?.panel?.style?.display !== 'block') {
            this.container.style.display = 'block'
        }
        this._bindEvents()
        this._drawSampleWaveform()

        this._syncMobileLayout()
    }

    /** Detach ne-container from DOM so innerHTML wipe doesn't destroy it. */
    _preserveNeContainer() {
        const neC = this._neContainer
        if (neC?.parentNode) neC.parentNode.removeChild(neC)
        return neC
    }

    /** Re-attach previously preserved ne-container after innerHTML wipe. */
    _restoreNeContainer(neC) {
        if (neC) this.container.appendChild(neC)
    }

    /** Apply mobile-specific layout if on a mobile viewport. */
    _syncMobileLayout() {
        if (isMobileLandscape()) {
            applyLayout(this.container)
            if (this._track) this._showNoteEditorForTrack(this._track, this._trackIdx)
        } else {
            removeLayout(this.container)
        }
    }

    /** Sync knob bar: reuse OrKnob instances, create new ones, destroy orphans. */
    _syncKnobs() {
        const prevKnobs = new Map(this._knobs.map(k => [k.key, k]))
        const knobConfigs = KNOB_PROPS.map(def => {
            const isDecay = def.key === 'decay'
            const sound = isDecay ? this._soundRegistry.sounds[this._track?.soundId] : null
            const value = isDecay ? (sound?.decay ?? 0) : (this._track[def.key] ?? def.min)
            const onChange = (v) => {
                if (isDecay) { if (sound) sound.decay = v }
                else { this._track[def.key] = v }
                this._emitTrackChange()
                if (isDecay) this._drawSampleWaveform()
            }
            return { key: def.key, def, value, onChange }
        })

        this._knobs = [...syncComponentMap({
            container: this.container,
            configs: knobConfigs,
            selector: 'or-knob',
            prev: prevKnobs,
            create: (cfg) => new OrKnob({
                key:    cfg.def.key,
                label:  cfg.def.label,
                min:    cfg.def.min,
                max:    cfg.def.max,
                step:   cfg.def.step,
                value:  cfg.value,
                format: knobFormat(cfg.def),
                unit:   cfg.def.key === 'velocity' ? '%' : cfg.def.key === 'pitch' ? 'st' : cfg.def.key === 'decay' ? 'ms' : '',
                onChange: cfg.onChange,
            }),
            update: (inst, cfg) => {
                inst.onChange = cfg.onChange
                inst.setValue(cfg.value)
            },
            postMount: (el) => el.removeAttribute('data-prop'),
        }).values()]
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
                <input type="file" class="te-load-input hidden-file-input" accept=".wav,.flac,.mp3,.aac">
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
        drawEnvelope(ctx, analysis.envelope, canvas.width, canvas.height, color('waveform-cyan'))
        const decaySec = (sound.decay ?? 0) / 1000
        const totalSec = sound.buffer.duration
        if (totalSec > 0) {
            const ratio = Math.min(decaySec / totalSec, 1)
            const x = ratio * canvas.width
            ctx.strokeStyle = color('waveform-yellow')
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
            this._emitTrackChange()
        } catch (err) {
            logger.warn('TrackEditor', `Sample import failed: ${err.message}`)
        }
        e.target.value = ''
    }

    _toggleFxByKey(key) {
        this._fxSection.toggleFxByKey(key)
        this.sync()
        this._emitTrackChange()
    }

    _onFxIcon(target) {
        this._fxSection.onFxIcon(target)
        this.sync()
        this._emitTrackChange()
    }

    _onFxTab(btn)                 { this._fxSection.onFxTab(btn) }

    _onGenTab(genTabId) {
        if (!genTabId) return
        this._genSection._genSubTab.setActive(genTabId)
        this.sync()
    }

    _onLfoSelectBtn(k) {
        this._modSection.onSelectBtn(k)
        this.sync()
        this._emitTrackChange()
    }

    _onLfoToggleBtn(k) {
        this._modSection.onToggleBtn(k)
        this.sync()
        this._emitTrackChange()
    }

    _onLfoSlider(input) {
        const needsSync = this._modSection.onSlider(input)
        if (needsSync) this.sync()
        this._emitTrackChange()
    }

    _onLfoSelect(sel) {
        this._modSection.onSelect(sel)
        this._emitTrackChange()
    }

    _toggleLfoForTarget(k) {
        this._modSection._toggleLfoForTarget(k)
        this.sync()
        this._emitTrackChange()
    }

    // ── Event delegation ───────────────────────────────────────────

    _bindEvents() {
        if (this._delegationBound) return

        // LFO sliders are plain <input> elements (not OrSlider instances)
        // and require delegated input handling.
        this.container.addEventListener('input', (e) => {
            const target = e.target
            if (target.dataset.lfoKey) {
                this._onLfoSlider(target)
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
            }
        })

        this.container.addEventListener('click', (e) => {
            const target = e.target
            if (target.dataset.lfoToggleBtn)  { this._onLfoToggleBtn(target.dataset.lfoToggleBtn); return }
            if (target.dataset.lfoSelectBtn)  { this._onLfoSelectBtn(target.dataset.lfoSelectBtn); return }
            if (target.dataset.fxToggleBtn)   { this._toggleFxByKey(target.dataset.fxToggleBtn); return }
            if (target.dataset.fxTab)         { this._onFxTab({ dataset: { fxTab: target.dataset.fxTab } }); return }
            if (target.dataset.genTab)        { this._onGenTab(target.dataset.genTab); return }
            {
                const genTabEl = target.closest?.('[data-gen-tab]')
                if (genTabEl) { this._onGenTab(genTabEl.dataset.genTab); return }
            }
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
        this._emitTrackChange()
    }

    _onToggle(btn) {
        if (!this._track) return
        const key = btn.dataset.key
        this._track[key] = !this._track[key]
        btn.textContent = this._track[key] ? 'ON' : 'OFF'
        btn.classList.toggle('active', this._track[key])
        this._emitTrackChange()
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
            this._playbackEvents.batch(() => {
                this._playbackEvents.emit('loopPointChange', {
                    trackIdx: this._trackIdx, loopAtStep: this._track.loopAtStep
                })
                this._emitTrackChange()
            })
        } else {
            this._emitTrackChange()
        }
    }

    _emitTrackChange() {
        this._playbackEvents.batch(() => {
            this._playbackEvents.emit("trackParamChange", this._track)
            this._playbackEvents.emit("patternChange", [this._track])
        })
    }

    // ── Hide ───────────────────────────────────────────────────────

    hide() {
        if (!this.isVisible) return
        if (this.container) removeLayout(this.container)
        super.hide()
        this.synthEditor.reset()
        setPatternPanelHidden(false)
        this.container?.classList.remove('pp-split')

        this._track = null
        this._trackIdx = -1
        this._selectedPropKey = null
        this._lastTick = -1
        this._knobs.forEach(k => k.destroy())
        this._knobs = []
        this._fxKnobs.forEach(k => k.destroy())
        this._fxKnobs = []
        if (this._lfoBridge) { this._lfoBridge.destroy(); this._lfoBridge = null }
        if (this._noteEditor) this._noteEditor.hide()
        setViewBtn('edit', false)
    }

    // ─── Public API ───────────────────────────────────────────────────────
    /** @returns {Object|null} current track */
    get track() { return this._track }
    /** @param {Object} t */
    set track(t) { this._track = t }

    /** @returns {number} current track index */
    get trackIdx() { return this._trackIdx }
    /** @param {number} idx */
    set trackIdx(idx) { this._trackIdx = idx }

    /** @returns {Map} slider instances keyed by key */
    get sliders() { return this._sliders }

    /** @returns {OrKnob[]} knob bar instances */
    get knobs() { return this._knobs }

    /** @returns {OrKnob[]} FX knob instances */
    get fxKnobs() { return this._fxKnobs }

    /** @returns {OrTab} FX tab controller */
    get fxTab() { return this._fxTab }

    /** @returns {string|null} currently selected FX property key */
    get selectedPropKey() { return this._selectedPropKey }
    set selectedPropKey(k) { this._selectedPropKey = k }

    /** @returns {string|null} currently selected LFO target key */
    get selectedLfoTarget() { return this._selectedLfoTarget }
    set selectedLfoTarget(k) { this._selectedLfoTarget = k }

    /** @returns {boolean} true while user is dragging a knob/slider */
    get isDragging() { return this._isDragging }
    set isDragging(v) { this._isDragging = v }

    /** @returns {string|undefined} previous filter type before bypass */
    get prevFilterType() { return this._prevFilterType }
    set prevFilterType(v) { this._prevFilterType = v }

    /** @returns {object} event bus */
    get playbackEvents() { return this._playbackEvents }

    /** @returns {object} service registry */
    get serviceRegistry() { return this._serviceRegistry }

    /** @returns {object} sound registry */
    get soundRegistry() { return this._soundRegistry }

    /** @returns {object} app state */
    get appState() { return this._appState }
}