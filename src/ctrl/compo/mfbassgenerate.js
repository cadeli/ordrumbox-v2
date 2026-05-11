import { MfGlobals } from '../../mfglobals.js'

export default class MfBassGenerate {
    static BASS_GENERATION_CONFIGS = Object.freeze({
        basic: {
            mode: 'phrases',
            scaleName: 'pentatonic minor',
            loopPointBar: 4,
            loopPointStep: 0,
            phrases: [
                { bar: 0, step: 0, source: 'randomScale' },
                { bar: 1, step: 'random', pitch: 0 },
                { bar: 2, step: 0, source: 'randomScale' },
                { bar: 3, step: 0, source: 'reuse', reuseIndex: 0 },
                { bar: 3, step: 'random', source: 'reuse', reuseIndex: 0 }
            ],
            velocity: {
                base: 0.72,
                accentOnBeat: 0.18,
                randomSpread: 0.08,
                clampMin: 0.45,
                clampMax: 0.98
            }
        },
        stepping: {
            mode: 'stepGrid',
            scaleName: 'major',
            bar: 0,
            probabilities: [0.7, 0.7, 0.6, 0.7],
            loopPointBar: 1,
            loopPointStep: 0,
            velocity: {
                base: 0.68,
                accentPattern: [0.22, -0.08, 0.05, -0.02],
                randomSpread: 0.06,
                clampMin: 0.4,
                clampMax: 0.95
            }
        },
        groove: {
            mode: 'groove',
            scaleName: 'blues scale',
            rootPattern: [0, 5, 7],
            density: 0.,
            variation: 0.15,
            strongBeatIntervals: [0, 7],
            strongBeatWeight: 0.75,
            maxLeap: 7,
            loopPointBar: 4,
            loopPointStep: 0,
            velocity: {
                base: 0.7,
                accentOnBeat: 0.16,
                variationBoost: 0.08,
                randomSpread: 0.1,
                clampMin: 0.42,
                clampMax: 1
            }
        },
        melodic: {
            mode: 'groove',
            scaleName: 'natural minor',
            rootPattern: [0, 3, 5, 7],
            density: 0.42,
            variation: 0.32,
            strongBeatIntervals: [0, 3],
            strongBeatWeight: 0.62,
            maxLeap: 5,
            loopPointBar: 4,
            loopPointStep: 0,
            velocity: {
                base: 0.76,
                accentOnBeat: 0.12,
                variationBoost: 0.12,
                randomSpread: 0.09,
                clampMin: 0.48,
                clampMax: 1
            }
        },
        hypnotic: {
            mode: 'phrases',
            scaleName: 'dorian',
            loopPointBar: 2,
            loopPointStep: 0,
            phrases: [
                { bar: 0, step: 0, pitch: 0 },
                { bar: 0, step: 2, source: 'randomScale' },
                { bar: 1, step: 0, source: 'reuse', reuseIndex: 1 },
                { bar: 1, step: 3, pitch: 0 },
                { bar: 2, step: 0, source: 'reuse', reuseIndex: 0 },
                { bar: 2, step: 2, source: 'reuse', reuseIndex: 1 },
                { bar: 3, step: 0, source: 'reuse', reuseIndex: 1 },
                { bar: 3, step: 2, source: 'reuse', reuseIndex: 0 }
            ],
            velocity: {
                base: 0.66,
                accentOnBeat: 0.1,
                randomSpread: 0.04,
                clampMin: 0.52,
                clampMax: 0.84
            }
        },
        arpege: {
            mode: 'arpeggio',
            scaleName: 'pentatonic minor',
            rootPattern: [0, 3, 5, 7],
            contour: 'updown',
            noteSpacing: 4,
            spacingJitter: 1,
            phraseLength: 6,
            startDegree: 0,
            loopPointBar: 4,
            loopPointStep: 0,
            velocity: {
                base: 0.74,
                accentOnBeat: 0.14,
                variationBoost: 0.06,
                randomSpread: 0.05,
                clampMin: 0.5,
                clampMax: 0.94
            }
        }
    })


    constructor() {
        this.isScalesLoading = false
    }

