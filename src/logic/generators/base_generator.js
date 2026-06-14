import { serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'

export default class BaseGenerator {
    constructor(instrumentName, configs, addNoteFn) {
        this.instrumentName = instrumentName
        this.configs = configs
        this.addNoteFn = addNoteFn ?? ((track, bar, barStep, pitch) => serviceRegistry.mfCmd.addNote(track, bar, barStep, pitch))
    }

    addNote = (track, bar, barStep, pitch = 0, velocity = 0.8, isGhost = false) => {
        const note = this.addNoteFn(track, bar, barStep, pitch)
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
        const loopPointBar = config.loopPointBar ?? track.bars ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        track.loopPointBar = loopPointBar
        track.loopPointStep = loopPointStep
        track.loopAtStep = loopPointBar * track.barQuantize + loopPointStep
    }

    /**
     * Compute the absolute loop point step from config and track.
     * @param {object} track  - track with barQuantize
     * @param {object} config - generator config with loopPointBar/loopPointStep
     * @param {number} [defaultBar=1] - default loopPointBar if not in config
     * @returns {number} absolute step index
     */
    getLoopPointAbsolute = (track, config, defaultBar = 1) => {
        const loopPointBar = config.loopPointBar ?? defaultBar
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = track.barQuantize ?? 4
        return loopPointBar * barQuantize + loopPointStep
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

    displayDebugNotes = (track, prefix = 'GN') => {
        // Debug-only method — no-op in production
    }

    traceGeneration = (variantName, config, track, extraParts = []) => {
        // Debug-only method — no-op in production
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

    generateGridVariant = (track, config, getAccentContext, getGhostContext) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(track, config, 1)

        for (let bar = 0; bar < (track.bars ?? 1); bar++) {
            for (let step = 0; step < track.barQuantize; step++) {
                const absoluteStep = bar * track.barQuantize + step
                if (absoluteStep >= loopPointAbsolute) continue

                const probability = config.probabilities?.[step % config.probabilities.length] ?? 0
                if (Math.random() >= probability) continue

                const accent = getAccentContext?.(bar, step, config) ?? step === 0
                const ghost = getGhostContext?.(bar, step, config) ?? step !== 0

                this.addNote(
                    track,
                    bar,
                    step,
                    config.pitch ?? 0,
                    this.computeVelocity(config.velocity, { step, accent, ghost })
                )
            }
        }
    }

    generatePhraseVariant = (track, config, getPitch, getAccentContext, getGhostContext) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(track, config, 2)
        const barQuantize = track.barQuantize ?? 4

        config.phrases.forEach((phrase) => {
            const step = phrase.step === 'random'
                ? Math.floor(Math.random() * barQuantize)
                : phrase.step

            const absoluteStep = phrase.bar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) return

            const pitch = getPitch?.(phrase, track) ?? config.pitch ?? 0
            const accent = getAccentContext?.(phrase, step) ?? phrase.accent === true
            const ghost = getGhostContext?.(phrase, step) ?? phrase.ghost === true

            this.addNote(
                track,
                phrase.bar,
                step,
                pitch,
                this.computeVelocity(config.velocity, { step, accent, ghost })
            )
        })
    }
}
