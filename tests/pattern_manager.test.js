import { makeAppStateMock } from './helpers/app_state_mock.js'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as flatNotesService from '../src/patterns/flat_notes.js'
import { hasArp, getArpNoteCount, generateSubNotes, createArpFlatNote } from '../src/patterns/engine.js'
import { makeNote, makeTrack, PARAM_SETS } from './helpers/make_pattern.js'
import * as stepResolver from '../src/patterns/step_resolver.js'
import { EVENTS } from '../src/core/events.js'

vi.mock('../src/state/app_state.js', () => ({
    appState: makeAppStateMock({ flatNotes: null }),
    __esModule: true,
}))

vi.mock('../src/state/playback_events.js', () => {
    const callbacks = []
    let batchDepth = 0
    const pending = []
    const bus = {
        on: (ev, fn) => {
            callbacks.push(fn)
        },
        off: (ev, fn) => {
            const i = callbacks.indexOf(fn)
            if (i >= 0) callbacks.splice(i, 1)
        },
        emit: (ev) => {
            if (batchDepth > 0) {
                pending.push(ev)
                return
            }
            callbacks.forEach((fn) => fn())
        },
        batch: (fn) => {
            batchDepth++
            try {
                fn()
            } finally {
                batchDepth--
                if (batchDepth === 0) {
                    while (pending.length) {
                        pending.shift()
                        callbacks.forEach((fn) => fn())
                    }
                }
            }
        },
        _clearCallbacks: () => {
            callbacks.length = 0
        },
    }
    return {
        playbackEvents: bus,
        __esModule: true,
    }
})

