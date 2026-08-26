import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import Utils from '../../core/utils.js'
import CowbellGenerate from './cowbell_generate.js'
import BassGenerate from './bass_generate.js'
import ClapGenerate from './clap_generate.js'
import HatGenerate from './hat_generate.js'
import KickGenerate from './kick_generate.js'
import MelodyGenerate from './melody_generate.js'
import PercGenerate from './perc_generate.js'
import SnareGenerate from './snare_generate.js'
import StructureSong from './structure_song.js'
import { logger } from "../../core/logger.js"

const SECTION_DENSITY = Object.freeze({
    intro: 0.4,
    verse: 0.7,
    chorus: 1.0,
    break: 0.2,
    bridge: 0.6,
    outro: 0.3
})

export default class AutoGenerate {
    static TAG = "AutoGenerate"

    constructor() {
        this.kickGen = new KickGenerate()
        this.snareGen = new SnareGenerate()
        this.hatGen = new HatGenerate()
        this.clapGen = new ClapGenerate()
        this.percGen = new PercGenerate()
        this.cowbellGen = new CowbellGenerate()
        this.bassGen = new BassGenerate()
        this.melodyGen = new MelodyGenerate()
        this.structureGen = new StructureSong()
    }

    /**
     * Find matching config from structure for a given track type.
     * Prefers exact name match, falls back to first config of same type.
     */
    _findTrackConfig(structure, track) {
        const type = Utils.detectTrackType(track.name)
        const trackNameUpper = track.name.toUpperCase()
        let config = null

        for (const [name, cfg] of Object.entries(structure)) {
            if (Utils.detectTrackType(name) === type) {
                config = cfg
                if (trackNameUpper.includes(name.toUpperCase())) {
                    break
                }
            }
        }
        return config
    }

