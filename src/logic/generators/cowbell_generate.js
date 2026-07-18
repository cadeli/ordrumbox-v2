import BaseGenerator from './base_generator.js'

export default class MfCowbellGenerate extends BaseGenerator {
    static COWBELL_GENERATION_CONFIGS = Object.freeze({
        basic: {
            mode: 'phrases',
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0, accent: true },
                { beat: 1, step: 0 },
                { beat: 2, step: 0 },
                { beat: 3, step: 0 },
            ],
            velocity: { base: 0.72, accentOnBeat: 0.14, ghost: -0.3, randomSpread: 0.06, clampMin: 0.35, clampMax: 0.95 }
        },
        offbeat: {
            mode: 'grid',
            loopPointBeat: 2,
            loopPointStep: 0,
            probabilities: [0.05, 0.8, 0.05, 0.8],
            velocity: { base: 0.68, accentOnBeat: 0.12, ghost: -0.2, randomSpread: 0.08, clampMin: 0.3, clampMax: 0.92 }
        },
        dense: {
            mode: 'grid',
            loopPointBeat: 1,
            loopPointStep: 0,
            probabilities: [0.7, 0.3, 0.7, 0.3],
            velocity: { base: 0.62, accentOnBeat: 0.16, ghost: -0.18, randomSpread: 0.08, clampMin: 0.3, clampMax: 0.88 }
        },
        sparse: {
            mode: 'phrases',
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0 },
                { beat: 2, step: 2 },
            ],
            velocity: { base: 0.6, accentOnBeat: 0.1, randomSpread: 0.08, clampMin: 0.3, clampMax: 0.88 }
        },
        syncopated: {
            mode: 'phrases',
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0, accent: true },
                { beat: 0, step: 3 },
                { beat: 1, step: 2 },
                { beat: 2, step: 0, accent: true },
                { beat: 2, step: 3 },
                { beat: 3, step: 2 },
            ],
            velocity: { base: 0.65, accentOnBeat: 0.14, ghost: -0.2, randomSpread: 0.1, clampMin: 0.28, clampMax: 0.92 }
        },
    })

    constructor() {
        super('COWBELL', MfCowbellGenerate.COWBELL_GENERATION_CONFIGS)
    }

    generateNewCowbell = async (track, variantName = null, density = 1) => {
        const variant = this.resolveVariantName(variantName)
        const config = this.configs[variant] ?? this.configs.basic

        this.clearTrackNotes(track)

        if (config.mode === 'grid') {
            this.generateGridVariant(track, config, null, null, density)
        } else {
            this.generatePhraseVariant(
                track,
                config,
                () => 0,
                (phrase) => phrase.accent === true,
                (phrase) => phrase.ghost === true,
                density
            )
        }
        this.applyLoopPoint(track, config)
    }
}
