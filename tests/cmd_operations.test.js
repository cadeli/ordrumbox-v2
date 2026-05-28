import { describe, it, expect, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import Utils from '../src/core/utils.js'

describe('Functional: MfCmd operations', () => {
    let mfCmd

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
    })

    describe('Pattern CRUD', () => {
        it('createPattern produces correct defaults', () => {
            const pattern = mfCmd.addPattern('Test')

            expect(pattern.name).toBe('Test')
            expect(pattern.bpm).toBe(120)
            expect(pattern.nbBars).toBe(4)
            expect(pattern.tracks).toEqual([])
            expect(pattern.description).toBe('')
            // tags may be undefined in some code paths
        })

        it('auto-generates name when null', () => {
            MfGlobals.patterns = [{ name: 'a' }, { name: 'b' }]
            const pattern = mfCmd.addPattern(null)

            expect(pattern.name).toBe('NewPat_2')
        })

        it('setPatternBpm updates correctly', () => {
            const pattern = mfCmd.addPattern('Test')
            mfCmd.setPatternBpm(pattern, 140)

            expect(pattern.bpm).toBe(140)
            expect(mfCmd.getPatternBpm(pattern)).toBe(140)
        })
    })

    describe('Track operations', () => {
        it('createTrack produces correct default structure', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)

            expect(track.name).toBe('KICK')
            expect(track.bars).toBe(4)
            expect(track.barQuantize).toBe(4)
            expect(track.loopAtStep).toBe(16)
            expect(track.loopPointBar).toBe(4)
            expect(track.loopPointStep).toBe(0)
            expect(track.notes).toEqual([])
            expect(track.mute).toBe(false)
            expect(track.solo).toBe(false)
        })

        it('addNote produces correct default note structure', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            const note = mfCmd.addNote(track, 1, 2, 5)

            expect(note.bar).toBe(1)
            expect(note.barStep).toBe(2)
            expect(note.pitch).toBe(5)
            expect(note.velocity).toBe(0.8)
            expect(note.steppc).toBe(50)
            expect(note.triggerFreq).toBe(1)
            expect(note.triggerPhase).toBe(0)
            expect(note.retriggerNum).toBe(1)
            expect(note.euclidianFill).toBe(0)
        })

        it('deleteNote removes correct note', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.addNote(track, 0, 0)
            mfCmd.addNote(track, 1, 0)
            mfCmd.addNote(track, 2, 0)

            mfCmd.deleteNote(track, { bar: 1, barStep: 0 })

            expect(track.notes.length).toBe(2)
            expect(mfCmd.isNoteAt(track, 1, 0).length).toBe(0)
            expect(mfCmd.isNoteAt(track, 0, 0).length).toBe(1)
            expect(mfCmd.isNoteAt(track, 2, 0).length).toBe(1)
        })

        it('isNoteAt returns array of notes at position', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.addNote(track, 0, 0)
            mfCmd.addNote(track, 0, 0)

            expect(mfCmd.isNoteAt(track, 0, 0).length).toBe(2)
            expect(mfCmd.isNoteAt(track, 99, 99).length).toBe(0)
        })

        it('updateTrack applies whitelisted properties only', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.updateTrack(track, { bars: 8, mute: true, unknownProp: 'test' })

            expect(track.bars).toBe(8)
            expect(track.mute).toBe(true)
            expect(track.unknownProp).toBeUndefined()
        })

        it('cleanTrack removes all notes and resets loop', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.addNote(track, 0, 0)
            track.loopPointBar = 2
            track.loopPointStep = 2
            track.loopAtStep = 10

            mfCmd.cleanTrack(track)

            expect(track.notes).toEqual([])
            expect(track.loopPointStep).toBe(0)
            expect(track.loopPointBar).toBe(4)
            expect(track.loopAtStep).toBe(16)
        })
    })

    describe('Step conversion', () => {
        it('convertPatternStepToBarStep is correct', () => {
            expect(mfCmd.convertPatternStepToBarStep(0, 4)).toEqual({ bar: 0, step: 0 })
            expect(mfCmd.convertPatternStepToBarStep(6, 4)).toEqual({ bar: 1, step: 2 })
            expect(mfCmd.convertPatternStepToBarStep(15, 4)).toEqual({ bar: 3, step: 3 })
        })

        it('convertBarStepToPatternStep is correct', () => {
            expect(mfCmd.convertBarStepToPatternStep(0, 0, 4)).toBe(0)
            expect(mfCmd.convertBarStepToPatternStep(1, 2, 4)).toBe(6)
            expect(mfCmd.convertBarStepToPatternStep(3, 3, 4)).toBe(15)
        })

        it('round-trip conversion is lossless', () => {
            for (let step = 0; step < 16; step++) {
                const bs = mfCmd.convertPatternStepToBarStep(step, 4)
                const roundTrip = mfCmd.convertBarStepToPatternStep(bs.bar, bs.step, 4)
                expect(roundTrip).toBe(step)
            }
        })
    })

    describe('Pan from track name', () => {
        it('returns correct pan values', () => {
            expect(mfCmd.getPanoFromTrackName('KICK')).toBe(0)
            expect(mfCmd.getPanoFromTrackName('SNARE')).toBe(0.3)
            expect(mfCmd.getPanoFromTrackName('CHH')).toBe(-0.3)
            expect(mfCmd.getPanoFromTrackName('CRASH')).toBe(1)
            expect(mfCmd.getPanoFromTrackName('UNKNOWN')).toBe(0)
        })
    })

    describe('Loop point increment', () => {
        it('decrements loopAtStep with wrap-around', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            track.loopAtStep = 16

            mfCmd.incrLoopPoint(track)
            expect(track.loopAtStep).toBe(15)
            expect(track.loopPointBar).toBe(3)
            expect(track.loopPointStep).toBe(3)

            for (let i = 0; i < 15; i++) {
                mfCmd.incrLoopPoint(track)
            }
            expect(track.loopAtStep).toBe(16)
        })
    })

    describe('Bar quantize cycle', () => {
        it('incrNbStepPerBar changes barQuantize', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            const note = mfCmd.addNote(track, 0, 2)
            note.steppc = 50

            const original = track.barQuantize
            mfCmd.incrNbStepPerBar(track)
            expect(track.barQuantize).not.toBe(original)
        })
    })
})

