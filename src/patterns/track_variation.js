import { NOTE_DEFAULTS } from '../core/note_schema.js'
import { stepToBeat, stepToTick } from '../core/notes.js'
import FlatNote from '../model/flat_note.js'
import { soundRegistry } from '../state/sound_registry.js'

const COST_DELETE = 3
const COST_ADD = 3
const COST_VELOCITY = 1
const COST_PITCH = 1

// Every op the Engine layer draws ships with a fixed musical range: the prob_*
// retrig/euclid/arp sliders gate WHETHER an op lands, they do not stretch HOW
// FAR it moves (a retrig stays 1-4, a euclidean variant 1-2, an arp span 6-12).
// The note probability is the one exception: prob_note gates the same way, but
// prob_note_depth (0-100) stretches how far the draw can fall, 100 reaching the
// floor and 0 leaving the note alone. The ceiling stays at 1 — the effect
// thins a line out, it never makes a note more certain than it already was.
const NOTE_PROB_FLOOR = 0.2
const NOTE_PROB_CEILING = 1

/** Play probability drawn for one note at the given Engine Depth (0-100). */
function drawNoteProb(depth) {
    const floor = NOTE_PROB_CEILING - ((NOTE_PROB_CEILING - NOTE_PROB_FLOOR) * depth) / 100
    return Math.round((floor + Math.random() * (NOTE_PROB_CEILING - floor)) * 100) / 100
}

const DEFAULT_MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]

// The Var Pos / Var Prop sliders belong to the manual group: they are hidden
// while track.auto is on, so the auto layers run on amounts the generator
// picked instead (auto_generator writes auto_variation/auto_variation2).
// Before the first generate has primed them the layer still has to shape
// something, otherwise the Groove/Engine panel would have nothing to act on.
// These sit well above the old 20/10: an untouched auto track used to buy
// 3 and 2 operations, which is inaudible against a handful of notes.
const AUTO_VARIATION_FALLBACK = 60
const AUTO_VARIATION2_FALLBACK = 40

/**
 * Slider amount (0-100) to an op budget. The scale is 16 cost units at 100, so
 * a plain rounding would leave the first steps of the slider buying nothing at
 * all — 1, 2 and 3 would all be indistinguishable from 0. Any non-zero amount
 * therefore always buys at least one unit.
 */
function budgetForAmount(amount) {
    if (amount <= 0) return 0
    return Math.max(1, Math.round((amount * 16) / 100))
}

/**
 * Amount of the position/velocity/pitch layer. Auto mode reads the generator
 * budget: null means it has not been picked yet, while an explicit 0 is a
 * real "off" and is honoured.
 */
function variationBudget(track) {
    if (!track.auto) return track.variation ?? 0
    return track.auto_variation ?? AUTO_VARIATION_FALLBACK
}

/** Amount of the per-note layer — same null/0 contract as {@link variationBudget}. */
function noteVariationBudget(track) {
    if (!track.auto) return track.variation2 ?? 0
    return track.auto_variation2 ?? AUTO_VARIATION2_FALLBACK
}

/**
 * Per-note chance (0-100) that an op of this kind is considered at all.
 * 0 means the effect never happens, 100 means it is always a candidate —
 * how many candidates actually land is then capped by the track budget.
 *
 * Every gate lives in the Groove/Engine panel, which only exists in auto mode:
 * with track.auto off the sliders are hidden, so their values must not shape
 * the sound and each gate falls back to its schema default (50).
 */
