import Utils from '../core/utils.js'
import MfFlatNote from '../model/flatnote.js'
import MfDefaults from './defaults.js'
import { MAX_LOOP_RETRY, TICK } from '../core/constants.js'

export function isTrigged(triggerPhase, triggerFreq, loop) {
    triggerPhase %= triggerFreq
    return (loop + triggerPhase) % triggerFreq === 0
}

export function isProbabilityTrigged(triggerProbability = 1, random = Math.random) {
    const probability = Math.min(Math.max(Number(triggerProbability), 0), 1)
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
    let intervals = []
    let mode = 'up'

    if (Array.isArray(arp)) {
        intervals = arp
    } else if (typeof arp === 'string') {
        intervals = arp.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value))
    } else if (typeof arp === 'object' && arp !== null) {
        intervals = Array.isArray(arp.intervals) ? arp.intervals : []
        mode = String(arp.mode ?? mode).toLowerCase()
    }

    intervals = intervals.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    if (intervals.length === 0) return null
    if (!intervals.includes(0)) intervals.unshift(0)

    let sequence = intervals
    if (mode === 'down') {
        sequence = [...intervals].sort((a, b) => b - a)
    } else if (mode === 'updown') {
        const ascending = [...intervals].sort((a, b) => a - b)
        const descending = ascending.slice(1, -1).reverse()
        sequence = ascending.concat(descending)
    } else {
        sequence = [...intervals].sort((a, b) => a - b)
    }

    return { sequence }
}

export function getArpNoteCount(note) {
    const totalNotes = parseInt(MfDefaults.getNoteProp(note, 'retriggerNum'))
    return Number.isFinite(totalNotes) ? Math.max(1, Math.min(16, totalNotes)) : 1
}

export function computeTickForNote(note, track, tick = TICK) {
    return note.bar * tick + Math.round((note.barStep * tick) / track.barQuantize)
}

export function computeNbTickForPattern(nbBars, tick = TICK) {
    return tick * nbBars
}

export function computeNbTickForLoop(track, tick = TICK) {
    const trackBars = MfDefaults.getTrackProp(track, 'bars')
    const loopPointStepPc = (track.loopPointStep ?? 0) / track.barQuantize
    return Math.floor((loopPointStepPc + (track.loopPointBar ?? trackBars)) * tick)
}

export function adjustLoopToPattern(nbTickForPattern, nbTickForLoop) {
    let adjusted = nbTickForLoop
    let ii = 0
    while (nbTickForPattern % adjusted !== 0 && ii < MAX_LOOP_RETRY) {
        adjusted++
        ii++
    }
    return adjusted
}

