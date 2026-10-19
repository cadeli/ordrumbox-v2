import { describe, it, expect, beforeEach } from 'vitest'
import { TRACK_DEFAULTS, TRACK_VALUE_RANGES } from '../src/model/track_schema.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_loader.js'
import Commander from '../src/logic/commands/commander.js'
import TrackVariation from '../src/patterns/track_variation.js'
import FlatNote from '../src/model/flat_note.js'

// The Engine group only shapes a track while track.auto is on, and in that mode
// the Var Prop slider is hidden, so the layer runs on auto_variation2 instead.
// Ops are gated per-note on prob_* (a track can legitimately end up with no
// varied clone at all), so tests that REQUIRE a clone force the gate open.
const AUTO_ENGINE = {
    auto: true,
    auto_variation2: 100,
    prob_retrig: 100,
    prob_euclid: 100,
    prob_note: 100,
    prob_arp: 100,
}

describe('Track variation2', () => {
    let cmd

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    it('has default value of 0', () => {
        expect(TRACK_DEFAULTS.variation2).toBe(0)
    })

    it('is clamped to 0-100 range', () => {
        expect(TRACK_VALUE_RANGES.variation2).toEqual({ min: 0, max: 100 })
    })

    it('is accepted by updateTrack', () => {
        const pattern = cmd.addPattern('Test')
        const track = cmd.addTrack(pattern, 'KICK')
        cmd.updateTrack(track, { variation2: 50 })
        expect(track.variation2).toBe(50)
    })

    it('is clamped by updateTrack when out of range', () => {
        const pattern = cmd.addPattern('Test')
        const track = cmd.addTrack(pattern, 'KICK')
        cmd.updateTrack(track, { variation2: 150 })
        expect(track.variation2).toBe(100)
        cmd.updateTrack(track, { variation2: -10 })
        expect(track.variation2).toBe(0)
    })

    it('returns null and leaves notes alone when variation2 is 0', () => {
        const track = {
            stepsPerBeat: 4,
            variation2: 0,
            notes: [{ beat: 0, beatStep: 0, retriggerCount: 1, rate: 1, euclideanFill: 0 }],
        }
        expect(TrackVariation.computeNoteVariation(track)).toBeNull()
        expect(track.notes[0].retriggerCount).toBe(1)
        expect(track.notes[0].rate).toBe(1)
        expect(track.notes[0].euclideanFill).toBe(0)
    })

    it('never mutates the source notes (variation2 is a virtual layer)', () => {
        const notes = [
            {
                beat: 0,
                beatStep: 0,
                velocity: 0.8,
                pitch: 0,
                every: 1,
                pos: 0,
                prob: 1,
                retriggerCount: 1,
                rate: 1,
                euclideanFill: 0,
                arp: [0, 4, 7],
            },
        ]
        const pristine = structuredClone(notes)
        const t = { stepsPerBeat: 4, notes, ...AUTO_ENGINE }
        const varied = TrackVariation.computeNoteVariation(t)

        expect(varied).toBeInstanceOf(Map)
        expect(varied.size).toBeGreaterThanOrEqual(1)
        expect(notes).toEqual(pristine)
        // the varied clone is a different object than the source
        const clone = varied.get(notes[0])
        expect(clone).toBeDefined()
        expect(clone).not.toBe(notes[0])
    })

    it('modifies retrig+rate (sum < 5), euclideanFill (< 3), prob (>= 0.2) on clones', () => {
        let changed = false
        for (let i = 0; i < 20; i++) {
            const notes = [
                {
                    beat: 0,
                    beatStep: 0,
                    velocity: 0.8,
                    pitch: 0,
                    every: 1,
                    pos: 0,
                    prob: 1,
                    retriggerCount: 1,
                    rate: 1,
                    euclideanFill: 0,
                },
            ]
            const t = { stepsPerBeat: 4, notes, ...AUTO_ENGINE }
            const varied = TrackVariation.computeNoteVariation(t)
            const r = varied.get(notes[0])
            if (r.retriggerCount !== 1 || r.rate !== 1 || r.euclideanFill !== 0 || r.prob !== 1) {
                changed = true
                expect(r.retriggerCount).toBeGreaterThanOrEqual(1)
                expect(r.retriggerCount).toBeLessThanOrEqual(4)
                expect(r.rate).toBeGreaterThanOrEqual(1)
                expect(r.rate).toBeLessThanOrEqual(4)
                expect(r.retriggerCount + r.rate).toBeLessThanOrEqual(5)
                expect(r.euclideanFill).toBeGreaterThanOrEqual(1)
                expect(r.euclideanFill).toBeLessThanOrEqual(2)
                expect(r.prob).toBeGreaterThanOrEqual(0.2)
                expect(r.prob).toBeLessThanOrEqual(1)
                break
            }
        }
        expect(changed).toBe(true)
    })

    it('arp range is modified only when arp exists (on the clone)', () => {
        const trackNoArp = {
            stepsPerBeat: 4,
            ...AUTO_ENGINE,
            notes: [{ beat: 0, beatStep: 0, every: 1, retriggerCount: 1, rate: 1, euclideanFill: 0, arp: null }],
        }
        const variedNoArp = TrackVariation.computeNoteVariation(trackNoArp)
        expect(variedNoArp.get(trackNoArp.notes[0]).arp).toBeNull()

        let arpChanged = false
        for (let i = 0; i < 20; i++) {
            const notes = [{ beat: 0, beatStep: 0, retriggerCount: 1, rate: 1, euclideanFill: 0, arp: [0, 4, 7] }]
            const t = { stepsPerBeat: 4, notes, ...AUTO_ENGINE }
            const varied = TrackVariation.computeNoteVariation(t)
            const clone = varied.get(notes[0])
            if (clone.arp[0] !== 0) {
                arpChanged = true
                expect(clone.arp[0]).toBeGreaterThanOrEqual(6)
                expect(clone.arp[0]).toBeLessThanOrEqual(12)
                expect(clone.arp[1]).toBe(4)
                expect(clone.arp[2]).toBe(7)
                // source arp untouched
                expect(notes[0].arp).toEqual([0, 4, 7])
                break
            }
        }
        expect(arpChanged).toBe(true)
    })

    it('clone keeps trigger props (every, pos) but gets a varied prob', () => {
        for (let i = 0; i < 20; i++) {
            const notes = [
                { beat: 0, beatStep: 0, every: 1, pos: 0, prob: 1, retriggerCount: 1, rate: 1, euclideanFill: 0 },
            ]
            const t = { stepsPerBeat: 4, notes, ...AUTO_ENGINE }
            const clone = TrackVariation.computeNoteVariation(t).get(notes[0])
            expect(clone.every).toBe(1)
            expect(clone.pos).toBe(0)
            expect(clone.prob).toBeGreaterThanOrEqual(0.2)
            expect(clone.prob).toBeLessThanOrEqual(1)
            expect(notes[0].prob).toBe(1)
        }
    })

    it('does not alter beat/velocity/pitch/pan', () => {
        for (let i = 0; i < 20; i++) {
            const notes = [
                {
                    beat: 2,
                    beatStep: 3,
                    velocity: 0.9,
                    pitch: 5,
                    pan: 0.3,
                    every: 1,
                    pos: 0,
                    prob: 1,
                    retriggerCount: 1,
                    rate: 1,
                    euclideanFill: 0,
                },
            ]
            const t = { stepsPerBeat: 4, notes, ...AUTO_ENGINE }
            const clone = TrackVariation.computeNoteVariation(t).get(notes[0])
            expect(clone.beat).toBe(2)
            expect(clone.beatStep).toBe(3)
            expect(clone.velocity).toBe(0.9)
            expect(clone.pitch).toBe(5)
            expect(clone.pan).toBe(0.3)
            expect(clone.every).toBe(1)
            expect(clone.pos).toBe(0)
            expect(notes[0]).toEqual({
                beat: 2,
                beatStep: 3,
                velocity: 0.9,
                pitch: 5,
                pan: 0.3,
                every: 1,
                pos: 0,
                prob: 1,
                retriggerCount: 1,
                rate: 1,
                euclideanFill: 0,
            })
        }
    })

    it('multiple source notes are all candidates', () => {
        const notes = [
            { beat: 0, beatStep: 0, retriggerCount: 1, rate: 1, euclideanFill: 0 },
            { beat: 1, beatStep: 0, retriggerCount: 1, rate: 1, euclideanFill: 0 },
            { beat: 2, beatStep: 0, retriggerCount: 1, rate: 1, euclideanFill: 0 },
        ]
        const t = { stepsPerBeat: 4, notes, ...AUTO_ENGINE }
        const varied = TrackVariation.computeNoteVariation(t)

        let changed = 0
        for (const source of notes) {
            const clone = varied.get(source)
            if (clone.retriggerCount !== 1 || clone.rate !== 1 || clone.euclideanFill !== 0 || clone.prob !== 1) {
                changed++
            }
        }
        expect(changed).toBeGreaterThanOrEqual(1)
    })
})

