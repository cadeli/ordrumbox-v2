/**
 * Synthetic MIDI binary builder for tests.
 *
 * Constructs valid Standard MIDI File (SMF) byte arrays programmatically,
 * for testing the MIDI import pipeline (MidiImportService, parseMidi, etc.).
 *
 * Usage:
 *   import { buildMidi, buildMidiTrack } from './helpers/midi_builder.js'
 *
 *   const midi = buildMidi({
 *     format: 1,
 *     division: 96,
 *     tracks: [
 *       { name: 'KICK', channel: 9, program: 0, notes: [
 *         { tick: 0, note: 36, velocity: 100 },
 *         { tick: 96, note: 36, velocity: 80 },
 *       ]},
 *     ]
 *   })
 *   // midi is a Uint8Array
 */

// ─── VLQ (Variable Length Quantity) encoding ──────────────────────────────────

/**
 * Encode a number as a VLQ byte array.
 * @param {number} value - Non-negative integer
 * @returns {number[]}
 */
export function encodeVLQ(value) {
    if (value < 0) throw new RangeError('VLQ value must be non-negative')
    const bytes = []
    bytes.unshift(value & 0x7F)
    value >>= 7
    while (value > 0) {
        bytes.unshift((value & 0x7F) | 0x80)
        value >>= 7
    }
    return bytes
}

// ─── Low-level byte helpers ───────────────────────────────────────────────────

function uint16BE(value) {
    return [(value >> 8) & 0xFF, value & 0xFF]
}

