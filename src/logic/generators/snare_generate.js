import BaseGenerator from './base_generator.js'

export default class MfSnareGenerate extends BaseGenerator {
    static SNARE_GENERATION_CONFIGS = Object.freeze({
        basic: {
            mode: 'phrases',
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 1, step: 0, accent: true },
                { beat: 3, step: 0, accent: true }
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
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 1, step: 0, accent: true },
                { beat: 1, step: 3, ghost: true },
                { beat: 2, step: 1, ghost: true },
                { beat: 3, step: 0, accent: true },
                { beat: 3, step: 2, ghost: true },
                { beat: 3, step: 3, ghost: true }
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
            loopPointBeat: 4,
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
            loopPointBeat: 2,
            loopPointStep: 0,
            probabilities: [0.15, 0.35, 0.2, 0.72],
            requiredSteps: [
                { beatModulo: 2, step: 0 }
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
            loopPointBeat: 1,
            loopPointStep: 0,
            startBarOffset: 1,
            retriggerNum: 8,
            rate: 16,
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
        },
        breakCrescendo: {
            mode: 'breakCrescendo',
            loopPointBeat: 4,
            loopPointStep: 0,
            stepsBack: 16,
            retriggerNumMax: 8,
            rate: 16,
            velocity: {
                base: 0.7,
                accentOnBeat: 0.18,
                ghost: -0.2,
                randomSpread: 0.06,
                clampMin: 0.3,
                clampMax: 1
            }
        }
    })

    constructor() {
        super('SNARE', MfSnareGenerate.SNARE_GENERATION_CONFIGS)
    }

    generateNewSnare = (snareTrack, variantName = null, density = 1) => {
        const resolvedVariantName = this.resolveVariantName(variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.basic

        this.clearTrackNotes(snareTrack)

        switch (config.mode) {
            case 'grid':
                this.generateGridVariant(snareTrack, config,
                    null, null, density, { defaultBar: 2 }
                )
                break
            case 'fill':
                this.generateSnareFillVariant(snareTrack, config, density)
                break
            case 'roll':
                this.generateSnareRollVariant(snareTrack, config)
                break
            case 'breakCrescendo':
                this.generateBreakCrescendo(snareTrack, config)
                break
            case 'phrases':
            default:
                this.generatePhraseVariant(snareTrack, config,
                    () => 0,
                    (phrase) => phrase.accent === true,
                    (phrase) => phrase.ghost === true,
                    density
                )
                break
        }

        this.applyLoopPoint(snareTrack, config)
    }

    generateSnareRollVariant = (snareTrack, config) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(snareTrack, config, 1)
        const stepsPerBeat = snareTrack.stepsPerBeat ?? 4

        const lastBar = Math.max(0, (snareTrack.nbBeats ?? 1) - 1)
        const lastStep = Math.max(0, stepsPerBeat - 1)
        const retriggerNum = config.retriggerNum ?? 4
        const rate = config.rate ?? 1

        for (let step = 0; step < stepsPerBeat; step++) {
            const absoluteStep = lastBar * stepsPerBeat + step
            if (absoluteStep >= loopPointAbsolute) continue

            const progress = lastStep === 0 ? 1 : step / lastStep
            const velocity = (config.minVelocity ?? 0.3) + ((config.maxVelocity ?? 1) - (config.minVelocity ?? 0.3)) * progress
            const ratchetCount = Math.max(1, Math.round(1 + (retriggerNum - 1) * progress))

            const note = this.addNote(
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
            if (ratchetCount > 1) {
                note.retriggerNum = ratchetCount
                note.rate = rate
            }
        }
    }

    generateSnareFillVariant = (snareTrack, config, density = 1) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(snareTrack, config, 2)
        const stepsPerBeat = snareTrack.stepsPerBeat ?? 4

        const startBar = Math.max(0, (snareTrack.nbBeats ?? 1) - (config.startBarOffset ?? 1))
        for (let beat = startBar; beat < (snareTrack.nbBeats ?? 1); beat++) {
            config.steps.forEach((step) => {
                if (step >= stepsPerBeat || Math.random() >= config.density * density) return

                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) return

                this.addNote(
                    snareTrack,
                    beat,
                    step,
                    0,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: step === 0 || step === snareTrack.stepsPerBeat - 1,
                        ghost: step !== 0
                    })
                )
            })
        }
    }

    generateBreakCrescendo = (snareTrack, config) => {
        const stepsPerBeat = snareTrack.stepsPerBeat ?? 4
        const nbBeats = snareTrack.nbBeats ?? 1
        const patternLength = nbBeats * stepsPerBeat
        const stepsBack = config.stepsBack ?? 16
        const startStep = Math.max(0, patternLength - stepsBack)
        const retriggerNumMax = config.retriggerNumMax ?? 0
        const rate = config.rate ?? 1

        for (let absStep = startStep; absStep < patternLength; absStep++) {
            const beat = Math.floor(absStep / stepsPerBeat)
            const beatStep = absStep % stepsPerBeat
            const position = absStep - startStep
            const prob = (position + 1) / stepsBack

            const note = this.addNote(
                snareTrack,
                beat,
                beatStep,
                0,
                this.computeVelocity(config.velocity, {
                    step: beatStep,
                    accent: beatStep === 0,
                    ghost: false
                })
            )
            note.prob = Number(prob.toFixed(2))
            if (retriggerNumMax > 1) {
                const ratchetCount = Math.max(1, Math.round(1 + (retriggerNumMax - 1) * prob))
                if (ratchetCount > 1) {
                    note.retriggerNum = ratchetCount
                    note.rate = rate
                }
            }
        }
    }
}
