import Utils from '../core/utils.js'
import FlatNote from '../model/flatnote.js'
import { soundRegistry } from '../state/sound_registry.js'

const COST_DELETE = 3
const COST_ADD = 3
const COST_VELOCITY = 1
const COST_PITCH = 1

const DEFAULT_MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]

function weightedShuffle(ops, weightFn) {
    const scored = ops.map((op) => ({ op, score: Math.random() * (weightFn(op) ?? 50) }))
    scored.sort((a, b) => b.score - a.score)
    for (let i = 0; i < ops.length; i++) ops[i] = scored[i].op
    return ops
}

function removeNote(flatNotes, flatNote) {
    const notes = flatNotes.get(flatNote.tick)
    if (!notes) return
    const idx = notes.indexOf(flatNote)
    if (idx !== -1) notes.splice(idx, 1)
    if (notes.length === 0) flatNotes.delete(flatNote.tick)
}

function pickPitch(track) {
    const range = track.pitch_range ?? 12
    const raw = Math.floor(Math.random() * (2 * range + 1)) - range
    if (!track.pitch_scale_lock) return raw
    const scaleSteps = soundRegistry.scales?.[track.scaleName]?.scaleSteps ?? DEFAULT_MAJOR_SCALE
    const abs = Math.abs(raw)
    const sign = raw < 0 ? -1 : 1
    const octave = Math.floor(abs / 12)
    const degree = abs % 12
    let best = 0
    let bestDist = 999
    for (const s of scaleSteps) {
        const dist = Math.abs(degree - s)
        if (dist < bestDist) {
            bestDist = dist
            best = s
        }
    }
    return sign * (octave * 12 + best)
}

function applyOps(flatNotes, track, ops, budget) {
    const weightFn = (op) => {
        switch (op.type) {
            case 'silence':
                return track.prob_silence ?? 50
            case 'velocity':
                return track.prob_velocity ?? 50
            case 'pitch':
                return track.prob_pitch ?? 50
            case 'anticipation':
            case 'double':
                return track.prob_fill ?? 50
            case 'ghost':
                return track.prob_ghost ?? 50
            default:
                return 50
        }
    }
    weightedShuffle(ops, weightFn)
    let remaining = budget

    for (const op of ops) {
        if (op.cost > remaining) continue

        switch (op.type) {
            case 'silence':
                removeNote(flatNotes, op.flatNote)
                remaining -= op.cost
                break
            case 'velocity':
                op.flatNote.note = { ...op.flatNote.note, velocity: Math.round(Math.random() * 100) / 100 }
                remaining -= op.cost
                break
            case 'pitch':
                op.flatNote.note = { ...op.flatNote.note, pitch: pickPitch(track) }
                remaining -= op.cost
                break
            case 'anticipation': {
                const note = {
                    ...Utils.NOTE_DEFAULTS,
                    pitch: op.flatNote.note.pitch ?? 0,
                    velocity: Math.round(Math.max(0.2, (op.flatNote.note.velocity ?? 0.8) * 0.7) * 100) / 100,
                    pan: op.flatNote.note.pan ?? 0,
                    beat: op.target.beat,
                    beatStep: op.target.beatStep,
                }
                const newFn = new FlatNote(op.target.t, track, note)
                if (!flatNotes.has(op.target.t)) flatNotes.set(op.target.t, [])
                flatNotes.get(op.target.t).push(newFn)
                remaining -= op.cost
                break
            }
            case 'double': {
                const note = {
                    ...Utils.NOTE_DEFAULTS,
                    pitch: op.flatNote.note.pitch ?? 0,
                    velocity: Math.round((op.flatNote.note.velocity ?? 0.8) * 0.8 * 100) / 100,
                    pan: op.flatNote.note.pan ?? 0,
                    beat: op.target.beat,
                    beatStep: op.target.beatStep,
                }
                const newFn = new FlatNote(op.target.t, track, note)
                if (!flatNotes.has(op.target.t)) flatNotes.set(op.target.t, [])
                flatNotes.get(op.target.t).push(newFn)
                remaining -= op.cost
                break
            }
            case 'ghost': {
                const note = {
                    ...Utils.NOTE_DEFAULTS,
                    pitch: op.source.note.pitch ?? 0,
                    velocity: Math.round((op.source.note.velocity ?? 0.8) * 0.5 * 100) / 100,
                    pan: op.source.note.pan ?? 0,
                    beat: op.target.beat,
                    beatStep: op.target.beatStep,
                }
                const newFn = new FlatNote(op.target.t, track, note)
                if (!flatNotes.has(op.target.t)) flatNotes.set(op.target.t, [])
                flatNotes.get(op.target.t).push(newFn)
                remaining -= op.cost
                break
            }
        }
    }
}

