import BaseGenerator from './base_generator.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import MfResourcesLoader from '../../loader/resources_loader.js'

export default class MfBassGenerate extends BaseGenerator {
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
        super('BASS', MfBassGenerate.BASS_GENERATION_CONFIGS)
        this._toneThreshold = 5
        this.isScalesLoading = false
    }

    loadScales = () => {
        if (this.isScalesLoading || !serviceRegistry.mfResourcesLoader) return
        this.isScalesLoading = true
        console.log("MfAutoGenerate::loadScales")
        serviceRegistry.mfResourcesLoader.loadScales(MfResourcesLoader.SCALES_URL, this.checkResources)
        console.log(soundRegistry.scales)
    }

    checkResources = () => {
        this.isScalesLoading = false
     }

    generateNewBass = (bassTrack, variantName = null, variantSubName = null) => {
        if (variantName === 'break') return

        const resolvedVariantName = this.resolveVariantName(variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.basic
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
                this.generateBassArpeggioVariant(bassTrack, tones, config)
                break
            case 'phrases':
            default:
                this.generateBassPhraseVariant(bassTrack, tones, config)
                break
        }

        this.applyLoopPoint(bassTrack, config)
       // this.displayDebugNotes(bassTrack, 'BS')
    }

    generateBassPhraseVariant = (bassTrack, tones, config) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(bassTrack, config, 2)
        const barQuantize = bassTrack.barQuantize ?? 4

        const cachedPitches = []
        config.phrases.forEach((phrase) => {
            const pitch = this.resolvePhrasePitch(phrase, tones, cachedPitches)
            const step = phrase.step === 'random'
                ? Math.floor(Math.random() * barQuantize)
                : phrase.step

            const absoluteStep = phrase.bar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) return

            this.addNote(
                bassTrack,
                phrase.bar,
                step,
                pitch,
                this.computeVelocity(config.velocity, {
                    step,
                    accent: step % 4 === 0
                })
            )
            cachedPitches.push(pitch)
        })
    }

    generateBassStepGridVariant = (bassTrack, tones, config) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(bassTrack, config, 2)
        const barQuantize = bassTrack.barQuantize ?? 4
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
                this.addNote(
                    bassTrack,
                    bar,
                    step,
                    generatedTones[step],
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: config.velocity?.accentPattern?.[step] ?? 0,
                        toFixed: false
                    })
                )
            }
        })
    }

    generateBassGrooveVariant = (bassTrack, scale, config) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(bassTrack, config, 2)
        const barQuantize = bassTrack.barQuantize ?? 4

        const rootPattern = config.rootPattern

        for (let bar = 0; bar < (bassTrack.bars ?? 1); bar++) {
            const rootPitch = rootPattern[bar % rootPattern.length]
            let lastStepNote = rootPitch
            for (let step = 0; step < barQuantize; step++) {
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) continue

                const strongBeat = step === 0
                const playNote = strongBeat || Math.random() < config.density
                if (!playNote) continue

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
                this.addNote(
                    bassTrack,
                    bar,
                    step,
                    notePitch,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: strongBeat,
                        isVariation
                    })
                )
            }
        }
    }

    generateBassArpeggioVariant = (bassTrack, scale, config) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(bassTrack, config, 2)
        const barQuantize = bassTrack.barQuantize ?? 4

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
                this.addNote(
                    bassTrack,
                    bar,
                    step,
                    pitch,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: step % 4 === 0,
                        isVariation: noteIndex % contourSequence.length !== 0
                    })
                )

                noteIndex += 1
                step += this.getArpeggioStepAdvance(averageSpacing, spacingJitter)
            }
        }
    }

    traceBassGeneration = (variantName, config, bassTrack) => {
        const extraParts = []
        if (Array.isArray(config.rootPattern)) {
            extraParts.push(`root=${config.rootPattern.join('/')}`)
        }
        if (typeof config.density === 'number') {
            extraParts.push(`dens=${config.density}`)
        }
        if (typeof config.variation === 'number') {
            extraParts.push(`var=${config.variation}`)
        }
        if (typeof config.maxLeap === 'number') {
            extraParts.push(`leap=${config.maxLeap}`)
        }
        if (typeof config.noteSpacing === 'number') {
            extraParts.push(`spc=${config.noteSpacing}`)
        }
        if (typeof config.spacingJitter === 'number') {
            extraParts.push(`jit=${config.spacingJitter}`)
        }
        if (typeof config.phraseLength === 'number') {
            extraParts.push(`len=${config.phraseLength}`)
        }
        if (typeof config.contour === 'string') {
            extraParts.push(`ctr=${config.contour}`)
        }
        // this.traceGeneration(variantName, config, bassTrack, extraParts)
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

            if (normalizedScale.length === 1) continue

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
        if (spacingJitter <= 0) return averageSpacing
        const choices = [averageSpacing]
        if (averageSpacing - spacingJitter >= 1) {
            choices.push(averageSpacing - spacingJitter)
        }
        choices.push(averageSpacing + spacingJitter)
        return choices[Math.floor(Math.random() * choices.length)] ?? averageSpacing
    }
}
