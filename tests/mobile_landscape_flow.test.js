/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import PatternSettingsPanel from '../src/ui/pattern_settings_panel.js'
import ViewManager from '../src/ui/view_manager.js'
import MobileTabBar from '../src/ui/mobile_tab_bar.js'

describe('Mobile Landscape View Switching & Tab Order Consistency', () => {
    let trackEditor, noteEditor, toolsPanel, patternSettingsPanel, viewManager, mobileTabBar
    let mockSynthEditor, mockPianoRollPanel, mockPatternPanel

    beforeEach(() => {
        document.body.innerHTML = ''

        // Set Mobile Landscape dimensions
        global.window.innerWidth = 800
        global.window.innerHeight = 375

        // Reset playback events
        playbackEvents._listeners.clear()

        // Setup pattern state
        appState.patterns = [
            {
                name: 'Pattern 1',
                nbBeats: 4,
                tracks: [
                    { name: 'KICK', notes: [{ beat: 0, beatStep: 0, pitch: 0, velocity: 0.8 }], stepsPerBeat: 4, volume: 1 },
                    { name: 'SNARE', notes: [], stepsPerBeat: 4, volume: 1 }
                ]
            }
        ]
        appState.selectedPatternNum = 0
        appState.selectedTrackNum = 0

        // Create DOM mock for pattern-panel
        mockPatternPanel = document.createElement('div')
        mockPatternPanel.id = 'pattern-panel'
        document.body.appendChild(mockPatternPanel)

        // Mock synth & piano roll panels
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

        // Real UI instances
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

        mobileTabBar = new MobileTabBar()
        mobileTabBar.init()
    })

    it('switches views cleanly regardless of order: seq -> tools -> synth -> track -> seq', () => {
        // Start in mobileSeq
        playbackEvents.dispatchMobileSeqToggle()
        expect(viewManager.currentView).toBe('mobileSeq')
        expect(mockPatternPanel.classList.contains('ui-hidden')).toBe(false)

        // 1. Switch to tools
        playbackEvents.dispatchToolsToggle(true)
        expect(viewManager.currentView).toBe('tools')
        expect(toolsPanel.isVisible).toBe(true)

        // 2. Switch to synth
        playbackEvents.dispatchSynthToggle()
        expect(viewManager.currentView).toBe('synth')
        expect(toolsPanel.isVisible).toBe(false)
        expect(document.getElementById('soft-synth-panel')?.style.display).toBe('block')

        // 3. Switch to track
        playbackEvents.dispatchMobileTrackToggle()
        expect(viewManager.currentView).toBe('mobileTrack')
        expect(document.getElementById('soft-synth-panel')?.style.display).toBe('none')
        expect(trackEditor.isVisible).toBe(true)

        // Verify 3-column layout structure created in mobile landscape
        const layout3col = trackEditor.container.querySelector('.mobile-track-3col')
        expect(layout3col).not.toBeNull()

        // 4. Switch back to seq
        playbackEvents.dispatchMobileSeqToggle()
        expect(viewManager.currentView).toBe('mobileSeq')
        expect(trackEditor.isVisible).toBe(false)
        expect(mockPatternPanel.classList.contains('ui-hidden')).toBe(false)
    })

    it('cleans up 3-column layout when track editor is hidden', () => {
        playbackEvents.dispatchMobileTrackToggle()
        expect(trackEditor.container.querySelector('.mobile-track-3col')).not.toBeNull()

        playbackEvents.dispatchMobileSeqToggle()
        expect(trackEditor.container.querySelector('.mobile-track-3col')).toBeNull()
    })

    it('re-renders note editor in col3 when TrackEditor syncs in mobile landscape', () => {
        playbackEvents.dispatchMobileTrackToggle()

        // Trigger track editor sync
        trackEditor.sync()

        const layout3col = trackEditor.container.querySelector('.mobile-track-3col')
        expect(layout3col).not.toBeNull()

        const colNoteTabs = layout3col.querySelector('.mtl-note-tabs')
        expect(colNoteTabs).not.toBeNull()
        expect(colNoteTabs.querySelector('#ne-container')).not.toBeNull()
    })

    it('hides patternSettingsPanel when switching tabs', () => {
        patternSettingsPanel.show()
        expect(patternSettingsPanel._isOpen).toBe(true)

        playbackEvents.dispatchMobileTrackToggle()
        expect(patternSettingsPanel._isOpen).toBe(false)
    })
})
