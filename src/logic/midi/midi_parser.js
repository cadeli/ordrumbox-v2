/**
 * Standard MIDI File (SMF) parser.
 * Parses Type 0 or Type 1 MIDI files from Uint8Array.
 */

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

function parseMTrkEvents(bytes, dataOffset, length) {
    const events = []
    let pos = dataOffset
    let cursor = 0
    const end = dataOffset + length
    let runningStatus = 0
    while (pos < end) {
        const vlq = decodeVLQ(bytes, pos)
        pos += vlq.bytesRead
        cursor += vlq.value
        let b0 = bytes[pos]

        if (b0 & 0x80) {
            runningStatus = b0
            pos++
        } else {
            b0 = runningStatus
        }

        if (b0 === 0xFF) {
            const type = bytes[pos]
            const lv = decodeVLQ(bytes, pos + 1)
            events.push({
                absTick: cursor,
                type: 'meta',
                metaType: type,
                data: Array.from(bytes.slice(pos + 1 + lv.bytesRead, pos + 1 + lv.bytesRead + lv.value)),
            })
            pos += 1 + lv.bytesRead + lv.value
            runningStatus = 0
        } else {
            const hi = b0 & 0xF0
            const channel = (b0 & 0x0F)
            if (hi === 0xC0 || hi === 0xD0) {
                events.push({ absTick: cursor, type: 'midi', status: hi, channel, program: bytes[pos] })
                pos += 1
            } else {
                events.push({ absTick: cursor, type: 'midi', status: hi, channel, note: bytes[pos], velocity: bytes[pos + 1] ?? 0 })
                pos += 2
            }
        }
    }
    return events
}

/**
 * Parse a MIDI Uint8Array into a structured object.
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
 * Collect all Note On events from instrument tracks.
 * For format 0: reads track 0 (all channels in one track).
 * For format 1: skips track 0 (tempo/meta only), reads tracks 1+.
 * For format 2: reads all tracks (each is independent).
 * @param {{ header: { format: number }, tracks: Array }} midi - Parsed MIDI object from parseMidi()
 * @returns {Array<{ absTick: number, channel: number, note: number, velocity: number, trackIdx: number }>}
 */
export function findAllNotes(midi) {
    const noteOns = []
    const startTrack = midi.header.format === 1 ? 1 : 0
    for (let ti = startTrack; ti < midi.tracks.length; ti++) {
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
 * Get track names from parsed MIDI.
 */
export function getTrackNames(midi) {
    return midi.trackNames
}

/**
 * Convert MIDI ticks to orDrumbox engine ticks.
 * MIDI: PPQN=96 ticks/beat, orDrumbox: TICK=32 steps/beat
 * @param {number} midiTick - Absolute tick in MIDI file
 * @param {number} division - MIDI file division (ticks per quarter note)
 * @returns {number} Engine tick
 */
export function midiTickToEngineTick(midiTick, division = 96) {
    const TICK = 32
    const ratio = TICK / division
    return Math.round(midiTick * ratio)
}

/**
 * Convert velocity 0-127 to normalized 0-1.
 */
export function midiVelocityToNormalized(velocity) {
    return velocity / 127
}

/**
 * Check if Web MIDI API is supported in this browser.
 */
export function isMidiSupported() {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
}

/**
 * Extract program changes per channel from parsed MIDI tracks.
 * @param {{ tracks: Array }} midi - Parsed MIDI object
 * @returns {Map<number, number>} channel → program number (0-based)
 */
export function extractProgramChanges(midi) {
    const channelProgram = new Map()
    for (let ti = 1; ti < midi.tracks.length; ti++) {
        for (const ev of midi.tracks[ti]) {
            if (ev.type === 'midi' && ev.status === 0xC0) {
                channelProgram.set(ev.channel, ev.program)
            }
        }
    }
    return channelProgram
}

/**
 * Parse a raw MIDI Note On message (3 bytes: status, note, velocity).
 * @param {Uint8Array|number[]} data - Raw MIDI message bytes
 * @returns {{ noteNumber: number, channel: number, velocity: number }|null}
 */
export function parseMidiNoteOn(data) {
    if (!data || data.length < 3) return null
    const status = data[0]
    if ((status & 0xF0) !== 0x90) return null
    const channel = status & 0x0F
    const noteNumber = data[1] & 0x7F
    const velocity = data[2] & 0x7F
    if (velocity === 0) return null // Note On with velocity 0 = Note Off
    return { noteNumber, channel, velocity }
}

/**
 * Parse a MIDI realtime message.
 * @param {number} status - Status byte
 * @returns {'start'|'stop'|'continue'|'clock'|'active'|'reset'|null}
 */
export function parseMidiRealtime(status) {
    switch (status) {
        case 0xFA: return 'start'
        case 0xFC: return 'stop'
        case 0xFB: return 'continue'
        case 0xF8: return 'clock'
        case 0xFE: return 'active'
        case 0xFF: return 'reset'
        default: return null
    }
}

/**
 * Estimate BPM from MIDI clock pulse timestamps (in ms).
 * @param {number[]} pulseTimes - Array of performance.now() timestamps for clock pulses
 * @returns {number|null} Estimated BPM or null if insufficient data
 */
export function estimateBpmFromClockPulses(pulseTimes) {
    if (!pulseTimes || pulseTimes.length < 4) return null
    const intervals = []
    for (let i = 1; i < pulseTimes.length; i++) {
        intervals.push(pulseTimes[i] - pulseTimes[i - 1])
    }
    intervals.sort((a, b) => a - b)
    const median = intervals[Math.floor(intervals.length / 2)]
    if (median <= 0) return null
    // MIDI clock: 24 pulses per quarter note
    return Math.round(60000 / median / 24)
}

/**
 * Update clock pulse tracking array, keeping only recent pulses.
 * @param {number[]} pulseTimes - Existing pulse timestamps
 * @param {number} now - Current timestamp from performance.now()
 * @returns {number[]} Updated pulse times (max 32 pulses, ~2 seconds at 120 BPM)
 */
export function updateClockPulseTracking(pulseTimes, now) {
    const updated = [...pulseTimes, now]
    // Keep last 32 pulses (~2 seconds at 120 BPM = 24 ppqn * 2 = 48 pulses)
    return updated.slice(-32)
}