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
 * Slot panels (tools, dm, pp, about, output) are mutually exclusive —
 * showing one hides all others and replaces the output panel in the same DOM slot.
 */
export default class ViewManager {
    constructor({ trackEditor, synthEditor, pianoRollPanel, noteEditor, toolsPanel, patternSettingsPanel, outputPanel, drumkitManager, patternsPanel, aboutPanel }) {
        this._trackEditor = trackEditor
        this._synthEditor = synthEditor
        this._pianoRollPanel = pianoRollPanel
        this._noteEditor = noteEditor
        this._patternSettingsPanel = patternSettingsPanel
        this._outputPanel = outputPanel
        this._currentView = null

        // ── Slot panel registry: short name → { event, panel } ─────────────
        this._slots = new Map([
            ['tools', { event: 'toolsToggle',           panel: toolsPanel }],
            ['master',{ event: 'masterToggle',          panel: outputPanel }],
            ['dm',    { event: 'drumkitManagerToggle',  panel: drumkitManager }],
            ['pp',    { event: 'patternsToggle',         panel: patternsPanel }],
            ['about', { event: 'aboutToggle',            panel: aboutPanel }],
            ['output',{ event: 'outputToggle',           panel: outputPanel }],
        ])
        // Reverse lookup: event name → short name
        this._eventToSlot = new Map(
            [...this._slots].map(([name, { event }]) => [event, name])
        )

        // ── View registry: view name → { enter, exit } ──────────────────
        // `exit` runs cleanup for the view being left (only views that need
        // teardown define one); `enter` renders the view being switched to.
        this._viewHandlers = new Map([
            ['synth',       { enter: () => this._showSynth(),      exit: () => this._synthEditor?.hidePanel() }],
            ['edit',        { enter: () => this._showEdit() }],
            ['proll',       { enter: () => this._showProll(),      exit: () => this._pianoRollPanel?.hide() }],
            ['mobileSeq',   { enter: () => this._showMobileSeq(),  exit: () => this._exitMobileSeq() }],
            ['mobileTrack', { enter: () => this._showMobileTrack(),exit: () => this._exitMobileTrack() }],
        ])
    }

    init() {
        // View switches (synth, edit, proll, mobile)
        playbackEvents.on("synthToggle", () => this._switchTo('synth'))
        playbackEvents.on("editToggle", () => this._switchTo('edit'))
        playbackEvents.on("prollToggle", () => this._switchTo('proll'))
        playbackEvents.on("mobileSeqToggle", () => this._switchTo('mobileSeq'))
        playbackEvents.on("mobileTrackToggle", () => this._switchTo('mobileTrack'))

        // Slot panels — one listener per event, all routed through _toggleSlotPanel
        for (const [name, { event, panel }] of this._slots) {
            playbackEvents.on(event, (show) => this._toggleSlotPanel(show, name, panel))
        }
    }

    get currentView() {
        return this._currentView
    }

    // ── Slot panel logic ──────────────────────────────────────────────────

    _toggleSlotPanel(show, name, panel) {
        if (!panel) return
        if (show) {
            this._hideOtherSlotPanels(name)
            _setActiveSlotPanel(name)
            if (isMobileViewport()) {
                this._currentView = name
                _setActiveView(name)
                this._synthEditor.hidePanel()
                this._trackEditor.hide()
                setPatternPanelHidden(true)
            } else {
                this._ensureEditorsVisible()
                if (this._outputPanel?.isVisible && name !== 'output') this._outputPanel.hide()
            }
            panel.show()
        } else {
            panel.hide()
            _setActiveSlotPanel(null)
            if (isMobileViewport() && this._currentView === name) {
                this._currentView = 'mobileSeq'
                _setActiveView('mobileSeq')
            }
            if (name !== 'output') this._outputPanel?.show()
        }
    }

    _hideOtherSlotPanels(exceptName) {
        for (const [name, { panel }] of this._slots) {
            if (name !== exceptName && panel?.isVisible) panel.hide()
        }
    }

    // ── View switching ────────────────────────────────────────────────────

    _switchTo(view) {
        if (view === this._currentView) return
        const prev = this._currentView
        this._currentView = view
        _setActiveView(view)
        serviceRegistry.resourcesLoader?.saveSession?.()

        this._patternSettingsPanel?.hide?.()

        this._viewHandlers.get(prev)?.exit?.()
        if (isMobileViewport() && this._slots.has(prev)) {
            this._hideOtherSlotPanels(null)
        }

        this._viewHandlers.get(view)?.enter?.()

        setViewMode(view)
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    _ensureTrackEditorVisible() {
        if (!this._trackEditor.isVisible) {
            const pattern = appState.patterns[appState.selectedPatternNum]
            const idx = appState.selectedTrackNum
            const track = pattern?.tracks?.[idx]
            if (track) {
                this._trackEditor._track = track
                this._trackEditor._trackIdx = idx
                this._trackEditor.sync()
            }
        }
        this._trackEditor.container?.style.setProperty('display', 'block')
        this._trackEditor.container?.classList.add('pp-split')
    }

    _ensureNoteEditorVisible() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        const idx = appState.selectedTrackNum
        const track = pattern?.tracks?.[idx]
        if (track && this._trackEditor.isVisible) {
            this._trackEditor._showNoteEditorForTrack(track, idx)
        }
    }

    /** Ensures both the track editor and its note editor are visible/synced. */
    _ensureEditorsVisible() {
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
    }

    // ── Per-view exit handlers (cleanup when leaving a view) ────────────────

    _exitMobileSeq() {
        this._pianoRollPanel?.hide()
        setPatternPanelHidden(false)
    }

    _exitMobileTrack() {
        this._noteEditor?.hide()
        removeLayout(this._trackEditor.container)
    }

    // ── Per-view enter handlers (render the view being switched to) ─────────

    _showSynth() {
        if (isMobileViewport()) {
            this._trackEditor.hide()
        } else {
            this._ensureEditorsVisible()
        }
        setPatternPanelHidden(true)
        void this._synthEditor.showPanel()
    }

    _showEdit() {
        this._synthEditor.hidePanel()
        this._pianoRollPanel.hide()
        setPatternPanelHidden(false)
        this._ensureEditorsVisible()
    }

    _showProll() {
        this._synthEditor.hidePanel()
        this._ensureEditorsVisible()
        this._pianoRollPanel.show()
        setPatternPanelHidden(true)
    }

    _showMobileSeq() {
        this._synthEditor.hidePanel()
        if (isMobileLandscape()) {
            this._trackEditor.hide()
        } else {
            this._ensureEditorsVisible()
        }
        setPatternPanelHidden(false)
    }

    _showMobileTrack() {
        this._synthEditor.hidePanel()
        this._pianoRollPanel.hide()
        this._ensureEditorsVisible()
        setPatternPanelHidden(true)
    }
}