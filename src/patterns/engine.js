import Utils from '../core/utils.js'
import FlatNote from '../model/flatnote.js'
import Defaults from './defaults.js'
import TrackVariation from './variation.js'
import { TICK } from '../core/constants.js'
import { computeEuclideanFillPositions } from '../core/euclidean.js'
import { createStepResolver } from './step_resolver.js'

export function isTriggered(pos, every, loop) {
    pos %= every
    return (loop + pos) % every === 0
}

export function isProbabilityTriggered(prob = 1, random = Math.random) {
    const probability = Utils.clamp(Number(prob), 0, 1)
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
    const totalNotes = parseInt(note.retriggerNum ?? 1)
    return Number.isFinite(totalNotes) ? Utils.clamp(totalNotes, 1, 16) : 1
}

export function computeTickForNote(note, track, tick = TICK) {
    return Utils.stepToTick(Utils.getNoteAbsoluteStep(note, track.stepsPerBeat), track.stepsPerBeat, tick)
}

export function computeNbTickForPattern(beatCount, tick = TICK) {
    return tick * beatCount
}

export function computeNbTickForLoop(track, tick = TICK) {
    const stepsPerBeat = track.stepsPerBeat ?? 4
    const trackBeats = Defaults.getTrackProp(track, 'beatCount')
    const loopPointStepPc = (track.loopPointStep ?? 0) / stepsPerBeat
    return Math.floor((loopPointStepPc + (track.loopPointBeat ?? trackBeats)) * tick)
}

export function expandLoopOccurrences(baseTick, nbTickForLoop, nbTickForPattern) {
    if (baseTick >= nbTickForLoop) {
        return [baseTick]
    }
    const occurrences = [baseTick]
    if (nbTickForLoop < nbTickForPattern) {
        let currentTick = baseTick + nbTickForLoop
        while (currentTick < nbTickForPattern) {
            occurrences.push(currentTick)
            currentTick += nbTickForLoop
        }
    }
    return occurrences
}

export function computeTickSpacing(track, rate, tick = TICK) {
    return Math.round((tick / track.stepsPerBeat) * Utils.getStepSpacing(rate))
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

export function generateSubNotes(flatNotes, baseTick, track, note, nbTickForPattern, tick = TICK) {
    const arpConfig = normalizeArp(note.arp)
    const rate = note.rate ?? 1
    const arpTriggerProb = note.arpTriggerProbability ?? 1
    const retriggerNum = note.retriggerNum ?? 1

    if (arpConfig && arpConfig.sequence.length > 0) {
        const totalNotes = getArpNoteCount(note)
        const tickSpacing = computeTickSpacing(track, rate, tick)

        for (let i = 0; i < totalNotes; i++) {
            if (isProbabilityTriggered(arpTriggerProb)) {
                const tickPos = baseTick + i * tickSpacing
                if (tickPos < nbTickForPattern) {
                    const semitoneOffset = arpConfig.sequence[i % arpConfig.sequence.length]
                    addFlatNote(flatNotes, tickPos, createArpFlatNote(tickPos, track, note, semitoneOffset))
                }
            }
        }
    } else {
        addFlatNote(flatNotes, baseTick, createFlatNote(baseTick, track, note))

        if (retriggerNum > 1) {
            const tickSpacing = computeTickSpacing(track, rate, tick)
            for (let i = 1; i < retriggerNum; i++) {
                const tickPos = baseTick + i * tickSpacing
                if (tickPos < nbTickForPattern && isProbabilityTriggered(arpTriggerProb)) {
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
    nbTickForPattern,
    computeNextStep = null,
    tick = TICK,
) {
    generateSubNotes(flatNotes, baseTick, track, note, nbTickForPattern, tick)

    const euclideanFill = note.euclideanFill ?? 0
    if (euclideanFill <= 0) return

    const arpConfig = normalizeArp(note.arp)
    const arpTriggerProb = note.arpTriggerProbability ?? 1

    // Positions are computed in discrete steps first (identical to the UI
    // views), then converted to ticks — never the other way around.
    const startStep = Utils.getNoteAbsoluteStep(note, track.stepsPerBeat ?? 4)
    const endStep = (computeNextStep ?? createStepResolver(track))(note, track)
    const stepsSpan = endStep - startStep
    const ticksPerStep = tick / track.stepsPerBeat
    const positions = computeEuclideanFillPositions(startStep, stepsSpan, euclideanFill, note.euclideanRotation ?? 0)

    for (let i = 0; i < positions.length; i++) {
        const tickPos = baseTick + Math.round((positions[i] - startStep) * ticksPerStep)

        if (tickPos < nbTickForPattern) {
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

export function recomputeFlatNotes(djtPattern, loop = 0, tick = TICK) {
    const flatNotes = new Map()
    const nbTickForPattern = computeNbTickForPattern(djtPattern.beatCount, tick)

    for (const track of Object.values(djtPattern.tracks)) {
        const nbTickForLoop = computeNbTickForLoop(track, tick)

        // variation2 layer: lookup of per-source-note clones, source data untouched
        const variedNotes = TrackVariation.applyNoteVariation(track)

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

            if (baseTick >= nbTickForPattern) continue

            const occurrences = expandLoopOccurrences(baseTick, nbTickForLoop, nbTickForPattern)

            for (const t of occurrences) {
                generateSubNotesWithEuclidean(flatNotes, t, track, note, nbTickForPattern, resolver, tick)
            }
        }

        TrackVariation.apply(flatNotes, track, nbTickForLoop, nbTickForPattern, tick)
    }

    return flatNotes
}
