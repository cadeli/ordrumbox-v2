/**
 * Pattern engine tests — triggers, retriggers, arpeggios, loop points,
 * probability, euclidean fill, and full computeFlatNotesFromPattern.
 *
 * These are pure-logic tests (no audio rendering).
 */
import { describe, it, expect, vi } from 'vitest'
import {
    computeFlatNotesFromPattern,
    isTrigged,
    isProbabilityTrigged,
    normalizeArp,
    generateSubNotes,
    generateSubNotesWithEuclidean,
    computeTickSpacing,
    computeNbTickForLoop,
    expandLoopOccurrences,
} from '../src/patterns/engine.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPattern(noteOverrides = {}, trackOverrides = {}, nbBeats = 4) {
    const note = {
        beat: 0, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0,
        arp: null, every: 1, pos: 0, prob: 1,
        arpTriggerProbability: 1, retriggerNum: 1, rate: 1,
        euclidianFill: 0,
        ...noteOverrides,
    }
    const track = {
        name: 'T1', nbBeats: 4, stepsPerBeat: 4, mute: false,
        loopAtStep: undefined, loopPointBeat: undefined, loopPointStep: undefined,
        swingAmount: 0, swingResolution: 4, velocity: 1, pan: 0, pitch: 0,
        notes: { N0: note },
        ...trackOverrides,
    }
    return { name: 'Test', bpm: 120, nbBeats, tracks: { T1: track } }
}

function countNotes(pattern, loop = 0) {
    const flatNotes = computeFlatNotesFromPattern(pattern, loop)
    let count = 0
    for (const notes of flatNotes.values()) count += notes.length
    return count
}

function getAllNotes(pattern, loop = 0) {
    const flatNotes = computeFlatNotesFromPattern(pattern, loop)
    const all = []
    for (const notes of flatNotes.values()) all.push(...notes)
    return all.sort((a, b) => a.tick - b.tick)
}

// ─── every / pos Tests ─────────────────────────────────────────

describe('every / pos', () => {
    it('every=1 fires on every loop', () => {
        expect(isTrigged(0, 1, 0)).toBe(true)
        expect(isTrigged(0, 1, 1)).toBe(true)
        expect(isTrigged(0, 1, 5)).toBe(true)
    })

    it('every=2, phase=0 fires on even loops', () => {
        expect(isTrigged(0, 2, 0)).toBe(true)
        expect(isTrigged(0, 2, 1)).toBe(false)
        expect(isTrigged(0, 2, 2)).toBe(true)
        expect(isTrigged(0, 2, 3)).toBe(false)
    })

    it('every=2, phase=1 fires on odd loops', () => {
        expect(isTrigged(1, 2, 0)).toBe(false)
        expect(isTrigged(1, 2, 1)).toBe(true)
        expect(isTrigged(1, 2, 2)).toBe(false)
        expect(isTrigged(1, 2, 3)).toBe(true)
    })

    it('every=4, phase=1 fires on loops 3,7,11,...', () => {
        expect(isTrigged(1, 4, 0)).toBe(false)
        expect(isTrigged(1, 4, 1)).toBe(false)
        expect(isTrigged(1, 4, 2)).toBe(false)
        expect(isTrigged(1, 4, 3)).toBe(true)
        expect(isTrigged(1, 4, 7)).toBe(true)
    })

    it('every=3, phase=0 fires on loops 0,3,6,...', () => {
        expect(isTrigged(0, 3, 0)).toBe(true)
        expect(isTrigged(0, 3, 1)).toBe(false)
        expect(isTrigged(0, 3, 2)).toBe(false)
        expect(isTrigged(0, 3, 3)).toBe(true)
    })

    it('pattern with every=2 produces notes only on matching loops', () => {
        const pattern = buildPattern({ every: 2, pos: 0 }, { nbBeats: 1 }, 1)
        expect(countNotes(pattern, 0)).toBe(1)
        expect(countNotes(pattern, 1)).toBe(0)
        expect(countNotes(pattern, 2)).toBe(1)
    })

    it('pattern with every=2 phase=1 produces notes only on odd loops', () => {
        const pattern = buildPattern({ every: 2, pos: 1 }, { nbBeats: 1 }, 1)
        expect(countNotes(pattern, 0)).toBe(0)
        expect(countNotes(pattern, 1)).toBe(1)
    })
})

// ─── isProbabilityTrigged ──────────────────────────────────────

