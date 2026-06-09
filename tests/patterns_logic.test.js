import { describe, it, expect, vi } from 'vitest'
import {
    computeFlatNotesFromPattern,
    isTrigged,
    isProbabilityTrigged,
    normalizeArp,
    generateSubNotes,
    generateSubNotesWithEuclidean
} from '../src/patterns/engine.js'

import MfDefaults from '../src/patterns/defaults.js'

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
                if (value < 8) {
                    return (value/8)
                } else {
                    return (value-7)
                } 
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
                return note[key] ?? 0
            }),
            getTrackProp: vi.fn((track, key) => {
                if (key === 'bars') return track[key] ?? 4
                return track[key] ?? 0
            })
        }
    }
})

describe('Pattern Engine Logic', () => {

    describe('isTrigged', () => {
        it('returns true when loop matches triggerFreq and phase', () => {
            // phase 0, freq 2: 0, 2, 4...
            expect(isTrigged(0, 2, 0)).toBe(true)
            expect(isTrigged(0, 2, 1)).toBe(false)
            expect(isTrigged(0, 2, 2)).toBe(true)

            // phase 1, freq 4: 1, 5, 9... (triggerPhase is offset)
            // Note: formula is (loop + triggerPhase) % triggerFreq === 0
            // If triggerPhase=1, loop=3 -> (3+1)%4 = 0
            expect(isTrigged(1, 4, 3)).toBe(true)
            expect(isTrigged(1, 4, 0)).toBe(false)
        })
    })

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

    describe('normalizeArp', () => {
        it('returns up sequence by default', () => {
            const arp = { intervals: [0, 7, 12], mode: 'up' }
            const result = normalizeArp(arp)
            expect(result.sequence).toEqual([0, 7, 12])
        })

        it('returns down sequence', () => {
            const arp = { intervals: [0, 7, 12], mode: 'down' }
            const result = normalizeArp(arp)
            expect(result.sequence).toEqual([12, 7, 0])
        })

        it('returns updown sequence', () => {
            const arp = { intervals: [0, 7, 12], mode: 'updown' }
            const result = normalizeArp(arp)
            // up: 0, 7, 12. descending: 7. Result: 0, 7, 12, 7
            expect(result.sequence).toEqual([0, 7, 12, 7])
        })

        it('ensures 0 is included', () => {
            const arp = [7, 12]
            const result = normalizeArp(arp)
            expect(result.sequence).toEqual([0, 7, 12])
        })
    })

    describe('Arpeggios and Retriggers (generateSubNotes)', () => {
        const mockTrack = { barQuantize: 16 }
        const mockNote = { bar: 0, barStep: 0 }

        it('generates multiple notes for retrigger', () => {
            const note = { ...mockNote, retriggerNum: 4, retriggerStep: 8 }
            const flatNotes = new Map()
            generateSubNotes(flatNotes, 0, mockTrack, note, 128, 32)
            
            // tickSpacing = Math.round((32 / 16) * Utils.getStepSpacing(8)) 
            // Utils.getStepSpacing(8) = 8-7 = 1
            // tickSpacing = 2 * 1 = 2
            // Ticks: 0, 2, 4, 6
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
                retriggerStep: 8,
                arp: { intervals: [0, 12], mode: 'up' }
            }
            const flatNotes = new Map()
            generateSubNotes(flatNotes, 0, mockTrack, note, 128, 32)
            
            // Ticks: 0 (pitch+0), 2 (pitch+12), 4 (pitch+0)
            expect(flatNotes.get(0)).toBeDefined()
            expect(flatNotes.get(0)[0].note.pitch).toBe(0)
            expect(flatNotes.get(2)).toBeDefined()
            expect(flatNotes.get(2)[0].note.pitch).toBe(12)
            expect(flatNotes.get(4)).toBeDefined()
            expect(flatNotes.get(4)[0].note.pitch).toBe(0)
        })
    })

    describe('Euclidean Fill (generateSubNotesWithEuclidean)', () => {
        const mockTrack = { barQuantize: 4 }
        const mockNote = { bar: 0, barStep: 0, euclidianFill: 1 }
        const mockComputeNextStep = () => 4 // next note at start of next bar

        it('adds extra notes between current and next note', () => {
            const flatNotes = new Map()
            generateSubNotesWithEuclidean(flatNotes, 0, mockTrack, mockNote, 128, mockComputeNextStep, 32)
            
            // baseTick = 0
            // startStep = 0, endStep = 4, span = 4
            // tickOffset = (1 * 4 * (32/4)) / (1 + 1) = (1 * 4 * 8) / 2 = 16
            expect(flatNotes.size).toBe(2)
            expect(flatNotes.has(0)).toBe(true)
            expect(flatNotes.has(16)).toBe(true)
        })

        it('applies arp to euclidean fill', () => {
            const note = { 
                ...mockNote, 
                pitch: 0,
                arp: { intervals: [0, 7], mode: 'up' },
                retriggerNum: 1 // Only 1 base note
            }
            const flatNotes = new Map()
            generateSubNotesWithEuclidean(flatNotes, 0, mockTrack, note, 128, mockComputeNextStep, 32)
            
            // sequence: [0, 7]
            // Note at 0: arpIndex 0 -> offset 0
            // Fill at 16: arpIndex = retriggerNum + i - 1 = 1 + 1 - 1 = 1 -> offset 7
            expect(flatNotes.get(0)).toBeDefined()
            expect(flatNotes.get(0)[0].note.pitch).toBe(0)
            expect(flatNotes.get(16)).toBeDefined()
            expect(flatNotes.get(16)[0].note.pitch).toBe(7)
        })
    })

    describe('Euclidean Fill integration (computeFlatNotesFromPattern with real resolver)', () => {
        it('places euclidian fill notes between current and next note', () => {
            const pattern = {
                nbBars: 4,
                tracks: {
                    'T1': {
                        name: 'T1',
                        barQuantize: 4,
                        notes: {
                            'N1': { bar: 0, barStep: 0, euclidianFill: 1, triggerFreq: 1, triggerProbability: 1 },
                            'N2': { bar: 0, barStep: 2, triggerFreq: 1, triggerProbability: 1 }
                        }
                    }
                }
            }
            const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

            // N1 at barStep 0 -> tick 0, N2 at barStep 2 -> tick 16
            // Occupied positions: {0, 2}. Resolver finds next at step 2.
            // startStep=0, endStep=2, span=2
            // fill tickOffset = (1 * 2 * (32/4)) / (1+1) = (2*8)/2 = 8
            // fill note at tick 8
            expect(result.has(0)).toBe(true)
            expect(result.has(8)).toBe(true)
            expect(result.has(16)).toBe(true)
            expect(result.get(0).length).toBe(1)
            expect(result.get(8).length).toBe(1)
            expect(result.get(16).length).toBe(1)
        })

        it('distributes multiple euclidian fills evenly', () => {
            const pattern = {
                nbBars: 4,
                tracks: {
                    'T1': {
                        name: 'T1',
                        barQuantize: 4,
                        notes: {
                            'N1': { bar: 0, barStep: 0, euclidianFill: 3, triggerFreq: 1, triggerProbability: 1 },
                            'N2': { bar: 1, barStep: 0, triggerFreq: 1, triggerProbability: 1 }
                        }
                    }
                }
            }
            const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

            // N1 at barStep 0 -> tick 0, N2 at bar 1 barStep 0 -> tick 32
            // Occupied: {0, 4}. Resolver finds next at step 4.
            // startStep=0, endStep=4, span=4
            // tickOffset(i) = Math.round((i * 4 * (32/4)) / 4) = Math.round(i * 8)
            // i=1: 8, i=2: 16, i=3: 24
            expect(result.has(0)).toBe(true)
            expect(result.has(8)).toBe(true)
            expect(result.has(16)).toBe(true)
            expect(result.has(24)).toBe(true)
            expect(result.has(32)).toBe(true)
            expect(result.size).toBe(5)
        })

        it('does not place fill notes beyond pattern length', () => {
            const pattern = {
                nbBars: 1,
                tracks: {
                    'T1': {
                        name: 'T1',
                        barQuantize: 4,
                        notes: {
                            'N1': { bar: 0, barStep: 0, euclidianFill: 5, triggerFreq: 1, triggerProbability: 1 }
                        }
                    }
                }
            }
            const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

            // nbTickForPattern = 32
            // No next note -> last = 4*4=16 (bars defaults to 4)
            // startStep=0, endStep=16, span=16
            // tickOffset(i) = Math.round((i * 16 * 8) / 6) = Math.round(i * 128/6)
            // i=1: 21, i=2: 43 (>=32 skip), i=3+: skip
            expect(result.has(0)).toBe(true)
            expect(result.has(21)).toBe(true)
            const ticks = [...result.keys()].sort((a, b) => a - b)
            expect(ticks).toEqual([0, 21])
        })

        it('euclidian fill with arp applies pitch offsets', () => {
            const pattern = {
                nbBars: 4,
                tracks: {
                    'T1': {
                        name: 'T1',
                        barQuantize: 4,
                        notes: {
                            'N1': { bar: 0, barStep: 0, euclidianFill: 1, arp: { intervals: [0, 7], mode: 'up' }, retriggerNum: 1, triggerFreq: 1, triggerProbability: 1 },
                            'N2': { bar: 1, barStep: 0, triggerFreq: 1, triggerProbability: 1 }
                        }
                    }
                }
            }
            const result = computeFlatNotesFromPattern(pattern, 0, null, 32)

            // Occupied: {0, 4}. Resolver finds next at step 4.
            // startStep=0, endStep=4, span=4
            // fill tickOffset = (1 * 4 * 8) / 2 = 16
            // sequence: [0, 7]
            // base: arpIndex=0 -> pitch+0, fill: arpIndex=1 -> pitch+7
            expect(result.has(0)).toBe(true)
            expect(result.has(16)).toBe(true)
            expect(result.get(0)[0].note.pitch).toBe(0)
            expect(result.get(16)[0].note.pitch).toBe(7)
        })
    })

    describe('Full Pattern to FlatNotes (computeFlatNotesFromPattern)', () => {
        it('respects track loops and pattern boundaries', () => {
            const pattern = {
                nbBars: 2,
                tracks: {
                    'T1': {
                        name: 'T1',
                        bars: 1, // track loop every 1 bar
                        barQuantize: 4,
                        notes: {
                            'N1': { bar: 0, barStep: 0, pitch: 60, triggerProbability: 1, triggerFreq: 1 }
                        }
                    }
                }
            }
            
            // Pattern 2 bars (64 ticks), Track loop 1 bar (32 ticks)
            const result = computeFlatNotesFromPattern(pattern, 0, null, 32)
            
            // Should have note at 0 and 32
            expect(result.size).toBe(2)
            expect(result.has(0)).toBe(true)
            expect(result.has(32)).toBe(true)
        })

        it('plays notes located after the loop point once but does not repeat them', () => {
            const pattern = {
                nbBars: 4, // 128 ticks
                tracks: {
                    'T1': {
                        name: 'T1',
                        bars: 1, // loops every 32 ticks
                        barQuantize: 4,
                        notes: {
                            'N1': { bar: 0, barStep: 0, pitch: 60 }, // tick 0
                            'N2': { bar: 2, barStep: 0, pitch: 62 }  // tick 64 (after loop point 32)
                        }
                    }
                }
            }
            const result = computeFlatNotesFromPattern(pattern, 0, null, 32)
            
            // Note at 0 should be repeated at 0, 32, 64, 96
            expect(result.get(0)).toBeDefined()
            expect(result.get(32)).toBeDefined()
            expect(result.get(64)).toBeDefined()
            expect(result.get(96)).toBeDefined()
            
            // Note at 64 should be played at 64
            const notesAt64 = result.get(64)
            expect(notesAt64.some(fn => fn.note.pitch === 62)).toBe(true)
            expect(notesAt64.some(fn => fn.note.pitch === 60)).toBe(true)

            // Note at 64 should NOT be repeated at 96 (64 + 32)
            const notesAt96 = result.get(96)
            expect(notesAt96.length).toBe(1)
            expect(notesAt96[0].note.pitch).toBe(60)
        })
    })
})
