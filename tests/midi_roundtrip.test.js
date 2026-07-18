/**
 * Round-trip MIDI test: Pattern -> MIDI Export -> MIDI Import -> Verify
 */
import { describe, it, expect, beforeEach } from 'vitest'
import InstrumentsManager from '../src/logic/services/instruments_manager.js'
import { parseMidi, findAllNotes, midiVelocityToNormalized } from '../src/logic/midi/midi_parser.js'
import MidiExporter, { C3_MIDI_NOTE } from '../src/logic/midi/midi_exporter.js'
import { TICK } from '../src/core/constants.js'
import Utils from '../src/core/utils.js'

function createTestPattern(overrides = {}) {
  const baseTrack = {
    name: 'KICK',
    nbBeats: 4,
    stepsPerBeat: 4,
    velocity: 0.8,
    pitch: 0,
    pan: 0,
    mute: false,
    filterType: 'lowpass',
    filterFreq: 0.5,
    filterQ: 0.5,
    reverbAmount: 0,
    reverbType: 'none',
    delayDepth: 0,
    delayTime: 0.25,
    delayType: 'none',
    saturationAmount: 0,
    saturationType: 'soft',
    swingAmount: 0,
    loopAtStep: 16,
    notes: [
      { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0 },
      { beat: 1, beatStep: 0, velocity: 0.8, pitch: 2 },
      { beat: 2, beatStep: 0, velocity: 0.6, pitch: -1 },
      { beat: 3, beatStep: 0, velocity: 0.4, pitch: 3 },
    ]
  }
  return {
    name: 'RoundTripTest',
    bpm: 120,
    nbBeats: 4,
    tracks: [baseTrack],
    ...overrides
  }
}