describe('isProbabilityTrigged', () => {
    it('always returns true for probability 1', () => {
        expect(isProbabilityTrigged(1)).toBe(true)
    })

    it('always returns false for probability 0', () => {
        expect(isProbabilityTrigged(0)).toBe(false)
    })

    it('uses random function', () => {
        const mockRandom = vi.fn()
        mockRandom.mockReturnValueOnce(0.1).mockReturnValueOnce(0.9)
        expect(isProbabilityTrigged(0.5, mockRandom)).toBe(true)
        expect(isProbabilityTrigged(0.5, mockRandom)).toBe(false)
    })
})

// ─── retriggerNum / rate Tests ───────────────────────────────────────

describe('retriggerNum / rate', () => {
    it('retriggerNum=1 produces 1 note', () => {
        const pattern = buildPattern({ retriggerNum: 1 }, { nbBeats: 1 }, 1)
        expect(countNotes(pattern)).toBe(1)
    })

    it('retriggerNum=4 produces 4 notes', () => {
        const pattern = buildPattern({ retriggerNum: 4, rate: 1 }, { nbBeats: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        expect(notes.map(n => n.tick)).toEqual([0, 1, 2, 3])
    })

    it('retriggerNum=4 with rate=8 produces 4 notes with step spacing', () => {
        const pattern = buildPattern({ retriggerNum: 4, rate: 8 }, { nbBeats: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        expect(notes.map(n => n.tick)).toEqual([0, 8, 16, 24])
    })

    it('retriggerNum=3 with rate=4 produces 3 notes at half-step spacing', () => {
        const pattern = buildPattern({ retriggerNum: 3, rate: 4 }, { nbBeats: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(3)
        expect(notes.map(n => n.tick)).toEqual([0, 4, 8])
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
            arp: { intervals: [0, 12], mode: 'up' }
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
            { nbBeats: 1 }, 1
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(3)
        expect(notes.map(n => n.note.pitch)).toEqual([0, 4, 7])
    })

    it('arp mode "down" creates notes with descending pitch offsets', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'down' }, retriggerNum: 3, rate: 8 },
            { nbBeats: 1 }, 1
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(3)
        expect(notes.map(n => n.note.pitch)).toEqual([7, 4, 0])
    })

    it('arp mode "updown" cycles through the sequence', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'updown' }, retriggerNum: 4, rate: 8 },
            { nbBeats: 1 }, 1
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        expect(notes.map(n => n.note.pitch)).toEqual([0, 4, 7, 4])
    })

    it('arp cycles through intervals when retriggerNum > sequence length', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 6, rate: 4 },
            { nbBeats: 2 }, 2
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(6)
        expect(notes.map(n => n.note.pitch)).toEqual([0, 4, 7, 0, 4, 7])
    })

    it('arp with base pitch offset adds semitone to note.pitch', () => {
        const pattern = buildPattern(
            { pitch: 5, arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, rate: 8 },
            { nbBeats: 1 }, 1
        )
        const notes = getAllNotes(pattern)
        expect(notes.map(n => n.note.pitch)).toEqual([5, 9, 12])
    })
})

// ─── Loop Points Tests ────────────────────────────────────────────────────────

