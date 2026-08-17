/**
 * @vitest-environment jsdom
 *
 * Desktop-only: asserts TrackEditor and NoteEditor stay visible
 * across every view switch, and that the active panel is never hidden behind them.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import PatternSettingsPanel from '../src/ui/pattern_settings_panel.js'
import ViewManager from '../src/ui/view_manager.js'

describe('TE & NE always visible (desktop)', () => {
    let trackEditor, noteEditor, toolsPanel, patternSettingsPanel, viewManager
    let mockSynthEditor, mockPianoRollPanel

    const MOCK_TRACK = {
        name: 'KICK', notes: [{ beat: 0, beatStep: 0, pitch: 0, velocity: 0.8 }],
        nbBeats: 4, stepsPerBeat: 4, loopAtStep: 16,
        mute: false, solo: false, useAutoAssignSound: true,
        velocity: 0.8, pan: 0, pitch: 0,
        filterCutoff: 12000, filterResonance: 1, filterType: 'lowpass',
        filterLfo: 0, filterEnvelopeAmount: 0,
        pitchLfo: 0, volumeLfo: 0, panLfo: 0, filterLfoValue: 0,
        pitchEnv: 0, delaySend: 0, reverbSend: 0, saturationDrive: 0,
        delayActive: false, reverbActive: false, saturationActive: false,
        swingAmount: 0, swingMode: 'off', synthSoundKey: 'BASS1'
    }

    const SECOND_TRACK = {
        ...structuredClone(MOCK_TRACK), name: 'SNARE'
    }

    beforeEach(() => {
        document.body.innerHTML = ''
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        appState.reset()

        appState.patterns = [{
            name: 'Pattern 1',
            nbBeats: 4,
            tracks: [structuredClone(MOCK_TRACK), SECOND_TRACK]
        }]
        appState.selectedPatternNum = 0
        appState.selectedTrackNum = 0

        const patternPanel = document.createElement('div')
        patternPanel.id = 'pattern-panel'
        document.body.appendChild(patternPanel)

        mockSynthEditor = {
            createDOM: () => {},
            getGeneratedSoundKeys: () => [],
            hidePanel: () => {
                const el = document.getElementById('soft-synth-panel')
                if (el) el.style.display = 'none'
            },
            showPanel: () => {
                let el = document.getElementById('soft-synth-panel')
                if (!el) {
                    el = document.createElement('div')
                    el.id = 'soft-synth-panel'
                    document.body.appendChild(el)
                }
                el.style.display = 'block'
            },
            ensureGeneratedSoundsLoaded: async () => {},
            reset: () => {}
        }

        mockPianoRollPanel = {
            hide: () => {
                const el = document.getElementById('piano-roll-panel')
                if (el) el.style.display = 'none'
            },
            show: () => {
                let el = document.getElementById('piano-roll-panel')
                if (!el) {
                    el = document.createElement('div')
                    el.id = 'piano-roll-panel'
                    document.body.appendChild(el)
                }
                el.style.display = 'block'
            }
        }

        trackEditor = new TrackEditor()
        trackEditor.synthEditor = mockSynthEditor
        trackEditor.init()

        noteEditor = new NoteEditor()
        noteEditor.setContainer(trackEditor._neContainer)
        noteEditor.init()
        trackEditor.setNoteEditor(noteEditor)

        toolsPanel = new ToolsPanel()
        toolsPanel.init()

        patternSettingsPanel = new PatternSettingsPanel()
        patternSettingsPanel.init()

        viewManager = new ViewManager({
            trackEditor,
            synthEditor: mockSynthEditor,
            pianoRollPanel: mockPianoRollPanel,
            noteEditor,
            toolsPanel,
            patternSettingsPanel
        })
        viewManager.init()
    })

    function expectTEVisible() {
        expect(trackEditor.container).not.toBeNull()
        expect(trackEditor.isVisible).toBe(true)
    }

    function expectNEVisible() {
        const ne = document.getElementById('ne-container')
        expect(ne).not.toBeNull()
        expect(ne.style.display).not.toBe('none')
    }

    function expectPanelVisible(id) {
        const el = document.getElementById(id)
        expect(el).not.toBeNull()
        expect(el.style.display).not.toBe('none')
    }

    it('edit: TE and NE visible', () => {
        playbackEvents.dispatchEditToggle()
        expectTEVisible()
        expectNEVisible()
    })

    it('synth: TE and NE visible', () => {
        playbackEvents.dispatchSynthToggle()
        expectTEVisible()
        expectNEVisible()
    })

    it('proll: TE and NE visible', () => {
        playbackEvents.dispatchProllToggle()
        expectTEVisible()
        expectNEVisible()
    })

    it('tools: TE and NE visible', () => {
        playbackEvents.dispatchToolsToggle(true)
        expectTEVisible()
        expectNEVisible()
    })

    it('full cycle: edit -> synth -> proll -> tools -> edit preserves TE+NE', () => {
        const dispatches = [
            playbackEvents.dispatchEditToggle,
            playbackEvents.dispatchSynthToggle,
            playbackEvents.dispatchProllToggle,
            () => playbackEvents.dispatchToolsToggle(true),
            playbackEvents.dispatchEditToggle,
        ]
        for (const dispatch of dispatches) {
            dispatch()
            expectTEVisible()
            expectNEVisible()
        }
    })

    it('random order: synth -> tools -> edit -> proll -> synth preserves TE+NE', () => {
        const dispatches = [
            playbackEvents.dispatchSynthToggle,
            () => playbackEvents.dispatchToolsToggle(true),
            playbackEvents.dispatchEditToggle,
            playbackEvents.dispatchProllToggle,
            playbackEvents.dispatchSynthToggle,
        ]
        for (const dispatch of dispatches) {
            dispatch()
            expectTEVisible()
            expectNEVisible()
        }
    })

    it('synth panel visible alongside TE+NE (no cover)', () => {
        playbackEvents.dispatchSynthToggle()
        expectTEVisible()
        expectNEVisible()
        expectPanelVisible('soft-synth-panel')
    })

    it('tools panel visible alongside TE+NE (no cover)', () => {
        playbackEvents.dispatchToolsToggle(true)
        expectTEVisible()
        expectNEVisible()
        expectPanelVisible('tools-panel')
    })

    it('piano roll visible alongside TE+NE (no cover)', () => {
        playbackEvents.dispatchProllToggle()
        expectTEVisible()
        expectNEVisible()
        expectPanelVisible('piano-roll-panel')
    })

    it('pattern panel visible in edit alongside TE+NE (no cover)', () => {
        playbackEvents.dispatchEditToggle()
        expectTEVisible()
        expectNEVisible()
        expectPanelVisible('pattern-panel')
    })
})
