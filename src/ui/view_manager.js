import { playbackEvents } from '../state/playback_events.js'
import { appState } from '../state/app_state.js'
import { setViewMode } from './components/panel_helpers.js'
import { isMobileViewport } from '../core/constants.js'
import { isMobileLandscape, removeLayout } from './mobile_track_layout.js'

/**
 * ViewManager — single coordinator for synth / edit / proll / tools view switching.
 * Listens to toolbar and tab toggle events and calls panel.show() / panel.hide()
 * without touching another panel's DOM.
 */
export default class ViewManager {
    constructor({ trackEditor, synthEditor, pianoRollPanel, noteEditor, toolsPanel, patternSettingsPanel }) {
        this._trackEditor = trackEditor
        this._synthEditor = synthEditor
        this._pianoRollPanel = pianoRollPanel
        this._noteEditor = noteEditor
        this._toolsPanel = toolsPanel
        this._patternSettingsPanel = patternSettingsPanel
        this._currentView = null
    }

    init() {
        playbackEvents.onSynthToggle.push(() => this._switchTo('synth'))
        playbackEvents.onEditToggle.push(() => this._switchTo('edit'))
        playbackEvents.onProllToggle.push(() => this._switchTo('proll'))
        playbackEvents.onMobileSeqToggle.push(() => this._switchTo('mobileSeq'))
        playbackEvents.onMobileTrackToggle.push(() => this._switchTo('mobileTrack'))
        playbackEvents.onToolsToggle.push((show) => {
            if (show) this._switchTo('tools')
            else if (this._currentView === 'tools') this._switchTo('mobileSeq')
        })
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
                this._trackEditor.show({ track, trackIdx: idx })
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

        if (prev === 'synth') this._synthEditor.hidePanel()
        if (prev === 'proll') this._pianoRollPanel.hide()
        if (prev === 'mobileSeq') {
            this._pianoRollPanel.hide()
            document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        }
        if (prev === 'mobileTrack') {
            this._noteEditor.hide()
            removeLayout(this._trackEditor.container)
        }
        if (prev === 'tools') {
            this._toolsPanel?.hide()
        }

        if (view === 'synth') this._showSynth()
        if (view === 'proll') this._showProll()
        if (view === 'edit') this._showEdit()
        if (view === 'mobileSeq') this._showMobileSeq()
        if (view === 'mobileTrack') this._showMobileTrack()
        if (view === 'tools') this._showTools()

        setViewMode(view)
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
        this._toolsPanel?.hide()
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
        void this._synthEditor.showPanel()
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
    }

    _showEdit() {
        this._synthEditor.hidePanel()
        this._pianoRollPanel.hide()
        this._toolsPanel?.hide()
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
    }

    _showProll() {
        this._synthEditor.hidePanel()
        this._toolsPanel?.hide()
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
        this._pianoRollPanel.show()
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
    }

    _showMobileSeq() {
        this._synthEditor.hidePanel()
        this._toolsPanel?.hide()
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
        this._toolsPanel?.hide()
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
    }

    _showTools() {
        this._synthEditor.hidePanel()
        this._pianoRollPanel.hide()
        this._ensureTrackEditorVisible()
        this._ensureNoteEditorVisible()
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
        if (this._toolsPanel) {
            this._toolsPanel.show()
        }
    }
}
