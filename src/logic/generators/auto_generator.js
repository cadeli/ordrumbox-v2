import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { clamp } from '../../core/numbers.js'
import { detectTrackType } from '../../core/drum_taxonomy.js'
import CowbellGenerator from './cowbell_generator.js'
import BassGenerator from './bass_generator.js'
import ClapGenerator from './clap_generator.js'
import HatGenerator from './hat_generator.js'
import KickGenerator from './kick_generator.js'
import MelodyGenerator from './melody_generator.js'
import PercGenerator from './perc_generator.js'
import SnareGenerator from './snare_generator.js'
import SongStructure from './song_structure.js'
import { logger } from '../../core/logger.js'
import AutoAssign from '../services/auto_assign.js'

/**
 * @typedef {import('./base_generator.js').GeneratorConfig} GeneratorConfig
 * @typedef {import('./base_generator.js').Harmony} Harmony
 * @typedef {import('../../model/track_schema.js').Track} Track
 * @typedef {import('../../model/pattern_schema.js').Pattern} Pattern
 */


const SECTION_DENSITY = Object.freeze({
    intro: 0.4,
    verse: 0.7,
    chorus: 1.0,
    break: 0.2,
    bridge: 0.6,
    outro: 0.3,
})

export default class AutoGenerator {
    static TAG = 'AutoGenerator'

    #cachedGenre
    #cachedStructure
    #registry