describe('prob_* are probabilities, not weights', () => {
    it('prob_retrig = 0 never applies retriggers while the other effects still do', () => {
        for (let i = 0; i < 30; i++) {
            const notes = [{ beat: 0, beatStep: 0, every: 1, prob: 1, retriggerCount: 1, rate: 1, euclideanFill: 0 }]
            const t = { stepsPerBeat: 4, ...AUTO_ENGINE, prob_retrig: 0, notes }
            const clone = TrackVariation.computeNoteVariation(t).get(notes[0])
            expect(clone).toBeDefined()
            expect(clone.retriggerCount).toBe(1)
            expect(clone.rate).toBe(1)
            expect(clone.euclideanFill).not.toBe(0)
        }
    })

    it('prob_euclid = 100 applies the euclidean variant on every note', () => {
        for (let i = 0; i < 30; i++) {
            const notes = [{ beat: 0, beatStep: 0, retriggerCount: 1, rate: 1, euclideanFill: 0 }]
            const t = { stepsPerBeat: 4, ...AUTO_ENGINE, prob_euclid: 100, notes }
            const clone = TrackVariation.computeNoteVariation(t).get(notes[0])
            expect(clone).toBeDefined()
            expect(clone.euclideanFill).toBeGreaterThanOrEqual(1)
            expect(clone.euclideanFill).toBeLessThanOrEqual(2)
        }
    })

    it('every prob_* at 0 yields no variation at all (map holds only varied notes)', () => {
        const notes = [{ beat: 0, beatStep: 0, retriggerCount: 1, rate: 1, euclideanFill: 0, arp: [0, 4, 7] }]
        const base = { stepsPerBeat: 4, auto: true, auto_variation2: 100, notes }

        // Sanity: with the gate open the very same note IS varied, so the
        // zero-prob result below proves the gate works instead of proving nothing.
        expect(TrackVariation.computeNoteVariation({ ...base, ...AUTO_ENGINE }).size).toBe(1)

        const varied = TrackVariation.computeNoteVariation({
            ...base,
            prob_retrig: 0,
            prob_euclid: 0,
            prob_note: 0,
            prob_arp: 0,
        })
        expect(varied.size).toBe(0)
        // pattern_engine falls back to the source note for a missing entry.
        expect(varied.get(notes[0])).toBeUndefined()
        expect(notes[0].retriggerCount).toBe(1)
        expect(notes[0].euclideanFill).toBe(0)
    })
})

