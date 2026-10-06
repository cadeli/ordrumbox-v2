import { describe, it, expect } from 'vitest'
import {
    addLoopToTrackIfPossible,
    getTrackLoopAtStep,
    getTrackStepLength,
    getTracksArray,
    trackNotesMatchLoop,
} from '../src/core/tracks.js'
import {
    DRUM_TYPES,
    TRACK_KINDS,
    computeTrackPan,
    detectTrackType,
    getPanFromTrackName,
} from '../src/core/drum_taxonomy.js'
import { getLoopCandidateSteps } from './helpers/loop_candidate_steps.js'

describe('core/tracks', () => {
    describe('getTrackStepLength', () => {
        it('declared beats × stepsPerBeat', () => {
            const track = { beatCount: 4, stepsPerBeat: 4, notes: [] }
            expect(getTrackStepLength(track)).toBe(16)
        })

        it('uses notes last step if greater', () => {
            const track = { beatCount: 1, stepsPerBeat: 4, notes: [{ beat: 2, beatStep: 1 }] }
            expect(getTrackStepLength(track)).toBe(10)
        })

        it('handles empty notes', () => {
            const track = { beatCount: 2, stepsPerBeat: 4, notes: [] }
            expect(getTrackStepLength(track)).toBe(8)
        })
    })

    describe('getTrackLoopAtStep', () => {
        it('uses loopAtStep if set', () => {
            expect(getTrackLoopAtStep({ loopAtStep: 8, stepsPerBeat: 4 })).toBe(8)
        })

        it('falls back to track step length', () => {
            const track = { beatCount: 4, stepsPerBeat: 4, notes: [] }
            expect(getTrackLoopAtStep(track)).toBe(16)
        })
    })

    describe('getLoopCandidateSteps', () => {
        it('finds divisors of trackSteps', () => {
            expect(getLoopCandidateSteps(16, 1)).toEqual([1, 2, 4, 8])
        })

        it('respects minLoopSteps', () => {
            expect(getLoopCandidateSteps(16, 3)).toEqual([4, 8])
        })

        it('only 1 for prime number', () => {
            expect(getLoopCandidateSteps(7, 1)).toEqual([1])
        })
    })

    describe('addLoopToTrackIfPossible', () => {
        it('detects smallest repeating loop and minimizes notes', () => {
            const track = {
                beatCount: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8 },
                    { beat: 0, beatStep: 2, velocity: 0.6 },
                    { beat: 1, beatStep: 0, velocity: 0.8 },
                    { beat: 1, beatStep: 2, velocity: 0.6 },
                    { beat: 2, beatStep: 0, velocity: 0.8 },
                    { beat: 2, beatStep: 2, velocity: 0.6 },
                    { beat: 3, beatStep: 0, velocity: 0.8 },
                    { beat: 3, beatStep: 2, velocity: 0.6 },
                ],
            }
            const result = addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(true)
            expect(result.loopAtStep).toBe(4)
            expect(track.notes.length).toBe(2)
            expect(track.loopAtStep).toBe(4)
        })

        it('compacts one note per beat to single note + 1-beat loop', () => {
            const track = {
                beatCount: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 0 },
                    { beat: 1, beatStep: 0 },
                    { beat: 2, beatStep: 0 },
                    { beat: 3, beatStep: 0 },
                ],
            }
            const result = addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(true)
            expect(result.loopAtStep).toBe(4)
            expect(track.notes.length).toBe(1)
            expect(track.notes[0].beat).toBe(0)
            expect(track.notes[0].beatStep).toBe(0)
        })

        it('compacts each track independently when called on multiple tracks', () => {
            const trackA = {
                beatCount: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8 },
                    { beat: 1, beatStep: 0, velocity: 0.8 },
                    { beat: 2, beatStep: 0, velocity: 0.8 },
                    { beat: 3, beatStep: 0, velocity: 0.8 },
                ],
            }
            const trackB = {
                beatCount: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 1, velocity: 0.6 },
                    { beat: 1, beatStep: 1, velocity: 0.6 },
                    { beat: 2, beatStep: 1, velocity: 0.6 },
                    { beat: 3, beatStep: 1, velocity: 0.6 },
                ],
            }
            const trackC = {
                beatCount: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8 },
                    { beat: 0, beatStep: 2, velocity: 0.6 },
                    { beat: 1, beatStep: 0, velocity: 0.8 },
                    { beat: 1, beatStep: 2, velocity: 0.6 },
                    { beat: 2, beatStep: 0, velocity: 0.8 },
                    { beat: 2, beatStep: 2, velocity: 0.6 },
                    { beat: 3, beatStep: 0, velocity: 0.8 },
                    { beat: 3, beatStep: 2, velocity: 0.6 },
                ],
            }

            const resultA = addLoopToTrackIfPossible(trackA)
            const resultB = addLoopToTrackIfPossible(trackB)
            const resultC = addLoopToTrackIfPossible(trackC)

            // Track A: 4 notes → 1 note, loop at 4 steps (1 beat)
            expect(resultA.changed).toBe(true)
            expect(resultA.loopAtStep).toBe(4)
            expect(trackA.notes.length).toBe(1)
            expect(trackA.notes[0].beat).toBe(0)
            expect(trackA.notes[0].beatStep).toBe(0)

            // Track B: 4 notes → 1 note, loop at 4 steps (1 beat)
            expect(resultB.changed).toBe(true)
            expect(resultB.loopAtStep).toBe(4)
            expect(trackB.notes.length).toBe(1)
            expect(trackB.notes[0].beat).toBe(0)
            expect(trackB.notes[0].beatStep).toBe(1)

            // Track C: 8 notes → 2 notes, loop at 4 steps (1 beat)
            expect(resultC.changed).toBe(true)
            expect(resultC.loopAtStep).toBe(4)
            expect(trackC.notes.length).toBe(2)

            // All tracks independent: trackB note step differs from trackA
            expect(trackB.notes[0].beatStep).toBe(1)
            expect(trackA.notes[0].beatStep).toBe(0)
        })

        it('returns unchanged if notes are truly non-repeating', () => {
            const track = {
                beatCount: 2,
                stepsPerBeat: 4,
                loopAtStep: 8,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8 },
                    { beat: 1, beatStep: 2, velocity: 0.3 },
                ],
            }
            const result = addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(false)
        })

        it('returns unchanged if track has no notes and loopAtStep stays same', () => {
            const track = {
                beatCount: 4,
                stepsPerBeat: 4,
                loopAtStep: 8,
                notes: [],
            }
            const originalLoopAtStep = track.loopAtStep
            const result = addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(false)
            expect(track.loopAtStep).toBe(originalLoopAtStep)
        })

        it('handles invalid track', () => {
            expect(addLoopToTrackIfPossible(null).changed).toBe(false)
            expect(addLoopToTrackIfPossible({ notes: 'not-array' }).changed).toBe(false)
        })
    })

    describe('trackNotesMatchLoop', () => {
        it('matches perfect 1-beat loop', () => {
            const track = {
                stepsPerBeat: 4,
                notes: [
                    { beat: 0, beatStep: 0 },
                    { beat: 0, beatStep: 2 },
                    { beat: 1, beatStep: 0 },
                    { beat: 1, beatStep: 2 },
                ],
            }
            expect(trackNotesMatchLoop(track, 4, 8)).toBe(true)
        })

        it('fails when pattern differs', () => {
            const track = {
                stepsPerBeat: 4,
                notes: [
                    { beat: 0, beatStep: 0 },
                    { beat: 1, beatStep: 1 },
                ],
            }
            expect(trackNotesMatchLoop(track, 4, 8)).toBe(false)
        })
    })

    describe('getTracksArray', () => {
        it('returns array as-is when tracks is already an array', () => {
            const tracks = [{ name: 'KICK' }, { name: 'SNARE' }]
            expect(getTracksArray({ tracks })).toBe(tracks)
        })

        it('returns Object.values when tracks is an object', () => {
            const tracks = { 0: { name: 'KICK' }, 1: { name: 'SNARE' } }
            const result = getTracksArray({ tracks })
            expect(result).toEqual([{ name: 'KICK' }, { name: 'SNARE' }])
        })

        it('returns empty array when tracks is null', () => {
            expect(getTracksArray({ tracks: null })).toEqual([])
        })

        it('returns empty array when tracks is undefined', () => {
            expect(getTracksArray({})).toEqual([])
        })

        it('returns empty array when pattern is null', () => {
            expect(getTracksArray(null)).toEqual([])
        })
    })

    describe('addLoopToTrackIfPossible', () => {
        it('compaction detects already-minimal loop', () => {
            const track = {
                beatCount: 4,
                stepsPerBeat: 4,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 1, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 2, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 3, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                ],
                loopAtStep: 1 * 4,
            }

            const result = addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(false)
        })

        it('no-op when track has no loop pattern', () => {
            const track = {
                beatCount: 4,
                stepsPerBeat: 4,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 1, beatStep: 1, velocity: 0.8, pitch: 1, pan: 0 },
                ],
                loopAtStep: 4 * 4,
            }

            const result = addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(false)
        })

        it('empty track returns no-notes', () => {
            const track = { beatCount: 4, stepsPerBeat: 4, notes: [], loopAtStep: 16 }
            const result = addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(false)
            expect(result.reason).toBe('no-notes')
        })

        it('compactTrack returns unchanged for minimal track', () => {
            const track = {
                beatCount: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 1, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                ],
            }
            const result = addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(false)
        })

        it('compactTrack detects repeating loop', () => {
            const track = {
                beatCount: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 1, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 2, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 3, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 0, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 1, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 2, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                    { beat: 3, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                ],
            }
            const result = addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(true)
            expect(result.removedNotes).toBeGreaterThan(0)
        })
    })
})

