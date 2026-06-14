import BaseGenerator from './base_generator.js'
import { soundRegistry } from '../../state/sound_registry.js'

export default class MfPercGenerate extends BaseGenerator {
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

    constructor() {
        super('PERC', MfPercGenerate.PERC_GENERATION_CONFIGS)
    }

    generateNewPerc = (percTrack, variantName = null, density = 1) => {
        if (variantName === 'break') return

        const resolvedVariantName = this.resolveVariantName(variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.basic
        const tones = this.getScaleSteps(config.scaleName)
        const pitchBias = this.getTrackPitchBias(percTrack)

        //this.traceGeneration(resolvedVariantName, config, percTrack)
        this.clearTrackNotes(percTrack)

        switch (config.mode) {
            case 'grid':
                this.generatePercGridVariant(percTrack, tones, pitchBias, config, density)
                break
            case 'callResponse':
                this.generatePercCallResponseVariant(percTrack, tones, pitchBias, config, density)
                break
            case 'fill':
                this.generatePercFillVariant(percTrack, tones, pitchBias, config)
                break
            case 'phrases':
            default:
                this.generatePercPhraseVariant(percTrack, tones, pitchBias, config, density)
                break
        }

        this.applyLoopPoint(percTrack, config)
       // this.displayDebugNotes(percTrack, 'PC')
    }

    generatePercPhraseVariant = (percTrack, tones, pitchBias, config, density = 1) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(percTrack, config, 2)
        const barQuantize = percTrack.barQuantize ?? 4

        const cachedPitches = []
        config.phrases.forEach((phrase) => {
            if (density < 1 && Math.random() >= density) return

            const step = phrase.step === 'random'
                ? Math.floor(Math.random() * barQuantize)
                : phrase.step

            const absoluteStep = phrase.bar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) return

            const pitch = this.resolvePercPitch(phrase, tones, cachedPitches, pitchBias)

            this.addNote(
                percTrack,
                phrase.bar,
                step,
                pitch,
                this.computeVelocity(config.velocity, {
                    step,
                    accent: step === 0,
                    isVariation: phrase.source !== 'root'
                })
            )
            cachedPitches.push(pitch)
        })
    }

    generatePercGridVariant = (percTrack, tones, pitchBias, config, density = 1) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(percTrack, config, 2)
        const barQuantize = percTrack.barQuantize ?? 4

        for (let bar = 0; bar < (percTrack.bars ?? 1); bar++) {
            for (let step = 0; step < barQuantize; step++) {
                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) continue

                const probability = config.probabilities?.[step % config.probabilities.length] ?? 0
                if (Math.random() >= probability * density) continue

                const pitch = this.getRndTone(tones) + pitchBias
                this.addNote(
                    percTrack,
                    bar,
                    step,
                    pitch,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: step === 0,
                        isVariation: pitch !== pitchBias
                    })
                )
            }
        }
    }

    generatePercCallResponseVariant = (percTrack, tones, pitchBias, config, density = 1) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(percTrack, config, 2)
        const barQuantize = percTrack.barQuantize ?? 4

        for (let bar = 0; bar < (percTrack.bars ?? 1); bar++) {
            const steps = bar % 2 === 0 ? config.callSteps : config.responseSteps
            steps.forEach((step) => {
                if (step >= barQuantize || Math.random() >= config.density * density) return

                const absoluteStep = bar * barQuantize + step
                if (absoluteStep >= loopPointAbsolute) return

                const pitch = this.getRndTone(tones) + pitchBias
                this.addNote(
                    percTrack,
                    bar,
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
        const barQuantize = percTrack.barQuantize ?? 4

        const startBar = Math.max(0, (percTrack.bars ?? 1) - (config.startBarOffset ?? 1))
        config.steps.forEach((step, index) => {
            if (step >= barQuantize) return

            const absoluteStep = startBar * barQuantize + step
            if (absoluteStep >= loopPointAbsolute) return

            const tone = tones[index % tones.length] ?? 0
            const pitch = tone + pitchBias
            this.addNote(
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
        })
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

    getScaleSteps = (scaleName) => {
        return soundRegistry.scales[scaleName]?.scaleSteps
            ?? soundRegistry.scales["pentatonic minor"]?.scaleSteps
            ?? soundRegistry.scales["major"]?.scaleSteps
            ?? [0, 2, 3, 5, 7, 10]
    }

    resolvePercPitch = (phrase, tones, cachedPitches, pitchBias) => {
        return this.resolvePhrasePitch(phrase, tones, cachedPitches, pitchBias)
    }
}
