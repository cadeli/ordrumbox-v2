import { describe, it, expect, beforeEach } from 'vitest'
import { Globals } from '../src/core/globals.js'
import Commander from '../src/logic/commands/cmd.js'
import Utils from '../src/core/utils.js'

describe('Functional: Commander operations', () => {
    let cmd

    beforeEach(() => {
        Globals.resetAll()
        cmd = new Commander()
        Globals.cmd = cmd
    })

    describe('Pattern CRUD', () => {
        it('createPattern produces correct defaults', () => {
            const pattern = cmd.addPattern('Test')

            expect(pattern.name).toBe('Test')
            expect(pattern.bpm).toBe(120)
            expect(pattern.nbBeats).toBe(4)
            expect(pattern.tracks).toEqual([])
            expect(pattern.description).toBe('')
        })

        it('auto-generates name when null', () => {
            Globals.patterns = [{ name: 'a' }, { name: 'b' }]
            const pattern = cmd.addPattern(null)

            expect(pattern.name).toBe('NewPat_2')
        })

        it('setPatternBpm updates correctly', () => {
            const pattern = cmd.addPattern('Test')
            cmd.setPatternBpm(pattern, 140)

            expect(pattern.bpm).toBe(140)
        })

        it('getPatternByName finds by name case-insensitive', () => {
            cmd.addPattern('TestPat')
            expect(cmd.getPatternByName('testpat')).toBeTruthy()
            expect(cmd.getPatternByName('TESTPAT')).toBeTruthy()
            expect(cmd.getPatternByName('noname')).toBeNull()
        })

        it('setPatternDescription sets description', () => {
            const pattern = cmd.addPattern('Test')
            cmd.setPatternDescription(pattern, 'my desc')
            expect(pattern.description).toBe('my desc')
        })

        it('setPatternDescription handles null pattern', () => {
            expect(() => cmd.setPatternDescription(null, 'x')).toThrow()
        })

        it('setPatternBpm with invalid value uses default', () => {
            const pattern = cmd.addPattern('Test')
            cmd.setPatternBpm(pattern, 0)
            expect(pattern.bpm).toBe(120)
        })
    })

    describe('Track operations', () => {
        it('createTrack produces correct default structure', () => {
            const track = cmd.createTrack(4, 'KICK', 4)

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
            const track = cmd.createTrack(4, 'KICK', 4)
            const note = cmd.addNote(track, 1, 2, 5)

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
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 1, 0)
            cmd.addNote(track, 2, 0)

            cmd.deleteNote(track, { beat: 1, beatStep: 0, pitch: 0 })

            expect(track.notes.length).toBe(2)
            expect(cmd.isNoteAt(track, 1, 0).length).toBe(0)
            expect(cmd.isNoteAt(track, 0, 0).length).toBe(1)
            expect(cmd.isNoteAt(track, 2, 0).length).toBe(1)
        })

        it('isNoteAt returns array of notes at position', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 0, 0)

            expect(cmd.isNoteAt(track, 0, 0).length).toBe(2)
            expect(cmd.isNoteAt(track, 99, 99).length).toBe(0)
        })

        it('updateTrack applies whitelisted properties only', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.updateTrack(track, { nbBeats: 8, mute: true, unknownProp: 'test' })

            expect(track.nbBeats).toBe(8)
            expect(track.mute).toBe(true)
            expect(track.unknownProp).toBeUndefined()
        })

        it('cleanTrack removes all notes and resets loop', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.addNote(track, 0, 0)
            track.loopPointBeat = 2
            track.loopPointStep = 2
            track.loopAtStep = 10

            cmd.cleanTrack(track)

            expect(track.notes).toEqual([])
            expect(track.loopPointStep).toBe(0)
            expect(track.loopPointBeat).toBe(4)
            expect(track.loopAtStep).toBe(16)
        })

        it('copies all known properties via updateTrack', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
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
                synthSoundKey: 'saw'
            }
            cmd.updateTrack(track, source)

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
            expect(track.synthSoundKey).toBe('saw')
        })

        it('computes loopPointBeat/Step after update', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.updateTrack(track, { loopAtStep: 10 })
            expect(track.loopPointBeat).toBe(2)
            expect(track.loopPointStep).toBe(2)
        })

        it('updateTrack returns track unchanged for null updates', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            expect(cmd.updateTrack(track, null)).toBe(track)
            expect(cmd.updateTrack(track, undefined)).toBe(track)
        })

        it('updateTrack returns track unchanged for non-object updates', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            expect(cmd.updateTrack(track, 42)).toBe(track)
        })

        it('computes loopPointBeat/Step from stepsPerBeat and loopAtStep', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.updateTrack(track, { stepsPerBeat: 8, loopAtStep: 20 })
            expect(track.loopPointBeat).toBe(2)
            expect(track.loopPointStep).toBe(4)
        })

        it('computes loopAtStep from loopPointBeat/Step when loopAtStep undefined', () => {
            const track = { stepsPerBeat: 4, loopPointBeat: 2, loopPointStep: 1 }
            cmd.updateTrack(track, {})
            expect(track.loopAtStep).toBe(9)
        })

        it('caps stepsPerBeat at 8 when steppc exceeds 100', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            track.stepsPerBeat = 4
            const note = cmd.addNote(track, 0, 5)
            expect(track.stepsPerBeat).toBe(8)
            expect(note.steppc).toBe(63)
        })
    })

    describe('Note property updates', () => {
        it('can set note properties directly', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            const note = cmd.addNote(track, 0, 0)
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
            const track = cmd.createTrack(4, 'KICK', 4)
            track.loopAtStep = 16

            cmd.incrLoopPoint(track)
            expect(track.loopAtStep).toBe(15)
            expect(track.loopPointBeat).toBe(3)
            expect(track.loopPointStep).toBe(3)

            for (let i = 0; i < 15; i++) {
                cmd.incrLoopPoint(track)
            }
            expect(track.loopAtStep).toBe(16)
        })
    })

    describe('Bar quantize cycle', () => {
        it('incrNbStepPerBar changes stepsPerBeat', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            const note = cmd.addNote(track, 0, 2)
            note.steppc = 50

            const original = track.stepsPerBeat
            cmd.incrNbStepPerBar(track)
            expect(track.stepsPerBeat).not.toBe(original)
        })

        it('roundtrips notes through 8→4→8 stepsPerBeat changes', () => {
            const track = cmd.createTrack(4, 'KICK', 8)
            const n0 = cmd.addNote(track, 0, 0)
            const n1 = cmd.addNote(track, 0, 4)
            const n2 = cmd.addNote(track, 1, 2)
            const n3 = cmd.addNote(track, 2, 6)

            const origBeats = track.notes.map(n => n.beat)
            const origSteps = track.notes.map(n => n.beatStep)

            track.stepsPerBeat = 4
            track.notes.forEach(note => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 4), 3)
            })

            expect(track.notes.map(n => n.beatStep)).toEqual([0, 2, 1, 3])
            track.notes.forEach((note, i) => {
                expect(note.beat).toBe(origBeats[i])
            })

            track.stepsPerBeat = 8
            track.notes.forEach(note => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 8), 7)
            })

            track.notes.forEach((note, i) => {
                expect(note.beat).toBe(origBeats[i])
                expect(note.beatStep).toBe(origSteps[i])
            })
        })

        it('roundtrips notes through 8→1→8 stepsPerBeat changes via steppc', () => {
            const track = cmd.createTrack(4, 'KICK', 8)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 0, 3)
            cmd.addNote(track, 0, 4)
            cmd.addNote(track, 1, 6)

            const origBeats = track.notes.map(n => n.beat)
            const origSteps = track.notes.map(n => n.beatStep)

            track.stepsPerBeat = 1
            track.notes.forEach(note => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 1), 0)
            })

            track.stepsPerBeat = 8
            track.notes.forEach(note => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 8), 7)
            })

            track.notes.forEach((note, i) => {
                expect(note.beat).toBe(origBeats[i])
                expect(note.beatStep).toBe(origSteps[i])
            })
        })

        it('roundtrips notes through 6→2→6 stepsPerBeat changes via steppc', () => {
            const track = cmd.createTrack(4, 'KICK', 6)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 0, 1)
            cmd.addNote(track, 0, 2)
            cmd.addNote(track, 0, 3)
            cmd.addNote(track, 0, 4)
            cmd.addNote(track, 0, 5)
            cmd.addNote(track, 1, 3)
            cmd.addNote(track, 2, 5)

            const origBeats = track.notes.map(n => n.beat)
            const origSteps = track.notes.map(n => n.beatStep)

            track.stepsPerBeat = 2
            track.notes.forEach(note => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 2), 1)
            })

            track.stepsPerBeat = 6
            track.notes.forEach(note => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 6), 5)
            })

            track.notes.forEach((note, i) => {
                expect(note.beat).toBe(origBeats[i])
                expect(note.beatStep).toBe(origSteps[i])
            })
        })

        it('maps note to correct step on downsample via steppc (8→4)', () => {
            const track = cmd.createTrack(4, 'KICK', 8)
            cmd.addNote(track, 0, 7)

            track.stepsPerBeat = 4
            track.notes.forEach(note => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 4), 3)
            })

            expect(track.notes[0].beat).toBe(0)
            expect(track.notes[0].beatStep).toBe(3)
        })

        it('preserves all notes through 4→1→4 via steppc', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 0, 1)
            cmd.addNote(track, 0, 2)
            cmd.addNote(track, 0, 3)

            const origSteps = track.notes.map(n => n.beatStep)

            track.stepsPerBeat = 1
            track.notes.forEach(note => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 1), 0)
            })

            track.stepsPerBeat = 4
            track.notes.forEach(note => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 4), 3)
            })

            track.notes.forEach((note, i) => {
                expect(note.beatStep).toBe(origSteps[i])
            })
        })
    })

    describe('getTrackFromType', () => {
        it('finds track by name in pattern', () => {
            const pattern = cmd.addPattern('Test')
            cmd.addTrack(pattern, 'KICK')
            cmd.addTrack(pattern, 'SNARE')

            expect(cmd.getTrackFromType(pattern, 'KICK').name).toBe('KICK')
            expect(cmd.getTrackFromType(pattern, 'SNARE').name).toBe('SNARE')
            expect(cmd.getTrackFromType(pattern, 'MISSING')).toBeNull()
        })
    })

    describe('setNbBeats', () => {
        it('changes pattern nbBeats and updates tracks', () => {
            const pattern = cmd.addPattern('Test')
            cmd.addTrack(pattern, 'KICK')
            cmd.setNbBeats(pattern, 2)

            expect(pattern.nbBeats).toBe(8)
            expect(pattern.tracks[0].nbBeats).toBe(8)
        })

        it('adjusts loopAtStep if it exceeds old beat count', () => {
            const pattern = cmd.addPattern('Test')
            cmd.addTrack(pattern, 'KICK')
            pattern.tracks[0].loopAtStep = 32

            cmd.setNbBeats(pattern, 1)
            expect(pattern.tracks[0].loopAtStep).toBe(16)
            expect(pattern.tracks[0].nbBeats).toBe(4)
        })
    })

    describe('cleanPattern', () => {
        it('empties all tracks in pattern', () => {
            const pattern = cmd.addPattern('Test')
            const t1 = cmd.addTrack(pattern, 'KICK')
            const t2 = cmd.addTrack(pattern, 'SNARE')
            cmd.addNote(t1, 0, 0)
            cmd.addNote(t2, 0, 0)

            cmd.cleanPattern(pattern)

            expect(t1.notes).toEqual([])
            expect(t2.notes).toEqual([])
        })
    })

    describe('changeTrackSound', () => {
        it('updates soundId and flags', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.changeTrackSound(track, 'snd_42')

            expect(track.soundId).toBe('snd_42')
            expect(track.useAutoAssignSound).toBe(false)
            expect(track.useSoftSynth).toBe(false)
        })
    })

    describe('changeTrackName', () => {
        it('updates name', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.changeTrackName(track, 'NEWNAME')

            expect(track.name).toBe('NEWNAME')
        })
    })

    describe('getAllSoundsForType', () => {
        it('finds sounds by key', () => {
            Globals.sounds = {
                s1: { key: 'kd', kit_name: 'real' },
                s2: { key: 'sd', kit_name: 'real' },
                s3: { key: 'kd', kit_name: 'electro' }
            }

            const sounds = cmd.getAllSoundsForType('kd')
            expect(sounds.length).toBe(2)
            expect(sounds[0].kit_name).toBe('real')
            expect(sounds[1].kit_name).toBe('electro')
        })

        it('returns empty array when no match', () => {
            Globals.sounds = { s1: { key: 'kd' } }
            expect(cmd.getAllSoundsForType('xx')).toEqual([])
        })
    })

    describe('getSoundIdFromUrl', () => {
        it('finds soundId by url', () => {
            Globals.sounds = {
                snd_1: { url: 'kits/real/kick.wav' },
                snd_2: { url: 'kits/real/snare.wav' }
            }

            expect(cmd.getSoundIdFromUrl('kits/real/kick.wav')).toBe('snd_1')
            expect(cmd.getSoundIdFromUrl('kits/real/snare.wav')).toBe('snd_2')
        })

        it('returns NOT_FOUND when no match', () => {
            Globals.sounds = { snd_1: { url: 'a.wav' } }
            expect(cmd.getSoundIdFromUrl('b.wav')).toBe('NOT_FOUND')
        })
    })

    describe('kitIsLoaded', () => {
        it('returns true when kit sounds are loaded', () => {
            Globals.sounds = { s1: { kit_name: 'real' } }
            expect(cmd.kitIsLoaded({ name: 'real' })).toBe(true)
            expect(cmd.kitIsLoaded({ name: 'electro' })).toBe(false)
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