// Var Pos / Var Prop / Prob and Groove/Engine are two groups shown one at a
// time: each is read only while its own group is on screen, and otherwise falls
// back to its schema default so a value set in the other mode cannot leak.
describe('manual and auto groups', () => {
    function engineTrack(auto) {
        return {
            stepsPerBeat: 4,
            auto,
            variation2: 100, // manual-group amount: read only when auto is off
            auto_variation2: 100, // auto-group amount: read only when auto is on
            prob_retrig: 0, // the gate under test
            prob_euclid: 100, // keeps a clone around for the assertions below
            prob_note: 100,
            prob_arp: 100,
            notes: [{ beat: 0, beatStep: 0, every: 1, prob: 1, retriggerCount: 1, rate: 1, euclideanFill: 0 }],
        }
    }

    it('prob_* values do not gate anything while auto is off', () => {
        let varied = 0
        for (let i = 0; i < 30; i++) {
            const t = engineTrack(false)
            const clone = TrackVariation.computeNoteVariation(t).get(t.notes[0])
            if (clone && (clone.retriggerCount !== 1 || clone.rate !== 1)) varied++
        }
        // prob_retrig: 0 would have blocked every retrigger; the Engine panel is
        // hidden here, so the gate falls back to its schema default (50).
        expect(varied).toBeGreaterThan(0)
    })

    it('prob_* values gate every op while auto is on', () => {
        for (let i = 0; i < 30; i++) {
            const t = engineTrack(true)
            const clone = TrackVariation.computeNoteVariation(t).get(t.notes[0])
            expect(clone).toBeDefined()
            expect(clone.retriggerCount).toBe(1)
            expect(clone.rate).toBe(1)
        }
    })

    it('the Var Prop slider is ignored while auto is on', () => {
        const t = { stepsPerBeat: 4, auto: true, variation2: 0, notes: [] }
        // Groove/Engine still needs an amount to shape, so the auto layer runs
        // on the generator budget rather than switching off with the slider.
        expect(TrackVariation.computeNoteVariation(t)).not.toBeNull()
    })

    it('the Var Prop slider drives the layer while auto is off', () => {
        const t = { stepsPerBeat: 4, variation2: 0, notes: [] }
        expect(TrackVariation.computeNoteVariation(t)).toBeNull()
    })

    it('a Var Prop of 1 still buys one unit of budget', () => {
        // The 0-100 slider is only 16 budget units wide: without a floor the
        // first steps of the slider would all mean "off" rather than "a little".
        let varied = 0
        for (let i = 0; i < 20; i++) {
            const notes = [{ beat: 0, beatStep: 0, euclideanFill: 0 }]
            const t = { stepsPerBeat: 4, variation2: 1, notes }
            if (TrackVariation.computeNoteVariation(t).size > 0) varied++
        }
        expect(varied).toBeGreaterThan(0)
    })

    it('an explicit auto budget of 0 means off, an unset one falls back', () => {
        const notes = [{ beat: 0, beatStep: 0, euclideanFill: 0 }]
        expect(
            TrackVariation.computeNoteVariation({ stepsPerBeat: 4, auto: true, auto_variation2: 0, notes }),
        ).toBeNull()
        // No budget picked yet: the layer still has to shape something.
        expect(TrackVariation.computeNoteVariation({ stepsPerBeat: 4, auto: true, notes })).not.toBeNull()
    })
})

