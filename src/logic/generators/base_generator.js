import { serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { TRACK_VALUE_RANGES } from '../../model/track_schema.js'

export default class BaseGenerator {
    constructor(instrumentName, configs, addNoteFn) {
        this.instrumentName = instrumentName
        this.configs = configs
        this.addNoteFn = addNoteFn ?? ((track, beat, beatStep, pitch) => serviceRegistry.mfCmd.addNote(track, beat, beatStep, pitch))
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
        const result = Math.min(max, Math.max(min, base + accent + ghost + variationBoost + randomOffset))
        return context.toFixed !== false ? Number(result.toFixed(2)) : result
    }

    applyLoopPoint = (track, config) => {
        const loopPointBeat = config.loopPointBeat ?? track.nbBeats ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        track.loopPointBeat = loopPointBeat
        track.loopPointStep = loopPointStep
        track.loopAtStep = loopPointBeat * track.stepsPerBeat + loopPointStep
    }

    /**
     * Compute the absolute loop point step from config and track.
     * @param {object} track  - track with stepsPerBeat
     * @param {object} config - generator config with loopPointBeat/loopPointStep
     * @param {number} [defaultBar=1] - default loopPointBeat if not in config
     * @returns {number} absolute step index
     */
    getLoopPointAbsolute = (track, config, defaultBar = 1) => {
        const loopPointBeat = config.loopPointBeat ?? defaultBar
        const loopPointStep = config.loopPointStep ?? 0
        const stepsPerBeat = track.stepsPerBeat ?? 4
        return loopPointBeat * stepsPerBeat + loopPointStep
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
        return tone > (this._toneThreshold ?? 6) ? tone - 12 : tone
    }

    /**
     * Resolve pitch from a phrase config.
     * Subclasses can override for different behavior.
     */
    resolvePhrasePitch = (phrase, tones, cachedPitches, pitchBias = 0) => {
        if (typeof phrase.pitch === 'number') {
            return phrase.pitch + pitchBias
        }
        if (phrase.source === 'reuse' && typeof phrase.reuseIndex === 'number') {
            return cachedPitches[phrase.reuseIndex] ?? pitchBias
        }
        if (phrase.source === 'root') {
            return pitchBias
        }
        if (phrase.source === 'third') {
            return 4 + pitchBias
        }
        if (phrase.source === 'fifth') {
            return 7 + pitchBias
        }
        if (phrase.source === 'seventh') {
            return 11 + pitchBias
        }
        if (phrase.source === 'octave') {
            return 12 + pitchBias
        }
        if (phrase.source === 'approach') {
            const approachFrom = Math.random() < 0.5 ? -1 : -2
            return approachFrom + pitchBias
        }
        return this.getRndTone(tones) + pitchBias
    }

    formatCompactVelocity = (velocityConfig, defaults = {}) => {
        const segments = [
            `b${velocityConfig.base ?? defaults.base ?? 0.75}`
        ]
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
        segments.push(`c${velocityConfig.clampMin ?? defaults.clampMin ?? 0.25}-${velocityConfig.clampMax ?? defaults.clampMax ?? 1}`)
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
        const defaultBar = opts.defaultBar ?? 1
        const loopPointAbsolute = this.getLoopPointAbsolute(track, config, defaultBar)
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const pitchResolver = opts.pitchResolver ?? null
        const requiredSteps = config.requiredSteps ?? null

        for (let beat = 0; beat < (track.nbBeats ?? 1); beat++) {
            for (let step = 0; step < stepsPerBeat; step++) {
                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) continue

                const required = requiredSteps ? this._isRequiredStep(beat, step, requiredSteps) : false
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
                    this.computeVelocity(config.velocity, { step, accent, ghost })
                )
                this.applyNoteProperties(note, config)
            }
        }
    }

    generatePhraseVariant = (track, config, getPitch, getAccentContext, getGhostContext, density = 1, opts = {}) => {
        const defaultBar = opts.defaultBar ?? 2
        const loopPointAbsolute = this.getLoopPointAbsolute(track, config, defaultBar)
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const cachedPitches = opts.cachedPitches ?? null
        const occupiedByBar = new Map()

        config.phrases.forEach((phrase) => {
            if (density < 1 && Math.random() >= density) return

            let step
            if (phrase.step === 'random') {
                const beat = phrase.beat
                if (!occupiedByBar.has(beat)) occupiedByBar.set(beat, new Set())
                const occupied = occupiedByBar.get(beat)
                const freeSteps = []
                for (let s = 0; s < stepsPerBeat; s++) {
                    if (!occupied.has(s)) freeSteps.push(s)
                }
                if (freeSteps.length === 0) return
                step = freeSteps[Math.floor(Math.random() * freeSteps.length)]
            } else {
                step = phrase.step
            }

            const absoluteStep = phrase.beat * stepsPerBeat + step
            if (absoluteStep >= loopPointAbsolute) return

            const pitch = getPitch?.(phrase, track) ?? config.pitch ?? 0
            const accent = getAccentContext?.(phrase, step) ?? phrase.accent === true
            const ghost = getGhostContext?.(phrase, step) ?? phrase.ghost === true

            const note = this.addNote(
                track,
                phrase.beat,
                step,
                pitch,
                this.computeVelocity(config.velocity, { step, accent, ghost })
            )
            this.applyNoteProperties(note, phrase)
            if (cachedPitches) cachedPitches.push(pitch)

            if (!occupiedByBar.has(phrase.beat)) occupiedByBar.set(phrase.beat, new Set())
            occupiedByBar.get(phrase.beat).add(step)
        })
    }

    /**
     * Copy engine properties (retrigger, arp, euclidianFill, probability) from a config source to a note.
     * @param {object} note   - note object to mutate
     * @param {object} source - config or phrase object containing optional engine properties
     */
    applyNoteProperties = (note, source) => {
        if (typeof source.retriggerNum === 'number') note.retriggerNum = source.retriggerNum
        if (typeof source.rate === 'number') note.rate = source.rate
        if (typeof source.euclidianFill === 'number') note.euclidianFill = source.euclidianFill
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
        const startIndex = Math.max(0, Math.min(startDegree, normalizedScale.length - 1))
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
     * @param {object}   track          - track with stepsPerBeat property
     * @param {number}   targetQuantize - value to set during fn execution
     * @param {Function} fn             - generation function to run with overridden stepsPerBeat
     */
    withLockedBarQuantize = (track, targetQuantize, fn) => {
        const range = TRACK_VALUE_RANGES.stepsPerBeat
        const clamped = Math.min(range.max, Math.max(range.min, targetQuantize))
        const saved = track.stepsPerBeat
        track.stepsPerBeat = clamped
        try { fn() } finally { track.stepsPerBeat = saved }
    }

    _isRequiredStep = (beat, step, requiredSteps = []) => {
        return requiredSteps.some((requiredStep) => {
            const beatMatches = requiredStep.beatModulo === undefined || beat % requiredStep.beatModulo === requiredStep.beatModulo - 1
            return beatMatches && requiredStep.step === step
        })
    }
}
