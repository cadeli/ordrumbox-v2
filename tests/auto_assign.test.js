import { describe, it, expect, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import MfAutoAssign from '../src/logic/services/auto_assign.js'

describe('Functional: Auto-assign sounds', () => {
    let mfCmd, mfAutoAssign

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        mfAutoAssign = new MfAutoAssign()
        MfGlobals.sounds = {
            'snd_kick': { key: 'KICK', kit_name: 'real', url: 'kits/real/kick.wav' },
            'snd_snare': { key: 'SNARE', kit_name: 'real', url: 'kits/real/snare.wav' },
            'snd_chh': { key: 'CHH', kit_name: 'real', url: 'kits/real/chh.wav' },
            'snd_ohh': { key: 'OHH', kit_name: 'real', url: 'kits/real/ohh.wav' }
        }
        MfGlobals.drumkitList = [{ name: 'real', instruments: [] }]
        MfGlobals.selectedDrumkitNum = 0
    })

    it('autoAssignTrackSounds finds sound by track name', () => {
        const track = mfCmd.createTrack(4, 'KICK', 4)
        track.useAutoAssignSound = true

        mfAutoAssign.autoAssignTrackSounds(track)

        expect(track.soundId).toBe('snd_kick')
    })

    it('autoAssignTrackSounds renames track when instrument name is found', () => {
        const track = mfCmd.createTrack(4, 'kick_01.wav', 4)
        track.useAutoAssignSound = true

        mfAutoAssign.autoAssignTrackSounds(track)

        expect(track.name).toBe('KICK')
        expect(track.soundId).toBe('snd_kick')
    })

    it('skips tracks with useAutoAssignSound=false', () => {
        const pattern = mfCmd.addPattern('Test')
        const track = mfCmd.addTrack(pattern, 'KICK', 4)
        track.useAutoAssignSound = false
        track.soundId = 'existing_sound'

        mfAutoAssign.autoAssignSounds(pattern)

        expect(track.soundId).toBe('existing_sound')
    })

    it('autoAssignSounds skips tracks with useSoftSynth=true', () => {
        const pattern = mfCmd.addPattern('Test')
        const track = mfCmd.addTrack(pattern, 'SYNTH', 4)
        track.useAutoAssignSound = true
        track.useSoftSynth = true
        track.soundId = 'NOT_DEFINED'

        mfAutoAssign.autoAssignSounds(pattern)

        // autoAssignSounds checks useSoftSynth and skips the track
        expect(track.soundId).toBe('NOT_DEFINED')
    })

    it('autoAssignSounds processes all tracks in a pattern', () => {
        const pattern = mfCmd.addPattern('Test')
        const kick = mfCmd.addTrack(pattern, 'KICK', 4)
        const snare = mfCmd.addTrack(pattern, 'SNARE', 4)
        const chh = mfCmd.addTrack(pattern, 'CHH', 4)
        kick.useAutoAssignSound = true
        snare.useAutoAssignSound = true
        chh.useAutoAssignSound = true

        mfAutoAssign.autoAssignSounds(pattern)

        expect(kick.soundId).toBe('snd_kick')
        expect(snare.soundId).toBe('snd_snare')
        expect(chh.soundId).toBe('snd_chh')
    })

    it('finds equivalent instrument when direct match fails', () => {
        const track = mfCmd.createTrack(4, 'CLAP', 4)
        track.useAutoAssignSound = true

        mfAutoAssign.autoAssignTrackSounds(track)

        // CLAP has no direct sound but should try equivalents
        expect(track.soundId).not.toBe('NOT_DEFINED')
    })
})
