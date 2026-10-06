import { describe, it, expect } from 'vitest'
import { MIDI_MAX, MIDI_MIN, MIDDLE_C } from '../src/ui/piano_roll/piano_roll_constants.js'
import { PITCH_STEP, VELOCITY_STEP, nudgePitch, nudgeVelocity } from '../src/ui/components/note_nudge.js'

describe('nudgeVelocity', () => {
    it('raises and lowers by one step', () => {
        expect(nudgeVelocity(0.5, 1)).toBe(0.5 + VELOCITY_STEP)
        expect(nudgeVelocity(0.5, -1)).toBe(0.5 - VELOCITY_STEP)
    })

    it('stays at 2 decimals over repeated steps', () => {
        let velocity = 0.8
        for (let i = 0; i < 3; i++) velocity = nudgeVelocity(velocity, -1)
        expect(velocity).toBe(0.65)
    })

    it('returns the current value at the bounds', () => {
        expect(nudgeVelocity(1, 1)).toBe(1)
        expect(nudgeVelocity(0, -1)).toBe(0)
    })

    it('falls back to the note default on a non-numeric velocity', () => {
        expect(nudgeVelocity(undefined, -1)).toBe(0.75)
        expect(nudgeVelocity(NaN, -1)).toBe(0.75)
    })
})

describe('nudgePitch', () => {
    it('transposes by one semitone per step', () => {
        expect(PITCH_STEP).toBe(1)
        expect(nudgePitch(0, 1)).toBe(1)
        expect(nudgePitch(0, -1)).toBe(-1)
    })

    it('stops at the edge of the rendered keyboard', () => {
        const top = MIDI_MAX - MIDDLE_C
        const bottom = MIDI_MIN - MIDDLE_C
        expect(nudgePitch(top, 1)).toBe(top)
        expect(nudgePitch(bottom, -1)).toBe(bottom)
        expect(nudgePitch(top, -1)).toBe(top - 1)
    })

    it('includes the track transposition in the bound', () => {
        const trackPitch = 12
        expect(nudgePitch(MIDI_MAX - MIDDLE_C - trackPitch, 1, trackPitch)).toBe(
            MIDI_MAX - MIDDLE_C - trackPitch,
        )
        expect(nudgePitch(MIDI_MIN - MIDDLE_C - trackPitch, -1, trackPitch)).toBe(
            MIDI_MIN - MIDDLE_C - trackPitch,
        )
        expect(nudgePitch(0, 1, trackPitch)).toBe(1)
    })
})
