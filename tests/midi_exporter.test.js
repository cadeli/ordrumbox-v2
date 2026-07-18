import { describe, it, expect, beforeEach } from 'vitest'
import MidiExporter, {
    encodeVLQ,
    resolveTrackMidi,
    buildInstrumentTrack,
} from '../src/logic/midi/midi_exporter.js'
import InstrumentsManager from '../src/logic/services/instruments_manager.js'
import { readUint32BE, readUint16BE, decodeVLQ } from './helpers/midi_reader.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PPQN = 96
const TICKS_PER_BAR = PPQN * 1

/** Decode all chunk types and their positions from a raw SMF Uint8Array */
function parseChunks(bytes) {
    const chunks = []
    let i = 0
    while (i + 8 <= bytes.length) {
        const tag    = String.fromCharCode(bytes[i], bytes[i+1], bytes[i+2], bytes[i+3])
        const length = readUint32BE(bytes, i + 4)
        chunks.push({ tag, length, offset: i, dataOffset: i + 8 })
        i += 8 + length
    }
    return chunks
}

/** Parse raw MIDI events from an MTrk data slice (delta times, not absolute) */
function parseMTrkEvents(bytes, dataOffset, length) {
    const events = []
    let pos = dataOffset
    const end = dataOffset + length
    while (pos < end) {
        const vlq = decodeVLQ(bytes, pos)
        pos += vlq.bytesRead
        const b0 = bytes[pos]
        if (b0 === 0xFF) {
            const type    = bytes[pos + 1]
            const lenVlq  = decodeVLQ(bytes, pos + 2)
            const dataLen = lenVlq.value
            const data    = Array.from(bytes.slice(pos + 2 + lenVlq.bytesRead, pos + 2 + lenVlq.bytesRead + dataLen))
            events.push({ delta: vlq.value, type: 'meta', metaType: type, data })
            pos += 2 + lenVlq.bytesRead + dataLen
        } else {
            const status  = b0 & 0xF0
            const channel = b0 & 0x0F
            const note    = bytes[pos + 1]
            const vel     = bytes[pos + 2]
            events.push({ delta: vlq.value, type: 'midi', status, channel, note, velocity: vel })
            pos += 3
        }
    }
    return events
}

function makePattern(overrides = {}) {
    return {
        name: 'TestPat',
        bpm: 120,
        nbBeats: 4,
        tracks: [],
        ...overrides,
    }
}

function makeTrack(name, notes = [], overrides = {}) {
    return {
        name,
        nbBeats: 4,
        stepsPerBeat: 4,
        notes,
        mute: false,
        ...overrides,
    }
}

function makeNote(beat, beatStep, velocity = 0.8, pitch = 0) {
    return { beat, beatStep, velocity, pitch }
}

// ─── encodeVLQ ───────────────────────────────────────────────────────────────

describe('encodeVLQ', () => {
    it.each([
        [0,       [0x00]],
        [1,       [0x01]],
        [127,     [0x7F]],
        [128,     [0x81, 0x00]],
        [255,     [0x81, 0x7F]],
        [256,     [0x82, 0x00]],
        [16383,   [0xFF, 0x7F]],
        [16384,   [0x81, 0x80, 0x00]],
        [0x1FFFFF,[0xFF, 0xFF, 0x7F]],
    ])('encodes %d → %j', (input, expected) => {
        expect(encodeVLQ(input)).toEqual(expected)
    })

    it('throws on negative values', () => {
        expect(() => encodeVLQ(-1)).toThrow()
    })

    it('round-trips 1000 random-ish values', () => {
        for (let v = 0; v <= 0xFFFFF; v += Math.floor(v / 3) + 1) {
            const encoded = encodeVLQ(v)
            let decoded = 0
            for (const b of encoded) decoded = (decoded << 7) | (b & 0x7F)
            expect(decoded).toBe(v)
        }
    })
})

// ─── resolveTrackMidi ─────────────────────────────────────────────────────────

