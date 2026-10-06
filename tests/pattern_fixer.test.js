import { describe, it, expect } from 'vitest'
import { PARAM_SETS } from './helpers/make_pattern.js'
import {
    fixTrackPanning,
    normalizeNoteGridPosition,
    fixTrackDefaults,
    fixPattern,
    fixPatterns,
    getUnloadedSamplesFromDrumkits,
} from '../src/patterns/fixer.js'
import { normalizeNote } from '../src/core/note_schema.js'
import { computeTickCountForLoop } from '../src/patterns/engine.js'

describe('patternFixer - fixTrackPanning', () => {
    // PAN_MAP is indexed by drum type, so the pan follows the TYPE. It used to be
    // read from the track's slot in the pattern instead, which re-panned every
    // track on load by its position and threw away the pan the file carried.
    it('assigns pan from the drum type', () => {
        expect(fixTrackPanning({ name: 'KICK' }).pan).toBe(0)
        expect(fixTrackPanning({ name: 'SNARE' }).pan).toBe(0.3)
        expect(fixTrackPanning({ name: 'TOM' }).pan).toBe(0.5)
        expect(fixTrackPanning({ name: 'CLAP' }).pan).toBe(-0.4)
        expect(fixTrackPanning({ name: 'COWBELL' }).pan).toBe(0.4)
        expect(fixTrackPanning({ name: 'CHH' }).pan).toBe(-0.3)
        expect(fixTrackPanning({ name: 'OHH' }).pan).toBe(-0.2)
        expect(fixTrackPanning({ name: 'CRASH' }).pan).toBe(1)
    })

    it('defaults to 0 for an unknown type', () => {
        expect(fixTrackPanning({ name: 'WEIRD' }).pan).toBe(0)
        expect(fixTrackPanning({}).pan).toBe(0)
    })

    it('never overwrites a pan the file carries', () => {
        expect(fixTrackPanning({ name: 'KICK', pan: -0.5 }).pan).toBe(-0.5)
        expect(fixTrackPanning({ name: 'SNARE', pan: 0 }).pan).toBe(0)
    })
})

describe('patternFixer - normalizeNoteGridPosition', () => {
    it('wraps beatStep >= stepsPerBeat into beat', () => {
        const track = { stepsPerBeat: 4 }
        const note = { beatStep: 6, beat: 0 }
        normalizeNoteGridPosition(track, note)
        expect(note.beatStep).toBe(2)
        expect(note.beat).toBe(1)
        expect(note.steppc).toBe(50)
    })

    it('leaves beatStep undefined when missing', () => {
        const track = { stepsPerBeat: 4 }
        const note = {}
        normalizeNoteGridPosition(track, note)
        expect(note.beatStep).toBeUndefined()
        expect(note.steppc).toBeNaN()
    })
})

describe('patternFixer - fixNoteDefaults', () => {
    it('applies note defaults', () => {
        const note = { beat: 0, beatStep: 0 }
        const result = { ...note, ...normalizeNote(note) }
        expect(result.retriggerCount).toBe(1)
        expect(result.every).toBe(1)
        expect(result.pos).toBe(0)
        expect(result.prob).toBe(1)
        expect(result.arpTriggerProbability).toBe(1)
        expect(result.euclideanFill).toBe(0)
    })

    it('preserves existing non-null values', () => {
        const note = { beat: 0, beatStep: 0, every: 3, velocity: 0.9 }
        const result = { ...note, ...normalizeNote(note) }
        expect(result.every).toBe(3)
        expect(result.velocity).toBe(0.9)
    })
})

describe('patternFixer - fixTrackDefaults', () => {
    it('applies track defaults and note defaults', () => {
        const track = {
            stepsPerBeat: 4,
            loopAtStep: 16,
            notes: [{ beat: 0, beatStep: 0 }],
        }
        fixTrackDefaults(track)
        expect(track.pan).toBe(0)
        expect(track.useAutoAssignSound).toBe(true)
        expect(track.filterType).toBe('allpass')
        expect(track.notes[0].every).toBe(1)
    })

    it('disables auto-assign when useSoftSynth is true', () => {
        const track = { stepsPerBeat: 4, loopAtStep: 16, useSoftSynth: true }
        fixTrackDefaults(track)
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
            tracks: [],
        }
        fixPattern(pattern)
        expect(pattern.application).toBe('my-app')
        expect(pattern.url).toBe('https://example.com')
    })

    it('fixes all tracks', () => {
        const pattern = {
            tracks: [
                { name: 'KICK', stepsPerBeat: 4, loopAtStep: 16, notes: [] },
                { name: 'SNARE', stepsPerBeat: 4, loopAtStep: 16, notes: [] },
            ],
        }
        fixPattern(pattern)
        expect(pattern.tracks[0].pan).toBe(0)
        expect(pattern.tracks[1].pan).toBe(0.3)
    })

    // The regression this pins: two tracks of the same type, at different slots,
    // keep their own pans instead of being re-panned by position.
    it('gives two tracks of the same type the same pan, whatever their slot', () => {
        const pattern = {
            tracks: [
                { name: 'SNARE', stepsPerBeat: 4, loopAtStep: 16, notes: [] },
                { name: 'KICK', stepsPerBeat: 4, loopAtStep: 16, notes: [] },
                { name: 'SNARE', stepsPerBeat: 4, loopAtStep: 16, notes: [] },
            ],
        }
        fixPattern(pattern)
        expect(pattern.tracks.map((t) => t.pan)).toEqual([0.3, 0, 0.3])
    })
})

