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
import ToolsPanel from '../src/ui/tools_panel.js'
import OutputPanel from '../src/ui/output_panel.js'

describe('Sub-panel toggle toolbars', () => {
    let trackEditor, noteEditor, toolsPanel, outputPanel

    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        soundRegistry.drumkitList = [
            { name: 'real', instruments: [{ key: 'KICK', url: 'real/kick.wav' }] }
        ]
        soundRegistry.sounds = {
            'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: {} }
        }
        serviceRegistry.mfCmd = { changeTrackSound: vi.fn() }

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
            transform: vi.fn(), rect: vi.fn(), clip: vi.fn()
        })

        trackEditor = new TrackEditor()
        trackEditor.init()
        noteEditor = new NoteEditor()
        noteEditor.init()
        toolsPanel = new ToolsPanel()
        toolsPanel.init()
        outputPanel = new OutputPanel()
        outputPanel.init()
    })

    describe('Track Editor', () => {
        it('renders all 5 tab buttons (FX, SND, MOD, LOOP, GEN)', () => {
            const mockTrack = { name: 'KICK', notes: [], nbBeats: 1, stepsPerBeat: 4 }
            trackEditor.show({ track: mockTrack, trackIdx: 0 })

            const tabs = document.getElementById('te-panel').querySelectorAll('.ne-tab-btn[data-ne-tab]')
            const keys = Array.from(tabs).map(b => b.dataset.neTab)
            expect(keys).toEqual(['fx', 'snd', 'mod', 'loop', 'gen'])
        })

        it('switches active tab when a button is clicked', () => {
            const mockTrack = { name: 'KICK', notes: [], nbBeats: 1, stepsPerBeat: 4 }
            trackEditor.show({ track: mockTrack, trackIdx: 0 })

            document.querySelector('#te-panel .ne-tab-btn[data-ne-tab="gen"]').click()
            const genPanel = document.querySelector('#te-panel .ne-tab-panel[data-tab-panel="gen"]')
            expect(getComputedStyle(genPanel).display).not.toBe('none')

            const fxPanel = document.querySelector('#te-panel .ne-tab-panel[data-tab-panel="fx"]')
            expect(getComputedStyle(fxPanel).display).toBe('none')
        })

        it('closes the panel when hide() is called', () => {
            const mockTrack = { name: 'KICK', notes: [], nbBeats: 1, stepsPerBeat: 4 }
            trackEditor.show({ track: mockTrack, trackIdx: 0 })

            const te = document.getElementById('te-panel')
            expect(te.style.display).toBe('block')
            trackEditor.hide()
            expect(te.style.display).toBe('none')
        })

        it('active tab panel is visible, others hidden', () => {
            const mockTrack = { name: 'KICK', notes: [], nbBeats: 1, stepsPerBeat: 4 }
            trackEditor.show({ track: mockTrack, trackIdx: 0 })

            const panels = document.querySelectorAll('#te-panel .ne-tab-panel[data-tab-panel]')
            const visiblePanels = Array.from(panels).filter(p => getComputedStyle(p).display !== 'none')
            expect(visiblePanels.length).toBe(1)
            expect(visiblePanels[0].dataset.tabPanel).toBe('fx')
        })
    })

    describe('Note Editor', () => {
        it('renders all controls for V/P/P, Trig, Retr, Arp', async () => {
             const mockNote = { beat: 0, beatStep: 0, velocity: 1 }
             const mockTrack = { name: 'SNARE', notes: [mockNote], nbBeats: 1, stepsPerBeat: 4 }
             await noteEditor.show({ track: mockTrack, note: mockNote, pos: 0, beat: 0, beatStep: 0 })

             const controls = document.getElementById('ne-panel').querySelectorAll('.ne-row')
             expect(controls.length).toBe(13)
         })
    })

    describe('Tools Panel', () => {
        it('renders all 5 tab buttons (Pattern, Export, Import, MIDI Status, MIDI)', () => {
            playbackEvents.dispatchToolsToggle(true)

            const tabs = document.getElementById('tools-panel').querySelectorAll('.ne-tab-btn[data-ne-tab]')
            const keys = Array.from(tabs).map(b => b.dataset.neTab)
            expect(keys).toEqual(['pattern', 'export', 'import', 'midi-status', 'midi'])
        })

        it('switches active tab when a button is clicked', () => {
            playbackEvents.dispatchToolsToggle(true)

            const tp = document.getElementById('tools-panel')
            const exportTab = tp.querySelector('.ne-tab-btn[data-ne-tab="export"]')
            exportTab.click()

            const exportPanel = tp.querySelector('.ne-tab-panel[data-tab-panel="export"]')
            expect(exportPanel.classList.contains('ne-tab-panel-hidden')).toBe(false)

            const patternPanel = tp.querySelector('.ne-tab-panel[data-tab-panel="pattern"]')
            expect(patternPanel.classList.contains('ne-tab-panel-hidden')).toBe(true)
        })

        it('closes the panel when the close button is clicked', () => {
            playbackEvents.dispatchToolsToggle(true)

            const tp = document.getElementById('tools-panel')
            expect(tp.style.display).toBe('block')
            tp.querySelector('.ne-close').click()
            expect(tp.style.display).toBe('none')
        })
    })

    describe('Output Panel', () => {
        it('renders all 4 tab buttons (Master, Comp, Flt, Spec)', () => {
            playbackEvents.dispatchOutputToggle(true)

            const tabs = document.getElementById('output-panel').querySelectorAll('.ne-tab-btn[data-ne-tab]')
            const keys = Array.from(tabs).map(b => b.dataset.neTab)
            expect(keys).toEqual(['master', 'compressor', 'filters', 'spectrum'])
        })

        it('switches active tab when a button is clicked', () => {
            playbackEvents.dispatchOutputToggle(true)

            const op = document.getElementById('output-panel')
            op.querySelector('.ne-tab-btn[data-ne-tab="compressor"]').click()

            const compPanel = op.querySelector('.ne-tab-panel[data-tab-panel="compressor"]')
            expect(compPanel.classList.contains('ne-tab-panel-hidden')).toBe(false)

            const masterPanel = op.querySelector('.ne-tab-panel[data-tab-panel="master"]')
            expect(masterPanel.classList.contains('ne-tab-panel-hidden')).toBe(true)
        })

        it('closes the panel when hidden', () => {
            playbackEvents.dispatchOutputToggle(true)

            const op = document.getElementById('output-panel')
            expect(op.style.display).toBe('block')
            op.style.display = 'none'
            expect(op.style.display).toBe('none')
        })
    })
})
