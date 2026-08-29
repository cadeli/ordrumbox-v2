import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as patternsManager from '../src/patterns/manager.js'
import {
    normalizeArp,
    hasArp,
    getArpNoteCount,
    isTrigged,
    isProbabilityTrigged,
    generateSubNotes,
    createArpFlatNote,
} from '../src/patterns/engine.js'

vi.mock('../src/state/app_state.js', () => {
    const state = { flatNotes: null }
    return {
        appState: state,
        __esModule: true
    }
})

vi.mock('../src/state/playback_events.js', () => {
    const callbacks = []
    let batchDepth = 0
    const pending = []
    const bus = {
        on: (ev, fn) => { callbacks.push(fn) },
        off: (ev, fn) => { const i = callbacks.indexOf(fn); if (i >= 0) callbacks.splice(i, 1) },
        emit: (ev) => {
            if (batchDepth > 0) { pending.push(ev); return }
            callbacks.forEach(fn => fn())
        },
        batch: (fn) => {
            batchDepth++
            try { fn() } finally {
                batchDepth--
                if (batchDepth === 0) { while (pending.length) { pending.shift(); callbacks.forEach(fn => fn()) } }
            }
        },
        _clearCallbacks: () => { callbacks.length = 0 },
    }
    return {
        playbackEvents: bus,
        __esModule: true
    }
})

function makeTrack(overrides = {}) {
    return {
        name: 'KICK',
        nbBeats: 2,
        stepsPerBeat: 4,
        loopAtStep: 8,
        notes: [],
        ...overrides,
    }
}

function makeNote(beat, beatStep, props = {}) {
    return { beat, beatStep, velocity: 0.8, pitch: 0, ...props }
}