describe('loopPointBeat / loopPointStep', () => {
    it('default loop = track.nbBeats (no loop points)', () => {
        const track = { nbBeats: 4, stepsPerBeat: 4 }
        expect(computeNbTickForLoop(track)).toBe(128)
    })

    it('loopPointBeat=1 loops every beat', () => {
        const track = { nbBeats: 4, stepsPerBeat: 4, loopPointBeat: 1 }
        expect(computeNbTickForLoop(track)).toBe(32)
    })

    it('loopPointBeat=2 loops every 2 beats', () => {
        const track = { nbBeats: 4, stepsPerBeat: 4, loopPointBeat: 2 }
        expect(computeNbTickForLoop(track)).toBe(64)
    })

    it('note repeats at loop interval across pattern', () => {
        const pattern = buildPattern({}, { nbBeats: 4, loopPointBeat: 1 }, 4)
        const notes = getAllNotes(pattern)
        expect(notes.map(n => n.tick)).toEqual([0, 32, 64, 96])
    })

    it('note with loopPointBeat=2 repeats every 2 beats', () => {
        const pattern = buildPattern({}, { nbBeats: 4, loopPointBeat: 2 }, 4)
        const notes = getAllNotes(pattern)
        expect(notes.map(n => n.tick)).toEqual([0, 64])
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
        const pattern = buildPattern({ velocity: 0.6 }, { nbBeats: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.velocity).toBe(0.6)
    })

    it('default velocity is 0.8', () => {
        const pattern = buildPattern({}, { nbBeats: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.velocity).toBe(0.8)
    })

    it('pitch is preserved', () => {
        const pattern = buildPattern({ pitch: 5 }, { nbBeats: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.pitch).toBe(5)
    })

    it('pan is preserved', () => {
        const pattern = buildPattern({ pan: 0.5 }, { nbBeats: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.pan).toBe(0.5)
    })
})

// ─── Euclidean Fill ──────────────────────────────────────────────────────────

describe('Euclidean Fill (generateSubNotesWithEuclidean)', () => {
    const mockTrack = { stepsPerBeat: 4 }
    const mockNote = { beat: 0, beatStep: 0, euclidianFill: 1 }
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
            retriggerNum: 1
        }
        const flatNotes = new Map()
        generateSubNotesWithEuclidean(flatNotes, 0, mockTrack, note, 128, mockComputeNextStep, 32)

        expect(flatNotes.get(0)).toBeDefined()
        expect(flatNotes.get(0)[0].note.pitch).toBe(0)
        expect(flatNotes.get(16)).toBeDefined()
        expect(flatNotes.get(16)[0].note.pitch).toBe(7)
    })
})

describe('Euclidean Fill integration (computeFlatNotesFromPattern with real resolver)', () => {
    it('places euclidian fill notes between current and next note', () => {
        const pattern = {
            nbBeats: 4,
            tracks: {
                'T1': {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        'N1': { beat: 0, beatStep: 0, euclidianFill: 1, every: 1, prob: 1 },
                        'N2': { beat: 0, beatStep: 2, every: 1, prob: 1 }
                    }
                }
            }
        }
        const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

        expect(result.has(0)).toBe(true)
        expect(result.has(8)).toBe(true)
        expect(result.has(16)).toBe(true)
        expect(result.get(0).length).toBe(1)
        expect(result.get(8).length).toBe(1)
        expect(result.get(16).length).toBe(1)
    })

    it('distributes multiple euclidian fills evenly', () => {
        const pattern = {
            nbBeats: 4,
            tracks: {
                'T1': {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        'N1': { beat: 0, beatStep: 0, euclidianFill: 3, every: 1, prob: 1 },
                        'N2': { beat: 1, beatStep: 0, every: 1, prob: 1 }
                    }
                }
            }
        }
        const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

        expect(result.has(0)).toBe(true)
        expect(result.has(8)).toBe(true)
        expect(result.has(16)).toBe(true)
        expect(result.has(24)).toBe(true)
        expect(result.has(32)).toBe(true)
        expect(result.size).toBe(5)
    })

    it('does not place fill notes beyond pattern length', () => {
        const pattern = {
            nbBeats: 1,
            tracks: {
                'T1': {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        'N1': { beat: 0, beatStep: 0, euclidianFill: 5, every: 1, prob: 1 }
                    }
                }
            }
        }
        const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

        expect(result.has(0)).toBe(true)
        expect(result.has(21)).toBe(true)
        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([0, 21])
    })

    it('euclidian fill with arp applies pitch offsets', () => {
        const pattern = {
            nbBeats: 4,
            tracks: {
                'T1': {
                    name: 'T1',
                    stepsPerBeat: 4,
                    notes: {
                        'N1': { beat: 0, beatStep: 0, euclidianFill: 1, arp: { intervals: [0, 7], mode: 'up' }, retriggerNum: 1, every: 1, prob: 1 },
                        'N2': { beat: 1, beatStep: 0, every: 1, prob: 1 }
                    }
                }
            }
        }
        const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

        expect(result.has(0)).toBe(true)
        expect(result.has(16)).toBe(true)
        expect(result.get(0)[0].note.pitch).toBe(0)
        expect(result.get(16)[0].note.pitch).toBe(7)
    })
})

// ─── Full Pattern to FlatNotes ───────────────────────────────────────────────

