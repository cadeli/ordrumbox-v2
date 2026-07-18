import BaseGenerator from './base_generator.js'
import { serviceRegistry } from '../../state/service_registry.js'
import MfResourcesLoader from '../../loader/resources_loader.js'
import { logger } from '../../core/logger.js'

export default class MfBassGenerate extends BaseGenerator {
    static BASS_GENERATION_CONFIGS = Object.freeze({
        basic: {
            mode: 'phrases',
            scaleName: 'pentatonic minor',
            rootNote: -12,
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0, source: 'root' },
                { beat: 0, step: 2, source: 'fifth' },
                { beat: 1, step: 0, source: 'root' },
                { beat: 1, step: 3, source: 'approach' },
                { beat: 2, step: 0, source: 'root' },
                { beat: 2, step: 2, source: 'octave' },
                { beat: 3, step: 0, source: 'root' },
                { beat: 3, step: 2, source: 'fifth' }
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
            rootNote: -12,
            beat: 0,
            probabilities: [0.7, 0.7, 0.6, 0.7],
            loopPointBeat: 1,
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
            rootNote: -12,
            rootPattern: [0, 5, 7],
            density: 0.4,
            variation: 0.15,
            strongBeatIntervals: [0, 7],
            strongBeatWeight: 0.75,
            maxLeap: 7,
            loopPointBeat: 4,
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
            rootNote: -12,
            rootPattern: [0, 3, 5, 7],
            density: 0.42,
            variation: 0.32,
            strongBeatIntervals: [0, 3],
            strongBeatWeight: 0.62,
            maxLeap: 5,
            loopPointBeat: 4,
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
            rootNote: -12,
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0, source: 'root', retriggerNum: 2, rate: 86 },
                { beat: 0, step: 2, source: 'fifth' },
                { beat: 1, step: 0, source: 'root' },
                { beat: 1, step: 3, source: 'octave', retriggerNum: 3, rate: 86 },
                { beat: 2, step: 0, source: 'root', retriggerNum: 2, rate: 86 },
                { beat: 2, step: 2, source: 'fifth' },
                { beat: 3, step: 0, source: 'root' },
                { beat: 3, step: 2, source: 'approach' }
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
            rootNote: -12,
            rootPattern: [0, 3, 5, 7],
            contour: 'updown',
            noteSpacing: 4,
            spacingJitter: 1,
            phraseLength: 6,
            startDegree: 0,
            loopPointBeat: 4,
            loopPointStep: 0,
            velocity: {
                base: 0.74,
                accentOnBeat: 0.14,
                variationBoost: 0.06,
                randomSpread: 0.05,
                clampMin: 0.5,
                clampMax: 0.94
            }
        },
        acid: {
            mode: 'phrases',
            scaleName: 'minor',
            rootNote: -12,
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0, source: 'root', accent: true, arp: { intervals: [0, 3, 7, 10, 12, 10, 7, 3], mode: 'updown' }, retriggerNum: 6, rate: 8 },
                { beat: 1, step: 0, source: 'root', accent: true, arp: { intervals: [0, 5, 7, 12], mode: 'up' }, retriggerNum: 4, rate: 8 },
                { beat: 2, step: 0, source: 'root', accent: true, arp: { intervals: [0, 3, 7, 10, 12, 15], mode: 'updown' }, retriggerNum: 8, rate: 8 },
                { beat: 3, step: 0, source: 'root', accent: true, arp: { intervals: [0, 7, 12], mode: 'up' }, retriggerNum: 3, rate: 86 }
            ],
            velocity: {
                base: 0.78,
                accentOnBeat: 0.12,
                randomSpread: 0.06,
                clampMin: 0.5,
                clampMax: 1
            }
        }
    })

    constructor() {
        super('BASS', MfBassGenerate.BASS_GENERATION_CONFIGS)
        this._toneThreshold = 5
        this.isScalesLoading = false
    }

    loadScales = async () => {
        if (this.isScalesLoading || !serviceRegistry.mfResourcesLoader) return
        this.isScalesLoading = true
        await serviceRegistry.mfResourcesLoader.loadScales(MfResourcesLoader.SCALES_URL)
        this.checkResources()
    }

    checkResources = () => {
        this.isScalesLoading = false
     }

    static TAG = 'MFBASSGENERATE'

    generateNewBass = (bassTrack, variantName = null, density = 1, harmony = { root: 0, scale: null }) => {
        const resolvedVariantName = this.resolveVariantName(variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.basic
        const scaleName = harmony.scale ?? config.scaleName
        const tones = this.getScaleSteps(scaleName)
        const rootNote = (config.rootNote ?? 0) + (harmony.root ?? 0)

        logger.info(MfBassGenerate.TAG, `generateNewBass: variant=${resolvedVariantName}, mode=${config.mode}, density=${density}, rootNote=${rootNote} (harmony=${JSON.stringify(harmony)})`)

        this.clearTrackNotes(bassTrack)

        switch (config.mode) {
            case 'stepGrid':
                this.generateBassStepGridVariant(bassTrack, tones, config, density, rootNote)
                break
            case 'groove':
                this.generateBassGrooveVariant(bassTrack, tones, config, density, rootNote)
                break
            case 'arpeggio':
                this.generateBassArpeggioVariant(bassTrack, tones, config, density, rootNote)
                break
            case 'phrases':
            default: {
                const cachedPitches = []
                this.generatePhraseVariant(bassTrack, config,
                    (phrase) => this.resolvePhrasePitch(phrase, tones, cachedPitches, rootNote),
                    (phrase, step) => step % 4 === 0,
                    null,
                    density,
                    { cachedPitches }
                )
                break
            }
        }

        this.applyLoopPoint(bassTrack, config)
    }

    generateBassStepGridVariant = (bassTrack, tones, config, density = 1, rootNote = 0) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(bassTrack, config, 2)
        const stepsPerBeat = bassTrack.stepsPerBeat ?? 4
        const beat = config.beat ?? 0
        const probs = config.probabilities ?? [0.7, 0.7, 0.6, 0.7]

        const generatedTones = [tones[0] + rootNote]
        for (let i = 1; i < stepsPerBeat; i++) {
            generatedTones.push(this.getRndTone(tones) + rootNote)
        }

        for (let step = 0; step < stepsPerBeat; step++) {
            const absoluteStep = beat * stepsPerBeat + step
            if (absoluteStep >= loopPointAbsolute) continue

            const probability = probs[step % probs.length]
            if (Math.random() < probability * density) {
                this.addNote(
                    bassTrack,
                    beat,
                    step,
                    generatedTones[step],
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: config.velocity?.accentPattern?.[step % (config.velocity?.accentPattern?.length ?? 1)] ?? 0,
                        toFixed: false
                    })
                )
            }
        }
    }

    generateBassGrooveVariant = (bassTrack, scale, config, density = 1, rootNote = 0) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(bassTrack, config, 2)
        const stepsPerBeat = bassTrack.stepsPerBeat ?? 4

        const rootPattern = config.rootPattern

        for (let beat = 0; beat < (bassTrack.nbBeats ?? 1); beat++) {
            const rootPitch = rootPattern[beat % rootPattern.length] + rootNote
            let lastStepNote = rootPitch
            for (let step = 0; step < stepsPerBeat; step++) {
                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) continue

                const strongBeat = step === 0
                const playNote = strongBeat || Math.random() < config.density * density
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
                    beat,
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

    generateBassArpeggioVariant = (bassTrack, scale, config, density = 1, rootNote = 0) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(bassTrack, config, 2)
        const stepsPerBeat = bassTrack.stepsPerBeat ?? 4

        const rootPattern = config.rootPattern ?? [0]
        const phraseLength = Math.max(2, config.phraseLength ?? scale.length)
        const contour = config.contour ?? 'updown'
        const contourSequence = this.buildContour(scale, phraseLength, contour, config.startDegree ?? 0, [0])
        const averageSpacing = Math.max(1, config.noteSpacing ?? 2)
        const spacingJitter = Math.max(0, config.spacingJitter ?? 0)

        for (let beat = 0; beat < (bassTrack.nbBeats ?? 1); beat++) {
            const rootPitch = rootPattern[beat % rootPattern.length] + rootNote
            let step = 0
            let noteIndex = 0

            while (step < stepsPerBeat) {
                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) break

                if (Math.random() < density) {
                    const degree = contourSequence[noteIndex % contourSequence.length] ?? 0
                    const pitch = rootPitch + degree
                    this.addNote(
                        bassTrack,
                        beat,
                        step,
                        pitch,
                        this.computeVelocity(config.velocity, {
                            step,
                            accent: step % 4 === 0,
                            isVariation: noteIndex % contourSequence.length !== 0
                        })
                    )
                }

                noteIndex += 1
                step += this.getStepAdvance(averageSpacing, spacingJitter)
            }
        }
    }

}
