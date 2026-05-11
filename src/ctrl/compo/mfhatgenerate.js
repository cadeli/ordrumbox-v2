import { MfGlobals } from '../../mfglobals.js'

export default class MfHatGenerate {
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

    generateNewHat = (hatTrack, variantName = null, variantSubName=null) => {
        if (variantName === 'break') return
        if (variantName === 'intro') return
        if (variantName === 'outro') return

        const trackType = this.getHatTrackType(hatTrack)
        const resolvedVariantName = this.resolveHatVariantName(trackType, variantName)
        const config = MfHatGenerate.HAT_GENERATION_CONFIGS[resolvedVariantName] ?? MfHatGenerate.HAT_GENERATION_CONFIGS.chhBasic

        this.traceHatGeneration(resolvedVariantName, config, hatTrack)
        this.clearTrackNotes(hatTrack)

        switch (config.mode) {
            case 'grid':
                this.generateHatGridVariant(hatTrack, config)
                break
            case 'transition':
                this.generateHatTransitionVariant(hatTrack, config, trackType)
                break
            case 'phrases':
            default:
                this.generateHatPhraseVariant(hatTrack, config)
                break
        }

        this.applyHatLoopPoint(hatTrack, config)
        this.displayDebugNotes(hatTrack)
    }

    generateHatPhraseVariant = (hatTrack, config) => {
        config.phrases.forEach((phrase) => {
            const step = phrase.step === 'random'
                ? Math.floor(Math.random() * hatTrack.barQuantize)
                : phrase.step

            this.addHatNote(
                hatTrack,
                phrase.bar,
                step,
                this.computeHatVelocity(config.velocity, {
                    step,
                    accent: phrase.accent === true,
                    ghost: phrase.ghost === true
                })
            )
        })
    }

    generateHatGridVariant = (hatTrack, config) => {
        const loopPointBar = config.loopPointBar ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = hatTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        for (let bar = 0; bar < (hatTrack.bars ?? 1); bar++) {
            for (let step = 0; step < barQuantize; step++) {
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) continue
                
                const probability = config.probabilities?.[step % config.probabilities.length] ?? 0
                if (Math.random() >= probability) {
                    continue
                }

                this.addHatNote(
                    hatTrack,
                    bar,
                    step,
                    this.computeHatVelocity(config.velocity, {
                        step,
                        accent: step === 0 || step === Math.floor(barQuantize / 2),
                        ghost: step % 2 !== 0
                    })
                )
            }
        }
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
            
            this.addHatNote(
                hatTrack,
                lastBar,
                step,
                this.computeHatVelocity(config.velocity, {
                    step,
                    accent: step === barQuantize - interval,
                    ghost: step !== barQuantize - interval
                })
            )
        }
    }

    addHatNote = (track, bar, barStep, velocity = 0.45) => {
        const note = MfGlobals.mfCmd.addNote(track, bar, barStep, 0)
        note.velocity = velocity
        return note
    }

    clearTrackNotes = (track) => {
        track.notes = []
    }

    computeHatVelocity = (velocityConfig = {}, context = {}) => {
        const base = velocityConfig.base ?? 0.42
        const accent = context.accent ? (velocityConfig.accentOnBeat ?? 0) : 0
        const ghost = context.ghost ? (velocityConfig.ghost ?? 0) : 0
        const randomSpread = velocityConfig.randomSpread ?? 0
        const randomOffset = (Math.random() * 2 - 1) * randomSpread
        const min = velocityConfig.clampMin ?? 0.15
        const max = velocityConfig.clampMax ?? 0.85
        return Math.min(max, Math.max(min, base + accent + ghost + randomOffset)).toFixed(2)
    }

    applyHatLoopPoint = (hatTrack, config) => {
        const loopPointBar = config.loopPointBar ?? hatTrack.bars ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        hatTrack.loopPointBar = loopPointBar
        hatTrack.loopPointStep = loopPointStep
        hatTrack.loopAtStep = loopPointBar * hatTrack.barQuantize + loopPointStep
    }

    getHatTrackType = (track) => {
        const trackName = String(track?.name ?? '').toUpperCase()
        if (trackName.includes('OHH') || trackName.includes('OPEN')) {
            return 'OHH'
        }
        return 'CHH'
    }

    getRndHatVariantName = (trackType) => {
        const variants = Object.entries(MfHatGenerate.HAT_GENERATION_CONFIGS)
            .filter(([, config]) => config.trackType === trackType)
            .map(([variantName]) => variantName)
        return variants[Math.floor(Math.random() * variants.length)] ?? (trackType === 'OHH' ? 'ohhBasic' : 'chhBasic')
    }

    resolveHatVariantName = (trackType, variantName) => {
        if (variantName && MfHatGenerate.HAT_GENERATION_CONFIGS[variantName]) {
            return variantName
        }
        return this.getRndHatVariantName(trackType)
    }

    traceHatGeneration = (variantName, config, hatTrack) => {
        const parts = [
            `HAT[${variantName}]`,
            `mode=${config.mode}`,
            `type=${config.trackType}`,
            `bars=${hatTrack?.bars ?? '?'}`,
            `steps=${hatTrack?.barQuantize ?? '?'}`,
            `vel=${this.formatCompactVelocity(config.velocity ?? {})}`,
            `loop=${config.loopPointBar}:${config.loopPointStep ?? 0}`
        ]

        if (Array.isArray(config.phrases)) {
            parts.push(`phr=${config.phrases.length}`)
        }
        if (Array.isArray(config.probabilities)) {
            parts.push(`prob=${config.probabilities.join('/')}`)
        }

        console.log(parts.join(" | "))
    }

    formatCompactVelocity = (velocityConfig) => {
        const segments = [
            `b${velocityConfig.base ?? 0.42}`
        ]
        if (typeof velocityConfig.accentOnBeat === 'number') {
            segments.push(`a${velocityConfig.accentOnBeat}`)
        }
        if (typeof velocityConfig.ghost === 'number') {
            segments.push(`g${velocityConfig.ghost}`)
        }
        if (typeof velocityConfig.randomSpread === 'number') {
            segments.push(`r${velocityConfig.randomSpread}`)
        }
        segments.push(`c${velocityConfig.clampMin ?? 0.15}-${velocityConfig.clampMax ?? 0.85}`)
        return segments.join(',')
    }

    displayDebugNotes = (track) => {
        let ret = `${track.name}=`
        Object.values(track.notes).forEach((note) => {
            ret += `HH: ${note.bar}:${note.barStep} V=${note.velocity} - `
        })
        console.log(ret)
    }
}