describe('Full Pattern to FlatNotes (computeFlatNotesFromPattern)', () => {
    it('respects track loops and pattern boundaries', () => {
        const pattern = {
            nbBeats: 2,
            tracks: {
                'T1': {
                    name: 'T1',
                    nbBeats: 1,
                    stepsPerBeat: 4,
                    notes: {
                        'N1': { beat: 0, beatStep: 0, pitch: 60, prob: 1, every: 1 }
                    }
                }
            }
        }
        const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

        expect(result.size).toBe(2)
        expect(result.has(0)).toBe(true)
        expect(result.has(32)).toBe(true)
    })

    it('plays notes located after the loop point once but does not repeat them', () => {
        const pattern = {
            nbBeats: 4,
            tracks: {
                'T1': {
                    name: 'T1',
                    nbBeats: 1,
                    stepsPerBeat: 4,
                    notes: {
                        'N1': { beat: 0, beatStep: 0, pitch: 60 },
                        'N2': { beat: 2, beatStep: 0, pitch: 62 }
                    }
                }
            }
        }
        const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

        expect(result.get(0)).toBeDefined()
        expect(result.get(32)).toBeDefined()
        expect(result.get(64)).toBeDefined()
        expect(result.get(96)).toBeDefined()

        const notesAt64 = result.get(64)
        expect(notesAt64.some(fn => fn.note.pitch === 62)).toBe(true)
        expect(notesAt64.some(fn => fn.note.pitch === 60)).toBe(true)

        const notesAt96 = result.get(96)
        expect(notesAt96.length).toBe(1)
        expect(notesAt96[0].note.pitch).toBe(60)
    })

    it('tiles note at 1:2 with loopAtStep=3 across 4 beats', () => {
        const pattern = {
            nbBeats: 4,
            tracks: {
                'T1': {
                    name: 'T1',
                    stepsPerBeat: 4,
                    loopAtStep: 3,
                    loopPointBeat: 0,
                    loopPointStep: 3,
                    notes: [
                        { beat: 0, beatStep: 1, pitch: 60, prob: 1, every: 1 }
                    ]
                }
            }
        }
        const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([8, 32, 56, 80, 104])

        for (const tick of ticks) {
            expect(result.get(tick).length).toBe(1)
            expect(result.get(tick)[0].note.pitch).toBe(60)
        }
    })

    it('tiles note at 2:1 with loopAtStep=6 across 4 beats', () => {
        const pattern = {
            nbBeats: 4,
            tracks: {
                'T1': {
                    name: 'T1',
                    stepsPerBeat: 4,
                    loopAtStep: 6,
                    loopPointBeat: 1,
                    loopPointStep: 2,
                    notes: [
                        { beat: 1, beatStep: 0, pitch: 72, prob: 1, every: 1 }
                    ]
                }
            }
        }
        const result = computeFlatNotesFromPattern(pattern, 0, null, 32)
        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([32, 80])
    })

    it('does not tile notes that fall at or beyond the loop boundary', () => {
        const pattern = {
            nbBeats: 4,
            tracks: {
                'T1': {
                    name: 'T1',
                    stepsPerBeat: 4,
                    loopAtStep: 3,
                    loopPointBeat: 0,
                    loopPointStep: 3,
                    notes: [
                        { beat: 0, beatStep: 3, pitch: 48, prob: 1, every: 1 }
                    ]
                }
            }
        }
        const result = computeFlatNotesFromPattern(pattern, 0, null, 32)
        const ticks = [...result.keys()].sort((a, b) => a - b)
        expect(ticks).toEqual([24])
    })
})

// ─── Complex Pattern Tests ───────────────────────────────────────────────────

describe('complex pattern combinations', () => {
    it('every=2 + retriggerNum=4 on 4-beat pattern', () => {
        const pattern = buildPattern(
            { every: 2, pos: 0, retriggerNum: 4, rate: 8 },
            { nbBeats: 4 }, 4
        )
        expect(countNotes(pattern, 0)).toBe(4)
        expect(countNotes(pattern, 1)).toBe(0)
        expect(countNotes(pattern, 2)).toBe(4)
    })

    it('arp + loopPointBeat=1 on 4-beat pattern', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, rate: 8 },
            { nbBeats: 4, loopPointBeat: 1 }, 4
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(12)
        const beat0 = notes.filter(n => n.tick >= 0 && n.tick < 32)
        expect(beat0.map(n => n.note.pitch).sort((a, b) => a - b)).toEqual([0, 4, 7])
    })

    it('multiple tracks with different parameters', () => {
        const kickNote = { beat: 0, beatStep: 0, every: 1, velocity: 0.9 }
        const snareNote = { beat: 0, beatStep: 2, every: 2, pos: 0, velocity: 0.7 }
        const pattern = {
            name: 'Multi', bpm: 120, nbBeats: 2,
            tracks: {
                KICK: { name: 'KICK', nbBeats: 2, stepsPerBeat: 4, notes: { N0: kickNote } },
                SNARE: { name: 'SNARE', nbBeats: 2, stepsPerBeat: 4, notes: { N2: snareNote } },
            }
        }
        expect(countNotes(pattern, 0)).toBe(2)
        expect(countNotes(pattern, 1)).toBe(1)
    })
})
