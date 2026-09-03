import { describe, it, expect, beforeEach } from 'vitest'
import { TRACK_DEFAULTS, TRACK_VALUE_RANGES } from '../src/model/track_schema.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import TrackVariation from '../src/patterns/variation.js'
import FlatNote from '../src/model/flatnote.js'

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

    it('does nothing when variation2 is 0', () => {
        const track = {
            stepsPerBeat: 4, variation2: 0,
            notes: [{ beat: 0, beatStep: 0, retriggerNum: 1, rate: 1, euclidianFill: 0 }]
        }
        TrackVariation.applyNoteVariation(track)
        expect(track.notes[0].retriggerNum).toBe(1)
        expect(track.notes[0].rate).toBe(1)
        expect(track.notes[0].euclidianFill).toBe(0)
    })

    it('modifies retrig+rate (sum < 5), euclidianFill (< 3), prob (>= 0.2)', () => {
        let changed = false
        for (let i = 0; i < 20; i++) {
            const notes = [{ beat: 0, beatStep: 0, velocity: 0.8, pitch: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 }]
            const t = { stepsPerBeat: 4, variation2: 100, notes }
            TrackVariation.applyNoteVariation(t)
            const r = notes[0]
            if (r.retriggerNum !== 1 || r.rate !== 1 || r.euclidianFill !== 0 || r.prob !== 1) {
                changed = true
                expect(r.retriggerNum).toBeGreaterThanOrEqual(1)
                expect(r.retriggerNum).toBeLessThanOrEqual(4)
                expect(r.rate).toBeGreaterThanOrEqual(1)
                expect(r.rate).toBeLessThanOrEqual(4)
                expect(r.retriggerNum + r.rate).toBeLessThanOrEqual(5)
                expect(r.euclidianFill).toBeGreaterThanOrEqual(1)
                expect(r.euclidianFill).toBeLessThanOrEqual(2)
                expect(r.prob).toBeGreaterThanOrEqual(0.2)
                expect(r.prob).toBeLessThanOrEqual(1)
                break
            }
        }
        expect(changed).toBe(true)
    })

    it('arp range is modified only when arp exists', () => {
        const trackNoArp = {
            stepsPerBeat: 4, variation2: 100,
            notes: [{ beat: 0, beatStep: 0, every: 1, retriggerNum: 1, rate: 1, euclidianFill: 0, arp: null }]
        }
        TrackVariation.applyNoteVariation(trackNoArp)
        expect(trackNoArp.notes[0].arp).toBeNull()

        let arpChanged = false
        for (let i = 0; i < 20; i++) {
            const notes = [{ beat: 0, beatStep: 0, every: 1, retriggerNum: 1, rate: 1, euclidianFill: 0, arp: [0, 4, 7] }]
            const t = { stepsPerBeat: 4, variation2: 100, notes }
            TrackVariation.applyNoteVariation(t)
            if (notes[0].arp[0] !== 0) {
                arpChanged = true
                expect(notes[0].arp[0]).toBeGreaterThanOrEqual(6)
                expect(notes[0].arp[0]).toBeLessThanOrEqual(12)
                expect(notes[0].arp[1]).toBe(4)
                expect(notes[0].arp[2]).toBe(7)
                break
            }
        }
        expect(arpChanged).toBe(true)
    })

    it('does NOT modify trigger props (every, pos) but CAN modify prob', () => {
        for (let i = 0; i < 20; i++) {
            const notes = [{ beat: 0, beatStep: 0, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 }]
            const t = { stepsPerBeat: 4, variation2: 100, notes }
            TrackVariation.applyNoteVariation(t)
            expect(notes[0].every).toBe(1)
            expect(notes[0].pos).toBe(0)
            expect(notes[0].prob).toBeGreaterThanOrEqual(0.2)
            expect(notes[0].prob).toBeLessThanOrEqual(1)
        }
    })

    it('does not alter beat/velocity/pitch/pan', () => {
        for (let i = 0; i < 20; i++) {
            const notes = [{ beat: 2, beatStep: 3, velocity: 0.9, pitch: 5, pan: 0.3, every: 1, pos: 0, prob: 1, retriggerNum: 1, rate: 1, euclidianFill: 0 }]
            const t = { stepsPerBeat: 4, variation2: 100, notes }
            TrackVariation.applyNoteVariation(t)
            expect(notes[0].beat).toBe(2)
            expect(notes[0].beatStep).toBe(3)
            expect(notes[0].velocity).toBe(0.9)
            expect(notes[0].pitch).toBe(5)
            expect(notes[0].pan).toBe(0.3)
            expect(notes[0].every).toBe(1)
            expect(notes[0].pos).toBe(0)
        }
    })

    it('multiple source notes are all candidates', () => {
        const notes = [
            { beat: 0, beatStep: 0, retriggerNum: 1, rate: 1, euclidianFill: 0 },
            { beat: 1, beatStep: 0, retriggerNum: 1, rate: 1, euclidianFill: 0 },
            { beat: 2, beatStep: 0, retriggerNum: 1, rate: 1, euclidianFill: 0 },
        ]
        const t = { stepsPerBeat: 4, variation2: 100, notes }
        TrackVariation.applyNoteVariation(t)

        let changed = 0
        for (const n of notes) {
            if (n.retriggerNum !== 1 || n.rate !== 1 || n.euclidianFill !== 0 || n.prob !== 1) changed++
        }
        expect(changed).toBeGreaterThanOrEqual(1)
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

    function makeTrack(name = 'KICK', nbBeats = 4, stepsPerBeat = 4) {
        const pattern = cmd.addPattern('Test')
        pattern.nbBeats = nbBeats
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
        const tickPerStep = 8
        const nbTickForLoop = 128

        const flatNotes = new Map()
        const fn0 = makeFlatNote(0, track, 0, 0)
        const fn2 = makeFlatNote(16, track, 0, 2)
        flatNotes.set(0, [fn0])
        flatNotes.set(16, [fn2])

        TrackVariation.apply(flatNotes, track, nbTickForLoop, nbTickForLoop, tickPerStep, 100)

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
})
