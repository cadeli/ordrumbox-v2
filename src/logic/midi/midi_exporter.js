/**
 * MidiExporter — exports an orDrumbox pattern to Standard MIDI File (SMF) format.
 *
 * Format: SMF Type 1 (multi-track)
 *   - Track 0  : tempo + time signature meta events
 *   - Track 1+ : one MIDI track per instrument (channel 10 for drums, other channels for melodic)
 *
 * No external library — all MIDI binary encoding is done by hand.
 *
 * Timing model
 * ───────────
 *   PPQN = 96 (pulses per quarter note, written in the SMF header)
 *   1 bar  = 4 beats  (4/4)
 *   1 bar  = 4 * PPQN = 384 MIDI ticks
 *   1 step = 384 / barQuantize  MIDI ticks
 *
 * Pitch model (non-drum tracks)
 * ─────────────────────────────
 *   note.pitch is a semitone offset from C3 (MIDI 60).
 *   fpitch (playback ratio) is not stored directly in the pattern; we
 *   recompute a semitone offset from note.pitch:
 *     midiNote = 60 + note.pitch
 */

import InstrumentsManager from '../services/instruments_manager.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const PPQN = 96          // MIDI ticks per quarter note
const TICKS_PER_BAR = PPQN * 4      // 4/4 time
const DRUM_CHANNEL = 9   // 0-indexed → MIDI channel 10
const DEFAULT_MIDI_NOTE = 60        // C3, fallback for unmapped tracks
const DEFAULT_NOTE_DURATION_TICKS = 24  // 1/16th note at PPQN=96
const DEFAULT_VELOCITY = 100

// ─── Low-level binary helpers ─────────────────────────────────────────────────

/**
 * Encode an unsigned 32-bit integer into a byte array (big-endian, 4 bytes).
 */
function uint32BE(value) {
    return [
        (value >>> 24) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 8)  & 0xFF,
        value          & 0xFF,
    ]
}

/**
 * Encode an unsigned 16-bit integer into a byte array (big-endian, 2 bytes).
 */
function uint16BE(value) {
    return [(value >>> 8) & 0xFF, value & 0xFF]
}

/**
 * Encode a number as a MIDI variable-length quantity (VLQ).
 * Used for delta times and meta-event lengths.
 */
export function encodeVLQ(value) {
    if (value < 0) throw new RangeError('VLQ value must be >= 0')
    const bytes = []
    bytes.unshift(value & 0x7F)
    value >>>= 7
    while (value > 0) {
        bytes.unshift((value & 0x7F) | 0x80)
        value >>>= 7
    }
    return bytes
}

/**
 * Build a MIDI event with a delta-time prefix.
 * @param {number}   delta  - ticks since last event
 * @param {number[]} data   - raw MIDI bytes for the event
 */
function midiEvent(delta, data) {
    return [...encodeVLQ(delta), ...data]
}

/**
 * Build a MIDI meta event.
 * @param {number}   type   - meta type byte (e.g. 0x51 for tempo)
 * @param {number[]} data   - meta payload bytes
 */
function metaEvent(delta, type, data) {
    return midiEvent(delta, [0xFF, type, ...encodeVLQ(data.length), ...data])
}

/**
 * Wrap a flat array of event bytes into an MTrk chunk.
 */
function buildMTrk(eventBytes) {
    const body = [...eventBytes, ...midiEvent(0, [0xFF, 0x2F, 0x00])] // End of Track
    return [
        0x4D, 0x54, 0x72, 0x6B,     // 'MTrk'
        ...uint32BE(body.length),
        ...body,
    ]
}

// ─── SMF header ───────────────────────────────────────────────────────────────

function buildMThd(numTracks) {
    return [
        0x4D, 0x54, 0x68, 0x64,     // 'MThd'
        0x00, 0x00, 0x00, 0x06,     // chunk length = 6
        ...uint16BE(1),             // format 1 (multi-track)
        ...uint16BE(numTracks),
        ...uint16BE(PPQN),
    ]
}

// ─── Tempo track (track 0) ────────────────────────────────────────────────────

function buildTempoTrack(bpm, nbBars) {
    const usPerBeat = Math.round(60_000_000 / bpm)
    const events = [
        // Time signature: 4/4, 24 MIDI clocks/click, 8 32nd notes per beat
        ...metaEvent(0, 0x58, [0x04, 0x02, 0x18, 0x08]),
        // Tempo
        ...metaEvent(0, 0x51, [
            (usPerBeat >>> 16) & 0xFF,
            (usPerBeat >>> 8)  & 0xFF,
            usPerBeat          & 0xFF,
        ]),
        // Pattern name as sequence name
        ...metaEvent(0, 0x03, Array.from('orDrumbox Pattern', c => c.charCodeAt(0))),
    ]
    return buildMTrk(events)
}

// ─── Instrument MIDI note resolution ─────────────────────────────────────────

/**
 * Resolve a track's GM MIDI note number and channel.
 * Returns { midiNote, channel, isDrum }.
 */
