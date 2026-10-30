import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
    kitFromFile,
    kitToFile,
    libraryFromFile,
    libraryToFile,
    patternFromFile,
    patternToFile,
} from '../src/patterns/file_format.js'

const DATA_DIR = join(import.meta.dirname, '..', 'assets', 'data')
const readData = (...path) => JSON.parse(readFileSync(join(DATA_DIR, ...path), 'utf8'))

/** Keys the Rust app reads as old spellings and never writes. */
const OLD_TRACK_KEYS = ['velocity', 'pitch', 'sampleId', 'loopAtStep', 'useAutoAssignSound', 'useSoftSynth', 'auto']
const OLD_NOTE_KEYS = ['beatStep', 'every', 'pos', 'prob', 'rate', 'arpTriggerProbability', 'euclideanFill']

const RUNTIME_PATTERN = {
    id: 'p',
    application: 'online-ordrumbox',
    url: 'https://www.ordrumbox.com',
    _revision: 3,
    _autoGenGenre: 'house',
    tags: { style: 'rock', type: 'default' },
    tracks: [
        {
            name: 'KICK',
            velocity: 0.5,
            pitch: 2,
            sampleId: 'real/kick.wav',
            loopAtStep: 16,
            prob_note_depth: 40,
            fxSelected: 'delay',
            noteKeys: ['velocity', 'beatStep', 'every', 'arp'],
            notes: [[0.5, 1, 2, { intervals: [0, 4], mode: 'up' }]],
        },
        { name: 'SNARE', notes: [{ beatStep: 1, prob: 0.5, rate: 2, pos: 1, _arpType: 'up', pitch: 3 }] },
    ],
}

describe('file_format', () => {
    it('writes a pattern with the names of the Rust app', () => {
        expect(patternToFile(RUNTIME_PATTERN)).toEqual({
            id: 'p',
            autoGenre: 'house',
            tags: ['rock', 'default'],
            tracks: [
                {
                    name: 'KICK',
                    volume: 0.5,
                    transpose: 2,
                    samplePath: 'real/kick.wav',
                    loopLength: 16,
                    autoNoteProbabilityRange: 40,
                    noteKeys: ['velocity', 'step', 'cycle', 'arp'],
                    notes: [[0.5, 1, 2, { intervals: [0, 4], direction: 'up' }]],
                },
                {
                    name: 'SNARE',
                    notes: [{ step: 1, probability: 0.5, retriggerRate: 2, cycleOffset: 1, arpDirection: 'up', pitch: 3 }],
                },
            ],
        })
    })

    it('reads back what it writes', () => {
        const { application, url, _revision, ...kept } = RUNTIME_PATTERN
        const back = patternFromFile(patternToFile(RUNTIME_PATTERN))
        expect(back.tracks[0].velocity).toBe(0.5)
        expect(back.tracks[0].noteKeys).toEqual(RUNTIME_PATTERN.tracks[0].noteKeys)
        expect(back.tracks[0].notes).toEqual(RUNTIME_PATTERN.tracks[0].notes)
        expect(back.tracks[1].notes).toEqual(RUNTIME_PATTERN.tracks[1].notes)
        expect(back._autoGenGenre).toBe(kept._autoGenGenre)
    })

    it('leaves a runtime object unchanged when reading, and a file object when writing', () => {
        const { tags, ...runtime } = RUNTIME_PATTERN
        expect(patternFromFile(runtime)).toEqual(runtime)
        const file = patternToFile(RUNTIME_PATTERN)
        expect(patternToFile(file)).toEqual(file)
    })

    it('keeps a track velocity and a note probability apart', () => {
        const pattern = patternFromFile({ tracks: [{ probability: 0.5, notes: [{ velocity: 0.4, probability: 0.3 }] }] })
        expect(pattern.tracks[0].probability).toBe(0.5)
        expect(pattern.tracks[0].notes[0]).toEqual({ velocity: 0.4, prob: 0.3 })
    })

    it('converts a library header, its arrangements and a song record', () => {
        const file = libraryToFile({
            infos: { name: 'n' },
            selectedPatternIdx: 1,
            selectedSongIdx: 2,
            songs: [{ id: 's', loopMeasureCount: 8, clips: [{ pattern: 'p', startMeasure: 0, measureCount: 1 }] }],
            patterns: [RUNTIME_PATTERN],
        })
        expect(file.info).toEqual({ name: 'n' })
        expect(file.selectedPattern).toBe(1)
        expect(file.selectedSong).toBe(2)
        expect(file.songs[0].loopMeasures).toBe(8)
        expect(file.songs[0].clips[0].patternId).toBe('p')
        expect(file.patterns[0]).not.toHaveProperty('application')

        const back = libraryFromFile(file)
        expect(back.infos).toEqual({ name: 'n' })
        expect(back.selectedSongIdx).toBe(2)
        expect(back.songs[0].loopMeasureCount).toBe(8)
        expect(back.songs[0].clips[0].pattern).toBe('p')
    })

    it('converts a kit and its samples', () => {
        const file = { name: 'k', info: 'i', samples: [{ path: 'a.wav', displayName: 'a', key: 'KICK', transpose: 2 }] }
        const runtime = kitFromFile(file)
        expect(runtime).toEqual({
            name: 'k',
            infos: 'i',
            instruments: [{ url: 'a.wav', display_name: 'a', key: 'KICK', tune: 2 }],
        })
        expect(kitToFile(runtime)).toEqual(file)
    })

    describe('shipped data', () => {
        const patternFiles = readdirSync(join(DATA_DIR, 'patterns')).filter((name) => name.endsWith('.json'))
        const patterns = [
            ...readData('library.json').patterns,
            ...patternFiles.map((name) => readData('patterns', name)),
        ]

        it('uses no old track or note key', () => {
            const tracks = patterns.flatMap((pattern) => pattern.tracks ?? [])
            expect(tracks.length).toBeGreaterThan(0)
            for (const track of tracks) {
                for (const key of OLD_TRACK_KEYS) expect(track, `${track.name}.${key}`).not.toHaveProperty(key)
                for (const key of OLD_NOTE_KEYS) expect(track.noteKeys ?? []).not.toContain(key)
            }
        })

        it('has no web-app header, and its tags are lists', () => {
            for (const pattern of patterns) {
                expect(pattern).not.toHaveProperty('application')
                expect(pattern).not.toHaveProperty('url')
                if ('tags' in pattern) expect(Array.isArray(pattern.tags), pattern.id).toBe(true)
            }
        })

        it('names arrangements and kits as the Rust app does', () => {
            const library = readData('library.json')
            expect(library).toHaveProperty('info')
            expect(library.songs[0].clips[0]).toHaveProperty('patternId')
            const [kit] = readData('kits.json')
            expect(kit).toHaveProperty('samples')
            expect(kit.samples[0]).toHaveProperty('path')
            expect(kit.samples[0]).toHaveProperty('displayName')
        })
    })
})