   loadScales = () => {
        if (this.isScalesLoading || !MfGlobals.mfResourcesLoader) {
            return
        }
        this.isScalesLoading = true
        console.log("MfAutoGenerate::loadScales")
        MfGlobals.mfResourcesLoader.loadScales(MfGlobals.urlscales, this.checkResources)
        console.log(MfGlobals.scales)
  }

    checkResources = () => {
        this.isScalesLoading = false
        console.log("MfAutoGenerate::checkResources")
        console.log("scales")
        console.log(MfGlobals.scales)
    }

    generateNewBass = (bassTrack, variantName = null, variantSubName=null) => {
        if (variantName === 'break') return

        const resolvedVariantName = this.resolveBassVariantName(variantName)
        const config = MfBassGenerate.BASS_GENERATION_CONFIGS[resolvedVariantName] ?? MfBassGenerate.BASS_GENERATION_CONFIGS.basic
        const tones = this.getScaleSteps(config.scaleName)
        this.traceBassGeneration(resolvedVariantName, config, bassTrack)

        this.clearTrackNotes(bassTrack)
        switch (config.mode) {
            case 'stepGrid':
                this.generateBassStepGridVariant(bassTrack, tones, config)
                break
            case 'groove':
                this.generateBassGrooveVariant(bassTrack, tones, config)
                break
            case 'arpeggio':
                this.generateBassArpeggioVariant( bassTrack, tones, config)
                break
            case 'phrases':
            default:
                this.generateBassPhraseVariant(bassTrack, tones, config)
                break
        }
        this.applyBassLoopPoint(bassTrack, config)
        this.displayDebugNotes(bassTrack)
    }

