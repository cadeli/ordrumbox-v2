import BaseGenerator from './base_generator.js'

export default class MfHatGenerate extends BaseGenerator {
    static HAT_GENERATION_CONFIGS = Object.freeze({
        chhBasic: {
            mode: 'grid',
            trackType: 'CHH',
            loopPointBar: 1,
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
            loopPointBar: 1,
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
            loopPointBar: 2,
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
        ohhBasic: {
            mode: 'phrases',
            trackType: 'OHH',
            loopPointBar: 2,
            loopPointStep: 0,
            phrases: [
                { bar: 0, step: 2, accent: true },
                { bar: 1, step: 2 }
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
            loopPointBar: 2,
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
        transition: {
            mode: 'transition',
            trackType: 'HAT',
            loopPointBar: 1,
            loopPointStep: 0,
            startBarOffset: 1,
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

    generateNewHat = (hatTrack, variantName = null, variantSubName = null) => {
        if (variantName === 'break') return
        if (variantName === 'intro') return
        if (variantName === 'outro') return

        const trackType = this.getHatTrackType(hatTrack)
        const resolvedVariantName = this.resolveHatVariantName(trackType, variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.chhBasic

        this.traceHatGeneration(resolvedVariantName, config, hatTrack)
        this.clearTrackNotes(hatTrack)

        switch (config.mode) {
            case 'grid':
                this.generateGridVariant(hatTrack, config,
                    (bar, step) => step === 0 || step === Math.floor(hatTrack.barQuantize / 2),
                    (bar, step) => step % 2 !== 0
                )
                break
            case 'transition':
                this.generateHatTransitionVariant(hatTrack, config, trackType)
                break
            case 'phrases':
            default:
                this.generatePhraseVariant(hatTrack, config,
                    () => 0,
                    (phrase) => phrase.accent === true,
                    (phrase) => phrase.ghost === true
                )
                break
        }

        this.applyLoopPoint(hatTrack, config)
       // this.displayDebugNotes(hatTrack, 'HH')
    }

    generateHatTransitionVariant = (hatTrack, config, trackType) => {
        const lastBar = Math.max(0, (hatTrack.bars ?? 1) - (config.startBarOffset ?? 1))
        const barQuantize = hatTrack.barQuantize ?? 4
        const interval = trackType === 'OHH' ? 2 : 1

        const loopPointBar = config.loopPointBar ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        const lastBarAbsolute = lastBar * barQuantize

        for (let step = 0; step < barQuantize; step += interval) {
            const absoluteStep = lastBarAbsolute + step
            if (absoluteStep >= loopPointAbsolute) continue

            this.addNote(
                hatTrack,
                lastBar,
                step,
                0,
                this.computeVelocity(config.velocity, {
                    step,
                    accent: step === barQuantize - interval,
                    ghost: step !== barQuantize - interval
                })
            )
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

    traceHatGeneration = (variantName, config, hatTrack) => {
    //    this.traceGeneration(variantName, config, hatTrack, [`type=${config.trackType}`])
    }
}
