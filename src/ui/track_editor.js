// src/ui/track_editor.js — Coordinator
//
// Thin coordinator that delegates tab rendering to section modules.
// Dependencies are injected via the constructor (DI) with fallback to
// module-level singletons.

import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { showToast } from '../core/notify.js'
import Utils from '../core/utils.js'

import SynthEditor from './synth_editor.js'
import { OrTab } from './components/or_tab.js'
import { syncKnobs } from './components/sync_helpers.js'
import { fmt, setViewBtn, knobFormat, setPatternPanelHidden } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'
import { TICK, isMobileViewport } from '../core/constants.js'
import { isMobileLandscape, applyLayout, removeLayout } from './mobile_track_layout.js'
import LfoUiBridge from '../logic/lfo_ui_bridge.js'
import { sampleWaveformTheme } from './theme.js'
import { analyzeSample, clearAnalysisCache, drawEnvelope } from '../audio/sample_analyzer.js'
import { logger } from '../core/logger.js'

// ── Section imports ───────────────────────────────────────────────────
import GenerationSection from './track_editor/generation_section.js'
import FxSection from './track_editor/fx_section.js'
import SoundSection from './track_editor/sound_section.js'
import ModulationSection from './track_editor/modulation_section.js'
import LoopSection from './track_editor/loop_section.js'

// ── Constants ────────────────────────────────────────────────────────
import { FX_DEFS, TAB_DEFS, ALL_TRACK_PROPS, KNOB_PROPS } from './track_editor/constants.js'
import { EVENTS } from '../core/events.js'

export default class TrackEditor extends BasePanel {
    #rafId
    #lastTick
    #isSelecting
    #lfoBridge
    #delegationBound
    #noteEditor
    #waveObserver
    #waveObservedCanvas
    #genSection
    #fxSection
    #modSection

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
        this.#rafId = null
        this.#lastTick = -1
        this._isDragging = false
        this.#isSelecting = false
        this._sliders = new Map()
        this.#lfoBridge = null
        this._selectedLfoTarget = null
        this.#delegationBound = false
        this._prevFilterType = undefined
        this._knobs = []
        this._fxKnobs = []
        this.#noteEditor = null
        this.#waveObserver = null
        this.#waveObservedCanvas = null

        // ── Sub-components ───────────────────────────────────────────
        this.synthEditor = new SynthEditor(this)
        this._tab = new OrTab({
            tabs: TAB_DEFS,
            defaultTab: 'fx',
            onChange: () => this.sync(),
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
        this.#genSection = new GenerationSection(this)
        this.#fxSection = new FxSection(this)
        this._sndSection = new SoundSection(this)
        this.#modSection = new ModulationSection(this)
        this._loopSection = new LoopSection(this)
    }

    // ── Lifecycle ──────────────────────────────────────────────────

    setNoteEditor(editor) {
        this.#noteEditor = editor
    }

    createDOM() {
        super.createDOM()
        this._neContainer = document.createElement('div')
        this._neContainer.id = 'ne-container'
        this._neContainer.style.display = 'none'
        this.container.appendChild(this._neContainer)
        this.synthEditor.createDOM()
    }

    _showNoteEditorForTrack(track, trackIdx) {
        if (!this.#noteEditor) return
        this.#noteEditor.container.style.display = 'block'
        const firstNote = track.notes?.[0]
        if (firstNote) {
            const stepsPerBeat = track.stepsPerBeat ?? 4
            const pos = Utils.getNoteAbsoluteStep(firstNote, stepsPerBeat)
            this.#noteEditor.showInline({
                track,
                trackIdx,
                note: firstNote,
                pos,
                beat: firstNote.beat ?? 0,
                beatStep: firstNote.beatStep ?? 0,
            })
        } else {
            this.#noteEditor.showEmptyInline({ track, trackIdx })
        }
    }

