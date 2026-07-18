import BaseGenerator from './base_generator.js'
import { soundRegistry } from '../../state/sound_registry.js'

export default class MfPercGenerate extends BaseGenerator {
    static PERC_GENERATION_CONFIGS = Object.freeze({
        basic: {
            mode: 'phrases',
            scaleName: 'pentatonic minor',
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 3, source: 'randomScale' },
                { beat: 1, step: 2, source: 'reuse', reuseIndex: 0 },
                { beat: 2, step: 'random', source: 'randomScale' },
                { beat: 3, step: 3, source: 'root' }
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
        shaker44: {
            mode: 'lockedPerc',
            scaleName: 'chromatic',
            loopPointBeat: 1,
            loopPointStep: 0,
            velocityPattern: [0.68, 0.42, 0.58, 0.45, 0.68, 0.42, 0.58, 0.38, 0.68, 0.42, 0.58, 0.45, 0.68, 0.42, 0.58, 0.35],
            accentEvery: 4,
            pitchPattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, -1],
            velocity: {
                base: 0.52,
                accentOnBeat: 0.1,
                ghost: -0.12,
                randomSpread: 0.04,
                clampMin: 0.25,
                clampMax: 0.78
            }
        },
        tambourine44: {
            mode: 'lockedPerc',
            scaleName: 'chromatic',
            loopPointBeat: 1,
            loopPointStep: 0,
            velocityPattern: [0.72, 0, 0.55, 0, 0.72, 0, 0.55, 0.38, 0.72, 0, 0.55, 0, 0.72, 0, 0.55, 0.32],
            accentEvery: 4,
            pitchPattern: [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3],
            velocity: {
                base: 0.58,
                accentOnBeat: 0.14,
                ghost: -0.1,
                randomSpread: 0.05,
                clampMin: 0.3,
                clampMax: 0.85
            }
        },
        clap44: {
            mode: 'lockedPerc',
            scaleName: 'chromatic',
            loopPointBeat: 1,
            loopPointStep: 0,
            velocityPattern: [0.8, 0, 0, 0, 0.65, 0, 0, 0, 0.8, 0, 0, 0, 0.65, 0, 0, 0.4],
            accentEvery: 4,
            pitchPattern: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            velocity: {
                base: 0.62,
                accentOnBeat: 0.16,
                ghost: -0.08,
                randomSpread: 0.04,
                clampMin: 0.35,
                clampMax: 0.9
            }
        },
        conversation: {
            mode: 'callResponse',
            scaleName: 'dorian',
            loopPointBeat: 4,
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
            loopPointBeat: 2,
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
            loopPointBeat: 4,
            loopPointStep: 0,
            startBarOffset: 2,
            steps: [0, 2],
            prob: 0.3,
            euclidianFill: 2,
            velocity: {
                base: 0.6,
                accentOnBeat: 0.24,
                variationBoost: 0.12,
                randomSpread: 0.12,
                clampMin: 0.3,
                clampMax: 1
            }
        },
        texture: {
            mode: 'phrases',
            scaleName: 'pentatonic minor',
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0, source: 'root', accent: true, euclidianFill: 3 },
                { beat: 1, step: 2, source: 'randomScale', euclidianFill: 2 },
                { beat: 2, step: 0, source: 'root', accent: true, euclidianFill: 4 },
                { beat: 3, step: 3, source: 'randomScale', euclidianFill: 1 }
            ],
            velocity: {
                base: 0.58,
                accentOnBeat: 0.16,
                variationBoost: 0.08,
                randomSpread: 0.1,
                clampMin: 0.28,
                clampMax: 0.92
            }
        },
        crash: {
            mode: 'crash',
            loopPointBeat: 4,
            loopPointStep: 0,
            probability: 0.1,
            velocity: {
                base: 0.7,
                randomSpread: 0.2,
                clampMin: 0.35,
                clampMax: 1
            }
        }
    })

    constructor() {
        super('PERC', MfPercGenerate.PERC_GENERATION_CONFIGS)
    }

    generateNewPerc = (percTrack, variantName = null, density = 1) => {
        const resolvedVariantName = this.resolveVariantName(variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.basic
        const tones = this.getScaleSteps(config.scaleName)
        const pitchBias = this.getTrackPitchBias(percTrack)

        this.clearTrackNotes(percTrack)

        switch (config.mode) {
            case 'lockedPerc':
                this.generateLockedPercVariant(percTrack, tones, pitchBias, config, density)
                break
            case 'crash':
                this.generateCrashVariant(percTrack, config)
                break
            case 'grid':
                this.generateGridVariant(percTrack, config,
                    null, null, density,
                    { defaultBar: 2, pitchResolver: () => this.getRndTone(tones) + pitchBias }
                )
                break
            case 'callResponse':
                this.generatePercCallResponseVariant(percTrack, tones, pitchBias, config, density)
                break
            case 'fill':
                this.generatePercFillVariant(percTrack, tones, pitchBias, config)
                break
            case 'phrases':
            default: {
                const cachedPitches = []
                this.generatePhraseVariant(percTrack, config,
                    (phrase) => this.resolvePhrasePitch(phrase, tones, cachedPitches, pitchBias),
                    (phrase, step) => step === 0,
                    (phrase, step) => phrase.source !== 'root',
                    density,
                    { cachedPitches }
                )
                break
            }
        }

        this.applyLoopPoint(percTrack, config)
    }

    generateLockedPercVariant = (percTrack, tones, pitchBias, config, density = 1) => {
        this.withLockedBarQuantize(percTrack, 16, () => {
            const loopPointAbsolute = this.getLoopPointAbsolute(percTrack, config, 1)
            const velocityPattern = config.velocityPattern ?? []
            const pitchPattern = config.pitchPattern ?? []
            const accentEvery = config.accentEvery ?? 4

            for (let beat = 0; beat < (percTrack.nbBeats ?? 1); beat++) {
                for (let step = 0; step < 16; step++) {
                    const absoluteStep = beat * 16 + step
                    if (absoluteStep >= loopPointAbsolute) continue

                    const patternVelocity = velocityPattern[step % velocityPattern.length] ?? 0.5
                    if (patternVelocity <= 0) continue

                    const isAccent = step % accentEvery === 0
                    const pitchOffset = pitchPattern[step % pitchPattern.length] ?? 0
                    const pitch = tones[pitchOffset + pitchBias] ?? pitchBias

                    if (Math.random() >= density) continue

                    this.addNote(
                        percTrack,
                        beat,
                        step,
                        pitch,
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

    generatePercCallResponseVariant = (percTrack, tones, pitchBias, config, density = 1) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(percTrack, config, 2)
        const stepsPerBeat = percTrack.stepsPerBeat ?? 4

        for (let beat = 0; beat < (percTrack.nbBeats ?? 1); beat++) {
            const steps = beat % 2 === 0 ? config.callSteps : config.responseSteps
            steps.forEach((step) => {
                if (step >= stepsPerBeat || Math.random() >= config.density * density) return

                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) return

                const pitch = this.getRndTone(tones) + pitchBias
                this.addNote(
                    percTrack,
                    beat,
                    step,
                    pitch,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: step === 0,
                        isVariation: true
                    })
                )
            })
        }
    }

    generatePercFillVariant = (percTrack, tones, pitchBias, config) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(percTrack, config, 2)
        const stepsPerBeat = percTrack.stepsPerBeat ?? 4

        const startBar = Math.max(0, (percTrack.nbBeats ?? 1) - (config.startBarOffset ?? 1))
        config.steps.forEach((step, index) => {
            if (step >= stepsPerBeat) return

            const absoluteStep = startBar * stepsPerBeat + step
            if (absoluteStep >= loopPointAbsolute) return

            const tone = tones[index % tones.length] ?? 0
            const pitch = tone + pitchBias
            const note = this.addNote(
                percTrack,
                startBar,
                step,
                pitch,
                this.computeVelocity(config.velocity, {
                    step,
                    accent: step === 0,
                    isVariation: index > 0
                })
            )
            if (config.prob != null) {
                note.prob = config.prob
            }
            if (typeof config.euclidianFill === 'number') {
                note.euclidianFill = config.euclidianFill
            }
        })
    }

    generateCrashVariant = (percTrack, config) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(percTrack, config, 1)
        const stepsPerBeat = percTrack.stepsPerBeat ?? 4
        const probability = config.probability ?? 0.1

        for (let beat = 0; beat < (percTrack.nbBeats ?? 1); beat++) {
            for (let step = 0; step < stepsPerBeat; step++) {
                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) continue
                if (Math.random() >= probability) continue

                const note = this.addNote(
                    percTrack,
                    beat,
                    step,
                    Math.floor(Math.random() * 24) - 12,
                    this.computeVelocity(config.velocity, { step, accent: false })
                )
                note.pan = (Math.random() * 2 - 1)
            }
        }
    }

    getTrackPitchBias = (track) => {
        const trackName = String(track?.name ?? '').toUpperCase()
        if (trackName.includes('HCONG') || trackName.includes('HI_TOM') || trackName.includes('HIGH')) {
            return 5
        }
        if (trackName.includes('LCONG') || trackName.includes('LO_TOM') || trackName.includes('LOW')) {
            return -5
        }
        if (trackName.includes('CONG')) {
            return 2
        }
        return 0
    }

    getScaleSteps = (scaleName) => {
        return soundRegistry.scales[scaleName]?.scaleSteps
            ?? soundRegistry.scales["pentatonic minor"]?.scaleSteps
            ?? soundRegistry.scales["major"]?.scaleSteps
            ?? [0, 2, 3, 5, 7, 10]
    }

}
