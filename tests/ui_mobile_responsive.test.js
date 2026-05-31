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
        
        // Should be false for all panels on mobile
        expect(mobileState.trackEditorVisibility.basic).toBe(false)
        expect(mobileState.trackEditorVisibility.levels).toBe(false)
        expect(mobileState.trackEditorVisibility.loop).toBe(false)
    })

    it('identifies desktop mode when both dimensions are large', () => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 900

        const desktopState = new AppState()
        
        // Should be true for all panels on desktop
        expect(desktopState.trackEditorVisibility.basic).toBe(true)
        expect(desktopState.trackEditorVisibility.levels).toBe(true)
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
        const mockTrack = { name: 'KICK', notes: [], bars: 1, barQuantize: 4 }
        editor.show({ track: mockTrack, trackIdx: 0 })

        // 4. Verify that buttons are rendered but the panels (ne-group) are NOT
        // (Except for the ones we didn't explicitly hide in GROUPS loop if any, 
        // but our logic hides basic, levels, filters, effects, sound, loop)
        
        const visibleGroups = document.querySelectorAll('.ne-group')
        // In our logic, if basic/levels/etc are false, the .ne-group divs are not even created in the HTML
        expect(visibleGroups.length).toBe(0)

        // 5. Verify the toggle buttons exist in the header and are NOT active
        const toggles = document.querySelectorAll('.ne-toggle')
        expect(toggles.length).toBe(6)
        toggles.forEach(btn => {
            expect(btn.classList.contains('active')).toBe(false)
        })
    })
})