    subscribe() {
        this._playbackEvents.on(EVENTS.ORIENTATION_CHANGE, () => {
            if (this.container) this.#syncMobileLayout()
        })
        this._playbackEvents.on(EVENTS.TRACK_SELECT, (data) => {
            if (!data) return
            if (this.isVisible) {
                this._track = data.track
                this._trackIdx = data.trackIdx
                this.sync()
                this._showNoteEditorForTrack(data.track, data.trackIdx)
            }
        })
        this._playbackEvents.on(EVENTS.PLAYBACK_START, () => this.#startStepWatch())
        this._playbackEvents.on(EVENTS.PLAYBACK_STOP, () => this.#stopStepWatch())
        this._playbackEvents.on(EVENTS.DRUMKIT_CHANGE, () => {
            if (this._track) this.sync()
        })
        this._playbackEvents.on(EVENTS.PATTERN_CHANGE, () => {
            if (this._isDragging || this.#isSelecting) return
            if (!this._track) return
            const pattern = this._appState.patterns[this._appState.selectedPatternNum]
            if (!pattern?.tracks) return
            const currentTrack = this._track
            let newIdx = pattern.tracks.findIndex((t) => t === currentTrack)
            if (newIdx === -1) newIdx = pattern.tracks.findIndex((t) => t?.name === currentTrack.name)
            if (newIdx === -1) {
                this._track = null
                this._trackIdx = -1
                if (this.isVisible) this.sync()
                return
            }
            this._track = pattern.tracks[newIdx]
            this._trackIdx = newIdx
            if (this.isVisible) this.sync()
        })
    }

    // ── Step watch (LFO animation) ─────────────────────────────────

    #startStepWatch() {
        if (this.#rafId) return
        this.#lastTick = -1
        const tick = () => {
            const transport = this._serviceRegistry.transport
            if (!transport?.isRunning) {
                this.#rafId = null
                return
            }
            this.#rafId = requestAnimationFrame(tick)
            const currentTick = transport.tick
            if (currentTick !== this.#lastTick) {
                this.#lastTick = currentTick
                this._updateLfoSliders()
            }
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
        if (!this._track) return null
        const pattern = this._appState.patterns[this._appState.selectedPatternNum]
        if (!pattern) return null
        const nbTicks = TICK * pattern.nbBeats
        if (!this.#lfoBridge) this.#lfoBridge = new LfoUiBridge(this._serviceRegistry.audioCtx)
        return this.#lfoBridge.compute(this._track, tick, nbTicks)
    }

    #applyLfoValues(lfoValues) {
        if (!lfoValues || !this._track) return
        ALL_TRACK_PROPS.forEach((p) => {
            if (!p.lfo || !this._track[p.lfo]) return
            const ctrl = this._sliders.get(p.key) ?? this._fxKnobs.find((kn) => kn.key === p.key)
            if (!ctrl) return
            const raw = lfoValues[p.key] ?? 0
            ctrl.setValue(p.denormalize ? p.denormalize(raw) : raw)
        })
        KNOB_PROPS.forEach((p) => {
            if (p.lfo && this._track[p.lfo]) {
                const knob = this._knobs.find((k) => k.key === p.key)
                if (knob) knob.setValue(lfoValues[p.key] ?? 0)
            }
        })
    }

    async _updateLfoSliders() {
        if (!this._track || !this.isVisible) return
        const transport = this._serviceRegistry.transport
        if (!transport) return
        const tick = transport.tick
        const result = this.#lfoValuesForTick(tick)
        if (!result) return
        const values = result instanceof Promise ? await result : result
        if (values && transport.tick === tick) this.#applyLfoValues(values)
    }

    // ── Show / Sync / Hide ─────────────────────────────────────────

    show({ track, trackIdx }) {
        this._track = track
        this._trackIdx = trackIdx
        this.container.style.display = isMobileViewport() ? 'flex' : 'block'
        this.sync()
        void this.synthEditor.ensureGeneratedSoundsLoaded()
        if (this._serviceRegistry.transport?.isRunning) this.#startStepWatch()
        setViewBtn('edit', true)
    }

    sync() {
        if (!this._track) return

        const soundInfo = this._sndSection._getSoundInfo()

        const headerHtml = `<div class="ne-header">
            <span class="ne-track">Track: ${this.esc(this._track.name)}${soundInfo ? ' - ' + this.esc(soundInfo) : ''}</span>
        </div>`

        const sampleBarHtml = this.#renderSampleBar()
        const knobBarHtml = this.#renderKnobBar()

        // ── Snapshot existing instances for reuse ──────────────────
        const prevSliders = new Map(this._sliders)
        this._sliders.clear()
        const prevFxKnobs = new Map(this._fxKnobs.map((k) => [k.key, k]))
        this._fxKnobs = []

        const tabBarHtml = this._tab.renderBar()

        let panelsHtml = ''

        const TAB_PANEL_MAP = {
            gen: () => this.#genSection.render(),
            fx: () => this.#fxSection.render(),
            snd: () => this._sndSection.render(),
            mod: () => this.#modSection.render(),
            loop: () => this._loopSection.render(),
        }

        for (const tab of TAB_DEFS) {
            const isHidden = this._tab.isHidden(tab.id)
            const panelFn = TAB_PANEL_MAP[tab.id]
            const content = panelFn ? panelFn() : ''
            panelsHtml += `<div class="ne-tab-panel ${isHidden ? 'ne-tab-panel-hidden' : ''}" data-tab-panel="${tab.id}">${content}</div>`
        }

        // Detach ne-container before innerHTML wipe (it lives in #te-panel,
        // not inside .track-editor, but innerHTML on #te-panel would destroy it)
        const neC = this.#preserveNeContainer()

        this.container.innerHTML = `<div class="track-editor">${headerHtml + sampleBarHtml + knobBarHtml + tabBarHtml + `<div class="te-scroll">${panelsHtml}</div>`}</div>`

        this.#restoreNeContainer(neC)
        const teElement = this.container.querySelector('.track-editor') ?? this.container
        this._tab.bindTo(teElement)

        // Mount main sliders
        this._sliders.forEach((s) => {
            const row = this.container.querySelector(`.ne-row[data-or-slider="${s.key}"]`)
            if (row) {
                s.mount(row)
                const input = row.querySelector('input')
                if (input) {
                    input.addEventListener('change', () => {
                        this._isDragging = false
                        this.#isSelecting = false
                        this.#emitTrackChange()
                    })
                }
            }
        })

        // Mount FX knobs
        this._fxKnobs.forEach((k) => {
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
            if (!this._fxKnobs.some((k) => k.key === key)) knob.destroy()
        }

        if (this.synthEditor?.panel?.style?.display !== 'block') {
            this.container.style.display = isMobileViewport() ? 'flex' : 'block'
        }
        this.#bindEvents()
        this._drawSampleWaveform()

        this.#syncMobileLayout()
    }

    /** Detach ne-container from DOM so innerHTML wipe doesn't destroy it. */
    #preserveNeContainer() {
        const neC = this._neContainer
        if (neC?.parentNode) neC.parentNode.removeChild(neC)
        return neC
    }

    /** Re-attach previously preserved ne-container after innerHTML wipe. */
    #restoreNeContainer(neC) {
        if (neC) this.container.appendChild(neC)
    }

    /** Apply mobile-specific layout if on a mobile viewport. */
    #syncMobileLayout() {
        if (isMobileLandscape()) {
            applyLayout(this.container)
            if (this._track) this._showNoteEditorForTrack(this._track, this._trackIdx)
        } else {
            removeLayout(this.container)
        }
    }

    /** Sync knob bar: reuse OrKnob instances, create new ones, destroy orphans. */
    _syncKnobs() {
        this._knobs = [
            ...syncKnobs({
                container: this.container,
                configs: KNOB_PROPS.map((def) => {
                    const isDecay = def.key === 'decay'
                    const sound = isDecay ? this._soundRegistry.sounds[this._track?.soundId] : null
                    return {
                        key: def.key,
                        label: def.label,
                        val: isDecay ? (sound?.decay ?? 0) : (this._track[def.key] ?? def.min),
                        min: def.min,
                        max: def.max,
                        step: def.step,
                        scale: def.scale,
                        format: knobFormat(def),
                        // decay's formatter already appends "ms" — a unit here
                        // would render the value as "5000 ms ms".
                        unit: def.key === 'velocity' ? '%' : def.key === 'pitch' ? 'st' : '',
                        onChange: (v) => {
                            if (isDecay) {
                                if (sound) sound.decay = v
                            } else {
                                // Continuous knob: coalesce the drag into ONE undo step.
                                this._serviceRegistry.cmd?.updateTrack(
                                    this._track,
                                    { [def.key]: v },
                                    { desc: `${def.label} on ${this._track.name}`, coalesce: true },
                                )
                            }
                            this.#emitTrackChange()
                            if (isDecay) this._drawSampleWaveform()
                        },
                    }
                }),
                prev: new Map(this._knobs.map((k) => [k.key, k])),
            }).values(),
        ]
    }

    // ── Sample bar ─────────────────────────────────────────────────

    #renderSampleBar() {
        const track = this._track
        if (track.useSoftSynth) return ''
        const soundId = track.soundId ?? ''
        const sound = this._soundRegistry.sounds[soundId]
        if (!sound?.buffer) return ''
        const analysis = analyzeSample(sound.buffer)
        const pitchStr = analysis?.noteInfo ? `${analysis.noteInfo.note}${analysis.noteInfo.octave}` : '—'
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

    #renderKnobBar() {
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

        const ctx = canvas.getContext('2d')
        const theme = sampleWaveformTheme(2 * dpr)
        drawEnvelope(ctx, analysis.envelope, w, h, theme)

        const totalSec = sound.buffer.duration
        if (totalSec > 0) {
            const ratio = Math.min((sound.decay ?? 0) / 1000 / totalSec, 1)
            const x = ratio * w
            ctx.beginPath()
            ctx.setLineDash([4 * dpr, 4 * dpr])
            ctx.strokeStyle = theme.marker
            ctx.shadowColor = theme.marker
            ctx.shadowBlur = 6 * dpr
            ctx.lineWidth = theme.lineWidth
            ctx.moveTo(x, 0)
            ctx.lineTo(x, h)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.shadowBlur = 0
            ctx.shadowColor = 'transparent'
        }
    }

    /** Redraw the waveform when its CSS box changes (window / panel resize). */
    #observeWaveformCanvas(canvas) {
        if (typeof ResizeObserver !== 'function' || this.#waveObservedCanvas === canvas) return
        this.#waveObserver?.disconnect()
        this.#waveObservedCanvas = canvas
        this.#waveObserver = new ResizeObserver(() => this._drawSampleWaveform())
        this.#waveObserver.observe(canvas)
    }

    #onLoadSample() {
        const input = this.container?.querySelector('.te-load-input')
        if (input) input.click()
    }

