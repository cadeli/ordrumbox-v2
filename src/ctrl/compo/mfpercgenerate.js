import { MfGlobals } from '../../mfglobals.js'

export default class MfPercGenerate {
    static PERC_GENERATION_CONFIGS = Object.freeze({
        basic: {
            mode: 'phrases',
            scaleName: 'pentatonic minor',
            loopPointBar: 4,
            loopPointStep: 0,
            phrases: [
                { bar: 0, step: 3, source: 'randomScale' },
                { bar: 1, step: 2, source: 'reuse', reuseIndex: 0 },
                { bar: 2, step: 'random', source: 'randomScale' },
                { bar: 3, step: 3, source: 'root' }
            ],
            velocity: {
                base: 0.62,
                accentOnBeat: 0.18,
                variationBoost: 0.08,
                randomSpread: 0.1,
                clampMin: 0.28,
                clampMax: 0.95
            }
        },
        conversation: {
            mode: 'callResponse',
            scaleName: 'dorian',
            loopPointBar: 4,
            loopPointStep: 0,
            callSteps: [0, 2],
            responseSteps: [1, 3],
            density: 0.64,
            velocity: {
                base: 0.58,
                accentOnBeat: 0.14,
                variationBoost: 0.1,
                randomSpread: 0.12,
                clampMin: 0.25,
                clampMax: 0.92
            }
        },
        sparse: {
            mode: 'grid',
            scaleName: 'minor pentatonic',
            loopPointBar: 2,
            loopPointStep: 0,
            probabilities: [0.16, 0.08, 0.22, 0.34],
            velocity: {
                base: 0.64,
                accentOnBeat: 0.12,
                variationBoost: 0.06,
                randomSpread: 0.08,
                clampMin: 0.3,
                clampMax: 0.88
            }
        },
        fill: {
            mode: 'fill',
            scaleName: 'blues scale',
            loopPointBar: 4,
            loopPointStep: 0,
            startBarOffset: 1,
            steps: [0, 1, 2, 3],
            velocity: {
                base: 0.6,
                accentOnBeat: 0.24,
                variationBoost: 0.12,
                randomSpread: 0.12,
                clampMin: 0.3,
                clampMax: 1
            }
        }
    })

    generateNewPerc = (percTrack, variantName = null, variantSubName=null) => {
        if (variantName === 'break') return

        const resolvedVariantName = this.resolvePercVariantName(variantName)
        const config = MfPercGenerate.PERC_GENERATION_CONFIGS[resolvedVariantName] ?? MfPercGenerate.PERC_GENERATION_CONFIGS.basic
        const tones = this.getScaleSteps(config.scaleName)
        const pitchBias = this.getTrackPitchBias(percTrack)

        this.tracePercGeneration(resolvedVariantName, config, percTrack)
        this.clearTrackNotes(percTrack)

        switch (config.mode) {
            case 'grid':
                this.generatePercGridVariant(percTrack, tones, pitchBias, config)
                break
            case 'callResponse':
                this.generatePercCallResponseVariant(percTrack, tones, pitchBias, config)
                break
            case 'fill':
                this.generatePercFillVariant(percTrack, tones, pitchBias, config)
                break
            case 'phrases':
            default:
                this.generatePercPhraseVariant(percTrack, tones, pitchBias, config)
                break
        }

        this.applyPercLoopPoint(percTrack, config)
        this.displayDebugNotes(percTrack)
    }

