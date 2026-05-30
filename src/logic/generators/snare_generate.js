import BaseGenerator from './base_generator.js'

export default class MfSnareGenerate extends BaseGenerator {
    static SNARE_GENERATION_CONFIGS = Object.freeze({
        basic: {
            mode: 'phrases',
            loopPointBar: 4,
            loopPointStep: 0,
            phrases: [
                { bar: 1, step: 0, accent: true },
                { bar: 3, step: 0, accent: true }
            ],
            velocity: {
                base: 0.82,
                accentOnBeat: 0.14,
                ghost: -0.42,
                randomSpread: 0.05,
                clampMin: 0.28,
                clampMax: 1
            }
        },
        ghost: {
            mode: 'phrases',
            loopPointBar: 4,
            loopPointStep: 0,
            phrases: [
                { bar: 1, step: 0, accent: true },
                { bar: 1, step: 3, ghost: true },
                { bar: 2, step: 1, ghost: true },
                { bar: 3, step: 0, accent: true },
                { bar: 3, step: 2, ghost: true },
                { bar: 3, step: 3, ghost: true }
            ],
            velocity: {
                base: 0.78,
                accentOnBeat: 0.16,
                ghost: -0.46,
                randomSpread: 0.08,
                clampMin: 0.22,
                clampMax: 1
            }
        },
        break: {
            mode: 'fill',
            loopPointBar: 4,
            loopPointStep: 0,
            startBarOffset: 1,
            density: 0.62,
            steps: [0, 1, 2, 3],
            velocity: {
                base: 0.66,
                accentOnBeat: 0.24,
                ghost: -0.24,
                randomSpread: 0.12,
                clampMin: 0.25,
                clampMax: 1
            }
        },
        syncopated: {
            mode: 'grid',
            loopPointBar: 2,
            loopPointStep: 0,
            probabilities: [0.15, 0.35, 0.2, 0.72],
            requiredSteps: [
                { barModulo: 2, step: 0 }
            ],
            velocity: {
                base: 0.7,
                accentOnBeat: 0.2,
                ghost: -0.32,
                randomSpread: 0.1,
                clampMin: 0.24,
                clampMax: 1
            }
        },
        roll: {
            mode: 'roll',
            loopPointBar: 1,
            loopPointStep: 0,
            startBarOffset: 1,
            minVelocity: 0.32,
            maxVelocity: 1,
            velocity: {
                base: 0.42,
                accentOnBeat: 0.28,
                ghost: -0.08,
                randomSpread: 0.08,
                clampMin: 0.28,
                clampMax: 1
            }
        }
    })

    constructor() {
        super('SNARE', MfSnareGenerate.SNARE_GENERATION_CONFIGS)
    }

    generateNewSnare = (snareTrack, variantName = null, variantSubName = null) => {
        if (variantName === 'intro') return
        if (variantName === 'outro') return

        const resolvedVariantName = this.resolveVariantName(variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.basic

       // this.traceGeneration(resolvedVariantName, config, snareTrack)
        this.clearTrackNotes(snareTrack)

        switch (config.mode) {
            case 'grid':
                this.generateSnareGridVariant(snareTrack, config)
                break
            case 'fill':
                this.generateSnareFillVariant(snareTrack, config)
                break
            case 'roll':
                this.generateSnareRollVariant(snareTrack, config)
                break
            case 'phrases':
            default:
                this.generatePhraseVariant(snareTrack, config,
                    () => 0,
                    (phrase) => phrase.accent === true,
                    (phrase) => phrase.ghost === true
                )
                break
        }

        this.applyLoopPoint(snareTrack, config)
       // this.displayDebugNotes(snareTrack, 'SN')
    }

    generateSnareGridVariant = (snareTrack, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = snareTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep

        for (let bar = 0; bar < (snareTrack.bars ?? 1); bar++) {
            for (let step = 0; step < barQuantize; step++) {
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) continue

                const required = this.isRequiredStep(bar, step, config.requiredSteps)
                const probability = config.probabilities?.[step % config.probabilities.length] ?? 0

                if (!required && Math.random() >= probability) continue

                this.addNote(
                    snareTrack,
                    bar,
                    step,
                    0,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: required || step === 0,
                        ghost: !required && step !== 0
                    })
                )
            }
        }
    }

    generateSnareRollVariant = (snareTrack, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = snareTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep

        const lastBar = Math.max(0, (snareTrack.bars ?? 1) - 1)
        const lastStep = Math.max(0, barQuantize - 1)

        for (let step = 0; step < barQuantize; step++) {
            const absoluteStep = lastBar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) continue

            const progress = lastStep === 0 ? 1 : step / lastStep
            const velocity = (config.minVelocity ?? 0.3) + ((config.maxVelocity ?? 1) - (config.minVelocity ?? 0.3)) * progress

            this.addNote(
                snareTrack,
                lastBar,
                step,
                0,
                this.computeVelocity(config.velocity, {
                    step,
                    accent: step === lastStep,
                    ghost: step !== lastStep,
                    velocityBase: velocity
                })
            )
        }
    }

    generateSnareFillVariant = (snareTrack, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = snareTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep

        const startBar = Math.max(0, (snareTrack.bars ?? 1) - (config.startBarOffset ?? 1))
        for (let bar = startBar; bar < (snareTrack.bars ?? 1); bar++) {
            config.steps.forEach((step) => {
                if (step >= barQuantize || Math.random() >= config.density) return

                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) return

                this.addNote(
                    snareTrack,
                    bar,
                    step,
                    0,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: step === 0 || step === snareTrack.barQuantize - 1,
                        ghost: step !== 0
                    })
                )
            })
        }
    }

    isRequiredStep = (bar, step, requiredSteps = []) => {
        return requiredSteps.some((requiredStep) => {
            const barMatches = requiredStep.barModulo === undefined || bar % requiredStep.barModulo === requiredStep.barModulo - 1
            return barMatches && requiredStep.step === step
        })
    }
}
