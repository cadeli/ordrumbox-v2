import { MfGlobals } from '../../mfglobals.js'

export default class MfSnareGenerate {
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

    generateNewSnare = (snareTrack, variantName = null, variantSubName=null) => {
        if (variantName === 'intro') return
        if (variantName === 'outro') return

        const resolvedVariantName = this.resolveSnareVariantName(variantName)
        const config = MfSnareGenerate.SNARE_GENERATION_CONFIGS[resolvedVariantName] ?? MfSnareGenerate.SNARE_GENERATION_CONFIGS.basic

        this.traceSnareGeneration(resolvedVariantName, config, snareTrack)
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
                this.generateSnarePhraseVariant(snareTrack, config)
                break
        }

        this.applySnareLoopPoint(snareTrack, config)
        this.displayDebugNotes(snareTrack)
    }

    generateSnarePhraseVariant = (snareTrack, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = snareTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        config.phrases.forEach((phrase) => {
            const step = phrase.step === 'random'
                ? Math.floor(Math.random() * barQuantize)
                : phrase.step
                
            const absoluteStep = phrase.bar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) return
            
            this.addSnareNote(
                snareTrack,
                phrase.bar,
                step,
                this.computeSnareVelocity(config.velocity, {
                    step,
                    accent: phrase.accent === true,
                    ghost: phrase.ghost === true
                })
            )
        })
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

                if (!required && Math.random() >= probability) {
                    continue
                }

                this.addSnareNote(
                    snareTrack,
                    bar,
                    step,
                    this.computeSnareVelocity(config.velocity, {
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
        
        const startBar = 0
        const lastBar = Math.max(startBar, (snareTrack.bars ?? 1) - 1)
        const lastStep = Math.max(0, barQuantize - 1)

        for (let step = 0; step < barQuantize; step++) {
            const absoluteStep = lastBar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) continue
            
            const progress = lastStep === 0 ? 1 : step / lastStep
            const velocity = (config.minVelocity ?? 0.3) + ((config.maxVelocity ?? 1) - (config.minVelocity ?? 0.3)) * progress

            this.addSnareNote(
                snareTrack,
                lastBar,
                step,
                this.computeSnareVelocity(config.velocity, {
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
                if (step >= barQuantize || Math.random() >= config.density) {
                    return
                }
                
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) return

                this.addSnareNote(
                    snareTrack,
                    bar,
                    step,
                    this.computeSnareVelocity(config.velocity, {
                        step,
                        accent: step === 0 || step === snareTrack.barQuantize - 1,
                        ghost: step !== 0
                    })
                )
            })
        }
    }

    addSnareNote = (track, bar, barStep, velocity = 0.8) => {
        const note = MfGlobals.mfCmd.addNote(track, bar, barStep, 0)
        note.velocity = velocity
        return note
    }

    clearTrackNotes = (track) => {
        track.notes = []
    }

    computeSnareVelocity = (velocityConfig = {}, context = {}) => {
        const base = context.velocityBase ?? velocityConfig.base ?? 0.75
        const accent = context.accent ? (velocityConfig.accentOnBeat ?? 0) : 0
        const ghost = context.ghost ? (velocityConfig.ghost ?? 0) : 0
        const randomSpread = velocityConfig.randomSpread ?? 0
        const randomOffset = (Math.random() * 2 - 1) * randomSpread
        const min = velocityConfig.clampMin ?? 0.25
        const max = velocityConfig.clampMax ?? 1
        return Math.min(max, Math.max(min, base + accent + ghost + randomOffset)).toFixed(2)
    }

    applySnareLoopPoint = (snareTrack, config) => {
        const loopPointBar = config.loopPointBar ?? snareTrack.bars ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        snareTrack.loopPointBar = loopPointBar
        snareTrack.loopPointStep = loopPointStep
        snareTrack.loopAtStep = loopPointBar * snareTrack.barQuantize + loopPointStep
    }

    isRequiredStep = (bar, step, requiredSteps = []) => {
        return requiredSteps.some((requiredStep) => {
            const barMatches = requiredStep.barModulo === undefined || bar % requiredStep.barModulo === requiredStep.barModulo - 1
            return barMatches && requiredStep.step === step
        })
    }

    getRndSnareVariantName = () => {
        const variants = Object.keys(MfSnareGenerate.SNARE_GENERATION_CONFIGS)
        return variants[Math.floor(Math.random() * variants.length)] ?? 'basic'
    }

    resolveSnareVariantName = (variantName) => {
        if (variantName && MfSnareGenerate.SNARE_GENERATION_CONFIGS[variantName]) {
            return variantName
        }
        return this.getRndSnareVariantName()
    }

    traceSnareGeneration = (variantName, config, snareTrack) => {
        const parts = [
            `SNARE[${variantName}]`,
            `mode=${config.mode}`,
            `bars=${snareTrack?.bars ?? '?'}`,
            `steps=${snareTrack?.barQuantize ?? '?'}`,
            `vel=${this.formatCompactVelocity(config.velocity ?? {})}`,
            `loop=${config.loopPointBar}:${config.loopPointStep ?? 0}`
        ]

        if (Array.isArray(config.phrases)) {
            parts.push(`phr=${config.phrases.length}`)
        }
        if (Array.isArray(config.probabilities)) {
            parts.push(`prob=${config.probabilities.join('/')}`)
        }
        if (typeof config.density === 'number') {
            parts.push(`dens=${config.density}`)
        }

        console.log(parts.join(" | "))
    }

    formatCompactVelocity = (velocityConfig) => {
        const segments = [
            `b${velocityConfig.base ?? 0.75}`
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
        segments.push(`c${velocityConfig.clampMin ?? 0.25}-${velocityConfig.clampMax ?? 1}`)
        return segments.join(',')
    }

    displayDebugNotes = (track) => {
        let ret = `${track.name}=`
        Object.values(track.notes).forEach((note) => {
            ret += `SN: ${note.bar}:${note.barStep} V=${note.velocity} - `
        })
        console.log(ret)
    }
}
