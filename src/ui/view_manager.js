import { playbackEvents } from '../state/playback_events.js'
import { appState } from '../state/app_state.js'
import { setViewMode } from './components/panel_helpers.js'
import { isMobileViewport } from '../core/constants.js'
import { isMobileLandscape, removeLayout } from './mobile_track_layout.js'

/**
 * ViewManager — single coordinator for synth / edit / proll view switching.
 * Listens to toolbar and tab toggle events and calls panel.show() / panel.hide()
 * without touching another panel's DOM.
 *
 * Bottom-left slot panels (tools, dm, pp, about) are not views — they replace
 * the output panel in the same DOM slot without changing the main view.
 */
export default class ViewManager {
    constructor({ trackEditor, synthEditor, pianoRollPanel, noteEditor, toolsPanel, patternSettingsPanel, outputPanel, drumkitManager, patternsPanel }) {
        this._trackEditor = trackEditor
        this._synthEditor = synthEditor
        this._pianoRollPanel = pianoRollPanel
        this._noteEditor = noteEditor
        this._toolsPanel = toolsPanel
        this._patternSettingsPanel = patternSettingsPanel
        this._outputPanel = outputPanel
        this._drumkitManager = drumkitManager
        this._patternsPanel = patternsPanel
        this._currentView = null
    }

    init() {
        playbackEvents.on("synthToggle", () => this._switchTo('synth'))
        playbackEvents.on("editToggle", () => this._switchTo('edit'))
        playbackEvents.on("prollToggle", () => this._switchTo('proll'))
        playbackEvents.on("mobileSeqToggle", () => this._switchTo('mobileSeq'))
        playbackEvents.on("mobileTrackToggle", () => this._switchTo('mobileTrack'))
        playbackEvents.on("toolsToggle", (show) => this._toggleSlotPanel(show, 'tools'))
        playbackEvents.on("drumkitManagerToggle", (show) => this._toggleSlotPanel(show, 'dm'))
        playbackEvents.on("patternsToggle", (show) => this._toggleSlotPanel(show, 'pp'))
    }

    get currentView() {
        return this._currentView
    }

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

    _switchTo(view) {
        if (view === this._currentView) return
        const prev = this._currentView
        this._currentView = view

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
        if (isMobileViewport() && (prev === 'tools' || prev === 'dm' || prev === 'pp')) {
            this._hideOtherSlotPanels(null)
        }

        if (view === 'synth') this._showSynth()
        if (view === 'proll') this._showProll()
        if (view === 'edit') this._showEdit()
        if (view === 'mobileSeq') this._showMobileSeq()
        if (view === 'mobileTrack') this._showMobileTrack()

        setViewMode(view)
    }

    _toggleSlotPanel(show, kind) {
        const panel = kind === 'tools' ? this._toolsPanel
            : kind === 'dm' ? this._drumkitManager
            : kind === 'pp' ? this._patternsPanel
            : null
        if (!panel) return
        if (show) {
            if (isMobileViewport()) {
                this._currentView = kind
            }
            this._hideOtherSlotPanels(kind)
            this._ensureTrackEditorVisible()
            this._ensureNoteEditorVisible()
            panel.show()
            if (this._outputPanel?.isVisible) this._outputPanel.hide()
        } else {
            panel.hide()
            if (isMobileViewport() && this._currentView === kind) {
                this._currentView = 'mobileSeq'
            }
            this._outputPanel?.show()
        }
    }

    _hideOtherSlotPanels(except) {
        if (except !== 'tools' && this._toolsPanel?.isVisible) this._toolsPanel.hide()
        if (except !== 'dm' && this._drumkitManager?.isVisible) this._drumkitManager.hide()
        if (except !== 'pp' && this._patternsPanel?.isVisible) this._patternsPanel.hide()
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
