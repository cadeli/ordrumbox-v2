/**
 * MidiExporter — exports an orDrumbox pattern to Standard MIDI File (SMF) format.
 *
 * Format: SMF Type 1 (multi-track)
 *   - Track 0  : tempo + time signature meta events
 *   - Track 1+ : one MIDI track per instrument
 *
 * The exporter uses computeFlatNotesFromPattern() — the real pattern engine —
 * so all features are faithfully reflected: track loops, triggerFreq/Phase,
 * retrigger, arpeggio, and euclidian fill.
 *
 * Timing bridge
 * ─────────────
 *   Engine TICK = 32 steps/bar
 *   MIDI  PPQN = 96 ticks/beat, 4 beats/bar → 384 ticks/bar
 *   Ratio = 384 / 32 = 12  →  midi_tick = engine_tick * 12
 */

import InstrumentsManager from '../services/instruments_manager.js'
import {
    computeFlatNotesFromPattern,
    computeNbTickForPattern,
} from '../../patterns/engine.js'
import { TICK } from '../../core/constants.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const PPQN            = 96
const TICKS_PER_BAR   = PPQN * 1              // 384
const MIDI_RATIO      = TICKS_PER_BAR / TICK  // 12
const DRUM_CHANNEL    = 9                      // 0-indexed = MIDI channel 10
const NOTE_DURATION   = 24                     // ticks (1/16th at PPQN=96)
const DEFAULT_MIDI_NOTE = 36                   // Bass Drum 1 fallback

// ─── Low-level binary helpers ─────────────────────────────────────────────────

function uint32BE(v) {
    return [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]
}
function uint16BE(v) {
    return [(v >>> 8) & 0xFF, v & 0xFF]
}

export function encodeVLQ(value) {
    if (value < 0) throw new RangeError('VLQ value must be >= 0')
    const bytes = [value & 0x7F]
    value >>>= 7
    while (value > 0) {
        bytes.unshift((value & 0x7F) | 0x80)
        value >>>= 7
    }
    return bytes
}

function midiEvent(delta, data) {
    return [...encodeVLQ(delta), ...data]
}
function metaEvent(delta, type, data) {
    return midiEvent(delta, [0xFF, type, ...encodeVLQ(data.length), ...data])
}
function buildMTrk(eventBytes) {
    const body = [...eventBytes, ...midiEvent(0, [0xFF, 0x2F, 0x00])]
    return [0x4D, 0x54, 0x72, 0x6B, ...uint32BE(body.length), ...body]
}

// ─── SMF header ───────────────────────────────────────────────────────────────

function buildMThd(numTracks) {
    return [
        0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
        ...uint16BE(1), ...uint16BE(numTracks), ...uint16BE(PPQN),
    ]
}

// ─── Tempo track ──────────────────────────────────────────────────────────────

function buildTempoTrack(bpm) {
    const us = Math.round(60_000_000 / bpm)
    return buildMTrk([
        ...metaEvent(0, 0x58, [0x04, 0x02, 0x18, 0x08]),
        ...metaEvent(0, 0x51, [(us >>> 16) & 0xFF, (us >>> 8) & 0xFF, us & 0xFF]),
        ...metaEvent(0, 0x03, Array.from('orDrumbox Pattern', c => c.charCodeAt(0))),
    ])
}

// ─── Instrument resolution ────────────────────────────────────────────────────

export function resolveTrackMidi(trackName, instrumentsManager) {
    const name = trackName?.trim().toUpperCase() ?? ''
    const instrument = instrumentsManager.findByName(name)
    if (instrument && instrument.midi && instrument.midi.length > 0) {
        const mapping = instrument.midi[0]
        const channel = Math.max(0, parseInt(mapping.ch ?? 10, 10) - 1)
        const isDrum  = String(instrument.drum) === 'true'
        if (mapping.key != null) {
            return { midiNote: parseInt(mapping.key, 10), channel, isDrum }
        }
        return { midiNote: 60, channel, isDrum }
    }
    return { midiNote: DEFAULT_MIDI_NOTE, channel: DRUM_CHANNEL, isDrum: true }
}

// ─── Engine-driven instrument track builder ───────────────────────────────────

/**
 * Build one MTrk chunk from pre-computed engine events.
 *
 * @param {string}   trackName
 * @param {number}   midiNote    base MIDI note for this track
 * @param {number}   channel     0-indexed MIDI channel
 * @param {{ absMidiTick: number, noteNum: number, velocity: number }[]} events
 */
