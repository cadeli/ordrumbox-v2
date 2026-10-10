import { toFiniteNumber } from '../../core/numbers.js'
import { detectTrackType } from '../../core/drum_taxonomy.js'
import { pickRandom } from '../../core/random.js'
export default class SongStructure {
    static TAG = 'SongStructure'

    static GENRES = ['techno', 'house', 'drumandbass', 'hiphop', 'rock', 'funk', 'disco', 'reggae']

    /**
     * Bass variants each genre draws from, canonical one first.
     *
     * STRUCTURES[genre].BASS used to be the ONLY bass a genre could get, so house,
     * hiphop and funk all played the same `groove` line, while `melodic` and
     * `arpege` were never picked by the pipeline at all. Generation now draws one
     * at random from the genre's list (see AutoGenerator.generateTrack) — an
     * unconditional draw for BASS, so it also overrides a hand-set
     * `track.auto_variant`.
     */
    static BASS_VARIANTS_BY_GENRE = Object.freeze({
        house: ['groove', 'stepping', 'basic', 'melodic'],
        hiphop: ['groove', 'basic', 'melodic'],
        funk: ['groove', 'melodic', 'basic'],
        drumandbass: ['stepping', 'arpege', 'melodic'],
        disco: ['stepping', 'groove', 'basic'],
        rock: ['basic', 'groove', 'melodic'],
        reggae: ['hypnotic', 'groove', 'basic'],
        // STRUCTURES.techno.BASS is 'acid': keep it first so the genre keeps its character
        techno: ['acid', 'hypnotic', 'stepping'],
        intro: ['acid', 'arpege', 'melodic'],
    })

    /** Random bass variant for a genre, canonical first. @param {string} genre */
    static randomBassVariant = (genre) => {
        const variants = SongStructure.BASS_VARIANTS_BY_GENRE[genre]
        if (!variants || variants.length === 0) return pickRandom(['basic'])
        return pickRandom(variants)
    }

    static STYLE_TO_GENRE = Object.freeze({
        rock: 'rock',
        metal: 'rock',
        electro: 'techno',
        techno: 'techno',
        house: 'house',
        disco: 'disco',
        hiphop: 'hiphop',
        hip: 'hiphop',
        rap: 'hiphop',
        drumandbass: 'drumandbass',
        dnb: 'drumandbass',
        swing: 'house',
        jazz: 'house',
        samba: 'house',
        salsa: 'house',
        mambo: 'house',
        merengue: 'house',
        bossa: 'house',
        tango: 'house',
        funk: 'funk',
        reggae: 'reggae',
        ragga: 'reggae',
    })

    static resolveGenreFromTags = (tags) => {
        if (!tags) return null
        const style =
            typeof tags === 'string'
                ? tags.toLowerCase()
                : String(tags.style ?? tags.genre ?? '')
                      .toLowerCase()
                      .trim()
        if (!style) return null
        return SongStructure.STYLE_TO_GENRE[style] ?? null
    }

    static CHORD_PROGRESSIONS = Object.freeze({
        techno: [0, 7, 5, 7],
        house: [0, 7, 9, 5],
        drumandbass: [0, 10, 8, 7],
        hiphop: [0, 5, 7, 10],
        rock: [0, 5, 7, 0],
        funk: [0, 5, 7, 10],
        disco: [0, 7, 9, 7],
        reggae: [0, 5, 7, 5],
    })

    static HARMONIC_TABLE = Object.freeze({
        intro: { root: 0, scale: 'natural minor' },
        verse: { root: 0, scale: 'natural minor' },
        chorus: { root: 7, scale: 'natural minor' },
        bridge: { root: 5, scale: 'natural minor' },
        break: { root: 0, scale: 'natural minor' },
        outro: { root: 0, scale: 'natural minor' },
    })

    resolveHarmony = (genre, sectionName, loopInElement = 0) => {
        const base = SongStructure.HARMONIC_TABLE[sectionName] ?? { root: 0, scale: 'natural minor' }
        const progression = SongStructure.CHORD_PROGRESSIONS[genre]
        let offset = 0
        if (progression && progression.length > 0 && sectionName !== 'break' && sectionName !== 'outro') {
            offset = progression[loopInElement % progression.length] ?? 0
        }
        return { root: base.root + offset, scale: base.scale }
    }

    static SWING_BY_GENRE = Object.freeze({
        techno: { swingAmount: 0, swingResolution: 4 },
        house: { swingAmount: 0.18, swingResolution: 4 },
        drumandbass: { swingAmount: 0.05, swingResolution: 4 },
        hiphop: { swingAmount: 0.12, swingResolution: 4 },
        rock: { swingAmount: 0, swingResolution: 4 },
        funk: { swingAmount: 0.22, swingResolution: 4 },
        disco: { swingAmount: 0.1, swingResolution: 4 },
        reggae: { swingAmount: 0.05, swingResolution: 4 },
    })

    getGenreSwing = (genre) => {
        return SongStructure.SWING_BY_GENRE[genre] ?? { swingAmount: 0, swingResolution: 4 }
    }