describe('PatternManager', () => {
    let mgr

    beforeEach(() => {
        mgr = patternsManager
    })

    describe('computeNextPatternStepNote', () => {
        it('finds next note in same beat', () => {
            const track = makeTrack({
                stepsPerBeat: 4,
                nbBeats: 2,
                notes: [makeNote(0, 0), makeNote(0, 2)]
            })
            const note = track.notes[0]
            const result = mgr.computeNextPatternStepNote(note, track)
            expect(result).toBe(2)
        })

        it('finds next note in next beat', () => {
            const track = makeTrack({
                stepsPerBeat: 4,
                nbBeats: 2,
                notes: [makeNote(0, 2), makeNote(1, 0)]
            })
            const note = track.notes[0]
            const result = mgr.computeNextPatternStepNote(note, track)
            expect(result).toBe(4)
        })

        it('returns loopAtStep when no note found after', () => {
            const track = makeTrack({
                stepsPerBeat: 4,
                nbBeats: 2,
                loopAtStep: 6,
                notes: [makeNote(0, 4)]
            })
            const note = track.notes[0]
            const result = mgr.computeNextPatternStepNote(note, track)
            expect(result).toBe(6)
        })

        it('returns total steps when no note found and no loopAtStep', () => {
            const track = makeTrack({
                stepsPerBeat: 4,
                nbBeats: 2,
                notes: [makeNote(0, 6)]
            })
            delete track.loopAtStep
            const note = track.notes[0]
            const result = mgr.computeNextPatternStepNote(note, track)
            expect(result).toBe(8)
        })

        it('wraps around beats correctly', () => {
            const track = makeTrack({
                stepsPerBeat: 4,
                nbBeats: 3,
                notes: [makeNote(1, 3), makeNote(2, 1)]
            })
            const note = track.notes[0]
            const result = mgr.computeNextPatternStepNote(note, track)
            expect(result).toBe(9)
        })
    })

    describe('computeFlatNotesFromPattern', () => {
        it('returns flatNotes and updates appState', async () => {
            const { appState } = await import('../src/state/app_state.js')
            const { playbackEvents } = await import('../src/state/playback_events.js')

            const pattern = {
                name: 'Test',
                bpm: 120,
                nbBeats: 1,
                tracks: [
                    makeTrack({
                        notes: [makeNote(0, 0)],
                    })
                ]
            }

            const result = mgr.computeFlatNotesFromPattern(pattern, 0)
            expect(result).toBeInstanceOf(Map)
            expect(appState.flatNotes).toBe(result)
        })

        it('fires onPatternChange callbacks', async () => {
            const { playbackEvents } = await import('../src/state/playback_events.js')
            const cb = vi.fn()
            playbackEvents.on("patternChange", cb)

            const pattern = {
                name: 'Test',
                bpm: 120,
                nbBeats: 1,
                tracks: [makeTrack({ notes: [makeNote(0, 0)] })]
            }

            mgr.computeFlatNotesFromPattern(pattern, 0)
            expect(cb).toHaveBeenCalled()

            playbackEvents._clearCallbacks()
        })
    })

    describe('delegate methods', () => {
        it('isTrigged delegates to engine', () => {
            expect(isTrigged(0, 1, 0)).toBe(true)
            expect(isTrigged(0, 2, 0)).toBe(true)
            expect(isTrigged(0, 2, 1)).toBe(false)
        })

        it('isProbabilityTrigged delegates to engine', () => {
            expect(isProbabilityTrigged(1)).toBe(true)
            expect(isProbabilityTrigged(0)).toBe(false)
        })

        it('hasArp delegates to engine', () => {
            expect(hasArp(null)).toBe(false)
            expect(hasArp({ type: 'up', notes: 4 })).toBe(true)
        })

        it('normalizeArp returns null for empty intervals', () => {
            expect(normalizeArp({ mode: 'up' })).toBeNull()
        })

        it('normalizeArp returns sequence for valid intervals', () => {
            const result = normalizeArp({ mode: 'up', intervals: [0, 3, 7] })
            expect(result).toEqual({ sequence: [0, 3, 7] })
        })

        it('getArpNoteCount reads retriggerNum from note', () => {
            const note = { retriggerNum: 4 }
            expect(getArpNoteCount(note)).toBe(4)
        })

        it('getArpNoteCount defaults to 1 when retriggerNum is missing', () => {
            expect(getArpNoteCount({})).toBe(1)
        })
    })

    describe('createArpFlatNote', () => {
        it('returns a flatNote with pitch offset by semitoneOffset', () => {
            const track = makeTrack()
            const note = makeNote(0, 0, { pitch: 0 })
            const result = createArpFlatNote(0, track, note, 3)
            expect(result.tick).toBe(0)
            expect(result.note.pitch).toBe(3)
        })

        it('combines note pitch with semitoneOffset', () => {
            const track = makeTrack()
            const note = makeNote(0, 0, { pitch: 5 })
            const result = createArpFlatNote(10, track, note, -2)
            expect(result.tick).toBe(10)
            expect(result.note.pitch).toBe(3)
        })
    })

    describe('generateSubNotes', () => {
        it('adds a flatNote when no arp configured', () => {
            const flatNotes = new Map()
            const track = makeTrack()
            const note = makeNote(0, 0, { retriggerNum: 1 })
            generateSubNotes(flatNotes, 0, track, note, 16, 32)
            expect(flatNotes.has(0)).toBe(true)
            expect(flatNotes.get(0)).toHaveLength(1)
        })

        it('generates retrigger notes when retriggerNum > 1', () => {
            const flatNotes = new Map()
            const track = makeTrack({ stepsPerBeat: 4 })
            const note = makeNote(0, 0, { retriggerNum: 3, rate: 1 })
            generateSubNotes(flatNotes, 0, track, note, 32, 32)
            expect(flatNotes.size).toBeGreaterThan(1)
        })

        it('generates arp notes when arp is configured', () => {
            const flatNotes = new Map()
            const track = makeTrack({ stepsPerBeat: 4 })
            const note = makeNote(0, 0, {
                retriggerNum: 4,
                arp: { mode: 'up', intervals: [0, 3, 7] }
            })
            generateSubNotes(flatNotes, 0, track, note, 32, 32)
            expect(flatNotes.size).toBeGreaterThan(0)
            const notes = Array.from(flatNotes.values()).flat()
            expect(notes.length).toBeGreaterThan(1)
        })

        it('does not exceed nbTickForPattern', () => {
            const flatNotes = new Map()
            const track = makeTrack({ stepsPerBeat: 4 })
            const note = makeNote(0, 0, { retriggerNum: 8, rate: 1 })
            generateSubNotes(flatNotes, 0, track, note, 8, 32)
            for (const tick of flatNotes.keys()) {
                expect(tick).toBeLessThan(8)
            }
        })
    })
})
