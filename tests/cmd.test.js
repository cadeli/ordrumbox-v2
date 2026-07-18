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
            expect(pattern.nbBeats).toBe(4)
            expect(pattern.tracks).toEqual([])
            expect(pattern.description).toBe('')
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
        })

        it('getPatternByName finds by name case-insensitive', () => {
            mfCmd.addPattern('TestPat')
            expect(mfCmd.getPatternByName('testpat')).toBeTruthy()
            expect(mfCmd.getPatternByName('TESTPAT')).toBeTruthy()
            expect(mfCmd.getPatternByName('noname')).toBeNull()
        })

        it('setPatternDescription sets description', () => {
            const pattern = mfCmd.addPattern('Test')
            mfCmd.setPatternDescription(pattern, 'my desc')
            expect(pattern.description).toBe('my desc')
        })

        it('setPatternDescription handles null pattern', () => {
            expect(() => mfCmd.setPatternDescription(null, 'x')).toThrow()
        })

        it('setPatternBpm with invalid value uses default', () => {
            const pattern = mfCmd.addPattern('Test')
            mfCmd.setPatternBpm(pattern, 0)
            expect(pattern.bpm).toBe(120)
        })
    })

    describe('Track operations', () => {
        it('createTrack produces correct default structure', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)

            expect(track.name).toBe('KICK')
            expect(track.nbBeats).toBe(4)
            expect(track.stepsPerBeat).toBe(4)
            expect(track.loopAtStep).toBe(16)
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopPointStep).toBe(0)
            expect(track.notes).toEqual([])
            expect(track.mute).toBe(false)
            expect(track.solo).toBe(false)
        })

        it('addNote produces correct default note structure', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            const note = mfCmd.addNote(track, 1, 2, 5)

            expect(note.beat).toBe(1)
            expect(note.beatStep).toBe(2)
            expect(note.pitch).toBe(5)
            expect(note.velocity).toBe(0.8)
            expect(note.steppc).toBe(50)
            expect(note.every).toBe(1)
            expect(note.pos).toBe(0)
            expect(note.retriggerNum).toBe(1)
            expect(note.euclidianFill).toBe(0)
        })

        it('deleteNote removes correct note', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.addNote(track, 0, 0)
            mfCmd.addNote(track, 1, 0)
            mfCmd.addNote(track, 2, 0)

            mfCmd.deleteNote(track, { beat: 1, beatStep: 0 })

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
            mfCmd.updateTrack(track, { nbBeats: 8, mute: true, unknownProp: 'test' })

            expect(track.nbBeats).toBe(8)
            expect(track.mute).toBe(true)
            expect(track.unknownProp).toBeUndefined()
        })

        it('cleanTrack removes all notes and resets loop', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.addNote(track, 0, 0)
            track.loopPointBeat = 2
            track.loopPointStep = 2
            track.loopAtStep = 10

            mfCmd.cleanTrack(track)

            expect(track.notes).toEqual([])
            expect(track.loopPointStep).toBe(0)
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopAtStep).toBe(16)
        })

        it('copies all known properties via updateTrack', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            const source = {
                soundId: 'snd_1',
                nbBeats: 8,
                stepsPerBeat: 8,
                loopAtStep: 32,
                swingResolution: 2,
                swingAmount: 0.3,
                velocity: 0.9,
                pitch: 5,
                pan: -0.5,
                solo: true,
                mute: true,
                auto: true,
                useSoftSynth: true,
                filterType: 'lowpass',
                filterFreq: 5000,
                filterQ: 2.5,
                reverbType: 'room',
                reverbAmount: 0.4,
                delayType: 'digital',
                delayTime: 2,
                delayDepth: 0.3,
                fxSelected: 'delay',
                saturationType: 'hard',
                saturationAmount: 0.5,
                sampleDecay: 0.8,
                synthSoundKey: 'saw'
            }
            mfCmd.updateTrack(track, source)

            expect(track.soundId).toBe('snd_1')
            expect(track.nbBeats).toBe(8)
            expect(track.stepsPerBeat).toBe(8)
            expect(track.loopAtStep).toBe(32)
            expect(track.swingResolution).toBe(2)
            expect(track.swingAmount).toBe(0.3)
            expect(track.velocity).toBe(0.9)
            expect(track.pitch).toBe(5)
            expect(track.pan).toBe(-0.5)
            expect(track.solo).toBe(true)
            expect(track.mute).toBe(true)
            expect(track.auto).toBe(true)
            expect(track.useSoftSynth).toBe(true)
            expect(track.filterType).toBe('lowpass')
            expect(track.filterFreq).toBe(5000)
            expect(track.filterQ).toBe(2.5)
            expect(track.reverbType).toBe('room')
            expect(track.reverbAmount).toBe(0.4)
            expect(track.delayType).toBe('digital')
            expect(track.delayTime).toBe(2)
            expect(track.delayDepth).toBe(0.3)
            expect(track.fxSelected).toBe('delay')
            expect(track.saturationType).toBe('hard')
            expect(track.saturationAmount).toBe(0.5)
            expect(track.sampleDecay).toBe(0.8)
            expect(track.synthSoundKey).toBe('saw')
        })

        it('computes loopPointBeat/Step after update', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.updateTrack(track, { loopAtStep: 10 })
            expect(track.loopPointBeat).toBe(2)
            expect(track.loopPointStep).toBe(2)
        })

        it('updateTrack returns track unchanged for null updates', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            expect(mfCmd.updateTrack(track, null)).toBe(track)
            expect(mfCmd.updateTrack(track, undefined)).toBe(track)
        })

        it('updateTrack returns track unchanged for non-object updates', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            expect(mfCmd.updateTrack(track, 42)).toBe(track)
        })

        it('computes loopPointBeat/Step from stepsPerBeat and loopAtStep', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.updateTrack(track, { stepsPerBeat: 8, loopAtStep: 20 })
            expect(track.loopPointBeat).toBe(2)
            expect(track.loopPointStep).toBe(4)
        })

        it('computes loopAtStep from loopPointBeat/Step when loopAtStep undefined', () => {
            const track = { stepsPerBeat: 4, loopPointBeat: 2, loopPointStep: 1 }
            mfCmd.updateTrack(track, {})
            expect(track.loopAtStep).toBe(9)
        })

        it('caps stepsPerBeat at 8 when steppc exceeds 100', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            track.stepsPerBeat = 4
            const note = mfCmd.addNote(track, 0, 5)
            expect(track.stepsPerBeat).toBe(8)
            expect(note.steppc).toBe(63)
        })
    })

    describe('Note property updates', () => {
        it('can set note properties directly', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            const note = mfCmd.addNote(track, 0, 0)
            note.beatStep = 2
            note.beat = 1
            note.velocity = 0.5
            note.pan = -0.3
            note.pitch = 7
            note.arp = [0, 12]
            note.every = 2
            note.pos = 1
            note.prob = 0.8
            note.arpTriggerProbability = 0.9
            note.retriggerNum = 3
            note.rate = 2
            note.euclidianFill = 2

            expect(note.beatStep).toBe(2)
            expect(note.beat).toBe(1)
            expect(note.velocity).toBe(0.5)
            expect(note.pan).toBe(-0.3)
            expect(note.pitch).toBe(7)
            expect(note.arp).toEqual([0, 12])
            expect(note.every).toBe(2)
            expect(note.pos).toBe(1)
            expect(note.prob).toBe(0.8)
            expect(note.arpTriggerProbability).toBe(0.9)
            expect(note.retriggerNum).toBe(3)
            expect(note.rate).toBe(2)
            expect(note.euclidianFill).toBe(2)
        })
    })

    describe('Pan from track name', () => {
        it('returns correct pan values', () => {
            expect(Utils.getPanFromTrackName('KICK')).toBe(0)
            expect(Utils.getPanFromTrackName('SNARE')).toBe(0.3)
            expect(Utils.getPanFromTrackName('CHH')).toBe(-0.3)
            expect(Utils.getPanFromTrackName('CRASH')).toBe(1)
            expect(Utils.getPanFromTrackName('UNKNOWN')).toBe(0)
        })
    })

    describe('Loop point increment', () => {
        it('decrements loopAtStep with wrap-around', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            track.loopAtStep = 16

            mfCmd.incrLoopPoint(track)
            expect(track.loopAtStep).toBe(15)
            expect(track.loopPointBeat).toBe(3)
            expect(track.loopPointStep).toBe(3)

            for (let i = 0; i < 15; i++) {
                mfCmd.incrLoopPoint(track)
            }
            expect(track.loopAtStep).toBe(16)
        })
    })

    describe('Bar quantize cycle', () => {
        it('incrNbStepPerBar changes stepsPerBeat', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            const note = mfCmd.addNote(track, 0, 2)
            note.steppc = 50

            const original = track.stepsPerBeat
            mfCmd.incrNbStepPerBar(track)
            expect(track.stepsPerBeat).not.toBe(original)
        })
    })

    describe('getTrackFromType', () => {
        it('finds track by name in pattern', () => {
            const pattern = mfCmd.addPattern('Test')
            mfCmd.addTrack(pattern, 'KICK')
            mfCmd.addTrack(pattern, 'SNARE')

            expect(mfCmd.getTrackFromType(pattern, 'KICK').name).toBe('KICK')
            expect(mfCmd.getTrackFromType(pattern, 'SNARE').name).toBe('SNARE')
            expect(mfCmd.getTrackFromType(pattern, 'MISSING')).toBeNull()
        })
    })

    describe('setNbBeats', () => {
        it('changes pattern nbBeats and updates tracks', () => {
            const pattern = mfCmd.addPattern('Test')
            mfCmd.addTrack(pattern, 'KICK')
            mfCmd.setNbBeats(pattern, 2)

            expect(pattern.nbBeats).toBe(8)
            expect(pattern.tracks[0].nbBeats).toBe(8)
        })

        it('adjusts loopAtStep if it exceeds old beat count', () => {
            const pattern = mfCmd.addPattern('Test')
            mfCmd.addTrack(pattern, 'KICK')
            pattern.tracks[0].loopAtStep = 32

            mfCmd.setNbBeats(pattern, 1)
            expect(pattern.tracks[0].loopAtStep).toBe(16)
            expect(pattern.tracks[0].nbBeats).toBe(4)
        })
    })

    describe('cleanPattern', () => {
        it('empties all tracks in pattern', () => {
            const pattern = mfCmd.addPattern('Test')
            const t1 = mfCmd.addTrack(pattern, 'KICK')
            const t2 = mfCmd.addTrack(pattern, 'SNARE')
            mfCmd.addNote(t1, 0, 0)
            mfCmd.addNote(t2, 0, 0)

            mfCmd.cleanPattern(pattern)

            expect(t1.notes).toEqual([])
            expect(t2.notes).toEqual([])
        })
    })

    describe('changeTrackSound', () => {
        it('updates soundId and flags', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.changeTrackSound(track, 'snd_42')

            expect(track.soundId).toBe('snd_42')
            expect(track.useAutoAssignSound).toBe(false)
            expect(track.useSoftSynth).toBe(false)
            expect(track.sampleDecay).toBe(0.5)
        })
    })

    describe('changeTrackName', () => {
        it('updates name and sampleDecay', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.changeTrackName(track, 'NEWNAME')

            expect(track.name).toBe('NEWNAME')
            expect(track.sampleDecay).toBe(0.5)
        })
    })

    describe('getAllSoundsForType', () => {
        it('finds sounds by key', () => {
            MfGlobals.sounds = {
                s1: { key: 'kd', kit_name: 'real' },
                s2: { key: 'sd', kit_name: 'real' },
                s3: { key: 'kd', kit_name: 'electro' }
            }

            const sounds = mfCmd.getAllSoundsForType('kd')
            expect(sounds.length).toBe(2)
            expect(sounds[0].kit_name).toBe('real')
            expect(sounds[1].kit_name).toBe('electro')
        })

        it('returns empty array when no match', () => {
            MfGlobals.sounds = { s1: { key: 'kd' } }
            expect(mfCmd.getAllSoundsForType('xx')).toEqual([])
        })
    })

    describe('getSoundIdFromUrl', () => {
        it('finds soundId by url', () => {
            MfGlobals.sounds = {
                snd_1: { url: 'kits/real/kick.wav' },
                snd_2: { url: 'kits/real/snare.wav' }
            }

            expect(mfCmd.getSoundIdFromUrl('kits/real/kick.wav')).toBe('snd_1')
            expect(mfCmd.getSoundIdFromUrl('kits/real/snare.wav')).toBe('snd_2')
        })

        it('returns NOT_FOUND when no match', () => {
            MfGlobals.sounds = { snd_1: { url: 'a.wav' } }
            expect(mfCmd.getSoundIdFromUrl('b.wav')).toBe('NOT_FOUND')
        })
    })

    describe('kitIsLoaded', () => {
        it('returns true when kit sounds are loaded', () => {
            MfGlobals.sounds = { s1: { kit_name: 'real' } }
            expect(mfCmd.kitIsLoaded({ name: 'real' })).toBe(true)
            expect(mfCmd.kitIsLoaded({ name: 'electro' })).toBe(false)
        })
    })
})