describe('patternFixer - fixPatterns', () => {
    it('fixes multiple patterns', () => {
        const patterns = [
            { name: 'A', tracks: [{ stepsPerBeat: 4, loopAtStep: 16, notes: [] }] },
            { name: 'B', tracks: [] },
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
            0: {
                name: 'real',
                instruments: {
                    'kick.wav': { url: 'kits/real/kick.wav', key: 'KICK' },
                    'snare.wav': { url: 'kits/real/snare.wav', key: 'SNARE' },
                },
            },
        }
        const existingSounds = {}
        const result = getUnloadedSamplesFromDrumkits(drumkits, existingSounds)
        expect(result.length).toBe(2)
        expect(result[0].kitName).toBe('real')
    })

    it('skips already loaded samples', () => {
        const drumkits = {
            0: {
                name: 'real',
                instruments: {
                    'kick.wav': { url: 'kits/real/kick.wav', key: 'KICK' },
                    'snare.wav': { url: 'kits/real/snare.wav', key: 'SNARE' },
                },
            },
        }
        const existingSounds = {
            'kits/real/kick.wav': { buffer: {} },
        }
        const result = getUnloadedSamplesFromDrumkits(drumkits, existingSounds)
        expect(result.length).toBe(1)
        expect(result[0].sample.key).toBe('SNARE')
    })

    it('skips duplicates across drumkits', () => {
        const drumkits = {
            0: {
                name: 'kit1',
                instruments: { 'a.wav': { url: 'kits/a.wav', key: 'A' } },
            },
            1: {
                name: 'kit2',
                instruments: { 'a.wav': { url: 'kits/a.wav', key: 'A' } },
            },
        }
        const result = getUnloadedSamplesFromDrumkits(drumkits, {})
        expect(result.length).toBe(1)
    })

    it('handles empty/null input', () => {
        expect(getUnloadedSamplesFromDrumkits(null, {})).toEqual([])
        expect(getUnloadedSamplesFromDrumkits({}, {})).toEqual([])
    })
})

// ── Parameterized: normalizeNoteGridPosition across different subdivisions ───────────────

describe.each(PARAM_SETS)('normalizeNoteGridPosition — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat) => {
    it('wraps beatStep >= stepsPerBeat into beat', () => {
        const inputBeatStep = stepsPerBeat + 2
        const track = { stepsPerBeat }
        const note = { beatStep: inputBeatStep, beat: 0 }
        normalizeNoteGridPosition(track, note)
        expect(note.beatStep).toBe(inputBeatStep % stepsPerBeat)
        expect(note.beat).toBe(Math.floor(inputBeatStep / stepsPerBeat))
    })

    it('leaves beatStep unchanged when < stepsPerBeat', () => {
        const track = { stepsPerBeat }
        const note = { beatStep: Math.max(0, stepsPerBeat - 1), beat: 0 }
        normalizeNoteGridPosition(track, note)
        expect(note.beatStep).toBe(Math.max(0, stepsPerBeat - 1))
        expect(note.beat).toBe(0)
    })

    it('handles beatStep exactly equal to stepsPerBeat (wraps to next beat step 0)', () => {
        const track = { stepsPerBeat }
        const note = { beatStep: stepsPerBeat, beat: 0 }
        normalizeNoteGridPosition(track, note)
        expect(note.beatStep).toBe(0)
        expect(note.beat).toBe(1)
    })
})

describe.each(PARAM_SETS)('fixTrackDefaults — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
    // loopAtStep null is TRACK_DEFAULTS' "loop the whole track". Deriving a zero
    // loop from it is what made computeTickCountForLoop answer "0 ticks", i.e. no
    // repetition at all, for every track that never had an explicit loop point.
    it('resolves a null loopAtStep to the track length, not to zero', () => {
        const track = { beatCount, stepsPerBeat, loopAtStep: null }
        const fixed = fixTrackDefaults(track)
        expect(computeTickCountForLoop(fixed)).toBe(beatCount * 32)
    })

    it('keeps an explicit loopAtStep, including one off the beat grid', () => {
        const track = { beatCount, stepsPerBeat, loopAtStep: stepsPerBeat * 2 + 1 }
        const fixed = fixTrackDefaults(track)
        expect(fixed.loopAtStep).toBe(stepsPerBeat * 2 + 1)
    })
})

