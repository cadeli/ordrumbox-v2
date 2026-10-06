// src/ui/piano_roll/hit_test.js
// Shared hit-testing helpers: pointer position to grid cell, cell to note.

import { MIDDLE_C, NOTE_HEIGHT, TOTAL_KEYS } from './piano_roll_constants.js'

/**
 * Convert a pointer event inside the grid element into a grid cell.
 * @param {MouseEvent} e
 * @param {Element} gridEl
 * @param {number} cellWidth
 * @param {{pageStartStep: number, totalSteps: number, stepsPerBeat: number}} pageInfo
 * @returns {{step: number, pageStep: number, row: number, beat: number, beatStep: number}|null}
 */
export function pointToCell(e, gridEl, cellWidth, pageInfo) {
    const rect = gridEl.getBoundingClientRect()
    const pageStep = Math.floor((e.clientX - rect.left) / cellWidth)
    const step = pageInfo.pageStartStep + pageStep
    const row = TOTAL_KEYS - 1 - Math.floor((e.clientY - rect.top) / NOTE_HEIGHT)
    if (step < 0 || step >= pageInfo.totalSteps || row < 0 || row >= TOTAL_KEYS) return null
    return {
        step,
        pageStep,
        row,
        beat: Math.floor(step / pageInfo.stepsPerBeat),
        beatStep: step % pageInfo.stepsPerBeat,
    }
}

/**
 * Find the note on a track at an absolute grid cell (beat, step, midi).
 * @param {Object} track
 * @param {number} beat
 * @param {number} beatStep
 * @param {number} midi
 * @returns {Object|null}
 */
export function findNoteAt(track, beat, beatStep, midi) {
    const trackPitchOffset = track.pitch ?? 0
    const note = (track.notes ?? []).find(
        (n) => n.beat === beat && n.beatStep === beatStep && MIDDLE_C + trackPitchOffset + (n.pitch ?? 0) === midi,
    )
    return note ?? null
}