    generateBassPhraseVariant = (bassTrack, tones, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = bassTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        const cachedPitches = []
        config.phrases.forEach((phrase) => {
            const pitch = this.resolveBassPitch(phrase, tones, cachedPitches)
            const step = phrase.step === 'random'
                ? Math.floor(Math.random() * barQuantize)
                : phrase.step
            
            const absoluteStep = phrase.bar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) return
            
            this.addBassNote(
                bassTrack,
                phrase.bar,
                step,
                pitch,
                this.computeBassVelocity(config.velocity, {
                    step,
                    bar: phrase.bar,
                    strongBeat: step % 4 === 0
                })
            )
            cachedPitches.push(pitch)
        })
    }

    generateBassStepGridVariant = (bassTrack, tones, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = bassTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        const bar = config.bar ?? 0
        
        const generatedTones = [
            tones[0],
            this.getRndTone(tones),
            this.getRndTone(tones),
            this.getRndTone(tones)
        ]

        config.probabilities.forEach((probability, step) => {
            const absoluteStep = bar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) return
            
            if (Math.random() < probability) {
                this.addBassNote(
                    bassTrack,
                    bar,
                    step,
                    generatedTones[step],
                    this.computeBassVelocity(config.velocity, {
                        step,
                        bar: bar,
                        accent: config.velocity?.accentPattern?.[step] ?? 0,
                        strongBeat: step % 4 === 0
                    })
                )
            }
        })
    }

    generateBassGrooveVariant = ( bassTrack, scale, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = bassTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        const rootPattern = config.rootPattern

        for (let bar = 0; bar < (bassTrack.bars ?? 1); bar++) {
            const rootPitch = rootPattern[bar % rootPattern.length]
            let lastStepNote = rootPitch
            for (let step = 0; step < barQuantize; step++) {
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) continue
                
                const strongBeat = step === 0
                const playNote = strongBeat || Math.random() < config.density
                if (!playNote) {
                    continue
                }

                let notePitch = rootPitch
                let isVariation = false
                if (strongBeat || Math.random() > config.variation) {
                    const interval = Math.random() < config.strongBeatWeight
                        ? config.strongBeatIntervals[0]
                        : config.strongBeatIntervals[1]
                    notePitch = rootPitch + interval
                } else {
                    const degree = scale[Math.floor(Math.random() * scale.length)]
                    notePitch = rootPitch + degree
                    isVariation = true
                    if (Math.abs(notePitch - lastStepNote) > config.maxLeap) {
                        notePitch = rootPitch
                        isVariation = false
                    }
                }

                lastStepNote = notePitch
                this.addBassNote(
                    bassTrack,
                    bar,
                    step,
                    notePitch,
                    this.computeBassVelocity(config.velocity, {
                        step,
                        bar,
                        strongBeat,
                        isVariation
                    })
                )
            }
        }
    }

    generateBassArpeggioVariant = ( bassTrack, scale, config) => {
        const loopPointBar = config.loopPointBar ?? 2
        const loopPointStep = config.loopPointStep ?? 0
        const barQuantize = bassTrack.barQuantize ?? 4
        const loopPointAbsolute = loopPointBar * barQuantize + loopPointStep
        
        const rootPattern = config.rootPattern ?? [0]
        const phraseLength = Math.max(2, config.phraseLength ?? scale.length)
        const contour = config.contour ?? 'updown'
        const contourSequence = this.buildArpeggioContour(scale, phraseLength, contour, config.startDegree ?? 0)
        const averageSpacing = Math.max(1, config.noteSpacing ?? 2)
        const spacingJitter = Math.max(0, config.spacingJitter ?? 0)

        for (let bar = 0; bar < (bassTrack.bars ?? 1); bar++) {
            const rootPitch = rootPattern[bar % rootPattern.length]
            let step = 0
            let noteIndex = 0

            while (step < barQuantize) {
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) break
                
                const degree = contourSequence[noteIndex % contourSequence.length] ?? 0
                const pitch = rootPitch + degree
                this.addBassNote(
                    bassTrack,
                    bar,
                    step,
                    pitch,
                    this.computeBassVelocity(config.velocity, {
                        step,
                        bar,
                        strongBeat: step % 4 === 0,
                        isVariation: noteIndex % contourSequence.length !== 0
                    })
                )

                noteIndex += 1
                step += this.getArpeggioStepAdvance(averageSpacing, spacingJitter)
            }
        }
    }

    resolveBassPitch = (phrase, tones, cachedPitches) => {
        if (typeof phrase.pitch === 'number') {
            return phrase.pitch
        }
        if (phrase.source === 'reuse' && typeof phrase.reuseIndex === 'number') {
            return cachedPitches[phrase.reuseIndex] ?? 0
        }
        return this.getRndTone(tones)
    }

    getScaleSteps = (scaleName) => {
        return MfGlobals.scales[scaleName]?.scaleSteps ?? MfGlobals.scales["major"]?.scaleSteps ?? [0, 2, 4, 5, 7, 9, 11]
    }

  

    addBassNote = (track, bar, barStep, pitch, velocity = 0.8) => {
        const note = MfGlobals.mfCmd.addNote(track, bar, barStep, pitch)
        note.velocity = velocity
        return note
    }

    clearTrackNotes = (track) => {
        track.notes = []
    }

    computeBassVelocity = (velocityConfig = {}, context = {}) => {
        const base = velocityConfig.base ?? 0.75
        const accentOnBeat = context.strongBeat ? (velocityConfig.accentOnBeat ?? 0) : 0
        const accent = context.accent ?? 0
        const variationBoost = context.isVariation ? (velocityConfig.variationBoost ?? 0) : 0
        const randomSpread = velocityConfig.randomSpread ?? 0
        const randomOffset = (Math.random() * 2 - 1) * randomSpread
        const min = velocityConfig.clampMin ?? 0.35
        const max = velocityConfig.clampMax ?? 1
        return Math.min(max, Math.max(min, base + accentOnBeat + accent + variationBoost + randomOffset)).toFixed(2)
    }

    applyBassLoopPoint = (bassTrack, config) => {
        const loopPointBar = config.loopPointBar  ?? bassTrack.bars ?? 1
        const loopPointStep = config.loopPointStep ?? 0
        bassTrack.loopPointBar = loopPointBar
        bassTrack.loopPointStep = loopPointStep
        bassTrack.loopAtStep = loopPointBar * bassTrack.barQuantize + loopPointStep
    }

    getRndBassVariantName = () => {
        const variants = Object.keys(MfBassGenerate.BASS_GENERATION_CONFIGS)
        return variants[Math.floor(Math.random() * variants.length)] ?? 'basic'
    }

    resolveBassVariantName = (variantName) => {
        if (variantName && MfBassGenerate.BASS_GENERATION_CONFIGS[variantName]) {
            return variantName
        }
        return this.getRndBassVariantName()
    }

    buildArpeggioContour = (scale, phraseLength, contour, startDegree) => {
        const normalizedScale = Array.isArray(scale) && scale.length > 0 ? scale : [0]
        const startIndex = Math.max(0, Math.min(startDegree, normalizedScale.length - 1))
        const sequence = []
        let index = startIndex
        let direction = 1

        for (let i = 0; i < phraseLength; i++) {
            sequence.push(normalizedScale[index])
            if (contour === 'up') {
                index = (index + 1) % normalizedScale.length
                continue
            }
            if (contour === 'down') {
                index = (index - 1 + normalizedScale.length) % normalizedScale.length
                continue
            }

            if (normalizedScale.length === 1) {
                continue
            }

            const nextIndex = index + direction
            if (nextIndex >= normalizedScale.length || nextIndex < 0) {
                direction *= -1
                index += direction
            } else {
                index = nextIndex
            }
        }

        return sequence
    }

    getArpeggioStepAdvance = (averageSpacing, spacingJitter) => {
        if (spacingJitter <= 0) {
            return averageSpacing
        }
        const choices = [averageSpacing]
        if (averageSpacing - spacingJitter >= 1) {
            choices.push(averageSpacing - spacingJitter)
        }
        choices.push(averageSpacing + spacingJitter)
        return choices[Math.floor(Math.random() * choices.length)] ?? averageSpacing
    }

    traceBassGeneration = (variantName, config, bassTrack) => {
        const parts = [
            `BASS[${variantName}]`,
            `mode=${config.mode}`,
            `scale=${config.scaleName}`,
            `bars=${ bassTrack?.bars ?? '?'}`,
            `steps=${bassTrack?.barQuantize ?? '?'}`
        ]

        if (Array.isArray(config.rootPattern)) {
            parts.push(`root=${config.rootPattern.join('/')}`)
        }
        if (Array.isArray(config.probabilities)) {
            parts.push(`prob=${config.probabilities.join('/')}`)
        }
        if (Array.isArray(config.phrases)) {
            parts.push(`phr=${config.phrases.length}`)
        }
        if (typeof config.density === 'number') {
            parts.push(`dens=${config.density}`)
        }
        if (typeof config.variation === 'number') {
            parts.push(`var=${config.variation}`)
        }
        if (typeof config.maxLeap === 'number') {
            parts.push(`leap=${config.maxLeap}`)
        }
        if (typeof config.noteSpacing === 'number') {
            parts.push(`spc=${config.noteSpacing}`)
        }
        if (typeof config.spacingJitter === 'number') {
            parts.push(`jit=${config.spacingJitter}`)
        }
        if (typeof config.phraseLength === 'number') {
            parts.push(`len=${config.phraseLength}`)
        }
        if (typeof config.contour === 'string') {
            parts.push(`ctr=${config.contour}`)
        }

        const velocity = config.velocity ?? {}
        parts.push(
            `vel=${this.formatCompactVelocity(velocity)}`,
            `loop=${config.loopPointBar }:${config.loopPointStep ?? 0}`
        )

        console.log(parts.join(" | "))
    }

    formatCompactVelocity = (velocityConfig) => {
        const segments = [
            `b${velocityConfig.base ?? 0.75}`
        ]
        if (typeof velocityConfig.accentOnBeat === 'number') {
            segments.push(`a${velocityConfig.accentOnBeat}`)
        }
        if (Array.isArray(velocityConfig.accentPattern)) {
            segments.push(`ap${velocityConfig.accentPattern.join('/')}`)
        }
        if (typeof velocityConfig.variationBoost === 'number') {
            segments.push(`v${velocityConfig.variationBoost}`)
        }
        if (typeof velocityConfig.randomSpread === 'number') {
            segments.push(`r${velocityConfig.randomSpread}`)
        }
        segments.push(`c${velocityConfig.clampMin ?? 0.35}-${velocityConfig.clampMax ?? 1}`)
        return segments.join(',')
    }

    getRndTone = (tones) => {
        let nb = Math.floor(Math.random() * tones.length)
        let tone = tones[nb]
        if (tone > 5) { tone -= 12 }
        return tone
    }

    displayDebugNotes = (track) => {
        let ret = "" + track.name + "="
        Object.values(track.notes).forEach((note, indexTrack) => {
            ret += "BS: " + note.bar + ":" + note.barStep + " P=" + note.pitch + " - "
        })
        console.log(ret)
    }
}