    /**
     * @param {object} [deps]
     * @param {typeof import('../../state/service_registry.js').serviceRegistry} [deps.registry]
     */
    constructor(deps = {}) {
        this.#registry = deps.registry ?? serviceRegistry
        this.kickGen = new KickGenerator()
        this.snareGen = new SnareGenerator()
        this.hatGen = new HatGenerator()
        this.clapGen = new ClapGenerator()
        this.percGen = new PercGenerator()
        this.cowbellGen = new CowbellGenerator()
        this.bassGen = new BassGenerator({ registry: this.#registry })
        this.melodyGen = new MelodyGenerator()
        this.structureGen = new SongStructure()
    }

    /**
     * Find matching config from structure for a given track type.
     * Prefers exact name match, falls back to first config of same type.
     */
    /** @param {Record<string, Record<string, string>>} structure @param {Track} track @returns {string|null} */
    #findTrackConfig(structure, track) {
        const type = detectTrackType(track.name)
        const trackNameUpper = track.name.toUpperCase()
        let config = null

        for (const [name, cfg] of Object.entries(structure)) {
            if (detectTrackType(name) === type) {
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
    /** @param {Partial<Pattern>} pattern @param {string} genre @param {string} sectionName @param {number} [loopInElement] @returns {Harmony} */
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
    /** @param {Track} track @returns {number} */
    #randomDensity = (track) => {
        const type = detectTrackType(track.name)
        const min = type === 'KICK' || type === 'SNARE' || type === 'BASS' ? 0.85 : 0.6
        const max = type === 'KICK' || type === 'SNARE' || type === 'BASS' ? 1.05 : 1.2
        return Number((min + Math.random() * (max - min)).toFixed(2))
    }

    /** @param {{genre?: string, structure?: Record<string, string>, keyOffset?: number, scale?: string}} [options] @returns {Promise<Pattern>} */
    generatePattern = async (options = {}) => {
        try {
            let pattern = appState.selectedPattern
            if (!pattern) {
                pattern = this.#registry.cmd.addPattern('Generated')
            }

            const genre =
                options.genre ?? SongStructure.resolveGenreFromTags(pattern.tags) ?? this.structureGen.getRandomGenre()
            const structure =
                options.structure ?? SongStructure.randomizeStructure(this.structureGen.generateStructure(genre))

            pattern._autoGenGenre = genre
            pattern._autoGenKeyOffset =
                options.keyOffset ?? pattern._autoGenKeyOffset ?? SongStructure.randomKeyOffset()
            pattern._autoGenScale = options.scale ?? pattern._autoGenScale ?? SongStructure.randomScale()

            const firstElement = this.structureGen.getElement(0)
            const harmony = this.#resolveHarmony(pattern, genre, firstElement.name, firstElement.loopInElement)

            logger.info(
                AutoGenerator.TAG,
                `generatePattern: genre=${genre}, key=${pattern._autoGenKeyOffset}, scale=${pattern._autoGenScale}, harmony=${JSON.stringify(harmony)}, tracks=${Object.keys(structure).join(',')}`,
            )

            if (!pattern.tracks || pattern.tracks.length === 0) {
                for (const [trackName, config] of Object.entries(structure)) {
                    const track = this.#registry.cmd.addTrack(pattern, trackName)
                    logger.info(AutoGenerator.TAG, `  track=${trackName}, variant=${config}`)
                    await this.generateTrack(track, config, this.#randomDensity(track), pattern, harmony)
                }
            } else {
                for (const track of pattern.tracks) {
                    const config = this.#findTrackConfig(structure, track)
                    if (config) {
                        logger.info(AutoGenerator.TAG, `  track=${track.name}, variant=${config}`)
                        await this.generateTrack(track, config, this.#randomDensity(track), pattern, harmony)
                    }
                }
            }

            const hasBassTrack = pattern.tracks.some((t) => detectTrackType(t.name) === 'BASS')
            if (!hasBassTrack) {
                const bassTrack = this.#registry.cmd.addTrack(pattern, 'BASS')
                bassTrack.useSoftSynth = false
                bassTrack.useAutoAssignSound = true
                bassTrack.synthSoundKey = 'BASS1'
                bassTrack.velocity = 0.5
            }

            this.#registry.autoAssign ??= new AutoAssign()
            await this.#registry.autoAssign.autoAssignSounds(pattern)
            this.#registry.flatNotes.applyFlatNotes(pattern)

            logger.info(AutoGenerator.TAG, `generatePattern: done (${pattern.tracks.length} tracks)`)
            return pattern
        } catch (err) {
            // Both callers ignore the return value and continue as if the
            // pattern were complete, so swallow-and-return-null surfaced a
            // half-built pattern with no error at all. Rethrow: the callers
            // already run inside a try/catch that shows a toast.
            logger.warn(AutoGenerator.TAG, 'generatePattern failed', err)
            throw err instanceof Error ? err : new Error(String(err))
        }
    }

    /** @param {Track} track @param {string} config variant name @param {number} [density] @param {Partial<Pattern>|null} [pattern] @param {Harmony} [harmony] @returns {Promise<void>} */
    generateTrack = async (track, config, density = 1, pattern = null, harmony = { root: 0, scale: null }) => {
        const type = detectTrackType(track.name)
        this.#applyGenreSwing(track, pattern)
        this.#applyVariation(track, type)
        // A hand-picked bass variant always wins: the genre draw is only the
        // fallback for a track that has not chosen one, so a deliberate pick
        // survives an auto-generate instead of being replaced on every run.
        const variant =
            type === 'BASS' ? track.auto_variant || SongStructure.randomBassVariant(pattern?._autoGenGenre) : config
        if (variant !== config) {
            logger.info(
                AutoGenerator.TAG,
                `  ${track.name}: bass variant ${config} → ${variant} (random for ${pattern?._autoGenGenre})`,
            )
        }
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
                await this.bassGen.generateNewBass(track, variant, density, harmony)
                break
            default:
                logger.warn(AutoGenerator.TAG, `generateTrack: unknown type=${type} for track=${track.name}`)
        }
    }

    /**
     * Picks the variation amounts a generated track runs on.
     *
     * They are stored on auto_variation/auto_variation2 rather than on
     * variation/variation2: the Var Pos / Var Prop sliders belong to the manual
     * group, they are hidden while track.auto is on, so a value the user set
     * there must not drive the auto layer — and must survive untouched for the
     * moment auto is switched off again.
     *
     * They default to 0, and TrackVariation.apply()/computeNoteVariation()
     * return immediately at 0 — so a generated line played the exact same notes,
     * at the exact same velocities, on every loop. Melodic parts get more than
     * percussion: a bass line is a handful of notes repeated for minutes, which
     * is where repetition shows.
     *
     * Only fills what has not been picked yet: the guard is
     * `if (track.auto_variation == null)`, so an explicit 0 — a track the user
     * (or a script) deliberately wants without an auto budget — is left alone
     * rather than silently refilled.
     *
     * @param {Track} track
     * @param {string} type detectTrackType() result
     */
    #applyVariation = (track, type) => {
        const melodic = type === 'BASS' || type === 'PIANO' || type === 'ORGAN'
        // These buy operations out of a 16-unit scale at 100, so the old
        // [20,40]/[10,25] landed at 3-6 and 2-4 operations — barely a nudge on
        // a line that repeats for minutes. Melodic parts still get more than
        // percussion, which is where repetition shows.
        const range = melodic ? [50, 85] : [30, 60]
        const pickIn = (min, max) => min + Math.floor(Math.random() * (max - min + 1))
        if (track.auto_variation == null) track.auto_variation = pickIn(...range)
        if (track.auto_variation2 == null) track.auto_variation2 = pickIn(Math.round(range[0] / 2), range[1])
    }

    /** @param {Track} track @param {Partial<Pattern>|null} pattern */
    #applyGenreSwing = (track, pattern) => {
        const genre = pattern?._autoGenGenre ?? this.structureGen.getRandomGenre()
        const swing = this.structureGen.getGenreSwing(genre)
        // ±0.08 jitter around the genre default so regenerated tracks do not
        // all feel identically quantized.
        const jittered = (swing.swingAmount ?? 0) + (Math.random() * 2 - 1) * 0.08
        track.swingAmount = Number(clamp(jittered, 0, 0.45).toFixed(2))
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
                AutoGenerator.TAG,
                `changeTrack: loop=${loop}, section=${element.name}#${element.number}, track=${track.name}, harmony=${JSON.stringify(harmony)}, sectionEnd=${isSectionEnd}, break=${isBreak}, density=${density}`,
            )

            const structure =
                this.#cachedGenre === genre
                    ? this.#cachedStructure
                    : ((this.#cachedGenre = genre),
                      (this.#cachedStructure = this.structureGen.generateStructure(genre)))

            const type = detectTrackType(track.name)
            const config = track.auto_variant || this.#findTrackConfig(structure, track)

            if (config) {
                if (isBreak && type === 'SNARE') {
                    logger.info(AutoGenerator.TAG, `  -> breakCrescendo mode`)
                    await this.snareGen.generateNewSnare(track, 'breakCrescendo', density)
                } else if (isSectionEnd) {
                    const sectionEndVariant = this.#resolveSectionEndVariant(track, type)
                    const mergeVariant = sectionEndVariant ?? config
                    logger.info(AutoGenerator.TAG, `  -> section-end merge (variant=${mergeVariant})`)
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
                    logger.info(AutoGenerator.TAG, `  -> full regenerate (variant=${config})`)
                    track.notes = []
                    await this.generateTrack(track, config, density, pattern, harmony)
                }
                this.#registry.flatNotes.applyFlatNotes(pattern)
            } else {
                logger.warn(AutoGenerator.TAG, `  -> no config found for type=${type}`)
            }
        } catch (err) {
            logger.warn(AutoGenerator.TAG, 'changeTrack failed', err)
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
                logger.warn(AutoGenerator.TAG, `Unknown percussion type: ${type}`)
                return null
        }
    }
}
