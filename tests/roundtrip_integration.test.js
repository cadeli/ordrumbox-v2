/**
 * @vitest-environment jsdom
 *
 * Roundtrip integration tests — exercises multiple layers at once
 * to verify weak zones are covered indirectly.
 *
 * 1. Command → Pattern → State lifecycle
 * 2. Event Bus roundtrip
 * 3. Panel show/hide mutual exclusion
 * 4. Transport → Player tick chain
 * 5. Pattern rendering roundtrip
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import MfCmd from '../src/logic/commands/cmd.js'
import { TICK } from '../src/core/constants.js'

// ─── Shared state cleanup ────────────────────────────────────────────────

function cleanState() {
    appState.patterns.length = 0
    appState.selectedPatternNum = 0
    appState.selectedTrackNum = 0
    for (const key of Object.keys(playbackEvents)) {
        if (Array.isArray(playbackEvents[key])) {
            playbackEvents[key].length = 0
        }
    }
}

// ─── 1. Command → Pattern → State lifecycle ──────────────────────────────

describe('Roundtrip 1 — Command → Pattern → State lifecycle', () => {
    let cmd

    beforeEach(() => {
        cleanState()
        serviceRegistry.reset()
        soundRegistry.reset()
        cmd = new MfCmd()
    })

    it('creates pattern, adds tracks, adds notes, verifies state', () => {
        const pat = cmd.addPattern('TestR1')
        expect(appState.patterns).toContain(pat)
        expect(pat.name).toBe('TestR1')

        const track = cmd.addTrack(pat, 'KICK', 4)
        expect(pat.tracks).toContain(track)
        expect(track.name).toBe('KICK')
        expect(track.stepsPerBeat).toBe(4)

        const note1 = cmd.addNote(track, 0, 0, 0)
        const note2 = cmd.addNote(track, 0, 2, 3)
        expect(track.notes).toHaveLength(2)
        expect(note1.beat).toBe(0)
        expect(note1.beatStep).toBe(0)
        expect(note2.pitch).toBe(3)

        const found = cmd.isNoteAt(track, 0, 0)
        expect(found).toHaveLength(1)
        expect(found[0]).toBe(note1)
    })

    it('renames pattern, sets BPM, sets description', () => {
        const pat = cmd.addPattern('OrigName')
        cmd.renamePattern(0, 'NewName')
        expect(pat.name).toBe('NewName')

        cmd.setPatternBpm(pat, 140)
        expect(pat.bpm).toBe(140)

        cmd.setPatternDescription(pat, 'A test pattern')
        expect(pat.description).toBe('A test pattern')
    })

    it('removes pattern with min-1 guard', () => {
        cmd.addPattern('P1')
        cmd.addPattern('P2')
        expect(appState.patterns).toHaveLength(2)

        const ok = cmd.removePattern(0)
        expect(ok).toBe(true)
        expect(appState.patterns).toHaveLength(1)

        const fail = cmd.removePattern(0)
        expect(fail).toBe(false)
        expect(appState.patterns).toHaveLength(1)
    })

    it('getPatternByName is case-insensitive', () => {
        cmd.addPattern('MyPattern')
        expect(cmd.getPatternByName('mypattern')).not.toBeNull()
        expect(cmd.getPatternByName('NOTEXIST')).toBeNull()
    })

    it('addNote auto-increments steppc and pushes to notes array', () => {
        const pat = cmd.addPattern('NoteTest')
        const track = cmd.addTrack(pat, 'SNARE', 4)
        const note = cmd.addNote(track, 1, 3, -2)
        expect(note.steppc).toBe(75) // round((3*100)/4)
        expect(note.beat).toBe(1)
        expect(note.beatStep).toBe(3)
        expect(note.pitch).toBe(-2)
    })

    it('deleteNote removes the correct note', () => {
        const pat = cmd.addPattern('DelTest')
        const track = cmd.addTrack(pat, 'CLAP', 4)
        const n1 = cmd.addNote(track, 0, 0, 0)
        const n2 = cmd.addNote(track, 0, 1, 0)
        const n3 = cmd.addNote(track, 0, 2, 0)
        expect(track.notes).toHaveLength(3)

        cmd.deleteNote(track, n2)
        expect(track.notes).toHaveLength(2)
        expect(track.notes).toContain(n1)
        expect(track.notes).toContain(n3)
        expect(track.notes).not.toContain(n2)
    })

    it('updateTrack applies whitelisted keys and clamps values', () => {
        const pat = cmd.addPattern('UpdTest')
        const track = cmd.addTrack(pat, 'HIHAT', 4)
        cmd.updateTrack(track, { velocity: 0.5, pan: 0.8, pitch: -5 })
        expect(track.velocity).toBe(0.5)
        expect(track.pan).toBe(0.8)
        expect(track.pitch).toBe(-5)

        cmd.updateTrack(track, { velocity: 99 })
        expect(track.velocity).toBe(1)

        // Unknown keys are ignored
        cmd.updateTrack(track, { bogusKey: 42 })
        expect(track.bogusKey).toBeUndefined()
    })

    it('cleanTrack clears notes and resets loop point', () => {
        const pat = cmd.addPattern('CleanTest')
        const track = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(track, 0, 0, 0)
        cmd.addNote(track, 1, 0, 0)
        expect(track.notes).toHaveLength(2)

        cmd.cleanTrack(track)
        expect(track.notes).toHaveLength(0)
        expect(track.loopPointBeat).toBe(track.nbBeats)
        expect(track.loopPointStep).toBe(0)
    })

    it('cleanPattern clears all tracks', () => {
        const pat = cmd.addPattern('CleanAll')
        const t1 = cmd.addTrack(pat, 'KICK', 4)
        const t2 = cmd.addTrack(pat, 'SNARE', 4)
        cmd.addNote(t1, 0, 0, 0)
        cmd.addNote(t2, 0, 0, 0)

        cmd.cleanPattern(pat)
        expect(t1.notes).toHaveLength(0)
        expect(t2.notes).toHaveLength(0)
    })

    it('importPatternFromJson creates a full pattern from JSON', () => {
        const json = {
            name: 'Imported',
            tracks: [
                {
                    name: 'KICK',
                    nbBeats: 4,
                    stepsPerBeat: 4,
                    loopAtStep: 16,
                    notes: [
                        { beat: 0, beatStep: 0, pitch: 0, velocity: 0.9 },
                        { beat: 1, beatStep: 0, pitch: 0, velocity: 0.7 }
                    ]
                }
            ],
            bpm: 128,
            nbBeats: 4
        }
        const pat = cmd.importPatternFromJson(json)
        expect(pat.name).toBe('Imported')
        expect(pat.tracks).toHaveLength(1)
        expect(pat.tracks[0].notes).toHaveLength(2)
        expect(pat.bpm).toBe(128)
    })

    it('createPattern generates default name when none provided', () => {
        cmd.addPattern('Existing')
        const p = cmd.createPattern()
        expect(p.name).toMatch(/^NewPat_/)
    })

    it('full lifecycle: create → add tracks/notes → export → import roundtrip', () => {
        const pat = cmd.addPattern('Roundtrip')
        const t1 = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(t1, 0, 0, 0)
        cmd.addNote(t1, 1, 0, 5)
        const t2 = cmd.addTrack(pat, 'SNARE', 4)
        cmd.addNote(t2, 2, 0, -3)

        const json = {
            name: pat.name + '_copy',
            tracks: pat.tracks.map(trk => ({
                name: trk.name,
                nbBeats: trk.nbBeats,
                stepsPerBeat: trk.stepsPerBeat,
                loopAtStep: trk.loopAtStep,
                notes: trk.notes.map(n => ({ ...n }))
            })),
            bpm: pat.bpm,
            nbBeats: pat.nbBeats
        }

        const imported = cmd.importPatternFromJson(json)
        expect(imported.tracks).toHaveLength(2)
        expect(imported.tracks[0].notes).toHaveLength(2)
        expect(imported.tracks[1].notes).toHaveLength(1)
        expect(imported.tracks[1].notes[0].pitch).toBe(-3)
    })
})

// ─── 2. Event Bus roundtrip ──────────────────────────────────────────────

describe('Roundtrip 2 — Event Bus roundtrip', () => {
    beforeEach(() => {
        cleanState()
    })

    it('dispatch → multiple subscribers all receive the payload', () => {
        const spy1 = vi.fn()
        const spy2 = vi.fn()
        const spy3 = vi.fn()
        playbackEvents.onBpmChange.push(spy1, spy2, spy3)

        playbackEvents.dispatchBpmChange(140)

        expect(spy1).toHaveBeenCalledWith(140)
        expect(spy2).toHaveBeenCalledWith(140)
        expect(spy3).toHaveBeenCalledWith(140)
    })

    it('off removes the correct subscriber', () => {
        const spy1 = vi.fn()
        const spy2 = vi.fn()
        playbackEvents.onPatternChange.push(spy1, spy2)

        playbackEvents.dispatchPatternChange()
        expect(spy1).toHaveBeenCalledTimes(1)
        expect(spy2).toHaveBeenCalledTimes(1)

        playbackEvents.offPatternChange(spy1)
        playbackEvents.dispatchPatternChange()
        expect(spy1).toHaveBeenCalledTimes(1)
        expect(spy2).toHaveBeenCalledTimes(2)
    })

    it('multiple dispatches accumulate call count', () => {
        const spy = vi.fn()
        playbackEvents.onPlaybackStart.push(spy)

        playbackEvents.dispatchPlaybackStart()
        playbackEvents.dispatchPlaybackStart()
        playbackEvents.dispatchPlaybackStart()
        expect(spy).toHaveBeenCalledTimes(3)
    })

    it('dispatch with payload carries data through', () => {
        const spy = vi.fn()
        playbackEvents.onNoteTrigger.push(spy)

        const data = { trackIdx: 2, beat: 1, beatStep: 3 }
        playbackEvents.dispatchNoteTrigger(data)
        expect(spy).toHaveBeenCalledWith(data)
    })

    it('panel toggle events carry boolean payload', () => {
        const spyTools = vi.fn()
        const spyOutput = vi.fn()
        const spyAbout = vi.fn()
        const spyDM = vi.fn()
        playbackEvents.onToolsToggle.push(spyTools)
        playbackEvents.onOutputToggle.push(spyOutput)
        playbackEvents.onAboutToggle.push(spyAbout)
        playbackEvents.onDrumkitManagerToggle.push(spyDM)

        playbackEvents.dispatchToolsToggle(true)
        playbackEvents.dispatchOutputToggle(false)
        playbackEvents.dispatchAboutToggle(true)
        playbackEvents.dispatchDrumkitManagerToggle(false)

        expect(spyTools).toHaveBeenCalledWith(true)
        expect(spyOutput).toHaveBeenCalledWith(false)
        expect(spyAbout).toHaveBeenCalledWith(true)
        expect(spyDM).toHaveBeenCalledWith(false)
    })

    it('track select/deselect lifecycle', () => {
        const spy = vi.fn()
        playbackEvents.onTrackSelect.push(spy)

        playbackEvents.dispatchTrackSelect({ trackIdx: 0, track: {} })
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ trackIdx: 0 }))

        playbackEvents.dispatchTrackSelect(null)
        expect(spy).toHaveBeenCalledWith(null)
    })

    it('note select/deselect lifecycle', () => {
        const spy = vi.fn()
        playbackEvents.onNoteSelect.push(spy)

        playbackEvents.dispatchNoteSelect({ note: {}, beat: 0, beatStep: 1 })
        expect(spy).toHaveBeenCalledTimes(1)

        playbackEvents.dispatchNoteSelect(null)
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(null)
    })

    it('offAll cleans specific event channel', () => {
        const spy1 = vi.fn()
        const spy2 = vi.fn()
        playbackEvents.onDrumkitChange.push(spy1, spy2)

        playbackEvents.dispatchDrumkitChange()
        expect(spy1).toHaveBeenCalledTimes(1)

        playbackEvents.offDrumkitChange(spy1)
        playbackEvents.offDrumkitChange(spy2)
        expect(playbackEvents.onDrumkitChange).toHaveLength(0)

        playbackEvents.dispatchDrumkitChange()
        expect(spy1).toHaveBeenCalledTimes(1)
        expect(spy2).toHaveBeenCalledTimes(1)
    })

    it('BPM change roundtrip through event chain', () => {
        let receivedBpm = null
        playbackEvents.onBpmChange.push((bpm) => { receivedBpm = bpm })
        playbackEvents.dispatchBpmChange(140)
        expect(receivedBpm).toBe(140)

        playbackEvents.dispatchBpmChange(90)
        expect(receivedBpm).toBe(90)
    })
})

// ─── 3. Panel show/hide mutual exclusion ─────────────────────────────────
// @vitest-environment jsdom

describe('Roundtrip 3 — Panel show/hide mutual exclusion', () => {
    let BasePanel

    beforeEach(async () => {
        document.body.innerHTML = ''
        BasePanel = (await import('../src/ui/base_panel.js')).default
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('show() hides all other canonical panels', () => {
        const panelA = new BasePanel('te-panel')
        panelA.init()
        const panelB = new BasePanel('ne-panel')
        panelB.init()
        const panelC = new BasePanel('tools-panel')
        panelC.init()

        expect(panelA.container.style.display).toBe('none')
        expect(panelB.container.style.display).toBe('none')
        expect(panelC.container.style.display).toBe('none')

        panelA.show()
        expect(panelA.container.style.display).toBe('block')

        panelB.show()
        expect(panelB.container.style.display).toBe('block')
        expect(panelA.container.style.display).toBe('none')
    })

    it('hide() makes container invisible', () => {
        const panel = new BasePanel('tools-panel')
        panel.init()
        panel.show()
        expect(panel.container.style.display).toBe('block')

        panel.hide()
        expect(panel.container.style.display).toBe('none')
    })

    it('isVisible getter reflects state', () => {
        const panel = new BasePanel('output-panel')
        panel.init()
        expect(panel.isVisible).toBe(false)

        panel.show()
        expect(panel.isVisible).toBe(true)

        panel.hide()
        expect(panel.isVisible).toBe(false)
    })

    it('pattern-panel is unhidden when any panel shows', () => {
        const pp = document.createElement('div')
        pp.id = 'pattern-panel'
        pp.classList.add('ui-hidden')
        document.body.appendChild(pp)

        const panel = new BasePanel('about-panel')
        panel.init()
        panel.show()

        expect(pp.classList.contains('ui-hidden')).toBe(false)
    })

    it('showing a panel hides the previous one', () => {
        const panel1 = new BasePanel('dm-panel')
        panel1.init()
        const panel2 = new BasePanel('about-panel')
        panel2.init()

        panel1.show()
        expect(panel1.isVisible).toBe(true)

        panel2.show()
        expect(panel2.isVisible).toBe(true)
        expect(panel1.isVisible).toBe(false)
    })
})

// ─── 4. Transport → Player tick chain ────────────────────────────────────

describe('Roundtrip 4 — Transport → Player tick chain', () => {
    let Transport

    beforeEach(async () => {
        // Mock Worker for node environment
        globalThis.Worker = class MockWorker {
            constructor() {}
            postMessage() {}
            terminate() {}
        }
        Transport = (await import('../src/logic/transport/transport.js')).default
    })

    afterEach(() => {
        delete globalThis.Worker
    })

    it('start sets isRunning and resets tick', () => {
        const transport = new Transport({
            state: 'running', currentTime: 0, sampleRate: 44100,
        })
        transport.tick = 42
        transport.start()
        expect(transport.isRunning).toBe(true)
        expect(transport.tick).toBe(0)
    })

    it('stop sets isRunning to false', () => {
        const transport = new Transport({
            state: 'running', currentTime: 0, sampleRate: 44100,
        })
        transport.start()
        transport.stop()
        expect(transport.isRunning).toBe(false)
    })

    it('scheduler calls onSchedule for each step within lookahead', () => {
        const ctx = { state: 'running', currentTime: 0, sampleRate: 44100 }
        const transport = new Transport(ctx)
        const onScheduleSpy = vi.fn()
        transport.onSchedule = onScheduleSpy

        transport.start()
        transport.nextStepTime = ctx.currentTime
        transport.scheduleAheadTime = 1.0

        transport.scheduler()

        expect(onScheduleSpy).toHaveBeenCalled()
        const callCount = onScheduleSpy.mock.calls.length
        expect(callCount).toBeGreaterThan(0)

        for (const [tick, time] of onScheduleSpy.mock.calls) {
            expect(typeof tick).toBe('number')
            expect(typeof time).toBe('number')
        }
    })

    it('scheduler increments tick after each step', () => {
        const ctx = { state: 'running', currentTime: 0, sampleRate: 44100 }
        const transport = new Transport(ctx)
        transport.onSchedule = vi.fn()

        transport.start()
        transport.nextStepTime = ctx.currentTime
        transport.scheduleAheadTime = 0.5

        const tickBefore = transport.tick
        transport.scheduler()
        expect(transport.tick).toBeGreaterThan(tickBefore)
    })

    it('setBpm updates clockInterval and secondsPerBeat', () => {
        const ctx = { state: 'running', currentTime: 0, sampleRate: 44100 }
        const transport = new Transport(ctx)
        transport.setBpm(140)
        expect(transport.bpm).toBe(140)
        expect(transport.clockInterval).toBeCloseTo(60 / (140 * 24), 6)
        expect(appState.secondsPerBeat).toBeCloseTo(60 * 4 / (140 * TICK), 6)
    })

    it('onSchedule receives monotonically increasing ticks', () => {
        const ctx = { state: 'running', currentTime: 0, sampleRate: 44100 }
        const transport = new Transport(ctx)
        const onScheduleSpy = vi.fn()
        transport.onSchedule = onScheduleSpy

        transport.start()
        transport.nextStepTime = ctx.currentTime
        transport.scheduleAheadTime = 1.0

        transport.scheduler()

        const ticks = onScheduleSpy.mock.calls.map(c => c[0])
        for (let i = 1; i < ticks.length; i++) {
            expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
        }
    })

    it('scheduler does NOT call onSchedule when stopped', () => {
        const ctx = { state: 'running', currentTime: 0, sampleRate: 44100 }
        const transport = new Transport(ctx)
        const onScheduleSpy = vi.fn()
        transport.onSchedule = onScheduleSpy

        transport.start()
        transport.stop()
        transport.nextStepTime = ctx.currentTime
        transport.scheduleAheadTime = 1.0

        onScheduleSpy.mockClear()
        transport.scheduler()

        expect(onScheduleSpy).not.toHaveBeenCalled()
    })
})

// ─── 5. Pattern rendering roundtrip (DOM) ────────────────────────────────
// @vitest-environment jsdom

describe('Roundtrip 5 — Pattern rendering roundtrip (DOM)', () => {
    let panel

    beforeEach(async () => {
        document.body.innerHTML = ''
        cleanState()
        serviceRegistry.reset()
        soundRegistry.reset()

        const testPattern = {
            name: 'RenderTest',
            nbBeats: 2,
            bpm: 120,
            tracks: {
                'KICK': {
                    name: 'KICK',
                    nbBeats: 2,
                    stepsPerBeat: 4,
                    loopAtStep: 8,
                    notes: [
                        { beat: 0, beatStep: 0, pitch: 0, velocity: 1 },
                        { beat: 0, beatStep: 2, pitch: 2, velocity: 0.6 },
                        { beat: 1, beatStep: 0, pitch: -1, velocity: 0.8 },
                    ]
                },
                'SNARE': {
                    name: 'SNARE',
                    nbBeats: 2,
                    stepsPerBeat: 4,
                    loopAtStep: 8,
                    notes: [
                        { beat: 0, beatStep: 0, pitch: 0, velocity: 0.9 },
                    ]
                }
            }
        }
        appState.patterns = [testPattern]
        appState.selectedPatternNum = 0
        appState.currentPage = 0

        serviceRegistry.transport = { isRunning: false, tick: 0 }

        const PatternPanel = (await import('../src/ui/pattern_panel.js')).default
        panel = new PatternPanel()
        panel.init()
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('renders correct number of tracks', () => {
        const trackNames = panel.container.querySelectorAll('.pp-track-name')
        expect(trackNames.length).toBe(2)
        expect(trackNames[0].textContent).toBe('KICK')
        expect(trackNames[1].textContent).toBe('SNARE')
    })

    it('renders correct number of cells (2 beats × 4 steps = 8 per track)', () => {
        const cells = panel.container.querySelectorAll('.pp-cell')
        expect(cells.length).toBe(16)
    })

    it('marks cells with notes as "filled"', () => {
        const filled = panel.container.querySelectorAll('.pp-cell.filled')
        expect(filled.length).toBe(4)
    })

    it('renders note slices inside filled cells', () => {
        const slices = panel.container.querySelectorAll('.pp-note-slice')
        expect(slices.length).toBe(4)
    })

    it('applies velocity-based opacity to note slices', () => {
        const slices = panel.container.querySelectorAll('.pp-note-slice')
        const opacities = [...slices].map(s => parseFloat(s.style.opacity))

        const hasCloseTo = (arr, expected, digits = 2) =>
            arr.some(v => Math.abs(v - expected) < Math.pow(10, -digits))
        expect(hasCloseTo(opacities, 1.0)).toBe(true)
        expect(hasCloseTo(opacities, 0.7)).toBe(true)
    })

    it('applies pitch-based vertical position to pitch-beat markers', () => {
        const pitchBeats = panel.container.querySelectorAll('.pp-pitch-beat')
        expect(pitchBeats.length).toBe(4)

        const bottoms = [...pitchBeats].map(p => parseFloat(p.style.bottom))
        const hasCloseTo = (arr, expected, digits = 0) =>
            arr.some(v => Math.abs(v - expected) < Math.pow(10, -digits))
        // pitch=0 → (0+24)/48*100 = 50%
        expect(hasCloseTo(bottoms, 50)).toBe(true)
        // pitch=2 → (2+24)/48*100 = 54.17%
        expect(hasCloseTo(bottoms, 54, 0)).toBe(true)
        // pitch=-1 → (-1+24)/48*100 = 47.92%
        expect(hasCloseTo(bottoms, 48, 0)).toBe(true)
    })

    it('does not mark empty cells as filled', () => {
        const emptyCells = panel.container.querySelectorAll('.pp-cell:not(.filled)')
        expect(emptyCells.length).toBe(12)
    })

    it('render loop point at correct position', () => {
        const loopCell = panel.container.querySelector('.pp-cell.pp-loop')
        expect(loopCell).not.toBeNull()
        expect(loopCell.dataset.pos).toBe('7')
    })

    it('re-render after adding a note shows new filled cell', () => {
        const pat = appState.patterns[0]
        const kick = Object.values(pat.tracks)[0]
        kick.notes = [...kick.notes, { beat: 1, beatStep: 2, pitch: 0, velocity: 0.5 }]
        kick._version = (kick._version ?? 0) + 1

        panel._trackDataDirty = true
        panel.sync()

        const filled = panel.container.querySelectorAll('.pp-cell.filled')
        expect(filled.length).toBe(5)
    })
})