    generatePattern = async (options = {}) => {
        try {
            let pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) {
                pattern = serviceRegistry.cmd.addPattern("Generated")
            }

            const genre = options.genre
                ?? StructureSong.resolveGenreFromTags(pattern.tags)
                ?? this.structureGen.getRandomGenre()
            const structure = options.structure ?? this.structureGen.generateStructure(genre)

            pattern._autoGenGenre = genre

            const firstElement = this.structureGen.getElement(0)
            const harmony = this.structureGen.resolveHarmony(genre, firstElement.name, firstElement.loopInElement)

            logger.info(AutoGenerate.TAG, `generatePattern: genre=${genre}, harmony=${JSON.stringify(harmony)}, tracks=${Object.keys(structure).join(',')}`)

            if (!pattern.tracks || pattern.tracks.length === 0) {
                for (const [trackName, config] of Object.entries(structure)) {
                    const track = serviceRegistry.cmd.addTrack(pattern, trackName)
                    logger.info(AutoGenerate.TAG, `  track=${trackName}, variant=${config}`)
                    await this.generateTrack(track, config, 1, pattern, harmony)
                }
            } else {
                for (const track of pattern.tracks) {
                    const config = this._findTrackConfig(structure, track)
                    if (config) {
                        logger.info(AutoGenerate.TAG, `  track=${track.name}, variant=${config}`)
                        await this.generateTrack(track, config, 1, pattern, harmony)
                    }
                }
            }

            const hasBassTrack = pattern.tracks.some(t => Utils.detectTrackType(t.name) === 'BASS')
            if (!hasBassTrack) {
                const bassTrack = serviceRegistry.cmd.addTrack(pattern, 'BASS')
                bassTrack.useSoftSynth = false
                bassTrack.useAutoAssignSound = true
                bassTrack.synthSoundKey = 'BASS1'
                bassTrack.velocity = 0.5
            }

            if (!serviceRegistry.autoAssign) {
                const { default: AutoAssign } = await import('../services/auto_assign.js')
                serviceRegistry.autoAssign = new AutoAssign()
            }
            const autoAssign = serviceRegistry.autoAssign
            await autoAssign.autoAssignSounds(pattern)
            serviceRegistry.patterns.computeFlatNotesFromPattern(pattern)

            logger.info(AutoGenerate.TAG, `generatePattern: done (${pattern.tracks.length} tracks)`)
            return pattern
        } catch (err) {
            logger.warn(AutoGenerate.TAG, 'generatePattern failed', err)
            return null
        }
    }

    generateTrack = async (track, config, density = 1, pattern = null, harmony = { root: 0, scale: null }) => {
        const type = Utils.detectTrackType(track.name)
        this._applyGenreSwing(track, pattern)
        switch (type) {
            case 'KICK':
                await this.kickGen.generateNewKick(track, config, density)
                break
            case 'SNARE':
                await this.snareGen.generateNewSnare(track, config, density)
                break
            case 'HAT':
                await this.hatGen.generateNewHat(track, config, density)
                break
            case 'CLAP':
                await this.clapGen.generateNewClap(track, config, density)
                break
            case 'PIANO':
            case 'ORGAN':
                this.melodyGen.generateNewMelody(track, config, density, pattern, harmony)
                break
            case 'PERC':
                await this.percGen.generateNewPerc(track, config, density)
                break
            case 'COWBELL':
                await this.cowbellGen.generateNewCowbell(track, config, density)
                break
            case 'BASS':
                await this.bassGen.generateNewBass(track, config, density, harmony)
                break
            default:
                logger.warn(AutoGenerate.TAG, `generateTrack: unknown type=${type} for track=${track.name}`)
        }
    }

    _applyGenreSwing = (track, pattern) => {
        const genre = pattern?._autoGenGenre ?? this.structureGen.getRandomGenre()
        const swing = this.structureGen.getGenreSwing(genre)
        track.swingAmount = swing.swingAmount
        track.swingResolution = swing.swingResolution
    }

    changeTrack = async (loop, pattern, track) => {
        try {
            const genre = pattern._autoGenGenre ?? this.structureGen.getRandomGenre()
            const element = this.structureGen.getElement(loop)
            const isSectionEnd = element.isLastLoopBeforeChange
            const isBreak = element.name === 'break'
            const density = track.auto_density >= 0
                ? track.auto_density
                : (isSectionEnd ? 0.2 : (SECTION_DENSITY[element.name] ?? 0.7))
            const harmony = this.structureGen.resolveHarmony(genre, element.name, element.loopInElement)

            logger.info(AutoGenerate.TAG, `changeTrack: loop=${loop}, section=${element.name}#${element.number}, track=${track.name}, harmony=${JSON.stringify(harmony)}, sectionEnd=${isSectionEnd}, break=${isBreak}, density=${density}`)

            const structure = this._cachedGenre === genre
                ? this._cachedStructure
                : (this._cachedGenre = genre, this._cachedStructure = this.structureGen.generateStructure(genre))

            const type = Utils.detectTrackType(track.name)
            const config = track.auto_variant || this._findTrackConfig(structure, track)

            if (config) {
                if (isBreak && type === 'SNARE') {
                    logger.info(AutoGenerate.TAG, `  -> breakCrescendo mode`)
                    await this.snareGen.generateNewSnare(track, 'breakCrescendo', density)
                } else if (isSectionEnd) {
                    const sectionEndVariant = this._resolveSectionEndVariant(track, type)
                    const mergeVariant = sectionEndVariant ?? config
                    logger.info(AutoGenerate.TAG, `  -> section-end merge (variant=${mergeVariant})`)
                    const savedNotes = [...track.notes]
                    await this.generateTrack(track, mergeVariant, density, pattern, harmony)
                    const seen = new Set(savedNotes.map(n => `${n.beat}:${n.beatStep}`))
                    for (const note of track.notes) {
                        const key = `${note.beat}:${note.beatStep}`
                        if (!seen.has(key)) {
                            savedNotes.push(note)
                        }
                    }
                    track.notes = savedNotes
                } else {
                    logger.info(AutoGenerate.TAG, `  -> full regenerate (variant=${config})`)
                    track.notes = []
                    await this.generateTrack(track, config, density, pattern, harmony)
                }
                serviceRegistry.patterns.computeFlatNotesFromPattern(pattern)
            } else {
                logger.warn(AutoGenerate.TAG, `  -> no config found for type=${type}`)
            }
        } catch (err) {
            logger.warn(AutoGenerate.TAG, 'changeTrack failed', err)
        }
    }

    _resolveSectionEndVariant = (track, type) => {
        const trackNameUpper = track.name.toUpperCase()
        switch (type) {
            case 'HAT':
                return trackNameUpper.includes('OHH') || trackNameUpper.includes('OPEN')
                    ? 'ohhRoll'
                    : 'chhRoll'
            case 'PERC':
                return 'fill'
            default:
                return null
        }
    }
}