function opChance(op, track) {
    if (!track.auto) return 50
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

/**
 * Gates every op on its own probability, then shuffles the survivors uniformly
 * so no type is favoured once it passed the gate — the budget alone decides
 * how many of them are applied.
 */
function selectOps(ops, track) {
    const kept = []
    for (let i = 0; i < ops.length; i++) {
        if (Math.random() * 100 < opChance(ops[i], track)) kept.push(ops[i])
    }
    for (let i = kept.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const swap = kept[i]
        kept[i] = kept[j]
        kept[j] = swap
    }
    return kept
}

function removeNote(flatNotes, flatNote) {
    const notes = flatNotes.get(flatNote.tick)
    if (!notes) return
    const idx = notes.indexOf(flatNote)
    if (idx !== -1) notes.splice(idx, 1)
    if (notes.length === 0) flatNotes.delete(flatNote.tick)
}

function pickPitch(track) {
    // pitch_range / pitch_scale_lock are Groove props: inert outside auto mode.
    const range = track.auto ? (track.pitch_range ?? 12) : 12
    const raw = Math.floor(Math.random() * (2 * range + 1)) - range
    if (!track.auto || !track.pitch_scale_lock) return raw
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
    let remaining = budget

    for (const op of selectOps(ops, track)) {
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
                    ...NOTE_DEFAULTS,
                    pitch: op.flatNote.note.pitch ?? 0,
                    velocity: Math.round(Math.max(0.2, (op.flatNote.note.velocity ?? 0.8) * 0.7) * 100) / 100,
                    pan: op.flatNote.note.pan ?? 0,
                    beat: op.target.beat,
                    beatStep: op.target.beatStep,
                }
                const newFlatNote = new FlatNote(op.target.t, track, note)
                if (!flatNotes.has(op.target.t)) flatNotes.set(op.target.t, [])
                flatNotes.get(op.target.t).push(newFlatNote)
                remaining -= op.cost
                break
            }
            case 'double': {
                const note = {
                    ...NOTE_DEFAULTS,
                    pitch: op.flatNote.note.pitch ?? 0,
                    velocity: Math.round((op.flatNote.note.velocity ?? 0.8) * 0.8 * 100) / 100,
                    pan: op.flatNote.note.pan ?? 0,
                    beat: op.target.beat,
                    beatStep: op.target.beatStep,
                }
                const newFlatNote = new FlatNote(op.target.t, track, note)
                if (!flatNotes.has(op.target.t)) flatNotes.set(op.target.t, [])
                flatNotes.get(op.target.t).push(newFlatNote)
                remaining -= op.cost
                break
            }
            case 'ghost': {
                const note = {
                    ...NOTE_DEFAULTS,
                    pitch: op.source.note.pitch ?? 0,
                    velocity: Math.round((op.source.note.velocity ?? 0.8) * 0.5 * 100) / 100,
                    pan: op.source.note.pan ?? 0,
                    beat: op.target.beat,
                    beatStep: op.target.beatStep,
                }
                const newFlatNote = new FlatNote(op.target.t, track, note)
                if (!flatNotes.has(op.target.t)) flatNotes.set(op.target.t, [])
                flatNotes.get(op.target.t).push(newFlatNote)
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

    // Depth 0 means the draw cannot move at all, so the op is not even offered
    // and its cost stays available to the other effects.
    const depth = track.prob_note_depth ?? 100

    const ops = []
    for (let i = 0; i < sourceNotes.length; i++) {
        const note = sourceNotes[i]

        const newRetrig = Math.floor(Math.random() * 4) + 1
        const maxRate = Math.max(1, 4 - newRetrig)
        const newRate = Math.floor(Math.random() * maxRate) + 1
        ops.push({ type: 'retrigRate', cost: COST_RETRIG + COST_RATE, idx: i, newRetrig, newRate })

        const newEucl = Math.floor(Math.random() * 2) + 1
        ops.push({ type: 'euclideanFill', cost: Math.min(newEucl, budget), idx: i, newValue: newEucl })

        if (depth > 0) {
            ops.push({ type: 'prob', cost: COST_PROB, idx: i, newValue: drawNoteProb(depth) })
        }

        if (note.arp && Array.isArray(note.arp) && note.arp.length >= 2) {
            ops.push({ type: 'arpRange', cost: COST_ARP_RANGE, idx: i, newValue: Math.floor(Math.random() * 7) + 6 })
        }
    }

    let remaining = budget

    for (const op of selectOps(ops, track)) {
        if (op.cost > remaining) continue
        const source = sourceNotes[op.idx]

        switch (op.type) {
            case 'retrigRate': {
                const note = cloneVaried(varied, source)
                note.retriggerCount = op.newRetrig
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
    /** @param {Map<number, import('../model/flat_note.js').default[]>} flatNotes @param {import('../model/track_schema.js').Track} track @param {number} tickCountForLoop @param {number} tickCountForPattern @param {number} tick @param {number|null} [variationOverride] */
    static apply(flatNotes, track, tickCountForLoop, tickCountForPattern, tick, variationOverride = null) {
        const variation = variationOverride ?? variationBudget(track)
        if (variation <= 0) return

        const budget = budgetForAmount(variation)
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const totalStepsInLoop = Math.round((tickCountForLoop * stepsPerBeat) / tick)
        const loopCount = Math.max(1, Math.ceil(tickCountForPattern / tickCountForLoop))

        for (let loop = 0; loop < loopCount; loop++) {
            const occupied = new Set()
            const byStep = new Map()

            for (let step = 0; step < totalStepsInLoop; step++) {
                const t = loop * tickCountForLoop + stepToTick(step, stepsPerBeat, tick)
                if (t >= tickCountForPattern) continue

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
                    const t = loop * tickCountForLoop + stepToTick(nextStep, stepsPerBeat, tick)
                    ops.push({
                        type: 'anticipation',
                        cost: COST_ADD,
                        flatNote,
                        target: { t, ...stepToBeat(nextStep, stepsPerBeat) },
                    })
                }

                if (hasPrev && hasNext) {
                    ops.push({ type: 'silence', cost: COST_DELETE, flatNote })
                }

                ops.push({ type: 'velocity', cost: COST_VELOCITY, flatNote })
                ops.push({ type: 'pitch', cost: COST_PITCH, flatNote })

                if (!hasNext && nextStep >= 0 && !occupied.has(nextStep)) {
                    const t = loop * tickCountForLoop + stepToTick(nextStep, stepsPerBeat, tick)
                    ops.push({
                        type: 'double',
                        cost: COST_ADD,
                        flatNote,
                        target: { t, ...stepToBeat(nextStep, stepsPerBeat) },
                    })
                }
            }

            for (let i = 0; i < sortedSteps.length - 1; i++) {
                const gap = sortedSteps[i + 1] - sortedSteps[i]
                if (gap < 3) continue

                const midStep = sortedSteps[i] + Math.floor(gap / 2)
                const t = loop * tickCountForLoop + stepToTick(midStep, stepsPerBeat, tick)

                ops.push({
                    type: 'ghost',
                    cost: COST_ADD,
                    source: byStep.get(sortedSteps[i]),
                    target: { t, ...stepToBeat(midStep, stepsPerBeat) },
                })
            }

            applyOps(flatNotes, track, ops, budget)
        }
    }

    /**
     * variation2 layer for a track's source notes — COMPUTES, mutates nothing.
     * Not to be confused with {@link TrackVariation.apply}, which rewrites the
     * flat-note map in place.
     * @param {import('../model/track_schema.js').Track} track
     * @returns {Map<object, object>|null} Map<sourceNote, variedClone>, or
     * null when variation2 is disabled. Source notes are never modified.
     */
    static computeNoteVariation(track) {
        const variation2 = noteVariationBudget(track)
        if (variation2 <= 0) return null

        const budget = budgetForAmount(variation2)
        const notes = Array.isArray(track.notes) ? track.notes : Object.values(track.notes ?? {})
        return varyNotes(notes, budget, track)
    }
}
