import { MfGlobals } from '../../mfglobals.js'

export default class MfKickGenerate {
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

    generateNewKick = (kickTrack, variantName = null, variantSubName=null) => {
        if (variantName === 'outro') return

        const resolvedVariantName = this.resolveKickVariantName(variantName)
        const config = MfKickGenerate.KICK_GENERATION_CONFIGS[resolvedVariantName] ?? MfKickGenerate.KICK_GENERATION_CONFIGS.basic

        this.traceKickGeneration(resolvedVariantName, config, kickTrack)
        this.clearTrackNotes(kickTrack)

        switch (config.mode) {
            case 'grid':
                this.generateKickGridVariant(kickTrack, config)
                break
            case 'break':
                this.generateKickBreakVariant(kickTrack, config)
                break
            case 'phrases':
            default:
                this.generateKickPhraseVariant(kickTrack, config)
                break
        }

        this.applyKickLoopPoint(kickTrack, config)
        this.displayDebugNotes(kickTrack)
    }

    generateKickPhraseVariant = (kickTrack, config) => {
        config.phrases.forEach((phrase) => {
            const step = phrase.step === 'random'
                ? Math.floor(Math.random() * kickTrack.barQuantize)
                : phrase.step

            this.addKickNote(
                kickTrack,
                phrase.bar,
                step,
                this.computeKickVelocity(config.velocity, {
                    step,
                    accent: phrase.accent === true || step === 0,
                    ghost: phrase.ghost === true
                })
            )
        })
    }

    generateKickGridVariant = (kickTrack, config) => {
        const loopPointBar = config.loopPointBar ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = kickTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        for (let bar = 0; bar < (kickTrack.bars ?? 1); bar++) {
            for (let step = 0; step < barQuantize; step++) {
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) continue
                
                const probability = config.probabilities?.[step % config.probabilities.length] ?? 0
                if (Math.random() >= probability) {
                    continue
                }

                this.addKickNote(
                    kickTrack,
                    bar,
                    step,
                    this.computeKickVelocity(config.velocity, {
                        step,
                        accent: step === 0,
                        ghost: step !== 0
                    })
                )
            }
        }
    }

    generateKickBreakVariant = (kickTrack, config) => {
        const loopPointBar = config.loopPointBar ?? 4
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = kickTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        for (let bar = 0; bar < kickTrack.bars; bar++) {
            const absoluteStep = bar * barQuantize + 0
            if (absoluteStep >= loopPointAbsolute) continue
            this.addKickNote(kickTrack, bar, 0, 1)
        }
    }

    addKickNote = (track, bar, barStep, velocity = 0.9) => {
        const note = MfGlobals.mfCmd.addNote(track, bar, barStep, 0)
        note.velocity = velocity.toFixed(2)
        return note
    }

    clearTrackNotes = (track) => {
        track.notes = []
    }

    computeKickVelocity = (velocityConfig = {}, context = {}) => {
        const base = velocityConfig.base ?? 0.85
        const accent = context.accent ? (velocityConfig.accentOnBeat ?? 0) : 0
        const ghost = context.ghost ? (velocityConfig.ghost ?? 0) : 0
        const randomSpread = velocityConfig.randomSpread ?? 0
        const randomOffset = (Math.random() * 2 - 1) * randomSpread
        const min = velocityConfig.clampMin ?? 0.35
        const max = velocityConfig.clampMax ?? 1
        return Math.min(max, Math.max(min, base + accent + ghost + randomOffset))
    }

    applyKickLoopPoint = (kickTrack, config) => {
        const loopPointBar = config.loopPointBar ?? kickTrack.bars ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        kickTrack.loopPointBar = loopPointBar
        kickTrack.loopPointStep = loopPointStep
        kickTrack.loopAtStep = loopPointBar * kickTrack.barQuantize + loopPointStep
    }

    getRndKickVariantName = () => {
        const variants = Object.keys(MfKickGenerate.KICK_GENERATION_CONFIGS).filter((variantName) => variantName !== 'break')
        return variants[Math.floor(Math.random() * variants.length)] ?? 'basic'
    }

    resolveKickVariantName = (variantName) => {
        if (variantName && MfKickGenerate.KICK_GENERATION_CONFIGS[variantName]) {
            return variantName
        }
        return this.getRndKickVariantName()
    }

    traceKickGeneration = (variantName, config, kickTrack) => {
        const parts = [
            `KICK[${variantName}]`,
            `mode=${config.mode}`,
            `bars=${kickTrack?.bars ?? '?'}`,
            `steps=${kickTrack?.barQuantize ?? '?'}`,
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
            `b${velocityConfig.base ?? 0.85}`
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
        segments.push(`c${velocityConfig.clampMin ?? 0.35}-${velocityConfig.clampMax ?? 1}`)
        return segments.join(',')
    }

    displayDebugNotes = (track) => {
        let ret = `${track.name}=`
        Object.values(track.notes).forEach((note) => {
            ret += `KD: ${note.bar}:${note.barStep} V=${note.velocity} - `
        })
        console.log(ret)
    }
}