export function expandLoopOccurrences(baseTick, nbTickForLoop, nbTickForPattern) {
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

export function computeTickSpacing(track, retriggerStep, tick = TICK) {
    return Math.round((tick / track.barQuantize) * Utils.getStepSpacing(retriggerStep))
}

export function createArpFlatNote(tick, track, note, semitoneOffset) {
    const arpNote = {
        ...note,
        pitch: MfDefaults.getNoteProp(note, 'pitch') + semitoneOffset
    }
    return new MfFlatNote(tick, track, arpNote)
}

export function createFlatNote(tick, track, note) {
    return new MfFlatNote(tick, track, note)
}

function addFlatNote(flatNotes, tick, flatNote) {
    if (!flatNotes.has(tick)) {
        flatNotes.set(tick, [])
    }
    flatNotes.get(tick).push(flatNote)
}

export function generateSubNotes(flatNotes, baseTick, track, note, nbTickForPattern, tick = TICK) {
    const arpConfig = normalizeArp(note.arp)
    const retriggerStep = MfDefaults.getNoteProp(note, 'retriggerStep')
    const arpTriggerProb = MfDefaults.getNoteProp(note, 'arpTriggerProbability')
    const retriggerNum = MfDefaults.getNoteProp(note, 'retriggerNum')
    const euclidianFill = MfDefaults.getNoteProp(note, 'euclidianFill')

    if (arpConfig && arpConfig.sequence.length > 0) {
        const totalNotes = getArpNoteCount(note)
        const tickSpacing = computeTickSpacing(track, retriggerStep, tick)

        for (let i = 0; i < totalNotes; i++) {
            if (isProbabilityTrigged(arpTriggerProb)) {
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
            const tickSpacing = computeTickSpacing(track, retriggerStep, tick)
            for (let i = 1; i < retriggerNum; i++) {
                const tickPos = baseTick + i * tickSpacing
                if (tickPos < nbTickForPattern) {
                    addFlatNote(flatNotes, tickPos, createFlatNote(tickPos, track, note))
                }
            }
        }
    }

    if (euclidianFill > 0) {
        // euclidianFill needs computeNextPatternStepNote which depends on mfCmd
        // so we handle it separately
    }
}

export function generateSubNotesWithEuclidean(flatNotes, baseTick, track, note, nbTickForPattern, computeNextStep, tick = TICK) {
    generateSubNotes(flatNotes, baseTick, track, note, nbTickForPattern, tick)

    const euclidianFill = MfDefaults.getNoteProp(note, 'euclidianFill')
    if (euclidianFill <= 0) return

    const arpConfig = normalizeArp(note.arp)
    const arpTriggerProb = MfDefaults.getNoteProp(note, 'arpTriggerProbability')

    const startStep = note.bar * track.barQuantize + note.barStep
    const endStep = computeNextStep(note, track)
    const stepsSpan = endStep - startStep

    for (let i = 1; i <= euclidianFill; i++) {
        const tickOffset = Math.round((i * stepsSpan * (tick / track.barQuantize)) / (euclidianFill + 1))
        const tickPos = baseTick + tickOffset

        if (tickPos < nbTickForPattern) {
            if (arpConfig) {
                const totalArpNotes = getArpNoteCount(note)
                const arpIndex = totalArpNotes + i - 1
                if (isProbabilityTrigged(arpTriggerProb)) {
                    const semitoneOffset = arpConfig.sequence[arpIndex % arpConfig.sequence.length]
                    addFlatNote(flatNotes, tickPos, createArpFlatNote(tickPos, track, note, semitoneOffset))
                }
            } else {
                addFlatNote(flatNotes, tickPos, createFlatNote(tickPos, track, note))
            }
        }
    }
}

export function computeFlatNotesFromPattern(djtPattern, loop = 0, computeNextStep = null, tick = TICK) {
    const flatNotes = new Map()
    const nbTickForPattern = computeNbTickForPattern(djtPattern.nbBars, tick)

    const defaultComputeNextStep = (note, track) => {
        const last = track.barQuantize * track.bars
        const first = note.bar * track.barQuantize + note.barStep
        for (let i = first + 1; i < last; i++) {
            const sb = { bar: Math.floor(i / track.barQuantize), step: i % track.barQuantize }
            if (track.notes?.some(n => n.bar === sb.bar && n.barStep === sb.step)) {
                return i
            }
        }
        return track.loopAtStep ?? last
    }
    const resolver = computeNextStep ?? defaultComputeNextStep

    for (const track of Object.values(djtPattern.tracks)) {
        let nbTickForLoop = computeNbTickForLoop(track, tick)
        nbTickForLoop = adjustLoopToPattern(nbTickForPattern, nbTickForLoop)

        for (const note of Object.values(track.notes)) {
            if (!isTrigged(
                MfDefaults.getNoteProp(note, 'triggerPhase'),
                MfDefaults.getNoteProp(note, 'triggerFreq'),
                loop
            ) || !isProbabilityTrigged(MfDefaults.getNoteProp(note, 'triggerProbability'))) {
                continue
            }

            const baseTick = computeTickForNote(note, track, tick)

            if (baseTick >= nbTickForPattern) continue

            const occurrences = expandLoopOccurrences(baseTick, nbTickForLoop, nbTickForPattern)

            for (const t of occurrences) {
                generateSubNotesWithEuclidean(flatNotes, t, track, note, nbTickForPattern, resolver, tick)
            }
        }
    }

    return flatNotes
}
