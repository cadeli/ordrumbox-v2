import { describe, it, expect, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import MfStructureSong from '../src/logic/generators/structure_song.js'
import MfAutoGenerate from '../src/logic/generators/auto_generate.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'

const SYNTH_SOUND_MAP = {
    KICK: 'BASS0',
    SNARE: 'SN',
    HAT: 'SYNTH1',
    BASS: 'BASS2',
    PERC: 'SYNTH2'
}

function detectTrackSynthType(name) {
    const n = name.toUpperCase()
    if (n.includes('KICK') || n.includes('BD')) return 'KICK'
    if (n.includes('SNARE') || n.includes('SD')) return 'SNARE'
    if (n.includes('HAT') || n.includes('CHH') || n.includes('OHH')) return 'HAT'
    if (n.includes('BASS') || n.includes('SYNTH')) return 'BASS'
    return 'PERC'
}

describe('MfStructureSong', () => {
    let structure

    beforeEach(() => {
        structure = new MfStructureSong()
    })

    describe('GENRES', () => {
        it('contains expected genres', () => {
            expect(MfStructureSong.GENRES).toEqual(
                expect.arrayContaining(['techno', 'house', 'drumandbass', 'hiphop', 'rock'])
            )
        })
    })

    describe('STRUCTURES', () => {
        it('has an entry for each genre', () => {
            MfStructureSong.GENRES.forEach(genre => {
                expect(MfStructureSong.STRUCTURES).toHaveProperty(genre)
            })
        })

        it('each structure maps track names to variant strings', () => {
            Object.values(MfStructureSong.STRUCTURES).forEach(structure => {
                expect(typeof structure).toBe('object')
                Object.entries(structure).forEach(([track, variant]) => {
                    expect(typeof track).toBe('string')
                    expect(typeof variant).toBe('string')
                    expect(variant.length).toBeGreaterThan(0)
                })
            })
        })
    })

    describe('getRandomGenre', () => {
        it('returns a genre from GENRES', () => {
            const genre = structure.getRandomGenre()
            expect(MfStructureSong.GENRES).toContain(genre)
        })

        it('can return each genre over multiple calls', () => {
            const results = new Set(Array.from({ length: 100 }, () => structure.getRandomGenre()))
            MfStructureSong.GENRES.forEach(genre => {
                expect(results.has(genre)).toBe(true)
            })
        })
    })

    describe('generateStructure', () => {
        it('returns a non-empty object for each genre', () => {
            MfStructureSong.GENRES.forEach(genre => {
                const result = structure.generateStructure(genre)
                expect(typeof result).toBe('object')
                expect(Object.keys(result).length).toBeGreaterThan(0)
            })
        })

        it('returns a copy, not the original', () => {
            const result = structure.generateStructure('techno')
            result.NewTrack = 'basic'
            expect(MfStructureSong.STRUCTURES.techno).not.toHaveProperty('NewTrack')
        })

        it('defaults to techno for unknown genre', () => {
            const result = structure.generateStructure('unknown')
            expect(result).toEqual(MfStructureSong.STRUCTURES.techno)
        })
    })

    describe('getElement', () => {
        it('returns an element for loop 0', () => {
            const el = structure.getElement(0)
            expect(el).toHaveProperty('name')
            expect(el).toHaveProperty('loop')
            expect(el.loop).toBe(0)
        })

        it('returns element with expected structure', () => {
            const el = structure.getElement(0)
            expect(el).toHaveProperty('name')
            expect(el).toHaveProperty('number')
            expect(el).toHaveProperty('index')
            expect(el).toHaveProperty('loop')
            expect(el).toHaveProperty('loopInSong')
            expect(el).toHaveProperty('loopInElement')
            expect(el).toHaveProperty('isLastLoopBeforeChange')
            expect(el).toHaveProperty('elementLoops')
            expect(el).toHaveProperty('totalLoops')
        })

        it('wraps around after totalLoops', () => {
            const el = structure.getElement(structure.totalLoops)
            expect(el.loopInSong).toBe(0)
        })

        it('handles negative loop values', () => {
            const el = structure.getElement(-1)
            expect(el.loop).toBe(0)
        })
    })

    describe('constructor default structure', () => {
        it('calculates totalLoops from default structure', () => {
            expect(structure.totalLoops).toBeGreaterThan(0)
        })
    })
})

describe('convertToGeneratedSounds', () => {
    let mfCmd
    let pattern

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
        MfGlobals.mfPatterns = { computeFlatNotesFromPattern: () => {} }
        serviceRegistry.mfSeq = { setBpm: () => {} }
        pattern = mfCmd.addPattern('Test')
        mfCmd.setSelectedPatternNum(0)
    })

    describe('detectTrackSynthType', () => {
        it('detects KICK', () => {
            expect(detectTrackSynthType('KICK')).toBe('KICK')
            expect(detectTrackSynthType('Kick_01')).toBe('KICK')
            expect(detectTrackSynthType('BD')).toBe('KICK')
        })

        it('detects SNARE', () => {
            expect(detectTrackSynthType('SNARE')).toBe('SNARE')
            expect(detectTrackSynthType('Snare_01')).toBe('SNARE')
            expect(detectTrackSynthType('SD')).toBe('SNARE')
        })

        it('detects HAT', () => {
            expect(detectTrackSynthType('CHH')).toBe('HAT')
            expect(detectTrackSynthType('OHH')).toBe('HAT')
            expect(detectTrackSynthType('Hat_01')).toBe('HAT')
        })

        it('detects BASS', () => {
            expect(detectTrackSynthType('BASS')).toBe('BASS')
            expect(detectTrackSynthType('Bass_01')).toBe('BASS')
            expect(detectTrackSynthType('SYNTH')).toBe('BASS')
            expect(detectTrackSynthType('SynthLead')).toBe('BASS')
        })

        it('returns PERC for unknown names', () => {
            expect(detectTrackSynthType('TOM')).toBe('PERC')
            expect(detectTrackSynthType('Clap')).toBe('PERC')
            expect(detectTrackSynthType('Ride')).toBe('PERC')
            expect(detectTrackSynthType('')).toBe('PERC')
        })
    })

    describe('SYNTH_SOUND_MAP', () => {
        it('maps each type to a synth sound key', () => {
            expect(SYNTH_SOUND_MAP.KICK).toBe('BASS0')
            expect(SYNTH_SOUND_MAP.SNARE).toBe('SN')
            expect(SYNTH_SOUND_MAP.HAT).toBe('SYNTH1')
            expect(SYNTH_SOUND_MAP.BASS).toBe('BASS2')
            expect(SYNTH_SOUND_MAP.PERC).toBe('SYNTH2')
        })

        it('all mapped keys exist', () => {
            Object.values(SYNTH_SOUND_MAP).forEach(key => {
                expect(typeof key).toBe('string')
                expect(key.length).toBeGreaterThan(0)
            })
        })
    })

    describe('track conversion logic', () => {
        function convertTracks() {
            Object.values(pattern.tracks).forEach(track => {
                const type = detectTrackSynthType(track.name)
                track.useSoftSynth = true
                track.useAutoAssignSound = false
                track.synthSoundKey = SYNTH_SOUND_MAP[type] ?? 'BASS1'
            })
        }

        it('converts KICK track to generated sound', () => {
            mfCmd.addTrack(pattern, 'KICK')
            convertTracks()
            const track = pattern.tracks[0]
            expect(track.useSoftSynth).toBe(true)
            expect(track.useAutoAssignSound).toBe(false)
            expect(track.synthSoundKey).toBe('BASS0')
        })

        it('converts SNARE track', () => {
            mfCmd.addTrack(pattern, 'SNARE')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('SN')
        })

        it('converts CHH track', () => {
            mfCmd.addTrack(pattern, 'CHH')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('SYNTH1')
        })

        it('converts BASS track', () => {
            mfCmd.addTrack(pattern, 'BASS')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('BASS2')
        })

        it('converts unknown track to PERC', () => {
            mfCmd.addTrack(pattern, 'TOM')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('SYNTH2')
        })

        it('converts BD to KICK synth', () => {
            mfCmd.addTrack(pattern, 'BD')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('BASS0')
        })

        it('converts SD to SNARE synth', () => {
            mfCmd.addTrack(pattern, 'SD')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('SN')
        })

        it('converts OHH to HAT synth', () => {
            mfCmd.addTrack(pattern, 'OHH')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('SYNTH1')
        })

        it('converts SynthLead to BASS synth', () => {
            mfCmd.addTrack(pattern, 'SynthLead')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('BASS2')
        })

        it('converts all tracks in a multi-track pattern', () => {
            mfCmd.addTrack(pattern, 'KICK')
            mfCmd.addTrack(pattern, 'SNARE')
            mfCmd.addTrack(pattern, 'CHH')
            mfCmd.addTrack(pattern, 'BASS')
            mfCmd.addTrack(pattern, 'TOM')

            convertTracks()

            expect(pattern.tracks[0].synthSoundKey).toBe('BASS0')
            expect(pattern.tracks[1].synthSoundKey).toBe('SN')
            expect(pattern.tracks[2].synthSoundKey).toBe('SYNTH1')
            expect(pattern.tracks[3].synthSoundKey).toBe('BASS2')
            expect(pattern.tracks[4].synthSoundKey).toBe('SYNTH2')
        })

        it('marks all tracks useSoftSynth = true', () => {
            mfCmd.addTrack(pattern, 'KICK')
            mfCmd.addTrack(pattern, 'SNARE')

            convertTracks()

            pattern.tracks.forEach(track => {
                expect(track.useSoftSynth).toBe(true)
                expect(track.useAutoAssignSound).toBe(false)
            })
        })
    })
})

