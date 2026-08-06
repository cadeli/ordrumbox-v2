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
    function flushMicrotasks() {
        return new Promise(resolve => setTimeout(resolve, 50))
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

    function activateSynth() {
        const sp = document.getElementById('soft-synth-panel')
        sp.style.display = 'flex'
        trackEditor.container.style.display = 'none'
        const neContainer = document.getElementById('ne-container')
        if (neContainer) neContainer.style.display = 'none'
        document.getElementById('pattern-panel')?.classList.add('ui-hidden')
        document.getElementById('piano-roll-panel').style.display = 'none'
    }

    describe('proll mode', () => {
        it('shows piano roll + te + ne, hides grid and synth', () => {
            playbackEvents.dispatchProllToggle()

            expect(prollVisible()).toBe(true)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
            expect(gridVisible()).toBe(false)
            expect(synthVisible()).toBe(false)
        })

        it('no-op if already in proll mode', () => {
            playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)

            playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)
            expect(teVisible()).toBe(true)
        })
    })

    describe('grid mode', () => {
        it('shows pattern grid + te + ne, hides proll and synth', () => {
            showTrack()
            playbackEvents.dispatchEditToggle()

            expect(gridVisible()).toBe(true)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(synthVisible()).toBe(false)
        })

        it('no-op if already in grid mode', () => {
            showTrack()
            playbackEvents.dispatchEditToggle()
            const teDisplay = document.getElementById('te-panel').style.display

            playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(document.getElementById('te-panel').style.display).toBe(teDisplay)
        })
    })

    describe('synth mode', () => {
        it('shows synth, hides grid proll te ne', () => {
            showTrack()
            activateSynth()

            expect(synthVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(gridVisible()).toBe(false)
            expect(teVisible()).toBe(false)
        })

        it('no-op if already in synth mode', () => {
            showTrack()
            activateSynth()
            expect(synthVisible()).toBe(true)

            playbackEvents.dispatchSynthToggle()
            expect(synthVisible()).toBe(true)
        })
    })

    describe('transitions between modes', () => {
        it('synth → proll: hides synth, shows proll + te + ne with content', async () => {
            showTrack()
            await flushMicrotasks()
            activateSynth()
            expect(synthVisible()).toBe(true)

            playbackEvents.dispatchProllToggle()
            await flushMicrotasks()
            expect(prollVisible()).toBe(true)
            expect(synthVisible()).toBe(false)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
            expect(neVisible()).toBe(true)
            expect(neHasContent()).toBe(true)
        })

        it('synth → proll: te-panel is at left:79% and ne-container has content', async () => {
            showTrack()
            await flushMicrotasks()
            activateSynth()

            playbackEvents.dispatchProllToggle()
            await flushMicrotasks()

            const tePanel = document.getElementById('te-panel')
            expect(tePanel).not.toBeNull()
            expect(tePanel.style.display).toBe('block')
            expect(tePanel.classList.contains('pp-split')).toBe(true)

            const neContainer = document.getElementById('ne-container')
            expect(neContainer).not.toBeNull()
            expect(neContainer.style.display).toBe('block')
            expect(neContainer.innerHTML.trim().length).toBeGreaterThan(0)
        })

        it('proll panel fills its grid column', () => {
            playbackEvents.dispatchProllToggle()

            const proll = document.getElementById('piano-roll-panel')
            expect(proll).not.toBeNull()
            expect(proll.classList.contains('ui-hidden')).toBe(false)
        })

        it('proll → grid: hides proll, shows grid + te', () => {
            playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)

            showTrack()
            playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
        })

        it('grid → synth: hides grid + te, shows synth', () => {
            showTrack()
            playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)

            activateSynth()
            expect(synthVisible()).toBe(true)
            expect(gridVisible()).toBe(false)
            expect(teVisible()).toBe(false)
        })

        it('synth → grid: hides synth, shows grid + te', () => {
            showTrack()
            activateSynth()
            expect(synthVisible()).toBe(true)

            playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(synthVisible()).toBe(false)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
        })

        it('proll → synth: hides proll + te, shows synth', () => {
            playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)

            showTrack()
            activateSynth()
            expect(synthVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(teVisible()).toBe(false)
        })

        it('synth → proll: hides synth, shows proll + te', () => {
            showTrack()
            activateSynth()
            expect(synthVisible()).toBe(true)

            playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)
            expect(synthVisible()).toBe(false)
            expect(teVisible()).toBe(true)
            expect(teHasSplit()).toBe(true)
        })

        it('full cycle grid → proll → synth → grid', () => {
            showTrack()

            playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(synthVisible()).toBe(false)

            playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)
            expect(gridVisible()).toBe(false)
            expect(synthVisible()).toBe(false)

            activateSynth()
            expect(synthVisible()).toBe(true)
            expect(prollVisible()).toBe(false)
            expect(gridVisible()).toBe(false)

            playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)
            expect(synthVisible()).toBe(false)
            expect(prollVisible()).toBe(false)
            expect(teVisible()).toBe(true)
        })

        it('full cycle proll → synth → grid → proll', () => {
            playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)

            showTrack()
            activateSynth()
            expect(synthVisible()).toBe(true)

            playbackEvents.dispatchEditToggle()
            expect(gridVisible()).toBe(true)

            playbackEvents.dispatchProllToggle()
            expect(prollVisible()).toBe(true)
            expect(gridVisible()).toBe(false)
            expect(synthVisible()).toBe(false)
            expect(teVisible()).toBe(true)
        })
    })
})