    static STRUCTURES = {
        techno: {
            KICK: 'fourOnFloor',
            SNARE: 'basic',
            CHH: 'chh16thLocked',
            OHH: 'ohhOffbeat',
            CLAP: 'offbeat',
            BASS: 'acid',
            PIANO: 'arpeggio',
            ORGAN: 'arpeggio',
            PERC: 'shaker44',
            COWBELL: 'offbeat',
            CRASH: 'crash',
        },
        house: {
            KICK: 'fourOnFloor',
            SNARE: 'basic',
            CHH: 'chh16thLocked',
            OHH: 'ohhShaker',
            CLAP: 'offbeat',
            BASS: 'groove',
            PIANO: 'chordStab',
            ORGAN: 'chordStab',
            TAMBOURINE: 'tambourine44',
            COWBELL: 'dense',
            CRASH: 'crash',
        },
        drumandbass: {
            KICK: 'syncopated',
            SNARE: 'syncopated',
            CHH: 'chhDense',
            OHH: 'ohhOffbeat',
            CLAP: 'dense',
            BASS: 'stepping',
            PIANO: 'arpeggio',
            ORGAN: 'sparse',
            CONGAS: 'conversation',
            COWBELL: 'syncopated',
            CRASH: 'crash',
        },
        hiphop: {
            KICK: 'basic',
            SNARE: 'ghost',
            CHH: 'chhSparse',
            OHH: 'ohhOffbeat',
            CLAP: 'syncopated',
            BASS: 'groove',
            PIANO: 'sparse',
            ORGAN: 'sparse',
            HI_TOM: 'basic',
            COWBELL: 'sparse',
            CRASH: 'crash',
        },
        rock: {
            KICK: 'basic',
            SNARE: 'basic',
            CHH: 'chhBasic',
            OHH: 'ohhRide',
            CLAP: 'backbeat',
            BASS: 'basic',
            PIANO: 'chordStab',
            ORGAN: 'walking',
            PERC: 'clap44',
            COWBELL: 'basic',
            HI_TOM: 'fill',
            CRASH: 'crash',
        },
        funk: {
            KICK: 'syncopated',
            SNARE: 'ghost',
            CHH: 'chhDense',
            OHH: 'ohhOffbeat',
            CLAP: 'syncopated',
            BASS: 'groove',
            PIANO: 'chordStab',
            ORGAN: 'walking',
            PERC: 'conversation',
            COWBELL: 'sparse',
            CRASH: 'crash',
        },
        disco: {
            KICK: 'fourOnFloor',
            SNARE: 'basic',
            CHH: 'chh16thLocked',
            OHH: 'ohhShaker',
            CLAP: 'fourOnFloor',
            BASS: 'stepping',
            PIANO: 'arpeggio',
            ORGAN: 'chordStab',
            PERC: 'shaker44',
            COWBELL: 'dense',
            CRASH: 'crash',
        },
        reggae: {
            KICK: 'basic',
            SNARE: 'basic',
            CHH: 'chhSparse',
            OHH: 'ohhBasic',
            CLAP: 'offbeat',
            BASS: 'hypnotic',
            PIANO: 'sparse',
            ORGAN: 'reggae',
            PERC: 'sparse',
            COWBELL: 'sparse',
            CRASH: 'crash',
        },
    }

    /**
     * Variant pools per structure key (falling back to the detected track
     * type). Only variant names that actually exist in the generators are
     * listed — an unknown name would make BaseGenerator pick one at random,
     * which is fine, but explicit pools keep the musical intent.
     */
    static VARIANT_POOLS = Object.freeze({
        KICK: ['basic', 'fourOnFloor', 'syncopated'],
        SNARE: ['basic', 'ghost', 'syncopated', 'roll'],
        CHH: ['chh16thLocked', 'chhBasic', 'chhDense', 'chhSparse'],
        OHH: ['ohhOffbeat', 'ohhShaker', 'ohhRide', 'ohhBasic'],
        CLAP: ['backbeat', 'offbeat', 'sparse', 'fourOnFloor', 'syncopated', 'dense'],
        BASS: ['basic', 'stepping', 'groove', 'melodic', 'hypnotic', 'arpege', 'acid'],
        PIANO: ['chordStab', 'arpeggio', 'sparse', 'walking', 'reggae'],
        ORGAN: ['chordStab', 'arpeggio', 'sparse', 'walking', 'reggae'],
        PERC: ['basic', 'shaker44', 'tambourine44', 'clap44', 'conversation', 'sparse', 'texture', 'fill'],
        COWBELL: ['basic', 'offbeat', 'dense', 'sparse', 'syncopated'],
        HI_TOM: ['fill', 'basic', 'groove', 'sparse', 'conversation'],
        CRASH: ['crash'],
    })

    /** Fallback pools keyed by detected track type (CRASH, HI_TOM, CONGAS…). */
    static VARIANT_POOLS_BY_TYPE = Object.freeze({
        PERC: SongStructure.VARIANT_POOLS.PERC,
        CLAP: SongStructure.VARIANT_POOLS.CLAP,
        COWBELL: SongStructure.VARIANT_POOLS.COWBELL,
    })