// loopAtStep is the ONLY loop field: 0 and null both mean "no explicit loop point"
// and resolve to the track length (getTrackStepLength). Resolving them to a
// zero-length loop is what made computeTickCountForLoop answer "0 ticks" = no
// repetition at all.
// The three vocabularies (names, types, substring rules) used to be independent:
// CHH was pan index 5 but type HAT, and only this composition told you so.
describe('drum taxonomy', () => {
    it('every TRACK_KINDS row has a type DRUM_TYPES knows', () => {
        for (const [name, kind] of Object.entries(TRACK_KINDS)) {
            expect(DRUM_TYPES.has(kind.type), `${name} → ${kind.type}`).toBe(true)
        }
    })

    it('the pan index of a name is the one getPanFromTrackName uses', () => {
        for (const [name, kind] of Object.entries(TRACK_KINDS)) {
            expect(getPanFromTrackName(name), name).toBe(computeTrackPan(kind.panIndex))
        }
    })

    it('detectTrackType agrees with the table for the canonical names', () => {
        for (const [name, kind] of Object.entries(TRACK_KINDS)) {
            expect(detectTrackType(name), name).toBe(kind.type)
        }
    })

    it('hats are CHH/OHH but of type HAT', () => {
        expect(detectTrackType('CHH')).toBe('HAT')
        expect(detectTrackType('OHH')).toBe('HAT')
        expect(TRACK_KINDS.CHH.type).toBe(TRACK_KINDS.OHH.type)
        expect(TRACK_KINDS.CHH.panIndex).not.toBe(TRACK_KINDS.OHH.panIndex)
    })

    it('unknown names still fall through to the substring rules', () => {
        expect(detectTrackType('808 KICK')).toBe('KICK')
        expect(detectTrackType('SYNTH BASS')).toBe('BASS')
        expect(detectTrackType('ZZZ')).toBe('PERC') // no substring rule matches
        expect(getPanFromTrackName('ZZZ')).toBe(0)
    })
})

describe('loop length resolution', () => {
    it.each([0, null, undefined])('loopAtStep=%s resolves to the track length', (loopAtStep) => {
        expect(getTrackLoopAtStep({ loopAtStep, stepsPerBeat: 4, beatCount: 4, notes: [] })).toBe(16)
    })

    it('an explicit loopAtStep is used as is, whatever the subdivision', () => {
        expect(getTrackLoopAtStep({ loopAtStep: 9, stepsPerBeat: 8, beatCount: 4, notes: [] })).toBe(9)
    })
})
