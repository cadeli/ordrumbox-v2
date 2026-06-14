import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'

describe('MfCmd: extended coverage', () => {
    let mfCmd

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
    })

    describe('Pattern getters/setters', () => {
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

    describe('updateTrack properties', () => {
        it('copies all known properties via updateTrack', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            const source = {
                soundId: 'snd_1',
                bars: 8,
                barQuantize: 8,
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
                delayAmount: 0.3,
                fxSelected: 'delay',
                saturationType: 'hard',
                saturationAmount: 0.5,
                sampleLength: 0.8,
                synthSoundKey: 'saw'
            }
            mfCmd.updateTrack(track, source)

            expect(track.soundId).toBe('snd_1')
            expect(track.bars).toBe(8)
            expect(track.barQuantize).toBe(8)
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
            expect(track.delayAmount).toBe(0.3)
            expect(track.fxSelected).toBe('delay')
            expect(track.saturationType).toBe('hard')
            expect(track.saturationAmount).toBe(0.5)
            expect(track.sampleLength).toBe(0.8)
            expect(track.synthSoundKey).toBe('saw')
        })

        it('nbBars sets bars via direct assignment', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            track.bars = 8
            track.nbBars = 8
            expect(track.bars).toBe(8)
            expect(track.nbBars).toBe(8)
        })

        it('computes loopPointBar/Step after update', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.updateTrack(track, { loopAtStep: 10 })
            expect(track.loopPointBar).toBe(2)
            expect(track.loopPointStep).toBe(2)
        })
    })

    describe('Note property updates', () => {
        it('can set note properties directly', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            const note = mfCmd.addNote(track, 0, 0)
            note.barStep = 2
            note.bar = 1
            note.velocity = 0.5
            note.pan = -0.3
            note.pitch = 7
            note.arp = [0, 12]
            note.triggerFreq = 2
            note.triggerPhase = 1
            note.triggerProbability = 0.8
            note.arpTriggerProbability = 0.9
            note.retriggerNum = 3
            note.retriggerStep = 2
            note.euclidianFill = 2

            expect(note.barStep).toBe(2)
            expect(note.bar).toBe(1)
            expect(note.velocity).toBe(0.5)
            expect(note.pan).toBe(-0.3)
            expect(note.pitch).toBe(7)
            expect(note.arp).toEqual([0, 12])
            expect(note.triggerFreq).toBe(2)
            expect(note.triggerPhase).toBe(1)
            expect(note.triggerProbability).toBe(0.8)
            expect(note.arpTriggerProbability).toBe(0.9)
            expect(note.retriggerNum).toBe(3)
            expect(note.retriggerStep).toBe(2)
            expect(note.euclidianFill).toBe(2)
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

    describe('setNbBar', () => {
        it('changes pattern nbBars and updates tracks', () => {
            const pattern = mfCmd.addPattern('Test')
            mfCmd.addTrack(pattern, 'KICK')
            mfCmd.setNbBar(pattern, 2)

            expect(pattern.nbBars).toBe(8)
            expect(pattern.tracks[0].bars).toBe(8)
        })

        it('adjusts loopAtStep if it exceeds old bar count', () => {
            const pattern = mfCmd.addPattern('Test')
            mfCmd.addTrack(pattern, 'KICK')
            pattern.tracks[0].loopAtStep = 32

            mfCmd.setNbBar(pattern, 1)
            expect(pattern.tracks[0].loopAtStep).toBe(16)
            expect(pattern.tracks[0].bars).toBe(4)
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
            expect(track.sampleLength).toBe(1)
        })
    })

    describe('changeTrackName', () => {
        it('updates name and sampleLength', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.changeTrackName(track, 'NEWNAME')

            expect(track.name).toBe('NEWNAME')
            expect(track.sampleLength).toBe(1)
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

    describe('updateTrack edge cases', () => {
        it('returns track unchanged for null updates', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            expect(mfCmd.updateTrack(track, null)).toBe(track)
            expect(mfCmd.updateTrack(track, undefined)).toBe(track)
        })

        it('returns track unchanged for non-object updates', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            expect(mfCmd.updateTrack(track, 42)).toBe(track)
        })

        it('computes loopPointBar/Step from barQuantize and loopAtStep', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            mfCmd.updateTrack(track, { barQuantize: 8, loopAtStep: 20 })
            expect(track.loopPointBar).toBe(2)
            expect(track.loopPointStep).toBe(4)
        })

        it('computes loopAtStep from loopPointBar/Step when loopAtStep undefined', () => {
            const track = { barQuantize: 4, loopPointBar: 2, loopPointStep: 1 }
            mfCmd.updateTrack(track, {})
            expect(track.loopAtStep).toBe(9)
        })
    })

    describe('addNote edge cases', () => {
        it('caps barQuantize at 8 when steppc exceeds 100', () => {
            const track = mfCmd.createTrack(4, 'KICK', 4)
            track.barQuantize = 4
            const note = mfCmd.addNote(track, 0, 5)
            expect(track.barQuantize).toBe(8)
            expect(note.steppc).toBe(63)
        })
    })
})
