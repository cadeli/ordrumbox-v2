/**
 * Pattern engine scheduling tests — verifies that triggers, retriggers,
 * arpeggios, and loop points produce the correct flat note scheduling.
 *
 * These are pure-logic tests (no audio rendering).
 */
import { describe, it, expect, vi } from 'vitest'
import {
    computeFlatNotesFromPattern,
    isTrigged,
    normalizeArp,
    generateSubNotes,
    computeTickSpacing,
    computeNbTickForLoop,
    expandLoopOccurrences,
} from '../src/patterns/engine.js'

vi.mock('../src/utils.js', async () => {
    return {
        default: {
            TWO_PI: Math.PI * 2,
            NOTE_DEFAULTS: {
                arpTriggerProbability: 1,
                retriggerNum: 1,
                retriggerStep: 1,
                triggerProbability: 1,
                triggerFreq: 1,
                triggerPhase: 0,
                euclidianFill: 0,
                pan: 0,
                pitch: 0,
                arp: null,
                velocity: 0.8,
            },
            getStepSpacing: vi.fn((value) => {
                if (value < 8) return value / 8
                return value - 7
            })
        }
    }
})

vi.mock('../src/ctrl/engine/defaults.js', async () => {
    return {
        default: {
            getNoteProp: vi.fn((note, key) => {
                if (key === 'retriggerNum') return note[key] ?? 1
                if (key === 'retriggerStep') return note[key] ?? 1
                if (key === 'triggerProbability') return note[key] ?? 1
                if (key === 'triggerFreq') return note[key] ?? 1
                if (key === 'triggerPhase') return note[key] ?? 0
                if (key === 'arpTriggerProbability') return note[key] ?? 1
                if (key === 'euclidianFill') return note[key] ?? 0
                if (key === 'velocity') return note[key] ?? 0.8
                if (key === 'pan') return note[key] ?? 0
                if (key === 'pitch') return note[key] ?? 0
                return note[key] ?? 0
            }),
            getTrackProp: vi.fn((track, key) => {
                if (key === 'bars') return track[key] ?? 4
                if (key === 'velocity') return track[key] ?? 1
                if (key === 'pan') return track[key] ?? 0
                if (key === 'pitch') return track[key] ?? 0
                return track[key] ?? 0
            })
        }
    }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPattern(noteOverrides = {}, trackOverrides = {}, nbBars = 4) {
    const note = {
        bar: 0, barStep: 0, velocity: 0.8, pitch: 0, pan: 0,
        arp: null, triggerFreq: 1, triggerPhase: 0, triggerProbability: 1,
        arpTriggerProbability: 1, retriggerNum: 1, retriggerStep: 1,
        euclidianFill: 0,
        ...noteOverrides,
    }
    const track = {
        name: 'T1', bars: 4, barQuantize: 4, mute: false,
        loopAtStep: undefined, loopPointBar: undefined, loopPointStep: undefined,
        swingAmount: 0, swingResolution: 4, velocity: 1, pan: 0, pitch: 0,
        notes: { N0: note },
        ...trackOverrides,
    }
    return { name: 'Test', bpm: 120, nbBars, tracks: { T1: track } }
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

// ─── triggerFreq / triggerPhase Tests ─────────────────────────────────────────

describe('triggerFreq / triggerPhase', () => {
    it('triggerFreq=1 fires on every loop', () => {
        expect(isTrigged(0, 1, 0)).toBe(true)
        expect(isTrigged(0, 1, 1)).toBe(true)
        expect(isTrigged(0, 1, 5)).toBe(true)
    })

    it('triggerFreq=2, phase=0 fires on even loops', () => {
        expect(isTrigged(0, 2, 0)).toBe(true)
        expect(isTrigged(0, 2, 1)).toBe(false)
        expect(isTrigged(0, 2, 2)).toBe(true)
        expect(isTrigged(0, 2, 3)).toBe(false)
    })

    it('triggerFreq=2, phase=1 fires on odd loops', () => {
        expect(isTrigged(1, 2, 0)).toBe(false)
        expect(isTrigged(1, 2, 1)).toBe(true)
        expect(isTrigged(1, 2, 2)).toBe(false)
        expect(isTrigged(1, 2, 3)).toBe(true)
    })

    it('triggerFreq=4, phase=1 fires on loops 3,7,11,...', () => {
        expect(isTrigged(1, 4, 0)).toBe(false)
        expect(isTrigged(1, 4, 1)).toBe(false)
        expect(isTrigged(1, 4, 2)).toBe(false)
        expect(isTrigged(1, 4, 3)).toBe(true)
        expect(isTrigged(1, 4, 7)).toBe(true)
    })

    it('triggerFreq=3, phase=0 fires on loops 0,3,6,...', () => {
        expect(isTrigged(0, 3, 0)).toBe(true)
        expect(isTrigged(0, 3, 1)).toBe(false)
        expect(isTrigged(0, 3, 2)).toBe(false)
        expect(isTrigged(0, 3, 3)).toBe(true)
    })

    it('pattern with triggerFreq=2 produces notes only on matching loops', () => {
        const pattern = buildPattern({ triggerFreq: 2, triggerPhase: 0 }, { bars: 1 }, 1)
        expect(countNotes(pattern, 0)).toBe(1)
        expect(countNotes(pattern, 1)).toBe(0)
        expect(countNotes(pattern, 2)).toBe(1)
    })

    it('pattern with triggerFreq=2 phase=1 produces notes only on odd loops', () => {
        const pattern = buildPattern({ triggerFreq: 2, triggerPhase: 1 }, { bars: 1 }, 1)
        expect(countNotes(pattern, 0)).toBe(0)
        expect(countNotes(pattern, 1)).toBe(1)
    })
})

// ─── retriggerNum / retriggerStep Tests ───────────────────────────────────────

describe('retriggerNum / retriggerStep', () => {
    it('retriggerNum=1 produces 1 note', () => {
        const pattern = buildPattern({ retriggerNum: 1 }, { bars: 1 }, 1)
        expect(countNotes(pattern)).toBe(1)
    })

    it('retriggerNum=4 produces 4 notes', () => {
        const pattern = buildPattern({ retriggerNum: 4, retriggerStep: 1 }, { bars: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        // retriggerStep=1 → spacing = 1/8 → tickSpacing = round(8*0.125) = 1
        expect(notes.map(n => n.tick)).toEqual([0, 1, 2, 3])
    })

    it('retriggerNum=4 with retriggerStep=8 produces 4 notes with step spacing', () => {
        const pattern = buildPattern({ retriggerNum: 4, retriggerStep: 8 }, { bars: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        expect(notes.map(n => n.tick)).toEqual([0, 8, 16, 24])
    })

    it('retriggerNum=3 with retriggerStep=4 produces 3 notes at half-step spacing', () => {
        const pattern = buildPattern({ retriggerNum: 3, retriggerStep: 4 }, { bars: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(3)
        expect(notes.map(n => n.tick)).toEqual([0, 4, 8])
    })

    it('computeTickSpacing returns correct values', () => {
        const track = { barQuantize: 4 }
        expect(computeTickSpacing(track, 1)).toBe(1)
        expect(computeTickSpacing(track, 4)).toBe(4)
        expect(computeTickSpacing(track, 8)).toBe(8)
        expect(computeTickSpacing(track, 16)).toBe(72)
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
            { arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, retriggerStep: 8 },
            { bars: 1 }, 1
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(3)
        expect(notes.map(n => n.note.pitch)).toEqual([0, 4, 7])
    })

    it('arp mode "down" creates notes with descending pitch offsets', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'down' }, retriggerNum: 3, retriggerStep: 8 },
            { bars: 1 }, 1
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(3)
        expect(notes.map(n => n.note.pitch)).toEqual([7, 4, 0])
    })

    it('arp mode "updown" cycles through the sequence', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'updown' }, retriggerNum: 4, retriggerStep: 8 },
            { bars: 1 }, 1
        )
        const notes = getAllNotes(pattern)
        expect(notes.length).toBe(4)
        expect(notes.map(n => n.note.pitch)).toEqual([0, 4, 7, 4])
    })

    it('arp cycles through intervals when retriggerNum > sequence length', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 6, retriggerStep: 4 },
            { bars: 2 }, 2
        )
        const notes = getAllNotes(pattern)
        // retriggerStep=4 → tickSpacing=4, ticks: 0,4,8,12,16,20 — all within 2-bar pattern (64 ticks)
        expect(notes.length).toBe(6)
        expect(notes.map(n => n.note.pitch)).toEqual([0, 4, 7, 0, 4, 7])
    })

    it('arp with base pitch offset adds semitone to note.pitch', () => {
        const pattern = buildPattern(
            { pitch: 5, arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, retriggerStep: 8 },
            { bars: 1 }, 1
        )
        const notes = getAllNotes(pattern)
        expect(notes.map(n => n.note.pitch)).toEqual([5, 9, 12])
    })
})

