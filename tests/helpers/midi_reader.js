/**
 * MIDI binary reader for tests.
 *
 * Parses a Standard MIDI File (SMF) Type 0 or 1 from a Uint8Array and
 * provides helpers to query note presence at specific tick positions.
 *
 * Usage:
 *   import { parseMidi, hasNoteAt, findNotesAt, findAllNotes } from './helpers/midi_reader.js'
 *
 *   const midi = parseMidi(new Uint8Array(buffer))
 *   hasNoteAt(midi, { tick: 288, note: 36, channel: 9 })  // → true | false
 *   findNotesAt(midi, { tick: 288 })                       // → [{ channel, note, velocity, trackIdx }]
 */

// ─── Low-level parsing ────────────────────────────────────────────────────────

export function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset+1] << 16) | (bytes[offset+2] << 8) | bytes[offset+3]) >>> 0
}

export function readUint16BE(bytes, offset) {
    return ((bytes[offset] << 8) | bytes[offset+1]) >>> 0
}

export function decodeVLQ(bytes, offset) {
    let value = 0, bytesRead = 0, b
    do {
        b = bytes[offset + bytesRead]
        value = (value << 7) | (b & 0x7F)
        bytesRead++
    } while (b & 0x80)
    return { value, bytesRead }
}

/**
 * Parse MIDI events from a single MTrk chunk.
 * Returns events with absolute tick positions (delta times accumulated).
 */
function parseMTrkEvents(bytes, dataOffset, length) {
    const events = []
    let pos = dataOffset, cursor = 0
    const end = dataOffset + length
    while (pos < end) {
        const vlq = decodeVLQ(bytes, pos)
        pos += vlq.bytesRead
        cursor += vlq.value
        const b0 = bytes[pos]
        if (b0 === 0xFF) {
            const type = bytes[pos + 1]
            const lv = decodeVLQ(bytes, pos + 2)
            events.push({
                absTick: cursor,
                type: 'meta',
                metaType: type,
                data: Array.from(bytes.slice(pos + 2 + lv.bytesRead, pos + 2 + lv.bytesRead + lv.value)),
            })
            pos += 2 + lv.bytesRead + lv.value
        } else {
            events.push({
                absTick: cursor,
                type: 'midi',
                status: b0 & 0xF0,
                channel: b0 & 0x0F,
                note: bytes[pos + 1],
                velocity: bytes[pos + 2],
            })
            pos += 3
        }
    }
    return events
}

// ─── High-level API ───────────────────────────────────────────────────────────

/**
 * Parse a MIDI Uint8Array into a structured object.
 *
 * @param {Uint8Array} bytes - Raw MIDI file bytes
 * @returns {{ header: { format, numTracks, division }, tracks: Array<Array<event>>, trackNames: string[] }}
 */
export function parseMidi(bytes) {
    const header = { format: 0, numTracks: 0, division: 96 }
    const tracks = []

    let i = 0
    while (i + 8 <= bytes.length) {
        const tag = String.fromCharCode(bytes[i], bytes[i+1], bytes[i+2], bytes[i+3])
        const length = readUint32BE(bytes, i + 4)

        if (tag === 'MThd') {
            header.format = readUint16BE(bytes, i + 8)
            header.numTracks = readUint16BE(bytes, i + 10)
            header.division = readUint16BE(bytes, i + 12)
        } else if (tag === 'MTrk') {
            tracks.push(parseMTrkEvents(bytes, i + 8, length))
        }
        i += 8 + length
    }

    const trackNames = tracks.map(trackEvents => {
        const nameEvent = trackEvents.find(e => e.type === 'meta' && e.metaType === 0x03)
        return nameEvent ? String.fromCharCode(...nameEvent.data) : ''
    })

    return { header, tracks, trackNames }
}

/**
 * Collect all Note On events from instrument tracks (track index ≥ 1).
 *
 * @param {{ tracks: Array }} midi - Parsed MIDI object from parseMidi()
 * @returns {Array<{ absTick: number, channel: number, note: number, velocity: number, trackIdx: number }>}
 */
export function findAllNotes(midi) {
    const noteOns = []
    for (let ti = 1; ti < midi.tracks.length; ti++) {
        for (const ev of midi.tracks[ti]) {
            if (ev.type === 'midi' && ev.status === 0x90 && ev.velocity > 0) {
                noteOns.push({
                    absTick: ev.absTick,
                    channel: ev.channel,
                    note: ev.note,
                    velocity: ev.velocity,
                    trackIdx: ti,
                })
            }
        }
    }
    return noteOns
}

/**
 * Find all notes at a specific tick position.
 *
 * @param {{ tracks: Array }} midi - Parsed MIDI object
 * @param {{ tick: number, channel?: number, note?: number, velocity?: number }} filter
 * @returns {Array<{ channel, note, velocity, trackIdx }>}
 */
export function findNotesAt(midi, filter) {
    const { tick, channel, note, velocity } = filter
    return findAllNotes(midi).filter(n =>
        n.absTick === tick &&
        (channel === undefined || n.channel === channel) &&
        (note === undefined || n.note === note) &&
        (velocity === undefined || n.velocity === velocity)
    )
}

/**
 * Check if a specific note is present at a given tick.
 *
 * @param {{ tracks: Array }} midi - Parsed MIDI object
 * @param {{ tick: number, channel?: number, note?: number, velocity?: number }} filter
 * @returns {boolean}
 */
export function hasNoteAt(midi, filter) {
    return findNotesAt(midi, filter).length > 0
}

/**
 * Get track names from the parsed MIDI.
 *
 * @param {{ trackNames: string[] }} midi - Parsed MIDI object
 * @returns {string[]}
 */
export function getTrackNames(midi) {
    return midi.trackNames
}
