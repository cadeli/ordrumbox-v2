// src/patterns/note_positions.js
// Shared sub-note position math (retrigger/arp ghosts + euclidean fills)
// for the pattern grid and the piano roll.

import Utils from '../core/utils.js'
import { computeEuclideanFillPositions } from '../core/euclidean.js'
import { getArpNoteCount, normalizeArp } from './engine.js'
import { createStepResolver } from './step_resolver.js'

/**
 * Positions of a note's sub-events: retrigger/arp ghosts and euclidean fills.
 * `pitchOffset` is the arp sequence step relative to the note row — the pattern
 * grid ignores it (no pitch dimension), the piano roll renders it.
 *
 * @param {object} note
 * @param {object} track
 * @param {number} totalSteps - bar length in steps (positions beyond are dropped)
 * @param {Function} [resolveSpanEnd] - note → exclusive end step (span resolver)
 * @returns {Array<{pos: number, type: 'retrigger'|'euclidian', pitchOffset: number}>}
 */
export function getNoteSubPositions(note, track, totalSteps, resolveSpanEnd = createStepResolver(track)) {
    const stepsPerBeat = track.stepsPerBeat ?? 4
    const basePos = Utils.getNoteAbsoluteStep(note, stepsPerBeat)
    const rate = note.rate ?? 1
    const euclidianFill = note.euclidianFill ?? 0
    const arpConfig = normalizeArp(note.arp)
    // The engine clamps the arp note count: keep the ghosts on the same steps.
    const retriggerNum = arpConfig ? getArpNoteCount(note) : (note.retriggerNum ?? 1)
    const hasTriggers = arpConfig || retriggerNum > 1 || euclidianFill > 0

    const positions = []
    if (!hasTriggers) return positions

    const stepSpacing = Utils.getStepSpacing(rate)
    const seq = arpConfig?.sequence

    for (let i = 1; i < retriggerNum; i++) {
        const pos = Math.round(basePos + i * stepSpacing)
        if (pos < totalSteps) positions.push({ pos, type: 'retrigger', pitchOffset: seq ? seq[i % seq.length] : 0 })
    }

    if (euclidianFill > 0) {
        const stepsSpan = resolveSpanEnd(note) - basePos
        const euclideanPositions = computeEuclideanFillPositions(
            basePos,
            stepsSpan,
            euclidianFill,
            note.euclidianRotation ?? 0,
        )
        let euclidIndex = 0
        for (const pos of euclideanPositions) {
            if (pos < totalSteps)
                positions.push({
                    pos,
                    type: 'euclidian',
                    pitchOffset: seq ? seq[(retriggerNum + euclidIndex) % seq.length] : 0,
                })
            euclidIndex++
        }
    }
    return positions
}