describe('Engine note-probability depth', () => {
    // Retrig/euclid/arp are gated and drawn on a fixed range; the note
    // probability is the one op whose draw stretches with a slider.
    function noteProbTrack(depth) {
        return {
            stepsPerBeat: 4,
            auto: true,
            auto_variation2: 100,
            prob_retrig: 0,
            prob_euclid: 0,
            prob_arp: 0,
            prob_note: 100,
            prob_note_depth: depth,
            notes: [{ beat: 0, beatStep: 0, every: 1, prob: 1, retriggerCount: 1, rate: 1, euclideanFill: 0 }],
        }
    }

    it('at depth 100 the draw stays inside [0.2, 1] and does move', () => {
        let moved = 0
        for (let i = 0; i < 30; i++) {
            const t = noteProbTrack(100)
            const clone = TrackVariation.computeNoteVariation(t).get(t.notes[0])
            expect(clone.prob).toBeGreaterThanOrEqual(0.2)
            expect(clone.prob).toBeLessThanOrEqual(1)
            if (clone.prob < 1) moved++
        }
        expect(moved).toBeGreaterThan(0)
    })

    it('at depth 50 the draw never falls below 0.6', () => {
        for (let i = 0; i < 30; i++) {
            const t = noteProbTrack(50)
            const clone = TrackVariation.computeNoteVariation(t).get(t.notes[0])
            expect(clone.prob).toBeGreaterThanOrEqual(0.6)
            expect(clone.prob).toBeLessThanOrEqual(1)
        }
    })

    it('at depth 0 the op is not even offered, leaving the budget alone', () => {
        for (let i = 0; i < 10; i++) {
            const t = noteProbTrack(0)
            expect(TrackVariation.computeNoteVariation(t).size).toBe(0)
        }
    })
})

