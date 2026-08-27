/**
 * @vitest-environment jsdom
 *
 * Validates that panels set the correct inline `style.display` after show/hide.
 * jsdom does not compute CSS, so `.workspace-panel { display: flex }` has no effect
 * unless the inline style also says `flex`. These tests catch mismatches between
 * the CSS class and the inline style that would break layout in a real browser.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import PianoRollPanel from '../src/ui/piano_roll_panel.js'
import PatternPanel from '../src/ui/pattern_panel.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import OutputPanel from '../src/ui/output_panel.js'
import AboutPanel from '../src/ui/about_panel.js'
import PatternsPanel from '../src/ui/patterns_panel.js'
import DrumkitManager from '../src/ui/drumkit_manager.js'

const TEST_PATTERN = {
    name: 'Test', nbBeats: 4, bpm: 120,
    tracks: [{
        name: 'KICK', notes: [], nbBeats: 4, stepsPerBeat: 4,
        soundId: 'NOT_DEFINED', useAutoAssignSound: true,
        mute: false, solo: false, velocity: 0.8, pan: 0, pitch: 0
    }]
}

function setupCanvas() {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        fillRect: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn(),
        putImageData: vi.fn(), createImageData: vi.fn(), setTransform: vi.fn(),
        drawImage: vi.fn(), save: vi.fn(), fillText: vi.fn(), restore: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
        stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
        arc: vi.fn(), fill: vi.fn(), measureText: vi.fn().mockReturnValue({ width: 0 }),
        transform: vi.fn(), rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn()
    })
}

describe('Panel display values (CSS invariant guard)', () => {
    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        appState.patterns = [structuredClone(TEST_PATTERN)]
        appState.selectedPatternNum = 0
        appState.selectedTrackNum = 0
        serviceRegistry.seq = { setBpm: vi.fn() }
        serviceRegistry.patterns = { computeFlatNotesFromPattern: vi.fn() }
        serviceRegistry.audioEngine = { invalidateCache: vi.fn(), syncAllTracks: vi.fn(), syncTrack: vi.fn() }
        document.body.innerHTML = ''
        setupCanvas()
    })

    describe('PianoRollPanel (workspace-panel → must be flex)', () => {
        it('show() sets display to flex, not block', () => {
            const p = new PianoRollPanel()
            p.init()
            p.show()
            expect(p.container.style.display).toBe('flex')
            expect(p.container.classList.contains('workspace-panel')).toBe(true)
        })

        it('hide() sets display to none', () => {
            const p = new PianoRollPanel()
            p.init()
            p.show()
            p.hide()
            expect(p.container.style.display).toBe('none')
        })

        it('init() leaves display as none', () => {
            const p = new PianoRollPanel()
            p.init()
            expect(p.container.style.display).toBe('none')
        })
    })

    describe('SynthEditor (workspace-panel → must be flex)', () => {
        it('showPanel sets display to flex', async () => {
            const te = new TrackEditor()
            te.init()
            te._track = appState.patterns[0].tracks[0]
            te._trackIdx = 0
            await te.synthEditor.showPanel()
            expect(te.synthEditor.panel.style.display).toBe('flex')
            expect(te.synthEditor.panel.classList.contains('workspace-panel')).toBe(true)
        })

        it('hidePanel sets display to none', async () => {
            const te = new TrackEditor()
            te.init()
            te._track = appState.patterns[0].tracks[0]
            te._trackIdx = 0
            await te.synthEditor.showPanel()
            te.synthEditor.hidePanel()
            expect(te.synthEditor.panel.style.display).toBe('none')
        })
    })

    describe('PatternPanel (workspace-panel → block is intentional)', () => {
        it('createDOM sets display to block (vertical stack, not flex)', () => {
            const p = new PatternPanel()
            p.init()
            expect(p.container.style.display).toBe('block')
            expect(p.container.classList.contains('workspace-panel')).toBe(true)
        })

        it('hide() sets display to none', () => {
            const p = new PatternPanel()
            p.init()
            p.hide()
            expect(p.container.style.display).toBe('none')
        })
    })

    describe('Non-workspace panels (must be block)', () => {
        it('TrackEditor show() sets display to block', () => {
            const te = new TrackEditor()
            te.init()
            te.show({ track: appState.patterns[0].tracks[0], trackIdx: 0 })
            expect(te.container.style.display).toBe('block')
            expect(te.container.classList.contains('workspace-panel')).toBe(false)
        })

        it('NoteEditor showInline() sets display to block', async () => {
            const ne = new NoteEditor()
            ne.init()
            await ne.showInline({ track: appState.patterns[0].tracks[0], trackIdx: 0, beat: 0, beatStep: 0 })
            expect(ne.container.style.display).toBe('block')
        })

        it('ToolsPanel show() sets display to block', () => {
            const tp = new ToolsPanel()
            tp.init()
            tp.show()
            expect(tp.container.style.display).toBe('block')
        })

        it('OutputPanel show() sets display to block', () => {
            const op = new OutputPanel()
            op.init()
            op.show()
            expect(op.container.style.display).toBe('block')
        })

        it('AboutPanel show() sets display to block', () => {
            const ap = new AboutPanel()
            ap.init()
            ap.show()
            expect(ap.container.style.display).toBe('block')
        })

        it('PatternsPanel show() sets display to block', () => {
            const pp = new PatternsPanel()
            pp.init()
            pp.show()
            expect(pp.container.style.display).toBe('block')
        })

        it('DrumkitManager show() sets display to block', () => {
            const dm = new DrumkitManager()
            dm.init()
            dm.show()
            expect(dm.container.style.display).toBe('block')
        })
    })

    describe('isVisible getter', () => {
        it('returns true when display is block', () => {
            const tp = new ToolsPanel()
            tp.init()
            tp.show()
            expect(tp.isVisible).toBe(true)
        })

        it('returns true when display is flex', () => {
            const p = new PianoRollPanel()
            p.init()
            p.show()
            expect(p.isVisible).toBe(true)
        })

        it('returns false when display is none', () => {
            const tp = new ToolsPanel()
            tp.init()
            expect(tp.isVisible).toBe(false)
        })
    })
})