describe('PatternManager', () => {
    let mgr

    beforeEach(() => {
        mgr = flatNotesService
    })

    describe('applyFlatNotes', () => {
        it('returns flatNotes and updates appState', async () => {
            const { appState } = await import('../src/state/app_state.js')

            const pattern = {
                name: 'Test',
                bpm: 120,
                beatCount: 1,
                tracks: [makeTrack('KICK', [makeNote(0, 0)], { beatCount: 1, stepsPerBeat: 4, loopAtStep: 4 })],
            }

            const result = mgr.applyFlatNotes(pattern, 0)
            expect(result).toBeInstanceOf(Map)
            expect(appState.flatNotes).toBe(result)
        })

        it('fires PATTERN_CHANGE callbacks on playbackEvents', async () => {
            const { playbackEvents } = await import('../src/state/playback_events.js')
            const cb = vi.fn()
            playbackEvents.on(EVENTS.PATTERN_CHANGE, cb)

            const pattern = {
                name: 'Test',
                bpm: 120,
                beatCount: 1,
                tracks: [makeTrack('KICK', [makeNote(0, 0)], { beatCount: 1, stepsPerBeat: 4, loopAtStep: 4 })],
            }

            mgr.applyFlatNotes(pattern, 0)
            expect(cb).toHaveBeenCalled()

            playbackEvents._clearCallbacks()
        })
    })

    // isTriggered / isProbabilityTriggered / normalizeArp / generateSubNotes
    // are covered exhaustively in pattern_engine.test.js — only the
    // manager-specific helpers are tested here.

    describe('engine helpers unique to the manager', () => {
        it('hasArp(null) returns false', () => {
            expect(hasArp(null)).toBe(false)
        })

        it('hasArp({ type: "up", notes: 4 }) returns true', () => {
            expect(hasArp({ type: 'up', notes: 4 })).toBe(true)
        })

        it('getArpNoteCount reads retriggerCount from note', () => {
            const note = { retriggerCount: 4 }
            expect(getArpNoteCount(note)).toBe(4)
        })

        it('getArpNoteCount defaults to 1 when retriggerCount is missing', () => {
            expect(getArpNoteCount({})).toBe(1)
        })
    })

    describe('createArpFlatNote', () => {
        it('returns a flatNote with pitch offset by semitoneOffset', () => {
            const track = makeTrack('KICK')
            const note = makeNote(0, 0, { pitch: 0 })
            const result = createArpFlatNote(0, track, note, 3)
            expect(result.tick).toBe(0)
            expect(result.note.pitch).toBe(3)
        })

        it('combines note pitch with semitoneOffset', () => {
            const track = makeTrack('KICK')
            const note = makeNote(0, 0, { pitch: 5 })
            const result = createArpFlatNote(10, track, note, -2)
            expect(result.tick).toBe(10)
            expect(result.note.pitch).toBe(3)
        })
    })

    describe('generateSubNotes', () => {
        it('adds a flatNote when no arp configured', () => {
            const flatNotes = new Map()
            const track = makeTrack('KICK')
            const note = makeNote(0, 0, { retriggerCount: 1 })
            generateSubNotes(flatNotes, 0, track, note, 16, 32)
            expect(flatNotes.has(0)).toBe(true)
            expect(flatNotes.get(0)).toHaveLength(1)
        })

        it('generates retrigger notes when retriggerCount > 1', () => {
            const flatNotes = new Map()
            const track = makeTrack('KICK')
            const note = makeNote(0, 0, { retriggerCount: 3, rate: 1 })
            generateSubNotes(flatNotes, 0, track, note, 32, 32)
            expect(flatNotes.size).toBeGreaterThan(1)
        })

        it('generates arp notes when arp is configured', () => {
            const flatNotes = new Map()
            const track = makeTrack('KICK')
            const note = makeNote(0, 0, {
                retriggerCount: 4,
                arp: { mode: 'up', intervals: [0, 3, 7] },
            })
            generateSubNotes(flatNotes, 0, track, note, 32, 32)
            expect(flatNotes.size).toBeGreaterThan(0)
            const notes = Array.from(flatNotes.values()).flat()
            expect(notes.length).toBeGreaterThan(1)
        })

        it('does not exceed tickCountForPattern', () => {
            const flatNotes = new Map()
            const track = makeTrack('KICK')
            const note = makeNote(0, 0, { retriggerCount: 8, rate: 1 })
            generateSubNotes(flatNotes, 0, track, note, 8, 32)
            for (const tick of flatNotes.keys()) {
                expect(tick).toBeLessThan(8)
            }
        })
    })

    // ── Parameterized: step resolver across subdivisions ──────────────────────

    describe.each(PARAM_SETS)('createStepResolver — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat) => {
        it('finds next note in same beat', () => {
            const track = makeTrack('KICK', [makeNote(0, 0), makeNote(0, 2)], {
                beatCount: 2,
                stepsPerBeat,
                loopAtStep: 2 * stepsPerBeat,
            })
            const result = stepResolver.createStepResolver(track)(track.notes[0])
            expect(result).toBe(2)
        })

        it('finds next note in next beat', () => {
            const track = makeTrack('KICK', [makeNote(0, 0), makeNote(1, 0)], {
                beatCount: 2,
                stepsPerBeat,
                loopAtStep: 2 * stepsPerBeat,
            })
            const result = stepResolver.createStepResolver(track)(track.notes[0])
            expect(result).toBe(stepsPerBeat)
        })

        it('returns loopAtStep when no note found after', () => {
            const loopAt = stepsPerBeat + 1
            const track = makeTrack('KICK', [makeNote(0, 0)], {
                beatCount: 2,
                stepsPerBeat,
                loopAtStep: loopAt,
            })
            const result = stepResolver.createStepResolver(track)(track.notes[0])
            expect(result).toBe(loopAt)
        })

        it('returns total steps when no loopAtStep', () => {
            const totalSteps = 2 * stepsPerBeat
            const track = makeTrack('KICK', [makeNote(0, 0)], {
                beatCount: 2,
                stepsPerBeat,
                loopAtStep: totalSteps,
            })
            delete track.loopAtStep
            const result = stepResolver.createStepResolver(track)(track.notes[0])
            expect(result).toBe(totalSteps)
        })

        it('wraps around beats correctly', () => {
            const loopAt = 3 * stepsPerBeat
            const track = makeTrack('KICK', [makeNote(1, 0), makeNote(2, 0)], {
                beatCount: 3,
                stepsPerBeat,
                loopAtStep: loopAt,
            })
            const result = stepResolver.createStepResolver(track)(track.notes[0])
            expect(result).toBe(2 * stepsPerBeat)
        })
    })
})
