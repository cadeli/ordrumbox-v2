// src/ui/track_editor.js — Coordinator
//
// Thin coordinator that delegates tab rendering to section modules.
// The DOM skeleton is built once in createDOM(); sync() only updates values
// in place — no innerHTML wipe, no listener re-binding, and #ne-container
// (which hosts the inline note editor) has a fixed place in the DOM.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons.

import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/event_bus.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { reportUserError, showToast } from '../core/notify.js'
import { getNoteAbsoluteStep } from '../core/notes.js'

import SynthEditor from './synth_editor.js'
import { OrTab } from './components/or_tab.js'
import { OrKnob } from './components/or_knob.js'
import { setViewBtn, knobFormat, setPatternPanelHidden } from './components/ui_utils.js'
import BasePanel from './base_panel.js'
import { TICK, isMobileViewport } from '../core/constants.js'
import { isMobileLandscape, applyLayout, removeLayout } from './mobile_track_layout.js'
import LfoUiBridge from '../logic/lfo_ui_bridge.js'
import { sampleWaveformTheme } from './theme.js'
import { analyzeSample, clearAnalysisCache, drawDecayMarker, drawEnvelope } from '../audio/sample_analyzer.js'
import { logger } from '../core/logger.js'

// ── Section imports ───────────────────────────────────────────────────
import GenerationSection from './track_editor/generation_section.js'
import FxSection from './track_editor/fx_section.js'
import SoundSection from './track_editor/sound_section.js'
import ModulationSection from './track_editor/modulation_section.js'
import LoopSection from './track_editor/loop_section.js'

// ── Constants ────────────────────────────────────────────────────────
import { FX_DEFS, TAB_DEFS, ALL_TRACK_PROPS, KNOB_PROPS } from './track_editor/track_editor_constants.js'
import { TRACK_DEFAULTS } from '../model/track_schema.js'
import { EVENTS } from '../core/events.js'

export default class TrackEditor extends BasePanel {
    // ── DI'd dependencies ─────────────────────────────────────────
    #appState
    #serviceRegistry
    #soundRegistry
    #playbackEvents

    // ── State ─────────────────────────────────────────────────────
    #track
    #selectedTrackIdx
    #selectedPropKey
    #isDragging
    #selectedLfoTarget
    #prevFilterType
    #knobs
    #rafId
    #lastTick
    #isSelecting
    #lfoBridge
    #noteEditor
    #waveObserver
    #waveObservedCanvas
    #neContainer

    // ── Sub-components ────────────────────────────────────────────
    #tab
    #fxTab
    #genSection
    #fxSection
    #sndSection
    #modSection
    #loopSection

    // ── Cached DOM refs (built once by createDOM) ────────────────
    #teRoot
    #headerTrackEl
    #sampleBarEl
    #sampleInfoEl
    #waveCanvas
    /** @type {Map<string, import('./components/or_slider.js').OrSlider|import('./components/or_knob.js').OrKnob>} */
    #controls
    /** False until createDOM() completes — sync() no-ops until then. */
    #domReady

