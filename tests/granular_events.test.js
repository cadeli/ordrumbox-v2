/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { EVENT } from '../src/state/events.js'
import Commander from '../src/logic/commands/cmd.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import PatternPanel from '../src/ui/pattern_panel.js'
import NoteEditor from '../src/ui/note_editor.js'
import TrackEditor from '../src/ui/track_editor.js'
import PianoRollPanel from '../src/ui/piano_roll_panel.js'
import PatternsPanel from '../src/ui/patterns_panel.js'
import Toolbar from '../src/ui/toolbar.js'
import PatternSettingsPanel from '../src/ui/pattern_settings_panel.js'
import { computeFlatNotesFromPattern } from '../src/patterns/manager.js'

describe('Granular patternChange events', () => {
    let cmd

    const PATTERN_2BEAT = {
        name: 'Test', nbBeats: 2, bpm: 120,
        tracks: [
            { name: 'KICK', notes: [], nbBeats: 2, stepsPerBeat: 4, loopAtStep: 8 },
            { name: 'SNARE', notes: [], nbBeats: 2, stepsPerBeat: 4, loopAtStep: 8 },
        ]
    }

    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        appState.patterns = [structuredClone(PATTERN_2BEAT)]
        appState.selectedPatternNum = 0
        appState.currentPage = 0

        cmd = new Commander()
        serviceRegistry.cmd = cmd
        serviceRegistry.seq = { setBpm: vi.fn() }
        serviceRegistry.patterns = { computeFlatNotesFromPattern: vi.fn() }
        serviceRegistry.audioEngine = { invalidateCache: vi.fn(), syncAllTracks: vi.fn(), syncTrack: vi.fn() }

        document.body.innerHTML = ''
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn(),
            putImageData: vi.fn(), createImageData: vi.fn(), setTransform: vi.fn(),
            drawImage: vi.fn(), save: vi.fn(), fillText: vi.fn(), restore: vi.fn(),
            beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
            stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
            arc: vi.fn(), fill: vi.fn(), measureText: vi.fn().mockReturnValue({ width: 0 }),
            transform: vi.fn(), rect: vi.fn(), clip: vi.fn()
        })
    })

    function captureGranular() {
        const captured = {}
        for (const evt of ['noteChange', 'trackParamChange', 'patternStructureChange', 'patternMetaChange']) {
            captured[evt] = vi.fn()
            playbackEvents.on(evt, captured[evt])
        }
        return captured
    }

    describe('noteChange', () => {
        it('emitted by computeFlatNotesFromPattern', () => {
            const cap = captureGranular()
            const pattern = appState.patterns[0]
            computeFlatNotesFromPattern(pattern)
            expect(cap.noteChange).toHaveBeenCalled()
            expect(cap.trackParamChange).not.toHaveBeenCalled()
            expect(cap.patternStructureChange).not.toHaveBeenCalled()
            expect(cap.patternMetaChange).not.toHaveBeenCalled()
        })

        it('emitted by tools_panel compact', () => {
            const cap = captureGranular()
            const panel = new ToolsPanel()
            panel.init()
            playbackEvents.emit("toolsToggle", true)
            panel.container.querySelector('#tp-compact').click()
            expect(cap.noteChange).toHaveBeenCalled()
        })

        it('emitted by tools_panel randomize', () => {
            const cap = captureGranular()
            const panel = new ToolsPanel()
            panel.init()
            playbackEvents.emit("toolsToggle", true)
            panel.container.querySelector('#tp-rnd').click()
            expect(cap.noteChange).toHaveBeenCalled()
        })
    })

    describe('trackParamChange', () => {
        it('emitted when track editor slider changes', () => {
            const cap = captureGranular()
            const te = new TrackEditor()
            te.init()
            const track = appState.patterns[0].tracks[0]
            te._track = track
            te._trackIdx = 0
            playbackEvents.emit('trackParamChange', track)
            expect(cap.trackParamChange).toHaveBeenCalled()
        })

        it('not emitted on noteChange', () => {
            const cap = captureGranular()
            playbackEvents.emit('noteChange')
            expect(cap.trackParamChange).not.toHaveBeenCalled()
        })
    })

    describe('patternStructureChange', () => {
        it('emitted by patterns_panel add pattern', () => {
            const cap = captureGranular()
            const pp = new PatternsPanel()
            pp.init()
            playbackEvents.emit("patternsToggle", true)
            pp.container.querySelector('#pp-add').click()
            expect(cap.patternStructureChange).toHaveBeenCalled()
        })

        it('emitted by pattern_panel delete action', () => {
            const cap = captureGranular()
            appState.patterns = [
                structuredClone(PATTERN_2BEAT),
                structuredClone(PATTERN_2BEAT)
            ]
            const pp = new PatternPanel()
            pp.init()
            vi.spyOn(window, 'confirm').mockReturnValue(true)
            pp._onAction('delete', 1, appState.patterns[1])
            expect(cap.patternStructureChange).toHaveBeenCalled()
        })

        it('emitted by pattern_panel duplicate action', async () => {
            const cap = captureGranular()
            const pp = new PatternPanel()
            pp.init()
            await pp._onAction('duplicate', 0, appState.patterns[0])
            expect(cap.patternStructureChange).toHaveBeenCalled()
        })

        it('emitted by pattern_panel clean action', () => {
            const cap = captureGranular()
            const pp = new PatternPanel()
            pp.init()
            vi.spyOn(window, 'confirm').mockReturnValue(true)
            pp._onAction('clean', 0, appState.patterns[0])
            expect(cap.noteChange).toHaveBeenCalled()
        })
    })

    describe('patternMetaChange', () => {
        it('always emitted alongside patternChange', () => {
            const granularSpy = vi.fn()
            const patternChangeSpy = vi.fn()
            playbackEvents.on('patternMetaChange', granularSpy)
            playbackEvents.on('patternChange', patternChangeSpy)
            playbackEvents.emit('patternMetaChange')
            playbackEvents.emit('patternChange')
            expect(granularSpy).toHaveBeenCalled()
            expect(patternChangeSpy).toHaveBeenCalled()
        })
    })

    describe('backward compatibility', () => {
        it('patternChange still fires when granular event fires', () => {
            const spy = vi.fn()
            playbackEvents.on('patternChange', spy)

            playbackEvents.emit('noteChange')
            playbackEvents.emit('patternChange')
            expect(spy).toHaveBeenCalled()
        })

        it('existing consumers still work with patternChange only', () => {
            const spy = vi.fn()
            playbackEvents.on('patternChange', spy)

            playbackEvents.emit('trackParamChange')
            playbackEvents.emit('patternChange')
            expect(spy).toHaveBeenCalledTimes(1)
        })
    })

    describe('EVENT constants', () => {
        it('has correct string values', () => {
            expect(EVENT.NOTE_CHANGE).toBe('noteChange')
            expect(EVENT.TRACK_PARAM_CHANGE).toBe('trackParamChange')
            expect(EVENT.PATTERN_STRUCTURE_CHANGE).toBe('patternStructureChange')
            expect(EVENT.PATTERN_META_CHANGE).toBe('patternMetaChange')
            expect(EVENT.PATTERN_CHANGE).toBe('patternChange')
        })

        it('events are frozen', () => {
            expect(Object.isFrozen(EVENT)).toBe(true)
        })
    })

    describe('Consumer migration', () => {
        it('toolbar responds to noteChange (gen buttons sync)', () => {
            const toolbar = new Toolbar()
            toolbar.init()
            const spy = vi.spyOn(toolbar, 'syncGenButtons')
            playbackEvents.emit('noteChange')
            expect(spy).toHaveBeenCalled()
        })

        it('toolbar responds to patternStructureChange (pattern list sync)', () => {
            const toolbar = new Toolbar()
            toolbar.init()
            const spy = vi.spyOn(toolbar, 'syncPatterns')
            playbackEvents.emit('patternStructureChange')
            expect(spy).toHaveBeenCalled()
        })

        it('toolbar responds to patternMetaChange (page sync)', () => {
            const toolbar = new Toolbar()
            toolbar.init()
            const spy = vi.spyOn(toolbar, 'syncPage')
            playbackEvents.emit('patternMetaChange')
            expect(spy).toHaveBeenCalled()
        })

        it('toolbar does NOT sync on patternChange anymore', () => {
            const toolbar = new Toolbar()
            toolbar.init()
            const spyGen = vi.spyOn(toolbar, 'syncGenButtons')
            const spyPatterns = vi.spyOn(toolbar, 'syncPatterns')
            const spyPage = vi.spyOn(toolbar, 'syncPage')
            playbackEvents.emit('patternChange')
            expect(spyGen).not.toHaveBeenCalled()
            expect(spyPatterns).not.toHaveBeenCalled()
            expect(spyPage).not.toHaveBeenCalled()
        })

        it('patterns_panel responds to patternStructureChange', () => {
            const pp = new PatternsPanel()
            pp.init()
            pp.show()
            const spy = vi.spyOn(pp, 'sync')
            playbackEvents.emit('patternStructureChange')
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_settings_panel responds to patternMetaChange', () => {
            const psp = new PatternSettingsPanel()
            psp.init()
            const spy = vi.spyOn(psp, 'sync')
            playbackEvents.emit('patternMetaChange')
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_settings_panel responds to patternStructureChange', () => {
            const psp = new PatternSettingsPanel()
            psp.init()
            const spy = vi.spyOn(psp, 'sync')
            playbackEvents.emit('patternStructureChange')
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_panel responds to noteChange', () => {
            const pp = new PatternPanel()
            pp.init()
            const spy = vi.spyOn(pp, 'requestSync')
            playbackEvents.emit('noteChange')
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_panel responds to trackParamChange', () => {
            const pp = new PatternPanel()
            pp.init()
            const spy = vi.spyOn(pp, 'requestSync')
            playbackEvents.emit('trackParamChange')
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_panel responds to patternStructureChange', () => {
            const pp = new PatternPanel()
            pp.init()
            const spy = vi.spyOn(pp, 'requestSync')
            playbackEvents.emit('patternStructureChange')
            expect(spy).toHaveBeenCalled()
        })

        it('piano_roll responds to noteChange', () => {
            const prp = new PianoRollPanel()
            prp.init()
            const spy = vi.spyOn(prp, '_sync')
            playbackEvents.emit('noteChange')
            expect(spy).toHaveBeenCalled()
        })

        it('piano_roll responds to patternStructureChange', () => {
            const prp = new PianoRollPanel()
            prp.init()
            const spy = vi.spyOn(prp, '_sync')
            playbackEvents.emit('patternStructureChange')
            expect(spy).toHaveBeenCalled()
        })
    })
})
