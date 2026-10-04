/**
 * Pattern engine tests — triggers, retriggers, arpeggios, loop points,
 * probability, euclidean fill, and full recomputeFlatNotes.
 *
 * These are pure-logic tests (no audio rendering).
 */
import { describe, it, expect, vi } from 'vitest'
import { PARAM_SETS } from './helpers/make_pattern.js'
import { TICK } from '../src/core/constants.js'
import {
    recomputeFlatNotes,
    isTriggered,
    isProbabilityTriggered,
    normalizeArp,
    generateSubNotes,
    generateSubNotesWithEuclidean,
    computeTickSpacing,
    computeNbTickForLoop,
    expandLoopOccurrences,
    computeTickForNote,
} from '../src/patterns/engine.js'
import { createStepResolver } from '../src/patterns/step_resolver.js'
import { getNoteAbsoluteStep, stepToTick } from '../src/core/notes.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPattern(noteOverrides = {}, trackOverrides = {}, beatCount = 4) {
    const note = {
        beat: 0,
        beatStep: 0,
        velocity: 0.8,
        pitch: 0,
        pan: 0,
        arp: null,
        every: 1,
        pos: 0,
        prob: 1,
        arpTriggerProbability: 1,
        retriggerNum: 1,
        rate: 1,
        euclideanFill: 0,
        ...noteOverrides,
    }
    const track = {
        name: 'T1',
        beatCount: 4,
        stepsPerBeat: 4,
        mute: false,
        loopAtStep: undefined * 4 + undefined,
        swingAmount: 0,
        swingResolution: 4,
        velocity: 1,
        pan: 0,
        pitch: 0,
        notes: { N0: note },
        ...trackOverrides,
    }
    return { name: 'Test', bpm: 120, beatCount, tracks: { T1: track } }
}

function countNotes(pattern, loop = 0) {
    const flatNotes = recomputeFlatNotes(pattern, loop)
    let count = 0
    for (const notes of flatNotes.values()) count += notes.length
    return count
}

function getAllNotes(pattern, loop = 0) {
    const flatNotes = recomputeFlatNotes(pattern, loop)
    const all = []
    for (const notes of flatNotes.values()) all.push(...notes)
    return all.sort((a, b) => a.tick - b.tick)
}

// ─── every / pos Tests ─────────────────────────────────────────

describe('every / pos', () => {
    it('every=1 fires on every loop', () => {
        expect(isTriggered(0, 1, 0)).toBe(true)
        expect(isTriggered(0, 1, 1)).toBe(true)
        expect(isTriggered(0, 1, 5)).toBe(true)
    })

    it('every=2, phase=0 fires on even loops', () => {
        expect(isTriggered(0, 2, 0)).toBe(true)
        expect(isTriggered(0, 2, 1)).toBe(false)
        expect(isTriggered(0, 2, 2)).toBe(true)
        expect(isTriggered(0, 2, 3)).toBe(false)
    })

    it('every=2, phase=1 fires on odd loops', () => {
        expect(isTriggered(1, 2, 0)).toBe(false)
        expect(isTriggered(1, 2, 1)).toBe(true)
        expect(isTriggered(1, 2, 2)).toBe(false)
        expect(isTriggered(1, 2, 3)).toBe(true)
    })

    it('every=4, phase=1 fires on loops 3,7,11,...', () => {
        expect(isTriggered(1, 4, 0)).toBe(false)
        expect(isTriggered(1, 4, 1)).toBe(false)
        expect(isTriggered(1, 4, 2)).toBe(false)
        expect(isTriggered(1, 4, 3)).toBe(true)
        expect(isTriggered(1, 4, 7)).toBe(true)
    })

    it('every=3, phase=0 fires on loops 0,3,6,...', () => {
        expect(isTriggered(0, 3, 0)).toBe(true)
        expect(isTriggered(0, 3, 1)).toBe(false)
        expect(isTriggered(0, 3, 2)).toBe(false)
        expect(isTriggered(0, 3, 3)).toBe(true)
    })

    it('pattern with every=2 produces notes only on matching loops', () => {
        const pattern = buildPattern({ every: 2, pos: 0 }, { beatCount: 1 }, 1)
        expect(countNotes(pattern, 0)).toBe(1)
        expect(countNotes(pattern, 1)).toBe(0)
        expect(countNotes(pattern, 2)).toBe(1)
    })

    it('pattern with every=2 phase=1 produces notes only on odd loops', () => {
        const pattern = buildPattern({ every: 2, pos: 1 }, { beatCount: 1 }, 1)
        expect(countNotes(pattern, 0)).toBe(0)
        expect(countNotes(pattern, 1)).toBe(1)
    })
})

// ─── isProbabilityTriggered ──────────────────────────────────────