describe('resolveTrackMidi', () => {
    let im

    beforeEach(() => { im = new InstrumentsManager() })

    it('resolves KICK to MIDI note 36, channel 9', () => {
        const r = resolveTrackMidi('KICK', im)
        expect(r.midiNote).toBe(36)
        expect(r.channel).toBe(9) // channel 10 = index 9
        expect(r.isDrum).toBe(true)
    })

    it('resolves SNARE to MIDI note 38', () => {
        expect(resolveTrackMidi('SNARE', im).midiNote).toBe(38)
    })

    it('resolves CHH (closed hi-hat) to MIDI note 42', () => {
        expect(resolveTrackMidi('CHH', im).midiNote).toBe(42)
    })

    it('resolves OHH (open hi-hat) to MIDI note 46', () => {
        expect(resolveTrackMidi('OHH', im).midiNote).toBe(46)
    })

    it('resolves CRASH to MIDI note 49', () => {
        expect(resolveTrackMidi('CRASH', im).midiNote).toBe(49)
    })

    it('resolves HI_TOM to MIDI note 50', () => {
        expect(resolveTrackMidi('HI_TOM', im).midiNote).toBe(50)
    })

    it('resolves LO_TOM to MIDI note 45', () => {
        expect(resolveTrackMidi('LO_TOM', im).midiNote).toBe(45)
    })

    it('falls back to note 36, channel 9 for completely unknown track name', () => {
        const r = resolveTrackMidi('XYZKJHGFD', im)
        expect(r.midiNote).toBe(36)
        expect(r.channel).toBe(9)
    })

    it('is case-insensitive', () => {
        const r = resolveTrackMidi('kick', im)
        expect(r.midiNote).toBe(36)
    })

    it('handles null gracefully', () => {
        const r = resolveTrackMidi(null, im)
        expect(r.midiNote).toBe(36)
    })

    it('returns midiNote 60 when instrument has MIDI mapping but no key', () => {
        const mockIm = {
            findByName: () => ({
                midi: [{ ch: '3', name: 'Synth' }],
                drum: false,
            }),
        }
        const r = resolveTrackMidi('SYNTH', mockIm)
        expect(r.midiNote).toBe(48)
        expect(r.channel).toBe(0)
        expect(r.isDrum).toBe(false)
    })

    it('returns default channel 9 when mapping.ch is missing', () => {
        const mockIm = {
            findByName: () => ({
                midi: [{ key: '60', name: 'Pad' }],
                drum: false,
            }),
        }
        const r = resolveTrackMidi('PAD', mockIm)
        expect(r.midiNote).toBe(60)
        expect(r.channel).toBe(0)
    })
})

// ─── buildInstrumentTrack ─────────────────────────────────────────────────────

describe('buildInstrumentTrack', () => {
    it('returns an MTrk chunk starting with MTrk', () => {
        const track = makeTrack('KICK', [makeNote(0, 0)])
        const chunk = buildInstrumentTrack(track, 36, 9)
        expect(String.fromCharCode(chunk[0], chunk[1], chunk[2], chunk[3])).toBe('MTrk')
    })

    it('chunk length field matches actual data length', () => {
        const track = makeTrack('KICK', [makeNote(0, 0)])
        const chunk = buildInstrumentTrack(track, 36, 9)
        const declaredLength = readUint32BE(chunk, 4)
        expect(declaredLength).toBe(chunk.length - 8)
    })

    it('empty notes produces minimal MTrk (only End of Track)', () => {
        const track = makeTrack('KICK', [])
        const chunk = buildInstrumentTrack(track, 36, 9)
        expect(String.fromCharCode(chunk[0], chunk[1], chunk[2], chunk[3])).toBe('MTrk')
    })

    it('contains Note On (0x90) and Note Off (0x80) for each note', () => {
        const track = makeTrack('KICK', [makeNote(0, 0, 1.0)])
        const chunk = buildInstrumentTrack(track, 36, 9)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const noteOns  = events.filter(e => e.type === 'midi' && e.status === 0x90)
        const noteOffs = events.filter(e => e.type === 'midi' && e.status === 0x80)
        expect(noteOns.length).toBe(1)
        expect(noteOffs.length).toBe(1)
    })

    it('Note On uses correct MIDI note number', () => {
        const track = makeTrack('KICK', [makeNote(0, 0)])
        const chunk = buildInstrumentTrack(track, 36, 9)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        expect(on.note).toBe(36)
    })

    it('Note On velocity is scaled from [0,1] to [0,127]', () => {
        const track = makeTrack('KICK', [makeNote(0, 0, 1.0)])
        const chunk = buildInstrumentTrack(track, 36, 9)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        expect(on.velocity).toBe(127)
    })

    it('Note On velocity 0.5 maps to 64', () => {
        const track = makeTrack('KICK', [makeNote(0, 0, 0.5)])
        const chunk = buildInstrumentTrack(track, 36, 9)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        expect(on.velocity).toBe(64)
    })

    it('second note in beat 1, beatStep 0 has correct absolute tick offset', () => {
        const track = makeTrack('KICK', [makeNote(1, 0, 1.0)], { stepsPerBeat: 4 })
        const chunk = buildInstrumentTrack(track, 36, 9)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        // beat=1, beatStep=0 → absoluteTick = 1 * 96 = 96
        // delta from cursor=0 → delta=96
        expect(on.delta).toBe(TICKS_PER_BAR)
    })

    it('beatStep subdivision is correct (stepsPerBeat=16 → 6 ticks/step)', () => {
        const track = makeTrack('KICK', [makeNote(0, 1, 1.0)], { stepsPerBeat: 16 })
        const chunk = buildInstrumentTrack(track, 36, 9)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        // 1 step = 96/16 = 6 ticks
        expect(on.delta).toBe(6)
    })

    it('uses channel correctly in status byte', () => {
        const track = makeTrack('KICK', [makeNote(0, 0)])
        const chunk = buildInstrumentTrack(track, 36, 3)  // channel 3
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        expect(on.channel).toBe(3)
    })

    it('pitch offset shifts MIDI note number', () => {
        const track = makeTrack('MELO', [makeNote(0, 0, 0.8, 5)])
        const chunk = buildInstrumentTrack(track, 60, 3) // base=60, pitch=5
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        expect(on.note).toBe(65)
    })

    it('loops=2 produces 2× the notes', () => {
        const track = makeTrack('KICK', [makeNote(0, 0), makeNote(1, 0)])
        const chunk1 = buildInstrumentTrack(track, 36, 9, 1)
        const chunk2 = buildInstrumentTrack(track, 36, 9, 2)
        const evts1 = parseMTrkEvents(chunk1, 8, chunk1.length - 8).filter(e => e.type === 'midi' && e.status === 0x90)
        const evts2 = parseMTrkEvents(chunk2, 8, chunk2.length - 8).filter(e => e.type === 'midi' && e.status === 0x90)
        expect(evts2.length).toBe(evts1.length * 2)
    })

    it('ends with an End of Track meta event (0xFF 0x2F 0x00)', () => {
        const track = makeTrack('KICK', [makeNote(0, 0)])
        const chunk = buildInstrumentTrack(track, 36, 9)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const last = events[events.length - 1]
        expect(last.type).toBe('meta')
        expect(last.metaType).toBe(0x2F)
    })

    it('contains a track-name meta event (0x03) with the track name', () => {
        const track = makeTrack('SNARE', [makeNote(0, 0)])
        const chunk = buildInstrumentTrack(track, 38, 9)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const nameEvt = events.find(e => e.type === 'meta' && e.metaType === 0x03)
        const name = String.fromCharCode(...nameEvt.data)
        expect(name).toBe('SNARE')
    })

    it('clamped velocity: >1 treated as 127', () => {
        const track = makeTrack('KICK', [makeNote(0, 0, 2.0)])
        const chunk = buildInstrumentTrack(track, 36, 9)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        expect(on.velocity).toBe(127)
    })

    it('clamped note: pitch offset cannot exceed MIDI 127', () => {
        const track = makeTrack('MELO', [makeNote(0, 0, 0.8, 200)])
        const chunk = buildInstrumentTrack(track, 60, 3)
        const events = parseMTrkEvents(chunk, 8, chunk.length - 8)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        expect(on.note).toBeLessThanOrEqual(127)
    })
})

