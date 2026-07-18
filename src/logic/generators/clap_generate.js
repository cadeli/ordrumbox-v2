import BaseGenerator from './base_generator.js'

export default class MfClapGenerate extends BaseGenerator {
    static CLAP_GENERATION_CONFIGS = Object.freeze({
        backbeat: {
            mode: 'phrases',
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 1, step: 0, accent: true },
                { beat: 3, step: 0, accent: true }
            ],
            velocity: {
                base: 0.78,
                accentOnBeat: 0.16,
                ghost: -0.3,
                randomSpread: 0.06,
                clampMin: 0.35,
                clampMax: 0.95
            }
        },
        offbeat: {
            mode: 'grid',
            loopPointBeat: 2,
            loopPointStep: 0,
            probabilities: [0.05, 0.85, 0.05, 0.85],
            velocity: {
                base: 0.72,
                accentOnBeat: 0.12,
                ghost: -0.2,
                randomSpread: 0.08,
                clampMin: 0.3,
                clampMax: 0.92
            }
        },
        sparse: {
            mode: 'phrases',
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 1, step: 0 },
                { beat: 3, step: 2 }
            ],
            velocity: {
                base: 0.65,
                accentOnBeat: 0.1,
                randomSpread: 0.08,
                clampMin: 0.3,
                clampMax: 0.88
            }
        },
        fourOnFloor: {
            mode: 'grid',
            loopPointBeat: 1,
            loopPointStep: 0,
            probabilities: [0.8, 0.05, 0.05, 0.05],
            velocity: {
                base: 0.7,
                accentOnBeat: 0.18,
                ghost: -0.25,
                randomSpread: 0.06,
                clampMin: 0.32,
                clampMax: 0.9
            }
        },
        syncopated: {
            mode: 'phrases',
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0, accent: true },
                { beat: 0, step: 3 },
                { beat: 1, step: 1 },
                { beat: 2, step: 0, accent: true },
                { beat: 2, step: 2 },
                { beat: 3, step: 1 }
            ],
            velocity: {
                base: 0.68,
                accentOnBeat: 0.14,
                ghost: -0.2,
                randomSpread: 0.1,
                clampMin: 0.28,
                clampMax: 0.92
            }
        },
        dense: {
            mode: 'grid',
            loopPointBeat: 1,
            loopPointStep: 0,
            probabilities: [0.7, 0.3, 0.7, 0.3],
            velocity: {
                base: 0.65,
                accentOnBeat: 0.16,
                ghost: -0.18,
                randomSpread: 0.08,
                clampMin: 0.3,
                clampMax: 0.88
            }
        }
    })

    constructor() {
        super('CLAP', MfClapGenerate.CLAP_GENERATION_CONFIGS)
    }

    generateNewClap = (clapTrack, variantName = null, density = 1) => {
        const resolvedVariantName = this.resolveVariantName(variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.sparse

        this.clearTrackNotes(clapTrack)

        switch (config.mode) {
            case 'grid':
                this.generateGridVariant(clapTrack, config,
                    null, null, density, { defaultBar: 2 }
                )
                break
            case 'phrases':
            default:
                this.generatePhraseVariant(clapTrack, config,
                    () => 0,
                    (phrase) => phrase.accent === true,
                    (phrase) => phrase.ghost === true,
                    density
                )
                break
        }

        this.applyLoopPoint(clapTrack, config)
    }
}