describe('isProbabilityTriggered', () => {
    it('always returns true for probability 1', () => {
        expect(isProbabilityTriggered(1)).toBe(true)
    })

    it('always returns false for probability 0', () => {
        expect(isProbabilityTriggered(0)).toBe(false)
    })

    it('uses random function', () => {
        const mockRandom = vi.fn()
        mockRandom.mockReturnValueOnce(0.1).mockReturnValueOnce(0.9)
        expect(isProbabilityTriggered(0.5, mockRandom)).toBe(true)
        expect(isProbabilityTriggered(0.5, mockRandom)).toBe(false)
    })
})

// ─── retriggerNum / rate Tests ───────────────────────────────────────

describe('retriggerNum / rate', () => {
    it('retriggerNum=1 produces 1 note', () => {
        const pattern = buildPattern({ retriggerNum: 1 }, { beatCount: 1 }, 1)
        expect(countNotes(pattern)).toBe(1)
    })

    it('retriggerNum=4 produces 4 notes', () => {
        const pattern = buildPattern({ retriggerNum: 4, rate: 1 }, { beatCount: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        expect(notes.map((n) => n.tick)).toEqual([0, 1, 2, 3])
    })

    it('retriggerNum=4 with rate=8 produces 4 notes with step spacing', () => {
        const pattern = buildPattern({ retriggerNum: 4, rate: 8 }, { beatCount: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        expect(notes.map((n) => n.tick)).toEqual([0, 8, 16, 24])
    })

    it('retriggerNum=3 with rate=4 produces 3 notes at half-step spacing', () => {
        const pattern = buildPattern({ retriggerNum: 3, rate: 4 }, { beatCount: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(3)
        expect(notes.map((n) => n.tick)).toEqual([0, 4, 8])
    })

    it('computeTickSpacing returns correct values', () => {
        const track = { stepsPerBeat: 4 }
        expect(computeTickSpacing(track, 1)).toBe(1)
        expect(computeTickSpacing(track, 4)).toBe(4)
        expect(computeTickSpacing(track, 8)).toBe(8)
        expect(computeTickSpacing(track, 16)).toBe(72)
    })
})

// ─── generateSubNotes (direct) ──────────────────────────────────

describe('Arpeggios and Retriggers (generateSubNotes)', () => {
    const mockTrack = { stepsPerBeat: 16 }
    const mockNote = { beat: 0, beatStep: 0 }

    it('generates multiple notes for retrigger', () => {
        const note = { ...mockNote, retriggerNum: 4, rate: 8 }
        const flatNotes = new Map()
        generateSubNotes(flatNotes, 0, mockTrack, note, 128, 32)

        expect(flatNotes.size).toBe(4)
        expect(flatNotes.has(0)).toBe(true)
        expect(flatNotes.has(2)).toBe(true)
        expect(flatNotes.has(4)).toBe(true)
        expect(flatNotes.has(6)).toBe(true)
    })

    it('applies arp sequence with retrigger', () => {
        const note = {
            ...mockNote,
            pitch: 0,
            retriggerNum: 3,
            rate: 8,
            arp: { intervals: [0, 12], mode: 'up' },
        }
        const flatNotes = new Map()
        generateSubNotes(flatNotes, 0, mockTrack, note, 128, 32)

        expect(flatNotes.get(0)).toBeDefined()
        expect(flatNotes.get(0)[0].note.pitch).toBe(0)
        expect(flatNotes.get(2)).toBeDefined()
        expect(flatNotes.get(2)[0].note.pitch).toBe(12)
        expect(flatNotes.get(4)).toBeDefined()
        expect(flatNotes.get(4)[0].note.pitch).toBe(0)
    })
})

// ─── Arpeggio Tests ──────────────────────────────────────────────────────────

describe('arpeggio', () => {
    it('normalizeArp sorts intervals ascending for mode "up"', () => {
        const result = normalizeArp([0, 7, 4, 12])
        expect(result.sequence).toEqual([0, 4, 7, 12])
    })

    it('normalizeArp sorts intervals descending for mode "down"', () => {
        const result = normalizeArp({ intervals: [0, 4, 7, 12], mode: 'down' })
        expect(result.sequence).toEqual([12, 7, 4, 0])
    })

    it('normalizeArp creates updown sequence', () => {
        const result = normalizeArp({ intervals: [0, 4, 7], mode: 'updown' })
        expect(result.sequence).toEqual([0, 4, 7, 4])
    })

    it('normalizeArp ensures root note (0) is present', () => {
        const result = normalizeArp([4, 7, 12])
        expect(result.sequence[0]).toBe(0)
    })

    it('normalizeArp returns null for empty intervals', () => {
        expect(normalizeArp([])).toBeNull()
        expect(normalizeArp(null)).toBeNull()
    })

    it('arp mode "up" creates notes with ascending pitch offsets', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, rate: 8 },
            { beatCount: 1 },
            1,
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(3)
        expect(notes.map((n) => n.note.pitch)).toEqual([0, 4, 7])
    })

    it('arp mode "down" creates notes with descending pitch offsets', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'down' }, retriggerNum: 3, rate: 8 },
            { beatCount: 1 },
            1,
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(3)
        expect(notes.map((n) => n.note.pitch)).toEqual([7, 4, 0])
    })

    it('arp mode "updown" cycles through the sequence', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'updown' }, retriggerNum: 4, rate: 8 },
            { beatCount: 1 },
            1,
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        expect(notes.map((n) => n.note.pitch)).toEqual([0, 4, 7, 4])
    })

    it('arp cycles through intervals when retriggerNum > sequence length', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 6, rate: 4 },
            { beatCount: 2 },
            2,
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(6)
        expect(notes.map((n) => n.note.pitch)).toEqual([0, 4, 7, 0, 4, 7])
    })

    it('arp with base pitch offset adds semitone to note.pitch', () => {
        const pattern = buildPattern(
            { pitch: 5, arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, rate: 8 },
            { beatCount: 1 },
            1,
        )
        const notes = getAllNotes(pattern)
        expect(notes.map((n) => n.note.pitch)).toEqual([5, 9, 12])
    })
})

