import { playbackEvents } from '../state/playback_events.js'
import { appState } from '../state/app_state.js'
import { setViewMode } from './components/panel_helpers.js'

/**
 * ViewManager — single coordinator for synth / edit / proll view switching.
 * Listens to the 3 toolbar toggle events and calls panel.show() / panel.hide()
 * without touching another panel's DOM.
 */
export default class ViewManager {
    constructor({ trackEditor, synthEditor, pianoRollPanel, noteEditor }) {
        this._trackEditor = trackEditor
        this._synthEditor = synthEditor
        this._pianoRollPanel = pianoRollPanel
        this._noteEditor = noteEditor
        this._currentView = null
    }

    init() {
        playbackEvents.onSynthToggle.push(() => this._switchTo('synth'))
        playbackEvents.onEditToggle.push(() => this._switchTo('edit'))
        playbackEvents.onProllToggle.push(() => this._switchTo('proll'))
        playbackEvents.onMobileSeqToggle.push(() => this._switchTo('mobileSeq'))
        playbackEvents.onMobileTrackToggle.push(() => this._switchTo('mobileTrack'))
    }

    get currentView() {
        return this._currentView
    }

    _switchTo(view) {
        if (view === this._currentView) return
        const prev = this._currentView
        this._currentView = view

        if (prev === 'synth') this._synthEditor.hidePanel()
        if (prev === 'proll') this._pianoRollPanel.hide()
        if (prev === 'edit') {
            this._noteEditor.hide()
            this._trackEditor.hide()
        }
        if (prev === 'mobileSeq') {
            this._pianoRollPanel.hide()
            document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        }
        if (prev === 'mobileTrack') {
            this._noteEditor.hide()
            this._trackEditor.hide()
        }

        if (view === 'synth') this._showSynth()
        if (view === 'proll') this._showProll()
        if (view === 'edit') this._showEdit()
        if (view === 'mobileSeq') this._showMobileSeq()
        if (view === 'mobileTrack') this._showMobileTrack()

        setViewMode(view)
    }

    _showSynth() {
        this._noteEditor.hide()
        this._trackEditor.hide()
        void this._synthEditor.showPanel()
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
    }

    _showEdit() {
        this._synthEditor.hidePanel()
        this._pianoRollPanel.hide()
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        if (!this._trackEditor.isVisible) {
            const pattern = appState.patterns[appState.selectedPatternNum]
            const idx = appState.selectedTrackNum
            const track = pattern?.tracks?.[idx]
            if (track) {
                this._trackEditor.show({ track, trackIdx: idx })
                this._trackEditor._showNoteEditorForTrack(track, idx)
            }
        }
        this._trackEditor.container?.classList.add('pp-split')
    }

    _showProll() {
        this._synthEditor.hidePanel()
        this._noteEditor.hide()
        this._trackEditor.hide()
        const tePanel = document.getElementById('te-panel')
        if (tePanel) {
            tePanel.classList.remove('ui-hidden')
            tePanel.classList.add('pp-split')
            tePanel.style.display = 'block'
        }
        this._pianoRollPanel.show()
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
    }

    _showMobileSeq() {
        this._synthEditor.hidePanel()
        this._noteEditor.hide()
        this._trackEditor.hide()
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
    }

    _showMobileTrack() {
        this._synthEditor.hidePanel()
        this._pianoRollPanel.hide()
        const pattern = appState.patterns[appState.selectedPatternNum]
        const idx = appState.selectedTrackNum
        const track = pattern?.tracks?.[idx]
        if (track) {
            this._trackEditor.show({ track, trackIdx: idx })
            this._trackEditor._showNoteEditorForTrack(track, idx)
        }
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
    }
}
