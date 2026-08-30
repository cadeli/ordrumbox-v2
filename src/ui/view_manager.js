import { playbackEvents } from '../state/playback_events.js'
import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { _setActiveView, _setActiveSlotPanel } from '../state/signals.js'
import { setViewMode, setPatternPanelHidden } from './components/panel_helpers.js'
import { isMobileViewport } from '../core/constants.js'
import { isMobileLandscape, removeLayout } from './mobile_track_layout.js'

/**
 * ViewManager — single coordinator for synth / edit / proll view switching.
 * Listens to toolbar and tab toggle events and calls panel.show() / panel.hide()
 * without touching another panel's DOM.
 *
 * Slot panels (tools, master, dm, pp, about) are mutually exclusive —
 * showing one hides all others and replaces the master panel in the same DOM slot.
 */
export default class ViewManager {
    #trackEditor
    #synthEditor
    #pianoRollPanel
    #noteEditor
    #patternSettingsPanel
    #outputPanel
    #currentView
    #slots
    #eventToSlot
    #viewHandlers

    constructor({ trackEditor, synthEditor, pianoRollPanel, noteEditor, toolsPanel, patternSettingsPanel, outputPanel, drumkitManager, patternsPanel, aboutPanel }) {
        this.#trackEditor = trackEditor
        this.#synthEditor = synthEditor
        this.#pianoRollPanel = pianoRollPanel
        this.#noteEditor = noteEditor
        this.#patternSettingsPanel = patternSettingsPanel
        this.#outputPanel = outputPanel
        this.#currentView = null

        // ── Slot panel registry: short name → { event, panel } ─────────────
        this.#slots = new Map([
            ['tools', { event: 'toolsToggle',           panel: toolsPanel }],
            ['master',{ event: 'masterToggle',          panel: outputPanel }],
            ['dm',    { event: 'drumkitManagerToggle',  panel: drumkitManager }],
            ['pp',    { event: 'songToggle',            panel: patternsPanel }],
            ['about', { event: 'aboutToggle',            panel: aboutPanel }],
        ])
        // Reverse lookup: event name → short name
        this.#eventToSlot = new Map(
            [...this.#slots].map(([name, { event }]) => [event, name])
        )

        // ── View registry: view name → { enter, exit } ──────────────────
        // `exit` runs cleanup for the view being left (only views that need
        // teardown define one); `enter` renders the view being switched to.
        this.#viewHandlers = new Map([
            ['synth',       { enter: () => this.#showSynth(),      exit: () => this.#synthEditor?.hidePanel() }],
            ['edit',        { enter: () => this.#showEdit() }],
            ['proll',       { enter: () => this.#showProll(),      exit: () => this.#pianoRollPanel?.hide() }],
            ['mobileSeq',   { enter: () => this.#showMobileSeq(),  exit: () => this.#exitMobileSeq() }],
            ['mobileTrack', { enter: () => this.#showMobileTrack(),exit: () => this.#exitMobileTrack() }],
        ])
    }

    init() {
        // View switches (synth, edit, proll, mobile)
        playbackEvents.on("synthToggle", () => this.#switchTo('synth'))
        playbackEvents.on("editToggle", () => this.#switchTo('edit'))
        playbackEvents.on("prollToggle", () => this.#switchTo('proll'))
        playbackEvents.on("mobileSeqToggle", () => this.#switchTo('mobileSeq'))
        playbackEvents.on("mobileTrackToggle", () => this.#switchTo('mobileTrack'))

        // Slot panels — one listener per event, all routed through #toggleSlotPanel
        for (const [name, { event, panel }] of this.#slots) {
            playbackEvents.on(event, (show) => this.#toggleSlotPanel(show, name, panel))
        }
    }

    get currentView() {
        return this.#currentView
    }

    // ── Slot panel logic ──────────────────────────────────────────────────

    #toggleSlotPanel(show, name, panel) {
        if (!panel) return
        if (show) {
            this.#hideOtherSlotPanels(name)
            _setActiveSlotPanel(name)
            if (isMobileViewport()) {
                this.#currentView = name
                _setActiveView(name)
                this.#synthEditor.hidePanel()
                this.#trackEditor.hide()
                setPatternPanelHidden(true)
            } else {
                this.#ensureEditorsVisible()
                if (this.#outputPanel?.isVisible && name !== 'master') this.#outputPanel.hide()
            }
            panel.show()
        } else {
            panel.hide()
            _setActiveSlotPanel(null)
            if (isMobileViewport() && this.#currentView === name) {
                this.#currentView = 'mobileSeq'
                _setActiveView('mobileSeq')
            }
            if (name !== 'master') this.#outputPanel?.show()
        }
    }

    #hideOtherSlotPanels(exceptName) {
        for (const [name, { panel }] of this.#slots) {
            if (name !== exceptName && panel?.isVisible) panel.hide()
        }
    }

    // ── View switching ────────────────────────────────────────────────────

    #switchTo(view) {
        if (view === this.#currentView) return
        const prev = this.#currentView
        this.#currentView = view
        _setActiveView(view)
        serviceRegistry.resourcesLoader?.saveSession?.()

        this.#patternSettingsPanel?.hide?.()

        this.#viewHandlers.get(prev)?.exit?.()
        if (isMobileViewport() && this.#slots.has(prev)) {
            this.#hideOtherSlotPanels(null)
        }

        this.#viewHandlers.get(view)?.enter?.()

        setViewMode(view)
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    #ensureTrackEditorVisible() {
        if (!this.#trackEditor.isVisible) {
            const pattern = appState.patterns[appState.selectedPatternNum]
            const idx = appState.selectedTrackNum
            const track = pattern?.tracks?.[idx]
            if (track) {
                this.#trackEditor._track = track
                this.#trackEditor._trackIdx = idx
                this.#trackEditor.sync()
            }
        }
        this.#trackEditor.container?.style.setProperty('display', 'block')
        this.#trackEditor.container?.classList.add('pp-split')
    }

    #ensureNoteEditorVisible() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        const idx = appState.selectedTrackNum
        const track = pattern?.tracks?.[idx]
        if (track && this.#trackEditor.isVisible) {
            this.#trackEditor._showNoteEditorForTrack(track, idx)
        }
    }

    /** Ensures both the track editor and its note editor are visible/synced. */
    #ensureEditorsVisible() {
        this.#ensureTrackEditorVisible()
        this.#ensureNoteEditorVisible()
    }

    // ── Per-view exit handlers (cleanup when leaving a view) ────────────────

    #exitMobileSeq() {
        this.#pianoRollPanel?.hide()
        setPatternPanelHidden(false)
    }

    #exitMobileTrack() {
        this.#noteEditor?.hide()
        removeLayout(this.#trackEditor.container)
    }

    // ── Per-view enter handlers (render the view being switched to) ─────────

    #showSynth() {
        if (isMobileViewport()) {
            this.#trackEditor.hide()
        } else {
            this.#ensureEditorsVisible()
        }
        setPatternPanelHidden(true)
        void this.#synthEditor.showPanel()
    }

    #showEdit() {
        this.#synthEditor.hidePanel()
        this.#pianoRollPanel.hide()
        setPatternPanelHidden(false)
        this.#ensureEditorsVisible()
    }

    #showProll() {
        this.#synthEditor.hidePanel()
        this.#ensureEditorsVisible()
        this.#pianoRollPanel.show()
        setPatternPanelHidden(true)
    }

    #showMobileSeq() {
        this.#synthEditor.hidePanel()
        if (isMobileLandscape()) {
            this.#trackEditor.hide()
        } else {
            this.#ensureEditorsVisible()
        }
        setPatternPanelHidden(false)
    }

    #showMobileTrack() {
        this.#synthEditor.hidePanel()
        this.#pianoRollPanel.hide()
        this.#ensureEditorsVisible()
        setPatternPanelHidden(true)
    }
}
