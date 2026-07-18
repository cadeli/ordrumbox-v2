/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import OutputPanel from '../src/ui/output_panel.js'

describe('Modal Interaction Flow (Mobile Landscape)', () => {
    let trackEditor, noteEditor, toolsPanel, outputPanel

    beforeEach(() => {
        // 1. Simulate Mobile Landscape
        global.window.innerWidth = 850
        global.window.innerHeight = 380
        
        // 2. Reset State
        appState.reset()
        document.body.innerHTML = ''

        // 3. Mock fetch for scales.json to avoid URL errors in JSDOM
        global.fetch = vi.fn().mockImplementation(() => 
            Promise.resolve({
                json: () => Promise.resolve({ "major": { "scaleSteps": [0, 2, 4, 5, 7, 9, 11] } })
            })
        )

        // 4. Mock canvas to avoid getContext errors
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(),
            clearRect: vi.fn(),
            getImageData: vi.fn(),
            putImageData: vi.fn(),
            createImageData: vi.fn(),
            setTransform: vi.fn(),
            drawImage: vi.fn(),
            save: vi.fn(),
            fillText: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            closePath: vi.fn(),
            stroke: vi.fn(),
            translate: vi.fn(),
            scale: vi.fn(),
            rotate: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            measureText: vi.fn().mockReturnValue({ width: 0 }),
            transform: vi.fn(),
            rect: vi.fn(),
            clip: vi.fn(),
        })

        // 5. Initialize Panels
        trackEditor = new TrackEditor()
        trackEditor.init()
        
        noteEditor = new NoteEditor()
        noteEditor.init()

        toolsPanel = new ToolsPanel()
        toolsPanel.init()

        outputPanel = new OutputPanel()
        outputPanel.init()
    })

    it('opens and closes the Track Editor', () => {
        const mockTrack = { name: 'KICK', notes: [], nbBeats: 1, stepsPerBeat: 4 }
        
        playbackEvents.dispatchTrackSelect({ track: mockTrack, trackIdx: 0 })
        
        const te = document.getElementById('te-panel')
        expect(te.style.display).toBe('block')

        const closeBtn = te.querySelector('.ne-close')
        closeBtn.click()

        expect(te.style.display).toBe('none')
    })

    it('opens and closes the Note Editor', async () => {
        const mockNote = { beat: 0, beatStep: 0, velocity: 1 }
        const mockTrack = { name: 'SNARE', notes: [mockNote], nbBeats: 1, stepsPerBeat: 4 }
        
        // Use await to wait for scale loading
        await noteEditor.show({ track: mockTrack, note: mockNote, pos: 0, beat: 0, beatStep: 0 })
        
        const ne = document.getElementById('ne-panel')
        expect(ne.style.display).toBe('block')

        const closeBtn = ne.querySelector('.ne-close')
        closeBtn.click()

        expect(ne.style.display).toBe('none')
    })

    it('opens and closes the Tools Panel', () => {
        playbackEvents.dispatchToolsToggle(true)
        
        const tp = document.getElementById('tools-panel')
        expect(tp.style.display).toBe('block')

        const closeBtn = tp.querySelector('.ne-close')
        closeBtn.click()

        expect(tp.style.display).toBe('none')
    })

    it('opens and closes the Output Panel', () => {
        playbackEvents.dispatchOutputToggle(true)

        const op = document.getElementById('output-panel')
        expect(op.style.display).toBe('block')

        const closeBtn = op.querySelector('.ne-close')
        closeBtn.click()

        expect(op.style.display).toBe('none')
    })

    it('ensures only one modal is visible at a time', () => {
        playbackEvents.dispatchToolsToggle(true)
        expect(document.getElementById('tools-panel').style.display).toBe('block')

        playbackEvents.dispatchOutputToggle(true)
        expect(document.getElementById('output-panel').style.display).toBe('block')
        expect(document.getElementById('tools-panel').style.display).toBe('none')

        const mockTrack = { name: 'KICK', notes: [], nbBeats: 1, stepsPerBeat: 4 }
        playbackEvents.dispatchTrackSelect({ track: mockTrack, trackIdx: 0 })
        expect(document.getElementById('te-panel').style.display).toBe('block')
        expect(document.getElementById('output-panel').style.display).toBe('none')
    })
})
