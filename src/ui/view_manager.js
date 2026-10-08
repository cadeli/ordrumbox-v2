import { playbackEvents } from '../state/event_bus.js'
import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { setViewMode, setPatternPanelHidden } from './components/ui_utils.js'
import { isMobileViewport } from '../core/constants.js'
import { removeLayout } from './mobile_track_layout.js'
import { EVENTS } from '../core/events.js'

/**
 * Declarative view table — the whole navigation reads from it.
 *
 * `activePanel`: the one central panel the view keeps open (null = the
 * pattern grid is the workspace). `hidePattern`: the pattern grid is pushed
 * out. `hideTrackMobile`: the track editor is dropped on mobile viewports
 * (desktop always keeps it).
 *
 * @type {Record<string, { activePanel: 'synth'|'proll'|'song'|null, hidePattern: boolean, hideTrackMobile: boolean }>}
 */
const VIEW_DEFS = {
    edit: { activePanel: null, hidePattern: false, hideTrackMobile: false },
    synth: { activePanel: 'synth', hidePattern: true, hideTrackMobile: true },
    proll: { activePanel: 'proll', hidePattern: true, hideTrackMobile: false },
    song: { activePanel: 'song', hidePattern: true, hideTrackMobile: false },
    mobileSeq: { activePanel: null, hidePattern: false, hideTrackMobile: true },
    mobileTrack: { activePanel: null, hidePattern: true, hideTrackMobile: false },
}

/**
 * ViewManager — single coordinator for synth / edit / proll / song view
 * switching. Listens to toolbar and tab toggle events and calls
 * panel.show() / panel.hide() without touching another panel's DOM.
 * Every view switch is `#switchTo()` reading VIEW_DEFS: open the view's
 * activePanel, close the other central panels, then settle the pattern
 * grid and the track editor.
 *
 * Slot panels (tools, master, dm, about) are mutually exclusive —
 * showing one hides all others and replaces the master panel in the same DOM slot.
 */
export default class ViewManager {
    #trackEditor
    #synthEditor
    #pianoRollPanel
    #noteEditor
    #patternSettingsPanel
    #outputPanel
    #songPanel
    #currentView
    #slots

    constructor({
        trackEditor,
        synthEditor,
        pianoRollPanel,
        noteEditor,
        toolsPanel,
        patternSettingsPanel,
        outputPanel,
        drumkitManager,
        songPanel,
        aboutPanel,
    }) {
        this.#trackEditor = trackEditor
        this.#synthEditor = synthEditor
        this.#pianoRollPanel = pianoRollPanel
        this.#noteEditor = noteEditor
        this.#patternSettingsPanel = patternSettingsPanel
        this.#outputPanel = outputPanel
        this.#songPanel = songPanel
        this.#currentView = null

        // ── Slot panel registry: short name → { event, panel } ─────────────
        this.#slots = new Map([
            ['tools', { event: EVENTS.TOOLS_TOGGLE, panel: toolsPanel }],
            ['master', { event: EVENTS.MASTER_TOGGLE, panel: outputPanel }],
            ['dm', { event: EVENTS.DRUMKIT_MANAGER_TOGGLE, panel: drumkitManager }],
            ['about', { event: EVENTS.ABOUT_TOGGLE, panel: aboutPanel }],
        ])
    }

    init() {
        // View switches (synth, edit, proll, mobile)
        playbackEvents.on(EVENTS.SYNTH_TOGGLE, () => this.#switchTo('synth'))
        playbackEvents.on(EVENTS.EDIT_TOGGLE, () => this.#switchTo('edit'))
        playbackEvents.on(EVENTS.PROLL_TOGGLE, () => this.#switchTo('proll'))
        playbackEvents.on(EVENTS.SONG_TOGGLE, () => this.#switchTo('song'))
        playbackEvents.on(EVENTS.MOBILE_SEQ_TOGGLE, () => this.#switchTo('mobileSeq'))
        playbackEvents.on(EVENTS.MOBILE_TRACK_TOGGLE, () => this.#switchTo('mobileTrack'))

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
            if (isMobileViewport()) {
                this.#currentView = name
                this.#synthEditor.closePanelAndCommit()
                this.#trackEditor.hide()
                setPatternPanelHidden(true)
            } else {
                this.#ensureEditorsVisible()
                if (this.#outputPanel?.isVisible && name !== 'master') this.#outputPanel.hide()
            }
            panel.show()
        } else {
            panel.hide()
            if (isMobileViewport() && this.#currentView === name) {
                this.#currentView = 'mobileSeq'
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
        serviceRegistry.resourcesLoader?.saveSession?.()

        this.#patternSettingsPanel?.hide?.()

        if (prev === 'mobileTrack') {
            removeLayout(this.#trackEditor.container)
            this.#noteEditor?.hide()
        }
        if (isMobileViewport() && this.#slots.has(prev)) {
            this.#hideOtherSlotPanels(null)
        }

        const def = VIEW_DEFS[view]

        if (def.activePanel !== 'synth') this.#synthEditor.closePanelAndCommit()
        if (def.activePanel !== 'proll') this.#pianoRollPanel.hide()
        if (def.activePanel !== 'song') this.#songPanel?.hide()

        if (isMobileViewport() && def.hideTrackMobile) {
            this.#trackEditor.hide()
        } else {
            this.#ensureEditorsVisible()
        }
        setPatternPanelHidden(def.hidePattern)

        if (def.activePanel === 'synth') void this.#synthEditor.showPanel()
        else if (def.activePanel === 'proll') this.#pianoRollPanel.show()
        else if (def.activePanel === 'song') this.#songPanel?.show()

        setViewMode(view)
        // Playback mode follows the visible view: the sequencer re-anchors its
        // transport (and picks the arrangement tempo) on the switch.
        playbackEvents.emit(EVENTS.VIEW_CHANGED, view)
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    #ensureTrackEditorVisible() {
        if (!this.#trackEditor.isVisible) {
            const pattern = appState.selectedPattern
            const idx = appState.selectedTrackIdx
            const track = pattern?.tracks?.[idx]
            if (track) {
                this.#trackEditor.track = track
                this.#trackEditor.selectedTrackIdx = idx
                this.#trackEditor.sync()
            }
        }
        this.#trackEditor.container?.style.setProperty('display', isMobileViewport() ? 'flex' : 'block')
        this.#trackEditor.container?.classList.add('pp-split')
    }

    #ensureNoteEditorVisible() {
        const pattern = appState.selectedPattern
        const idx = appState.selectedTrackIdx
        const track = pattern?.tracks?.[idx]
        if (track && this.#trackEditor.isVisible) {
            this.#trackEditor.showNoteEditorForTrack(track, idx)
        }
    }

    /** Ensures both the track editor and its note editor are visible/synced. */
    #ensureEditorsVisible() {
        this.#ensureTrackEditorVisible()
        this.#ensureNoteEditorVisible()
    }
}
