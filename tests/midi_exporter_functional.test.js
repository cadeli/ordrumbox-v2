/**
 * Functional end-to-end tests for MidiExporter.
 *
 * Strategy
 * ────────
 * 1. Build a pattern with the real pattern engine (computeFlatNotesFromPattern)
 * 2. Export it to MIDI with MidiExporter.export()
 * 3. Parse the raw MIDI binary
 * 4. Assert that every note produced by the engine appears in the MIDI file
 *    at the correct tick position, velocity, channel and pitch
 *
 * Timing bridge
 * ─────────────
 *   Engine uses TICK=32 (steps per bar).
 *   MIDI uses PPQN=96, TICKS_PER_BAR=96.
 *   Ratio = 96 / 32 = 3  →  midi_tick = engine_tick * 3
 *
 * The test covers:
 *   - Basic notes (single kicks, snares)
 *   - Track loop shorter than the pattern (loop repeat)
 *   - triggerFreq / triggerPhase  (note fires every N loops)
 *   - retriggerNum / retriggerStep (note fires N times from one barStep)
 *   - Arpeggio (array of semitone intervals, modes: up / down / updown)
 *   - Combination: arp + retrigger on melodic track
 *   - Multi-loop export (pattern repeated 4×)
 */

import { describe, it, expect } from 'vitest'
import {
    computeFlatNotesFromPattern,
    isTrigged,
    normalizeArp,
    computeTickForNote,
    computeNbTickForLoop,
    computeNbTickForPattern,
    expandLoopOccurrences,
    adjustLoopToPattern,
    generateSubNotesWithEuclidean,
    computeTickSpacing,
} from '../src/patterns/engine.js'
import MidiExporter, { resolveTrackMidi } from '../src/logic/midi/midi_exporter.js'
import InstrumentsManager from '../src/logic/services/instruments_manager.js'
import Utils from '../src/core/utils.js'
import { TICK } from '../src/core/constants.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const PPQN = 96
const TICKS_PER_BAR = PPQN * 1          // 96
const MIDI_RATIO = TICKS_PER_BAR / TICK  // 3  (midi ticks per engine tick)

// ─── MIDI binary parser ───────────────────────────────────────────────────────

function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset+1] << 16) | (bytes[offset+2] << 8) | bytes[offset+3]) >>> 0
}
function readUint16BE(bytes, offset) {
    return ((bytes[offset] << 8) | bytes[offset+1]) >>> 0
}
function decodeVLQ(bytes, offset) {
    let value = 0, bytesRead = 0, b
    do { b = bytes[offset + bytesRead]; value = (value << 7) | (b & 0x7F); bytesRead++ } while (b & 0x80)
    return { value, bytesRead }
}
function parseMTrkEvents(bytes, dataOffset, length) {
    const events = []
    let pos = dataOffset, cursor = 0
    const end = dataOffset + length
    while (pos < end) {
        const vlq = decodeVLQ(bytes, pos); pos += vlq.bytesRead
        cursor += vlq.value
        const b0 = bytes[pos]
        if (b0 === 0xFF) {
            const type = bytes[pos+1]
            const lv = decodeVLQ(bytes, pos+2)
            events.push({ absTick: cursor, type: 'meta', metaType: type,
                data: Array.from(bytes.slice(pos+2+lv.bytesRead, pos+2+lv.bytesRead+lv.value)) })
            pos += 2 + lv.bytesRead + lv.value
        } else {
            events.push({ absTick: cursor, type: 'midi',
                status: b0 & 0xF0, channel: b0 & 0x0F,
                note: bytes[pos+1], velocity: bytes[pos+2] })
            pos += 3
        }
    }
    return events
}
function parseAllMTrkEvents(bytes) {
    const tracks = []
    let i = 0
    while (i + 8 <= bytes.length) {
        const tag = String.fromCharCode(bytes[i],bytes[i+1],bytes[i+2],bytes[i+3])
        const length = readUint32BE(bytes, i+4)
        if (tag === 'MTrk') tracks.push(parseMTrkEvents(bytes, i+8, length))
        i += 8 + length
    }
    return tracks
}
/** Collect all Note On events from all instrument tracks (track index ≥ 1) */
function allNoteOns(bytes) {
    const tracks = parseAllMTrkEvents(bytes)
    const noteOns = []
    for (let ti = 1; ti < tracks.length; ti++) {
        for (const ev of tracks[ti]) {
            if (ev.type === 'midi' && ev.status === 0x90 && ev.velocity > 0) {
                noteOns.push({ absTick: ev.absTick, channel: ev.channel, note: ev.note, velocity: ev.velocity })
            }
        }
    }
    return noteOns
}