// ─── Loop Points Tests ────────────────────────────────────────────────────────

describe('loop length (loopAtStep)', () => {
    it('default loop = track.beatCount (no loop points)', () => {
        const track = { beatCount: 4, stepsPerBeat: 4 }
        expect(computeNbTickForLoop(track)).toBe(128)
    })

    it('loopAtStep=1 beat loops every beat', () => {
        const track = { beatCount: 4, stepsPerBeat: 4, loopAtStep: 4 }
        expect(computeNbTickForLoop(track)).toBe(32)
    })

    it('loopAtStep=2 beats loops every 2 beats', () => {
        const track = { beatCount: 4, stepsPerBeat: 4, loopAtStep: 8 }
        expect(computeNbTickForLoop(track)).toBe(64)
    })

    it('note repeats at loop interval across pattern', () => {
        const pattern = buildPattern({}, { beatCount: 4, loopAtStep: 4 }, 4)
        const notes = getAllNotes(pattern)
        expect(notes.map((n) => n.tick)).toEqual([0, 32, 64, 96])
    })

    it('note with a 2-beat loop repeats every 2 beats', () => {
        const pattern = buildPattern({}, { beatCount: 4, loopAtStep: 8 }, 4)
        const notes = getAllNotes(pattern)
        expect(notes.map((n) => n.tick)).toEqual([0, 64])
    })

    it('expandLoopOccurrences generates correct tick positions', () => {
        expect(expandLoopOccurrences(0, 32, 128)).toEqual([0, 32, 64, 96])
    })

    it('expandLoopOccurrences with baseTick > 0', () => {
        expect(expandLoopOccurrences(16, 32, 128)).toEqual([16, 48, 80, 112])
    })

    it('expandLoopOccurrences returns single element when loop = pattern', () => {
        expect(expandLoopOccurrences(0, 128, 128)).toEqual([0])
    })

    it('note outside loop range is not tiled', () => {
        expect(expandLoopOccurrences(64, 32, 128)).toEqual([64])
    })
})

// ─── Velocity / Pitch / Pan Tests (Engine Level) ────────────────────────────

