/**
 * @vitest-environment jsdom
 *
 * P1a guards: silent-failure fixes that must NOT degrade silently any more.
 * Production builds drop console.*, so each of these paths now either rejects
 * the input or reports through reportUserError (a toast).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import HistoryManager from '../src/logic/history_manager.js'
import Commander from '../src/logic/commands/cmd.js'
import { clampStepsPerBeat } from '../src/model/track_schema.js'
import { areValidNoteKeys, normalizeNote } from '../src/core/note_schema.js'
import { reportUserError, resetUserErrorReports } from '../src/core/notify.js'
import Utils from '../src/core/utils.js'

function makeTrack(overrides = {}) {
    return {
        name: 'KICK',
        beatCount: 4,
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

describe('P1a — silent failure guards', () => {
    let cmd

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        resetUserErrorReports()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        serviceRegistry.history = new HistoryManager(50)
        // Every test in this file trips a guard on purpose. reportUserError()
        // attaches the cause to console.warn outside production, so without
        // this the suite prints expected stack traces that read like failures.
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('cmd.updateTrack rejects non-finite numbers', () => {
        it('keeps the previous value and does not record an undo step', () => {
            const track = makeTrack()
            cmd.updateTrack(track, { velocity: Number.NaN })

            expect(track.velocity).toBe(1)
            expect(cmd.getHistory().pastLength).toBe(0)
        })

        it('rejects Infinity and -Infinity as well', () => {
            const track = makeTrack({ pan: 0 })
            cmd.updateTrack(track, { pan: Number.POSITIVE_INFINITY })
            cmd.updateTrack(track, { pan: Number.NEGATIVE_INFINITY })
            expect(track.pan).toBe(0)
        })

        it('still clamps finite out-of-range values', () => {
            const track = makeTrack({ velocity: 0.5 })
            cmd.updateTrack(track, { velocity: 5 })
            expect(track.velocity).toBe(1)
        })

        it('applies the valid keys of a mixed update', () => {
            const track = makeTrack({ velocity: 0.5, pan: 0 })
            cmd.updateTrack(track, { velocity: Number.NaN, pan: -1 })
            expect(track.velocity).toBe(0.5)
            expect(track.pan).toBe(-1)
        })
    })

    describe('stepsPerBeat is clamped and reported, never silently rewritten', () => {
        it('clampStepsPerBeat fixes an out-of-grid value and rescales notes', () => {
            const track = makeTrack({
                stepsPerBeat: 16,
                notes: [
                    { beat: 0, beatStep: 8, steppc: 50 },
                    { beat: 1, beatStep: 0, steppc: 0 },
                ],
            })

            expect(clampStepsPerBeat(track)).toBe(true)
            expect(track.stepsPerBeat).toBe(8)
            // steppc is preserved, beatStep rescaled into the new grid
            expect(track.notes[0].steppc).toBe(50)
            expect(track.notes[0].beatStep).toBe(4)
            expect(track.notes[1].beatStep).toBe(0)
        })

        it('rounds a fractional value like setStepsPerBeat does', () => {
            const a = makeTrack({ stepsPerBeat: 4.5 })
            expect(clampStepsPerBeat(a)).toBe(true)
            expect(a.stepsPerBeat).toBe(5)
        })

        it('falls back to the model default when the value is missing or not finite', () => {
            const b = makeTrack({ stepsPerBeat: undefined })
            expect(clampStepsPerBeat(b)).toBe(true)
            expect(b.stepsPerBeat).toBe(4)

            const c = makeTrack({ stepsPerBeat: Number.NaN })
            expect(clampStepsPerBeat(c)).toBe(true)
            expect(c.stepsPerBeat).toBe(4)
        })

        it('is a no-op for in-range values', () => {
            const track = makeTrack({ stepsPerBeat: 8 })
            expect(clampStepsPerBeat(track)).toBe(false)
            expect(track.stepsPerBeat).toBe(8)
        })

        it('addTrack normalises the grid before any note exists', () => {
            const pattern = cmd.addPattern('Test')
            const track = cmd.addTrack(pattern, 'KICK', 16)

            expect(track.stepsPerBeat).toBe(8)
            expect(track.notes).toEqual([])
        })

        it('addNote no longer rewrites the track without telling anyone', () => {
            const reportSpy = vi.spyOn(notifyModule, 'reportUserError').mockReturnValue(true)
            const pattern = cmd.addPattern('Test')
            const track = cmd.addTrack(pattern, 'KICK', 4)
            track.stepsPerBeat = 16 // direct field write, as a legacy importer would

            cmd.addNote(track, 0, 2)

            expect(track.stepsPerBeat).toBe(8)
            expect(reportSpy).toHaveBeenCalled()
        })
    })

    describe('compact note header validation', () => {
        it('accepts a header made of distinct keys in canonical order', () => {
            expect(areValidNoteKeys(['velocity', 'beat', 'beatStep'])).toBe(true)
        })

        it('rejects unknown keys, duplicates and reordered headers', () => {
            expect(areValidNoteKeys(['velocity', 'nope'])).toBe(false)
            expect(areValidNoteKeys(['velocity', 'velocity'])).toBe(false)
            expect(areValidNoteKeys(['beat', 'velocity'])).toBe(false)
            expect(areValidNoteKeys('velocity')).toBe(false)
        })

        it('reordered headers would have rewritten velocity onto pitch', () => {
            // Documents why the check exists: positional decoding with a
            // reordered header maps slots onto the wrong properties.
            expect(areValidNoteKeys(['velocity', 'pitch', 'beat'])).toBe(false)
        })
    })

    describe('note editor overrides survive export/import', () => {
        it('carries _arpScale/_arpType through normalizeNote', () => {
            const note = normalizeNote({ _arpScale: 'minor', _arpType: 'down' })
            expect(note._arpScale).toBe('minor')
            expect(note._arpType).toBe('down')
        })
    })

    describe('reportUserError', () => {
        function toastCount() {
            return document.querySelectorAll('#odbox-toast-container > div').length
        }

        it('reports once per context per session', () => {
            document.getElementById('odbox-toast-container')?.remove()
            expect(reportUserError('Ctx.a', 'first')).toBe(true)
            expect(toastCount()).toBe(1)

            expect(reportUserError('Ctx.a', 'second')).toBe(false)
            expect(toastCount()).toBe(1)
        })

        it('can be forced to report every time', () => {
            document.getElementById('odbox-toast-container')?.remove()
            expect(reportUserError('Ctx.b', 'x', { once: false })).toBe(true)
            expect(reportUserError('Ctx.b', 'x', { once: false })).toBe(true)
            expect(toastCount()).toBe(2)
        })
    })

    describe('pattern defaults stay reachable', () => {
        it('PATTERN_DEFAULTS still exposes beatCount (pre-P5 rename)', () => {
            expect(Utils.PATTERN_DEFAULTS.beatCount).toBe(4)
        })
    })
})

// notifyModule is resolved lazily so the spy above intercepts the same binding
// the call sites use.
import * as notifyModule from '../src/core/notify.js'
