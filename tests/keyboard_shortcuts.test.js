import { describe, it, expect, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'
import MfStructureSong from '../src/logic/generators/structure_song.js'
import Utils from '../src/core/utils.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
const SYNTH_SOUND_MAP = {
    KICK: 'BASS0',
    SNARE: 'SN',
    HAT: 'CHH_SYNTH',
    OHH: 'OHH_SYNTH',
    BASS: 'BASS2',
    PERC: 'SYNTH2',
    PIANO: 'PIANO',
    TOM: 'TOM'
}

function detectTrackSynthType(name) {
    const n = name.toUpperCase()
    if (n.includes('KICK') || n.includes('BD')) return 'KICK'
    if (n.includes('SNARE') || n.includes('SD')) return 'SNARE'
    if (n.includes('OHH')) return 'OHH'
    if (n.includes('HAT') || n.includes('CHH')) return 'HAT'
    if (n.includes('TOM')) return 'TOM'
    if (n.includes('BASS')) return 'BASS'
    if (n.includes('PIANO')) return 'PIANO'
    if (n.includes('SYNTH')) return 'BASS'
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
            expect(detectTrackSynthType('Hat_01')).toBe('HAT')
        })

        it('detects OHH', () => {
            expect(detectTrackSynthType('OHH')).toBe('OHH')
        })

        it('detects TOM', () => {
            expect(detectTrackSynthType('TOM')).toBe('TOM')
        })

        it('detects BASS', () => {
            expect(detectTrackSynthType('BASS')).toBe('BASS')
            expect(detectTrackSynthType('Bass_01')).toBe('BASS')
            expect(detectTrackSynthType('SYNTH')).toBe('BASS')
            expect(detectTrackSynthType('SynthLead')).toBe('BASS')
        })

        it('returns PERC for unknown names', () => {
            expect(detectTrackSynthType('Clap')).toBe('PERC')
            expect(detectTrackSynthType('Ride')).toBe('PERC')
            expect(detectTrackSynthType('')).toBe('PERC')
        })
    })

    describe('SYNTH_SOUND_MAP', () => {
        it('maps each type to a synth sound key', () => {
            expect(SYNTH_SOUND_MAP.KICK).toBe('BASS0')
            expect(SYNTH_SOUND_MAP.SNARE).toBe('SN')
            expect(SYNTH_SOUND_MAP.HAT).toBe('CHH_SYNTH')
            expect(SYNTH_SOUND_MAP.OHH).toBe('OHH_SYNTH')
            expect(SYNTH_SOUND_MAP.BASS).toBe('BASS2')
            expect(SYNTH_SOUND_MAP.PERC).toBe('SYNTH2')
            expect(SYNTH_SOUND_MAP.TOM).toBe('TOM')
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
            expect(pattern.tracks[0].synthSoundKey).toBe('CHH_SYNTH')
        })

        it('converts BASS track', () => {
            mfCmd.addTrack(pattern, 'BASS')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('BASS2')
        })

        it('converts unknown track to PERC', () => {
            mfCmd.addTrack(pattern, 'Clap')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('SYNTH2')
        })

        it('converts TOM track', () => {
            mfCmd.addTrack(pattern, 'TOM')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('TOM')
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

        it('converts OHH to OHH synth', () => {
            mfCmd.addTrack(pattern, 'OHH')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('OHH_SYNTH')
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
            expect(pattern.tracks[2].synthSoundKey).toBe('CHH_SYNTH')
            expect(pattern.tracks[3].synthSoundKey).toBe('BASS2')
            expect(pattern.tracks[4].synthSoundKey).toBe('TOM')
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

describe('Utils.detectTrackType', () => {
    it('detects KICK', () => {
        expect(Utils.detectTrackType('KICK')).toBe('KICK')
        expect(Utils.detectTrackType('Kick_01')).toBe('KICK')
        expect(Utils.detectTrackType('BD')).toBe('KICK')
    })

    it('detects SNARE', () => {
        expect(Utils.detectTrackType('SNARE')).toBe('SNARE')
        expect(Utils.detectTrackType('Snare_01')).toBe('SNARE')
        expect(Utils.detectTrackType('SD')).toBe('SNARE')
    })

    it('detects HAT', () => {
        expect(Utils.detectTrackType('CHH')).toBe('HAT')
        expect(Utils.detectTrackType('OHH')).toBe('HAT')
        expect(Utils.detectTrackType('Hat_01')).toBe('HAT')
    })

    it('detects BASS', () => {
        expect(Utils.detectTrackType('BASS')).toBe('BASS')
        expect(Utils.detectTrackType('Bass_01')).toBe('BASS')
        expect(Utils.detectTrackType('SYNTH')).toBe('BASS')
        expect(Utils.detectTrackType('SynthLead')).toBe('BASS')
    })

    it('returns PERC for unknown names', () => {
        expect(Utils.detectTrackType('TOM')).toBe('PERC')
        expect(Utils.detectTrackType('Clap')).toBe('CLAP')
        expect(Utils.detectTrackType('Ride')).toBe('PERC')
        expect(Utils.detectTrackType('')).toBe('PERC')
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
