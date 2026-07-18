import BaseGenerator from './base_generator.js'

export default class MfMelodyGenerate extends BaseGenerator {
    static MELODY_GENERATION_CONFIGS = Object.freeze({
        chordStab: {
            mode: 'phrases',
            scaleName: 'major',
            octaveShift: 0,
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0, source: 'root', accent: true, arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, rate: 16 },
                { beat: 0, step: 2, source: 'third' },
                { beat: 1, step: 0, source: 'fifth', accent: true, arp: { intervals: [0, 4, 7], mode: 'up' }, retriggerNum: 3, rate: 16 },
                { beat: 2, step: 0, source: 'root', accent: true, arp: { intervals: [0, 4, 7, 12], mode: 'updown' }, retriggerNum: 4, rate: 16 },
                { beat: 2, step: 2, source: 'seventh' },
                { beat: 3, step: 0, source: 'fifth', accent: true, arp: { intervals: [0, 3, 7], mode: 'up' }, retriggerNum: 3, rate: 16 },
                { beat: 3, step: 3, source: 'third' }
            ],
            velocity: {
                base: 0.6,
                accentOnBeat: 0.14,
                ghost: -0.2,
                randomSpread: 0.06,
                clampMin: 0.3,
                clampMax: 0.88
            }
        },
        arpeggio: {
            mode: 'arpeggio',
            scaleName: 'major',
            octaveShift: 0,
            contour: 'updown',
            noteSpacing: 2,
            spacingJitter: 0,
            phraseLength: 8,
            loopPointBeat: 4,
            loopPointStep: 0,
            arp: { intervals: [0, 4, 7, 12], mode: 'updown' },
            retriggerNum: 4,
            rate: 16,
            velocity: {
                base: 0.55,
                accentOnBeat: 0.1,
                variationBoost: 0.06,
                randomSpread: 0.08,
                clampMin: 0.28,
                clampMax: 0.82
            }
        },
        sparse: {
            mode: 'phrases',
            scaleName: 'minor',
            octaveShift: 0,
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 0, source: 'root', accent: true },
                { beat: 1, step: 2, source: 'randomScale' },
                { beat: 2, step: 0, source: 'fifth', accent: true },
                { beat: 3, step: 3, source: 'randomScale' }
            ],
            velocity: {
                base: 0.52,
                accentOnBeat: 0.12,
                randomSpread: 0.08,
                clampMin: 0.28,
                clampMax: 0.82
            }
        },
        walking: {
            mode: 'groove',
            scaleName: 'major',
            octaveShift: 0,
            density: 0.5,
            variation: 0.3,
            strongBeatIntervals: [0, 4, 7],
            strongBeatWeight: 0.7,
            maxLeap: 7,
            loopPointBeat: 4,
            loopPointStep: 0,
            velocity: {
                base: 0.58,
                accentOnBeat: 0.1,
                variationBoost: 0.08,
                randomSpread: 0.1,
                clampMin: 0.3,
                clampMax: 0.85
            }
        },
        reggae: {
            mode: 'phrases',
            scaleName: 'major',
            octaveShift: 0,
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 0, step: 2, source: 'root' },
                { beat: 0, step: 3, source: 'fifth' },
                { beat: 1, step: 2, source: 'third' },
                { beat: 1, step: 3, source: 'root' },
                { beat: 2, step: 2, source: 'fifth' },
                { beat: 2, step: 3, source: 'third' },
                { beat: 3, step: 2, source: 'root' },
                { beat: 3, step: 3, source: 'seventh' }
            ],
            velocity: {
                base: 0.56,
                accentOnBeat: 0.08,
                randomSpread: 0.06,
                clampMin: 0.32,
                clampMax: 0.8
            }
        },
        break: {
            mode: 'phrases',
            scaleName: 'minor',
            octaveShift: 0,
            loopPointBeat: 4,
            loopPointStep: 0,
            phrases: [
                { beat: 3, step: 0, source: 'root', accent: true },
                { beat: 3, step: 1, source: 'third' },
                { beat: 3, step: 2, source: 'fifth' },
                { beat: 3, step: 3, source: 'octave', accent: true }
            ],
            velocity: {
                base: 0.65,
                accentOnBeat: 0.18,
                ghost: -0.3,
                randomSpread: 0.1,
                clampMin: 0.3,
                clampMax: 1
            }
        }
    })

    constructor() {
        super('MELODY', MfMelodyGenerate.MELODY_GENERATION_CONFIGS)
    }

    generateNewMelody = (melodyTrack, variantName = null, density = 1, pattern = null, harmony = { root: 0, scale: null }) => {
        const rootNote = harmony.root ?? 0
        const scaleName = harmony.scale ?? null
        if (variantName === 'break') {
            const config = this.configs.break
            this.clearTrackNotes(melodyTrack)
            const tones = this.getScaleSteps(scaleName ?? config.scaleName)
            const octaveShift = (config.octaveShift ?? 1) * 12
            this.generatePhraseVariant(melodyTrack, config,
                (phrase) => this.resolvePhrasePitch(phrase, tones, [], rootNote + octaveShift),
                (phrase) => phrase.accent === true,
                (phrase) => phrase.ghost === true,
                density
            )
            this.applyLoopPoint(melodyTrack, config)
            return
        }
        if (variantName === 'intro' || variantName === 'outro') return

        const resolvedVariantName = this.resolveVariantName(variantName)
        const config = this.configs[resolvedVariantName] ?? this.configs.sparse
        const tones = this.getScaleSteps(scaleName ?? config.scaleName)
        const octaveShift = (config.octaveShift ?? 1) * 12
        const pitchBias = rootNote + octaveShift

        this.clearTrackNotes(melodyTrack)

        switch (config.mode) {
            case 'groove':
                this.generateMelodyGrooveVariant(melodyTrack, tones, config, density, pitchBias)
                break
            case 'arpeggio':
                this.generateMelodyArpeggioVariant(melodyTrack, tones, config, density, pitchBias)
                break
            case 'phrases':
            default: {
                const cachedPitches = []
                this.generatePhraseVariant(melodyTrack, config,
                    (phrase) => this.resolvePhrasePitch(phrase, tones, cachedPitches, pitchBias),
                    (phrase, step) => step % 2 === 0,
                    null,
                    density,
                    { cachedPitches }
                )
                break
            }
        }

        this.applyLoopPoint(melodyTrack, config)
    }

    generateMelodyGrooveVariant = (melodyTrack, scale, config, density = 1, pitchBias = 0) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(melodyTrack, config, 2)
        const stepsPerBeat = melodyTrack.stepsPerBeat ?? 4

        const strongIntervals = config.strongBeatIntervals ?? [0, 4, 7]

        for (let beat = 0; beat < (melodyTrack.nbBeats ?? 1); beat++) {
            let lastStepNote = pitchBias
            for (let step = 0; step < stepsPerBeat; step++) {
                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) continue

                const strongBeat = step === 0 || step === Math.floor(stepsPerBeat / 2)
                const playNote = strongBeat || Math.random() < (config.density ?? 0.5) * density
                if (!playNote) continue

                let notePitch
                if (strongBeat || Math.random() > (config.variation ?? 0.3)) {
                    const interval = strongIntervals[Math.floor(Math.random() * strongIntervals.length)] ?? 0
                    notePitch = pitchBias + interval
                } else {
                    const degree = scale[Math.floor(Math.random() * scale.length)] ?? 0
                    notePitch = pitchBias + degree
                    if (Math.abs(notePitch - lastStepNote) > (config.maxLeap ?? 7)) {
                        notePitch = pitchBias
                    }
                }

                lastStepNote = notePitch
                this.addNote(
                    melodyTrack,
                    beat,
                    step,
                    notePitch,
                    this.computeVelocity(config.velocity, {
                        step,
                        accent: strongBeat,
                        isVariation: !strongBeat
                    })
                )
            }
        }
    }

    generateMelodyArpeggioVariant = (melodyTrack, scale, config, density = 1, pitchBias = 0) => {
        const loopPointAbsolute = this.getLoopPointAbsolute(melodyTrack, config, 2)
        const stepsPerBeat = melodyTrack.stepsPerBeat ?? 4

        const phraseLength = Math.max(2, config.phraseLength ?? scale.length)
        const contour = config.contour ?? 'updown'
        const contourSequence = this.buildContour(scale, phraseLength, contour, 0, [0, 3, 5, 7])
        const averageSpacing = Math.max(1, config.noteSpacing ?? 2)
        const spacingJitter = Math.max(0, config.spacingJitter ?? 0)
        const arp = config.arp ?? null
        const retriggerNum = config.retriggerNum ?? 1
        const rate = config.rate ?? 1

        for (let beat = 0; beat < (melodyTrack.nbBeats ?? 1); beat++) {
            let step = 0
            let noteIndex = 0

            while (step < stepsPerBeat) {
                const absoluteStep = beat * stepsPerBeat + step
                if (absoluteStep >= loopPointAbsolute) break

                if (Math.random() < density) {
                    const degree = contourSequence[noteIndex % contourSequence.length] ?? 0
                    const pitch = pitchBias + degree
                    const note = this.addNote(
                        melodyTrack,
                        beat,
                        step,
                        pitch,
                        this.computeVelocity(config.velocity, {
                            step,
                            accent: step % 4 === 0,
                            isVariation: noteIndex % contourSequence.length !== 0
                        })
                    )
                    if (arp) {
                        note.arp = arp
                        note.retriggerNum = retriggerNum
                        note.rate = rate
                    }
                }

                noteIndex += 1
                step += this.getStepAdvance(averageSpacing, spacingJitter)
            }
        }
    }

}
