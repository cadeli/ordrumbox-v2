import { describe, it, expect, beforeEach } from 'vitest'
import { Globals } from '../src/core/globals.js'
import Commander from '../src/logic/commands/cmd.js'
import StructureSong from '../src/logic/generators/structure_song.js'
import { appState } from '../src/state/app_state.js'
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
describe('StructureSong', () => {
    let structure

    beforeEach(() => {
        structure = new StructureSong()
    })

    describe('GENRES', () => {
        it('contains expected genres', () => {
            expect(StructureSong.GENRES).toEqual(
                expect.arrayContaining(['techno', 'house', 'drumandbass', 'hiphop', 'rock'])
            )
        })
    })

    describe('STRUCTURES', () => {
        it('has an entry for each genre', () => {
            StructureSong.GENRES.forEach(genre => {
                expect(StructureSong.STRUCTURES).toHaveProperty(genre)
            })
        })

        it('each structure maps track names to variant strings', () => {
            Object.values(StructureSong.STRUCTURES).forEach(structure => {
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
            expect(StructureSong.GENRES).toContain(genre)
        })

        it('can return each genre over multiple calls', () => {
            const results = new Set(Array.from({ length: 100 }, () => structure.getRandomGenre()))
            StructureSong.GENRES.forEach(genre => {
                expect(results.has(genre)).toBe(true)
            })
        })
    })

    describe('generateStructure', () => {
        it('returns a non-empty object for each genre', () => {
            StructureSong.GENRES.forEach(genre => {
                const result = structure.generateStructure(genre)
                expect(Object.keys(result).length).toBeGreaterThan(0)
            })
        })

        it('returns a copy, not the original', () => {
            const result = structure.generateStructure('techno')
            result.NewTrack = 'basic'
            expect(StructureSong.STRUCTURES.techno).not.toHaveProperty('NewTrack')
        })

        it('defaults to techno for unknown genre', () => {
            const result = structure.generateStructure('unknown')
            expect(result).toEqual(StructureSong.STRUCTURES.techno)
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
    let cmd
    let pattern

    beforeEach(() => {
        Globals.resetAll()
        cmd = new Commander()
        Globals.cmd = cmd
        Globals.patternManager = { computeFlatNotesFromPattern: () => {} }
        serviceRegistry.seq = { setBpm: () => {} }
        pattern = cmd.addPattern('Test')
        cmd.setSelectedPatternNum(0)
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
            cmd.addTrack(pattern, 'KICK')
            convertTracks()
            const track = pattern.tracks[0]
            expect(track.useSoftSynth).toBe(true)
            expect(track.useAutoAssignSound).toBe(false)
            expect(track.synthSoundKey).toBe('BASS0')
        })

        it('converts SNARE track', () => {
            cmd.addTrack(pattern, 'SNARE')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('SN')
        })

        it('converts CHH track', () => {
            cmd.addTrack(pattern, 'CHH')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('CHH_SYNTH')
        })

        it('converts BASS track', () => {
            cmd.addTrack(pattern, 'BASS')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('BASS2')
        })

        it('converts unknown track to PERC', () => {
            cmd.addTrack(pattern, 'Clap')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('SYNTH2')
        })

        it('converts TOM track', () => {
            cmd.addTrack(pattern, 'TOM')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('TOM')
        })

        it('converts BD to KICK synth', () => {
            cmd.addTrack(pattern, 'BD')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('BASS0')
        })

        it('converts SD to SNARE synth', () => {
            cmd.addTrack(pattern, 'SD')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('SN')
        })

        it('converts OHH to OHH synth', () => {
            cmd.addTrack(pattern, 'OHH')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('OHH_SYNTH')
        })

        it('converts SynthLead to BASS synth', () => {
            cmd.addTrack(pattern, 'SynthLead')
            convertTracks()
            expect(pattern.tracks[0].synthSoundKey).toBe('BASS2')
        })

        it('converts all tracks in a multi-track pattern', () => {
            cmd.addTrack(pattern, 'KICK')
            cmd.addTrack(pattern, 'SNARE')
            cmd.addTrack(pattern, 'CHH')
            cmd.addTrack(pattern, 'BASS')
            cmd.addTrack(pattern, 'TOM')

            convertTracks()

            expect(pattern.tracks[0].synthSoundKey).toBe('BASS0')
            expect(pattern.tracks[1].synthSoundKey).toBe('SN')
            expect(pattern.tracks[2].synthSoundKey).toBe('CHH_SYNTH')
            expect(pattern.tracks[3].synthSoundKey).toBe('BASS2')
            expect(pattern.tracks[4].synthSoundKey).toBe('TOM')
        })

        it('marks all tracks useSoftSynth = true', () => {
            cmd.addTrack(pattern, 'KICK')
            cmd.addTrack(pattern, 'SNARE')

            convertTracks()

            pattern.tracks.forEach(track => {
                expect(track.useSoftSynth).toBe(true)
                expect(track.useAutoAssignSound).toBe(false)
            })
        })
    })
})