const COST_RETRIG = 1
const COST_RATE = 1
const COST_ARP_RANGE = 1
const COST_PROB = 1

/** Returns (creating once) the working clone for a source note inside this pass. */
function cloneVaried(varied, source) {
    let clone = varied.get(source)
    if (!clone) {
        clone = { ...source }
        varied.set(source, clone)
    }
    return clone
}

/**
 * Computes the variation2 layer for the given notes WITHOUT touching them.
 * Every applied op lands on a shallow clone of its source note; the return
 * value is a Map<sourceNote, variedClone> so callers can look up the varied
 * variant while source data stays pristine (it is never persisted).
 */
function varyNotes(sourceNotes, budget, track) {
    const varied = new Map()
    if (budget <= 0 || !sourceNotes || sourceNotes.length === 0) return varied

    const ops = []
    for (let i = 0; i < sourceNotes.length; i++) {
        const note = sourceNotes[i]

        const newRetrig = Math.floor(Math.random() * 4) + 1
        const maxRate = Math.max(1, 4 - newRetrig)
        const newRate = Math.floor(Math.random() * maxRate) + 1
        ops.push({ type: 'retrigRate', cost: COST_RETRIG + COST_RATE, idx: i, newRetrig, newRate })

        const newEucl = Math.floor(Math.random() * 2) + 1
        ops.push({ type: 'euclideanFill', cost: Math.min(newEucl, budget), idx: i, newValue: newEucl })

        ops.push({
            type: 'prob',
            cost: COST_PROB,
            idx: i,
            newValue: Math.round((Math.random() * 0.8 + 0.2) * 100) / 100,
        })

        if (note.arp && Array.isArray(note.arp) && note.arp.length >= 2) {
            ops.push({ type: 'arpRange', cost: COST_ARP_RANGE, idx: i, newValue: Math.floor(Math.random() * 7) + 6 })
        }
    }

    const weightFn = (op) => {
        switch (op.type) {
            case 'retrigRate':
                return track.prob_retrig ?? 50
            case 'euclideanFill':
                return track.prob_euclid ?? 50
            case 'prob':
                return track.prob_note ?? 50
            case 'arpRange':
                return track.prob_arp ?? 50
            default:
                return 50
        }
    }
    weightedShuffle(ops, weightFn)
    let remaining = budget

    for (const op of ops) {
        if (op.cost > remaining) continue
        const source = sourceNotes[op.idx]

        switch (op.type) {
            case 'retrigRate': {
                const note = cloneVaried(varied, source)
                note.retriggerNum = op.newRetrig
                note.rate = op.newRate
                remaining -= op.cost
                break
            }
            case 'euclideanFill': {
                const note = cloneVaried(varied, source)
                note.euclideanFill = op.newValue
                remaining -= op.cost
                break
            }
            case 'prob': {
                const note = cloneVaried(varied, source)
                note.prob = op.newValue
                remaining -= op.cost
                break
            }
            case 'arpRange': {
                const note = cloneVaried(varied, source)
                note.arp = [op.newValue, ...note.arp.slice(1)]
                remaining -= op.cost
                break
            }
        }
    }
    return varied
}