describe('Functional: Utils loop detection', () => {
    describe('addLoopToTrackIfPossible', () => {
        it('detects repeating pattern and sets loop', () => {
            const track = {
                name: 'KICK',
                bars: 4,
                barQuantize: 4,
                loopAtStep: 16,
                notes: [
                    { bar: 0, barStep: 0 }, { bar: 0, barStep: 2 },
                    { bar: 1, barStep: 0 }, { bar: 1, barStep: 2 },
                    { bar: 2, barStep: 0 }, { bar: 2, barStep: 2 },
                    { bar: 3, barStep: 0 }, { bar: 3, barStep: 2 }
                ]
            }

            const result = Utils.addLoopToTrackIfPossible(track)

            expect(result.changed).toBe(true)
            expect(result.reason).toBe('loop-added')
            expect(result.loopAtStep).toBe(2)
            expect(track.loopAtStep).toBe(2)
        })

        it('returns changed even for non-repeating patterns (finds smallest loop)', () => {
            const track = {
                bars: 4,
                barQuantize: 4,
                loopAtStep: 16,
                notes: [
                    { bar: 0, barStep: 0 },
                    { bar: 2, barStep: 0 }
                ]
            }

            const result = Utils.addLoopToTrackIfPossible(track)

            // The algorithm finds the smallest divisor that works
            expect(result.changed).toBe(true)
        })

        it('invalid track returns unchanged', () => {
            expect(Utils.addLoopToTrackIfPossible(null).changed).toBe(false)
            expect(Utils.addLoopToTrackIfPossible({}).changed).toBe(false)
        })
    })

    describe('getLoopCandidateSteps', () => {
        it('returns correct divisors', () => {
            expect(Utils.getLoopCandidateSteps(16, 1)).toEqual([1, 2, 4, 8])
            expect(Utils.getLoopCandidateSteps(12, 1)).toEqual([1, 2, 3, 4, 6])
            expect(Utils.getLoopCandidateSteps(7, 1)).toEqual([1])
        })
    })

    describe('getNoteAbsoluteStep', () => {
        it('computes correct absolute step', () => {
            expect(Utils.getNoteAbsoluteStep({ bar: 0, barStep: 0 }, 4)).toBe(0)
            expect(Utils.getNoteAbsoluteStep({ bar: 1, barStep: 2 }, 4)).toBe(6)
            expect(Utils.getNoteAbsoluteStep({ bar: 3, barStep: 3 }, 4)).toBe(15)
            expect(Utils.getNoteAbsoluteStep({ step: 5 }, 4)).toBe(5)
        })
    })

    describe('getTrackStepLength', () => {
        it('computes length from bars and quantize', () => {
            const track = { bars: 4, barQuantize: 4, notes: [] }
            expect(Utils.getTrackStepLength(track)).toBe(16)
        })

        it('notes extending beyond declared bars increase length', () => {
            const track = {
                bars: 2,
                barQuantize: 4,
                notes: [{ bar: 3, barStep: 0 }]
            }
            // bar=3, barStep=0 → absolute step = 3*4+0 = 12, +1 = 13
            expect(Utils.getTrackStepLength(track)).toBe(13)
        })
    })

    describe('trackNotesMatchLoop', () => {
        it('validates loop correctness', () => {
            const track = {
                barQuantize: 4,
                notes: [
                    { bar: 0, barStep: 0 }, { bar: 0, barStep: 2 },
                    { bar: 1, barStep: 0 }, { bar: 1, barStep: 2 },
                    { bar: 2, barStep: 0 }, { bar: 2, barStep: 2 },
                    { bar: 3, barStep: 0 }, { bar: 3, barStep: 2 }
                ]
            }

            expect(Utils.trackNotesMatchLoop(track, 4, 16)).toBe(true)
            expect(Utils.trackNotesMatchLoop(track, 8, 16)).toBe(true)
            // Note: loopAtStep=2 may also match due to how signature comparison works
        })
    })

    describe('compacteTrackWithLoop', () => {
        it('delegates to addLoopToTrackIfPossible with same result', () => {
            const track = {
                bars: 4,
                barQuantize: 4,
                loopAtStep: 16,
                notes: [
                    { bar: 0, barStep: 0 },
                    { bar: 1, barStep: 0 },
                    { bar: 2, barStep: 0 },
                    { bar: 3, barStep: 0 }
                ]
            }
            const track2 = { ...track, notes: [...track.notes] }

            const r1 = Utils.compacteTrackWithLoop(track)
            const r2 = Utils.addLoopToTrackIfPossible(track2)

            expect(r1.changed).toBe(r2.changed)
            expect(r1.loopAtStep).toBe(r2.loopAtStep)
        })
    })
})
