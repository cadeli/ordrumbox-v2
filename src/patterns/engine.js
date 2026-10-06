import { clamp } from '../core/numbers.js'
import { getNoteAbsoluteStep, getStepSpacing, stepToTick } from '../core/notes.js'
import FlatNote from '../model/flatnote.js'
import Defaults from './defaults.js'
import TrackVariation from './variation.js'
import { TICK } from '../core/constants.js'
import { computeEuclideanFillPositions } from '../core/euclidean.js'
import { createStepResolver } from './step_resolver.js'

/**
 * Does the note fire on this pass of the pattern?
 * @param {number} pos    note phase offset inside the cycle (note.pos)
 * @param {number} every  cycle length in pattern passes (note.every)
 * @param {number} loop   the pass being played (pattern loop index)
 * @returns {boolean}
 */
export function isTriggered(pos, every, loop) {
    pos %= every
    return (loop + pos) % every === 0
}

export function isProbabilityTriggered(prob = 1, random = Math.random) {
    const probability = clamp(Number(prob), 0, 1)
    return probability >= 1 || random() < probability
}

export function hasArp(arp) {
    if (arp == null) return false
    if (Array.isArray(arp)) return arp.length > 0
    if (typeof arp === 'string') return arp.trim().length > 0
    if (typeof arp === 'object') return Array.isArray(arp.intervals) ? arp.intervals.length > 0 : true
    return false
}

export function normalizeArp(arp) {
    let intervals
    let mode = 'up'

    if (Array.isArray(arp)) {
        intervals = arp
    } else if (typeof arp === 'string') {
        if (!/\d/.test(arp)) return null
        const parts = arp.split(',')
        const result = []
        for (let i = 0; i < parts.length; i++) {
            const v = Number(parts[i].trim())
            if (Number.isFinite(v)) result.push(v)
        }
        intervals = result
    } else if (typeof arp === 'object' && arp !== null) {
        intervals = Array.isArray(arp.intervals) ? arp.intervals : []
        mode = String(arp.mode ?? mode).toLowerCase()
    } else {
        return null
    }

    const filtered = []
    for (let i = 0; i < intervals.length; i++) {
        const v = Number(intervals[i])
        if (Number.isFinite(v)) filtered.push(v)
    }
    if (filtered.length === 0) return null
    if (!filtered.includes(0)) filtered.unshift(0)

    let sequence
    if (mode === 'down') {
        sequence = [...filtered].sort((a, b) => b - a)
    } else if (mode === 'updown') {
        const ascending = [...filtered].sort((a, b) => a - b)
        const descending = ascending.slice(1, -1).reverse()
        sequence = ascending.concat(descending)
    } else {
        sequence = [...filtered].sort((a, b) => a - b)
    }

    return { sequence }
}

export function getArpNoteCount(note) {
    const totalNotes = parseInt(note.retriggerCount ?? 1)
    return Number.isFinite(totalNotes) ? clamp(totalNotes, 1, 16) : 1
}

export function computeTickForNote(note, track, tick = TICK) {
    return stepToTick(getNoteAbsoluteStep(note, track.stepsPerBeat), track.stepsPerBeat, tick)
}

export function computeTickCountForPattern(beatCount, tick = TICK) {
    return tick * beatCount
}

/**
 * Length of one loop of `track`, in ticks.
 *
 * Reads the track's single loop field (loopAtStep, in steps) and falls back to the
 * track's own length, so a track with no loop point loops over beatCount beats
 * rather than not at all.
 */
export function computeTickCountForLoop(track, tick = TICK) {
    const stepsPerBeat = track.stepsPerBeat ?? 4
    const declared = Number(track.loopAtStep)
    const trackBeats = Defaults.getTrackProp(track, 'beatCount')
    const loopSteps = Number.isFinite(declared) && declared > 0 ? declared : trackBeats * stepsPerBeat
    return Math.floor((loopSteps / stepsPerBeat) * tick)
}

export function expandLoopOccurrences(baseTick, tickCountForLoop, tickCountForPattern) {
    if (baseTick >= tickCountForLoop) {
        return [baseTick]
    }
    const occurrences = [baseTick]
    if (tickCountForLoop < tickCountForPattern) {
        let currentTick = baseTick + tickCountForLoop
        while (currentTick < tickCountForPattern) {
            occurrences.push(currentTick)
            currentTick += tickCountForLoop
        }
    }
    return occurrences
}

export function computeTickSpacing(track, rate, tick = TICK) {
    return Math.round((tick / track.stepsPerBeat) * getStepSpacing(rate))
}

export function createArpFlatNote(tick, track, note, semitoneOffset) {
    const arpNote = {
        ...note,
        pitch: (note.pitch ?? 0) + semitoneOffset,
    }
    return new FlatNote(tick, track, arpNote)
}

function createFlatNote(tick, track, note) {
    return new FlatNote(tick, track, note)
}