export default class TrackVariation {
    static apply(flatNotes, track, nbTickForLoop, nbTickForPattern, tick, variationOverride = null) {
        const variation = variationOverride ?? track.variation ?? 0
        if (variation <= 0) return

        const budget = Math.round((variation * 16) / 100)
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const totalStepsInLoop = Math.round((nbTickForLoop * stepsPerBeat) / tick)
        const loopCount = Math.max(1, Math.ceil(nbTickForPattern / nbTickForLoop))

        for (let loop = 0; loop < loopCount; loop++) {
            const occupied = new Set()
            const byStep = new Map()

            for (let step = 0; step < totalStepsInLoop; step++) {
                const t = loop * nbTickForLoop + Utils.stepToTick(step, stepsPerBeat, tick)
                if (t >= nbTickForPattern) continue

                const existing = flatNotes.get(t)
                const flatNote = existing?.find((n) => n.track === track)
                if (flatNote) {
                    occupied.add(step)
                    byStep.set(step, flatNote)
                }
            }

            const sortedSteps = [...occupied].sort((a, b) => a - b)
            const ops = []

            if (sortedSteps.length === 0) continue

            for (let i = 0; i < sortedSteps.length; i++) {
                const step = sortedSteps[i]
                const flatNote = byStep.get(step)

                const prevStep = step > 0 ? step - 1 : -1
                const nextStep = step < totalStepsInLoop - 1 ? step + 1 : -1

                const hasPrev = prevStep >= 0 && occupied.has(prevStep)
                const hasNext = nextStep >= 0 && occupied.has(nextStep)

                if (!hasPrev && nextStep >= 0 && !occupied.has(nextStep)) {
                    const t = loop * nbTickForLoop + Utils.stepToTick(nextStep, stepsPerBeat, tick)
                    ops.push({
                        type: 'anticipation',
                        cost: COST_ADD,
                        flatNote,
                        target: { t, ...Utils.stepToBeat(nextStep, stepsPerBeat) },
                    })
                }

                if (hasPrev && hasNext) {
                    ops.push({ type: 'silence', cost: COST_DELETE, flatNote })
                }

                ops.push({ type: 'velocity', cost: COST_VELOCITY, flatNote })
                ops.push({ type: 'pitch', cost: COST_PITCH, flatNote })

                if (!hasNext && nextStep >= 0 && !occupied.has(nextStep)) {
                    const t = loop * nbTickForLoop + Utils.stepToTick(nextStep, stepsPerBeat, tick)
                    ops.push({
                        type: 'double',
                        cost: COST_ADD,
                        flatNote,
                        target: { t, ...Utils.stepToBeat(nextStep, stepsPerBeat) },
                    })
                }
            }

            for (let i = 0; i < sortedSteps.length - 1; i++) {
                const gap = sortedSteps[i + 1] - sortedSteps[i]
                if (gap < 3) continue

                const midStep = sortedSteps[i] + Math.floor(gap / 2)
                const t = loop * nbTickForLoop + Utils.stepToTick(midStep, stepsPerBeat, tick)

                ops.push({
                    type: 'ghost',
                    cost: COST_ADD,
                    source: byStep.get(sortedSteps[i]),
                    target: { t, beat: Math.floor(midStep / stepsPerBeat), beatStep: midStep % stepsPerBeat },
                })
            }

            applyOps(flatNotes, track, ops, budget)
        }
    }

    /**
     * variation2 layer for a track's source notes.
     * @returns {Map<object, object>|null} Map<sourceNote, variedClone>, or
     * null when variation2 is disabled. Source notes are never modified.
     */
    static applyNoteVariation(track) {
        const variation2 = track.variation2 ?? 0
        if (variation2 <= 0) return null

        const budget = Math.round((variation2 * 16) / 100)
        const notes = Array.isArray(track.notes) ? track.notes : Object.values(track.notes ?? {})
        return varyNotes(notes, budget, track)
    }
}
