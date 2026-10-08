import { describe, it, expect, beforeEach, vi } from 'vitest'
import { logger } from '../src/core/logger.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import Commander from '../src/logic/commands/commander.js'
import AutoAssign from '../src/logic/services/auto_assign.js'

describe('Functional: Auto-assign sounds', () => {
    let cmd, autoAssign

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        cmd = new Commander()
        autoAssign = new AutoAssign()
        soundRegistry.sounds = {
            snd_kick: { key: 'KICK', kitName: 'real', url: 'kits/real/kick.wav' },
            snd_snare: { key: 'SNARE', kitName: 'real', url: 'kits/real/snare.wav' },
            snd_chh: { key: 'CHH', kitName: 'real', url: 'kits/real/chh.wav' },
            snd_ohh: { key: 'OHH', kitName: 'real', url: 'kits/real/ohh.wav' },
        }
        soundRegistry.drumkitList = [{ name: 'real', instruments: [] }]
        appState.selectedDrumkitIdx = 0
    })

    it('autoAssignTrackSounds finds sound by track name', () => {
        const track = cmd.createTrack(4, 'KICK', 4)
        track.useAutoAssignSound = true

        autoAssign.autoAssignTrackSounds(track)

        expect(track.sampleId).toBe('snd_kick')
    })

    it('autoAssignTrackSounds renames track when instrument name is found', () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
        const track = cmd.createTrack(4, 'kick_01.wav', 4)
        track.useAutoAssignSound = true

        autoAssign.autoAssignTrackSounds(track)

        expect(track.name).toBe('KICK')
        expect(track.sampleId).toBe('snd_kick')
        warnSpy.mockRestore()
    })

    it('skips tracks with useAutoAssignSound=false', () => {
        const pattern = cmd.addPattern('Test')
        const track = cmd.addTrack(pattern, 'KICK', 4)
        track.useAutoAssignSound = false
        track.sampleId = 'existing_sound'

        autoAssign.autoAssignSounds(pattern)

        expect(track.sampleId).toBe('existing_sound')
    })

    // A soft-synth track has no sample to assign, so the drum tiers must leave its
    // sampleId alone — but it does need a synth patch, which is the whole point of
    // useSoftSynth.
    it('autoAssignSounds leaves a soft-synth track sampleId alone but gives it a patch', () => {
        soundRegistry.generatedSounds = { BASS1: {}, PIANO: {} }
        const pattern = cmd.addPattern('Test')
        const track = cmd.addTrack(pattern, 'SYNTH', 4)
        track.useAutoAssignSound = true
        track.useSoftSynth = true
        track.sampleId = 'NOT_DEFINED'
        track.synthSoundKey = null

        autoAssign.autoAssignSounds(pattern)

        expect(track.sampleId).toBe('NOT_DEFINED') // the drum path still skips it
        expect(Object.keys(soundRegistry.generatedSounds)).toContain(track.synthSoundKey)
    })

    describe('soft-synth patch assignment', () => {
        const synthPattern = (tracks) => ({ name: 'Synth', bpm: 120, beatCount: 4, tracks })

        it('assigns a random patch to a soft-synth track that has none', () => {
            soundRegistry.generatedSounds = { BASS1: {}, PIANO: {}, SYNTH2: {} }
            const pattern = synthPattern({ BASS: { name: 'BASS', useSoftSynth: true, synthSoundKey: null } })

            autoAssign.autoAssignSounds(pattern)

            const key = pattern.tracks.BASS.synthSoundKey
            expect(key).not.toBeNull()
            expect(Object.keys(soundRegistry.generatedSounds)).toContain(key)
        })

        it('keeps the patch the track already uses', () => {
            soundRegistry.generatedSounds = { BASS1: {}, PIANO: {} }
            const pattern = synthPattern({ BASS: { name: 'BASS', useSoftSynth: true, synthSoundKey: 'PIANO' } })

            autoAssign.autoAssignSounds(pattern)

            expect(pattern.tracks.BASS.synthSoundKey).toBe('PIANO')
        })

        it('reassigns a patch that is no longer in the registry', () => {
            soundRegistry.generatedSounds = { BASS1: {} }
            const pattern = synthPattern({ BASS: { name: 'BASS', useSoftSynth: true, synthSoundKey: 'DELETED' } })

            autoAssign.autoAssignSounds(pattern)

            expect(pattern.tracks.BASS.synthSoundKey).toBe('BASS1')
        })

        it('leaves the track alone when no synth preset is loaded', () => {
            soundRegistry.generatedSounds = {}
            const pattern = synthPattern({ BASS: { name: 'BASS', useSoftSynth: true, synthSoundKey: null } })

            autoAssign.autoAssignSounds(pattern)

            expect(pattern.tracks.BASS.synthSoundKey).toBeNull()
        })

        it('does not touch sample tracks', () => {
            soundRegistry.generatedSounds = { BASS1: {} }
            soundRegistry.sounds = { snd_kick: { key: 'KICK', kitName: 'real', url: 'k.wav' } }
            soundRegistry.drumkitList = [{ name: 'real', instruments: [{ key: 'KICK', url: 'k.wav' }] }]
            const pattern = synthPattern({ KICK: { name: 'KICK', useSoftSynth: false, useAutoAssignSound: true } })

            autoAssign.autoAssignSounds(pattern)

            expect(pattern.tracks.KICK.synthSoundKey).toBeUndefined()
        })
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

        expect(kick.sampleId).toBe('snd_kick')
        expect(snare.sampleId).toBe('snd_snare')
        expect(chh.sampleId).toMatch(/snd_(chh|ohh)/)
    })

    it('finds equivalent instrument when direct match fails', () => {
        const track = cmd.createTrack(4, 'CLAP', 4)
        track.useAutoAssignSound = true

        autoAssign.autoAssignTrackSounds(track)

        // CLAP has no direct sound but should try equivalents
        expect(track.sampleId).not.toBe('NOT_DEFINED')
    })

    it('getSampleIdFromKitAndTrackname returns matching sound in kit', () => {
        const result = autoAssign.getSampleIdFromKitAndTrackname('real', 'KICK')
        expect(result).toBe('snd_kick')
    })

    it('getSampleIdFromKitAndTrackname returns NOT_FOUND for unknown track', () => {
        const result = autoAssign.getSampleIdFromKitAndTrackname('real', 'TOM')
        expect(result).toBe(AutoAssign.NOT_FOUND)
    })

    it('getSampleIdFromKitAndTrackname returns NOT_FOUND for unknown kit', () => {
        const result = autoAssign.getSampleIdFromKitAndTrackname('nonexistent', 'KICK')
        expect(result).toBe(AutoAssign.NOT_FOUND)
    })

    it('getSampleIdFromTrackname finds sound by key match', () => {
        const result = autoAssign.getSampleIdFromTrackname('KICK')
        expect(result).toBe('snd_kick')
    })

    it('getSampleIdFromTrackname returns NOT_FOUND for unknown name', () => {
        const result = autoAssign.getSampleIdFromTrackname('GUITAR')
        expect(result).toBe(AutoAssign.NOT_FOUND)
    })

    it('getSampleIdByKeyContaining finds sound by partial key match', () => {
        const result = autoAssign.getSampleIdByKeyContaining('real', 'KIC')
        expect(result).toBe('snd_kick')
    })

    it('getSampleIdByKeyContaining with null kit searches all kits', () => {
        const result = autoAssign.getSampleIdByKeyContaining(null, 'KIC')
        expect(result).toBe('snd_kick')
    })

    it('getSampleIdByKeyContaining returns NOT_FOUND for empty search', () => {
        const result = autoAssign.getSampleIdByKeyContaining('real', '')
        expect(result).toBe(AutoAssign.NOT_FOUND)
    })

    it('autoAssignSounds with empty sounds does not crash', () => {
        soundRegistry.sounds = {}
        const pattern = cmd.addPattern('Test')
        const track = cmd.addTrack(pattern, 'KICK', 4)
        track.useAutoAssignSound = true
        const originalSampleId = track.sampleId

        autoAssign.autoAssignSounds(pattern)

        expect(track.sampleId).toBe(originalSampleId)
    })
})
