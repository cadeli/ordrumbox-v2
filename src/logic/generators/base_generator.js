/**
 * Engine properties copied from a source to a note by applyNoteProperties. Same
 * shape when read and when written: this is the copy contract, not the full Note
 * model.
 * @typedef {object} NoteEngineProps
 * @property {number}  [retriggerCount]
 * @property {number}  [rate]
 * @property {number}  [euclideanFill]
 * @property {object}  [arp]
 * @property {number}  [prob]
 * @property {number}  [arpTriggerProbability]
 */

/**
 * Config sections read by the base generator.
 * @typedef {object} GeneratorConfig
 * @property {number} [loopBeats]  Loop length in beats (converted to loopAtStep)
 * @property {number} [stepsPerBeat]
 */
import { serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { TRACK_VALUE_RANGES } from '../../model/track_schema.js'
import { clamp } from '../../core/numbers.js'

/**
 * Uniform pick over a list. Module-local so a generator can choose between
 * skeletons without importing SongStructure (which owns the genre tables).
 * @template T
 * @param {T[]} list
 * @returns {T|undefined}
 */
const StructurePicker = {
    pick: (list) => list[Math.floor(Math.random() * list.length)],
}

export default class BaseGenerator {
    #toneThreshold = 6

    constructor(instrumentName, configs, addNoteFn) {
        this.instrumentName = instrumentName
        this.configs = configs
        this.addNoteFn =
            addNoteFn ?? ((track, beat, beatStep, pitch) => serviceRegistry.cmd.addNote(track, beat, beatStep, pitch))
    }

    /** Protected setter — subclasses call this in their constructor. */
    setToneThreshold(value) {
        this.#toneThreshold = value
    }

    addNote = (track, beat, beatStep, pitch = 0, velocity = 0.8, isGhost = false) => {
        const note = this.addNoteFn(track, beat, beatStep, pitch)
        note.velocity = typeof velocity === 'number' ? velocity : Number(velocity)
        if (isGhost) note.ghost = true
        return note
    }

    clearTrackNotes = (track) => {
        track.notes = []
    }

    computeVelocity = (velocityConfig = {}, context = {}) => {
        const base = context.velocityBase ?? velocityConfig.base ?? 0.75
        const accent = context.accent ? (velocityConfig.accentOnBeat ?? 0) : 0
        const ghost = context.ghost ? (velocityConfig.ghost ?? 0) : 0
        const variationBoost = context.isVariation ? (velocityConfig.variationBoost ?? 0) : 0
        const randomSpread = velocityConfig.randomSpread ?? 0
        const randomOffset = (Math.random() * 2 - 1) * randomSpread
        const min = velocityConfig.clampMin ?? 0.25
        const max = velocityConfig.clampMax ?? 1
        const result = clamp(base + accent + ghost + variationBoost + randomOffset, min, max)
        return context.toFixed !== false ? Number(result.toFixed(2)) : result
    }

    /** Sets the track's single loop field: the loop length in steps. */
    applyLoopPoint = (track, config) => {
        track.loopAtStep = (config.loopBeats ?? track.beatCount ?? 1) * track.stepsPerBeat
    }

    /**
     * Compute the absolute loop point step from config and track.
     * @param {{stepsPerBeat?: number}} track - track with stepsPerBeat
     * @param {GeneratorConfig} config - generator config with loopBeats
     * @param {number} [defaultLoopBeats=1] - loop length in beats if not in config
     * @returns {number} absolute step index
     */
    getLoopPointAbsolute = (track, config, defaultLoopBeats = 1) => {
        const loopBeats = config.loopBeats ?? defaultLoopBeats
        return loopBeats * (track.stepsPerBeat ?? 4)
    }

    /**
     * Get scale steps for a given scale name.
     * Subclasses can override with different fallback chains.
     */
    getScaleSteps = (scaleName) => {
        return soundRegistry.scales[scaleName]?.scaleSteps ?? [0, 2, 4, 5, 7, 9, 11]
    }

    /**
     * Get a random tone from the available tones.
     * Subclasses can override the octave threshold.
     */
    getRndTone = (tones) => {
        const tone = tones[Math.floor(Math.random() * tones.length)] ?? 0
        return tone > this.#toneThreshold ? tone - 12 : tone
    }

    /**
     * Resolve pitch from a phrase config.
     * Subclasses can override for different behavior.
     */
    /**
     * Pitch of a phrase, in scale degrees.
     * @param {object} phrase
     * @param {number[]} tones scale degrees
     * @param {number[]|null} cachedPitches pitches already used (for `reuse`)
     * @param {number} pitchBias register offset (semitones)
     * @param {string[]|number[]} [approachNotes] semitone offsets the `approach`
     *   source may pick from — the default is [-1, -2] for every generator, which
     *   is why two generated lines approach their target note the same way
     */
    /**
     * Semitone offset of a phrase `source` inside the scale.
     * @param {string} source root|third|fifth|seventh|octave|approach
     * @param {number} pitchBias register offset (semitones)
     * @param {number[]} approachNotes semitone offsets `approach` may pick from
     * @returns {number|null} null when the source is unknown
     */
    #degreeOffset = (source, pitchBias, approachNotes) => {
        if (source === 'approach') {
            const pool = approachNotes?.length ? approachNotes : [-1, -2]
            return pool[Math.floor(Math.random() * pool.length)] + pitchBias
        }
        const sourceOffsets = { root: 0, third: 4, fifth: 7, seventh: 11, octave: 12 }
        if (Object.hasOwn(sourceOffsets, source)) return sourceOffsets[source] + pitchBias
        return null
    }

    /**
     * Pitch of a phrase, in semitones.
     * @param {{pitch?: number, source?: string, alternateSource?: string,
     *   alternateChance?: number, reuseIndex?: number}} phrase
     * @param {number[]} tones scale degrees, used for the unknown-source fallback
     * @param {number[]|null} cachedPitches pitches already used (for `reuse`)
     * @param {number} pitchBias register offset (semitones)
     * @param {number[]} [approachNotes] semitone offsets the `approach` source may
     *   pick from — the default is [-1, -2] for every generator, which is why two
     *   generated lines approach their target note the same way
     * @returns {number}
     */
    resolvePhrasePitch = (
        phrase,
        tones,
        cachedPitches,
        pitchBias = 0,
        approachNotes = /** @type {number[]} */ ([-1, -2]),
    ) => {
        if (typeof phrase.pitch === 'number') {
            return phrase.pitch + pitchBias
        }
        // degree colouring: `alternateSource` replaces `source` when the draw hits
        const source =
            phrase.alternateSource && Math.random() < (phrase.alternateChance ?? 0.35)
                ? phrase.alternateSource
                : phrase.source
        if (source === 'reuse' && typeof phrase.reuseIndex === 'number') {
            return cachedPitches[phrase.reuseIndex] ?? pitchBias
        }
        return this.#degreeOffset(source, pitchBias, approachNotes) ?? this.getRndTone(tones) + pitchBias
    }

    formatCompactVelocity = (velocityConfig, defaults = {}) => {
        const segments = [`b${velocityConfig.base ?? defaults.base ?? 0.75}`]
        if (typeof velocityConfig.accentOnBeat === 'number') {
            segments.push(`a${velocityConfig.accentOnBeat}`)
        }
        if (typeof velocityConfig.ghost === 'number') {
            segments.push(`g${velocityConfig.ghost}`)
        }
        if (typeof velocityConfig.variationBoost === 'number') {
            segments.push(`v${velocityConfig.variationBoost}`)
        }
        if (typeof velocityConfig.randomSpread === 'number') {
            segments.push(`r${velocityConfig.randomSpread}`)
        }
        segments.push(
            `c${velocityConfig.clampMin ?? defaults.clampMin ?? 0.25}-${velocityConfig.clampMax ?? defaults.clampMax ?? 1}`,
        )
        return segments.join(',')
    }

    resolveVariantName = (variantName) => {
        if (variantName && this.configs[variantName]) {
            return variantName
        }
        return this.getRndVariantName()
    }

    getRndVariantName = () => {
        const variants = Object.keys(this.configs)
        return variants[Math.floor(Math.random() * variants.length)] ?? 'basic'
    }

    generateGridVariant = (track, config, getAccentContext, getGhostContext, density = 1, opts = {}) => {
        const defaultLoopBeats = opts.defaultLoopBeats ?? 1
        const loopPointAbsolute = this.getLoopPointAbsolute(track, config, defaultLoopBeats)
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const pitchResolver = opts.pitchResolver ?? null
        const requiredSteps = config.requiredSteps ?? null

        for (let beat = 0; beat < (track.beatCount ?? 1); beat++) {
            for (let step = 0; step < stepsPerBeat; step++) {
                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) continue

                const required = requiredSteps ? this.#isRequiredStep(beat, step, requiredSteps) : false
                const probability = config.probabilities?.[step % config.probabilities.length] ?? 0

                if (!required && Math.random() >= probability * density) continue

                const accent = getAccentContext?.(beat, step, config) ?? (required || step === 0)
                const ghost = getGhostContext?.(beat, step, config) ?? (!required && step !== 0)
                const pitch = pitchResolver ? pitchResolver(beat, step) : (config.pitch ?? 0)

                const note = this.addNote(
                    track,
                    beat,
                    step,
                    pitch,
                    this.computeVelocity(config.velocity, { step, accent, ghost }),
                )
                this.applyNoteProperties(note, config)
            }
        }
    }

    generatePhraseVariant = (track, config, getPitch, getAccentContext, getGhostContext, density = 1, opts = {}) => {
        const defaultLoopBeats = opts.defaultLoopBeats ?? 2
        const loopPointAbsolute = this.getLoopPointAbsolute(track, config, defaultLoopBeats)
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const cachedPitches = opts.cachedPitches ?? null
        const allowStacking = opts.allowStacking ?? false
        const occupiedByMeasure = new Map()

        // A phrase may declare its own `chance` (0-1): the per-degree density that
        // `density` cannot express, since it thins EVERY phrase of the skeleton the
        // same way. Without it a phrase skeleton is all-or-nothing per note.
        const phrases = config.phraseSets ? StructurePicker.pick(config.phraseSets) : config.phrases
        phrases.forEach((phrase) => {
            if (density < 1 && Math.random() >= density) return
            if (typeof phrase.chance === 'number' && Math.random() >= phrase.chance) return

            let step
            if (phrase.step === 'random') {
                const beat = phrase.beat
                if (!occupiedByMeasure.has(beat)) occupiedByMeasure.set(beat, new Set())
                const occupied = occupiedByMeasure.get(beat)
                const freeSteps = []
                for (let s = 0; s < stepsPerBeat; s++) {
                    if (!occupied.has(s)) freeSteps.push(s)
                }
                if (freeSteps.length === 0) return
                step = freeSteps[Math.floor(Math.random() * freeSteps.length)]
            } else {
                step = phrase.step
            }

            if (!allowStacking) {
                const absoluteStep = phrase.beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) return
            }

            const pitch = getPitch?.(phrase, track) ?? config.pitch ?? 0
            const accent = getAccentContext?.(phrase, step) ?? phrase.accent === true
            const ghost = getGhostContext?.(phrase, step) ?? phrase.ghost === true

            const note = this.addNote(
                track,
                phrase.beat,
                step,
                pitch,
                this.computeVelocity(config.velocity, { step, accent, ghost }),
            )
            this.applyNoteProperties(note, phrase)
            if (cachedPitches) cachedPitches.push(pitch)

            if (!allowStacking) {
                if (!occupiedByMeasure.has(phrase.beat)) occupiedByMeasure.set(phrase.beat, new Set())
                occupiedByMeasure.get(phrase.beat).add(step)
            }
        })
    }

    /**
     * Copy engine properties (retrigger, arp, euclideanFill, probability) from a config source to a note.
     * @param {NoteEngineProps} note   - note object to mutate
     * @param {NoteEngineProps} source - config or phrase object containing optional engine properties
     */
    applyNoteProperties = (note, source) => {
        if (typeof source.retriggerCount === 'number') note.retriggerCount = source.retriggerCount
        if (typeof source.rate === 'number') note.rate = source.rate
        if (typeof source.euclideanFill === 'number') note.euclideanFill = source.euclideanFill
        if (source.arp != null) note.arp = source.arp
        if (typeof source.prob === 'number') note.prob = source.prob
        if (typeof source.arpTriggerProbability === 'number') note.arpTriggerProbability = source.arpTriggerProbability
    }

    /**
     * Return a random step advance around averageSpacing, jittered by spacingJitter.
     * Used by arpeggio generators to vary note spacing within a phrase.
     * @param {number} averageSpacing - base number of steps between notes
     * @param {number} spacingJitter  - max random deviation (0 = no jitter)
     * @returns {number} step advance value >= 1
     */
    getStepAdvance = (averageSpacing, spacingJitter) => {
        if (spacingJitter <= 0) return averageSpacing
        const choices = [averageSpacing]
        if (averageSpacing - spacingJitter >= 1) choices.push(averageSpacing - spacingJitter)
        choices.push(averageSpacing + spacingJitter)
        return choices[Math.floor(Math.random() * choices.length)] ?? averageSpacing
    }

    /**
     * Build a pitch contour sequence from a scale array and contour direction.
     * @param {number[]} scale        - array of scale degree offsets
     * @param {number}   phraseLength - number of notes in the sequence
     * @param {string}   contour      - 'up', 'down', or 'updown'
     * @param {number}   [startDegree=0] - starting index within the scale array
     * @param {number[]} [defaultScale=[0]] - fallback scale if input is empty/invalid
     * @returns {number[]} sequence of scale degree offsets
     */
    buildContour = (scale, phraseLength, contour, startDegree = 0, defaultScale = [0]) => {
        const normalizedScale = Array.isArray(scale) && scale.length > 0 ? scale : defaultScale
        const startIndex = clamp(startDegree, 0, normalizedScale.length - 1)
        const sequence = []
        let index = startIndex
        let direction = 1

        for (let i = 0; i < phraseLength; i++) {
            sequence.push(normalizedScale[index])
            if (contour === 'up') {
                index = (index + 1) % normalizedScale.length
                continue
            }
            if (contour === 'down') {
                index = (index - 1 + normalizedScale.length) % normalizedScale.length
                continue
            }

            if (normalizedScale.length === 1) continue
            const nextIndex = index + direction
            if (nextIndex >= normalizedScale.length || nextIndex < 0) {
                direction *= -1
                index += direction
            } else {
                index = nextIndex
            }
        }

        return sequence
    }

    /**
     * Temporarily override track.stepsPerBeat, run fn, then restore the original value.
     * Uses try/finally to guarantee restoration even on exception.
     * @param {{stepsPerBeat?: number}} track - track with stepsPerBeat property
     * @param {number}   targetQuantize - value to set during fn execution
     * @param {Function} fn             - generation function to run with overridden stepsPerBeat
     */
    withTemporaryStepsPerBeat = (track, targetQuantize, fn) => {
        const range = TRACK_VALUE_RANGES.stepsPerBeat
        const clamped = clamp(targetQuantize, range.min, range.max)
        const saved = track.stepsPerBeat
        track.stepsPerBeat = clamped
        try {
            fn()
        } finally {
            track.stepsPerBeat = saved
        }
    }

    #isRequiredStep = (beat, step, requiredSteps = []) => {
        return requiredSteps.some((requiredStep) => {
            const beatMatches =
                requiredStep.beatModulo === undefined || beat % requiredStep.beatModulo === requiredStep.beatModulo - 1
            return beatMatches && requiredStep.step === step
        })
    }
}