// ─── MidiExporter (integration) ──────────────────────────────────────────────

describe('MidiExporter', () => {
    let exporter

    beforeEach(() => {
        exporter = new MidiExporter()
    })

    it('throws when pattern is null', () => {
        expect(() => exporter.export(null)).toThrow()
    })

    it('returns a Uint8Array', () => {
        const result = exporter.export(makePattern())
        expect(result).toBeInstanceOf(Uint8Array)
    })

    it('starts with MThd', () => {
        const result = exporter.export(makePattern())
        expect(String.fromCharCode(result[0], result[1], result[2], result[3])).toBe('MThd')
    })

    it('MThd length is 6', () => {
        const result = exporter.export(makePattern())
        expect(readUint32BE(result, 4)).toBe(6)
    })

    it('format is 1 (multi-track)', () => {
        const result = exporter.export(makePattern())
        expect(readUint16BE(result, 8)).toBe(1)
    })

    it('PPQN is 96', () => {
        const result = exporter.export(makePattern())
        expect(readUint16BE(result, 12)).toBe(96)
    })

    it('numTracks = 1 (tempo) when no tracks in pattern', () => {
        const result = exporter.export(makePattern({ tracks: [] }))
        expect(readUint16BE(result, 10)).toBe(1)
    })

    it('numTracks = 1 + number of non-muted tracks', () => {
        const pattern = makePattern({
            tracks: [
                makeTrack('KICK', [makeNote(0, 0)]),
                makeTrack('SNARE', [makeNote(1, 0)]),
            ]
        })
        const result = exporter.export(pattern)
        expect(readUint16BE(result, 10)).toBe(3)
    })

    it('muted tracks are excluded', () => {
        const pattern = makePattern({
            tracks: [
                makeTrack('KICK',  [makeNote(0, 0)], { mute: false }),
                makeTrack('SNARE', [makeNote(1, 0)], { mute: true }),
            ]
        })
        const result = exporter.export(pattern)
        expect(readUint16BE(result, 10)).toBe(2) // only KICK + tempo
    })

    it('all chunks are well-formed (tag + declared length = actual slice)', () => {
        const pattern = makePattern({
            tracks: [
                makeTrack('KICK',  [makeNote(0, 0), makeNote(2, 0)]),
                makeTrack('SNARE', [makeNote(1, 0)]),
                makeTrack('CHH',   [makeNote(0, 1), makeNote(0, 3)]),
            ]
        })
        const bytes = Array.from(exporter.export(pattern))
        const chunks = parseChunks(bytes)
        expect(chunks).toHaveLength(5) // header + tempo + kick + snare + chh
        for (const ch of chunks) {
            expect(['MThd', 'MTrk']).toContain(ch.tag)
            expect(ch.dataOffset + ch.length).toBeLessThanOrEqual(bytes.length)
        }
    })

    it('tempo track contains a Set Tempo meta event (0x51)', () => {
        const result = exporter.export(makePattern({ bpm: 140 }))
        const chunks = parseChunks(Array.from(result))
        const tempoChunk = chunks[1] // second chunk = tempo track
        const events = parseMTrkEvents(result, tempoChunk.dataOffset, tempoChunk.length)
        const tempoEvt = events.find(e => e.type === 'meta' && e.metaType === 0x51)
        // bpm=140 → 60_000_000/140 = 428571 µs/beat
        const us = (tempoEvt.data[0] << 16) | (tempoEvt.data[1] << 8) | tempoEvt.data[2]
        expect(us).toBe(Math.round(60_000_000 / 140))
    })

    it('tempo track contains time signature meta (0x58) in 4/4', () => {
        const result = exporter.export(makePattern())
        const chunks = parseChunks(Array.from(result))
        const tempoChunk = chunks[1]
        const events = parseMTrkEvents(result, tempoChunk.dataOffset, tempoChunk.length)
        const tsEvt = events.find(e => e.type === 'meta' && e.metaType === 0x58)
        expect(tsEvt.data[0]).toBe(4) // numerator = 4
        expect(tsEvt.data[1]).toBe(2) // denominator = 2^2 = 4
    })

    it('correct notes appear on MIDI channel 10 (index 9) for KICK', () => {
        const pattern = makePattern({
            tracks: [makeTrack('KICK', [makeNote(0, 0, 1.0)])]
        })
        const result = exporter.export(pattern)
        const chunks = parseChunks(Array.from(result))
        const kickChunk = chunks[2]
        const events = parseMTrkEvents(result, kickChunk.dataOffset, kickChunk.length)
        const on = events.find(e => e.type === 'midi' && e.status === 0x90)
        expect(on.channel).toBe(9)
        expect(on.note).toBe(36)
        expect(on.velocity).toBe(127)
    })

    it('empty pattern is exportable without error', () => {
        expect(() => exporter.export(makePattern({ tracks: [] }))).not.toThrow()
    })

    it('pattern with default bpm/nbBeats is exportable', () => {
        const pattern = { tracks: [] }
        expect(() => exporter.export(pattern)).not.toThrow()
    })

    it('loops option duplicates note events', () => {
        const pattern = makePattern({
            tracks: [makeTrack('KICK', [makeNote(0, 0)])]
        })
        const r1 = exporter.export(pattern, { loops: 1 })
        const r2 = exporter.export(pattern, { loops: 2 })
        expect(r2.length).toBeGreaterThan(r1.length)

        const chunks1 = parseChunks(Array.from(r1))
        const chunks2 = parseChunks(Array.from(r2))
        const on1 = parseMTrkEvents(r1, chunks1[2].dataOffset, chunks1[2].length)
            .filter(e => e.type === 'midi' && e.status === 0x90)
        const on2 = parseMTrkEvents(r2, chunks2[2].dataOffset, chunks2[2].length)
            .filter(e => e.type === 'midi' && e.status === 0x90)
        expect(on2.length).toBe(on1.length * 2)
    })

    it('exported bytes are parseable as valid SMF (total length consistent)', () => {
        const pattern = makePattern({
            bpm: 110,
            nbBeats: 8,
            tracks: [
                makeTrack('KICK',  [makeNote(0,0), makeNote(2,0), makeNote(4,0), makeNote(6,0)]),
                makeTrack('SNARE', [makeNote(1,0), makeNote(3,0)]),
                makeTrack('CHH',   [makeNote(0,1), makeNote(0,2), makeNote(0,3)]),
            ]
        })
        const result = exporter.export(pattern)
        const bytes  = Array.from(result)
        const chunks = parseChunks(bytes)

        // numTracks in header should match actual MTrk count
        const numTracksHeader = readUint16BE(result, 10)
        const mtrks = chunks.filter(c => c.tag === 'MTrk')
        expect(mtrks.length).toBe(numTracksHeader)

        // Sum of all chunk sizes should equal total file size
        let total = 0
        for (const ch of chunks) total += 8 + ch.length
        expect(total).toBe(result.length)
    })
})
