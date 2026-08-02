/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { appState, AppState } from '../src/state/app_state.js'
import TrackEditor from '../src/ui/track_editor.js'
import { playbackEvents } from '../src/state/playback_events.js'

describe('Mobile Landscape UI Logic', () => {
    
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('identifies mobile mode when height is small (Landscape)', () => {
        // Simulate a landscape phone: wide but short
        global.window.innerWidth = 800
        global.window.innerHeight = 350

        // We need a fresh instance to trigger the constructor logic
        const mobileState = new AppState()
        
        // Essential panels should be TRUE by default, others FALSE on mobile
        expect(mobileState.trackEditorVisibility.basic).toBe(true)
        expect(mobileState.trackEditorVisibility.loop).toBe(false)
        
        expect(mobileState.trackEditorVisibility.filters).toBe(false)
        expect(mobileState.trackEditorVisibility.effects).toBe(false)
    })

    it('identifies desktop mode when both dimensions are large', () => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 900

        const desktopState = new AppState()
        
        // Should be true for all panels on desktop
        expect(desktopState.trackEditorVisibility.basic).toBe(true)
    })

    it('renders TrackEditor with hidden panels in mobile landscape', () => {
        // 1. Setup mobile landscape dimensions
        global.window.innerWidth = 800
        global.window.innerHeight = 400

        // 2. Initialize state and editor
        const state = new AppState()
        // Override global appState for the test
        Object.assign(appState, state)

        const editor = new TrackEditor()
        editor.init()

        // 3. Select a track to show editor
        const mockTrack = { name: 'KICK', notes: [], nbBeats: 1, stepsPerBeat: 4 }
        editor.show({ track: mockTrack, trackIdx: 0 })

        // 4. Verify tab bar with 5 tabs
        const tabs = document.querySelectorAll('.ne-tab-btn[data-ne-tab]')
        expect(tabs.length).toBe(5)

        // 5. Verify tab panels are rendered
        const panels = document.querySelectorAll('.ne-tab-panel[data-tab-panel]')
        expect(panels.length).toBe(5)

        // 6. Only one tab panel visible at a time
        const visiblePanels = Array.from(panels).filter(p => getComputedStyle(p).display !== 'none')
        expect(visiblePanels.length).toBe(1)
    })
})
