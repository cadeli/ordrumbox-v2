import BaseGenerator from './base_generator.js'
import { NOTE_DEFAULTS } from '../../core/note_schema.js'

export default class RandomGenerate extends BaseGenerator {
    static RANDOM_CONFIG = Object.freeze({
        densityMin: 0.15,
        densitySpread: 0.2,
        pitchMin: -6,
        pitchRange: 13,
        velocityMin: 0.5,
        velocitySpread: 0.5,
    })

    constructor() {
        super('RANDOM', {})
    }

    generateRandom = (track, pattern = null) => {
        const config = RandomGenerate.RANDOM_CONFIG

        this.clearTrackNotes(track)
        this.applyLoopPoint(track, {
            loopPointBeat: track.nbBeats ?? pattern?.nbBeats ?? 4,
            loopPointStep: 0,
        })

        const beats = track.nbBeats ?? pattern?.nbBeats ?? 4
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const totalSteps = beats * stepsPerBeat
        const noteCount = Math.max(
            1,
            Math.floor(totalSteps * (config.densityMin + Math.random() * config.densitySpread)),
        )
        const used = new Set()

        for (let i = 0; i < noteCount; i++) {
            let step
            do {
                step = Math.floor(Math.random() * totalSteps)
            } while (used.has(step))
            used.add(step)
            const beat = Math.floor(step / stepsPerBeat)
            const beatStep = step % stepsPerBeat
            const pitch = Math.floor(Math.random() * config.pitchRange) + config.pitchMin
            const velocity = config.velocityMin + Math.random() * config.velocitySpread
            track.notes.push({ ...NOTE_DEFAULTS, beat, beatStep, pitch, velocity })
        }
    }
}