function uint32BE(value) {
    return [(value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]
}

function asciiString(str) {
    return Array.from(str).map(c => c.charCodeAt(0))
}

// ─── Meta event builders ──────────────────────────────────────────────────────

function metaTrackName(name) {
    const data = asciiString(name)
    return [0xFF, 0x03, ...encodeVLQ(data.length), ...data]
}

function metaTempo(microsecondsPerQuarter) {
    return [0xFF, 0x51, 0x03,
        (microsecondsPerQuarter >> 16) & 0xFF,
        (microsecondsPerQuarter >> 8) & 0xFF,
        microsecondsPerQuarter & 0xFF
    ]
}

function metaEndOfTrack() {
    return [0xFF, 0x2F, 0x00]
}

// ─── MIDI event body builders (no delta prefix) ───────────────────────────────

function midiNoteOnBody(channel, note, velocity) {
    return [0x90 | (channel & 0x0F), note & 0x7F, velocity & 0x7F]
}

function midiNoteOffBody(channel, note) {
    return [0x80 | (channel & 0x0F), note & 0x7F, 0x00]
}

function midiProgramChangeBody(channel, program) {
    return [0xC0 | (channel & 0x0F), program & 0x7F]
}

// ─── MTrk chunk builder ──────────────────────────────────────────────────────

/**
 * Build a single MTrk chunk from a list of raw event bytes.
 * Appends EndOfTrack if not present.
 * @param {number[]} eventBytes - Concatenated MIDI/meta event bytes (with delta times)
 * @returns {number[]}
 */
export function buildMTrk(eventBytes) {
    const events = [...eventBytes]
    events.push(0x00, ...metaEndOfTrack()) // delta=0 + EndOfTrack
    return [
        0x4D, 0x54, 0x72, 0x6B, // 'MTrk'
        ...uint32BE(events.length),
        ...events
    ]
}

// ─── High-level track builder ─────────────────────────────────────────────────

/**
 * Options for a single track.
 * @typedef {Object} TrackOptions
 * @property {string}   name           - Track name (meta event)
 * @property {number}   [channel=9]    - MIDI channel (0-15)
 * @property {number}   [program=0]    - GM program number (0-127)
 * @property {boolean}  [isDrum=false] - Whether this is a drum channel
 * @property {{ tick: number, note: number, velocity: number, [duration]: number }[]} [notes=[]]
 *   Notes to place. Each note gets a NoteOn at `tick` and NoteOff at `tick + duration` (default duration = PPQN/4 = 24 ticks at 96 PPQN).
 * @property {{ tick: number, program: number }[]} [programChanges=[]]
 *   Program change events at specific ticks.
 * @property {{ tick: number, tempo: number }[]} [tempos=[]]
 *   Tempo change events at specific ticks (tempo in microseconds per quarter).
 */

/**
 * Build a complete MTrk chunk from structured options.
 *
 * @param {TrackOptions} track
 * @param {number} [ppqn=96] - Pulses per quarter note (for default note duration)
 * @returns {number[]}
 */
export function buildMidiTrack(track, ppqn = 96) {
    const { name = '', channel = 9, program = 0, notes = [], programChanges = [], tempos = [] } = track

    // Collect all events with their absolute ticks and raw body bytes (no delta prefix)
    const events = []

    // Track name
    events.push({ tick: 0, body: metaTrackName(name) })

    // Tempo changes
    for (const t of tempos) {
        events.push({ tick: t.tick, body: metaTempo(t.tempo) })
    }

    // Program changes
    for (const pc of programChanges) {
        events.push({ tick: pc.tick, body: midiProgramChangeBody(channel, pc.program) })
    }

    // Notes (NoteOn + NoteOff pairs)
    const defaultDuration = Math.floor(ppqn / 4) // quarter of a beat
    for (const note of notes) {
        const dur = note.duration ?? defaultDuration
        events.push({ tick: note.tick, body: midiNoteOnBody(channel, note.note, note.velocity) })
        events.push({ tick: note.tick + dur, body: midiNoteOffBody(channel, note.note) })
    }

    // Sort by tick (stable — earlier events at same tick stay in order)
    events.sort((a, b) => a.tick - b.tick)

    // Convert absolute ticks to delta times and build final byte stream
    const eventBytes = []
    let lastTick = 0
    for (const ev of events) {
        const delta = ev.tick - lastTick
        eventBytes.push(...encodeVLQ(delta), ...ev.body)
        lastTick = ev.tick
    }

    return buildMTrk(eventBytes)
}

// ─── Full MIDI file builder ──────────────────────────────────────────────────

/**
 * Options for building a complete MIDI file.
 * @typedef {Object} MidiBuildOptions
 * @property {number}         [format=1]     - SMF format (0 or 1)
 * @property {number}         [division=96]  - Ticks per quarter note
 * @property {TrackOptions[]} [tracks=[]]    - Array of track options
 * @property {number}         [tempo=120]    - Initial BPM (used if no tempo in first track)
 */

/**
 * Build a complete MIDI file as a Uint8Array.
 *
 * @param {MidiBuildOptions} options
 * @returns {Uint8Array}
 */
export function buildMidi(options = {}) {
    const { format = 1, division = 96, tracks = [], tempo = 120 } = options

    const allChunks = []

    // MThd header (always 14 bytes)
    const microsecondsPerQuarter = Math.round(60000000 / tempo)
    allChunks.push(
        0x4D, 0x54, 0x68, 0x64, // 'MThd'
        ...uint32BE(6),          // header length (always 6)
        ...uint16BE(format),
        ...uint16BE(tracks.length),
        ...uint16BE(division)
    )

    // Build tracks
    if (format === 1) {
        // Format 1: first track is tempo/conductor (no notes)
        // If user didn't provide a conductor track, create one
        const hasConductor = tracks.length > 0 && tracks[0].name === '' && tracks[0].notes.length === 0
        if (!hasConductor) {
            allChunks.push(...buildMidiTrack({
                name: '',
                channel: 0,
                tempos: [{ tick: 0, tempo: microsecondsPerQuarter }]
            }, division))
        }
        for (const track of tracks) {
            allChunks.push(...buildMidiTrack(track, division))
        }
    } else {
        // Format 0: all channels in one track, add tempo at start
        if (tracks.length === 0) {
            // Empty file with just a conductor track
            allChunks.push(...buildMidiTrack({
                name: '',
                channel: 0,
                tempos: [{ tick: 0, tempo: microsecondsPerQuarter }]
            }, division))
        } else {
            // Merge all tracks into one (flatten notes from all tracks)
            const mergedNotes = []
            const mergedProgramChanges = []
            let primaryChannel = tracks[0].channel ?? 9
            let primaryProgram = tracks[0].program ?? 0
            let mergedName = 'Merged'

            for (const track of tracks) {
                primaryChannel = track.channel ?? primaryChannel
                primaryProgram = track.program ?? primaryProgram
                if (track.name) mergedName = track.name
                for (const note of track.notes) {
                    mergedNotes.push({ ...note })
                }
                for (const pc of track.programChanges ?? []) {
                    mergedProgramChanges.push({ ...pc })
                }
            }

            allChunks.push(...buildMidiTrack({
                name: mergedName,
                channel: primaryChannel,
                program: primaryProgram,
                notes: mergedNotes,
                programChanges: mergedProgramChanges,
                tempos: [{ tick: 0, tempo: microsecondsPerQuarter }]
            }, division))
        }
    }

    return new Uint8Array(allChunks)
}

/**
 * Build an empty MIDI file (no notes).
 *
 * @param {object} [opts]
 * @param {number} [opts.format=1]
 * @param {number} [opts.division=96]
 * @param {number} [opts.tempo=120]
 * @returns {Uint8Array}
 */
export function buildEmptyMidi(opts = {}) {
    return buildMidi({ ...opts, tracks: [] })
}

/**
 * Build a minimal MIDI file with a single drum channel (channel 9).
 * Useful for quick smoke tests of the import pipeline.
 *
 * @param {object} [opts]
 * @param {Array<{tick?: number, note?: number, velocity?: number}>} [opts.notes]
 * @param {number} [opts.bpm=120]
 * @param {number} [opts.ppqn=96]
 * @returns {Uint8Array}
 */
export function buildDrumMidi(opts = {}) {
    const { notes = [], bpm = 120, ppqn = 96 } = opts
    const formattedNotes = notes.map(n => ({
        tick: n.tick ?? 0,
        note: n.note ?? 36,
        velocity: n.velocity ?? 100,
    }))
    return buildMidi({
        format: 1,
        division: ppqn,
        tempo: bpm,
        tracks: [{
            name: 'KICK',
            channel: 9,
            program: 0,
            isDrum: true,
            notes: formattedNotes,
        }]
    })
}
