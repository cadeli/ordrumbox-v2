import { describe, it, expect, beforeEach, vi } from 'vitest'
import { logger } from '../src/core/logger.js'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import MfAutoAssign from '../src/logic/services/auto_assign.js'

describe('Functional: Auto-assign sounds', () => {
    let cmd, autoAssign

    beforeEach(() => {
        MfGlobals.resetAll()
        cmd = new MfCmd()
        autoAssign = new MfAutoAssign()
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
        const track = cmd.createTrack(4, 'KICK', 4)
        track.useAutoAssignSound = true

        autoAssign.autoAssignTrackSounds(track)

        expect(track.soundId).toBe('snd_kick')
    })

    it('autoAssignTrackSounds renames track when instrument name is found', () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
        const track = cmd.createTrack(4, 'kick_01.wav', 4)
        track.useAutoAssignSound = true

        autoAssign.autoAssignTrackSounds(track)

        expect(track.name).toBe('KICK')
        expect(track.soundId).toBe('snd_kick')
        warnSpy.mockRestore()
    })

    it('skips tracks with useAutoAssignSound=false', () => {
        const pattern = cmd.addPattern('Test')
        const track = cmd.addTrack(pattern, 'KICK', 4)
        track.useAutoAssignSound = false
        track.soundId = 'existing_sound'

        autoAssign.autoAssignSounds(pattern)

        expect(track.soundId).toBe('existing_sound')
    })

    it('autoAssignSounds skips tracks with useSoftSynth=true', () => {
        const pattern = cmd.addPattern('Test')
        const track = cmd.addTrack(pattern, 'SYNTH', 4)
        track.useAutoAssignSound = true
        track.useSoftSynth = true
        track.soundId = 'NOT_DEFINED'

        autoAssign.autoAssignSounds(pattern)

        // autoAssignSounds checks useSoftSynth and skips the track
        expect(track.soundId).toBe('NOT_DEFINED')
    })

    it('autoAssignSounds processes all tracks in a pattern', () => {
        const pattern = cmd.addPattern('Test')
        const kick = cmd.addTrack(pattern, 'KICK', 4)
        const snare = cmd.addTrack(pattern, 'SNARE', 4)
        const chh = cmd.addTrack(pattern, 'CHH', 4)
        kick.useAutoAssignSound = true
        snare.useAutoAssignSound = true
        chh.useAutoAssignSound = true

        autoAssign.autoAssignSounds(pattern)

        expect(kick.soundId).toBe('snd_kick')
        expect(snare.soundId).toBe('snd_snare')
        expect(chh.soundId).toBe('snd_chh')
    })

    it('finds equivalent instrument when direct match fails', () => {
        const track = cmd.createTrack(4, 'CLAP', 4)
        track.useAutoAssignSound = true

        autoAssign.autoAssignTrackSounds(track)

        // CLAP has no direct sound but should try equivalents
        expect(track.soundId).not.toBe('NOT_DEFINED')
    })

    it('getSoundIdFromKitAndTrackname returns matching sound in kit', () => {
        const result = autoAssign.getSoundIdFromKitAndTrackname('real', 'KICK')
        expect(result).toBe('snd_kick')
    })

    it('getSoundIdFromKitAndTrackname returns NOT_FOUND for unknown track', () => {
        const result = autoAssign.getSoundIdFromKitAndTrackname('real', 'TOM')
        expect(result).toBe(MfAutoAssign.NOT_FOUND)
    })

    it('getSoundIdFromKitAndTrackname returns NOT_FOUND for unknown kit', () => {
        const result = autoAssign.getSoundIdFromKitAndTrackname('nonexistent', 'KICK')
        expect(result).toBe(MfAutoAssign.NOT_FOUND)
    })

    it('getSoundIdFromTrackname finds sound by key match', () => {
        const result = autoAssign.getSoundIdFromTrackname('KICK')
        expect(result).toBe('snd_kick')
    })

    it('getSoundIdFromTrackname returns NOT_FOUND for unknown name', () => {
        const result = autoAssign.getSoundIdFromTrackname('GUITAR')
        expect(result).toBe(MfAutoAssign.NOT_FOUND)
    })

    it('getSoundIdByKeyContaining finds sound by partial key match', () => {
        const result = autoAssign.getSoundIdByKeyContaining('real', 'KIC')
        expect(result).toBe('snd_kick')
    })

    it('getSoundIdByKeyContaining with null kit searches all kits', () => {
        const result = autoAssign.getSoundIdByKeyContaining(null, 'KIC')
        expect(result).toBe('snd_kick')
    })

    it('getSoundIdByKeyContaining returns NOT_FOUND for empty search', () => {
        const result = autoAssign.getSoundIdByKeyContaining('real', '')
        expect(result).toBe(MfAutoAssign.NOT_FOUND)
    })

    it('autoAssignSounds with empty sounds does not crash', () => {
        autoAssign._soundRegistry.sounds = {}
        const pattern = cmd.addPattern('Test')
        const track = cmd.addTrack(pattern, 'KICK', 4)
        track.useAutoAssignSound = true
        const originalSoundId = track.soundId

        autoAssign.autoAssignSounds(pattern)

        expect(track.soundId).toBe(originalSoundId)
    })
})