    /**
     * @param {object} [deps] injected singletons, defaulting to the modules
     * @param {object} [deps.appState]
     * @param {object} [deps.serviceRegistry]
     * @param {object} [deps.soundRegistry]
     * @param {object} [deps.playbackEvents]
     */
    constructor(deps = {}) {
        super('te-panel')

        // ── DI'd dependencies with fallback to module singletons ────
        this.#appState = deps.appState ?? appState
        this.#serviceRegistry = deps.serviceRegistry ?? serviceRegistry
        this.#soundRegistry = deps.soundRegistry ?? soundRegistry
        this.#playbackEvents = deps.playbackEvents ?? playbackEvents

        // ── Shared state (read/write through the public API below) ─
        this.#track = null
        this.#selectedTrackIdx = -1
        this.#selectedPropKey = null
        this.#rafId = null
        this.#lastTick = -1
        this.#isDragging = false
        this.#isSelecting = false
        this.#lfoBridge = null
        this.#selectedLfoTarget = null
        this.#prevFilterType = undefined
        this.#knobs = []
        this.#controls = new Map()
        this.#noteEditor = null
        this.#waveObserver = null
        this.#waveObservedCanvas = null

        // ── Sub-components ───────────────────────────────────────────
        this.synthEditor = new SynthEditor(this)
        this.#tab = new OrTab({
            tabs: TAB_DEFS,
            defaultTab: 'fx',
            onChange: () => this.sync(),
        })
        this.#fxTab = new OrTab({
            tabs: FX_DEFS.map((fx, i) => ({ id: String(i), label: fx.label })),
            defaultTab: '0',
            css: {
                bar: 'te-subtabs',
                btn: 'te-subtab',
                panel: 'fx-tab-panel',
                hidden: 'fx-tab-panel-hidden',
                dataAttr: 'fxTab',
                panelData: 'fxPanel',
            },
        })

        // ── Sections ─────────────────────────────────────────────────
        this.#genSection = new GenerationSection(this)
        this.#fxSection = new FxSection(this)
        this.#sndSection = new SoundSection(this)
        this.#modSection = new ModulationSection(this)
        this.#loopSection = new LoopSection(this)
    }

    // ── Public API (cross-class: sections, view manager, bootstrap) ─

    get track() {
        return this.#track
    }
    set track(v) {
        this.#track = v
    }

    /**
     * Index of the track being edited: a mirror of appState.selectedTrackIdx, but
     * -1 while no pattern/track is loaded.
     * @returns {number}
     */
    get selectedTrackIdx() {
        return this.#selectedTrackIdx
    }
    /** @param {number} v */
    set selectedTrackIdx(v) {
        this.#selectedTrackIdx = v
    }

    get selectedPropKey() {
        return this.#selectedPropKey
    }

    get selectedLfoTarget() {
        return this.#selectedLfoTarget
    }
    set selectedLfoTarget(v) {
        this.#selectedLfoTarget = v
    }

    get prevFilterType() {
        return this.#prevFilterType
    }
    set prevFilterType(v) {
        this.#prevFilterType = v
    }

    get fxTab() {
        return this.#fxTab
    }

    get neContainer() {
        return this.#neContainer
    }

    get appState() {
        return this.#appState
    }
    get serviceRegistry() {
        return this.#serviceRegistry
    }
    get soundRegistry() {
        return this.#soundRegistry
    }
    get playbackEvents() {
        return this.#playbackEvents
    }

    /**
     * Live value control (slider or knob) for a track key, or null.
     * Generation sliders win over FX knobs for the shared FX keys.
     * @param {string} key
     * @returns {import('./components/or_slider.js').OrSlider|import('./components/or_knob.js').OrKnob|null}
     */
    getControl(key) {
        return this.#controls.get(key) ?? this.#knobs.find((k) => k.key === key) ?? null
    }

    // ── Lifecycle ──────────────────────────────────────────────────

    setNoteEditor(editor) {
        this.#noteEditor = editor
    }

    createDOM() {
        super.createDOM()
        this.container.innerHTML = `
            <div class="track-editor">
                <div class="ne-header">
                    <span class="ne-track"></span>
                </div>
                <div class="te-sample-bar-wrap">
                    <div class="te-sample-bar">
                        <div class="te-sample-left">
                            <span class="te-sample-info" title="Pitch / Duration / Peak"></span>
                            <button class="te-load-btn" data-action="load-sample" title="Import sample to replace current">↑</button>
                            <input type="file" class="te-load-input hidden-file-input" accept=".wav,.flac,.mp3,.aac">
                        </div>
                        <canvas class="te-waveform" width="500" height="48"></canvas>
                    </div>
                </div>
                <div class="te-knob-bar">
                    <div data-or-knob="velocity"></div>
                    <div data-or-knob="pan"></div>
                    <div data-or-knob="pitch"></div>
                    <div data-or-knob="decay"></div>
                </div>
                ${this.#tab.renderBar()}
                <div class="te-scroll">
                    <div class="ne-tab-panel" data-tab-panel="fx"></div>
                    <div class="ne-tab-panel" data-tab-panel="snd"></div>
                    <div class="ne-tab-panel" data-tab-panel="mod"></div>
                    <div class="ne-tab-panel" data-tab-panel="loop"></div>
                    <div class="ne-tab-panel" data-tab-panel="gen"></div>
                </div>
            </div>
            <div id="ne-container" style="display: none;"></div>
        `
        this.#teRoot = this.container.querySelector('.track-editor')
        this.#headerTrackEl = this.container.querySelector('.ne-track')
        this.#sampleBarEl = this.container.querySelector('.te-sample-bar')
        this.#sampleInfoEl = this.container.querySelector('.te-sample-info')
        this.#waveCanvas = this.container.querySelector('canvas.te-waveform')
        this.#neContainer = this.container.querySelector('#ne-container')
        this.#tab.bindTo(this.#teRoot)
        this.#initKnobs()
        this.#mountSections()
        this.#bindEvents()
        this.synthEditor.createDOM()
        this.#domReady = true
    }

    /** Build each section's rows once inside its tab panel. */
    #mountSections() {
        for (const tab of TAB_DEFS) {
            const panel = this.#teRoot.querySelector(`[data-tab-panel="${tab.id}"]`)
            if (!panel) continue
            if (tab.id === 'gen') this.#genSection.mount(panel)
            else if (tab.id === 'fx') this.#fxSection.mount(panel)
            else if (tab.id === 'snd') this.#sndSection.mount(panel)
            else if (tab.id === 'mod') this.#modSection.mount(panel)
            else if (tab.id === 'loop') this.#loopSection.mount(panel)
        }
    }

    /** Create the knob-bar OrKnobs once, replacing the placeholders. */
    #initKnobs() {
        const bar = this.container.querySelector('.te-knob-bar')
        this.#knobs = KNOB_PROPS.map((def) => {
            const isDecay = def.key === 'decay'
            const dflt = TRACK_DEFAULTS[def.key] ?? (isDecay ? 500 : def.min)
            const knob = new OrKnob({
                key: def.key,
                label: def.label,
                min: def.min,
                max: def.max,
                step: def.step,
                value: isDecay ? (this.#soundRegistry.sounds[this.#track?.sampleId]?.decay ?? 0) : (this.#track?.[def.key] ?? dflt),
                defaultValue: isDecay ? 500 : dflt,
                scale: def.scale,
                format: knobFormat(def),
                // decay's formatter already appends "ms" — a unit here
                // would render the value as "5000 ms ms".
                unit: def.key === 'velocity' ? '%' : def.key === 'pitch' ? 'st' : '',
                onChange: (v) => {
                    if (isDecay) {
                        // Looked up live: the track's sample can change while
                        // the knob persists.
                        const sound = this.#soundRegistry.sounds[this.#track?.sampleId]
                        if (sound) sound.decay = v
                    } else {
                        // Continuous knob: coalesce the drag into ONE undo step.
                        this.#serviceRegistry.cmd?.updateTrack(
                            this.#track,
                            { [def.key]: v },
                            { desc: `${def.label} on ${this.#track.name}`, coalesce: true },
                        )
                    }
                    this.#emitTrackChange()
                    if (isDecay) this.#drawSampleWaveform()
                },
            })
            bar.querySelector(`[data-or-knob="${def.key}"]`)?.replaceWith(knob.createElement())
            return knob
        })
    }

    showNoteEditorForTrack(track, trackIdx) {
        if (!this.#noteEditor) return
        this.#noteEditor.container.style.display = 'block'
        const firstNote = track.notes?.[0]
        if (firstNote) {
            const stepsPerBeat = track.stepsPerBeat ?? 4
            const pos = getNoteAbsoluteStep(firstNote, stepsPerBeat)
            this.#noteEditor.showInline({
                track,
                trackIdx,
                note: firstNote,
                pos,
                beat: firstNote.beat ?? 0,
                beatStep: firstNote.beatStep ?? 0,
            })
        } else {
            this.#noteEditor.showDefaultNoteInline({ track, trackIdx })
        }
    }

    subscribe() {
        this.sub(this.#playbackEvents, EVENTS.ORIENTATION_CHANGE, () => {
            if (this.container) this.#syncMobileLayout()
        })
        this.sub(this.#playbackEvents, EVENTS.TRACK_SELECT, (data) => {
            if (!data) return
            if (this.isVisible) {
                this.#track = data.track
                this.#selectedTrackIdx = data.trackIdx
                this.sync()
                this.showNoteEditorForTrack(data.track, data.trackIdx)
            }
        })
        this.sub(this.#playbackEvents, EVENTS.PLAYBACK_START, () => this.#startStepWatch())
        this.sub(this.#playbackEvents, EVENTS.PLAYBACK_STOP, () => this.#stopStepWatch())
        this.sub(this.#playbackEvents, EVENTS.DRUMKIT_CHANGE, () => {
            if (this.#track) this.sync()
        })
        this.sub(this.#playbackEvents, EVENTS.PATTERN_CHANGE, () => {
            if (this.#isDragging || this.#isSelecting) return
            if (!this.#track) return
            const pattern = this.#appState.selectedPattern
            if (!pattern?.tracks) return
            const currentTrack = this.#track
            let newIdx = pattern.tracks.findIndex((t) => t === currentTrack)
            if (newIdx === -1) newIdx = pattern.tracks.findIndex((t) => t?.name === currentTrack.name)
            if (newIdx === -1) {
                this.#track = null
                this.#selectedTrackIdx = -1
                if (this.isVisible) this.sync()
                return
            }
            this.#track = pattern.tracks[newIdx]
            this.#selectedTrackIdx = newIdx
            if (this.isVisible) this.sync()
        })
    }

    onDestroy() {
        this.#stopStepWatch()
        this.#waveObserver?.disconnect()
        this.#waveObserver = null
        this.#genSection.destroy?.()
        this.#fxSection.destroy?.()
        this.#loopSection.destroy?.()
        this.#modSection.destroy?.()
        for (const k of this.#knobs) k.destroy()
        this.#knobs = []
        this.synthEditor?.destroy?.()
        // Sections are gone: a stale caller (an old ViewManager still bound
        // to the bus) must not reach them — sync() no-ops until createDOM().
        this.#domReady = false
    }

    // ── Step watch (LFO animation) ─────────────────────────────────

    #startStepWatch() {
        if (this.#rafId) return
        this.#lastTick = -1
        const tick = () => {
            const transport = this.#serviceRegistry.transport
            if (!transport?.isRunning) {
                this.#rafId = null
                return
            }
            try {
                const currentTick = transport.tick
                if (currentTick !== this.#lastTick) {
                    this.#lastTick = currentTick
                    this.#updateLfoSliders()
                }
            } catch (err) {
                reportUserError('TrackEditor.lfoLoop', 'LFO meters stopped updating', { cause: err })
            }
            this.#rafId = requestAnimationFrame(tick)
        }
        this.#rafId = requestAnimationFrame(tick)
    }

    #stopStepWatch() {
        if (this.#rafId) {
            cancelAnimationFrame(this.#rafId)
            this.#rafId = null
        }
        this.#lastTick = -1
        if (this.#lfoBridge) {
            this.#lfoBridge.destroy()
            this.#lfoBridge = null
        }
    }

    #lfoValuesForTick(tick) {
        if (!this.#track) return null
        const pattern = this.#appState.selectedPattern
        if (!pattern) return null
        const tickCount = TICK * pattern.beatCount
        if (!this.#lfoBridge) this.#lfoBridge = new LfoUiBridge(this.#serviceRegistry.audioCtx)
        return this.#lfoBridge.compute(this.#track, tick, tickCount)
    }

    #applyLfoValues(lfoValues) {
        if (!lfoValues || !this.#track) return
        ALL_TRACK_PROPS.forEach((p) => {
            if (!p.lfoKey || !this.#track[p.lfoKey]) return
            const ctrl = this.#controls.get(p.key)
            if (!ctrl) return
            const raw = lfoValues[p.key] ?? 0
            ctrl.setValue(p.denormalize ? p.denormalize(raw) : raw)
        })
        KNOB_PROPS.forEach((p) => {
            if (p.lfoKey && this.#track[p.lfoKey]) {
                const knob = this.#knobs.find((k) => k.key === p.key)
                if (knob) knob.setValue(lfoValues[p.key] ?? 0)
            }
        })
    }

    async #updateLfoSliders() {
        if (!this.#track || !this.isVisible) return
        const transport = this.#serviceRegistry.transport
        if (!transport) return
        const tick = transport.tick
        const result = this.#lfoValuesForTick(tick)
        if (!result) return
        const values = result instanceof Promise ? await result : result
        if (values && transport.tick === tick) this.#applyLfoValues(values)
    }

    // ── Show / Sync / Hide ─────────────────────────────────────────

    show({ track, trackIdx }) {
        this.#track = track
        this.#selectedTrackIdx = trackIdx
        this.container.style.display = isMobileViewport() ? 'flex' : 'block'
        this.sync()
        void this.synthEditor.ensureGeneratedSoundsLoaded()
        if (this.#serviceRegistry.transport?.isRunning) this.#startStepWatch()
        setViewBtn('edit', true)
    }

    sync() {
        if (!this.#track) return
        // createDOM() builds the section rows; sync() before it (e.g. a view
        // switch while bootstrap is still unwinding) or after destroy() (a
        // stale bus listener on a torn-down instance) has nothing to update.
        if (!this.#domReady) return

        // 1. Header
        const soundInfo = this.#sndSection.getSoundInfo()
        this.#headerTrackEl.textContent = `Track: ${this.#track.name}${soundInfo ? ' - ' + soundInfo : ''}`

        // 2. Sample bar (visibility + analysis text)
        this.#updateSampleBar()

        // 3. Knob bar
        this.#syncKnobValues()

        // 4. Main tab bar
        this.#tab.refresh(this.#teRoot)

        // 5. Sections
        this.#genSection.sync(this.#track)
        this.#fxSection.sync(this.#track)
        this.#sndSection.sync(this.#track)
        this.#modSection.sync(this.#track)
        this.#loopSection.sync(this.#track)

        // 6. Key → control registry (LFO step watch + getControl)
        this.#rebuildControls()

        if (this.synthEditor?.panel?.style?.display !== 'block') {
            this.container.style.display = isMobileViewport() ? 'flex' : 'block'
        }

        // 7. Waveform
        this.#drawSampleWaveform()

        this.#syncMobileLayout()
    }

    /** Rebuild the key → control registry. Gen sliders win over FX knobs. */
    #rebuildControls() {
        this.#controls = new Map(this.#genSection.controls)
        for (const [key, knob] of this.#fxSection.controls) {
            if (!this.#controls.has(key)) this.#controls.set(key, knob)
        }
        for (const [key, slider] of this.#loopSection.controls) {
            if (!this.#controls.has(key)) this.#controls.set(key, slider)
        }
    }

    /** Apply mobile-specific layout if on a mobile viewport. */
    #syncMobileLayout() {
        if (isMobileLandscape()) {
            applyLayout(this.container)
            if (this.#track) this.showNoteEditorForTrack(this.#track, this.#selectedTrackIdx)
        } else {
            removeLayout(this.container)
        }
    }

    /** Sync knob bar values in place. */
    #syncKnobValues() {
        const track = this.#track
        for (const def of KNOB_PROPS) {
            const knob = this.#knobs.find((k) => k.key === def.key)
            if (!knob) continue
            if (def.key === 'decay') {
                const sound = this.#soundRegistry.sounds[track?.sampleId]
                knob.setValue(sound?.decay ?? 0)
            } else {
                knob.setValue(track[def.key] ?? def.min)
            }
        }
    }

    // ── Sample bar ─────────────────────────────────────────────────

    /** Toggle the sample bar and refresh its analysis text. */
    #updateSampleBar() {
        const track = this.#track
        const sound = track.useSoftSynth ? null : this.#soundRegistry.sounds[track.sampleId ?? '']
        if (!sound?.buffer) {
            this.#sampleBarEl.style.display = 'none'
            return
        }
        this.#sampleBarEl.style.display = ''
        const analysis = analyzeSample(sound.buffer)
        const pitchStr = analysis?.noteInfo ? `${analysis.noteInfo.note}${analysis.noteInfo.octave}` : '—'
        const durStr = analysis?.durationSec != null ? (analysis.durationSec * 1000).toFixed(0) + ' ms' : '—'
        const peakStr = analysis?.peakDb != null ? analysis.peakDb.toFixed(1) + ' dB' : '—'
        this.#sampleInfoEl.textContent = `${pitchStr} · ${durStr} · ${peakStr}`
    }

    #drawSampleWaveform() {
        const canvas = this.#waveCanvas
        if (!canvas) return
        const track = this.#track
        if (track.useSoftSynth) return
        const sound = this.#soundRegistry.sounds[track?.sampleId]
        if (!sound?.buffer) return
        const analysis = analyzeSample(sound.buffer)
        if (!analysis?.envelope?.length) return

        // The canvas box is set by CSS (66% of the sample bar), so the fixed
        // 500px backing store was scaled down and the curve landed on
        // sub-pixel lines. Match the backing store to the rendered size.
        const dpr = window.devicePixelRatio || 1
        const w = canvas.clientWidth > 0 ? Math.max(1, Math.round(canvas.clientWidth * dpr)) : canvas.width
        const h = canvas.clientHeight > 0 ? Math.max(1, Math.round(canvas.clientHeight * dpr)) : canvas.height
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
        }
        this.#observeWaveformCanvas(canvas)

        const ctx = /** @type {HTMLCanvasElement} */ (canvas).getContext('2d')
        const theme = sampleWaveformTheme(2 * dpr)
        drawEnvelope(ctx, analysis.envelope, w, h, theme)

        drawDecayMarker(ctx, sound, w, h, theme, dpr)
    }

    /** Redraw the waveform when its CSS box changes (window / panel resize). */
    #observeWaveformCanvas(canvas) {
        if (typeof ResizeObserver !== 'function' || this.#waveObservedCanvas === canvas) return
        this.#waveObserver?.disconnect()
        this.#waveObservedCanvas = canvas
        this.#waveObserver = new ResizeObserver(() => this.#drawSampleWaveform())
        this.#waveObserver.observe(canvas)
    }

    #onLoadSample() {
        const input = this.container?.querySelector('.te-load-input')
        if (input) /** @type {HTMLElement} */ (input).click()
    }

    async #onSampleFileSelected(e) {
        const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]
        if (!file || !this.#track) return
        const ctx = this.#serviceRegistry.audioCtx
        if (!ctx) return
        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            const sampleId = this.#track.sampleId ?? ''
            const oldSound = this.#soundRegistry.sounds[sampleId]
            if (oldSound) {
                clearAnalysisCache(oldSound.buffer)
                oldSound.buffer = buffer
                oldSound.display_name = file.name
                oldSound.duration = Math.floor(buffer.duration * 1000)
            } else {
                this.#soundRegistry.sounds[sampleId] = {
                    url: sampleId,
                    key: sampleId,
                    display_name: file.name,
                    buffer,
                    duration: Math.floor(buffer.duration * 1000),
                    isLoad: true,
                }
            }
            this.sync()
            this.#emitTrackChange()
        } catch (err) {
            logger.warn('TrackEditor', `Sample import failed: ${err.message}`)
            showToast('Sample import failed: ' + err.message, 'error')
        }
        const input = /** @type {HTMLInputElement} */ (e.target)
        input.value = ''
    }

    #toggleFxByKey(key) {
        const updates = this.#fxSection.toggleFxByKey(key)
        if (updates) {
            this.#serviceRegistry.cmd?.updateTrack(this.#track, updates, {
                desc: `Toggle ${key} on ${this.#track.name}`,
            })
        }
        this.sync()
        this.#emitTrackChange()
    }

    #onFxIcon(target) {
        const updates = this.#fxSection.onFxIcon(target)
        if (updates) {
            this.#serviceRegistry.cmd?.updateTrack(this.#track, updates, {
                desc: `Filter type on ${this.#track.name}`,
            })
        }
        this.sync()
        this.#emitTrackChange()
    }

    #onFxTab(fxTabId) {
        this.#fxSection.onFxTab(fxTabId)
    }

    #onGenTab(genTabId) {
        if (!genTabId) return
        this.#genSection.subTab.setActive(genTabId)
        this.sync()
    }

    #onLfoSelectBtn(k) {
        this.#modSection.onSelectBtn(k)
        this.sync()
        this.#emitTrackChange()
    }

    #onLfoToggleBtn(k) {
        const res = this.#modSection.onToggleBtn(k)
        if (res) {
            this.#serviceRegistry.cmd?.updateTrack(this.#track, res.updates, {
                desc: `LFO ${k} on ${this.#track.name}`,
            })
        }
        this.sync()
        this.#emitTrackChange()
    }

    #onLfoSlider(input) {
        const res = this.#modSection.onSlider(input)
        if (res) {
            this.#serviceRegistry.cmd?.updateTrack(this.#track, res.updates, {
                desc: `LFO ${input.dataset.lfoKey} on ${this.#track.name}`,
                coalesce: true,
            })
        }
        if (res?.created) this.sync()
        this.#emitTrackChange()
    }

    #onLfoSelect(sel) {
        const res = this.#modSection.onSelect(sel)
        if (res) {
            this.#serviceRegistry.cmd?.updateTrack(this.#track, res.updates, {
                desc: `LFO type on ${this.#track.name}`,
            })
        }
        this.#emitTrackChange()
    }

    // ── Event delegation (bound once by createDOM) ─────────────────

    #bindEvents() {
        // LFO sliders are plain <input> elements (not OrSlider instances)
        // and require delegated input handling. Any range-input drag marks
        // the editor as dragging so PATTERN_CHANGE events are ignored until
        // the matching change event resets the flag.
        this.listen(this.container, 'input', (e) => {
            const target = /** @type {HTMLElement} */ (e.target)
            // the nested note editor owns its own inputs
            if (target.closest('#ne-container')) return
            if (/** @type {HTMLInputElement} */ (target).type === 'range') this.#isDragging = true
            if (target.dataset.lfoKey) {
                this.#onLfoSlider(target)
            }
        })

        this.listen(this.container, 'focusin', (e) => {
            if (/** @type {HTMLElement} */ (e.target).tagName === 'SELECT') this.#isSelecting = true
        })
        this.listen(this.container, 'focusout', (e) => {
            if (/** @type {HTMLElement} */ (e.target).tagName === 'SELECT') this.#isSelecting = false
        })

        this.listen(this.container, 'change', (e) => {
            const target = /** @type {HTMLElement} */ (e.target)
            // the nested note editor owns its own selects (arpScale, arpType…)
            if (target.closest('#ne-container')) return
            if (target.classList.contains('te-load-input')) {
                this.#onSampleFileSelected(e)
                return
            }
            if (/** @type {HTMLInputElement} */ (target).type === 'range') {
                if (this.#isDragging) {
                    this.#isDragging = false
                    this.#isSelecting = false
                    this.#emitTrackChange()
                }
                return
            }
            if (target.tagName === 'SELECT') {
                if (target.dataset.key) this.#onSelect(target)
                else if (target.dataset.lfoTypeSelect) this.#onLfoSelect(target)
                else if (target.dataset.sound) {
                    const soundType = target.dataset.sound
                    const p =
                        soundType === 'instrument'
                            ? this.#sndSection.onInstrumentChange(target)
                            : soundType === 'sample'
                              ? this.#sndSection.onSampleChange(target)
                              : soundType === 'generated'
                                ? this.#sndSection.onGeneratedChange(target)
                                : null
                    if (p)
                        p.finally(() => {
                            this.#isSelecting = false
                        })
                }
            }
        })

        this.listen(this.container, 'click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target)
            if (target.dataset.lfoToggleBtn) {
                this.#onLfoToggleBtn(target.dataset.lfoToggleBtn)
                return
            }
            if (target.dataset.lfoSelectBtn) {
                this.#onLfoSelectBtn(target.dataset.lfoSelectBtn)
                return
            }
            if (target.dataset.fxToggleBtn) {
                this.#toggleFxByKey(target.dataset.fxToggleBtn)
                return
            }
            if (target.dataset.fxTab) {
                this.#onFxTab(target.dataset.fxTab)
                return
            }
            const genTabEl = target.closest?.('[data-gen-tab]')
            if (genTabEl) {
                this.#onGenTab(/** @type {HTMLElement} */ (genTabEl).dataset.genTab)
                return
            }
            if (target.dataset.fxIconVal) {
                this.#onFxIcon(target)
                return
            }

            const btn = target.closest('button')
            if (!btn) {
                const row = target.closest('.ne-row[data-prop]')
                if (row && target.tagName !== 'INPUT' && target.tagName !== 'SELECT') {
                    this.#onRowClick(/** @type {HTMLElement} */ (row).dataset.prop)
                }
                return
            }

            if (btn.dataset.key) this.#onToggle(btn)
            else if (btn.dataset.action === 'toggle-auto') this.#sndSection.toggleAuto()
            else if (btn.dataset.action === 'load-sample') this.#onLoadSample()
        })
    }

    #onRowClick(propKey) {
        this.#selectedPropKey = propKey
        this.sync()
    }

    #onSelect(sel) {
        if (!this.#track) return
        const key = sel.dataset.key
        let val = sel.value
        if (key === 'delayTime') val = parseFloat(val)
        this.#serviceRegistry.cmd?.updateTrack(
            this.#track,
            { [key]: val },
            {
                desc: `${key} on ${this.#track.name}`,
            },
        )
        this.#emitTrackChange()
    }

    #onToggle(btn) {
        if (!this.#track) return
        const key = btn.dataset.key
        this.#serviceRegistry.cmd?.updateTrack(
            this.#track,
            { [key]: !this.#track[key] },
            {
                desc: `${key} on ${this.#track.name}`,
            },
        )
        btn.textContent = this.#track[key] ? 'ON' : 'OFF'
        btn.classList.toggle('active', this.#track[key])
        this.#emitTrackChange()
    }

    onLoopSlider(key, value) {
        if (!this.#track) return
        const track = this.#track
        const cmd = this.#serviceRegistry.cmd
        // Continuous control: coalesce the drag into ONE undo step.
        const opts = { desc: `${key} on ${track.name}`, coalesce: true }

        if (key === 'stepsPerBeat') {
            cmd?.setStepsPerBeat(track, value, { coalesce: true })
        } else if (key === 'loopAtStep') {
            // The end step can never pass the track's beat length.
            const maxSteps = (track.beatCount ?? 4) * (track.stepsPerBeat ?? 4)
            cmd?.updateTrack(track, { loopAtStep: Math.min(value, maxSteps) }, opts)
        } else {
            cmd?.updateTrack(track, { [key]: value }, opts)
        }

        // Keep the loop slider's bounds in sync — this path does not call
        // sync(), and the dragged control must survive a mid-drag sync().
        const maxSteps = (track.beatCount ?? 4) * (track.stepsPerBeat ?? 4)
        const loopSlider = this.#controls.get('loopAtStep')
        if (loopSlider) {
            loopSlider.setMax?.(maxSteps)
            if (key !== 'loopAtStep') loopSlider.setValue(track.loopAtStep)
        }

        if (key === 'loopAtStep') {
            this.#playbackEvents.batch(() => {
                this.#playbackEvents.emit(EVENTS.LOOP_POINT_CHANGE, {
                    trackIdx: this.#selectedTrackIdx,
                    loopAtStep: track.loopAtStep,
                })
                this.#emitTrackChange()
            })
        } else if (key === 'stepsPerBeat') {
            // Structure change: the piano roll rebuilds its columns only on
            // PATTERN_META_CHANGE — its TRACK_PARAM_CHANGE handler merely
            // re-renders notes (piano_roll_panel.js) — so emit both. (The
            // pattern grid catches the change on TRACK_PARAM_CHANGE itself,
            // via its structureSig check.)
            this.#playbackEvents.batch(() => {
                this.#playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
                this.#emitTrackChange()
            })
        } else {
            this.#emitTrackChange()
        }
    }

    #emitTrackChange() {
        this.#playbackEvents.batch(() => {
            this.#playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, this.#track)
            this.#playbackEvents.emit(EVENTS.PATTERN_CHANGE, [this.#track])
        })
    }

    // ── Hide ───────────────────────────────────────────────────────

    /**
     * Closes the editor: hides it AND throws the edit session away, including any
     * uncommitted synth draft (`synthEditor.reset()`), so the panel comes back
     * empty on the next `show({ track, trackIdx })`. Hiding without losing that
     * would be a different operation — do not merge the two.
     */
    hide() {
        if (!this.isVisible) return
        if (this.container) removeLayout(this.container)
        super.hide()
        this.synthEditor.reset()
        setPatternPanelHidden(false)
        this.container?.classList.remove('pp-split')

        this.#track = null
        this.#selectedTrackIdx = -1
        this.#selectedPropKey = null
        this.#lastTick = -1
        if (this.#lfoBridge) {
            this.#lfoBridge.destroy()
            this.#lfoBridge = null
        }
        if (this.#noteEditor) this.#noteEditor.hide()
        setViewBtn('edit', false)
    }
}
