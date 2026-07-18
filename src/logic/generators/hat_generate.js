import BaseGenerator from './base_generator.js'

export default class MfHatGenerate extends BaseGenerator {
    static HAT_GENERATION_CONFIGS = Object.freeze({
        chh16thLocked: {
            mode: 'locked',
            trackType: 'CHH',
            loopPointBeat: 1,
            loopPointStep: 0,
            velocityPattern: [0.72, 0.55, 0.68, 0.52, 0.72, 0.55, 0.68, 0.48, 0.72, 0.55, 0.68, 0.52, 0.72, 0.55, 0.68, 0.42],
            accentEvery: 4,
            velocity: {
                base: 0.58,
                accentOnBeat: 0.12,
                ghost: -0.18,
                randomSpread: 0.03,
                clampMin: 0.28,
                clampMax: 0.82
            }
        },
        chhBasic: {
            mode: 'grid',
            trackType: 'CHH',
            loopPointBeat: 1,
            loopPointStep: 0,
            probabilities: [0.95, 0.55, 0.82, 0.62],
            velocity: {
                base: 0.42,
                accentOnBeat: 0.16,
                ghost: -0.14,
                randomSpread: 0.08,
                clampMin: 0.18,
                clampMax: 0.78
            }
        },
        chhDense: {
            mode: 'grid',
            trackType: 'CHH',
            loopPointBeat: 1,
            loopPointStep: 0,
            probabilities: [1, 0.88, 0.96, 0.82],
            velocity: {
                base: 0.38,
                accentOnBeat: 0.14,
                ghost: -0.1,
                randomSpread: 0.07,
                clampMin: 0.16,
                clampMax: 0.72
            }
        },
        chhSparse: {
            mode: 'grid',
            trackType: 'CHH',
            loopPointBeat: 2,
            loopPointStep: 0,
            probabilities: [0.8, 0.12, 0.55, 0.18],
            velocity: {
                base: 0.46,
                accentOnBeat: 0.14,
                ghost: -0.16,
                randomSpread: 0.08,
                clampMin: 0.18,
                clampMax: 0.75
            }
        },
        chhRoll: {
            mode: 'roll',
            trackType: 'CHH',
            loopPointBeat: 4,
            loopPointStep: 0,
            rollBar: 3,
            retriggerNum: 4,
            rate: 86,
            velocity: {
                base: 0.38,
                accentOnBeat: 0.18,
                ghost: -0.12,
                randomSpread: 0.1,
                clampMin: 0.18,
                clampMax: 0.82
            }
        },
        ohhShaker: {
            mode: 'shaker',
            trackType: 'OHH',
            loopPointBeat: 2,
            loopPointStep: 0,
            velocityPattern: [0.62, 0.38, 0.55, 0.42, 0.62, 0.38, 0.55, 0.35],
            accentEvery: 4,
            velocity: {
                base: 0.5,
                accentOnBeat: 0.1,
                ghost: -0.12,
                randomSpread: 0.05,
                clampMin: 0.25,
                clampMax: 0.82
            }
        },
        ohhRide: {
            mode: 'ride',
            trackType: 'OHH',
            loopPointBeat: 2,
            loopPointStep: 0,
            velocityPattern: [0.7, 0.45, 0.62, 0.45],
            accentEvery: 4,
            bell: { step: 0, velocity: 0.78 },
            velocity: {
                base: 0.52,
                accentOnBeat: 0.12,
                ghost: -0.1,
                randomSpread: 0.04,
                clampMin: 0.3,
                clampMax: 0.85
            }
        },
        ohhBasic: {
            mode: 'phrases',
            trackType: 'OHH',
            loopPointBeat: 2,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 2, accent: true },
                { beat: 1, step: 2 }
            ],
            velocity: {
                base: 0.58,
                accentOnBeat: 0.16,
                ghost: -0.18,
                randomSpread: 0.08,
                clampMin: 0.28,
                clampMax: 0.9
            }
        },
        ohhOffbeat: {
            mode: 'grid',
            trackType: 'OHH',
            loopPointBeat: 2,
            loopPointStep: 0,
            probabilities: [0.02, 0.22, 0.88, 0.18],
            velocity: {
                base: 0.56,
                accentOnBeat: 0.12,
                ghost: -0.16,
                randomSpread: 0.1,
                clampMin: 0.25,
                clampMax: 0.88
            }
        },
        ohhRoll: {
            mode: 'roll',
            trackType: 'OHH',
            loopPointBeat: 4,
            loopPointStep: 0,
            rollBar: 3,
            retriggerNum: 3,
            rate: 86,
            velocity: {
                base: 0.5,
                accentOnBeat: 0.2,
                ghost: -0.1,
                randomSpread: 0.1,
                clampMin: 0.25,
                clampMax: 0.9
            }
        },
        transition: {
            mode: 'transition',
            trackType: 'HAT',
            loopPointBeat: 1,
            loopPointStep: 0,
            startBarOffset: 1,
            retriggerNum: 6,
            rate: 8,
            velocity: {
                base: 0.34,
                accentOnBeat: 0.24,
                ghost: -0.08,
                randomSpread: 0.1,
                clampMin: 0.16,
                clampMax: 0.92
            }
        }
    })

    constructor() {
        super('HAT', MfHatGenerate.HAT_GENERATION_CONFIGS)
    }

    generateNewHat = (hatTrack, variantName = null, density = 1) => {
        const trackType = this.getHatTrackType(hatTrack)
        const resolvedVariantName = this.resolveHatVariantName(trackType, variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.chhBasic

        this.clearTrackNotes(hatTrack)

        switch (config.mode) {
            case 'locked':
                this.generateHatLockedVariant(hatTrack, config, density)
                break
            case 'shaker':
                this.generateHatShakerVariant(hatTrack, config, density)
                break
            case 'ride':
                this.generateHatRideVariant(hatTrack, config, density)
                break
            case 'grid':
                this.generateGridVariant(hatTrack, config,
                    (beat, step) => step === 0 || step === Math.floor(hatTrack.stepsPerBeat / 2),
                    (beat, step) => step % 2 !== 0,
                    density
                )
                break
            case 'roll':
                this.generateHatRollVariant(hatTrack, config)
                break
            case 'transition':
                this.generateHatTransitionVariant(hatTrack, config, trackType)
                break
            case 'phrases':
            default:
                this.generatePhraseVariant(hatTrack, config,
                    () => 0,
                    (phrase) => phrase.accent === true,
                    (phrase) => phrase.ghost === true,
                    density
                )
                break
        }

        this.applyLoopPoint(hatTrack, config)
    }

    generateHatLockedVariant = (hatTrack, config, density = 1) => {
        this.withLockedBarQuantize(hatTrack, 16, () => {
            const loopPointAbsolute = this.getLoopPointAbsolute(hatTrack, config, 1)
            const velocityPattern = config.velocityPattern ?? []
            const accentEvery = config.accentEvery ?? 4

            for (let beat = 0; beat < (hatTrack.nbBeats ?? 1); beat++) {
                for (let step = 0; step < 16; step++) {
                    const absoluteStep = beat * 16 + step
                    if (absoluteStep >= loopPointAbsolute) continue

                    const patternVelocity = velocityPattern[step % velocityPattern.length] ?? 0.6
                    const isAccent = step % accentEvery === 0

                    this.addNote(
                        hatTrack,
                        beat,
                        step,
                        0,
                        this.computeVelocity(config.velocity, {
                            step,
                            accent: isAccent,
                            ghost: !isAccent,
                            velocityBase: patternVelocity
                        })
                    )
                }
            }
        })
    }

    generateHatShakerVariant = (hatTrack, config, density = 1) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(hatTrack, config, 2)
        const stepsPerBeat = hatTrack.stepsPerBeat ?? 4
        const velocityPattern = config.velocityPattern ?? []
        const accentEvery = config.accentEvery ?? 4

        for (let beat = 0; beat < (hatTrack.nbBeats ?? 1); beat++) {
            for (let step = 0; step < stepsPerBeat; step++) {
                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) continue

                const patternIndex = absoluteStep % velocityPattern.length
                const patternVelocity = velocityPattern[patternIndex] ?? 0.5
                const isAccent = step % accentEvery === 0

                if (Math.random() >= density) continue

                this.addNote(
                    hatTrack,
                    beat,
                    step,
                    0,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: isAccent,
                        ghost: !isAccent,
                        velocityBase: patternVelocity
                    })
                )
            }
        }
    }

    generateHatRideVariant = (hatTrack, config, density = 1) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(hatTrack, config, 2)
        const stepsPerBeat = hatTrack.stepsPerBeat ?? 4
        const velocityPattern = config.velocityPattern ?? []
        const accentEvery = config.accentEvery ?? 4

        for (let beat = 0; beat < (hatTrack.nbBeats ?? 1); beat++) {
            for (let step = 0; step < stepsPerBeat; step++) {
                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) continue

                const patternIndex = absoluteStep % velocityPattern.length
                const patternVelocity = velocityPattern[patternIndex] ?? 0.55
                const isAccent = step % accentEvery === 0
                const isBell = config.bell?.step === step

                if (Math.random() >= density) continue

                this.addNote(
                    hatTrack,
                    beat,
                    step,
                    0,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: isAccent || isBell,
                        ghost: !isAccent && !isBell,
                        velocityBase: isBell ? (config.bell?.velocity ?? 0.75) : patternVelocity
                    })
                )
            }
        }
    }

    generateHatTransitionVariant = (hatTrack, config, trackType) => {
        const lastBar = Math.max(0, (hatTrack.nbBeats ?? 1) - (config.startBarOffset ?? 1))
        const stepsPerBeat = hatTrack.stepsPerBeat ?? 4
        const interval = trackType === 'OHH' ? 2 : 1

        const loopPointAbsolute = this.getLoopPointAbsolute(hatTrack, config, 1)
        const lastBarAbsolute = lastBar * stepsPerBeat

        for (let step = 0; step < stepsPerBeat; step += interval) {
            const absoluteStep = lastBarAbsolute + step
            if (absoluteStep >= loopPointAbsolute) continue

            const note = this.addNote(
                hatTrack,
                lastBar,
                step,
                0,
                this.computeVelocity(config.velocity, {
                    step,
                    accent: step === stepsPerBeat - interval,
                    ghost: step !== stepsPerBeat - interval
                })
            )
            if (step === stepsPerBeat - interval && typeof config.retriggerNum === 'number') {
                note.retriggerNum = config.retriggerNum
                note.rate = config.rate ?? 1
            }
        }
    }

    generateHatRollVariant = (hatTrack, config) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(hatTrack, config, 4)
        const stepsPerBeat = hatTrack.stepsPerBeat ?? 4
        const rollBar = config.rollBar ?? Math.max(0, (hatTrack.nbBeats ?? 1) - 1)
        const retriggerNum = config.retriggerNum ?? 4
        const rate = config.rate ?? 1

        for (let step = 0; step < stepsPerBeat; step++) {
            const absoluteStep = rollBar * stepsPerBeat + step
            if (absoluteStep >= loopPointAbsolute) continue

            const progress = stepsPerBeat > 1 ? step / (stepsPerBeat - 1) : 1
            const ratchetCount = Math.max(1, Math.round(1 + (retriggerNum - 1) * progress))

            const note = this.addNote(
                hatTrack,
                rollBar,
                step,
                0,
                this.computeVelocity(config.velocity, {
                    step,
                    accent: step === 0,
                    ghost: step !== 0
                })
            )
            if (ratchetCount > 1) {
                note.retriggerNum = ratchetCount
                note.rate = rate
            }
        }
    }

    getHatTrackType = (track) => {
        const trackName = String(track?.name ?? '').toUpperCase()
        if (trackName.includes('OHH') || trackName.includes('OPEN')) {
            return 'OHH'
        }
        return 'CHH'
    }

    getRndHatVariantName = (trackType) => {
        const variants = Object.entries(this.configs)
            .filter(([, config]) => config.trackType === trackType)
            .map(([variantName]) => variantName)
        return variants[Math.floor(Math.random() * variants.length)] ?? (trackType === 'OHH' ? 'ohhBasic' : 'chhBasic')
    }

    resolveHatVariantName = (trackType, variantName) => {
        if (variantName && this.configs[variantName]) {
            return variantName
        }
        return this.getRndHatVariantName(trackType)
    }
}