// ─── Loop Points Tests ────────────────────────────────────────────────────────

describe('loopPointBar / loopPointStep', () => {
    it('default loop = track.bars (no loop points)', () => {
        const track = { bars: 4, barQuantize: 4 }
        expect(computeNbTickForLoop(track)).toBe(128)
    })

    it('loopPointBar=1 loops every bar', () => {
        const track = { bars: 4, barQuantize: 4, loopPointBar: 1 }
        expect(computeNbTickForLoop(track)).toBe(32)
    })

    it('loopPointBar=2 loops every 2 bars', () => {
        const track = { bars: 4, barQuantize: 4, loopPointBar: 2 }
        expect(computeNbTickForLoop(track)).toBe(64)
    })

    it('note repeats at loop interval across pattern', () => {
        const pattern = buildPattern({}, { bars: 4, loopPointBar: 1 }, 4)
        const notes = getAllNotes(pattern)
        expect(notes.map(n => n.tick)).toEqual([0, 32, 64, 96])
    })

    it('note with loopPointBar=2 repeats every 2 bars', () => {
        const pattern = buildPattern({}, { bars: 4, loopPointBar: 2 }, 4)
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
        const pattern = buildPattern({ velocity: 0.6 }, { bars: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.velocity).toBe(0.6)
    })

    it('default velocity is 0.8', () => {
        const pattern = buildPattern({}, { bars: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.velocity).toBe(0.8)
    })

    it('pitch is preserved', () => {
        const pattern = buildPattern({ pitch: 5 }, { bars: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.pitch).toBe(5)
    })

    it('pan is preserved', () => {
        const pattern = buildPattern({ pan: 0.5 }, { bars: 1 }, 1)
        const notes = getAllNotes(pattern)
        expect(notes[0].note.pan).toBe(0.5)
    })
})

// ─── Complex Pattern Tests ───────────────────────────────────────────────────

describe('complex pattern combinations', () => {
    it('triggerFreq=2 + retriggerNum=4 on 4-bar pattern', () => {
        const pattern = buildPattern(
            { triggerFreq: 2, triggerPhase: 0, retriggerNum: 4, retriggerStep: 8 },
            { bars: 4 }, 4
        )
        expect(countNotes(pattern, 0)).toBe(4)
        expect(countNotes(pattern, 1)).toBe(0)
        expect(countNotes(pattern, 2)).toBe(4)
    })

    it('arp + loopPointBar=1 on 4-bar pattern', () => {
        const pattern = buildPattern(
            { arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, retriggerStep: 8 },
            { bars: 4, loopPointBar: 1 }, 4
        )
        const notes = getAllNotes(pattern)
        // 3 arp notes × 4 bars = 12 notes
        expect(notes.length).toBe(12)
        // First bar: pitches 0, 4, 7
        const bar0 = notes.filter(n => n.tick >= 0 && n.tick < 32)
        expect(bar0.map(n => n.note.pitch).sort((a, b) => a - b)).toEqual([0, 4, 7])
    })

    it('multiple tracks with different parameters', () => {
        const kickNote = { bar: 0, barStep: 0, triggerFreq: 1, velocity: 0.9 }
        const snareNote = { bar: 0, barStep: 2, triggerFreq: 2, triggerPhase: 0, velocity: 0.7 }
        const pattern = {
            name: 'Multi', bpm: 120, nbBars: 2,
            tracks: {
                KICK: { name: 'KICK', bars: 2, barQuantize: 4, notes: { N0: kickNote } },
                SNARE: { name: 'SNARE', bars: 2, barQuantize: 4, notes: { N2: snareNote } },
            }
        }
        // Loop 0: both tracks fire → 2 notes
        expect(countNotes(pattern, 0)).toBe(2)
        // Loop 1: only kick fires (snare triggerFreq=2) → 1 note
        expect(countNotes(pattern, 1)).toBe(1)
    })
})
