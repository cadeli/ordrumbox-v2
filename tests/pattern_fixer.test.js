import { describe, it, expect } from 'vitest'
import {
    fixTrackPanning,
    fixNoteStepBar,
    fixNoteDefaults,
    fixTrackDefaults,
    fixPattern,
    fixPatterns,
    getUnloadedSamplesFromDrumkits
} from '../src/patterns/fixer.js'

describe('patternFixer - fixTrackPanning', () => {
    it('assigns pan from index map', () => {
        expect(fixTrackPanning({}, 0).pan).toBe(0)
        expect(fixTrackPanning({}, 1).pan).toBe(0.3)
        expect(fixTrackPanning({}, 2).pan).toBe(0.5)
        expect(fixTrackPanning({}, 3).pan).toBe(-0.4)
        expect(fixTrackPanning({}, 4).pan).toBe(0.4)
        expect(fixTrackPanning({}, 5).pan).toBe(-0.3)
        expect(fixTrackPanning({}, 6).pan).toBe(-0.2)
        expect(fixTrackPanning({}, 7).pan).toBe(1)
    })

    it('defaults to 0 for index >= 8', () => {
        expect(fixTrackPanning({}, 8).pan).toBe(0)
        expect(fixTrackPanning({}, 99).pan).toBe(0)
    })
})

describe('patternFixer - fixNoteStepBar', () => {
    it('wraps beatStep >= stepsPerBeat into beat', () => {
        const track = { stepsPerBeat: 4 }
        const note = { beatStep: 6, beat: 0 }
        fixNoteStepBar(track, note)
        expect(note.beatStep).toBe(2)
        expect(note.beat).toBe(1)
        expect(note.steppc).toBe(50)
    })

    it('leaves beatStep undefined when missing', () => {
        const track = { stepsPerBeat: 4 }
        const note = {}
        fixNoteStepBar(track, note)
        expect(note.beatStep).toBeUndefined()
        expect(note.steppc).toBeNaN()
    })
})

describe('patternFixer - fixNoteDefaults', () => {
    it('applies note defaults', () => {
        const track = { stepsPerBeat: 4 }
        const note = { beat: 0, beatStep: 0 }
        fixNoteDefaults(note, track)
        expect(note.retriggerNum).toBe(1)
        expect(note.every).toBe(1)
        expect(note.pos).toBe(0)
        expect(note.prob).toBe(1)
        expect(note.arpTriggerProbability).toBe(1)
        expect(note.euclidianFill).toBe(0)
    })

    it('preserves existing non-null values', () => {
        const track = { stepsPerBeat: 4 }
        const note = { beat: 0, beatStep: 0, every: 3, velocity: 0.9 }
        fixNoteDefaults(note, track)
        expect(note.every).toBe(3)
        expect(note.velocity).toBe(0.9)
    })
})

describe('patternFixer - fixTrackDefaults', () => {
    it('applies track defaults and note defaults', () => {
        const track = {
            stepsPerBeat: 4,
            loopAtStep: 16,
            notes: [{ beat: 0, beatStep: 0 }]
        }
        fixTrackDefaults(track, 0)
        expect(track.pan).toBe(0)
        expect(track.loopPointBeat).toBe(4)
        expect(track.loopPointStep).toBe(0)
        expect(track.useAutoAssignSound).toBe(true)
        expect(track.filterType).toBe('allpass')
        expect(track.notes[0].every).toBe(1)
    })



    it('disables auto-assign when useSoftSynth is true', () => {
        const track = { stepsPerBeat: 4, loopAtStep: 16, useSoftSynth: true }
        fixTrackDefaults(track, 0)
        expect(track.useAutoAssignSound).toBe(false)
    })
})

describe('patternFixer - fixPattern', () => {
    it('adds metadata defaults', () => {
        const pattern = { tracks: [] }
        fixPattern(pattern)
        expect(pattern.application).toBe('online-ordrumbox')
        expect(pattern.url).toBe('https://www.ordrumbox.com')
    })

    it('preserves existing metadata', () => {
        const pattern = {
            application: 'my-app',
            url: 'https://example.com',
            tracks: []
        }
        fixPattern(pattern)
        expect(pattern.application).toBe('my-app')
        expect(pattern.url).toBe('https://example.com')
    })

    it('fixes all tracks', () => {
        const pattern = {
            tracks: [
                { stepsPerBeat: 4, loopAtStep: 16, notes: [] },
                { stepsPerBeat: 4, loopAtStep: 16, notes: [] }
            ]
        }
        fixPattern(pattern)
        expect(pattern.tracks[0].pan).toBe(0)
        expect(pattern.tracks[1].pan).toBe(0.3)
    })
})

describe('patternFixer - fixPatterns', () => {
    it('fixes multiple patterns', () => {
        const patterns = [
            { name: 'A', tracks: [{ stepsPerBeat: 4, loopAtStep: 16, notes: [] }] },
            { name: 'B', tracks: [] }
        ]
        const fixed = fixPatterns(patterns)
        expect(fixed.length).toBe(2)
        expect(fixed[0].application).toBe('online-ordrumbox')
        expect(fixed[1].name).toBe('B')
    })
})

describe('patternFixer - getUnloadedSamplesFromDrumkits', () => {
    it('returns unloaded samples', () => {
        const drumkits = {
            '0': {
                name: 'real',
                instruments: {
                    'kick.wav': { url: 'kits/real/kick.wav', key: 'KICK' },
                    'snare.wav': { url: 'kits/real/snare.wav', key: 'SNARE' }
                }
            }
        }
        const existingSounds = {}
        const result = getUnloadedSamplesFromDrumkits(drumkits, existingSounds)
        expect(result.length).toBe(2)
        expect(result[0].kitName).toBe('real')
    })

    it('skips already loaded samples', () => {
        const drumkits = {
            '0': {
                name: 'real',
                instruments: {
                    'kick.wav': { url: 'kits/real/kick.wav', key: 'KICK' },
                    'snare.wav': { url: 'kits/real/snare.wav', key: 'SNARE' }
                }
            }
        }
        const existingSounds = {
            'kits/real/kick.wav': { buffer: {} }
        }
        const result = getUnloadedSamplesFromDrumkits(drumkits, existingSounds)
        expect(result.length).toBe(1)
        expect(result[0].sample.key).toBe('SNARE')
    })

    it('skips duplicates across drumkits', () => {
        const drumkits = {
            '0': {
                name: 'kit1',
                instruments: { 'a.wav': { url: 'kits/a.wav', key: 'A' } }
            },
            '1': {
                name: 'kit2',
                instruments: { 'a.wav': { url: 'kits/a.wav', key: 'A' } }
            }
        }
        const result = getUnloadedSamplesFromDrumkits(drumkits, {})
        expect(result.length).toBe(1)
    })

    it('handles empty/null input', () => {
        expect(getUnloadedSamplesFromDrumkits(null, {})).toEqual([])
        expect(getUnloadedSamplesFromDrumkits({}, {})).toEqual([])
    })
})