export function buildInstrumentTrackFromEvents(trackName, midiNote, channel, events) {
    if (events.length === 0) return buildMTrk([])

    events.sort((a, b) => a.absMidiTick - b.absMidiTick || a.noteNum - b.noteNum)

    // Expand into Note On + Note Off pairs
    const raw = []
    for (const ev of events) {
        raw.push({ tick: ev.absMidiTick,              type: 'on',  noteNum: ev.noteNum, velocity: ev.velocity })
        raw.push({ tick: ev.absMidiTick + NOTE_DURATION, type: 'off', noteNum: ev.noteNum })
    }
    raw.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1))

    const nameBytes = Array.from(trackName ?? 'TRACK', c => c.charCodeAt(0))
    const evBytes   = [...metaEvent(0, 0x03, nameBytes)]

    const statusOn  = 0x90 | (channel & 0x0F)
    const statusOff = 0x80 | (channel & 0x0F)
    let cursor = 0
    for (const ev of raw) {
        const delta = ev.tick - cursor; cursor = ev.tick
        if (ev.type === 'on') {
            evBytes.push(...midiEvent(delta, [statusOn,  ev.noteNum, ev.velocity]))
        } else {
            evBytes.push(...midiEvent(delta, [statusOff, ev.noteNum, 0]))
        }
    }
    return buildMTrk(evBytes)
}

// kept for backward compatibility with unit tests
export function buildInstrumentTrack(track, midiNote, channel, patternLoops = 1) {
    const barQuantize   = track.barQuantize ?? 4
    const ticksPerStep  = TICKS_PER_BAR / barQuantize
    const loopPointBar  = track.loopPointBar  ?? (track.bars ?? 4)
    const loopPointStep = track.loopPointStep ?? 0
    const loopTicks     = Math.floor((loopPointBar + loopPointStep / barQuantize) * TICKS_PER_BAR)

    const onsets = []
    for (let loop = 0; loop < patternLoops; loop++) {
        const loopOffset = loop * loopTicks
        for (const note of track.notes ?? []) {
            const absTick  = note.bar * TICKS_PER_BAR + Math.round(note.barStep * ticksPerStep) + loopOffset
            const velocity = Math.round(Math.min(1, Math.max(0, note.velocity ?? 0.8)) * 127)
            const noteNum  = Math.min(127, Math.max(0, midiNote + (note.pitch ?? 0)))
            onsets.push({ absMidiTick: absTick, noteNum, velocity })
        }
    }
    return buildInstrumentTrackFromEvents(track.name, midiNote, channel, onsets)
}

// ─── Main exporter class ──────────────────────────────────────────────────────

export default class MidiExporter {
    constructor(instrumentsManager) {
        this.instrumentsManager = instrumentsManager ?? new InstrumentsManager()
    }

    /**
     * Export a pattern to a MIDI Uint8Array (SMF Type 1).
     *
     * Uses the real pattern engine for every loop iteration so that
     * triggerFreq, retrigger, arpeggio and loop expansion are all respected.
     *
     * @param {object} pattern
     * @param {{ loops?: number }} [options]
     * @returns {Uint8Array}
     */
    export(pattern, { loops = 1 } = {}) {
        if (!pattern) throw new Error('MidiExporter.export: pattern is required')

        const bpm              = pattern.bpm    ?? 120
        const nbBars           = pattern.nbBars ?? 4
        const tracks           = pattern.tracks ?? []
        const nbTickForPattern = computeNbTickForPattern(nbBars, TICK)

        // Collect engine events per track name
        // key: track name,  value: { midiNote, channel, events[] }
        const trackData = new Map()

        for (const track of tracks) {
            if (track.mute) continue
            const { midiNote, channel } = resolveTrackMidi(track.name, this.instrumentsManager)
            trackData.set(track.name, { midiNote, channel, events: [] })
        }

        // Run engine for each loop iteration
        for (let loop = 0; loop < loops; loop++) {
            const flatMap = computeFlatNotesFromPattern(pattern, loop)
            const loopMidiOffset = loop * nbTickForPattern * MIDI_RATIO

            for (const [engineTick, flatNotes] of flatMap) {
                const absMidiTick = engineTick * MIDI_RATIO + loopMidiOffset

                for (const fn of flatNotes) {
                    const name = fn.track.name
                    if (!trackData.has(name)) continue
                    const td = trackData.get(name)
                    const noteNum  = Math.min(127, Math.max(0, td.midiNote + (fn.note.pitch ?? 0)))
                    const velocity = Math.round(Math.min(1, Math.max(0, fn.note.velocity ?? 0.8)) * 127)
                    td.events.push({ absMidiTick, noteNum, velocity })
                }
            }
        }

        // Build chunks
        const trackChunks = []
        for (const [name, td] of trackData) {
            if (td.events.length === 0) continue
            trackChunks.push(buildInstrumentTrackFromEvents(name, td.midiNote, td.channel, td.events))
        }

        const numTracks  = 1 + trackChunks.length
        const allBytes   = [...buildMThd(numTracks), ...buildTempoTrack(bpm)]
        for (const chunk of trackChunks) allBytes.push(...chunk)
        return new Uint8Array(allBytes)
    }

    download(pattern, filename, options = {}) {
        const bytes = this.export(pattern, options)
        const blob  = new Blob([bytes], { type: 'audio/midi' })
        const url   = URL.createObjectURL(blob)
        const a     = document.createElement('a')
        a.href      = url
        a.download  = filename ?? `${pattern.name ?? 'pattern'}.mid`
        a.click()
        URL.revokeObjectURL(url)
    }
}