describe('TrackVariation.apply (position-based)', () => {
    let cmd

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    function makeTrack(name = 'KICK', beatCount = 4, stepsPerBeat = 4) {
        const pattern = cmd.addPattern('Test')
        pattern.beatCount = beatCount
        return cmd.addTrack(pattern, name, stepsPerBeat)
    }

    function makeFlatNote(tick, track, beat, beatStep, velocity = 0.8, pitch = 0) {
        const note = { beat, beatStep, velocity, pitch, pan: 0 }
        return new FlatNote(tick, track, note)
    }

    it('variation=0 is a no-op', () => {
        const track = makeTrack()
        track.variation = 0
        const flatNotes = new Map()
        const fn = makeFlatNote(0, track, 0, 0)
        flatNotes.set(0, [fn])
        const before = new Map([...flatNotes].map(([k, v]) => [k, [...v]]))

        TrackVariation.apply(flatNotes, track, 128, 128, 8, 0)

        expect(flatNotes.size).toBe(before.size)
    })

    it('variation>0 with notes spaced apart adds anticipation and double notes', () => {
        const track = makeTrack()
        track.variation = 100
        track.stepsPerBeat = 4
        // Groove gates only shape a track while auto is on.
        track.auto = true
        track.prob_fill = 100
        const tickPerStep = 8
        const tickCountForLoop = 128

        const flatNotes = new Map()
        const fn0 = makeFlatNote(0, track, 0, 0)
        const fn2 = makeFlatNote(16, track, 0, 2)
        flatNotes.set(0, [fn0])
        flatNotes.set(16, [fn2])

        TrackVariation.apply(flatNotes, track, tickCountForLoop, tickCountForLoop, tickPerStep, 100)

        const totalNotes = [...flatNotes.values()].flat().length
        expect(totalNotes).toBeGreaterThan(2)
    })

    it('variation>0 with empty flatNotes does not crash', () => {
        const track = makeTrack()
        track.variation = 80
        const flatNotes = new Map()

        TrackVariation.apply(flatNotes, track, 128, 128, 8, 80)

        expect(flatNotes.size).toBe(0)
    })

    it('variation>0 with single note generates ops', () => {
        const track = makeTrack()
        track.variation = 100
        const flatNotes = new Map()
        const fn = makeFlatNote(0, track, 0, 0)
        flatNotes.set(0, [fn])

        TrackVariation.apply(flatNotes, track, 128, 128, 8, 100)

        const totalNotes = [...flatNotes.values()].flat().length
        expect(totalNotes).toBeGreaterThanOrEqual(1)
    })

    it('prob_pitch = 0 never randomizes pitch, while prob_velocity = 100 still edits', () => {
        const track = makeTrack()
        track.variation = 100
        track.auto = true
        track.prob_pitch = 0
        track.prob_velocity = 100
        track.prob_silence = 0
        track.prob_fill = 0
        track.prob_ghost = 0

        let velocityEdited = 0
        for (let i = 0; i < 30; i++) {
            const flatNotes = new Map()
            flatNotes.set(0, [makeFlatNote(0, track, 0, 0, 0.8, 5)])
            TrackVariation.apply(flatNotes, track, 128, 128, 8, 100)

            const flat = [...flatNotes.values()].flat()
            expect(flat).toHaveLength(1)
            // A zero prob is a gate: the pitch op must never be applied.
            expect(flat[0].note.pitch).toBe(5)
            if (flat[0].note.velocity !== 0.8) velocityEdited++
        }
        // Proof that apply() really ran (otherwise the pitch check is vacuous).
        expect(velocityEdited).toBeGreaterThan(20)
    })

    it('the Var Pos slider is ignored while auto is on', () => {
        const track = makeTrack()
        track.auto = true
        track.variation = 100
        // Budget 2 while an anticipation/double costs 3, so no add can land.
        track.auto_variation = 10
        track.prob_fill = 100

        for (let i = 0; i < 20; i++) {
            const flatNotes = new Map()
            flatNotes.set(0, [makeFlatNote(0, track, 0, 0)])
            // No variationOverride: the amount must come from the track.
            TrackVariation.apply(flatNotes, track, 128, 128, 8)
            expect([...flatNotes.values()].flat()).toHaveLength(1)
        }
    })

    it('the Var Pos slider drives the layer while auto is off', () => {
        const track = makeTrack()
        track.variation = 100

        let added = 0
        for (let i = 0; i < 20; i++) {
            const flatNotes = new Map()
            flatNotes.set(0, [makeFlatNote(0, track, 0, 0)])
            TrackVariation.apply(flatNotes, track, 128, 128, 8)
            if ([...flatNotes.values()].flat().length > 1) added++
        }
        expect(added).toBeGreaterThan(0)
    })

    it('pitch_range is ignored while auto is off', () => {
        const track = makeTrack()
        track.variation = 100
        track.pitch_range = 1

        let wide = 0
        for (let i = 0; i < 40; i++) {
            const flatNotes = new Map()
            flatNotes.set(0, [makeFlatNote(0, track, 0, 0, 0.8, 0)])
            TrackVariation.apply(flatNotes, track, 128, 128, 8)
            for (const fn of [...flatNotes.values()].flat()) {
                if (Math.abs(fn.note.pitch) > 1) wide++
            }
        }
        // A range of 1 would keep every pitch inside [-1, 1]; the Groove panel
        // is hidden here, so the slider value is dropped for the default 12.
        expect(wide).toBeGreaterThan(0)
    })

    it('pitch_range is honoured while auto is on', () => {
        const track = makeTrack()
        track.auto = true
        track.auto_variation = 100
        track.pitch_range = 1
        track.prob_pitch = 100
        track.prob_fill = 0
        track.prob_velocity = 0
        track.prob_silence = 0
        track.prob_ghost = 0

        let changed = 0
        let outOfRange = 0
        for (let i = 0; i < 30; i++) {
            const flatNotes = new Map()
            flatNotes.set(0, [makeFlatNote(0, track, 0, 0, 0.8, 0)])
            TrackVariation.apply(flatNotes, track, 128, 128, 8)

            const flat = [...flatNotes.values()].flat()
            expect(flat).toHaveLength(1)
            if (flat[0].note.pitch !== 0) changed++
            if (Math.abs(flat[0].note.pitch) > 1) outOfRange++
        }
        expect(outOfRange).toBe(0)
        expect(changed).toBeGreaterThan(0)
    })

    it('a Var Pos of 1 still buys one unit of budget', () => {
        const track = makeTrack()
        track.variation = 1

        let changed = 0
        for (let i = 0; i < 40; i++) {
            const flatNotes = new Map()
            flatNotes.set(0, [makeFlatNote(0, track, 0, 0, 0.8, 0)])
            TrackVariation.apply(flatNotes, track, 128, 128, 8)
            if ([...flatNotes.values()].flat().some((fn) => fn.note.pitch !== 0)) changed++
        }
        expect(changed).toBeGreaterThan(0)
    })
})