    /** Never dropped by randomization — the backbone of every groove. */
    static CORE_TRACKS = Object.freeze(['KICK', 'SNARE', 'BASS'])

    /** Chance of dropping an optional track (hats are dropped less often). */
    static DROP_CHANCE = Object.freeze({ CHH: 0.12, OHH: 0.12, default: 0.25 })

    /** Extra instruments that can be added on top of the genre template. */
    static OPTIONAL_EXTRAS = Object.freeze(['PERC', 'CLAP', 'COWBELL', 'PIANO', 'ORGAN', 'OHH', 'CHH'])

    /** Tonal centres (semitone offsets) — 0 favoured, the rest transpose the pattern. */
    static KEY_OFFSETS = Object.freeze([0, 0, 0, 2, 3, 5, 7, 9, 10])

    /** Scales available in assets/data/scales.json — random pick per pattern. */
    static SCALES = Object.freeze([
        'natural minor',
        'major',
        'dorian',
        'mixolydian',
        'phrygian',
        'pentatonic minor',
        'pentatonic major',
        'blues scale',
        'harmonic minor',
    ])

    static poolFor = (trackName, trackType) => {
        const key = String(trackName ?? '').toUpperCase()
        if (SongStructure.VARIANT_POOLS[key]) return SongStructure.VARIANT_POOLS[key]
        return SongStructure.VARIANT_POOLS_BY_TYPE[trackType] ?? null
    }

    /**
     * Derive a fresh variation of a genre template: drops some optional
     * tracks, swaps variants inside curated pools and may add an extra
     * instrument. Core tracks (KICK/SNARE/BASS) are always kept, and the
     * source structure is never mutated.
     * @param {Object} base  result of generateStructure(genre)
     * @returns {Object} randomized copy
     */
    static randomizeStructure = (base) => {
        const result = { ...base }

        for (const trackName of Object.keys(result)) {
            if (SongStructure.CORE_TRACKS.includes(trackName)) continue

            const dropChance = SongStructure.DROP_CHANCE[trackName] ?? SongStructure.DROP_CHANCE.default
            if (Math.random() < dropChance) {
                delete result[trackName]
                continue
            }

            if (Math.random() < 0.55) {
                const pool = SongStructure.poolFor(trackName, detectTrackType(trackName))
                if (pool) result[trackName] = pickRandom(pool)
            }
        }

        if (Math.random() < 0.3) {
            const missing = SongStructure.OPTIONAL_EXTRAS.filter((name) => !(name in result))
            if (missing.length > 0) {
                const trackName = pickRandom(missing)
                const pool = SongStructure.poolFor(trackName, detectTrackType(trackName))
                if (pool) result[trackName] = pickRandom(pool)
            }
        }

        return result
    }

    /** Random tonal centre for a generated pattern (semitone offset). */
    static randomKeyOffset = () => pickRandom(SongStructure.KEY_OFFSETS)

    /** Random scale (name from assets/data/scales.json) for a generated pattern. */
    static randomScale = () => pickRandom(SongStructure.SCALES)

    constructor(structure = null) {
        this.structure = structure ?? [
            { name: 'intro', loops: 4 },
            { name: 'chorus', loops: 8 },
            { name: 'verse', loops: 8 },
            { name: 'break', loops: 1 },
            { name: 'chorus', loops: 8 },
            { name: 'verse', loops: 8 },
            { name: 'break', loops: 1 },
            { name: 'bridge', loops: 4 },
            { name: 'verse', loops: 8 },
            { name: 'outro', loops: 4 },
        ]
        this.totalLoops = this.structure.reduce((total, element) => total + element.loops, 0)
    }

    getRandomGenre = () => {
        const genres = SongStructure.GENRES
        return pickRandom(genres)
    }

    generateStructure = (genre) => {
        const structure = SongStructure.STRUCTURES[genre] ?? SongStructure.STRUCTURES.techno
        return { ...structure }
    }

    getElement = (loop) => {
        const safeLoop = Math.max(0, Math.floor(toFiniteNumber(loop, 0, 'loop')))
        const loopInSong = this.totalLoops > 0 ? safeLoop % this.totalLoops : 0
        let cursor = 0
        const counters = {}

        for (let index = 0; index < this.structure.length; index++) {
            const element = this.structure[index]
            counters[element.name] = (counters[element.name] ?? 0) + 1

            if (loopInSong < cursor + element.loops) {
                return {
                    name: element.name,
                    number: counters[element.name],
                    index: index,
                    loop: safeLoop,
                    loopInSong: loopInSong,
                    loopInElement: loopInSong - cursor,
                    isLastLoopBeforeChange: loopInSong - cursor === element.loops - 1,
                    elementLoops: element.loops,
                    totalLoops: this.totalLoops,
                }
            }

            cursor += element.loops
        }

        return {
            name: 'unknown',
            number: 0,
            index: -1,
            loop: safeLoop,
            loopInSong: loopInSong,
            loopInElement: 0,
            isLastLoopBeforeChange: false,
            elementLoops: 0,
            totalLoops: this.totalLoops,
        }
    }
}
