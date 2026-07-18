import { describe, it, expect } from 'vitest'
import Utils from '../src/core/utils.js'
import { recalcLoopDerived } from '../src/model/track_schema.js'

describe('Utils', () => {
    describe('getDelayTimeInSeconds', () => {
        it('1 @ 120bpm = 0.5s', () => {
            expect(Utils.getDelayTimeInSeconds(1, 120)).toBe(0.5)
        })

        it('4 @ 60bpm = 4s', () => {
            expect(Utils.getDelayTimeInSeconds(4, 60)).toBe(4)
        })

        it('2 @ 120bpm = 1s', () => {
            expect(Utils.getDelayTimeInSeconds(2, 120)).toBe(1)
        })

        it('invalid value falls back to multiplier 1', () => {
            expect(Utils.getDelayTimeInSeconds('abc', 120)).toBe(0.5)
        })

        it('0 falls back to multiplier 1', () => {
            expect(Utils.getDelayTimeInSeconds(0, 120)).toBe(0.5)
        })
    })

    describe('pitch / semitone conversions', () => {
        it('semitoneToPitch: 0 → 1 (unisson)', () => {
            expect(Utils.semiToneToPitch(0)).toBe(1)
        })

        it('semitoneToPitch: 3 → ~1.1892 (minor third)', () => {
            expect(Utils.semiToneToPitch(3)).toBeCloseTo(Math.pow(2, 3 / 12), 4)
        })

        it('semitoneToPitch: 4 → ~1.2599 (major third)', () => {
            expect(Utils.semiToneToPitch(4)).toBeCloseTo(Math.pow(2, 4 / 12), 4)
        })

        it('semitoneToPitch: 7 → ~1.4983 (perfect fifth)', () => {
            expect(Utils.semiToneToPitch(7)).toBeCloseTo(Math.pow(2, 7 / 12), 4)
        })

        it('semitoneToPitch: 12 → 2 (octave)', () => {
            expect(Utils.semiToneToPitch(12)).toBe(2)
        })

        it('semitoneToPitch: -12 → 0.5 (one octave down)', () => {
            expect(Utils.semiToneToPitch(-12)).toBe(0.5)
        })
    })

    describe('getStepSpacing', () => {
        it('value < 8 → value/8', () => {
            expect(Utils.getStepSpacing(4)).toBe(0.5)
            expect(Utils.getStepSpacing(1)).toBe(0.125)
            expect(Utils.getStepSpacing(7)).toBe(7 / 8)
        })

        it('value >= 8 → value-7', () => {
            expect(Utils.getStepSpacing(8)).toBe(1)
            expect(Utils.getStepSpacing(16)).toBe(9)
            expect(Utils.getStepSpacing(23)).toBe(16)
        })
    })

    describe('filter normalization', () => {
        describe('normalizedTrackFilterFreqToHz', () => {
            it('0 → 20Hz', () => {
                expect(Utils.normalizedTrackFilterFreqToHz(0)).toBe(20)
            })

            it('1 → 20000Hz', () => {
                expect(Utils.normalizedTrackFilterFreqToHz(1)).toBe(20000)
            })

        it('0.5 → 632Hz', () => {
            expect(Utils.normalizedTrackFilterFreqToHz(0.5)).toBe(632)
        })
        })

        describe('normalizedTrackFilterQToValue', () => {
            it('0 → 0.707', () => {
                expect(Utils.normalizedTrackFilterQToValue(0)).toBe(0.707)
            })

            it('1 → 18.707', () => {
                expect(Utils.normalizedTrackFilterQToValue(1)).toBeCloseTo(18.707, 3)
            })
        })

        describe('normalizedSynthFilterFreqToHz', () => {
            it('0 → 50Hz', () => {
                expect(Utils.normalizedSynthFilterFreqToHz(0)).toBe(50)
            })

            it('1 → 2050Hz', () => {
                expect(Utils.normalizedSynthFilterFreqToHz(1)).toBe(2050)
            })
        })

        describe('normalizedSynthFilterQToValue', () => {
            it('0 → 1', () => {
                expect(Utils.normalizedSynthFilterQToValue(0)).toBe(1)
            })

            it('1 → 21', () => {
                expect(Utils.normalizedSynthFilterQToValue(1)).toBe(21)
            })
        })

        describe('normalizeTrackFilterFreqValue', () => {
            it('value <= 1 → converts to Hz', () => {
                expect(Utils.normalizeTrackFilterFreqValue(0)).toBe(20)
                expect(Utils.normalizeTrackFilterFreqValue(1)).toBe(20000)
            })

            it('value > 1 → returns as-is', () => {
                expect(Utils.normalizeTrackFilterFreqValue(440)).toBe(440)
                expect(Utils.normalizeTrackFilterFreqValue(1000)).toBe(1000)
            })

            it('invalid value → 20', () => {
                expect(Utils.normalizeTrackFilterFreqValue('abc')).toBe(20)
                expect(Utils.normalizeTrackFilterFreqValue(NaN)).toBe(20)
            })
        })
    })

    describe('getRandomKey', () => {
        it('returns a key from the object', () => {
            const obj = { a: 1, b: 2, c: 3 }
            const key = Utils.getRandomKey(obj)
            expect(['a', 'b', 'c']).toContain(key)
        })

        it('returns null for empty object', () => {
            expect(Utils.getRandomKey({})).toBeNull()
        })
    })

    describe('NOTE_DEFAULTS', () => {
        it('has expected default property values', () => {
            expect(Utils.NOTE_DEFAULTS.velocity).toBe(0.8)
            expect(Utils.NOTE_DEFAULTS.pitch).toBe(0)
            expect(Utils.NOTE_DEFAULTS.arp).toBeNull()
            expect(Utils.NOTE_DEFAULTS.retriggerNum).toBe(1)
        })
    })

    describe('TRACK_DEFAULTS', () => {
        it('has expected default property values', () => {
            expect(Utils.TRACK_DEFAULTS.nbBeats).toBe(4)
            expect(Utils.TRACK_DEFAULTS.stepsPerBeat).toBe(4)
            expect(Utils.TRACK_DEFAULTS.mute).toBe(false)
            expect(Utils.TRACK_DEFAULTS.solo).toBe(false)
        })
    })

    describe('getNoteAbsoluteStep', () => {
        it('beat 0 step 0 → 0', () => {
            expect(Utils.getNoteAbsoluteStep({ beat: 0, beatStep: 0 }, 4)).toBe(0)
        })

        it('beat 1 step 2 → 6', () => {
            expect(Utils.getNoteAbsoluteStep({ beat: 1, beatStep: 2 }, 4)).toBe(6)
        })

        it('defaults to 0 for missing values', () => {
            expect(Utils.getNoteAbsoluteStep({}, 4)).toBe(0)
        })
    })

    describe('getTrackStepLength', () => {
        it('declared beats × stepsPerBeat', () => {
            const track = { nbBeats: 4, stepsPerBeat: 4, notes: [] }
            expect(Utils.getTrackStepLength(track)).toBe(16)
        })

        it('uses notes last step if greater', () => {
            const track = { nbBeats: 1, stepsPerBeat: 4, notes: [{ beat: 2, beatStep: 1 }] }
            expect(Utils.getTrackStepLength(track)).toBe(10)
        })

        it('handles empty notes', () => {
            const track = { nbBeats: 2, stepsPerBeat: 4, notes: [] }
            expect(Utils.getTrackStepLength(track)).toBe(8)
        })
    })

    describe('getTrackLoopAtStep', () => {
        it('uses loopAtStep if set', () => {
            expect(Utils.getTrackLoopAtStep({ loopAtStep: 8, stepsPerBeat: 4 })).toBe(8)
        })

        it('calculates from loopPointBeat/loopPointStep', () => {
            expect(Utils.getTrackLoopAtStep({ loopPointBeat: 2, loopPointStep: 1, stepsPerBeat: 4 })).toBe(9)
        })

        it('falls back to track step length', () => {
            const track = { nbBeats: 4, stepsPerBeat: 4, notes: [] }
            expect(Utils.getTrackLoopAtStep(track)).toBe(16)
        })
    })

    describe('getLoopCandidateSteps', () => {
        it('finds divisors of trackSteps', () => {
            expect(Utils.getLoopCandidateSteps(16, 1)).toEqual([1, 2, 4, 8])
        })

        it('respects minLoopSteps', () => {
            expect(Utils.getLoopCandidateSteps(16, 3)).toEqual([4, 8])
        })

        it('only 1 for prime number', () => {
            expect(Utils.getLoopCandidateSteps(7, 1)).toEqual([1])
        })
    })

    describe('addLoopToTrackIfPossible', () => {
        it('detects repeating 1-beat loop', () => {
            const track = {
                nbBeats: 4, stepsPerBeat: 4, loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 0, velocity: 0.8 },
                    { beat: 0, beatStep: 2, velocity: 0.6 },
                    { beat: 1, beatStep: 0, velocity: 0.8 },
                    { beat: 1, beatStep: 2, velocity: 0.6 },
                    { beat: 2, beatStep: 0, velocity: 0.8 },
                    { beat: 2, beatStep: 2, velocity: 0.6 },
                    { beat: 3, beatStep: 0, velocity: 0.8 },
                    { beat: 3, beatStep: 2, velocity: 0.6 },
                ]
            }
            const result = Utils.addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(true)
            expect(result.loopAtStep).toBe(4)
            expect(track.notes.length).toBe(2)
            expect(track.loopAtStep).toBe(4)
        })

        it('returns unchanged if no loop found', () => {
            const track = {
                nbBeats: 2, stepsPerBeat: 4, loopAtStep: 8,
                notes: [
                    { beat: 0, beatStep: 0 },
                    { beat: 1, beatStep: 2 },
                ]
            }
            const result = Utils.addLoopToTrackIfPossible(track)
            expect(result.changed).toBe(false)
        })

        it('handles invalid track', () => {
            expect(Utils.addLoopToTrackIfPossible(null).changed).toBe(false)
            expect(Utils.addLoopToTrackIfPossible({ notes: 'not-array' }).changed).toBe(false)
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
                ]
            }
            expect(Utils.trackNotesMatchLoop(track, 4, 8)).toBe(true)
        })

        it('fails when pattern differs', () => {
            const track = {
                stepsPerBeat: 4,
                notes: [
                    { beat: 0, beatStep: 0 },
                    { beat: 1, beatStep: 1 },
                ]
            }
            expect(Utils.trackNotesMatchLoop(track, 4, 8)).toBe(false)
        })
    })

    describe('getAudibleNoteSignature', () => {
        it('excludes position keys', () => {
            const note = { beat: 0, beatStep: 0, velocity: 0.8, pitch: 5 }
            const sig = Utils.getAudibleNoteSignature(note)
            expect(sig).not.toContain('beat')
            expect(sig).not.toContain('beatStep')
            expect(sig).toContain('velocity')
            expect(sig).toContain('pitch')
        })

        it('handles empty note', () => {
            expect(Utils.getAudibleNoteSignature({})).toBe('{}')
        })
    })

    describe('normalizeSignatureValue', () => {
        it('handles arrays', () => {
            expect(Utils.normalizeSignatureValue([2, 1, 3])).toEqual([2, 1, 3])
        })

        it('sorts object keys', () => {
            const result = Utils.normalizeSignatureValue({ c: 3, a: 1 })
            expect(Object.keys(result)).toEqual(['a', 'c'])
        })

        it('passes through primitives', () => {
            expect(Utils.normalizeSignatureValue(42)).toBe(42)
            expect(Utils.normalizeSignatureValue('test')).toBe('test')
            expect(Utils.normalizeSignatureValue(null)).toBeNull()
        })
    })

    describe('getTracksArray', () => {
        it('returns array as-is when tracks is already an array', () => {
            const tracks = [{ name: 'KICK' }, { name: 'SNARE' }]
            expect(Utils.getTracksArray({ tracks })).toBe(tracks)
        })

        it('returns Object.values when tracks is an object', () => {
            const tracks = { 0: { name: 'KICK' }, 1: { name: 'SNARE' } }
            const result = Utils.getTracksArray({ tracks })
            expect(result).toEqual([{ name: 'KICK' }, { name: 'SNARE' }])
        })

        it('returns empty array when tracks is null', () => {
            expect(Utils.getTracksArray({ tracks: null })).toEqual([])
        })

        it('returns empty array when tracks is undefined', () => {
            expect(Utils.getTracksArray({})).toEqual([])
        })

        it('returns empty array when pattern is null', () => {
            expect(Utils.getTracksArray(null)).toEqual([])
        })

        it('returns empty array when pattern is undefined', () => {
            expect(Utils.getTracksArray(undefined)).toEqual([])
        })

        it('returns empty array for empty array', () => {
            expect(Utils.getTracksArray({ tracks: [] })).toEqual([])
        })

        it('returns empty array for empty object', () => {
            expect(Utils.getTracksArray({ tracks: {} })).toEqual([])
        })
    })
})

