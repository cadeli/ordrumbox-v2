// src/ui/track_editor.js — Coordinator
//
// Thin coordinator that delegates tab rendering to section modules and the
// chrome to its own sub-modules (sample bar, knob bar, LFO step watch,
// event delegation). The DOM skeleton is built once in createDOM(); sync()
// only updates values in place — no innerHTML wipe, no listener re-binding,
// and #ne-container (which hosts the inline note editor) has a fixed place
// in the DOM. Dependencies are injected via the constructor (DI) with
// fallback to module-level singletons.

import { appState } from '../state/app_state.js'
import { playbackEvents, emitTrackChanged } from '../state/event_bus.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { getNoteAbsoluteStep } from '../core/notes.js'

import SynthEditor from './synth_editor.js'
import { OrTab } from './components/or_tab.js'
import { setViewBtn, setPatternPanelHidden } from './components/ui_utils.js'
import BasePanel from './base_panel.js'
import { isMobileViewport } from '../core/constants.js'
import { isMobileLandscape, applyLayout, removeLayout } from './mobile_track_layout.js'

// ── Section imports ───────────────────────────────────────────────────
import GenerationSection from './track_editor/generation_section.js'
import FxSection from './track_editor/fx_section.js'
import SoundSection from './track_editor/sound_section.js'
import ModulationSection from './track_editor/modulation_section.js'
import LoopSection from './track_editor/loop_section.js'

// ── Chrome sub-module imports ─────────────────────────────────────────
import SampleBar from './track_editor/sample_bar.js'
import KnobBar from './track_editor/knob_bar.js'
import LfoStepWatch from './track_editor/lfo_step_watch.js'
import EditorEvents from './track_editor/editor_events.js'

// ── Constants ────────────────────────────────────────────────────────
import { FX_DEFS, TAB_DEFS } from './track_editor/track_editor_constants.js'
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
    #selectedLfoTarget
    #prevFilterType
    #controls
    #noteEditor
    #neContainer

    // ── Sub-components ────────────────────────────────────────────
    #tab
    #fxTab
    #genSection
    #fxSection
    #sndSection
    #modSection
    #loopSection
    #sampleBar
    #knobBar
    #lfoWatch
    #events

    // ── Cached DOM refs (built once by createDOM) ────────────────
    #teRoot
    #headerTrackEl
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
        this.#selectedLfoTarget = null
        this.#prevFilterType = undefined
        this.#controls = new Map()
        this.#noteEditor = null

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

        // ── Chrome ───────────────────────────────────────────────────
        this.#sampleBar = new SampleBar(this)
        this.#knobBar = new KnobBar(this, {
            onDecayChange: () => this.#sampleBar.draw(this.#track),
        })
        this.#lfoWatch = new LfoStepWatch(this)
        this.#events = new EditorEvents(this, {
            fxSection: this.#fxSection,
            modSection: this.#modSection,
            sndSection: this.#sndSection,
            genSection: this.#genSection,
            sampleBar: this.#sampleBar,
        })
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
    /** @param {any} v */
    set selectedPropKey(v) {
        this.#selectedPropKey = v
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

    get knobBar() {
        return this.#knobBar
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
     * Generation sliders win over FX knobs for the shared FX keys; the knob
     * bar (velocity / pan / pitch / decay) is the last fallback.
     * @param {any} key
     * @returns {import('./components/or_slider.js').OrSlider|import('./components/or_knob.js').OrKnob|null}
     */
    getControl(key) {
        return this.#controls.get(key) ?? this.#knobBar?.getKnob(key) ?? null
    }

    /** Emit TRACK_PARAM_CHANGE for the current track. */
    emitTrackChange() {
        emitTrackChanged(this.#track, this.#playbackEvents)
    }

    // ── Lifecycle ──────────────────────────────────────────────────

    /** @param {any} editor */
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
        this.#neContainer = this.container.querySelector('#ne-container')
        this.#tab.bindTo(this.#teRoot)
        this.#sampleBar.mount(this.container)
        this.#knobBar.mount(this.container)
        this.#mountSections()
        this.#events.bind()
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

    /** @param {any} track @param {number} trackIdx */
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
        this.sub(this.#playbackEvents, EVENTS.PLAYBACK_START, () => this.#lfoWatch.start())
        this.sub(this.#playbackEvents, EVENTS.PLAYBACK_STOP, () => this.#lfoWatch.stop())
        this.sub(this.#playbackEvents, EVENTS.DRUMKIT_CHANGE, () => {
            if (this.#track) this.sync()
        })
        this.sub(this.#playbackEvents, EVENTS.PATTERN_CHANGE, () => {
            if (this.#events.isGestureActive) return
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
        this.#lfoWatch.stop()
        this.#sampleBar.destroy()
        this.#genSection.destroy?.()
        this.#fxSection.destroy?.()
        this.#loopSection.destroy?.()
        this.#modSection.destroy?.()
        this.#knobBar.destroy()
        this.synthEditor?.destroy?.()
        // Sections are gone: a stale caller (an old ViewManager still bound
        // to the bus) must not reach them — sync() no-ops until createDOM().
        this.#domReady = false
    }

    // ── Show / Sync / Hide ─────────────────────────────────────────

    show({ track, trackIdx }) {
        this.#track = track
        this.#selectedTrackIdx = trackIdx
        this.#applyContainerDisplay()
        this.sync()
        void this.synthEditor.ensureGeneratedSoundsLoaded()
        if (this.#serviceRegistry.transport?.isRunning) this.#lfoWatch.start()
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
        this.#sampleBar.sync(this.#track)

        // 3. Knob bar
        this.#knobBar.sync(this.#track)

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
            this.#applyContainerDisplay()
        }

        // 7. Waveform
        this.#sampleBar.draw(this.#track)

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

    /**
     * Panel display mode. The landscape grid lives in the stylesheet, so the
     * inline style has to step aside there — an inline 'flex' beats every
     * grid rule and collapses the 3 columns back into one clipped column.
     */
    #applyContainerDisplay() {
        if (isMobileLandscape()) {
            this.container.style.display = ''
            return
        }
        this.container.style.display = isMobileViewport() ? 'flex' : 'block'
    }

    /** Apply mobile-specific layout if on a mobile viewport. */
    #syncMobileLayout() {
        if (isMobileLandscape()) {
            applyLayout(this.container)
            if (this.#track) this.showNoteEditorForTrack(this.#track, this.#selectedTrackIdx)
        } else {
            removeLayout(this.container)
        }
        this.#applyContainerDisplay()
    }

    /** @param {any} key @param {any} value */
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
                this.emitTrackChange()
            })
        } else if (key === 'stepsPerBeat') {
            // Structure change: the piano roll rebuilds its columns only on
            // PATTERN_META_CHANGE — its TRACK_PARAM_CHANGE handler merely
            // re-renders notes (piano_roll_panel.js) — so emit both. (The
            // pattern grid catches the change on TRACK_PARAM_CHANGE itself,
            // via its structureSig check.)
            this.#playbackEvents.batch(() => {
                this.#playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
                this.emitTrackChange()
            })
        } else {
            this.emitTrackChange()
        }
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
        this.#lfoWatch.stop()
        if (this.#noteEditor) this.#noteEditor.hide()
        setViewBtn('edit', false)
    }
}