export function resolveTrackMidi(trackName, instrumentsManager) {
    const instrument = instrumentsManager.findByName(trackName?.trim().toUpperCase())
    if (instrument && instrument.midi && instrument.midi.length > 0) {
        const mapping = instrument.midi[0]
        const channel = Math.max(0, parseInt(mapping.ch ?? 10, 10) - 1) // 0-indexed
        const isDrum = String(instrument.drum) === 'true'
        if (mapping.key != null) {
            return { midiNote: parseInt(mapping.key, 10), channel, isDrum }
        }
        // Melodic instrument: C3 + pitch
        return { midiNote: DEFAULT_MIDI_NOTE, channel, isDrum }
    }
    // Fallback: treat as drum channel 10, note 36 (kick)
    return { midiNote: 36, channel: DRUM_CHANNEL, isDrum: true }
}

// ─── Instrument track builder ─────────────────────────────────────────────────

/**
 * Convert a pattern track into MIDI events, then wrap in an MTrk chunk.
 *
 * Notes are sorted by absolute tick, then interleaved Note On / Note Off pairs.
 */
export function buildInstrumentTrack(track, midiNote, channel, patternLoops = 1) {
    const barQuantize = track.barQuantize ?? 4
    const trackBars   = track.bars ?? 4
    const ticksPerStep = TICKS_PER_BAR / barQuantize

    // Compute loopTicks — the total span of this track before it loops back
    const loopPointBar  = track.loopPointBar  ?? trackBars
    const loopPointStep = track.loopPointStep ?? 0
    const loopTicks = Math.floor((loopPointBar + loopPointStep / barQuantize) * TICKS_PER_BAR)

    // Collect (absoluteTick, velocity, pitch) for each note across all loops
    const onsets = []
    for (let loop = 0; loop < patternLoops; loop++) {
        const loopOffset = loop * loopTicks
        for (const note of track.notes ?? []) {
            const absTick = (note.bar * TICKS_PER_BAR)
                          + Math.round(note.barStep * ticksPerStep)
                          + loopOffset
            const velocity = Math.round(Math.min(1, Math.max(0, note.velocity ?? 0.8)) * 127)
            // For melodic tracks, shift midiNote by semitones from note.pitch
            const noteNum  = Math.min(127, Math.max(0, midiNote + (note.pitch ?? 0)))
            onsets.push({ tick: absTick, noteNum, velocity })
        }
    }

    if (onsets.length === 0) return buildMTrk([])

    // Sort by tick, then by noteNum (deterministic output)
    onsets.sort((a, b) => a.tick - b.tick || a.noteNum - b.noteNum)

    // Build Note On + Note Off pairs; group by absolute tick
    const rawEvents = []
    for (const onset of onsets) {
        const noteOnTick  = onset.tick
        const noteOffTick = onset.tick + DEFAULT_NOTE_DURATION_TICKS
        rawEvents.push({ tick: noteOnTick,  type: 'on',  noteNum: onset.noteNum, velocity: onset.velocity })
        rawEvents.push({ tick: noteOffTick, type: 'off', noteNum: onset.noteNum })
    }

    rawEvents.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1))

    // Track name meta event
    const trackNameBytes = Array.from(track.name ?? 'TRACK', c => c.charCodeAt(0))
    const events = [...metaEvent(0, 0x03, trackNameBytes)]

    const statusOn  = 0x90 | (channel & 0x0F)
    const statusOff = 0x80 | (channel & 0x0F)
    let cursor = 0
    for (const ev of rawEvents) {
        const delta = ev.tick - cursor
        cursor = ev.tick
        if (ev.type === 'on') {
            events.push(...midiEvent(delta, [statusOn,  ev.noteNum, ev.velocity]))
        } else {
            events.push(...midiEvent(delta, [statusOff, ev.noteNum, 0]))
        }
    }

    return buildMTrk(events)
}

// ─── Main exporter class ──────────────────────────────────────────────────────

export default class MidiExporter {
    /**
     * @param {InstrumentsManager} [instrumentsManager]  injected for testability
     */
    constructor(instrumentsManager) {
        this.instrumentsManager = instrumentsManager ?? new InstrumentsManager()
    }

    /**
     * Export a pattern to a MIDI Uint8Array (SMF Type 1).
     *
     * @param {object} pattern      - orDrumbox pattern (nbBars, bpm, tracks[])
     * @param {object} [options]
     * @param {number} [options.loops=1]  - how many times the pattern loops in the export
     * @returns {Uint8Array}        - raw SMF bytes ready for download
     */
    export(pattern, { loops = 1 } = {}) {
        if (!pattern) throw new Error('MidiExporter.export: pattern is required')

        const bpm    = pattern.bpm    ?? 120
        const nbBars = pattern.nbBars ?? 4
        const tracks = pattern.tracks ?? []

        const trackChunks = []
        for (const track of tracks) {
            if (track.mute) continue
            const { midiNote, channel } = resolveTrackMidi(track.name, this.instrumentsManager)
            const chunk = buildInstrumentTrack(track, midiNote, channel, loops)
            trackChunks.push(chunk)
        }

        // numTracks = 1 tempo track + N instrument tracks
        const numTracks = 1 + trackChunks.length
        const header = buildMThd(numTracks)
        const tempoTrack = buildTempoTrack(bpm, nbBars)

        const allBytes = [...header, ...tempoTrack]
        for (const chunk of trackChunks) {
            allBytes.push(...chunk)
        }

        return new Uint8Array(allBytes)
    }

    /**
     * Trigger a browser download of the exported MIDI file.
     *
     * @param {object} pattern
     * @param {string} [filename]
     * @param {object} [options]
     */
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