describe('MIDI Round-trip: Pattern -> Export -> Import -> Verify', () => {
  let im, pattern

  beforeEach(() => {
    im = new InstrumentsManager()
    pattern = createTestPattern()
  })

  it('exports and imports KICK notes correctly', async () => {
    const exporter = new MidiExporter(im)
    const midiBytes = exporter.export(pattern)

    const midiData = parseMidi(new Uint8Array(midiBytes))
    const notes = findAllNotes(midiData)

    const kickNotes = notes.filter(n => n.note === 36)
    expect(kickNotes.length).toBeGreaterThan(0)

    const importedPattern = { ...pattern, tracks: pattern.tracks.map(t => ({ ...t, notes: [] })) }
    const tracks = Utils.getTracksArray(importedPattern)

    // Build track -> base MIDI note mapping
    const trackBaseNotes = new Map()
    for (const track of tracks) {
      const instrument = im.findByName(track.name)
      const baseMidiNote = instrument.midi[0]?.key ? parseInt(instrument.midi[0].key, 10) : 48
      trackBaseNotes.set(track.name, { track, baseMidiNote })
    }

    // MIDI exporter uses PPQN=96 per quarter note, TICK=32 per quarter note
    // MIDI_RATIO = 96/32 = 3
    // Engine tick = MIDI tick / 3
    // Pattern beat = engineTick / 32, beatStep = (engineTick % 32) / 8
    const MIDI_RATIO = 3

    // For each MIDI note, find the closest track by base MIDI note (within ±12 semitones)
    for (const note of notes) {
      let bestTrack = null
      let bestDiff = Infinity
      let bestBaseMidiNote = 60

      for (const [trackName, { track, baseMidiNote }] of trackBaseNotes) {
        const diff = Math.abs(note.note - baseMidiNote)
        if (diff < bestDiff && diff <= 12) {
          bestDiff = diff
          bestTrack = track
          bestBaseMidiNote = baseMidiNote
        }
      }

      if (!bestTrack) continue

      const engineTicks = Math.round(note.absTick / MIDI_RATIO)
      const beat = Math.floor(engineTicks / 32)
      const beatStep = Math.floor((engineTicks % 32) / 8)

      // Pitch = exported MIDI note - base MIDI note (in semitones)
      const pitch = note.note - bestBaseMidiNote

      bestTrack.notes.push({
        beat,
        beatStep,
        velocity: midiVelocityToNormalized(note.velocity),
        pitch
      })
    }

    const importedKickTrack = tracks.find(t => t.name === 'KICK')
    expect(importedKickTrack).toBeDefined()
    expect(importedKickTrack.notes.length).toBeGreaterThanOrEqual(4)

    // Check each original note position is present in imported track
    // (exporter may generate additional notes due to variations, so check by position not index)
    const originalNotes = pattern.tracks[0].notes
    for (const orig of originalNotes) {
      const found = importedKickTrack.notes.some(imp => 
        imp.beat === orig.beat && imp.beatStep === orig.beatStep
      )
      expect(found).toBe(true)

      // Verify pitch and velocity match
      const importedNote = importedKickTrack.notes.find(imp => 
        imp.beat === orig.beat && imp.beatStep === orig.beatStep
      )
      expect(importedNote).toBeDefined()
      expect(importedNote.pitch).toBe(orig.pitch)
      expect(importedNote.velocity).toBeCloseTo(orig.velocity, 2)
    }
  })

  it('handles multiple tracks (KICK + SNARE)', async () => {
const multiPattern = {
      ...pattern,
      tracks: [
        { ...pattern.tracks[0], name: 'KICK', pitch: 0, notes: [
          { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0 },
          { beat: 1, beatStep: 0, velocity: 0.8, pitch: 1 },
        ]},
        { ...pattern.tracks[0], name: 'SNARE', pitch: 0, notes: [
          { beat: 0, beatStep: 2, velocity: 0.7, pitch: 3 },
          { beat: 1, beatStep: 2, velocity: 0.5, pitch: 2 },
        ]}
      ]
    }

    const exporter = new MidiExporter(im)
    const midiBytes = exporter.export(multiPattern)
    const midiData = parseMidi(new Uint8Array(midiBytes))
    const notes = findAllNotes(midiData)

    // Debug: log exported notes
    console.log('Multi-track export notes:', notes.map(n => ({ note: n.note, channel: n.channel, tick: n.absTick, velocity: n.velocity })))

    const importedPattern = { ...multiPattern, tracks: multiPattern.tracks.map(t => ({ ...t, notes: [] })) }
    const tracks = Utils.getTracksArray(importedPattern)

    // Build track -> base MIDI note mapping
    const trackBaseNotes = new Map()
    for (const track of tracks) {
      const instrument = im.findByName(track.name)
      const baseMidiNote = instrument.midi[0]?.key ? parseInt(instrument.midi[0].key, 10) : 48
      trackBaseNotes.set(track.name, { track, baseMidiNote })
    }

    // MIDI exporter uses PPQN=96 per quarter note, TICK=32 per quarter note
    // MIDI_RATIO = 96/32 = 3
    // Engine tick = MIDI tick / 3
    // Pattern beat = engineTick / 32, beatStep = (engineTick % 32) / 8
    const MIDI_RATIO = 3

    // For each MIDI note, find the closest track by base MIDI note (within ±12 semitones)
    for (const note of notes) {
      let bestTrack = null
      let bestDiff = Infinity
      let bestBaseMidiNote = 60

      for (const [trackName, { track, baseMidiNote }] of trackBaseNotes) {
        const diff = Math.abs(note.note - baseMidiNote)
        if (diff < bestDiff && diff <= 12) {
          bestDiff = diff
          bestTrack = track
          bestBaseMidiNote = baseMidiNote
        }
      }

      if (!bestTrack) continue

      const engineTicks = Math.round(note.absTick / MIDI_RATIO)
      const beat = Math.floor(engineTicks / 32)
      const beatStep = Math.floor((engineTicks % 32) / 8)

      // Pitch = exported MIDI note - base MIDI note (in semitones)
      const pitch = note.note - bestBaseMidiNote

      bestTrack.notes.push({
        beat,
        beatStep,
        velocity: midiVelocityToNormalized(note.velocity),
        pitch
      })
    }

    const kickTrack = tracks.find(t => t.name === 'KICK')
    expect(kickTrack.notes.length).toBeGreaterThanOrEqual(2)
    
    const origKickNotes = multiPattern.tracks[0].notes
    for (const orig of origKickNotes) {
      const found = kickTrack.notes.some(imp => 
        imp.beat === orig.beat && imp.beatStep === orig.beatStep
      )
      expect(found).toBe(true)

      // Verify pitch and velocity match (note pitch only, track pitch is 0)
      const importedNote = kickTrack.notes.find(imp => 
        imp.beat === orig.beat && imp.beatStep === orig.beatStep
      )
      expect(importedNote).toBeDefined()
      // Total pitch = track pitch (0) + note pitch
      expect(importedNote.pitch).toBe(orig.pitch)
      expect(importedNote.velocity).toBeCloseTo(orig.velocity, 2)
    }

    const snareTrack = tracks.find(t => t.name === 'SNARE')
    expect(snareTrack.notes.length).toBeGreaterThanOrEqual(2)
    
    const origSnareNotes = multiPattern.tracks[1].notes
    for (const orig of origSnareNotes) {
      const found = snareTrack.notes.some(imp => 
        imp.beat === orig.beat && imp.beatStep === orig.beatStep
      )
      expect(found).toBe(true)

      const importedNote = snareTrack.notes.find(imp => 
        imp.beat === orig.beat && imp.beatStep === orig.beatStep
      )
      expect(importedNote).toBeDefined()
      expect(importedNote.pitch).toBe(orig.pitch)
      expect(importedNote.velocity).toBeCloseTo(orig.velocity, 2)
    }
  })

  it('handles velocity LFO replacement semantics on export', async () => {
    const lfoPattern = {
      ...pattern,
      tracks: [{
        ...pattern.tracks[0],
        velocityLfo: { freq: 1, min: 0, max: 1, phase: 0.25, type: 'sine' },
        notes: [{ beat: 0, beatStep: 0, velocity: 1.0 }]
      }]
    }

    const exporter = new MidiExporter(im)
    const midiBytes = exporter.export(lfoPattern)
    const midiData = parseMidi(new Uint8Array(midiBytes))
    const notes = findAllNotes(midiData)

    const kickNotes = notes.filter(n => n.note === 36)
    expect(kickNotes.length).toBeGreaterThan(0)
    
    expect(kickNotes[0].velocity).toBe(64)
  })

  it('round-trip with melodic track preserves pitch, velocity, and track names', async () => {
    const meloPattern = {
      name: 'MelodicTest',
      bpm: 120,
      nbBeats: 4,
      tracks: [
        {
          name: 'KICK',
          nbBeats: 4, stepsPerBeat: 4, velocity: 1, pitch: 0, pan: 0,
          mute: false, loopAtStep: 16, swingAmount: 0,
          filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.5,
          reverbAmount: 0, reverbType: 'none', delayDepth: 0, delayTime: 0.25, delayType: 'none',
          saturationAmount: 0, saturationType: 'soft',
          notes: [
            { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0 },
            { beat: 2, beatStep: 0, velocity: 0.7, pitch: 0 },
          ]
        },
        {
          name: 'MELO',
          nbBeats: 4, stepsPerBeat: 4, velocity: 1, pitch: 0, pan: 0,
          mute: false, loopAtStep: 16, swingAmount: 0,
          filterType: 'lowpass', filterFreq: 0.5, filterQ: 0.5,
          reverbAmount: 0, reverbType: 'none', delayDepth: 0, delayTime: 0.25, delayType: 'none',
          saturationAmount: 0, saturationType: 'soft',
          notes: [
            { beat: 0, beatStep: 0, velocity: 0.9, pitch: 0 },
            { beat: 0, beatStep: 2, velocity: 0.6, pitch: 5 },
            { beat: 1, beatStep: 0, velocity: 0.8, pitch: -3 },
            { beat: 2, beatStep: 0, velocity: 0.7, pitch: 7 },
            { beat: 3, beatStep: 0, velocity: 0.5, pitch: -5 },
          ]
        }
      ]
    }

    const exporter = new MidiExporter(im)
    const midiBytes = exporter.export(meloPattern)
    const midiData = parseMidi(new Uint8Array(midiBytes))
    const notes = findAllNotes(midiData)

    const PPQN = midiData.header.division ?? 96
    const MIDI_RATIO = PPQN / TICK

    // MELO is on channel 0 (first melodic channel, sequential assignment)
    const MELO_CHANNEL = 0
    const MELO_BASE_NOTE = 48

    // Verify KICK on channel 9 (0-indexed = MIDI channel 10)
    const kickNotes = notes.filter(n => n.channel === 9)
    expect(kickNotes.length).toBeGreaterThanOrEqual(2)
    for (const kn of kickNotes) {
      expect(kn.note).toBe(36)
    }

    // Verify MELO on channel 4
    const meloNotes = notes.filter(n => n.channel === MELO_CHANNEL)
    expect(meloNotes.length).toBeGreaterThanOrEqual(5)

    // Verify MELO pitch: base=60, pitch offsets preserved
    const meloTrack = meloPattern.tracks[1]
    for (const orig of meloTrack.notes) {
      const engineTick = Math.round(orig.beat * TICK + Math.round((orig.beatStep * TICK) / 4))
      const midiTick = Math.round(engineTick * MIDI_RATIO)

      const found = meloNotes.find(n => {
        const nEngineTick = Math.round(n.absTick / MIDI_RATIO)
        const nBeat = Math.floor(nEngineTick / TICK)
        const nBeatStep = Math.round((nEngineTick % TICK) / (TICK / 4))
        return nBeat === orig.beat && nBeatStep === orig.beatStep
      })

      expect(found).toBeDefined()
      const expectedMidiNote = MELO_BASE_NOTE + orig.pitch
      expect(found.note).toBe(expectedMidiNote)
      expect(found.velocity).toBe(Math.round(orig.velocity * 127))
    }

    // Verify track names are embedded in MIDI
    const trackNames = midiData.trackNames.filter(Boolean)
    expect(trackNames).toContain('KICK')
    expect(trackNames).toContain('MELO')
  })

  it('preserves pitch -12 to +12 on BASS track with track pitch = 0', async () => {
    const pitches = Array.from({ length: 25 }, (_, i) => i - 12)
    const bassNotes = pitches.map((pitch, i) => ({
      beat: Math.floor(i / 4),
      beatStep: i % 4,
      velocity: 0.8,
      pitch
    }))

    const bassPattern = {
      name: 'BassPitchTest',
      bpm: 120,
      nbBeats: 7,
      tracks: [
        { ...pattern.tracks[0], name: 'KICK', pitch: 0, notes: [
          { beat: 0, beatStep: 0, velocity: 1.0, pitch: 0 },
        ]},
        { ...pattern.tracks[0], name: 'BASS', pitch: 0, nbBeats: 7, notes: bassNotes }
      ]
    }

    const exporter = new MidiExporter(im)
    const midiBytes = exporter.export(bassPattern)
    const midiData = parseMidi(new Uint8Array(midiBytes))
    const notes = findAllNotes(midiData)

    const PPQN = midiData.header.division ?? 96
    const MIDI_RATIO = PPQN / TICK

    const BASS_BASE_NOTE = 48
    const BASS_CHANNEL = 0

    const bassExported = notes.filter(n => n.channel === BASS_CHANNEL)
    expect(bassExported.length).toBeGreaterThanOrEqual(25)

    // Track pitch stays at 0
    expect(bassPattern.tracks[1].pitch).toBe(0)

    // Verify exported MIDI note = base + pitch for every note
    for (const orig of bassPattern.tracks[1].notes) {
      const engineTick = Math.round(orig.beat * TICK + Math.round((orig.beatStep * TICK) / 4))
      const midiTick = Math.round(engineTick * MIDI_RATIO)

      const found = bassExported.find(n => {
        const nEngineTick = Math.round(n.absTick / MIDI_RATIO)
        const nBeat = Math.floor(nEngineTick / TICK)
        const nBeatStep = Math.round((nEngineTick % TICK) / (TICK / 4))
        return nBeat === orig.beat && nBeatStep === orig.beatStep
      })

      expect(found).toBeDefined()
      expect(found.note).toBe(BASS_BASE_NOTE + orig.pitch)
    }

    // Full roundtrip: reconstruct pitches from MIDI and verify
    for (const orig of bassPattern.tracks[1].notes) {
      const engineTick = Math.round(orig.beat * TICK + Math.round((orig.beatStep * TICK) / 4))
      const midiTick = Math.round(engineTick * MIDI_RATIO)

      const found = bassExported.find(n => {
        const nEngineTick = Math.round(n.absTick / MIDI_RATIO)
        const nBeat = Math.floor(nEngineTick / TICK)
        const nBeatStep = Math.round((nEngineTick % TICK) / (TICK / 4))
        return nBeat === orig.beat && nBeatStep === orig.beatStep
      })

      const roundtripPitch = found.note - BASS_BASE_NOTE
      expect(roundtripPitch).toBe(orig.pitch)
    }
  })

  it('reads notes from track 0 in format-0 MIDI files', () => {
    const PPQN = 96
    const division = PPQN

    // Build minimal format-0 MIDI: header + 1 track with 3 notes
    const trackName = 'TEST'
    const noteEvents = [
      { note: 60, vel: 100, delta: 0 },
      { note: 64, vel: 80, delta: PPQN },
      { note: 67, vel: 60, delta: PPQN },
    ]

    let trackData = []
    // Meta: track name
    const nameBytes = [...trackName].map(c => c.charCodeAt(0))
    trackData.push(0x00, 0xFF, 0x03, nameBytes.length, ...nameBytes)

    for (const ev of noteEvents) {
      trackData.push(ev.delta & 0x7F, 0x90, ev.note, ev.vel)
    }
    trackData.push(0x00, 0xFF, 0x2F, 0x00)

    const trackLen = trackData.length
    const header = [
      0x4D, 0x54, 0x68, 0x64, // MThd
      0x00, 0x00, 0x00, 0x06, // length=6
      0x00, 0x00,              // format=0
      0x00, 0x01,              // ntracks=1
      (division >> 8) & 0xFF, division & 0xFF, // division
      0x4D, 0x54, 0x72, 0x6B, // MTrk
      (trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF, (trackLen >> 8) & 0xFF, trackLen & 0xFF,
      ...trackData,
    ]

    const midiData = parseMidi(new Uint8Array(header))
    expect(midiData.header.format).toBe(0)
    expect(midiData.tracks.length).toBe(1)

    const notes = findAllNotes(midiData)
    expect(notes.length).toBe(3)
    expect(notes[0].note).toBe(60)
    expect(notes[1].note).toBe(64)
    expect(notes[2].note).toBe(67)
    expect(notes[0].trackIdx).toBe(0)
  })

  it('reads notes from all tracks in format-2 MIDI files', () => {
    const PPQN = 96
    const division = PPQN

    // Track 0: 2 notes
    const track0 = []
    track0.push(0x00, 0xFF, 0x03, 0x05, ...'TRK_0'.split('').map(c => c.charCodeAt(0)))
    track0.push(0x00, 0x90, 60, 100)
    track0.push(PPQN & 0x7F, 0x90, 64, 80)
    track0.push(0x00, 0xFF, 0x2F, 0x00)

    // Track 1: 1 note
    const track1 = []
    track1.push(0x00, 0xFF, 0x03, 0x05, ...'TRK_1'.split('').map(c => c.charCodeAt(0)))
    track1.push(0x00, 0x90, 72, 90)
    track1.push(0x00, 0xFF, 0x2F, 0x00)

    const header = [
      0x4D, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x02,              // format=2
      0x00, 0x02,              // ntracks=2
      (division >> 8) & 0xFF, division & 0xFF,
      0x4D, 0x54, 0x72, 0x6B,
      (track0.length >> 24) & 0xFF, (track0.length >> 16) & 0xFF, (track0.length >> 8) & 0xFF, track0.length & 0xFF,
      ...track0,
      0x4D, 0x54, 0x72, 0x6B,
      (track1.length >> 24) & 0xFF, (track1.length >> 16) & 0xFF, (track1.length >> 8) & 0xFF, track1.length & 0xFF,
      ...track1,
    ]

    const midiData = parseMidi(new Uint8Array(header))
    expect(midiData.header.format).toBe(2)
    expect(midiData.tracks.length).toBe(2)

    const notes = findAllNotes(midiData)
    expect(notes.length).toBe(3)
    expect(notes[0].note).toBe(60)
    expect(notes[1].note).toBe(64)
    expect(notes[2].note).toBe(72)
    expect(notes[0].trackIdx).toBe(0)
    expect(notes[2].trackIdx).toBe(1)
  })
})