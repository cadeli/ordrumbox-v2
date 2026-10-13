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

    it('autoAssignTrackSounds never rewrites the track name, only matches with it', () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
        const track = cmd.createTrack(4, 'kick_01.wav', 4)
        track.useAutoAssignSound = true

        autoAssign.autoAssignTrackSounds(track)

        expect(track.name).toBe('kick_01.wav')
        expect(track.sampleId).toBe('snd_kick')
        warnSpy.mockRestore()
    })

    // The exact match must win every time: before, tier 1 drew a random candidate
    // of the same coarse type, so "CHH" could land on the open hi-hat.
    it('tier1 is deterministic when several candidates share the track type', () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
        for (let i = 0; i < 30; i++) {
            const track = cmd.createTrack(4, 'CHH', 4)
            track.useAutoAssignSound = true

            autoAssign.autoAssignTrackSounds(track)

            expect(track.sampleId).toBe('snd_chh')
        }
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
        expect(chh.sampleId).toBe('snd_chh')
    })

    it('finds equivalent instrument when direct match fails', () => {
        const track = cmd.createTrack(4, 'CLAP', 4)
        track.useAutoAssignSound = true

        autoAssign.autoAssignTrackSounds(track)

        // CLAP has no direct sound but should try equivalents
        expect(track.sampleId).not.toBe('NOT_DEFINED')
    })

    it('getSampleIdFromTrackname returns matching sound in kit', () => {
        const result = autoAssign.getSampleIdFromTrackname('KICK', 'real')
        expect(result).toBe('snd_kick')
    })

    it('getSampleIdFromTrackname ignores other kits when a kit is given', () => {
        const result = autoAssign.getSampleIdFromTrackname('KICK', 'nonexistent')
        expect(result).toBe(AutoAssign.NOT_FOUND)
    })

    it('getSampleIdFromTrackname returns NOT_FOUND for unknown track', () => {
        const result = autoAssign.getSampleIdFromTrackname('TOM', 'real')
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

describe('Functional: substitution chain never lands on a melodic instrument', () => {
    let cmd, autoAssign

    beforeEach(() => {
        cmd = new Commander()
        autoAssign = new AutoAssign()
    })

    /**
     * A one-kit registry whose sound keys are the given instrument ids.
     * @param {string} kitName
     * @param {string[]} keys
     */
    const useKit = (kitName, keys) => {
        soundRegistry.reset()
        appState.reset()
        soundRegistry.sounds = Object.fromEntries(
            keys.map((key) => [`snd_${key.toLowerCase()}`, { key, kitName, url: `kits/${kitName}/${key}.wav` }]),
        )
        soundRegistry.drumkitList = [{ name: kitName, instruments: [] }]
        appState.selectedDrumkitIdx = 0
        autoAssign = new AutoAssign()
    }

    // detectTrackType() has no rule for TOM, GUITAR, BRASS or STRING: they all
    // answer PERC. So a "same coarse type" match for a tom could return a guitar
    // — and the first such fuzzy hit used to short-circuit the chain before
    // MTOM (a real replacement of TOM, and the tom of the "real" kit) was tried.
    it('prefers an exact replacement over a fuzzy same-type hit', () => {
        useKit('test', ['MTOM', 'GUITAR', 'BRASS', 'STRING', 'CRASH'])

        expect(autoAssign.findSoundEquivalence(AutoAssign.NOT_FOUND, 'test', 'TOM')).toBe('snd_mtom')
    })

    it('a drum substitute is never a drum:false instrument, whatever the draw', () => {
        useKit('test', ['MTOM', 'GUITAR', 'BRASS', 'STRING', 'CRASH'])
        const track = cmd.createTrack(4, 'TOM', 4)
        track.useAutoAssignSound = true

        for (let i = 0; i < 50; i++) {
            autoAssign.autoAssignTrackSounds(track)
            expect(track.sampleId).toBe('snd_mtom')
        }
    })

    it('keeps walking the chain instead of accepting a melodic fuzzy hit', () => {
        // TOM substitutes HI_TOM -> MTOM -> CHH. Only CHH is present, and CHH is
        // a drum: the chain must reach it rather than draw one of the melodic
        // PERC keys sitting next to it.
        useKit('test', ['GUITAR', 'BRASS', 'STRING', 'CHH'])

        expect(autoAssign.findSoundEquivalence(AutoAssign.NOT_FOUND, 'test', 'TOM')).toBe('snd_chh')
    })

    it('answers NOT_FOUND when only melodic instruments share the type', () => {
        useKit('test', ['GUITAR', 'BRASS', 'PIANO', 'ORGAN', 'BASS'])

        expect(autoAssign.findSoundEquivalence(AutoAssign.NOT_FOUND, 'test', 'TOM')).toBe(AutoAssign.NOT_FOUND)
    })

    it('a melodic target keeps its loose bucket', () => {
        // MELO substitutes PIANO -> SYNTH -> TOM, none of which is present.
        // MELO is itself melodic, so its same-type fallback is NOT narrowed to
        // drums: the bucket stays as loose as it used to be.
        useKit('test', ['GUITAR', 'MTOM'])

        const result = autoAssign.findSoundEquivalence(AutoAssign.NOT_FOUND, 'test', 'MELO')
        expect(['snd_guitar', 'snd_mtom']).toContain(result)
    })
})