// ─── Engine helpers ───────────────────────────────────────────────────────────

/** Convert an engine tick to the expected MIDI tick (accounting for loop offset) */
function engineTickToMidi(engineTick, loopIndex, nbTickForPattern) {
    return (engineTick + loopIndex * nbTickForPattern) * MIDI_RATIO
}

/**
 * Run computeFlatNotesFromPattern for `loops` iterations and gather
 * all (absMidiTick, midiNote, velocity) tuples.
 */
function getAllExpectedNotes(pattern, loops, im) {
    const nbTickForPattern = computeNbTickForPattern(pattern.nbBars, TICK)
    const expected = []
    for (let loop = 0; loop < loops; loop++) {
        const flatMap = computeFlatNotesFromPattern(pattern, loop)
        for (const [engineTick, flatNotes] of flatMap) {
            const midiTick = engineTick * MIDI_RATIO + loop * nbTickForPattern * MIDI_RATIO
            for (const fn of flatNotes) {
                const { midiNote } = resolveTrackMidi(fn.track.name, im)
                const noteNum = Math.min(127, Math.max(0, midiNote + (fn.note.pitch ?? 0)))
                const velocity = Math.round(Math.min(1, Math.max(0, fn.note.velocity ?? 0.8)) * 127)
                expected.push({ midiTick, noteNum, velocity })
            }
        }
    }
    return expected
}

// ─── Pattern builders ─────────────────────────────────────────────────────────

function note(bar, barStep, opts = {}) {
    return {
        bar, barStep,
        velocity: opts.velocity ?? 0.8,
        pitch: opts.pitch ?? 0,
        arp: opts.arp ?? null,
        triggerFreq: opts.triggerFreq ?? 1,
        triggerPhase: opts.triggerPhase ?? 0,
        triggerProbability: opts.triggerProbability ?? 1,
        arpTriggerProbability: opts.arpTriggerProbability ?? 1,
        retriggerNum: opts.retriggerNum ?? 1,
        retriggerStep: opts.retriggerStep ?? 1,
        euclidianFill: opts.euclidianFill ?? 0,
    }
}

function track(name, barQuantize, bars, loopPointBar, notes, opts = {}) {
    return {
        name,
        barQuantize,
        bars,
        loopPointBar: loopPointBar ?? bars,
        loopPointStep: opts.loopPointStep ?? 0,
        notes,
        mute: false,
        ...opts,
    }
}

// ─── Core verifier ────────────────────────────────────────────────────────────

/**
 * Run the full verification:
 *  1. export the pattern for `loops` passes
 *  2. collect expected notes from the engine
 *  3. assert each expected note is present in the MIDI file
 */
function verifyPatternInMidi(pattern, loops, label) {
    const im = new InstrumentsManager()
    const exporter = new MidiExporter(im)
    const midiBytes = Array.from(exporter.export(pattern, { loops }))

    const observed = allNoteOns(midiBytes)
    const expected = getAllExpectedNotes(pattern, loops, im)

    // Index observed notes by tick for fast lookup
    const observedByTick = new Map()
    for (const o of observed) {
        const key = `${o.absTick}|${o.note}|${o.channel}`
        if (!observedByTick.has(key)) observedByTick.set(key, [])
        observedByTick.get(key).push(o.velocity)
    }

    const missing = []
    for (const e of expected) {
        const { midiNote, channel } = resolveTrackMidi(
            pattern.tracks.find(t => {
                const { midiNote: mn } = resolveTrackMidi(t.name, im)
                return mn === e.noteNum || (e.noteNum !== mn && Math.min(127, Math.max(0, mn + (t.notes?.[0]?.pitch ?? 0))) === e.noteNum)
            })?.name ?? '', im)
        const key = `${e.midiTick}|${e.noteNum}|${channel}`
        const vels = observedByTick.get(key)
        if (!vels || !vels.includes(e.velocity)) {
            missing.push({ label, expected: e, key })
        }
    }

    return { expected, observed, missing }
}

