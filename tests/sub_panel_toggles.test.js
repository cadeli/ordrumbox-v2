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
        it('renders all 6 toggle buttons (Basic, Lvl, Flt, FX, Snd, Lp)', () => {
            const mockTrack = { name: 'KICK', notes: [], bars: 1, barQuantize: 4 }
            playbackEvents.dispatchTrackSelect({ track: mockTrack, trackIdx: 0 })

            const toggles = document.getElementById('te-panel').querySelectorAll('.ne-toggle[data-toggle]')
            const keys = Array.from(toggles).map(b => b.dataset.toggle)
            expect(keys).toEqual(['basic', 'levels', 'filters', 'effects', 'sound', 'loop'])
        })

        it('toggles panel visibility when a button is clicked', () => {
            const mockTrack = { name: 'KICK', notes: [], bars: 1, barQuantize: 4 }
            playbackEvents.dispatchTrackSelect({ track: mockTrack, trackIdx: 0 })

            expect(appState.trackEditorVisibility.basic).toBe(true)
            document.querySelector('#te-panel .ne-toggle[data-toggle="basic"]').click()
            expect(appState.trackEditorVisibility.basic).toBe(false)
            document.querySelector('#te-panel .ne-toggle[data-toggle="basic"]').click()
            expect(appState.trackEditorVisibility.basic).toBe(true)
        })

        it('closes the panel when the close button is clicked', () => {
            const mockTrack = { name: 'KICK', notes: [], bars: 1, barQuantize: 4 }
            playbackEvents.dispatchTrackSelect({ track: mockTrack, trackIdx: 0 })

            const te = document.getElementById('te-panel')
            expect(te.style.display).toBe('block')
            te.querySelector('.ne-close').click()
            expect(te.style.display).toBe('none')
        })
    })

    describe('Note Editor', () => {
        it('renders all 4 toggle buttons (V/P/P, Trig, Retr, Arp)', async () => {
            const mockNote = { bar: 0, barStep: 0, velocity: 1 }
            const mockTrack = { name: 'SNARE', notes: [mockNote], bars: 1, barQuantize: 4 }
            await noteEditor.show({ track: mockTrack, note: mockNote, pos: 0, bar: 0, barStep: 0 })

            const toggles = document.getElementById('ne-panel').querySelectorAll('.ne-toggle[data-toggle]')
            const keys = Array.from(toggles).map(b => b.dataset.toggle)
            expect(keys).toEqual(['levels', 'triggers', 'retrig', 'arp'])
        })

        it('toggles panel visibility when a button is clicked', async () => {
            const mockNote = { bar: 0, barStep: 0, velocity: 1 }
            const mockTrack = { name: 'SNARE', notes: [mockNote], bars: 1, barQuantize: 4 }
            await noteEditor.show({ track: mockTrack, note: mockNote, pos: 0, bar: 0, barStep: 0 })

            const wasActive = appState.noteEditorVisibility.levels
            document.querySelector('#ne-panel .ne-toggle[data-toggle="levels"]').click()
            expect(appState.noteEditorVisibility.levels).toBe(!wasActive)
        })

        it('closes the panel when the close button is clicked', async () => {
            const mockNote = { bar: 0, barStep: 0, velocity: 1 }
            const mockTrack = { name: 'SNARE', notes: [mockNote], bars: 1, barQuantize: 4 }
            await noteEditor.show({ track: mockTrack, note: mockNote, pos: 0, bar: 0, barStep: 0 })

            const ne = document.getElementById('ne-panel')
            expect(ne.style.display).toBe('block')
            ne.querySelector('.ne-close').click()
            expect(ne.style.display).toBe('none')
        })
    })

    describe('Tools Panel', () => {
        it('renders all 4 toggle buttons (Pattern, Export, Import, MIDI)', () => {
            playbackEvents.dispatchToolsToggle(true)

            const toggles = document.getElementById('tools-panel').querySelectorAll('.ne-toggle[data-toggle]')
            const keys = Array.from(toggles).map(b => b.dataset.toggle)
            expect(keys).toEqual(['pattern', 'export', 'import', 'midi'])
        })

        it('hides the corresponding group when a toggle is clicked', () => {
            playbackEvents.dispatchToolsToggle(true)

            const tp = document.getElementById('tools-panel')
            const groupsBefore = tp.querySelectorAll('.ne-body > .ne-group')
            expect(groupsBefore[0].style.display).not.toBe('none')

            tp.querySelector('.ne-toggle[data-toggle="pattern"]').click()
            const groupsAfter = tp.querySelectorAll('.ne-body > .ne-group')
            expect(groupsAfter[0].style.display).toBe('none')

            tp.querySelector('.ne-toggle[data-toggle="pattern"]').click()
            const groupsRestored = tp.querySelectorAll('.ne-body > .ne-group')
            expect(groupsRestored[0].style.display).toBe('')
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
        it('renders all 4 toggle buttons (Master, Flt, Comp, Spec)', () => {
            playbackEvents.dispatchOutputToggle(true)

            const toggles = document.getElementById('output-panel').querySelectorAll('.ne-toggle[data-toggle]')
            const keys = Array.from(toggles).map(b => b.dataset.toggle)
            expect(keys).toEqual(['master', 'filters', 'compressor', 'spectrum'])
        })

        it('hides the corresponding element when a toggle is clicked', () => {
            playbackEvents.dispatchOutputToggle(true)

            const op = document.getElementById('output-panel')
            const master = op.querySelector('#op-master-vol')
            expect(master.style.display).not.toBe('none')

            op.querySelector('.ne-toggle[data-toggle="master"]').click()
            expect(master.style.display).toBe('none')

            op.querySelector('.ne-toggle[data-toggle="master"]').click()
            expect(master.style.display).toBe('')
        })

        it('closes the panel when the close button is clicked', () => {
            playbackEvents.dispatchOutputToggle(true)

            const op = document.getElementById('output-panel')
            expect(op.style.display).toBe('block')
            op.querySelector('.ne-close').click()
            expect(op.style.display).toBe('none')
        })
    })
})