    generatePercPhraseVariant = (percTrack, tones, pitchBias, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = percTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        const cachedPitches = []
        config.phrases.forEach((phrase) => {
            const step = phrase.step === 'random'
                ? Math.floor(Math.random() * barQuantize)
                : phrase.step
            
            const absoluteStep = phrase.bar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) return
            
            const pitch = this.resolvePercPitch(phrase, tones, cachedPitches, pitchBias)

            this.addPercNote(
                percTrack,
                phrase.bar,
                step,
                pitch,
                this.computePercVelocity(config.velocity, {
                    step,
                    strongBeat: step === 0,
                    isVariation: phrase.source !== 'root'
                })
            )
            cachedPitches.push(pitch)
        })
    }

    generatePercGridVariant = (percTrack, tones, pitchBias, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = percTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        for (let bar = 0; bar < (percTrack.bars ?? 1); bar++) {
            for (let step = 0; step < barQuantize; step++) {
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) continue
                
                const probability = config.probabilities?.[step % config.probabilities.length] ?? 0
                if (Math.random() >= probability) {
                    continue
                }

                const pitch = this.getRndTone(tones) + pitchBias
                this.addPercNote(
                    percTrack,
                    bar,
                    step,
                    pitch,
                    this.computePercVelocity(config.velocity, {
                        step,
                        strongBeat: step === 0,
                        isVariation: pitch !== pitchBias
                    })
                )
            }
        }
    }

    generatePercCallResponseVariant = (percTrack, tones, pitchBias, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = percTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        for (let bar = 0; bar < (percTrack.bars ?? 1); bar++) {
            const steps = bar % 2 === 0 ? config.callSteps : config.responseSteps
            steps.forEach((step) => {
                if (step >= barQuantize || Math.random() >= config.density) {
                    return
                }
                
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) return

                const pitch = this.getRndTone(tones) + pitchBias
                this.addPercNote(
                    percTrack,
                    bar,
                    step,
                    pitch,
                    this.computePercVelocity(config.velocity, {
                        step,
                        strongBeat: step === 0,
                        isVariation: true
                    })
                )
            })
        }
    }

    generatePercFillVariant = (percTrack, tones, pitchBias, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = percTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        const startBar = Math.max(0, (percTrack.bars ?? 1) - (config.startBarOffset ?? 1))
        config.steps.forEach((step, index) => {
            if (step >= barQuantize) {
                return
            }
            
            const absoluteStep = startBar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) return

            const tone = tones[index % tones.length] ?? 0
            const pitch = tone + pitchBias
            this.addPercNote(
                percTrack,
                startBar,
                step,
                pitch,
                this.computePercVelocity(config.velocity, {
                    step,
                    strongBeat: step === 0,
                    isVariation: index > 0
                })
            )
        })
    }

    resolvePercPitch = (phrase, tones, cachedPitches, pitchBias) => {
        if (typeof phrase.pitch === 'number') {
            return phrase.pitch + pitchBias
        }
        if (phrase.source === 'reuse' && typeof phrase.reuseIndex === 'number') {
            return cachedPitches[phrase.reuseIndex] ?? pitchBias
        }
        if (phrase.source === 'root') {
            return pitchBias
        }
        return this.getRndTone(tones) + pitchBias
    }

    getScaleSteps = (scaleName) => {
        return MfGlobals.scales[scaleName]?.scaleSteps
            ?? MfGlobals.scales["pentatonic minor"]?.scaleSteps
            ?? MfGlobals.scales["major"]?.scaleSteps
            ?? [0, 2, 3, 5, 7, 10]
    }

    getRndTone = (tones) => {
        const tone = tones[Math.floor(Math.random() * tones.length)] ?? 0
        return tone > 6 ? tone - 12 : tone
    }

    getTrackPitchBias = (track) => {
        const trackName = String(track?.name ?? '').toUpperCase()
        if (trackName.includes('HCONG') || trackName.includes('HTOM') || trackName.includes('HIGH')) {
            return 5
        }
        if (trackName.includes('LCONG') || trackName.includes('LTOM') || trackName.includes('LOW')) {
            return -5
        }
        if (trackName.includes('CONG')) {
            return 2
        }
        return 0
    }

    addPercNote = (track, bar, barStep, pitch, velocity = 0.65) => {
        const note = MfGlobals.mfCmd.addNote(track, bar, barStep, pitch)
        note.velocity = velocity.toFixed(2)
        return note
    }

    clearTrackNotes = (track) => {
        track.notes = []
    }

    computePercVelocity = (velocityConfig = {}, context = {}) => {
        const base = velocityConfig.base ?? 0.62
        const accentOnBeat = context.strongBeat ? (velocityConfig.accentOnBeat ?? 0) : 0
        const variationBoost = context.isVariation ? (velocityConfig.variationBoost ?? 0) : 0
        const randomSpread = velocityConfig.randomSpread ?? 0
        const randomOffset = (Math.random() * 2 - 1) * randomSpread
        const min = velocityConfig.clampMin ?? 0.25
        const max = velocityConfig.clampMax ?? 1
        return Math.min(max, Math.max(min, base + accentOnBeat + variationBoost + randomOffset))
    }

    applyPercLoopPoint = (percTrack, config) => {
        const loopPointBar = config.loopPointBar ?? percTrack.bars ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        percTrack.loopPointBar = loopPointBar
        percTrack.loopPointStep = loopPointStep
        percTrack.loopAtStep = loopPointBar * percTrack.barQuantize + loopPointStep
    }

    getRndPercVariantName = () => {
        const variants = Object.keys(MfPercGenerate.PERC_GENERATION_CONFIGS).filter((variantName) => variantName !== 'fill')
        return variants[Math.floor(Math.random() * variants.length)] ?? 'basic'
    }

    resolvePercVariantName = (variantName) => {
        if (variantName && MfPercGenerate.PERC_GENERATION_CONFIGS[variantName]) {
            return variantName
        }
        return this.getRndPercVariantName()
    }

    tracePercGeneration = (variantName, config, percTrack) => {
        const parts = [
            `PERC[${variantName}]`,
            `mode=${config.mode}`,
            `scale=${config.scaleName}`,
            `bars=${percTrack?.bars ?? '?'}`,
            `steps=${percTrack?.barQuantize ?? '?'}`,
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
            `b${velocityConfig.base ?? 0.62}`
        ]
        if (typeof velocityConfig.accentOnBeat === 'number') {
            segments.push(`a${velocityConfig.accentOnBeat}`)
        }
        if (typeof velocityConfig.variationBoost === 'number') {
            segments.push(`v${velocityConfig.variationBoost}`)
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
            ret += `PC: ${note.bar}:${note.barStep} P=${note.pitch} V=${note.velocity} - `
        })
        console.log(ret)
    }
}
