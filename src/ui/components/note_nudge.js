// src/ui/components/note_nudge.js
// Shift+Arrow note editing: velocity on Up/Down, pitch on Left/Right. Shared by
// the pattern grid and the piano roll, which use the same gesture.
//
// The value math is pure, so the bounds can be exercised on their own;
// applyNoteNudge() resolves which parameter a direction edits and hands the write
// to the shared applyNoteEdit(), each panel adding its own repaint and gauge.

import { toFiniteNumber } from '../../core/numbers.js'
import { NOTE_DEFAULTS } from '../../core/note_schema.js'
import { applyNoteEdit, AXIS_PITCH, AXIS_VELOCITY } from './note_edit.js'
import { MIDI_MAX, MIDI_MIN, MIDDLE_C } from '../piano_roll/constants.js'

/** Velocity increment per Shift+ArrowUp / Shift+ArrowDown. */
export const VELOCITY_STEP = 0.05

/** Pitch increment per Shift+ArrowRight / Shift+ArrowLeft, in semitones. */
export const PITCH_STEP = 1

/** @type {number} */
const MIN_VELOCITY = 0
/** @type {number} */
const MAX_VELOCITY = 1

/**
 * Velocity after one nudge step. Rounded to 2 decimals like the compact note
 * format does, so a held key does not accumulate float noise, and returned
 * unchanged at a bound so the caller skips a no-op update (and its undo entry).
 *
 * @param {unknown} velocity - current note velocity
 * @param {number} dir - +1 to raise, -1 to lower
 * @returns {number} the new velocity, rounded to 2 decimals
 */
export function nudgeVelocity(velocity, dir) {
    const current = toFiniteNumber(velocity, NOTE_DEFAULTS.velocity, 'nudgeVelocity')
    const next = Math.round((current + dir * VELOCITY_STEP) * 100) / 100
    return next < MIN_VELOCITY || next > MAX_VELOCITY ? current : next
}

/**
 * Pitch after one semitone step, kept inside the rendered keyboard: a note
 * outside MIDI_MIN..MIDI_MAX is not rendered at all, so nudging past the edge
 * would silently drop the selection.
 *
 * @param {unknown} pitch - current note pitch, relative to the track
 * @param {number} dir - +1 to raise, -1 to lower
 * @param {number} [trackPitch] - track transposition, part of the bound
 * @returns {number} the new pitch, in semitones
 */
export function nudgePitch(pitch, dir, trackPitch = 0) {
    const current = Math.round(toFiniteNumber(pitch, NOTE_DEFAULTS.pitch, 'nudgePitch'))
    const next = current + dir * PITCH_STEP
    const min = MIDI_MIN - MIDDLE_C - trackPitch
    const max = MIDI_MAX - MIDDLE_C - trackPitch
    return next < min || next > max ? current : next
}

/**
 * One Shift+Arrow step: computes the new value, records it through the command
 * layer (undoable, and a held key coalesces into a single history entry) and
 * previews the note. Nothing is drawn — the caller repaints and shows the gauge.
 *
 * @param {Object} params
 * @param {{cmd?: Object, seq?: Object}} params.registry - service registry (injected)
 * @param {Object} params.track - owning track
 * @param {number} params.trackIdx - track row, for the preview
 * @param {Object} params.note - the edited note
 * @param {string} params.dir - 'Left' | 'Right' | 'Up' | 'Down'
 * @returns {{key: string, changed: boolean, trackPitch: number, dir: number}}
 *   `key` is the note property, `dir` +1 raised it and -1 lowered it
 */
export function applyNoteNudge({ registry, track, trackIdx, note, dir }) {
    const trackPitch = track?.pitch ?? 0
    const isVelocity = dir === 'Up' || dir === 'Down'
    const raise = dir === 'Up' || dir === 'Right'
    const key = isVelocity ? AXIS_VELOCITY : AXIS_PITCH
    const value = isVelocity
        ? nudgeVelocity(note.velocity, raise ? 1 : -1)
        : nudgePitch(note.pitch, raise ? 1 : -1, trackPitch)
    const changed = applyNoteEdit({ registry, track, trackIdx, note, key, value })
    return { key, changed, trackPitch, dir: raise ? 1 : -1 }
}
