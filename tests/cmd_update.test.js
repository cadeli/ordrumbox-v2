/**
 * @vitest-environment jsdom
 *
 * Commander update commands introduced by the Lot B write-surface cleanup:
 *  - updateNote: partial note edits with no-op skip + undo + coalescing
 *  - updateTrack: desc/coalesce options (continuous UI gestures)
 *  - setStepsPerBeat: absolute steps-per-bar change with note/loop migration
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { EVENTS } from '../src/core/events.js'
import Commander from '../src/logic/commands/cmd.js'
import HistoryManager from '../src/logic/history_manager.js'
import { showToast } from '../src/core/notify.js'

vi.mock('../src/core/notify.js', () => ({ showToast: vi.fn() }))

function makeTrack(overrides = {}) {
    return {
        name: 'KICK',
        nbBeats: 4,
        stepsPerBeat: 4,
        loopAtStep: 16,
        loopPointBeat: 4,
        loopPointStep: 0,
        velocity: 1,
        pitch: 0,
        notes: [],
        ...overrides,
    }
}

function makeNote(overrides = {}) {
    return { beat: 0, beatStep: 0, velocity: 1, pitch: 0, ...overrides }
}

describe('Commander — updateNote / updateTrack opts / setStepsPerBeat', () => {
    let cmd
    let history
    let now
    let nowSpy

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        cmd = new Commander()
        history = new HistoryManager(50)
        serviceRegistry.cmd = cmd
        serviceRegistry.history = history

        now = 1_000_000
        nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now)
    })

    afterEach(() => {
        nowSpy.mockRestore()
    })

    describe('updateNote', () => {
        it('applies updates and records one undoable entry', () => {
            const track = makeTrack()
            const note = makeNote()

            cmd.updateNote(track, note, { velocity: 0.42 })

            expect(note.velocity).toBe(0.42)
            expect(history.pastLength).toBe(1)
        })

        it('undo restores the previous values, redo re-applies them', () => {
            const track = makeTrack()
            const note = makeNote()

            cmd.updateNote(track, note, { velocity: 0.42 })
            history.undo()
            expect(note.velocity).toBe(1)
            history.redo()
            expect(note.velocity).toBe(0.42)
        })

        it('skips no-op updates (value unchanged → no history entry)', () => {
            const track = makeTrack()
            const note = makeNote()

            cmd.updateNote(track, note, { velocity: 1 })

            expect(history.pastLength).toBe(0)
        })

        it('coalesces rapid same-key updates of the same note into ONE entry', () => {
            const track = makeTrack()
            const note = makeNote({ velocity: 0.5 })

            cmd.updateNote(track, note, { velocity: 0.1 }, { coalesce: true })
            now += 100
            cmd.updateNote(track, note, { velocity: 0.8 }, { coalesce: true })
            now += 100
            cmd.updateNote(track, note, { velocity: 0.9 }, { coalesce: true })

            expect(history.pastLength).toBe(1)
            history.undo()
            expect(note.velocity).toBe(0.5)
        })

        it('never merges updates belonging to two different notes', () => {
            const track = makeTrack()
            const n1 = makeNote({ beatStep: 0 })
            const n2 = makeNote({ beatStep: 2 })

            cmd.updateNote(track, n1, { velocity: 0.1 }, { coalesce: true })
            cmd.updateNote(track, n2, { velocity: 0.2 }, { coalesce: true })

            expect(history.pastLength).toBe(2)
        })

        it('never merges different keys of the same note', () => {
            const track = makeTrack()
            const note = makeNote()

            cmd.updateNote(track, note, { velocity: 0.2 }, { coalesce: true })
            cmd.updateNote(track, note, { pitch: 3 }, { coalesce: true })

            expect(history.pastLength).toBe(2)
        })
    })

    describe('updateTrack (desc / coalesce opts)', () => {
        it('merges rapid same-track same-key updates when coalesce is set', () => {
            const track = makeTrack()

            cmd.updateTrack(track, { velocity: 0.1 }, { desc: 'Velocity on KICK', coalesce: true })
            now += 50
            cmd.updateTrack(track, { velocity: 0.7 }, { desc: 'Velocity on KICK', coalesce: true })

            expect(history.pastLength).toBe(1)
            history.undo()
            expect(track.velocity).toBe(1)
        })

        it('never merges without the coalesce option (discrete controls)', () => {
            const track = makeTrack()

            cmd.updateTrack(track, { velocity: 0.1 }, { desc: 'a' })
            cmd.updateTrack(track, { velocity: 0.7 }, { desc: 'b' })

            expect(history.pastLength).toBe(2)
        })

        it('never merges different keys of the same track', () => {
            const track = makeTrack()

            cmd.updateTrack(track, { velocity: 0.5 }, { coalesce: true })
            cmd.updateTrack(track, { pitch: 3 }, { coalesce: true })

            expect(history.pastLength).toBe(2)
        })

        it('uses the provided desc as the undo hint', () => {
            const track = makeTrack()
            const spy = vi.fn()
            const off = playbackEvents.on(EVENTS.HISTORY_CHANGE, spy)

            cmd.updateTrack(track, { velocity: 0.5 }, { desc: 'Velocity on KICK' })

            expect(spy).toHaveBeenCalled()
            expect(spy.mock.calls.at(-1)[0].nextUndoDesc).toBe('Velocity on KICK')
            off()
        })
    })

    describe('setStepsPerBeat', () => {
        it('applies the target and migrates note beatSteps via steppc', () => {
            const track = makeTrack({ notes: [makeNote({ beatStep: 2 })] })

            const changed = cmd.setStepsPerBeat(track, 8)

            expect(changed).toBe(true)
            expect(track.stepsPerBeat).toBe(8)
            expect(track.notes[0].beatStep).toBe(4)
        })

        it('clamps out-of-range targets to 1..8', () => {
            const track = makeTrack()

            cmd.setStepsPerBeat(track, 99)
            expect(track.stepsPerBeat).toBe(8)

            cmd.setStepsPerBeat(track, -5)
            expect(track.stepsPerBeat).toBe(1)
        })

        it('returns false and records nothing when the value is unchanged', () => {
            const track = makeTrack()

            expect(cmd.setStepsPerBeat(track, 4)).toBe(false)
            expect(history.pastLength).toBe(0)
        })

        it('clamps loopAtStep to the new bar length and re-derives the loop point', () => {
            const track = makeTrack({ nbBeats: 4, stepsPerBeat: 4, loopAtStep: 16 })

            cmd.setStepsPerBeat(track, 2)

            expect(track.loopAtStep).toBe(8)
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopPointStep).toBe(0)
        })

        it('undo restores stepsPerBeat, loop point and note beatSteps', () => {
            const track = makeTrack({ loopAtStep: 16, notes: [makeNote({ beatStep: 2 })] })

            cmd.setStepsPerBeat(track, 8)
            expect(track.loopAtStep).toBe(16)
            expect(track.notes[0].beatStep).toBe(4)

            history.undo()
            expect(track.stepsPerBeat).toBe(4)
            expect(track.loopPointBeat).toBe(4)
            expect(track.notes[0].beatStep).toBe(2)

            history.redo()
            expect(track.stepsPerBeat).toBe(8)
            expect(track.loopPointBeat).toBe(2)
            expect(track.notes[0].beatStep).toBe(4)
        })

        it('wraps 8 → 1 through incrNbStepPerBar', () => {
            const track = makeTrack({ stepsPerBeat: 8 })

            cmd.incrNbStepPerBar(track)

            expect(track.stepsPerBeat).toBe(1)
        })

        it('coalesces rapid slider changes into ONE undo entry', () => {
            const track = makeTrack()

            cmd.setStepsPerBeat(track, 5, { coalesce: true })
            now += 100
            cmd.setStepsPerBeat(track, 6, { coalesce: true })

            expect(history.pastLength).toBe(1)
            history.undo()
            expect(track.stepsPerBeat).toBe(4)
        })
    })

    describe('meta params for the undo/redo report toast', () => {
        it('updateTrack records params (track + changes) and prev values', () => {
            const track = makeTrack()
            const spy = vi.spyOn(history, 'record')

            cmd.updateTrack(track, { velocity: 0.5 })

            expect(spy).toHaveBeenCalledTimes(1)
            const { meta } = spy.mock.calls[0][0]
            expect(meta.desc).toBe('Update KICK')
            expect(meta.params).toEqual({ track: 'KICK', velocity: 0.5 })
            expect(meta.prev).toEqual({ velocity: 1 })
        })

        it('updateNote records changed note values with prev values', () => {
            const track = makeTrack()
            const note = makeNote({ velocity: 1 })
            const spy = vi.spyOn(history, 'record')

            cmd.updateNote(track, note, { velocity: 0.7 })

            expect(spy).toHaveBeenCalledTimes(1)
            const { meta } = spy.mock.calls[0][0]
            expect(meta.params).toEqual({ track: 'KICK', velocity: 0.7 })
            expect(meta.prev).toEqual({ velocity: 1 })
        })

        it('setStepsPerBeat records a track params diff', () => {
            const track = makeTrack()
            const spy = vi.spyOn(history, 'record')

            cmd.setStepsPerBeat(track, 8)

            const { meta } = spy.mock.calls[0][0]
            expect(meta.desc).toBe('Steps per bar on KICK')
            expect(meta.params).toMatchObject({ track: 'KICK', stepsPerBeat: 8 })
            expect(meta.prev).toMatchObject({ stepsPerBeat: 4 })
        })

        it('undo after updateTrack toasts the full report', () => {
            const track = makeTrack()
            cmd.updateTrack(track, { velocity: 0.5 })
            vi.mocked(showToast).mockClear()

            history.undo()

            const [message, type, opts] = vi.mocked(showToast).mock.calls[0]
            expect(message).toBe(
                ['Undo — Update KICK', 'track: KICK', 'velocity: 0.5 → 1', 'history: 0 undo · 1 redo'].join('\n'),
            )
            expect(type).toBe('info')
            expect(opts).toEqual({ duration: 4500 })
        })
    })
})