describe('MfAutoGenerate.detectTrackType', () => {
    let autoGen

    beforeEach(() => {
        autoGen = new MfAutoGenerate()
    })

    it('detects KICK', () => {
        expect(autoGen.detectTrackType('KICK')).toBe('KICK')
        expect(autoGen.detectTrackType('Kick_01')).toBe('KICK')
        expect(autoGen.detectTrackType('BD')).toBe('KICK')
    })

    it('detects SNARE', () => {
        expect(autoGen.detectTrackType('SNARE')).toBe('SNARE')
        expect(autoGen.detectTrackType('Snare_01')).toBe('SNARE')
        expect(autoGen.detectTrackType('SD')).toBe('SNARE')
    })

    it('detects HAT', () => {
        expect(autoGen.detectTrackType('CHH')).toBe('HAT')
        expect(autoGen.detectTrackType('OHH')).toBe('HAT')
        expect(autoGen.detectTrackType('Hat_01')).toBe('HAT')
    })

    it('detects BASS', () => {
        expect(autoGen.detectTrackType('BASS')).toBe('BASS')
        expect(autoGen.detectTrackType('Bass_01')).toBe('BASS')
        expect(autoGen.detectTrackType('SYNTH')).toBe('BASS')
        expect(autoGen.detectTrackType('SynthLead')).toBe('BASS')
    })

    it('returns PERC for unknown names', () => {
        expect(autoGen.detectTrackType('TOM')).toBe('PERC')
        expect(autoGen.detectTrackType('Clap')).toBe('PERC')
        expect(autoGen.detectTrackType('Ride')).toBe('PERC')
        expect(autoGen.detectTrackType('')).toBe('PERC')
    })
})

describe('MfCmd drumkit selection', () => {
    let mfCmd

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
    })

    describe('kitIsLoaded', () => {
        it('returns false when no sounds are loaded', () => {
            const drumkit = { name: 'TestKit', instruments: [] }
            expect(mfCmd.kitIsLoaded(drumkit)).toBe(false)
        })

        it('returns true when all sounds for the kit are loaded', () => {
            soundRegistry.sounds['test.wav'] = {
                kit_name: 'TestKit', url: 'test.wav', key: 'KICK'
            }
            const drumkit = { name: 'TestKit', instruments: [{ key: 'KICK' }] }
            expect(mfCmd.kitIsLoaded(drumkit)).toBe(true)
        })
    })
})
