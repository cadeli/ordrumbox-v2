// src/ui/components/note_drag.js
// Note drag math shared by the two surfaces that edit notes by pointer: the
// vertical axis moves the velocity, the horizontal one transposes by a semitone,
// and the axis is claimed on the first real movement so a sloppy diagonal
// cannot change both parameters at once. The gesture owns nothing else: each
// surface resolves the note under the pointer and applies the value.

import { clamp, toFiniteNumber } from '../../core/numbers.js'
import { NOTE_DEFAULTS } from '../../core/note_schema.js'
import { AXIS_PITCH, AXIS_VELOCITY } from './note_edit.js'
import { MIDI_MAX, MIDI_MIN, MIDDLE_C } from '../piano_roll/piano_roll_constants.js'

/** Movement in px before the gesture claims an axis. */
export const AXIS_LOCK_PX = 3

/** Velocity per pixel dragged up: a full 0..1 sweep is 200 px. */
export const VELOCITY_PER_PX = 0.005

/** Pixels per semitone dragged right. */
export const PITCH_PX_PER_SEMITONE = 12

export default class NoteDrag {
    #note = null
    #trackPitch = 0
    #axis = null
    #startX = 0
    #startY = 0
    #startValue = 0
    #onStart
    #onValue
    #boundMove
    #boundUp

    /**
     * @param {Object} handlers
     * @param {(note: Object, axis: string, startValue: number) => void} handlers.onStart - once, when the axis is claimed
     * @param {(note: Object, axis: string, value: number, dir: number) => void} handlers.onValue - on every effective change
     */
    constructor({ onStart, onValue }) {
        this.#onStart = onStart
        this.#onValue = onValue
        this.#boundMove = (e) => this.#onMove(e)
        this.#boundUp = () => this.#onUp()
    }

    /**
     * Starts a gesture from a press. No-op when one is already running.
     * @param {MouseEvent} e - the press, for its start position
     * @param {Object} note - the note being edited
     * @param {number} [trackPitch] - track transposition, part of the pitch bound
     */
    begin(e, note, trackPitch = 0) {
        if (this.#note) return
        this.#note = note
        this.#trackPitch = trackPitch
        this.#axis = null
        this.#startX = e.clientX
        this.#startY = e.clientY
        // Window-level, like the knobs: the pointer leaves the note long before
        // a slow drag ends.
        window.addEventListener('mousemove', this.#boundMove)
        window.addEventListener('mouseup', this.#boundUp)
    }

    /** @returns {string|null} the claimed axis, null while no movement happened */
    get axis() {
        return this.#axis
    }

    /**
     * True when the click ending a gesture must be ignored: clicking an already
     * selected note deletes it, and a drag ends over that same note.
     * @returns {boolean}
     */
    consumeClick() {
        const dragged = this.#axis !== null
        this.#reset()
        return dragged
    }

    /** Drops a running gesture (panel hide / destroy). */
    cancel() {
        this.#reset()
    }

    #onMove(e) {
        const note = this.#note
        if (!note) return
        const dx = e.clientX - this.#startX
        const dy = this.#startY - e.clientY // dragging up is positive

        if (!this.#axis) {
            if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
            this.#axis = Math.abs(dx) >= Math.abs(dy) ? AXIS_PITCH : AXIS_VELOCITY
            this.#startValue =
                this.#axis === AXIS_PITCH
                    ? Math.round(toFiniteNumber(note.pitch, NOTE_DEFAULTS.pitch))
                    : toFiniteNumber(note.velocity, NOTE_DEFAULTS.velocity)
            this.#onStart(note, this.#axis, this.#startValue)
        }

        const isPitch = this.#axis === AXIS_PITCH
        const value = isPitch
            ? clamp(
                  this.#startValue + Math.round(dx / PITCH_PX_PER_SEMITONE),
                  MIDI_MIN - MIDDLE_C - this.#trackPitch,
                  MIDI_MAX - MIDDLE_C - this.#trackPitch,
              )
            : Math.round(clamp(this.#startValue + dy * VELOCITY_PER_PX, 0, 1) * 100) / 100
        if (Object.is(note[this.#axis], value)) return
        this.#onValue(note, this.#axis, value, value > this.#startValue ? 1 : -1)
    }

    #onUp() {
        this.#reset()
    }

    #reset() {
        window.removeEventListener('mousemove', this.#boundMove)
        window.removeEventListener('mouseup', this.#boundUp)
        this.#note = null
        this.#axis = null
    }
}