describe.each(PARAM_SETS)('fixPattern — spb=%i bpm=%i beats=%i (%s)', (stepsPerBeat, bpm, beatCount) => {
    it('fixes a pattern with multiple tracks', () => {
        const loopAtStep = beatCount * stepsPerBeat
        const inputBeatStep = stepsPerBeat + 1
        const pattern = {
            name: 'ParamFix',
            bpm,
            beatCount,
            tracks: [
                {
                    name: 'KICK',
                    beatCount,
                    stepsPerBeat,
                    loopAtStep,
                    notes: [{ beat: 0, beatStep: inputBeatStep, velocity: 0.8, pitch: 0 }],
                },
                {
                    name: 'SNARE',
                    beatCount,
                    stepsPerBeat,
                    loopAtStep,
                    notes: [{ beat: 1, beatStep: 0, velocity: 0.8, pitch: 0 }],
                },
            ],
        }
        const fixed = fixPattern(pattern)
        expect(fixed.tracks[0].notes[0].beat).toBe(Math.floor(inputBeatStep / stepsPerBeat))
        expect(fixed.tracks[0].notes[0].beatStep).toBe(inputBeatStep % stepsPerBeat)
    })
})

// ─── Stable pattern ids (song arrangements reference patterns by id) ─────────

describe('fixPattern assigns stable ids', () => {
    it('fills a missing id from the name', () => {
        const p = fixPattern({ name: 'Rock Pattern', tracks: [] })
        expect(p.id).toBe('rock-pattern')
    })

    // The arrangement feature rests on this: a rename must not detach every
    // clip that referenced the pattern.
    it('leaves an existing id alone when the pattern is renamed', () => {
        const p = fixPattern({ id: 'rock', name: 'Rock', tracks: [] })
        p.name = 'Renamed'
        expect(fixPattern(p).id).toBe('rock')
    })

    it('de-duplicates two patterns with the same name', () => {
        const [a, b] = fixPatterns([
            { name: 'Same', tracks: [] },
            { name: 'Same', tracks: [] },
        ])
        expect(a.id).toBe('same')
        expect(b.id).toBe('same-2')
    })

    it('re-uses an id already present instead of minting a new one', () => {
        const [a, b] = fixPatterns([
            { id: 'taken', name: 'A', tracks: [] },
            { name: 'Taken', tracks: [] },
        ])
        expect(a.id).toBe('taken')
        expect(b.id).not.toBe('taken')
    })
})

// Files written before a note-key rename (retriggerNum → retriggerCount) keep
// loading: the key is mapped on read, in both note shapes.
describe('patternFixer - legacy note keys', () => {
    const makeTrack = (extra) => ({ name: 'KICK', stepsPerBeat: 4, notes: [{ beat: 0, beatStep: 0, ...extra }] })

    it('renames a legacy key on an object note', () => {
        const [track] = fixPattern({ name: 'P', tracks: [makeTrack({ retriggerNum: 3 })] }).tracks
        expect(track.notes[0].retriggerCount).toBe(3)
        expect(track.notes[0]).not.toHaveProperty('retriggerNum')
    })

    it('decodes a compact track whose noteKeys header is legacy', () => {
        const track = fixTrackDefaults({
            name: 'KICK',
            stepsPerBeat: 4,
            noteKeys: ['velocity', 'beat', 'retriggerNum'],
            notes: [[0.9, 1, 4]],
        })
        expect(track.notes).toHaveLength(1)
        expect(track.notes[0].retriggerCount).toBe(4)
        expect(track.notes[0].velocity).toBe(0.9)
        expect(track).not.toHaveProperty('noteKeys')
    })

    it('keeps the current key when a note carries both spellings', () => {
        const [track] = fixPattern({ name: 'P', tracks: [makeTrack({ retriggerCount: 7, retriggerNum: 3 })] }).tracks
        expect(track.notes[0].retriggerCount).toBe(7)
        expect(track.notes[0]).not.toHaveProperty('retriggerNum')
    })

    it('does not re-export the legacy key', () => {
        const [track] = fixPattern({ name: 'P', tracks: [makeTrack({ retriggerNum: 3 })] }).tracks
        expect(Object.keys(track.notes[0])).not.toContain('retriggerNum')
    })
})
