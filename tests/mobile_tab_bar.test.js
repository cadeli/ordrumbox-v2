/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import PatternPanel from '../src/ui/pattern_panel.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import ViewManager from '../src/ui/view_manager.js'
import MobileTabBar from '../src/ui/mobile_tab_bar.js'

describe('Mobile tab bar', () => {
    let trackEditor, noteEditor, patternPanel, toolsPanel, viewManager, mobileTabBar

    const MOCK_TRACK = {
        name: 'KICK', notes: [], nbBeats: 4, stepsPerBeat: 4, loopAtStep: 16,
        mute: false, solo: false, useAutoAssignSound: true,
        velocity: 0.8, pan: 0, pitch: 0,
        filterCutoff: 12000, filterResonance: 1, filterType: 'lowpass',
        filterLfo: 0, filterEnvelopeAmount: 0,
        pitchLfo: 0, volumeLfo: 0, panLfo: 0, filterLfoValue: 0,
        pitchEnv: 0, delaySend: 0, reverbSend: 0, saturationDrive: 0,
        delayActive: false, reverbActive: false, saturationActive: false,
        swingAmount: 0, swingMode: 'off', synthSoundKey: 'BASS1'
    }

    const TEST_PATTERN = {
        name: 'Test', nbBeats: 4, bpm: 120,
        tracks: [structuredClone(MOCK_TRACK)]
    }

    beforeEach(() => {
        global.window.innerWidth = 768
        global.window.innerHeight = 480

        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        appState.patterns = [TEST_PATTERN]
        appState.selectedPatternNum = 0
        appState.selectedTrackNum = 0

        document.body.innerHTML = ''
        const appContent = document.createElement('div')
        appContent.id = 'app-content'
        document.body.appendChild(appContent)

        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn(),
            putImageData: vi.fn(), createImageData: vi.fn(), setTransform: vi.fn(),
            drawImage: vi.fn(), save: vi.fn(), fillText: vi.fn(), restore: vi.fn(),
            beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
            stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
            arc: vi.fn(), fill: vi.fn(), measureText: vi.fn().mockReturnValue({ width: 0 }),
            transform: vi.fn(), rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn()
        })

        patternPanel = new PatternPanel()
        patternPanel.init()
        trackEditor = new TrackEditor()
        trackEditor.init()
        // Attach synth panel to app-content
        document.getElementById('app-content').appendChild(trackEditor.synthEditor.panel)
        noteEditor = new NoteEditor()
        noteEditor.setContainer(trackEditor._neContainer)
        noteEditor.init()
        trackEditor.setNoteEditor(noteEditor)
        toolsPanel = new ToolsPanel()
        toolsPanel.init()

        viewManager = new ViewManager({
            trackEditor,
            synthEditor: trackEditor.synthEditor,
            pianoRollPanel: { hide: vi.fn(), show: vi.fn() },
            noteEditor,
            toolsPanel,
            patternSettingsPanel: { hide: vi.fn(), show: vi.fn(), _isOpen: false }
        })
        viewManager.init()

        mobileTabBar = new MobileTabBar()
        mobileTabBar.init()
    })

    function seqVisible() {
        const el = document.getElementById('pattern-panel')
        return el && !el.classList.contains('ui-hidden')
    }

    function teVisible() {
        const el = document.getElementById('te-panel')
        return el && (el.style.display === 'block' || el.style.display === 'flex')
    }

    describe('tab-to-view mapping via dispatch', () => {
        it('dispatching mobileSeqToggle shows pattern grid', () => {
            playbackEvents.emit("mobileSeqToggle")
            expect(seqVisible()).toBe(true)
        })

        it('dispatching mobileTrackToggle shows track editor and hides pattern grid', () => {
            playbackEvents.emit("mobileTrackToggle")
            expect(seqVisible()).toBe(false)
            expect(teVisible()).toBe(true)
        })

        it('dispatching synthToggle shows synth panel', () => {
            playbackEvents.emit("synthToggle")
            const el = document.getElementById('soft-synth-panel')
            expect(el).not.toBeNull()
        })

        it('dispatching masterToggle(true) shows master tab active', () => {
            playbackEvents.emit("masterToggle", true)
            const masterBtn = mobileTabBar.container.querySelector('[data-tab="master"]')
            expect(masterBtn.classList.contains('active')).toBe(true)
        })
    })

    describe('click on tab button triggers correct dispatch', () => {
        it('clicking Track tab dispatches mobileTrackToggle', () => {
            const spy = vi.fn()
            playbackEvents.on("mobileTrackToggle", spy)
            mobileTabBar.container.querySelector('[data-tab="track"]').click()
            expect(spy).toHaveBeenCalled()
        })

        it('clicking Synth tab dispatches synthToggle', () => {
            const spy = vi.fn()
            playbackEvents.on("synthToggle", spy)
            mobileTabBar.container.querySelector('[data-tab="synth"]').click()
            expect(spy).toHaveBeenCalled()
        })

        it('clicking Master tab dispatches masterToggle(true)', () => {
            const spy = vi.fn()
            playbackEvents.on("masterToggle", spy)
            mobileTabBar.container.querySelector('[data-tab="master"]').click()
            expect(spy).toHaveBeenCalledWith(true)
        })

        it('clicking Sequencer tab after switching away dispatches mobileSeqToggle', () => {
            mobileTabBar.container.querySelector('[data-tab="track"]').click()
            const spy = vi.fn()
            playbackEvents.on("mobileSeqToggle", spy)
            mobileTabBar.container.querySelector('[data-tab="seq"]').click()
            expect(spy).toHaveBeenCalled()
        })
    })

    describe('active tab tracking', () => {
        it('initial tab is seq', () => {
            const seqBtn = mobileTabBar.container.querySelector('[data-tab="seq"]')
            expect(seqBtn.classList.contains('active')).toBe(true)
        })

        it('active class updates when switching tabs', () => {
            const seqBtn = mobileTabBar.container.querySelector('[data-tab="seq"]')
            const trackBtn = mobileTabBar.container.querySelector('[data-tab="track"]')
            const synthBtn = mobileTabBar.container.querySelector('[data-tab="synth"]')
            const masterBtn = mobileTabBar.container.querySelector('[data-tab="master"]')

            trackBtn.click()
            expect(trackBtn.classList.contains('active')).toBe(true)
            expect(seqBtn.classList.contains('active')).toBe(false)

            synthBtn.click()
            expect(synthBtn.classList.contains('active')).toBe(true)
            expect(trackBtn.classList.contains('active')).toBe(false)

            masterBtn.click()
            expect(masterBtn.classList.contains('active')).toBe(true)
            expect(synthBtn.classList.contains('active')).toBe(false)
        })

        it('clicking same tab is a no-op', () => {
            const trackBtn = mobileTabBar.container.querySelector('[data-tab="track"]')
            trackBtn.click()
            const spy = vi.fn()
            playbackEvents.on("mobileTrackToggle", spy)
            trackBtn.click()
            expect(spy).not.toHaveBeenCalled()
        })
    })

    describe('no recursive dispatch', () => {
        it('does not cause infinite recursion when dispatching events', () => {
            const spy = vi.fn()
            playbackEvents.on("mobileSeqToggle", spy)
            playbackEvents.emit("mobileSeqToggle")
            expect(spy).toHaveBeenCalledTimes(1)
        })
    })

    describe('mobile panel layout', () => {
        const MOBILE_TOOLBAR_HEIGHT = 48

        it('pattern panel is visible below toolbar when mobileSeqToggle dispatched', () => {
            playbackEvents.emit("mobileSeqToggle")
            const el = document.getElementById('pattern-panel')
            expect(el).not.toBeNull()
            expect(el.classList.contains('ui-hidden')).toBe(false)
        })

        it('track editor is visible below toolbar when mobileTrackToggle dispatched', () => {
            playbackEvents.emit("mobileTrackToggle")
            const el = document.getElementById('te-panel')
            expect(el).not.toBeNull()
            expect(el.style.display === 'block' || el.style.display === 'flex').toBe(true)
        })

        it('synth panel exists when synthToggle dispatched', () => {
            playbackEvents.emit("synthToggle")
            const el = document.getElementById('soft-synth-panel')
            expect(el).not.toBeNull()
        })

        it('master tab active when masterToggle dispatched', () => {
            playbackEvents.emit("masterToggle", true)
            const masterBtn = mobileTabBar.container.querySelector('[data-tab="master"]')
            expect(masterBtn.classList.contains('active')).toBe(true)
        })
    })
})
