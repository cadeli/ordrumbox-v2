import { logger } from "../../core/logger.js"
import Utils from "../../core/utils.js"
export default class MfStructureSong {
    static TAG = "MFSTRUCTURESONG"

    static GENRES = ['techno', 'house', 'drumandbass', 'hiphop', 'rock']

    static STYLE_TO_GENRE = Object.freeze({
        rock: 'rock',
        metal: 'rock',
        electro: 'techno',
        techno: 'techno',
        house: 'house',
        disco: 'house',
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
        funk: 'hiphop',
        reggae: 'hiphop',
        ragga: 'hiphop',
    })

    static resolveGenreFromTags = (tags) => {
        if (!tags) return null
        const style = typeof tags === 'string'
            ? tags.toLowerCase()
            : String(tags.style ?? tags.genre ?? '').toLowerCase().trim()
        if (!style) return null
        return MfStructureSong.STYLE_TO_GENRE[style] ?? null
    }

    static CHORD_PROGRESSIONS = Object.freeze({
        techno:     [0, 7, 5, 7],
        house:      [0, 7, 9, 5],
        drumandbass: [0, 10, 8, 7],
        hiphop:     [0, 5, 7, 10],
        rock:       [0, 5, 7, 0]
    })

    static HARMONIC_TABLE = Object.freeze({
        intro:  { root: 0, scale: 'natural minor' },
        verse:  { root: 0, scale: 'natural minor' },
        chorus: { root: 7, scale: 'natural minor' },
        bridge: { root: 5, scale: 'natural minor' },
        break:  { root: 0, scale: 'natural minor' },
        outro:  { root: 0, scale: 'natural minor' }
    })

    resolveHarmony = (genre, sectionName, loopInElement = 0) => {
        const base = MfStructureSong.HARMONIC_TABLE[sectionName] ?? { root: 0, scale: 'natural minor' }
        const progression = MfStructureSong.CHORD_PROGRESSIONS[genre]
        let offset = 0
        if (progression && progression.length > 0 && sectionName !== 'break' && sectionName !== 'outro') {
            offset = progression[loopInElement % progression.length] ?? 0
        }
        return { root: base.root + offset, scale: base.scale }
    }

    static SWING_BY_GENRE = Object.freeze({
        techno:     { swingAmount: 0,    swingResolution: 4 },
        house:      { swingAmount: 0.18, swingResolution: 4 },
        drumandbass: { swingAmount: 0.05, swingResolution: 4 },
        hiphop:     { swingAmount: 0.12, swingResolution: 4 },
        rock:       { swingAmount: 0,    swingResolution: 4 }
    })

    getGenreSwing = (genre) => {
        return MfStructureSong.SWING_BY_GENRE[genre] ?? { swingAmount: 0, swingResolution: 4 }
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
            CRASH: 'crash'
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
            CRASH: 'crash'
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
            CRASH: 'crash'
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
            CRASH: 'crash'
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
            CRASH: 'crash'
        }
    }

    constructor(structure = null) {
        this.structure = structure ?? [
            { name: "intro", loops: 4 },
            { name: "chorus", loops: 8 },
            { name: "verse", loops: 8 },
            { name: "break", loops: 1 },
            { name: "chorus", loops: 8 },
            { name: "verse", loops: 8 },
            { name: "break", loops: 1 },
            { name: "bridge", loops: 4 },
            { name: "verse", loops: 8 },
            { name: "outro", loops: 4 }
        ]
        this.totalLoops = this.structure.reduce((total, element) => total + element.loops, 0)
    }

    getRandomGenre = () => {
        const genres = MfStructureSong.GENRES
        return genres[Math.floor(Math.random() * genres.length)]
    }

    generateStructure = (genre) => {
        const structure = MfStructureSong.STRUCTURES[genre] ?? MfStructureSong.STRUCTURES.techno
        return { ...structure }
    }

    getElement = (loop) => {
        const safeLoop = Math.max(0, Math.floor(Utils.toFiniteNumber(loop, 0, 'loop')))
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
                    totalLoops: this.totalLoops
                }
            }

            cursor += element.loops
        }

        return {
            name: "unknown",
            number: 0,
            index: -1,
            loop: safeLoop,
            loopInSong: loopInSong,
            loopInElement: 0,
            isLastLoopBeforeChange: false,
            elementLoops: 0,
            totalLoops: this.totalLoops
        }
    }
}
