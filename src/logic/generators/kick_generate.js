import BaseGenerator from './base_generator.js'

export default class MfKickGenerate extends BaseGenerator {
    static KICK_GENERATION_CONFIGS = Object.freeze({
        basic: {
            mode: 'phrases',
            loopPointBar: 4,
            loopPointStep: 0,
            phrases: [
                { bar: 0, step: 0, accent: true },
                { bar: 1, step: 0, accent: true },
                { bar: 2, step: 0, accent: true },
                { bar: 2, step: 2 },
                { bar: 3, step: 0, accent: true }
            ],
            velocity: {
                base: 0.84,
                accentOnBeat: 0.14,
                ghost: -0.28,
                randomSpread: 0.06,
                clampMin: 0.42,
                clampMax: 1
            }
        },
        fourOnFloor: {
            mode: 'grid',
            loopPointBar: 1,
            loopPointStep: 0,
            probabilities: [1, 0.05, 0.92, 0.08],
            velocity: {
                base: 0.86,
                accentOnBeat: 0.12,
                ghost: -0.35,
                randomSpread: 0.04,
                clampMin: 0.4,
                clampMax: 1
            }
        },
        syncopated: {
            mode: 'grid',
            loopPointBar: 2,
            loopPointStep: 0,
            probabilities: [1, 0.26, 0.58, 0.34],
            velocity: {
                base: 0.78,
                accentOnBeat: 0.18,
                ghost: -0.24,
                randomSpread: 0.08,
                clampMin: 0.38,
                clampMax: 1
            }
        },
        break: {
            mode: 'break',
            loopPointBar: 4,
            loopPointStep: 0,
            startBarOffset: 1,
            steps: [0, 1, 3],
            velocity: {
                base: 0.76,
                accentOnBeat: 0.2,
                ghost: -0.18,
                randomSpread: 0.1,
                clampMin: 0.36,
                clampMax: 1
            }
        }
    })

    constructor() {
        super('KICK', MfKickGenerate.KICK_GENERATION_CONFIGS)
    }

    generateNewKick = (kickTrack, variantName = null, variantSubName = null) => {
        if (variantName === 'outro') return

        const resolvedVariantName = this.resolveVariantName(variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.basic

        this.traceGeneration(resolvedVariantName, config, kickTrack)
        this.clearTrackNotes(kickTrack)

        switch (config.mode) {
            case 'grid':
                this.generateGridVariant(kickTrack, config,
                    (bar, step) => step === 0,
                    (bar, step) => step !== 0
                )
                break
            case 'break':
                this.generateKickBreakVariant(kickTrack, config)
                break
            case 'phrases':
            default:
                this.generatePhraseVariant(kickTrack, config,
                    () => 0,
                    (phrase) => phrase.accent === true,
                    (phrase) => phrase.ghost === true
                )
                break
        }

        this.applyLoopPoint(kickTrack, config)
        this.displayDebugNotes(kickTrack, 'KD')
    }

    generateKickBreakVariant = (kickTrack, config) => {
        const loopPointBar = config.loopPointBar ?? 4
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = kickTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep

        for (let bar = 0; bar < kickTrack.bars; bar++) {
            const absoluteStep = bar * barQuantize + 0
            if (absoluteStep >= loopPointAbsolute) continue
            this.addNote(kickTrack, bar, 0, 0, 1)
        }
    }

    getRndVariantName = () => {
        const variants = Object.keys(this.configs).filter((v) => v !== 'break')
        return variants[Math.floor(Math.random() * variants.length)] ?? 'basic'
    }
}
