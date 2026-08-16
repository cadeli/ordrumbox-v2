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
import PianoRollPanel from '../src/ui/piano_roll_panel.js'
import OutputPanel from '../src/ui/output_panel.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import ViewManager from '../src/ui/view_manager.js'

describe('View modes (proll / grid / synth)', () => {
    let trackEditor, noteEditor, patternPanel, pianoRoll, toolsPanel, outputPanel, viewManager

    const MOCK_TRACK = {
        name: 'KICK', notes: [], nbBeats: 1, stepsPerBeat: 4,
        mute: false, solo: false, useAutoAssignSound: true,
        velocity: 0.8, pan: 0, pitch: 0,
        filterCutoff: 12000, filterResonance: 1, filterType: 'lowpass',
        filterLfo: 0, filterEnvelopeAmount: 0,
        pitchLfo: 0, volumeLfo: 0, panLfo: 0, filterLfoValue: 0,
        pitchEnv: 0, delaySend: 0, reverbSend: 0, saturationDrive: 0,
        delayActive: false, reverbActive: false, saturationActive: false,
        swingAmount: 0, swingMode: 'off',
        nbBeats: 4, stepsPerBeat: 4, loopAtStep: 16, synthSoundKey: 'BASS1'
    }

    const TEST_PATTERN = {
        name: 'Test', nbBeats: 2, bpm: 120,
        tracks: { T1: { name: 'KICK', notes: [], nbBeats: 1, stepsPerBeat: 4 } }
    }

    function prollVisible() {
        return document.getElementById('piano-roll-panel')?.style.display !== 'none'
    }
    function gridVisible() {
        return document.getElementById('pattern-panel')?.style.display !== 'none' &&
            !document.getElementById('pattern-panel')?.classList.contains('ui-hidden')
    }
    function teVisible() {
        const el = document.getElementById('te-panel')
        return el && (el.style.display === 'block' || el.style.display === 'flex')
    }
    function synthVisible() {
        return document.getElementById('soft-synth-panel')?.style.display === 'flex'
    }
    function teHasSplit() {
        return document.getElementById('te-panel')?.classList.contains('pp-split')
    }
    function neVisible() {
        const el = document.getElementById('ne-container')
        return el && (el.style.display === 'block' || el.style.display === 'flex')
    }
    function neHasContent() {
        const el = document.getElementById('ne-container')
        return el && el.innerHTML.trim().length > 0
    }

    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        appState.patterns = [TEST_PATTERN]
        appState.selectedPatternNum = 0
        appState.selectedTrackNum = 0

        soundRegistry.drumkitList = [
            { name: 'kit', instruments: [{ key: 'KICK', url: 'kit/kick.wav' }] }
        ]
        soundRegistry.sounds = {
            'kit/kick.wav': { key: 'KICK', url: 'kit/kick.wav', buffer: {} }
        }
        soundRegistry.generatedSounds = {
            BASS1: { _key: 'BASS1', masterVolume: 0.9 }
        }

        serviceRegistry.mfCmd = { changeTrackSound: vi.fn() }
        serviceRegistry.transport = { isRunning: false, tick: 0 }

        document.body.innerHTML = ''

        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ major: { scaleSteps: [0, 2, 4, 5, 7, 9, 11] } })
        })

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
        noteEditor = new NoteEditor()
        noteEditor.setContainer(trackEditor._neContainer)
        noteEditor.init()
        trackEditor.setNoteEditor(noteEditor)
        pianoRoll = new PianoRollPanel()
        pianoRoll.init()
        toolsPanel = new ToolsPanel()
        toolsPanel.init()
        outputPanel = new OutputPanel()
        outputPanel.init()

        viewManager = new ViewManager({
            trackEditor,
            synthEditor: trackEditor.synthEditor,
            pianoRollPanel: pianoRoll,
            noteEditor,
        })
        viewManager.init()
    })

    function showTrack() {
        trackEditor.show({ track: MOCK_TRACK, trackIdx: 0 })
        trackEditor._showNoteEditorForTrack(MOCK_TRACK, 0)
    }

    describe('proll mode', () => {
        it('shows piano roll + te + ne, hides grid and synth', async () => {
            await playbackEvents.dispatchProllToggle()

            expect(prollVisible()).toBe(true)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
            expect(gridVisible()).toBe(false)
            expect(synthVisible()).toBe(false)
        })

        it('no-op if already in proll mode', async () => {
            await playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)

            await playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)
            expect(teVisible()).toBe(true)
        })
    })

    describe('grid mode', () => {
        it('shows pattern grid + te + ne, hides proll and synth', async () => {
            showTrack()
            await playbackEvents.dispatchEditToggle()

            expect(gridVisible()).toBe(true)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(synthVisible()).toBe(false)
        })

        it('no-op if already in grid mode', async () => {
            showTrack()
            await playbackEvents.dispatchEditToggle()
            const teDisplay = document.getElementById('te-panel').style.display

            await playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(document.getElementById('te-panel').style.display).toBe(teDisplay)
        })
    })

    describe('synth mode', () => {
        it('shows synth, hides grid and proll', async () => {
            showTrack()
            await playbackEvents.dispatchSynthToggle()

            expect(synthVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(gridVisible()).toBe(false)
        })

        it('no-op if already in synth mode', async () => {
            showTrack()
            await playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)

            await playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)
        })
    })

    describe('transitions between modes', () => {
        it('synth → proll: hides synth, shows proll + te + ne with content', async () => {
            showTrack()
            await playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)

            await playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)
            expect(synthVisible()).toBe(false)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
            expect(neVisible()).toBe(true)
            expect(neHasContent()).toBe(true)
        })

        it('synth → proll: te-panel has pp-split and ne-container has content', async () => {
            showTrack()
            await playbackEvents.dispatchSynthToggle()

            await playbackEvents.dispatchProllToggle()

            const tePanel = document.getElementById('te-panel')
            expect(tePanel).not.toBeNull()
            expect(tePanel.style.display).toBe('block')
            expect(tePanel.classList.contains('pp-split')).toBe(true)

            const neContainer = document.getElementById('ne-container')
            expect(neContainer).not.toBeNull()
            expect(neContainer.style.display).toBe('block')
            expect(neContainer.innerHTML.trim().length).toBeGreaterThan(0)
        })

        it('proll panel fills its grid column', async () => {
            await playbackEvents.dispatchProllToggle()

            const proll = document.getElementById('piano-roll-panel')
            expect(proll).not.toBeNull()
            expect(proll.classList.contains('ui-hidden')).toBe(false)
        })

        it('proll → grid: hides proll, shows grid + te', async () => {
            await playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)

            showTrack()
            await playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
        })

        it('grid → synth: hides grid, shows synth', async () => {
            showTrack()
            await playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)

            await playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)
            expect(gridVisible()).toBe(false)
        })

        it('synth → grid: hides synth, shows grid + te', async () => {
            showTrack()
            await playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)

            await playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(synthVisible()).toBe(false)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
        })

        it('proll → synth: hides proll, shows synth', async () => {
            await playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)

            showTrack()
            await playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
        })

        it('synth → proll: hides synth, shows proll + te', async () => {
            showTrack()
            await playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)

            await playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)
            expect(synthVisible()).toBe(false)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
        })

        it('full cycle grid → proll → synth → grid', async () => {
            showTrack()

            await playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(synthVisible()).toBe(false)

            await playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)
            expect(gridVisible()).toBe(false)
            expect(synthVisible()).toBe(false)

            await playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(gridVisible()).toBe(false)

            await playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(synthVisible()).toBe(false)
            expect(prollVisible()).toBe(false)
            expect(teVisible()).toBe(true)
        })

        it('full cycle proll → synth → grid → proll', { timeout: 15000 }, async () => {
            await playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)

            showTrack()
            await playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)

            await playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)

            await playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)
            expect(gridVisible()).toBe(false)
            expect(synthVisible()).toBe(false)
            expect(teVisible()).toBe(true)
        })
    })

    describe('track editor always visible', () => {
        it('te-panel is visible after proll toggle', async () => {
            showTrack()
            await playbackEvents.dispatchProllToggle()
            expect(teVisible()).toBe(true)
        })

        it('te-panel is visible after edit toggle', async () => {
            showTrack()
            await playbackEvents.dispatchEditToggle()
            expect(teVisible()).toBe(true)
        })

        it('te-panel is visible after tools toggle', () => {
            showTrack()
            playbackEvents.dispatchToolsToggle(true)
            expect(teVisible()).toBe(true)
        })

        it('te-panel stays visible through grid → synth', async () => {
            showTrack()
            await playbackEvents.dispatchEditToggle()
            expect(teVisible()).toBe(true)

            await playbackEvents.dispatchSynthToggle()
            expect(teVisible()).toBe(true)
        })

        it('te-panel stays visible through synth → grid', async () => {
            showTrack()
            await playbackEvents.dispatchSynthToggle()
            expect(teVisible()).toBe(true)

            await playbackEvents.dispatchEditToggle()
            expect(teVisible()).toBe(true)
        })

        it('te-panel stays visible through proll → synth', async () => {
            showTrack()
            await playbackEvents.dispatchProllToggle()
            expect(teVisible()).toBe(true)

            await playbackEvents.dispatchSynthToggle()
            expect(teVisible()).toBe(true)
        })

        it('te-panel stays visible through synth → proll', { timeout: 15000 }, async () => {
            showTrack()
            await playbackEvents.dispatchSynthToggle()
            expect(teVisible()).toBe(true)

            await playbackEvents.dispatchProllToggle()
            expect(teVisible()).toBe(true)
        })

        it('te-panel stays visible through grid → proll → synth', { timeout: 15000 }, async () => {
            showTrack()
            await playbackEvents.dispatchEditToggle()
            await playbackEvents.dispatchProllToggle()
            await playbackEvents.dispatchSynthToggle()
            expect(teVisible()).toBe(true)
        })

        it('te-panel stays visible through all view transitions', async () => {
            showTrack()

            await playbackEvents.dispatchEditToggle()
            expect(teVisible()).toBe(true)

            await playbackEvents.dispatchSynthToggle()
            expect(teVisible()).toBe(true)

            await playbackEvents.dispatchProllToggle()
            expect(teVisible()).toBe(true)

            await playbackEvents.dispatchEditToggle()
            expect(teVisible()).toBe(true)

            playbackEvents.dispatchToolsToggle(true)
            expect(teVisible()).toBe(true)

            await playbackEvents.dispatchEditToggle()
            expect(teVisible()).toBe(true)
        })
    })
})