describe('note properties preserved in flat notes', () => {
    it('velocity is preserved', () => {
        const pattern = buildPattern({ velocity: 0.6 }, { beatCount: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.velocity).toBe(0.6)
    })

    it('default velocity is 0.8', () => {
        const pattern = buildPattern({}, { beatCount: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.velocity).toBe(0.8)
    })

    it('pitch is preserved', () => {
        const pattern = buildPattern({ pitch: 5 }, { beatCount: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.pitch).toBe(5)
    })

    it('pan is preserved', () => {
        const pattern = buildPattern({ pan: 0.5 }, { beatCount: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.pan).toBe(0.5)
    })
})

// ─── Euclidean Fill ──────────────────────────────────────────────────────────

describe('Euclidean Fill (generateSubNotesWithEuclidean)', () => {
    const mockTrack = { stepsPerBeat: 4 }
    // euclideanFill = total pulses k over the span, base note included:
    // k=2 on 4 steps → onsets at steps 0 and 2 → one extra note at tick 16
    const mockNote = { beat: 0, beatStep: 0, euclideanFill: 2 }
    const mockComputeNextStep = () => 4

    it('adds extra notes between current and next note', () => {
        const flatNotes = new Map()
        generateSubNotesWithEuclidean(flatNotes, 0, mockTrack, mockNote, 128, mockComputeNextStep, 32)

        expect(flatNotes.size).toBe(2)
        expect(flatNotes.has(0)).toBe(true)
        expect(flatNotes.has(16)).toBe(true)
    })

    it('applies arp to euclidean fill', () => {
        const note = {
            ...mockNote,
            pitch: 0,
            arp: { intervals: [0, 7], mode: 'up' },
            retriggerNum: 1,
        }
        const flatNotes = new Map()
        generateSubNotesWithEuclidean(flatNotes, 0, mockTrack, note, 128, mockComputeNextStep, 32)

        expect(flatNotes.get(0)).toBeDefined()
        expect(flatNotes.get(0)[0].note.pitch).toBe(0)
        expect(flatNotes.get(16)).toBeDefined()
        expect(flatNotes.get(16)[0].note.pitch).toBe(7)
    })
})

describe('Euclidean Fill integration (recomputeFlatNotes with real resolver)', () => {
    it('places euclidean fill notes between current and next note', () => {
        const pattern = {
            beatCount: 4,
            tracks: {
                T1: {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        N1: { beat: 0, beatStep: 0, euclideanFill: 2, every: 1, prob: 1 },
                        N2: { beat: 0, beatStep: 2, every: 1, prob: 1 },
                    },
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)

        expect(result.has(0)).toBe(true)
        expect(result.has(8)).toBe(true)
        expect(result.has(16)).toBe(true)
        expect(result.get(0).length).toBe(1)
        expect(result.get(8).length).toBe(1)
        expect(result.get(16).length).toBe(1)
    })

    it('distributes multiple euclidean fills evenly', () => {
        const pattern = {
            beatCount: 4,
            tracks: {
                T1: {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        N1: { beat: 0, beatStep: 0, euclideanFill: 4, every: 1, prob: 1 },
                        N2: { beat: 1, beatStep: 0, every: 1, prob: 1 },
                    },
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)

        expect(result.has(0)).toBe(true)
        expect(result.has(8)).toBe(true)
        expect(result.has(16)).toBe(true)
        expect(result.has(24)).toBe(true)
        expect(result.has(32)).toBe(true)
        expect(result.size).toBe(5)
    })

    it('does not place fill notes beyond pattern length', () => {
        const pattern = {
            beatCount: 1,
            tracks: {
                T1: {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        N1: { beat: 0, beatStep: 0, euclideanFill: 5, every: 1, prob: 1 },
                    },
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)

        // k=5 pulses over the 16 step span → onsets at steps 0,3,6,9,12;
        // only step 3 (tick 24) fits inside the 1 beat pattern.
        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([0, 24])
    })

    it('clamps k >= span to a full roll without duplicates', () => {
        const pattern = {
            beatCount: 4,
            tracks: {
                T1: {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        N1: { beat: 0, beatStep: 0, euclideanFill: 16, every: 1, prob: 1 },
                        N2: { beat: 1, beatStep: 0, every: 1, prob: 1 },
                    },
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)

        // base + every step of the 4 step span → 5 ticks, no repeated positions
        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([0, 8, 16, 24, 32])
    })

    it('euclideanRotation shifts the fill positions by whole steps', () => {
        const pattern = {
            beatCount: 4,
            tracks: {
                T1: {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        N1: { beat: 0, beatStep: 0, euclideanFill: 2, euclideanRotation: 1, every: 1, prob: 1 },
                        N2: { beat: 1, beatStep: 0, every: 1, prob: 1 },
                    },
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)

        // k=2 on 4 steps → onset at step 2, rotated by 1 → step 3 (tick 24)
        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([0, 24, 32])
    })

    it('euclidean fill with arp applies pitch offsets', () => {
        const pattern = {
            beatCount: 4,
            tracks: {
                T1: {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        N1: {
                            beat: 0,
                            beatStep: 0,
                            euclideanFill: 2,
                            arp: { intervals: [0, 7], mode: 'up' },
                            retriggerNum: 1,
                            every: 1,
                            prob: 1,
                        },
                        N2: { beat: 1, beatStep: 0, every: 1, prob: 1 },
                    },
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)

        expect(result.has(0)).toBe(true)
        expect(result.has(16)).toBe(true)
        expect(result.get(0)[0].note.pitch).toBe(0)
        expect(result.get(16)[0].note.pitch).toBe(7)
    })
})

// ─── Full Pattern to FlatNotes ───────────────────────────────────────────────

describe('Full Pattern to FlatNotes (recomputeFlatNotes)', () => {
    it('respects track loops and pattern boundaries', () => {
        const pattern = {
            beatCount: 2,
            tracks: {
                T1: {
                    name: 'T1',
                    beatCount: 1,
                    stepsPerBeat: 4,
                    notes: {
                        N1: { beat: 0, beatStep: 0, pitch: 60, prob: 1, every: 1 },
                    },
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)

        expect(result.size).toBe(2)
        expect(result.has(0)).toBe(true)
        expect(result.has(32)).toBe(true)
    })

    it('plays notes located after the loop point once but does not repeat them', () => {
        const pattern = {
            beatCount: 4,
            tracks: {
                T1: {
                    name: 'T1',
                    beatCount: 1,
                    stepsPerBeat: 4,
                    notes: {
                        N1: { beat: 0, beatStep: 0, pitch: 60 },
                        N2: { beat: 2, beatStep: 0, pitch: 62 },
                    },
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)

        expect(result.get(0)).toBeDefined()
        expect(result.get(32)).toBeDefined()
        expect(result.get(64)).toBeDefined()
        expect(result.get(96)).toBeDefined()

        const notesAt64 = result.get(64)
        expect(notesAt64.some((fn) => fn.note.pitch === 62)).toBe(true)
        expect(notesAt64.some((fn) => fn.note.pitch === 60)).toBe(true)

        const notesAt96 = result.get(96)
        expect(notesAt96.length).toBe(1)
        expect(notesAt96[0].note.pitch).toBe(60)
    })

    it('tiles note at 1:2 with loopAtStep=3 across 4 beats', () => {
        const pattern = {
            beatCount: 4,
            tracks: {
                T1: {
                    name: 'T1',
                    stepsPerBeat: 4,
                    loopAtStep: 0 * 4 + 3,
                    notes: [{ beat: 0, beatStep: 1, pitch: 60, prob: 1, every: 1 }],
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)

        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([8, 32, 56, 80, 104])

        for (const tick of ticks) {
            expect(result.get(tick).length).toBe(1)
            expect(result.get(tick)[0].note.pitch).toBe(60)
        }
    })

    it('tiles note at 2:1 with loopAtStep=6 across 4 beats', () => {
        const pattern = {
            beatCount: 4,
            tracks: {
                T1: {
                    name: 'T1',
                    stepsPerBeat: 4,
                    loopAtStep: 1 * 4 + 2,
                    notes: [{ beat: 1, beatStep: 0, pitch: 72, prob: 1, every: 1 }],
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)
        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([32, 80])
    })

    it('does not tile notes that fall at or beyond the loop boundary', () => {
        const pattern = {
            beatCount: 4,
            tracks: {
                T1: {
                    name: 'T1',
                    stepsPerBeat: 4,
                    loopAtStep: 0 * 4 + 3,
                    notes: [{ beat: 0, beatStep: 3, pitch: 48, prob: 1, every: 1 }],
                },
            },
        }
        const result = recomputeFlatNotes(pattern, 0, 32)
        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([24])
    })
})

// ─── Complex Pattern Tests ───────────────────────────────────────────────────

describe('complex pattern combinations', () => {
    it('every=2 + retriggerNum=4 on 4-beat pattern', () => {
        const pattern = buildPattern({ every: 2, pos: 0, retriggerNum: 4, rate: 8 }, { beatCount: 4 }, 4)
        expect(countNotes(pattern, 0)).toBe(4)
        expect(countNotes(pattern, 1)).toBe(0)
        expect(countNotes(pattern, 2)).toBe(4)
    })

    it('arp + a 1-beat loop on a 4-beat pattern', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, rate: 8 },
            { beatCount: 4, loopAtStep: 4 },
            4,
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(12)
        const beat0 = notes.filter((n) => n.tick >= 0 && n.tick < 32)
        expect(beat0.map((n) => n.note.pitch).sort((a, b) => a - b)).toEqual([0, 4, 7])
    })

    it('multiple tracks with different parameters', () => {
        const kickNote = { beat: 0, beatStep: 0, every: 1, velocity: 0.9 }
        const snareNote = { beat: 0, beatStep: 2, every: 2, pos: 0, velocity: 0.7 }
        const pattern = {
            name: 'Multi',
            bpm: 120,
            beatCount: 2,
            tracks: {
                KICK: { name: 'KICK', beatCount: 2, stepsPerBeat: 4, notes: { N0: kickNote } },
                SNARE: { name: 'SNARE', beatCount: 2, stepsPerBeat: 4, notes: { N2: snareNote } },
            },
        }
        expect(countNotes(pattern, 0)).toBe(2)
        expect(countNotes(pattern, 1)).toBe(1)
    })
})

// ─── Parameterized: computeTickSpacing ────────────────────────────────────────

describe.each(PARAM_SETS)('computeTickSpacing — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat) => {
    it('rate=1 spacing uses getStepSpacing(1)=1/8', () => {
        const expected = Math.round((32 / stepsPerBeat) * 0.125)
        expect(computeTickSpacing({ stepsPerBeat }, 1)).toBe(expected)
    })

    it('rate=8 spacing equals TICK / stepsPerBeat', () => {
        const expected = Math.round(32 / stepsPerBeat)
        expect(computeTickSpacing({ stepsPerBeat }, 8)).toBe(expected)
    })

    it('rate=4 spacing equals TICK / stepsPerBeat / 2', () => {
        const expected = Math.round((32 / stepsPerBeat) * 0.5)
        expect(computeTickSpacing({ stepsPerBeat }, 4)).toBe(expected)
    })

    it('rate=2 spacing equals TICK / stepsPerBeat / 4', () => {
        const expected = Math.round((32 / stepsPerBeat) * 0.25)
        expect(computeTickSpacing({ stepsPerBeat }, 2)).toBe(expected)
    })
})

// ─── Parameterized: computeNbTickForLoop ──────────────────────────────────────

describe.each(PARAM_SETS)('computeNbTickForLoop — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
    it('default loop equals beatCount * TICK', () => {
        const track = { beatCount, stepsPerBeat }
        expect(computeNbTickForLoop(track)).toBe(beatCount * TICK)
    })

    it('a 1-beat loop loops every TICK', () => {
        const track = { beatCount, stepsPerBeat, loopAtStep: stepsPerBeat }
        expect(computeNbTickForLoop(track)).toBe(TICK)
    })

    it('a beatCount/2 loop loops at half the pattern', () => {
        // a 1-beat pattern has no half: 0 steps is not a loop, it is "no explicit
        // loop point", so the smallest loop a 1-beat pattern can have is 1 beat
        const half = Math.max(1, Math.floor(beatCount / 2))
        const track = { beatCount, stepsPerBeat, loopAtStep: half * stepsPerBeat }
        expect(computeNbTickForLoop(track)).toBe(half * TICK)
    })

    // every = passes of the pattern, not steps of the grid: a note with every 2
    // fires on passes 0, 2, 4… and never appears twice within one pass.
    it('every counts pattern passes, pos shifts which pass fires first', () => {
        expect(isTriggered(0, 1, 0)).toBe(true)
        expect(isTriggered(0, 1, 1)).toBe(true)
        // every 2 → only even passes
        expect([0, 1, 2, 3].map((pass) => isTriggered(0, 2, pass))).toEqual([true, false, true, false])
        // pos 1 → the odd passes instead
        expect([0, 1, 2, 3].map((pass) => isTriggered(1, 2, pass))).toEqual([false, true, false, true])
        // pos wraps inside the cycle
        expect(isTriggered(3, 2, 1)).toBe(true)
    })

    it('loopAtStep 0 and null mean "loop the whole track", not "no loop"', () => {
        for (const loopAtStep of [0, null, undefined]) {
            const track = { beatCount, stepsPerBeat, loopAtStep }
            expect(computeNbTickForLoop(track), `loopAtStep=${loopAtStep}`).toBe(beatCount * TICK)
        }
    })
})

// ─── Parameterized: expandLoopOccurrences ─────────────────────────────────────

describe.each(PARAM_SETS)('expandLoopOccurrences — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
    const patternTicks = beatCount * TICK

    it('tiles at TICK intervals from base 0', () => {
        const result = expandLoopOccurrences(0, TICK, patternTicks)
        const expected = []
        for (let t = 0; t < patternTicks; t += TICK) expected.push(t)
        expect(result).toEqual(expected)
    })

    it('tiles from baseTick > 0 at TICK intervals', () => {
        const base = 16
        const result = expandLoopOccurrences(base, TICK, patternTicks)
        const expected = []
        for (let t = base; t < patternTicks; t += TICK) expected.push(t)
        expect(result).toEqual(expected)
    })

    it('single occurrence when loop covers full pattern', () => {
        expect(expandLoopOccurrences(0, patternTicks, patternTicks)).toEqual([0])
    })

    it('single occurrence when baseTick >= loop', () => {
        const loop = TICK
        const base = loop
        expect(expandLoopOccurrences(base, loop, patternTicks)).toEqual([base])
    })
})

// ─── Parameterized: recomputeFlatNotes tick positions ─────────────────────────

describe.each(PARAM_SETS)('recomputeFlatNotes — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
    it('single note at beat 0 appears at tick 0', () => {
        const pattern = buildPattern({}, { stepsPerBeat, beatCount }, beatCount)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(1)
        expect(notes[0].tick).toBe(0)
    })

    // skipped, not passed: an early `return` would report the beatCount=1 row as a
    // green test that never ran an assertion
    it.skipIf(beatCount <= 1)('single note at beat 1 appears at tick TICK', () => {
        const pattern = buildPattern({ beat: 1 }, { stepsPerBeat, beatCount }, beatCount)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(1)
        expect(notes[0].tick).toBe(TICK)
    })

    it('four-on-the-floor produces beatCount notes', () => {
        const track = buildPattern({}, { stepsPerBeat, beatCount }, beatCount).tracks.T1
        track.notes = {}
        for (let b = 0; b < beatCount; b++) {
            track.notes[`N${b}`] = {
                beat: b,
                beatStep: 0,
                velocity: 0.8,
                pitch: 0,
                pan: 0,
                arp: null,
                every: 1,
                pos: 0,
                prob: 1,
                arpTriggerProbability: 1,
                retriggerNum: 1,
                rate: 1,
                euclideanFill: 0,
            }
        }
        const pattern = { name: 'Test', bpm, beatCount, tracks: { T1: track } }
        expect(countNotes(pattern)).toBe(beatCount)
    })

    it('four-on-the-floor ticks are b * TICK', () => {
        const track = buildPattern({}, { stepsPerBeat, beatCount }, beatCount).tracks.T1
        track.notes = {}
        for (let b = 0; b < beatCount; b++) {
            track.notes[`N${b}`] = {
                beat: b,
                beatStep: 0,
                velocity: 0.8,
                pitch: 0,
                pan: 0,
                arp: null,
                every: 1,
                pos: 0,
                prob: 1,
                arpTriggerProbability: 1,
                retriggerNum: 1,
                rate: 1,
                euclideanFill: 0,
            }
        }
        const pattern = { name: 'Test', bpm, beatCount, tracks: { T1: track } }
        const notes = getAllNotes(pattern)
        const expected = []
        for (let b = 0; b < beatCount; b++) expected.push(b * TICK)
        expect(notes.map((n) => n.tick)).toEqual(expected)
    })

    it('retriggerNum=3 produces 3 notes per note occurrence', () => {
        const track = buildPattern({}, { stepsPerBeat, beatCount }, beatCount).tracks.T1
        track.notes = {}
        for (let b = 0; b < beatCount; b++) {
            track.notes[`N${b}`] = {
                beat: b,
                beatStep: 0,
                velocity: 0.8,
                pitch: 0,
                pan: 0,
                arp: null,
                every: 1,
                pos: 0,
                prob: 1,
                arpTriggerProbability: 1,
                retriggerNum: 3,
                rate: 1,
                euclideanFill: 0,
            }
        }
        const pattern = { name: 'Test', bpm, beatCount, tracks: { T1: track } }
        expect(countNotes(pattern)).toBe(beatCount * 3)
    })

    it('retriggerNum=4 with rate=8 uses correct tick spacing', () => {
        const pattern = buildPattern({ retriggerNum: 4, rate: 8 }, { stepsPerBeat, beatCount }, beatCount)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        const spacing = computeTickSpacing({ stepsPerBeat }, 8)
        const expected = [0, spacing, spacing * 2, spacing * 3]
        expect(notes.map((n) => n.tick)).toEqual(expected)
    })

    it('retriggerNum=4 with rate=4 uses correct tick spacing', () => {
        const pattern = buildPattern({ retriggerNum: 4, rate: 4 }, { stepsPerBeat, beatCount }, beatCount)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        const spacing = computeTickSpacing({ stepsPerBeat }, 4)
        const expected = [0, spacing, spacing * 2, spacing * 3]
        expect(notes.map((n) => n.tick)).toEqual(expected)
    })

    it('note at beatStep positions reflects stepsPerBeat resolution', () => {
        const track = buildPattern({}, { stepsPerBeat, beatCount }, beatCount).tracks.T1
        track.notes = {}
        for (let s = 0; s < stepsPerBeat; s++) {
            track.notes[`N${s}`] = {
                beat: 0,
                beatStep: s,
                velocity: 0.8,
                pitch: 0,
                pan: 0,
                arp: null,
                every: 1,
                pos: 0,
                prob: 1,
                arpTriggerProbability: 1,
                retriggerNum: 1,
                rate: 1,
                euclideanFill: 0,
            }
        }
        const pattern = { name: 'Test', bpm, beatCount, tracks: { T1: track } }
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(stepsPerBeat)
        for (let s = 0; s < stepsPerBeat; s++) {
            const expectedTick = Math.round((s * TICK) / stepsPerBeat)
            expect(notes[s].tick).toBe(expectedTick)
        }
    })

    it('a 1-beat loop tiles note at TICK intervals', () => {
        const pattern = buildPattern({}, { stepsPerBeat, beatCount, loopAtStep: stepsPerBeat }, beatCount)
        const notes = getAllNotes(pattern)
        const expected = []
        for (let t = 0; t < beatCount * TICK; t += TICK) expected.push(t)
        expect(notes.map((n) => n.tick)).toEqual(expected)
    })

    it('every=2 + retriggerNum=4 fires correctly per loop', () => {
        const pattern = buildPattern(
            { every: 2, pos: 0, retriggerNum: 4, rate: 1 },
            { stepsPerBeat, beatCount },
            beatCount,
        )
        expect(countNotes(pattern, 0)).toBe(4)
        expect(countNotes(pattern, 1)).toBe(0)
        expect(countNotes(pattern, 2)).toBe(4)
    })
})

describe('computeTickForNote', () => {
    it('is exactly stepToTick (single tick formula, no local copy)', () => {
        const cases = [
            [0, 0, 4, 32],
            [1, 0, 4, 32],
            [0, 3, 4, 32],
            [3, 7, 8, 32],
            [2, 1, 2, 32],
            [5, 0, 4, 16],
            [0, 9, 4, 32],
            [2, 0, 1, 32],
        ]
        for (const [beat, beatStep, stepsPerBeat, tick] of cases) {
            const note = { beat, beatStep }
            const track = { stepsPerBeat }
            const legacy = beat * tick + Math.round((beatStep * tick) / stepsPerBeat)
            expect(computeTickForNote(note, track, tick)).toBe(legacy)
            expect(computeTickForNote(note, track, tick)).toBe(
                stepToTick(getNoteAbsoluteStep(note, stepsPerBeat), stepsPerBeat, tick),
            )
        }
    })

    it('normalizes an invalid beat to 0 instead of producing NaN', () => {
        expect(computeTickForNote({ beat: 'x', beatStep: 0 }, { stepsPerBeat: 4 }, 32)).toBe(0)
    })
})

describe('step resolver (patterns/step_resolver.js)', () => {
    const makeTrack = (notes, opts = {}) => ({
        name: 'T1',
        beatCount: 4,
        stepsPerBeat: 4,
        loopAtStep: 16,
        notes,
        ...opts,
    })

    it('returns the next occupied step', () => {
        const track = makeTrack([
            { beat: 0, beatStep: 0 },
            { beat: 2, beatStep: 0 },
        ])
        expect(createStepResolver(track)({ beat: 0, beatStep: 0 })).toBe(8)
    })

    it('clamps the span at the loop point when it sits before the next note', () => {
        const track = makeTrack(
            [
                { beat: 0, beatStep: 0 },
                { beat: 2, beatStep: 2 },
            ],
            { loopAtStep: 6 },
        )
        expect(createStepResolver(track)({ beat: 0, beatStep: 0 })).toBe(6)
    })

    it('keeps the next note when it comes before the loop point', () => {
        const track = makeTrack(
            [
                { beat: 0, beatStep: 0 },
                { beat: 1, beatStep: 0 },
            ],
            { loopAtStep: 12 },
        )
        expect(createStepResolver(track)({ beat: 0, beatStep: 0 })).toBe(4)
    })

    it('returns the track end when nothing follows', () => {
        const track = makeTrack([{ beat: 0, beatStep: 0 }])
        expect(createStepResolver(track)({ beat: 0, beatStep: 0 })).toBe(16)
    })

    it('ignores a loop point before the note', () => {
        const track = makeTrack([{ beat: 3, beatStep: 0 }], { loopAtStep: 4 })
        expect(createStepResolver(track)({ beat: 3, beatStep: 0 })).toBe(16)
    })

    it('supports notes stored as a map', () => {
        const track = makeTrack({
            '0:0': { beat: 0, beatStep: 0 },
            '1:2': { beat: 1, beatStep: 2 },
        })
        expect(createStepResolver(track)({ beat: 0, beatStep: 0 })).toBe(6)
    })

    it('recomputeFlatNotes observes note mutations without any invalidation step', () => {
        // Regression: the former track-level cache survived mutations that skip
        // applyFlatNotes (randomize / compact / clean / slider edits), so WAV
        // export kept stale euclid spans while MIDI export rebuilt them.
        const track = makeTrack([
            { beat: 0, beatStep: 0, euclideanFill: 2 },
            { beat: 2, beatStep: 0 },
        ])
        const pattern = { name: 'P', beatCount: 4, bpm: 120, tracks: { T1: track } }

        const before = [...recomputeFlatNotes(structuredClone(pattern), 0).keys()].sort((a, b) => a - b)
        expect(before).toEqual([0, 32, 64])

        track.notes.push({ beat: 1, beatStep: 0 })
        const after = [...recomputeFlatNotes(pattern, 0).keys()].sort((a, b) => a - b)
        expect(after).toEqual([0, 16, 32, 64])
    })

    it('keeps nothing on the track and rebuilds the snapshot on the next pass', () => {
        const track = makeTrack([{ beat: 0, beatStep: 0 }], { loopAtStep: 16 })
        const pass = createStepResolver(track)
        expect(pass(track.notes[0])).toBe(16)

        track.notes.push({ beat: 2, beatStep: 0 })
        expect(createStepResolver(track)(track.notes[0])).toBe(8)
        expect(track._occupiedSet).toBeUndefined()
    })
})
