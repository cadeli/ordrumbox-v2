import { playbackEvents } from '../state/playback_events.js'
import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { setViewMode } from './components/panel_helpers.js'
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
            ['dm',    { event: 'drumkitManagerToggle',  panel: drumkitManager }],
            ['pp',    { event: 'patternsToggle',         panel: patternsPanel }],
            ['about', { event: 'aboutToggle',            panel: aboutPanel }],
            ['output',{ event: 'outputToggle',           panel: outputPanel }],
        ])
        // Reverse lookup: event name → short name
        this._eventToSlot = new Map(
            [...this._slots].map(([name, { event }]) => [event, name])
        )
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
            if (isMobileViewport()) {
                this._currentView = name
            }
            this._hideOtherSlotPanels(name)
            this._ensureTrackEditorVisible()
            this._ensureNoteEditorVisible()
            panel.show()
            if (this._outputPanel?.isVisible && name !== 'output') this._outputPanel.hide()
        } else {
            panel.hide()
            if (isMobileViewport() && this._currentView === name) {
                this._currentView = 'mobileSeq'
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
        serviceRegistry.resourcesLoader?.saveSession?.()

        if (this._patternSettingsPanel?.hide) {
            this._patternSettingsPanel.hide()
        }

        if (prev === 'proll') this._pianoRollPanel?.hide()
        if (prev === 'mobileSeq') {
            this._pianoRollPanel?.hide()
            document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        }
        if (prev === 'mobileTrack') {
            this._noteEditor?.hide()
            removeLayout(this._trackEditor.container)
        }
        if (isMobileViewport() && this._slots.has(prev)) {
            this._hideOtherSlotPanels(null)
        }

        if (view === 'synth') this._showSynth()
        if (view === 'proll') this._showProll()
        if (view === 'edit') this._showEdit()
        if (view === 'mobileSeq') this._showMobileSeq()
        if (view === 'mobileTrack') this._showMobileTrack()

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

    _showSynth() {
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
        void this._synthEditor.showPanel()
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
    }

    _showEdit() {
        this._synthEditor.hidePanel()
        this._pianoRollPanel.hide()
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
    }

    _showProll() {
        this._synthEditor.hidePanel()
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
        this._pianoRollPanel.show()
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
    }

    _showMobileSeq() {
        this._synthEditor.hidePanel()
        if (isMobileLandscape()) {
            this._trackEditor.hide()
        } else {
            this._ensureTrackEditorVisible()
            this._ensureNoteEditorVisible()
        }
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
    }

    _showMobileTrack() {
        this._synthEditor.hidePanel()
        this._pianoRollPanel.hide()
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
    }
}
