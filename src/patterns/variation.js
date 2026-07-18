import Utils from '../core/utils.js'
import MfFlatNote from '../model/flatnote.js'

const COST_DELETE = 3
const COST_ADD = 3
const COST_VELOCITY = 1
const COST_PITCH = 1

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}

function tickForStep(step, stepsPerBeat, nbTickForLoop, tick) {
    const beat = Math.floor(step / stepsPerBeat)
    const beatStep = step % stepsPerBeat
    return beat * tick + Math.round((beatStep * tick) / stepsPerBeat)
}

function removeNote(flatNotes, fn) {
    const notes = flatNotes.get(fn.tick)
    if (!notes) return
    const idx = notes.indexOf(fn)
    if (idx !== -1) notes.splice(idx, 1)
    if (notes.length === 0) flatNotes.delete(fn.tick)
}

function applyOps(flatNotes, track, ops, budget) {
    shuffle(ops)
    let remaining = budget

    for (const op of ops) {
        if (op.cost > remaining) continue

        switch (op.type) {
            case 'silence':
                removeNote(flatNotes, op.fn)
                remaining -= op.cost
                break
            case 'velocity':
                op.fn.note = { ...op.fn.note, velocity: Math.random() }
                remaining -= op.cost
                break
            case 'pitch':
                op.fn.note = { ...op.fn.note, pitch: Math.floor(Math.random() * 25) - 12 }
                remaining -= op.cost
                break
            case 'anticipation': {
                const note = {
                    ...Utils.NOTE_DEFAULTS,
                    pitch: op.fn.note.pitch ?? 0,
                    velocity: Math.max(0.2, (op.fn.note.velocity ?? 0.8) * 0.7),
                    pan: op.fn.note.pan ?? 0,
                    beat: op.target.beat,
                    beatStep: op.target.beatStep
                }
                const newFn = new MfFlatNote(op.target.t, track, note)
                if (!flatNotes.has(op.target.t)) flatNotes.set(op.target.t, [])
                flatNotes.get(op.target.t).push(newFn)
                remaining -= op.cost
                break
            }
            case 'double': {
                const note = {
                    ...Utils.NOTE_DEFAULTS,
                    pitch: op.fn.note.pitch ?? 0,
                    velocity: (op.fn.note.velocity ?? 0.8) * 0.8,
                    pan: op.fn.note.pan ?? 0,
                    beat: op.target.beat,
                    beatStep: op.target.beatStep
                }
                const newFn = new MfFlatNote(op.target.t, track, note)
                if (!flatNotes.has(op.target.t)) flatNotes.set(op.target.t, [])
                flatNotes.get(op.target.t).push(newFn)
                remaining -= op.cost
                break
            }
            case 'ghost': {
                const note = {
                    ...Utils.NOTE_DEFAULTS,
                    pitch: op.source.note.pitch ?? 0,
                    velocity: (op.source.note.velocity ?? 0.8) * 0.5,
                    pan: op.source.note.pan ?? 0,
                    beat: op.target.beat,
                    beatStep: op.target.beatStep
                }
                const newFn = new MfFlatNote(op.target.t, track, note)
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

function applyNoteVariation(sourceNotes, budget) {
    if (budget <= 0 || !sourceNotes || sourceNotes.length === 0) return

    const ops = []
    for (let i = 0; i < sourceNotes.length; i++) {
        const note = sourceNotes[i]

        const newRetrig = Math.floor(Math.random() * 4) + 1
        const maxRate = Math.max(1, 4 - newRetrig)
        const newRate = Math.floor(Math.random() * maxRate) + 1
        ops.push({ type: 'retrigRate', cost: COST_RETRIG + COST_RATE, idx: i, newRetrig, newRate })

        const newEucl = Math.floor(Math.random() * 2) + 1
        ops.push({ type: 'euclidianFill', cost: Math.min(newEucl, budget), idx: i, newValue: newEucl })

        ops.push({ type: 'prob', cost: COST_PROB, idx: i, newValue: Math.round((Math.random() * 0.8 + 0.2) * 100) / 100 })

        if (note.arp && Array.isArray(note.arp) && note.arp.length >= 2) {
            ops.push({ type: 'arpRange', cost: COST_ARP_RANGE, idx: i, newValue: Math.floor(Math.random() * 7) + 6 })
        }
    }

    shuffle(ops)
    let remaining = budget

    for (const op of ops) {
        if (op.cost > remaining) continue
        const note = sourceNotes[op.idx]

        switch (op.type) {
            case 'retrigRate':
                note.retriggerNum = op.newRetrig
                note.rate = op.newRate
                remaining -= op.cost
                break
            case 'euclidianFill':
                note.euclidianFill = op.newValue
                remaining -= op.cost
                break
            case 'prob':
                note.prob = op.newValue
                remaining -= op.cost
                break
            case 'arpRange':
                note.arp = [op.newValue, ...note.arp.slice(1)]
                remaining -= op.cost
                break
        }
    }
}

export default class TrackVariation {
    static apply(flatNotes, track, nbTickForLoop, nbTickForPattern, tick, variationOverride = null) {
        const variation = variationOverride ?? track.variation ?? 0
        if (variation <= 0) return

        const budget = Math.round(variation * 16 / 100)
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const totalStepsInLoop = Math.round(nbTickForLoop * stepsPerBeat / tick)
        const loopCount = Math.max(1, Math.ceil(nbTickForPattern / nbTickForLoop))

        for (let loop = 0; loop < loopCount; loop++) {
            const occupied = new Set()
            const byStep = new Map()

            for (let step = 0; step < totalStepsInLoop; step++) {
                const t = loop * nbTickForLoop + tickForStep(step, stepsPerBeat, nbTickForLoop, tick)
                if (t >= nbTickForPattern) continue

                const existing = flatNotes.get(t)
                const fn = existing?.find(n => n.track === track)
                if (fn) {
                    occupied.add(step)
                    byStep.set(step, fn)
                }
            }

            const sortedSteps = [...occupied].sort((a, b) => a - b)
            const ops = []

            if (sortedSteps.length === 0) continue

            for (let i = 0; i < sortedSteps.length; i++) {
                const step = sortedSteps[i]
                const fn = byStep.get(step)

                const prevStep = step > 0 ? step - 1 : -1
                const nextStep = step < totalStepsInLoop - 1 ? step + 1 : -1

                const hasPrev = prevStep >= 0 && occupied.has(prevStep)
                const hasNext = nextStep >= 0 && occupied.has(nextStep)

                if (!hasPrev && nextStep >= 0 && !occupied.has(nextStep)) {
                    const t = loop * nbTickForLoop + tickForStep(nextStep, stepsPerBeat, nbTickForLoop, tick)
                    ops.push({
                        type: 'anticipation',
                        cost: COST_ADD,
                        fn,
                        target: { t, beat: Math.floor(nextStep / stepsPerBeat), beatStep: nextStep % stepsPerBeat }
                    })
                }

                if (hasPrev && hasNext) {
                    ops.push({ type: 'silence', cost: COST_DELETE, fn })
                }

                ops.push({ type: 'velocity', cost: COST_VELOCITY, fn })
                ops.push({ type: 'pitch', cost: COST_PITCH, fn })

                if (!hasNext && nextStep >= 0 && !occupied.has(nextStep)) {
                    const t = loop * nbTickForLoop + tickForStep(nextStep, stepsPerBeat, nbTickForLoop, tick)
                    ops.push({
                        type: 'double',
                        cost: COST_ADD,
                        fn,
                        target: { t, beat: Math.floor(nextStep / stepsPerBeat), beatStep: nextStep % stepsPerBeat }
                    })
                }
            }

            for (let i = 0; i < sortedSteps.length - 1; i++) {
                const gap = sortedSteps[i + 1] - sortedSteps[i]
                if (gap < 3) continue

                const midStep = sortedSteps[i] + Math.floor(gap / 2)
                const t = loop * nbTickForLoop + tickForStep(midStep, stepsPerBeat, nbTickForLoop, tick)

                ops.push({
                    type: 'ghost',
                    cost: COST_ADD,
                    source: byStep.get(sortedSteps[i]),
                    target: { t, beat: Math.floor(midStep / stepsPerBeat), beatStep: midStep % stepsPerBeat }
                })
            }

            applyOps(flatNotes, track, ops, budget)
        }
    }

    static applyNoteVariation(track) {
        const variation2 = track.variation2 ?? 0
        if (variation2 <= 0) return

        const budget = Math.round(variation2 * 16 / 100)
        const notes = Array.isArray(track.notes) ? track.notes : Object.values(track.notes ?? {})
        applyNoteVariation(notes, budget)
    }
}