describe('Functional: Utils loop detection', () => {
    describe('addLoopToTrackIfPossible', () => {
        it('detects repeating pattern and sets loop', () => {
            const track = {
                name: 'KICK',
                nbBeats: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 0 }, { beat: 0, beatStep: 2 },
                    { beat: 1, beatStep: 0 }, { beat: 1, beatStep: 2 },
                    { beat: 2, beatStep: 0 }, { beat: 2, beatStep: 2 },
                    { beat: 3, beatStep: 0 }, { beat: 3, beatStep: 2 }
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
                nbBeats: 4,
                stepsPerBeat: 4,
                loopAtStep: 16,
                notes: [
                    { beat: 0, beatStep: 0 },
                    { beat: 2, beatStep: 0 }
                ]
            }

            const result = Utils.addLoopToTrackIfPossible(track)

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
            expect(Utils.getNoteAbsoluteStep({ beat: 0, beatStep: 0 }, 4)).toBe(0)
            expect(Utils.getNoteAbsoluteStep({ beat: 1, beatStep: 2 }, 4)).toBe(6)
            expect(Utils.getNoteAbsoluteStep({ beat: 3, beatStep: 3 }, 4)).toBe(15)
        })
    })

    describe('getTrackStepLength', () => {
        it('computes length from beats and quantize', () => {
            const track = { nbBeats: 4, stepsPerBeat: 4, notes: [] }
            expect(Utils.getTrackStepLength(track)).toBe(16)
        })

        it('notes extending beyond declared beats increase length', () => {
            const track = {
                nbBeats: 2,
                stepsPerBeat: 4,
                notes: [{ beat: 3, beatStep: 0 }]
            }
            expect(Utils.getTrackStepLength(track)).toBe(13)
        })
    })

    describe('trackNotesMatchLoop', () => {
        it('validates loop correctness', () => {
            const track = {
                stepsPerBeat: 4,
                notes: [
                    { beat: 0, beatStep: 0 }, { beat: 0, beatStep: 2 },
                    { beat: 1, beatStep: 0 }, { beat: 1, beatStep: 2 },
                    { beat: 2, beatStep: 0 }, { beat: 2, beatStep: 2 },
                    { beat: 3, beatStep: 0 }, { beat: 3, beatStep: 2 }
                ]
            }

            expect(Utils.trackNotesMatchLoop(track, 4, 16)).toBe(true)
            expect(Utils.trackNotesMatchLoop(track, 8, 16)).toBe(true)
        })
    })
})
