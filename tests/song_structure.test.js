import { describe, it, expect, beforeEach } from 'vitest'
import SongStructure from '../src/logic/generators/song_structure.js'

describe('SongStructure', () => {
    let structure

    beforeEach(() => {
        structure = new SongStructure()
    })

    describe('GENRES', () => {
        it('contains expected genres', () => {
            expect(SongStructure.GENRES).toEqual(
                expect.arrayContaining(['techno', 'house', 'drumandbass', 'hiphop', 'rock']),
            )
        })
    })

    describe('STRUCTURES', () => {
        it('has an entry for each genre', () => {
            SongStructure.GENRES.forEach((genre) => {
                expect(SongStructure.STRUCTURES).toHaveProperty(genre)
            })
        })

        it('each structure maps track names to variant strings', () => {
            Object.values(SongStructure.STRUCTURES).forEach((structure) => {
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
            expect(SongStructure.GENRES).toContain(genre)
        })

        it('can return each genre over multiple calls', () => {
            const results = new Set(Array.from({ length: 500 }, () => structure.getRandomGenre()))
            SongStructure.GENRES.forEach((genre) => {
                expect(results.has(genre)).toBe(true)
            })
        })
    })

    describe('generateStructure', () => {
        it('returns a non-empty object for each genre', () => {
            SongStructure.GENRES.forEach((genre) => {
                const result = structure.generateStructure(genre)
                expect(Object.keys(result).length).toBeGreaterThan(0)
            })
        })

        it('returns a copy, not the original', () => {
            const result = structure.generateStructure('techno')
            result.NewTrack = 'basic'
            expect(SongStructure.STRUCTURES.techno).not.toHaveProperty('NewTrack')
        })

        it('defaults to techno for unknown genre', () => {
            const result = structure.generateStructure('unknown')
            expect(result).toEqual(SongStructure.STRUCTURES.techno)
        })
    })

    describe('randomizeStructure', () => {
        it('always keeps the core tracks of the genre template', () => {
            for (let i = 0; i < 20; i++) {
                const base = structure.generateStructure('techno')
                const result = SongStructure.randomizeStructure(base)
                SongStructure.CORE_TRACKS.forEach((trackName) => {
                    expect(result).toHaveProperty(trackName)
                })
                expect(Object.keys(result).length).toBeGreaterThan(0)
            }
        })

        it('does not mutate the source structure', () => {
            const base = structure.generateStructure('house')
            const snapshot = JSON.stringify(base)
            SongStructure.randomizeStructure(base)
            expect(JSON.stringify(base)).toBe(snapshot)
        })

        it('only produces non-empty variant strings', () => {
            const base = structure.generateStructure('hiphop')
            const result = SongStructure.randomizeStructure(base)
            Object.values(result).forEach((variant) => {
                expect(typeof variant).toBe('string')
                expect(variant.length).toBeGreaterThan(0)
            })
        })

        it('produces variations different from the raw template', () => {
            const base = structure.generateStructure('techno')
            const results = Array.from({ length: 10 }, () => JSON.stringify(SongStructure.randomizeStructure(base)))
            expect(results.some((json) => json !== JSON.stringify(base))).toBe(true)
        })

        it('keeps every randomized variant inside a known pool', () => {
            const base = structure.generateStructure('rock')
            const result = SongStructure.randomizeStructure(base)
            Object.entries(result).forEach(([trackName, variant]) => {
                const pool = SongStructure.poolFor(trackName, 'PERC')
                if (pool) expect(pool).toContain(variant)
                else expect(typeof variant).toBe('string')
            })
        })
    })

    describe('tonal randomization', () => {
        it('randomKeyOffset returns a supported semitone offset', () => {
            for (let i = 0; i < 50; i++) {
                expect(SongStructure.KEY_OFFSETS).toContain(SongStructure.randomKeyOffset())
            }
        })

        it('randomScale returns a supported scale name', () => {
            for (let i = 0; i < 50; i++) {
                expect(SongStructure.SCALES).toContain(SongStructure.randomScale())
            }
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