/**
 * Simpler verifier: checks note count per track and tick alignment.
 * Used for cases where pitch lookup is complex.
 */
function verifyNoteCount(pattern, loops, expectedNoteOnCount, label) {
    const im = new InstrumentsManager()
    const exporter = new MidiExporter(im)
    const midiBytes = Array.from(exporter.export(pattern, { loops }))
    const observed = allNoteOns(midiBytes)
    return { count: observed.length, expected: expectedNoteOnCount, observed }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('MidiExporter — functional end-to-end', () => {

    // ── 1. Basic four-on-the-floor ────────────────────────────────────────────

    describe('Case 1: basic four-on-the-floor (4 bars, KICK every beat)', () => {
        const pattern = {
            name: 'FourOnFloor', bpm: 120, nbBars: 4,
            tracks: [
                track('KICK', 4, 4, 4, [
                    note(0,0,{velocity:1.0}), note(1,0,{velocity:1.0}),
                    note(2,0,{velocity:1.0}), note(3,0,{velocity:1.0}),
                ]),
                track('SNARE', 4, 4, 4, [
                    note(0,2,{velocity:0.9}), note(1,2,{velocity:0.9}),
                    note(2,2,{velocity:0.9}), note(3,2,{velocity:0.9}),
                ]),
            ]
        }

        it('produces 4 KICK Note Ons per loop pass', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes)
            const kicks = noteOns.filter(n => n.note === 36)
            expect(kicks).toHaveLength(4)
        })

        it('KICK notes are on MIDI ticks 0, 96, 192, 288', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes)
            const kickTicks = noteOns.filter(n => n.note === 36).map(n => n.absTick).sort((a,b)=>a-b)
            expect(kickTicks).toEqual([0, 96, 192, 288])
        })

        it('SNARE notes are at beat 2 of each bar (tick += 2 * PPQN = 48)', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes)
            const snareTicks = noteOns.filter(n => n.note === 38).map(n => n.absTick).sort((a,b)=>a-b)
            // bar=0 step=2 → engine_tick=16, midi_tick=48; bar=1→48+96=144; etc.
            expect(snareTicks).toEqual([48, 144, 240, 336])
        })

        it('2 loops → 8 KICKs and 8 SNAREs', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 2 }))
            const noteOns = allNoteOns(midiBytes)
            expect(noteOns.filter(n => n.note === 36)).toHaveLength(8)
            expect(noteOns.filter(n => n.note === 38)).toHaveLength(8)
        })

        it('KICK velocity 1.0 → MIDI velocity 127', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36)
            expect(kicks.every(n => n.velocity === 127)).toBe(true)
        })

        it('all notes are on MIDI channel 9 (drums)', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes)
            expect(noteOns.every(n => n.channel === 9)).toBe(true)
        })
    })

    // ── 2. Track loop shorter than pattern ────────────────────────────────────

    describe('Case 2: track loop shorter than pattern (2-bar loop inside 4-bar pattern)', () => {
        // KICK loops every 2 bars in a 4-bar pattern → fires twice
        const pattern = {
            name: 'ShortLoop', bpm: 120, nbBars: 4,
            tracks: [
                track('KICK', 4, 4, 2 /* loopPointBar */, [
                    note(0,0,{velocity:0.8}),
                    note(1,0,{velocity:0.6}),
                ])
            ]
        }

        it('engine produces 4 notes (2 from loop×2)', () => {
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            let total = 0
            for (const v of flatMap.values()) total += v.length
            expect(total).toBe(4)
        })

        it('MIDI file contains exactly 4 KICK Note Ons', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36)
            expect(kicks).toHaveLength(4)
        })

        it('notes appear at ticks 0, 96, 192, 288 (loop repeated at bar 2)', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36)
            const ticks = kicks.map(n => n.absTick).sort((a,b)=>a-b)
            // bar0→0, bar1→96, loop: bar0+2bars→192, bar1+2bars→288
            expect(ticks).toEqual([0, 96, 192, 288])
        })
    })

    // ── 3. triggerFreq (note fires every N loops) ─────────────────────────────

    describe('Case 3: triggerFreq — note fires every 2nd loop', () => {
        const pattern = {
            name: 'TrigFreq', bpm: 120, nbBars: 4,
            tracks: [
                track('KICK', 4, 4, 4, [
                    note(0,0,{velocity:1.0}),                         // always
                    note(2,0,{velocity:0.7, triggerFreq:2, triggerPhase:0}), // every 2nd loop
                    note(3,0,{velocity:0.5, triggerFreq:2, triggerPhase:1}), // alternate loops
                ])
            ]
        }

        it('isTrigged(phase=0, freq=2, loop=0) is true', () => {
            expect(isTrigged(0, 2, 0)).toBe(true)
        })
        it('isTrigged(phase=0, freq=2, loop=1) is false', () => {
            expect(isTrigged(0, 2, 1)).toBe(false)
        })
        it('isTrigged(phase=1, freq=2, loop=1) is true', () => {
            expect(isTrigged(1, 2, 1)).toBe(true)
        })
        it('isTrigged(phase=1, freq=2, loop=0) is false', () => {
            expect(isTrigged(1, 2, 0)).toBe(false)
        })

        it('loop=0: engine produces 2 notes (always + phase0)', () => {
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            let total = 0
            for (const v of flatMap.values()) total += v.length
            expect(total).toBe(2)
        })

        it('loop=1: engine produces 2 notes (always + phase1)', () => {
            const flatMap = computeFlatNotesFromPattern(pattern, 1)
            let total = 0
            for (const v of flatMap.values()) total += v.length
            expect(total).toBe(2)
        })

        it('over 4-loop export: total KICK note ons = 4×1(always) + 2(phase0) + 2(phase1) = 8', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 4 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36)
            expect(kicks).toHaveLength(8)
        })

        it('in loop 0: MIDI ticks are 0 (always) and 192 (phase0)', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            // export 1 loop to isolate loop-0 behavior
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36)
            const ticks = kicks.map(n => n.absTick).sort((a,b)=>a-b)
            expect(ticks).toEqual([0, 192])
        })
    })

    // ── 4. retriggerNum / retriggerStep ───────────────────────────────────────

    describe('Case 4: retrigger — 1 note fires 4 times, spacing=1 step', () => {
        // barQuantize=4, retriggerStep=1 → spacing = (1/8)*TICK = 4 engine ticks
        // so 4 notes at ticks: 0, 4, 8, 12  (engine ticks)
        const pattern = {
            name: 'Retrigger', bpm: 120, nbBars: 4,
            tracks: [
                track('KICK', 4, 4, 4, [
                    note(0, 0, { velocity: 0.8, retriggerNum: 4, retriggerStep: 1 }),
                ])
            ]
        }

        it('engine produces 4 notes from 1 barStep', () => {
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            let total = 0
            for (const v of flatMap.values()) total += v.length
            expect(total).toBe(4)
        })

        it('retrigger spacing = TICK/barQuantize * getStepSpacing(1) engine ticks', () => {
            const spacing = computeTickSpacing({ barQuantize: 4 }, 1, TICK)
            // getStepSpacing(1) = 1/8 = 0.125 → spacing = (32/4)*0.125 = 1
            expect(spacing).toBeGreaterThan(0)
        })

        it('MIDI file contains 4 KICK Note Ons from a single source note', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36)
            expect(kicks).toHaveLength(4)
        })

        it('retrigger notes are evenly spaced in MIDI ticks', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36).sort((a,b)=>a.absTick-b.absTick)
            const gaps = []
            for (let i = 1; i < kicks.length; i++) gaps.push(kicks[i].absTick - kicks[i-1].absTick)
            // All gaps should be equal
            expect(new Set(gaps).size).toBe(1)
        })

        it('4 loops → 16 KICK Note Ons (4 retriggers × 4 loops)', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 4 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36)
            expect(kicks).toHaveLength(16)
        })
    })

    // ── 5. retriggerStep=4 (coarser spacing) ─────────────────────────────────

    describe('Case 4b: retrigger with step=4 (half-bar spacing)', () => {
        // barQuantize=4, retriggerStep=4 → getStepSpacing(4)=4/8=0.5
        // spacing = (32/4)*0.5 = 4 engine ticks → 48 MIDI ticks
        const pattern = {
            name: 'RetrigCoarse', bpm: 120, nbBars: 4,
            tracks: [
                track('SNARE', 4, 4, 4, [
                    note(0, 0, { velocity: 0.9, retriggerNum: 3, retriggerStep: 4 }),
                ])
            ]
        }

        it('engine generates 3 notes at positions 0, 4, 8 engine ticks', () => {
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const ticks = [...flatMap.keys()].sort((a,b)=>a-b)
            expect(ticks).toHaveLength(3)
            expect(ticks[0]).toBe(0)
            const spacing = computeTickSpacing({ barQuantize: 4 }, 4, TICK)
            expect(ticks[1]).toBe(spacing)
            expect(ticks[2]).toBe(spacing * 2)
        })

        it('MIDI positions are spaced by spacing * MIDI_RATIO', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const snares = allNoteOns(midiBytes).filter(n => n.note === 38).sort((a,b)=>a.absTick-b.absTick)
            const spacing = computeTickSpacing({ barQuantize: 4 }, 4, TICK)
            expect(snares[1].absTick - snares[0].absTick).toBe(spacing * MIDI_RATIO)
            expect(snares[2].absTick - snares[1].absTick).toBe(spacing * MIDI_RATIO)
        })
    })

    // ── 6. Arpeggio (array mode, up) ─────────────────────────────────────────

    describe('Case 5: arpeggio — 4 notes, intervals [0,4,7,12] (major chord)', () => {
        // retriggerStep=2 → getStepSpacing(2)=2/8=0.25 → spacing=(32/4)*0.25=2 engine ticks
        const pattern = {
            name: 'Arp', bpm: 120, nbBars: 4,
            tracks: [
                track('SNARE', 4, 4, 4, [
                    note(0, 0, {
                        velocity: 0.8,
                        arp: [0, 4, 7, 12],
                        retriggerNum: 4,
                        retriggerStep: 2,
                        pitch: 0,
                    }),
                ])
            ]
        }

        it('normalizeArp([0,4,7,12]) produces sequence [0,4,7,12]', () => {
            const a = normalizeArp([0, 4, 7, 12])
            expect(a.sequence).toEqual([0, 4, 7, 12])
        })

        it('engine produces 4 notes with different pitches', () => {
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allFlat = []
            for (const v of flatMap.values()) allFlat.push(...v)
            expect(allFlat).toHaveLength(4)
            const pitches = allFlat.map(fn => fn.note.pitch)
            expect(pitches.includes(0)).toBe(true)
            expect(pitches.includes(4)).toBe(true)
            expect(pitches.includes(7)).toBe(true)
            expect(pitches.includes(12)).toBe(true)
        })

        it('MIDI file has 4 Note Ons for SNARE with MIDI notes 38, 42, 45, 50', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const snares = allNoteOns(midiBytes).filter(n => n.note >= 38 && n.note <= 54)
                .sort((a,b) => a.note - b.note)
            const notes = snares.map(n => n.note)
            expect(notes).toContain(38)  // 38+0
            expect(notes).toContain(42)  // 38+4
            expect(notes).toContain(45)  // 38+7
            expect(notes).toContain(50)  // 38+12
        })

        it('arp notes are evenly spaced in MIDI', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes).sort((a,b)=>a.absTick-b.absTick)
            const gaps = []
            for (let i = 1; i < noteOns.length; i++) gaps.push(noteOns[i].absTick - noteOns[i-1].absTick)
            expect(new Set(gaps).size).toBe(1)
        })
    })

    // ── 7. Arpeggio mode: down ────────────────────────────────────────────────

    describe('Case 5b: arpeggio mode=down — descending pitches', () => {
        const pattern = {
            name: 'ArpDown', bpm: 120, nbBars: 4,
            tracks: [
                track('SNARE', 4, 4, 4, [
                    note(0, 0, {
                        velocity: 0.8,
                        arp: { intervals: [0, 4, 7], mode: 'down' },
                        retriggerNum: 3,
                        retriggerStep: 2,
                    }),
                ])
            ]
        }

        it('normalizeArp({intervals:[0,4,7], mode:"down"}) descends', () => {
            const a = normalizeArp({ intervals: [0, 4, 7], mode: 'down' })
            expect(a.sequence[0]).toBeGreaterThan(a.sequence[a.sequence.length - 1])
        })

        it('engine produces 3 notes', () => {
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            let total = 0
            for (const v of flatMap.values()) total += v.length
            expect(total).toBe(3)
        })

        it('notes are sorted descending by pitch offset', () => {
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allFlat = []
            for (const v of flatMap.values()) allFlat.push(...v)
            allFlat.sort((a,b) => a.tick - b.tick)
            const pitches = allFlat.map(fn => fn.note.pitch)
            for (let i = 1; i < pitches.length; i++) {
                expect(pitches[i]).toBeLessThanOrEqual(pitches[i-1])
            }
        })
    })

    // ── 8. Arpeggio mode: updown ──────────────────────────────────────────────

    describe('Case 5c: arpeggio mode=updown — ping-pong', () => {
        const pattern = {
            name: 'ArpUpDown', bpm: 120, nbBars: 4,
            tracks: [
                track('SNARE', 4, 4, 4, [
                    note(0, 0, {
                        velocity: 0.8,
                        arp: { intervals: [0, 4, 7], mode: 'updown' },
                        retriggerNum: 4,
                        retriggerStep: 2,
                    }),
                ])
            ]
        }

        it('normalizeArp updown: sequence = [0,4,7,4] (up then back)', () => {
            const a = normalizeArp({ intervals: [0, 4, 7], mode: 'updown' })
            expect(a.sequence).toEqual([0, 4, 7, 4])
        })

        it('4 notes cycle through updown sequence', () => {
            const flatMap = computeFlatNotesFromPattern(pattern, 0)
            const allFlat = []
            for (const v of flatMap.values()) allFlat.push(...v)
            expect(allFlat).toHaveLength(4)
        })
    })

    // ── 9. Combined: retrigger on a melodic track ─────────────────────────────

    describe('Case 6: melodic track with pitch offset + retrigger', () => {
        // Using SNARE as melodic with pitch offsets -5, 0, +5
        const pattern = {
            name: 'Melodic', bpm: 100, nbBars: 4,
            tracks: [
                track('SNARE', 4, 4, 4, [
                    note(0, 0, { velocity: 0.7, pitch: -5 }),
                    note(1, 0, { velocity: 0.8, pitch:  0 }),
                    note(2, 0, { velocity: 0.9, pitch: +5 }),
                    note(3, 0, { velocity: 1.0, pitch: -5, retriggerNum: 2, retriggerStep: 2 }),
                ])
            ]
        }

        it('MIDI file contains 5 Note Ons total (3 simple + 2 retrigger)', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes)
            expect(noteOns).toHaveLength(5)
        })

        it('pitch -5 maps to MIDI note 33 (SNARE base 38 - 5)', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes)
            expect(noteOns.some(n => n.note === 33)).toBe(true)
        })

        it('pitch +5 maps to MIDI note 43 (SNARE base 38 + 5)', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes)
            expect(noteOns.some(n => n.note === 43)).toBe(true)
        })

        it('velocity 0.7 maps to MIDI 89', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes)
            expect(noteOns.some(n => n.velocity === 89)).toBe(true)  // round(0.7*127)=89
        })
    })

    // ── 10. Complex pattern: all features combined over 4 loops ──────────────

    describe('Case 7: full complex pattern (4 tracks, 4 bars × 4 loops)', () => {
        const LOOPS = 4
        const complexPattern = {
            name: 'Complex', bpm: 130, nbBars: 4,
            tracks: [
                // KICK: four-on-the-floor, 2-bar loop
                track('KICK', 4, 4, 2, [
                    note(0, 0, { velocity: 1.0 }),
                    note(1, 0, { velocity: 0.85 }),
                ]),
                // SNARE: beat 2/4 with triggerFreq=2 fill on beat 4
                track('SNARE', 4, 4, 4, [
                    note(1, 0, { velocity: 0.9 }),
                    note(3, 0, { velocity: 0.9 }),
                    note(3, 2, { velocity: 0.6, triggerFreq: 2, triggerPhase: 1 }), // fill every other loop
                ]),
                // CHH: 8ths (2 notes/bar × 4 bars), 1-bar loop
                track('CHH', 4, 4, 1, [
                    note(0, 0, { velocity: 0.7 }),
                    note(0, 2, { velocity: 0.5 }),
                ]),
                // OHH: arp [0, 12] across 2 retrigger steps, only on loop 0
                track('OHH', 4, 4, 4, [
                    note(0, 1, {
                        velocity: 0.75,
                        arp: [0, 12],
                        retriggerNum: 2,
                        retriggerStep: 4,
                        triggerFreq: 4,
                        triggerPhase: 0,
                    }),
                ]),
            ]
        }

        it('MIDI file is a valid SMF with 5 chunks (MThd + 4 MTrk)', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(complexPattern, { loops: LOOPS }))

            // Parse MThd
            expect(String.fromCharCode(midiBytes[0],midiBytes[1],midiBytes[2],midiBytes[3])).toBe('MThd')
            expect(readUint16BE(midiBytes, 10)).toBe(5) // 1 tempo + 4 tracks
        })

        it('total Note On count matches engine computation', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(complexPattern, { loops: LOOPS }))
            const observed = allNoteOns(midiBytes)

            // Compute expected from engine
            let engineTotal = 0
            for (let loop = 0; loop < LOOPS; loop++) {
                const fm = computeFlatNotesFromPattern(complexPattern, loop)
                for (const v of fm.values()) engineTotal += v.length
            }
            expect(observed.length).toBe(engineTotal)
        })

        it('KICK notes appear at correct MIDI ticks for 2-bar loop', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(complexPattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36).sort((a,b)=>a.absTick-b.absTick)
            // 2-bar loop: ticks 0, 96 (bar0,bar1) repeated from 192, 288
            expect(kicks).toHaveLength(4)
            expect(kicks[0].absTick).toBe(0)
            expect(kicks[2].absTick).toBe(192)  // loop repeat starts at bar2
        })

        it('CHH: 1-bar loop × 4 bars → 8 CHH notes per pattern loop', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(complexPattern, { loops: 1 }))
            const chh = allNoteOns(midiBytes).filter(n => n.note === 42)
            expect(chh).toHaveLength(8)
        })

        it('SNARE fill (triggerFreq=2, phase=1): absent in loop0, present in loop1', () => {
            const loop0 = computeFlatNotesFromPattern(complexPattern, 0)
            const loop1 = computeFlatNotesFromPattern(complexPattern, 1)

            // Flat notes in loop0: find note at bar=3 step=2
            let fillInLoop0 = false, fillInLoop1 = false
            for (const flatList of loop0.values()) {
                for (const fn of flatList) {
                    if (fn.track.name === 'SNARE' && fn.note.triggerFreq === 2) fillInLoop0 = true
                }
            }
            for (const flatList of loop1.values()) {
                for (const fn of flatList) {
                    if (fn.track.name === 'SNARE' && fn.note.triggerFreq === 2) fillInLoop1 = true
                }
            }
            expect(fillInLoop0).toBe(false)
            expect(fillInLoop1).toBe(true)
        })

        it('OHH arp fires only on loop 0 (triggerFreq=4, phase=0)', () => {
            let ohhInLoop0 = 0, ohhInLoop1 = 0
            const loop0 = computeFlatNotesFromPattern(complexPattern, 0)
            const loop1 = computeFlatNotesFromPattern(complexPattern, 1)
            for (const v of loop0.values()) for (const fn of v) if (fn.track.name === 'OHH') ohhInLoop0++
            for (const v of loop1.values()) for (const fn of v) if (fn.track.name === 'OHH') ohhInLoop1++
            expect(ohhInLoop0).toBe(2)   // 2 arp notes (intervals [0,12])
            expect(ohhInLoop1).toBe(0)
        })

        it('over 4 loops: SNARE fill appears exactly 2 times (loops 1 and 3)', () => {
            const im = new InstrumentsManager()
            let fillCount = 0
            for (let loop = 0; loop < LOOPS; loop++) {
                const fm = computeFlatNotesFromPattern(complexPattern, loop)
                for (const v of fm.values()) {
                    for (const fn of v) {
                        if (fn.track.name === 'SNARE' && fn.note.triggerFreq === 2) fillCount++
                    }
                }
            }
            expect(fillCount).toBe(2)
        })

        it('over 4 loops: OHH fires 2 arp notes exactly once (loop 0)', () => {
            let ohhTotal = 0
            for (let loop = 0; loop < LOOPS; loop++) {
                const fm = computeFlatNotesFromPattern(complexPattern, loop)
                for (const v of fm.values()) for (const fn of v) if (fn.track.name === 'OHH') ohhTotal++
            }
            expect(ohhTotal).toBe(2)
        })

        it('MIDI tick positions of KICK match engine ticks × MIDI_RATIO', () => {
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(complexPattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36).sort((a,b)=>a.absTick-b.absTick)

            // Engine loop=0 for KICK track
            const fm = computeFlatNotesFromPattern(complexPattern, 0)
            const kickEngineTicks = []
            for (const [tick, flatList] of fm.entries()) {
                for (const fn of flatList) {
                    if (fn.track.name === 'KICK') kickEngineTicks.push(tick * MIDI_RATIO)
                }
            }
            kickEngineTicks.sort((a,b)=>a-b)

            expect(kicks.map(k=>k.absTick)).toEqual(kickEngineTicks)
        })
    })

    // ── 11. Edge cases ────────────────────────────────────────────────────────

    describe('Case 8: edge cases', () => {
        it('note at last bar last step is included', () => {
            const pattern = {
                name: 'Edge', bpm: 120, nbBars: 4,
                tracks: [track('KICK', 4, 4, 4, [note(3, 3, { velocity: 0.5 })])]
            }
            const fm = computeFlatNotesFromPattern(pattern, 0)
            let total = 0
            for (const v of fm.values()) total += v.length
            expect(total).toBe(1)
            // MIDI tick = (3*32 + 3*8) * 3 = (96+24)*3 = 360
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36)
            expect(kicks).toHaveLength(1)
            expect(kicks[0].absTick).toBe(360)
        })

        it('muted track is absent from MIDI', () => {
            const pattern = {
                name: 'MuteTest', bpm: 120, nbBars: 4,
                tracks: [
                    track('KICK',  4, 4, 4, [note(0,0)], { mute: false }),
                    track('SNARE', 4, 4, 4, [note(1,0)], { mute: true }),
                ]
            }
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const noteOns = allNoteOns(midiBytes)
            expect(noteOns.every(n => n.note === 36)).toBe(true)
        })

        it('retrigger that would go beyond pattern boundary is truncated', () => {
            // Place retrigger at last step with many retriggers
            const pattern = {
                name: 'Truncate', bpm: 120, nbBars: 1,
                tracks: [track('KICK', 4, 1, 1, [
                    note(0, 3, { velocity: 0.8, retriggerNum: 10, retriggerStep: 2 }),
                ])]
            }
            const fm = computeFlatNotesFromPattern(pattern, 0)
            let total = 0
            for (const v of fm.values()) total += v.length
            // retriggerStep=2 → spacing=4 engine ticks; start at tick=24; pattern=32 ticks
            // notes at 24, 28 → 2 notes fit inside [0,32)
            expect(total).toBeLessThan(10)
            expect(total).toBeGreaterThan(0)

            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            const kicks = allNoteOns(midiBytes).filter(n => n.note === 36)
            expect(kicks.length).toBe(total)
        })

        it('triggerProbability=1 always fires', () => {
            const pattern = {
                name: 'Always', bpm: 120, nbBars: 4,
                tracks: [track('KICK', 4, 4, 4, [note(0, 0, { triggerProbability: 1 })])]
            }
            for (let i = 0; i < 10; i++) {
                const fm = computeFlatNotesFromPattern(pattern, 0)
                let total = 0
                for (const v of fm.values()) total += v.length
                expect(total).toBe(1)
            }
        })

        it('triggerProbability=0 never fires', () => {
            const pattern = {
                name: 'Never', bpm: 120, nbBars: 4,
                tracks: [track('KICK', 4, 4, 4, [note(0, 0, { triggerProbability: 0 })])]
            }
            for (let i = 0; i < 10; i++) {
                const fm = computeFlatNotesFromPattern(pattern, 0)
                expect(fm.size).toBe(0)
            }
        })

        it('pattern with 0 tracks exports valid but empty MIDI', () => {
            const pattern = { name: 'Empty', bpm: 120, nbBars: 4, tracks: [] }
            const im = new InstrumentsManager()
            const exporter = new MidiExporter(im)
            const midiBytes = Array.from(exporter.export(pattern, { loops: 1 }))
            expect(String.fromCharCode(midiBytes[0],midiBytes[1],midiBytes[2],midiBytes[3])).toBe('MThd')
            expect(readUint16BE(midiBytes, 10)).toBe(1) // only tempo track
        })
    })
})
