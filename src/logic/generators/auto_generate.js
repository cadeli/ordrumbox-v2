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
import { logger } from '../../core/logger.js'
import AutoAssign from '../services/auto_assign.js'

const SECTION_DENSITY = Object.freeze({
    intro: 0.4,
    verse: 0.7,
    chorus: 1.0,
    break: 0.2,
    bridge: 0.6,
    outro: 0.3,
})

export default class AutoGenerate {
    static TAG = 'AutoGenerate'

    #cachedGenre
    #cachedStructure

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
    #findTrackConfig(structure, track) {
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

    /**
     * Resolve the harmony for a section, applying the pattern's own tonal
     * centre and scale (randomized once per generated pattern) so every
     * generation lands in a different key while staying internally coherent.
     */
    #resolveHarmony = (pattern, genre, sectionName, loopInElement = 0) => {
        const base = this.structureGen.resolveHarmony(genre, sectionName, loopInElement)
        const offset = pattern?._autoGenKeyOffset ?? 0
        const scale = pattern?._autoGenScale ?? base.scale
        return { root: (((base.root + offset) % 12) + 12) % 12, scale }
    }

    /**
     * Per-track density jitter: core tracks stay close to full density while
     * optional parts vary a lot between generations.
     */
    #randomDensity = (track) => {
        const type = Utils.detectTrackType(track.name)
        const min = type === 'KICK' || type === 'SNARE' || type === 'BASS' ? 0.85 : 0.6
        const max = type === 'KICK' || type === 'SNARE' || type === 'BASS' ? 1.05 : 1.2
        return Number((min + Math.random() * (max - min)).toFixed(2))
    }

    generatePattern = async (options = {}) => {
        try {
            let pattern = appState.patterns[appState.selectedPatternIdx]
            if (!pattern) {
                pattern = serviceRegistry.cmd.addPattern('Generated')
            }

            const genre =
                options.genre ?? StructureSong.resolveGenreFromTags(pattern.tags) ?? this.structureGen.getRandomGenre()
            const structure =
                options.structure ?? StructureSong.randomizeStructure(this.structureGen.generateStructure(genre))

            pattern._autoGenGenre = genre
            pattern._autoGenKeyOffset =
                options.keyOffset ?? pattern._autoGenKeyOffset ?? StructureSong.randomKeyOffset()
            pattern._autoGenScale = options.scale ?? pattern._autoGenScale ?? StructureSong.randomScale()

            const firstElement = this.structureGen.getElement(0)
            const harmony = this.#resolveHarmony(pattern, genre, firstElement.name, firstElement.loopInElement)

            logger.info(
                AutoGenerate.TAG,
                `generatePattern: genre=${genre}, key=${pattern._autoGenKeyOffset}, scale=${pattern._autoGenScale}, harmony=${JSON.stringify(harmony)}, tracks=${Object.keys(structure).join(',')}`,
            )

            if (!pattern.tracks || pattern.tracks.length === 0) {
                for (const [trackName, config] of Object.entries(structure)) {
                    const track = serviceRegistry.cmd.addTrack(pattern, trackName)
                    logger.info(AutoGenerate.TAG, `  track=${trackName}, variant=${config}`)
                    await this.generateTrack(track, config, this.#randomDensity(track), pattern, harmony)
                }
            } else {
                for (const track of pattern.tracks) {
                    const config = this.#findTrackConfig(structure, track)
                    if (config) {
                        logger.info(AutoGenerate.TAG, `  track=${track.name}, variant=${config}`)
                        await this.generateTrack(track, config, this.#randomDensity(track), pattern, harmony)
                    }
                }
            }

            const hasBassTrack = pattern.tracks.some((t) => Utils.detectTrackType(t.name) === 'BASS')
            if (!hasBassTrack) {
                const bassTrack = serviceRegistry.cmd.addTrack(pattern, 'BASS')
                bassTrack.useSoftSynth = false
                bassTrack.useAutoAssignSound = true
                bassTrack.synthSoundKey = 'BASS1'
                bassTrack.velocity = 0.5
            }

            serviceRegistry.autoAssign ??= new AutoAssign()
            await serviceRegistry.autoAssign.autoAssignSounds(pattern)
            serviceRegistry.patterns.applyFlatNotes(pattern)

            logger.info(AutoGenerate.TAG, `generatePattern: done (${pattern.tracks.length} tracks)`)
            return pattern
        } catch (err) {
            // Both callers ignore the return value and continue as if the
            // pattern were complete, so swallow-and-return-null surfaced a
            // half-built pattern with no error at all. Rethrow: the callers
            // already run inside a try/catch that shows a toast.
            logger.warn(AutoGenerate.TAG, 'generatePattern failed', err)
            throw err instanceof Error ? err : new Error(String(err))
        }
    }

    generateTrack = async (track, config, density = 1, pattern = null, harmony = { root: 0, scale: null }) => {
        const type = Utils.detectTrackType(track.name)
        this.#applyGenreSwing(track, pattern)
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

    #applyGenreSwing = (track, pattern) => {
        const genre = pattern?._autoGenGenre ?? this.structureGen.getRandomGenre()
        const swing = this.structureGen.getGenreSwing(genre)
        // ±0.08 jitter around the genre default so regenerated tracks do not
        // all feel identically quantized.
        const jittered = (swing.swingAmount ?? 0) + (Math.random() * 2 - 1) * 0.08
        track.swingAmount = Number(Utils.clamp(jittered, 0, 0.45).toFixed(2))
        track.swingResolution = swing.swingResolution
    }

    changeTrack = async (loop, pattern, track) => {
        try {
            const genre = pattern._autoGenGenre ?? this.structureGen.getRandomGenre()
            const element = this.structureGen.getElement(loop)
            const isSectionEnd = element.isLastLoopBeforeChange
            const isBreak = element.name === 'break'
            const density =
                track.auto_density >= 0
                    ? track.auto_density
                    : isSectionEnd
                      ? 0.2
                      : (SECTION_DENSITY[element.name] ?? 0.7)
            const harmony = this.#resolveHarmony(pattern, genre, element.name, element.loopInElement)

            logger.info(
                AutoGenerate.TAG,
                `changeTrack: loop=${loop}, section=${element.name}#${element.number}, track=${track.name}, harmony=${JSON.stringify(harmony)}, sectionEnd=${isSectionEnd}, break=${isBreak}, density=${density}`,
            )

            const structure =
                this.#cachedGenre === genre
                    ? this.#cachedStructure
                    : ((this.#cachedGenre = genre),
                      (this.#cachedStructure = this.structureGen.generateStructure(genre)))

            const type = Utils.detectTrackType(track.name)
            const config = track.auto_variant || this.#findTrackConfig(structure, track)

            if (config) {
                if (isBreak && type === 'SNARE') {
                    logger.info(AutoGenerate.TAG, `  -> breakCrescendo mode`)
                    await this.snareGen.generateNewSnare(track, 'breakCrescendo', density)
                } else if (isSectionEnd) {
                    const sectionEndVariant = this.#resolveSectionEndVariant(track, type)
                    const mergeVariant = sectionEndVariant ?? config
                    logger.info(AutoGenerate.TAG, `  -> section-end merge (variant=${mergeVariant})`)
                    const savedNotes = [...track.notes]
                    await this.generateTrack(track, mergeVariant, density, pattern, harmony)
                    const seen = new Set(savedNotes.map((n) => `${n.beat}:${n.beatStep}`))
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
                serviceRegistry.patterns.applyFlatNotes(pattern)
            } else {
                logger.warn(AutoGenerate.TAG, `  -> no config found for type=${type}`)
            }
        } catch (err) {
            logger.warn(AutoGenerate.TAG, 'changeTrack failed', err)
        }
    }

    #resolveSectionEndVariant = (track, type) => {
        const trackNameUpper = track.name.toUpperCase()
        switch (type) {
            case 'HAT':
                return trackNameUpper.includes('OHH') || trackNameUpper.includes('OPEN') ? 'ohhRoll' : 'chhRoll'
            case 'PERC':
                return 'fill'
            default:
                logger.warn(AutoGenerate.TAG, `Unknown percussion type: ${type}`)
                return null
        }
    }
}
