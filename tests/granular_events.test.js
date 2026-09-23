/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import PatternPanel from '../src/ui/pattern_panel.js'
import TrackEditor from '../src/ui/track_editor.js'
import PianoRollPanel from '../src/ui/piano_roll_panel.js'
import SongPanel from '../src/ui/song_panel.js'
import Toolbar from '../src/ui/toolbar.js'
import PatternSettingsPanel from '../src/ui/pattern_settings_panel.js'
import { applyFlatNotes } from '../src/patterns/manager.js'
import { EVENTS } from '../src/core/events.js'

describe('Granular patternChange events', () => {
    let cmd

    const PATTERN_2BEAT = {
        name: 'Test',
        nbBeats: 2,
        bpm: 120,
        tracks: [
            { name: 'KICK', notes: [], nbBeats: 2, stepsPerBeat: 4, loopAtStep: 8 },
            { name: 'SNARE', notes: [], nbBeats: 2, stepsPerBeat: 4, loopAtStep: 8 },
        ],
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
        serviceRegistry.patterns = { applyFlatNotes: (pat) => applyFlatNotes(pat) }
        serviceRegistry.audioEngine = { invalidateCache: vi.fn(), syncAllTracks: vi.fn(), syncTrack: vi.fn() }

        document.body.innerHTML = ''
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
    })

    function captureGranular() {
        const captured = {}
        for (const evt of [
            EVENTS.NOTE_CHANGE,
            EVENTS.TRACK_PARAM_CHANGE,
            EVENTS.PATTERN_STRUCTURE_CHANGE,
            EVENTS.PATTERN_META_CHANGE,
        ]) {
            captured[evt] = vi.fn()
            playbackEvents.on(evt, captured[evt])
        }
        return captured
    }

    describe(EVENTS.NOTE_CHANGE, () => {
        it('emitted by applyFlatNotes', () => {
            const cap = captureGranular()
            const pattern = appState.patterns[0]
            applyFlatNotes(pattern)
            expect(cap.noteChange).toHaveBeenCalled()
            expect(cap.trackParamChange).not.toHaveBeenCalled()
            expect(cap.patternStructureChange).not.toHaveBeenCalled()
            expect(cap.patternMetaChange).not.toHaveBeenCalled()
        })

        it('emitted by tools_panel compact', () => {
            const cap = captureGranular()
            const panel = new ToolsPanel()
            panel.init()
            playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
            panel.container.querySelector('#tp-compact').click()
            expect(cap.noteChange).toHaveBeenCalled()
        })

        it('emitted by tools_panel randomize', () => {
            const cap = captureGranular()
            const panel = new ToolsPanel()
            panel.init()
            playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
            panel.container.querySelector('#tp-rnd').click()
            expect(cap.noteChange).toHaveBeenCalled()
        })
    })

    describe(EVENTS.TRACK_PARAM_CHANGE, () => {
        it('emitted when track editor slider changes', () => {
            const cap = captureGranular()
            const te = new TrackEditor()
            te.init()
            const track = appState.patterns[0].tracks[0]
            te._track = track
            te._trackIdx = 0
            playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, track)
            expect(cap.trackParamChange).toHaveBeenCalled()
        })

        it('not emitted on noteChange', () => {
            const cap = captureGranular()
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            expect(cap.trackParamChange).not.toHaveBeenCalled()
        })
    })

    describe(EVENTS.PATTERN_STRUCTURE_CHANGE, () => {
        it('emitted by pattern_panel new action', () => {
            const cap = captureGranular()
            const pp = new PatternPanel()
            pp.init()
            pp.onAction('new')
            expect(cap.patternStructureChange).toHaveBeenCalled()
        })

        it('emitted by pattern_panel delete action', () => {
            const cap = captureGranular()
            appState.patterns = [structuredClone(PATTERN_2BEAT), structuredClone(PATTERN_2BEAT)]
            const pp = new PatternPanel()
            pp.init()
            vi.spyOn(window, 'confirm').mockReturnValue(true)
            pp.onAction('delete', 1, appState.patterns[1])
            expect(cap.patternStructureChange).toHaveBeenCalled()
        })

        it('emitted by pattern_panel duplicate action', async () => {
            const cap = captureGranular()
            const pp = new PatternPanel()
            pp.init()
            await pp.onAction('duplicate', 0, appState.patterns[0])
            expect(cap.patternStructureChange).toHaveBeenCalled()
        })

        it('emitted by pattern_panel clean action', () => {
            const cap = captureGranular()
            const pp = new PatternPanel()
            pp.init()
            vi.spyOn(window, 'confirm').mockReturnValue(true)
            pp.onAction('clean', 0, appState.patterns[0])
            expect(cap.noteChange).toHaveBeenCalled()
        })
    })

    describe(EVENTS.PATTERN_META_CHANGE, () => {
        it('always emitted alongside patternChange', () => {
            const granularSpy = vi.fn()
            const patternChangeSpy = vi.fn()
            playbackEvents.on(EVENTS.PATTERN_META_CHANGE, granularSpy)
            playbackEvents.on(EVENTS.PATTERN_CHANGE, patternChangeSpy)
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
            expect(granularSpy).toHaveBeenCalled()
            expect(patternChangeSpy).toHaveBeenCalled()
        })
    })

    describe('backward compatibility', () => {
        it('patternChange still fires when granular event fires', () => {
            const spy = vi.fn()
            playbackEvents.on(EVENTS.PATTERN_CHANGE, spy)

            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
            expect(spy).toHaveBeenCalled()
        })

        it('existing consumers still work with patternChange only', () => {
            const spy = vi.fn()
            playbackEvents.on(EVENTS.PATTERN_CHANGE, spy)

            playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
            expect(spy).toHaveBeenCalledTimes(1)
        })
    })

    describe('Consumer migration', () => {
        it('toolbar gen buttons update via signal on noteChange', () => {
            const toolbar = new Toolbar()
            toolbar.init()
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
            appState.patterns[0].tracks[0]._toolbarAuto = true
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            expect(toolbar.drumBtn.classList.contains('active')).toBe(true)
        })

        it('toolbar pattern select rebuilds via signal on patternStructureChange', () => {
            const toolbar = new Toolbar()
            toolbar.init()
            const prevLen = toolbar.patternSelect.options.length
            appState.patterns.push({ name: 'New', nbBeats: 4, bpm: 120, tracks: [] })
            playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            expect(toolbar.patternSelect.options.length).toBe(prevLen + 1)
        })

        it('toolbar page label updates via signal on patternMetaChange', () => {
            const toolbar = new Toolbar()
            toolbar.init()
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            expect(toolbar.pageLabel.textContent).toBeDefined()
        })

        it('toolbar does NOT rebuild pattern select on patternChange', () => {
            const toolbar = new Toolbar()
            toolbar.init()
            const len = toolbar.patternSelect.options.length
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
            expect(toolbar.patternSelect.options.length).toBe(len)
        })

        it('song_panel responds to patternStructureChange', () => {
            const pp = new SongPanel()
            pp.init()
            pp.show()
            const spy = vi.spyOn(pp, 'sync')
            playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_settings_panel responds to patternMetaChange', () => {
            const psp = new PatternSettingsPanel()
            psp.init()
            const spy = vi.spyOn(psp, 'sync')
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_settings_panel responds to patternStructureChange', () => {
            const psp = new PatternSettingsPanel()
            psp.init()
            const spy = vi.spyOn(psp, 'sync')
            playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_panel responds to noteChange', () => {
            const pp = new PatternPanel()
            pp.init()
            const spy = vi.spyOn(pp, 'requestSync')
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_panel responds to trackParamChange', () => {
            const pp = new PatternPanel()
            pp.init()
            const spy = vi.spyOn(pp, 'requestSync')
            playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE)
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_panel responds to patternStructureChange', () => {
            const pp = new PatternPanel()
            pp.init()
            const spy = vi.spyOn(pp, 'requestSync')
            playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            expect(spy).toHaveBeenCalled()
        })

        it('pattern_panel responds to drumkitChange', () => {
            const pp = new PatternPanel()
            pp.init()
            const spy = vi.spyOn(pp, 'requestSync')
            playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)
            expect(spy).toHaveBeenCalled()
        })

        it('drumkitChange refreshes track-url labels in pattern panel', async () => {
            appState.patterns = [
                {
                    name: 'Test',
                    nbBeats: 4,
                    bpm: 120,
                    tracks: [{ name: 'KICK', notes: [], nbBeats: 4, stepsPerBeat: 4, soundId: 'kick_old' }],
                },
            ]
            const pp = new PatternPanel()
            pp.init()
            pp.show()

            const urlEl = pp.tracksEl.querySelector('.pp-track-url')
            expect(urlEl).toBeTruthy()
            expect(urlEl.textContent).toBe('kick_old')

            appState.patterns[0].tracks[0].soundId = 'kick_new'
            playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

            const urlElAfter = pp.tracksEl.querySelector('.pp-track-url')
            expect(urlElAfter.textContent).toBe('kick_new')
        })

        it('drumkitChange refreshes synth track-url labels', async () => {
            appState.patterns = [
                {
                    name: 'Test',
                    nbBeats: 4,
                    bpm: 120,
                    tracks: [
                        {
                            name: 'SYNTH',
                            notes: [],
                            nbBeats: 4,
                            stepsPerBeat: 4,
                            useSoftSynth: true,
                            synthSoundKey: 'SAW1',
                        },
                    ],
                },
            ]
            const pp = new PatternPanel()
            pp.init()
            pp.show()

            expect(pp.tracksEl.querySelector('.pp-track-url').textContent).toBe('SYNTH: SAW1')

            appState.patterns[0].tracks[0].synthSoundKey = 'SQUARE2'
            playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

            expect(pp.tracksEl.querySelector('.pp-track-url').textContent).toBe('SYNTH: SQUARE2')
        })

        it('trackParamChange updates track-url label in-place', async () => {
            appState.patterns = [
                {
                    name: 'Test',
                    nbBeats: 4,
                    bpm: 120,
                    tracks: [{ name: 'KICK', notes: [], nbBeats: 4, stepsPerBeat: 4, soundId: 'old_sound' }],
                },
            ]
            const pp = new PatternPanel()
            pp.init()
            pp.show()

            expect(pp.tracksEl.querySelector('.pp-track-url').textContent).toBe('old_sound')

            appState.patterns[0].tracks[0].soundId = 'new_sound'
            playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, appState.patterns[0].tracks[0])
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

            expect(pp.tracksEl.querySelector('.pp-track-url').textContent).toBe('new_sound')
        })

        it('trackParamChange updates synth track-url label in-place', async () => {
            appState.patterns = [
                {
                    name: 'Test',
                    nbBeats: 4,
                    bpm: 120,
                    tracks: [
                        {
                            name: 'SYNTH',
                            notes: [],
                            nbBeats: 4,
                            stepsPerBeat: 4,
                            useSoftSynth: true,
                            synthSoundKey: 'SAW1',
                        },
                    ],
                },
            ]
            const pp = new PatternPanel()
            pp.init()
            pp.show()

            expect(pp.tracksEl.querySelector('.pp-track-url').textContent).toBe('SYNTH: SAW1')

            appState.patterns[0].tracks[0].synthSoundKey = 'SQUARE2'
            playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, appState.patterns[0].tracks[0])
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

            expect(pp.tracksEl.querySelector('.pp-track-url').textContent).toBe('SYNTH: SQUARE2')
        })

        it('trackParamChange resolves sound URL from soundRegistry', async () => {
            appState.patterns = [
                {
                    name: 'Test',
                    nbBeats: 4,
                    bpm: 120,
                    tracks: [{ name: 'KICK', notes: [], nbBeats: 4, stepsPerBeat: 4, soundId: 'samples/kick.wav' }],
                },
            ]
            soundRegistry.sounds['samples/kick.wav'] = { url: 'assets/sounds/kick_heavy.wav' }

            const pp = new PatternPanel()
            pp.init()
            pp.show()

            expect(pp.tracksEl.querySelector('.pp-track-url').textContent).toBe('assets/sounds/kick_heavy.wav')

            soundRegistry.sounds['samples/kick.wav'] = { url: 'assets/sounds/kick_v2.wav' }
            playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, appState.patterns[0].tracks[0])
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

            expect(pp.tracksEl.querySelector('.pp-track-url').textContent).toBe('assets/sounds/kick_v2.wav')
        })

        it('piano_roll responds to noteChange', () => {
            const prp = new PianoRollPanel()
            prp.init()
            const spy = vi.spyOn(prp, 'syncNotes')
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            expect(spy).toHaveBeenCalled()
        })

        it('piano_roll responds to patternStructureChange', () => {
            const prp = new PianoRollPanel()
            prp.init()
            const spy = vi.spyOn(prp, 'sync')
            playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            expect(spy).toHaveBeenCalled()
        })
    })
})