function addFlatNote(flatNotes, tick, flatNote) {
    if (!flatNotes.has(tick)) {
        flatNotes.set(tick, [])
    }
    flatNotes.get(tick).push(flatNote)
}

export function generateSubNotes(flatNotes, baseTick, track, note, tickCountForPattern, tick = TICK) {
    const arpConfig = normalizeArp(note.arp)
    const rate = note.rate ?? 1
    const arpTriggerProb = note.arpTriggerProbability ?? 1
    const retriggerCount = note.retriggerCount ?? 1

    if (arpConfig && arpConfig.sequence.length > 0) {
        const totalNotes = getArpNoteCount(note)
        const tickSpacing = computeTickSpacing(track, rate, tick)

        for (let i = 0; i < totalNotes; i++) {
            if (isProbabilityTriggered(arpTriggerProb)) {
                const tickPos = baseTick + i * tickSpacing
                if (tickPos < tickCountForPattern) {
                    const semitoneOffset = arpConfig.sequence[i % arpConfig.sequence.length]
                    addFlatNote(flatNotes, tickPos, createArpFlatNote(tickPos, track, note, semitoneOffset))
                }
            }
        }
    } else {
        addFlatNote(flatNotes, baseTick, createFlatNote(baseTick, track, note))

        if (retriggerCount > 1) {
            const tickSpacing = computeTickSpacing(track, rate, tick)
            for (let i = 1; i < retriggerCount; i++) {
                const tickPos = baseTick + i * tickSpacing
                if (tickPos < tickCountForPattern && isProbabilityTriggered(arpTriggerProb)) {
                    addFlatNote(flatNotes, tickPos, createFlatNote(tickPos, track, note))
                }
            }
        }
    }
}

export function generateSubNotesWithEuclidean(
    flatNotes,
    baseTick,
    track,
    note,
    tickCountForPattern,
    computeNextStep = null,
    tick = TICK,
) {
    generateSubNotes(flatNotes, baseTick, track, note, tickCountForPattern, tick)

    const euclideanFill = note.euclideanFill ?? 0
    if (euclideanFill <= 0) return

    const arpConfig = normalizeArp(note.arp)
    const arpTriggerProb = note.arpTriggerProbability ?? 1

    // Positions are computed in discrete steps first (identical to the UI
    // views), then converted to ticks — never the other way around.
    const startStep = getNoteAbsoluteStep(note, track.stepsPerBeat ?? 4)
    const endStep = (computeNextStep ?? createStepResolver(track))(note, track)
    const stepsSpan = endStep - startStep
    const ticksPerStep = tick / track.stepsPerBeat
    const positions = computeEuclideanFillPositions(startStep, stepsSpan, euclideanFill, note.euclideanRotation ?? 0)

    for (let i = 0; i < positions.length; i++) {
        const tickPos = baseTick + Math.round((positions[i] - startStep) * ticksPerStep)

        if (tickPos < tickCountForPattern) {
            if (arpConfig) {
                const totalArpNotes = getArpNoteCount(note)
                const arpIndex = totalArpNotes + i
                if (isProbabilityTriggered(arpTriggerProb)) {
                    const semitoneOffset = arpConfig.sequence[arpIndex % arpConfig.sequence.length]
                    addFlatNote(flatNotes, tickPos, createArpFlatNote(tickPos, track, note, semitoneOffset))
                }
            } else {
                if (isProbabilityTriggered(arpTriggerProb)) {
                    addFlatNote(flatNotes, tickPos, createFlatNote(tickPos, track, note))
                }
            }
        }
    }
}

export function recomputeFlatNotes(pattern, loop = 0, tick = TICK) {
    const flatNotes = new Map()
    const tickCountForPattern = computeTickCountForPattern(pattern.beatCount, tick)

    for (const track of Object.values(pattern.tracks)) {
        const tickCountForLoop = computeTickCountForLoop(track, tick)

        // variation2 layer: lookup of per-source-note clones, source data untouched
        const variedNotes = TrackVariation.computeNoteVariation(track)

        const resolver = createStepResolver(track)

        for (const sourceNote of Object.values(track.notes)) {
            const note = variedNotes?.get(sourceNote) ?? sourceNote
            const pos = note.pos ?? 0
            const every = note.every ?? 1
            if (
                !isTriggered(pos, every, loop) ||
                !isProbabilityTriggered((track.probability ?? 1) * (note.prob ?? 1))
            ) {
                continue
            }

            const baseTick = computeTickForNote(note, track, tick)

            if (baseTick >= tickCountForPattern) continue

            const occurrences = expandLoopOccurrences(baseTick, tickCountForLoop, tickCountForPattern)

            for (const t of occurrences) {
                generateSubNotesWithEuclidean(flatNotes, t, track, note, tickCountForPattern, resolver, tick)
            }
        }

        TrackVariation.apply(flatNotes, track, tickCountForLoop, tickCountForPattern, tick)
    }

    return flatNotes
}