    async #onSampleFileSelected(e) {
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
                    url: soundId,
                    key: soundId,
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
        e.target.value = ''
    }

    #toggleFxByKey(key) {
        const updates = this.#fxSection.toggleFxByKey(key)
        if (updates) {
            this._serviceRegistry.cmd?.updateTrack(this._track, updates, {
                desc: `Toggle ${key} on ${this._track.name}`,
            })
        }
        this.sync()
        this.#emitTrackChange()
    }

    #onFxIcon(target) {
        const updates = this.#fxSection.onFxIcon(target)
        if (updates) {
            this._serviceRegistry.cmd?.updateTrack(this._track, updates, {
                desc: `Filter type on ${this._track.name}`,
            })
        }
        this.sync()
        this.#emitTrackChange()
    }

    #onFxTab(btn) {
        this.#fxSection.onFxTab(btn)
    }

    #onGenTab(genTabId) {
        if (!genTabId) return
        this.#genSection._genSubTab.setActive(genTabId)
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
            this._serviceRegistry.cmd?.updateTrack(this._track, res.updates, {
                desc: `LFO ${k} on ${this._track.name}`,
            })
        }
        this.sync()
        this.#emitTrackChange()
    }

    #onLfoSlider(input) {
        const res = this.#modSection.onSlider(input)
        if (res) {
            this._serviceRegistry.cmd?.updateTrack(this._track, res.updates, {
                desc: `LFO ${input.dataset.lfoKey} on ${this._track.name}`,
                coalesce: true,
            })
        }
        if (res?.created) this.sync()
        this.#emitTrackChange()
    }

    #onLfoSelect(sel) {
        const res = this.#modSection.onSelect(sel)
        if (res) {
            this._serviceRegistry.cmd?.updateTrack(this._track, res.updates, {
                desc: `LFO type on ${this._track.name}`,
            })
        }
        this.#emitTrackChange()
    }

    _toggleLfoForTarget(k) {
        const res = this.#modSection._toggleLfoForTarget(k)
        if (res) {
            this._serviceRegistry.cmd?.updateTrack(this._track, res.updates, {
                desc: `LFO ${k} on ${this._track.name}`,
            })
        }
        this.sync()
        this.#emitTrackChange()
    }

    // ── Event delegation ───────────────────────────────────────────

    #bindEvents() {
        if (this.#delegationBound) return

        // LFO sliders are plain <input> elements (not OrSlider instances)
        // and require delegated input handling.
        this.container.addEventListener('input', (e) => {
            const target = e.target
            if (target.dataset.lfoKey) {
                this.#onLfoSlider(target)
            }
        })

        this.container.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'SELECT') this.#isSelecting = true
        })
        this.container.addEventListener('focusout', (e) => {
            if (e.target.tagName === 'SELECT') this.#isSelecting = false
        })

        this.container.addEventListener('change', (e) => {
            const target = e.target
            // the nested note editor owns its own selects (arpScale, arpType…)
            if (target.closest('#ne-container')) return
            if (target.classList.contains('te-load-input')) {
                this.#onSampleFileSelected(e)
                return
            }
            if (target.tagName === 'SELECT') {
                if (target.dataset.key) this.#onSelect(target)
                else if (target.dataset.lfoTypeSelect) this.#onLfoSelect(target)
                else if (target.dataset.sound) {
                    const soundType = target.dataset.sound
                    const p =
                        soundType === 'instrument'
                            ? this._sndSection.onInstrumentChange(target)
                            : soundType === 'sample'
                              ? this._sndSection.onSampleChange(target)
                              : soundType === 'generated'
                                ? this._sndSection.onGeneratedChange(target)
                                : null
                    if (p)
                        p.finally(() => {
                            this.#isSelecting = false
                        })
                }
            }
        })

        this.container.addEventListener('click', (e) => {
            const target = e.target
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
                this.#onFxTab({ dataset: { fxTab: target.dataset.fxTab } })
                return
            }
            if (target.dataset.genTab) {
                this.#onGenTab(target.dataset.genTab)
                return
            }
            {
                const genTabEl = target.closest?.('[data-gen-tab]')
                if (genTabEl) {
                    this.#onGenTab(genTabEl.dataset.genTab)
                    return
                }
            }
            if (target.dataset.fxIconVal) {
                this.#onFxIcon(target)
                return
            }

            const btn = target.closest('button')
            if (!btn) {
                const row = target.closest('.ne-row[data-prop]')
                if (row && target.tagName !== 'INPUT' && target.tagName !== 'SELECT') {
                    this.#onRowClick(row.dataset.prop)
                }
                return
            }

            if (btn.dataset.key) this.#onToggle(btn)
            else if (btn.dataset.action === 'toggle-auto') this._sndSection.toggleAuto()
            else if (btn.dataset.action === 'load-sample') this.#onLoadSample()
        })

        this.#delegationBound = true
    }

    #onRowClick(propKey) {
        this._selectedPropKey = propKey
        this.sync()
    }

    #onSelect(sel) {
        if (!this._track) return
        const key = sel.dataset.key
        let val = sel.value
        if (key === 'delayTime') val = parseFloat(val)
        this._serviceRegistry.cmd?.updateTrack(
            this._track,
            { [key]: val },
            {
                desc: `${key} on ${this._track.name}`,
            },
        )
        this.#emitTrackChange()
    }

    #onToggle(btn) {
        if (!this._track) return
        const key = btn.dataset.key
        this._serviceRegistry.cmd?.updateTrack(
            this._track,
            { [key]: !this._track[key] },
            {
                desc: `${key} on ${this._track.name}`,
            },
        )
        btn.textContent = this._track[key] ? 'ON' : 'OFF'
        btn.classList.toggle('active', this._track[key])
        this.#emitTrackChange()
    }

    _onLoopSlider(input) {
        if (!this._track) return
        this._isDragging = true
        const key = input.dataset.loop
        const val = key === 'swingAmount' ? parseFloat(input.value) : parseInt(input.value)
        const cmd = this._serviceRegistry.cmd
        // Continuous control: coalesce the drag into ONE undo step.
        const opts = { desc: `${key} on ${this._track.name}`, coalesce: true }

        if (key === 'stepsPerBeat') {
            cmd?.setStepsPerBeat(this._track, val, { coalesce: true })
        } else if (key === 'loopAtStep') {
            // The end step can never pass the bar length.
            const maxSteps = (this._track.nbBeats ?? 4) * (this._track.stepsPerBeat ?? 4)
            cmd?.updateTrack(this._track, { loopAtStep: Math.min(val, maxSteps) }, opts)
        } else {
            cmd?.updateTrack(this._track, { [key]: val }, opts)
        }

        if (input.nextElementSibling) {
            input.nextElementSibling.textContent = key === 'swingAmount' ? fmt(val) : val
        }

        const maxSteps = (this._track.nbBeats ?? 4) * (this._track.stepsPerBeat ?? 4)
        const loopSlider = this._sliders.get('loopAtStep')
        if (loopSlider) {
            loopSlider.setMax?.(maxSteps)
            if (key !== 'loopAtStep') loopSlider.setValue(this._track.loopAtStep)
        }

        if (key === 'loopAtStep') {
            this._playbackEvents.batch(() => {
                this._playbackEvents.emit(EVENTS.LOOP_POINT_CHANGE, {
                    trackIdx: this._trackIdx,
                    loopAtStep: this._track.loopAtStep,
                })
                this.#emitTrackChange()
            })
        } else if (key === 'stepsPerBeat') {
            // Structure change: grid cell count per beat and piano-roll columns
            // must rebuild — TRACK_PARAM_CHANGE alone only updates cell content.
            this._playbackEvents.batch(() => {
                this._playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
                this.#emitTrackChange()
            })
        } else {
            this.#emitTrackChange()
        }
    }

    #emitTrackChange() {
        this._playbackEvents.batch(() => {
            this._playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, this._track)
            this._playbackEvents.emit(EVENTS.PATTERN_CHANGE, [this._track])
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
        this.#lastTick = -1
        this._knobs.forEach((k) => k.destroy())
        this._knobs = []
        this._fxKnobs.forEach((k) => k.destroy())
        this._fxKnobs = []
        if (this.#lfoBridge) {
            this.#lfoBridge.destroy()
            this.#lfoBridge = null
        }
        if (this.#noteEditor) this.#noteEditor.hide()
        setViewBtn('edit', false)
    }
}