describe('recalcLoopDerived', () => {
    it('computes loopPointBeat=4, loopPointStep=0 for loopAtStep=16, stepsPerBeat=4', () => {
        const track = { loopAtStep: 16, stepsPerBeat: 4 }
        recalcLoopDerived(track)
        expect(track.loopPointBeat).toBe(4)
        expect(track.loopPointStep).toBe(0)
    })

    it('computes loopPointBeat=2, loopPointStep=2 for loopAtStep=10, stepsPerBeat=4', () => {
        const track = { loopAtStep: 10, stepsPerBeat: 4 }
        recalcLoopDerived(track)
        expect(track.loopPointBeat).toBe(2)
        expect(track.loopPointStep).toBe(2)
    })

    it('computes loopPointBeat=0, loopPointStep=0 for loopAtStep=0', () => {
        const track = { loopAtStep: 0, stepsPerBeat: 4 }
        recalcLoopDerived(track)
        expect(track.loopPointBeat).toBe(0)
        expect(track.loopPointStep).toBe(0)
    })

    it('computes loopPointBeat=0, loopPointStep=1 for loopAtStep=1, stepsPerBeat=8', () => {
        const track = { loopAtStep: 1, stepsPerBeat: 8 }
        recalcLoopDerived(track)
        expect(track.loopPointBeat).toBe(0)
        expect(track.loopPointStep).toBe(1)
    })

    it('mutates the track object in place', () => {
        const track = { loopAtStep: 12, stepsPerBeat: 4 }
        const result = recalcLoopDerived(track)
        expect(track).toHaveProperty('loopPointBeat', 3)
        expect(track).toHaveProperty('loopPointStep', 0)
    })
})
