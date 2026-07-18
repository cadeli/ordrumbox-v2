/**
 * MIDI JSON Roundtrip test:
 * Load JSON → Export MIDI (1 loop) → Import MIDI → Compare beat/beatStep/pitch
 *
 * What survives roundtrip:
 *   - beat, beatStep, pitch (absolute for melodic with C3 base)
 *   - note counts per track
 *   - track names (for resolved instruments)
 *
 * What does NOT survive (by design):
 *   - Tracks with no notes are NOT exported to MIDI
 *   - Track-level properties: pan, reverb, filter, delay, saturation,
 *     swing, velocity (track multiplier), velocityLfo, panLfo, soundId, etc.
 *   - Note velocity (MIDI velocity ≠ orDrumbox velocity in all cases)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { importPatternFromJson } from '../src/logic/commands/pattern_import.js'
import MidiExporter from '../src/logic/midi/midi_exporter.js'
import { C3_MIDI_NOTE } from '../src/logic/midi/midi_exporter.js'
import InstrumentsManager from '../src/logic/services/instruments_manager.js'
import { parseMidi, findAllNotes, extractProgramChanges } from '../src/logic/midi/midi_parser.js'
import { TICK } from '../src/core/constants.js'
import MfCmd from '../src/logic/commands/cmd.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import * as patternsManager from '../src/patterns/manager.js'
import { computeFlatNotesFromPattern } from '../src/patterns/engine.js'

const SIMPLE_JSON = {
    application: 'online-ordrumbox',
    url: 'https://www.ordrumbox.com',
    name: 'roundtrip-test',
    tracks: [
        {
            name: 'KICK',
            noteKeys: ['beat'],
            notes: [[0], [1], [2], [3]],
        },
        {
            name: 'SNARE',
            noteKeys: ['beat', 'beatStep'],
            notes: [[0, 2], [1, 2], [2, 2], [3, 2]],
        },
        {
            name: 'BASS',
            noteKeys: ['beat', 'beatStep', 'pitch'],
            notes: [
                [0, 0, -4], [0, 2, -3],
                [1, 0, -2], [1, 2, -1],
                [2, 0, 0],  [2, 2, 1],
                [3, 0, 2],  [3, 2, 3],
            ],
        },
        {
            name: 'OHH',
            noteKeys: ['beatStep'],
            notes: [[1]],
        },
        {
            name: 'RIMSHOT',
            noteKeys: ['beat'],
            notes: [],
        },
        {
            name: 'CLAP',
        },
    ],
}

function importMidiToPattern(midiBytes, mfCmd) {
    const midiData = parseMidi(new Uint8Array(midiBytes))
    const notes = findAllNotes(midiData)
    const PPQN = midiData.header.division ?? 96
    const TICK_RATIO = PPQN / TICK
    const bpm = midiData.header.tempo ? Math.round(60000000 / midiData.header.tempo) : 120

    const channelPrograms = extractProgramChanges(midiData)

    const channelTrackNames = new Map()
    for (const note of notes) {
        if (!channelTrackNames.has(note.channel)) {
            channelTrackNames.set(note.channel, midiData.trackNames?.[note.trackIdx] ?? '')
        }
    }

    const channelNotes = new Map()
    for (const note of notes) {
        if (!channelNotes.has(note.channel)) channelNotes.set(note.channel, [])
        channelNotes.get(note.channel).push(note)
    }

    const im = new InstrumentsManager()
    const trackDefs = []

    for (const [channel, chNotes] of channelNotes) {
        const program = channelPrograms.has(channel) ? channelPrograms.get(channel) : null
        const midiTrackName = channelTrackNames.get(channel) ?? ''

        const melodicInst = program !== null ? im.findInstrumentFromMidiProgram(channel, program) : { id: 'NOT_FOUND' }
        if (melodicInst.id !== 'NOT_FOUND' && !melodicInst.drum) {
            const trackName = melodicInst.id
            if (!trackDefs.some(d => d.trackName === trackName)) {
                trackDefs.push({ trackName, groupNotes: chNotes, baseNote: C3_MIDI_NOTE })
            }
            continue
        }

        const noteGroups = new Map()
        for (const note of chNotes) {
            if (!noteGroups.has(note.note)) noteGroups.set(note.note, [])
            noteGroups.get(note.note).push(note)
        }

        let drumFound = false
        for (const [noteNum, grpNotes] of noteGroups) {
            const drumInst = im.findInstrumentFromMidi(channel, noteNum)
            if (drumInst.id === 'NOT_FOUND') continue
            const trackName = drumInst.id
            if (!trackDefs.some(d => d.trackName === trackName)) {
                trackDefs.push({ trackName, groupNotes: grpNotes, baseNote: noteNum })
                drumFound = true
            }
        }
        if (drumFound) continue

        if (midiTrackName) {
            const nameInst = im.findByName(midiTrackName)
            if (nameInst) {
                const trackName = nameInst.id
                if (!trackDefs.some(d => d.trackName === trackName)) {
                    trackDefs.push({ trackName, groupNotes: chNotes, baseNote: C3_MIDI_NOTE })
                }
                continue
            }
        }

        if (program !== null) {
            const programInst = im.findInstrumentFromMidiProgramAnyChannel(program)
            if (programInst.id !== 'NOT_FOUND') {
                const trackName = programInst.id
                if (!trackDefs.some(d => d.trackName === trackName)) {
                    trackDefs.push({ trackName, groupNotes: chNotes, baseNote: C3_MIDI_NOTE })
                }
            }
        }
    }

    const pattern = mfCmd.addPattern('roundtrip-midi')
    pattern.nbBeats = 32
    pattern.bpm = bpm

    for (const def of trackDefs) {
        const track = mfCmd.addTrack(pattern, def.trackName)
        const ticksPerStep = TICK / (track.stepsPerBeat ?? 4)

        for (const note of def.groupNotes) {
            const engineTicks = Math.round(note.absTick / TICK_RATIO)
            const beat = Math.floor(engineTicks / TICK)
            const beatStep = Math.round((engineTicks % TICK) / ticksPerStep)
            const pitch = note.note - def.baseNote

            mfCmd.addNote(track, beat, beatStep, pitch)
        }
    }

    return pattern
}

function getNotePositions(pattern) {
    const positions = new Map()
    const flatMap = computeFlatNotesFromPattern(pattern, 0)
    for (const [, flatNotes] of flatMap) {
        for (const fn of flatNotes) {
            const name = fn.track.name
            if (!positions.has(name)) positions.set(name, [])
            positions.get(name).push({
                beat: fn.note.beat ?? 0,
                beatStep: fn.note.beatStep ?? 0,
                pitch: fn.note.pitch ?? 0,
            })
        }
    }
    for (const [, arr] of positions) {
        arr.sort((a, b) => a.beat - b.beat || a.beatStep - b.beatStep || a.pitch - b.pitch)
    }
    return positions
}

function normalizeNote(n) {
    return { beat: n.beat ?? 0, beatStep: n.beatStep ?? 0, pitch: n.pitch ?? 0 }
}

function notesEqual(a, b) {
    return a.beat === b.beat && a.beatStep === b.beatStep && a.pitch === b.pitch
}

describe('MIDI JSON Roundtrip', () => {
    let mfCmd, originalPattern

    beforeEach(() => {
        appState.patterns = []
        serviceRegistry.reset()
        serviceRegistry.mfPatterns = patternsManager
        soundRegistry.reset()

        mfCmd = new MfCmd()
        serviceRegistry.mfCmd = mfCmd

        originalPattern = importPatternFromJson(
            SIMPLE_JSON,
            (name) => mfCmd.addPattern(name),
            (pat, name) => mfCmd.addTrack(pat, name),
            (track, beat, beatStep, pitch) => mfCmd.addNote(track, beat, beatStep, pitch)
        )
    })

    it('loads JSON and produces correct tracks', () => {
        const withNotes = originalPattern.tracks.filter(t => t.notes.length > 0)
        expect(withNotes.map(t => t.name).sort()).toEqual(['BASS', 'KICK', 'OHH', 'SNARE'])
    })

    it('note counts survive MIDI roundtrip', () => {
        const im = new InstrumentsManager()
        const exporter = new MidiExporter(im)
        const midiBytes = exporter.export(originalPattern, { loops: 1 })

        const reimported = importMidiToPattern(midiBytes, mfCmd)

        const origPositions = getNotePositions(originalPattern)
        const reimportedPositions = getNotePositions(reimported)

        for (const [name, origNotes] of origPositions) {
            const reNotes = reimportedPositions.get(name)
            expect(reNotes, `[${name}] should exist after roundtrip`).toBeDefined()
            expect(reNotes.length, `[${name}] note count`).toBe(origNotes.length)
        }
    })

    it('beat/beatStep positions survive MIDI roundtrip', () => {
        const im = new InstrumentsManager()
        const exporter = new MidiExporter(im)
        const midiBytes = exporter.export(originalPattern, { loops: 1 })

        const reimported = importMidiToPattern(midiBytes, mfCmd)

        const origPositions = getNotePositions(originalPattern)
        const reimportedPositions = getNotePositions(reimported)

        for (const [name, origNotes] of origPositions) {
            const reNotes = reimportedPositions.get(name)
            expect(reNotes, `[${name}] should exist`).toBeDefined()

            const origBeatPos = origNotes.map(n => `${n.beat}:${n.beatStep}`).sort()
            const reBeatPos = reNotes.map(n => `${n.beat}:${n.beatStep}`).sort()
            expect(reBeatPos, `[${name}] beat:beatStep positions`).toEqual(origBeatPos)
        }
    })

    it('BASS pitch values survive MIDI roundtrip (C3 base)', () => {
        const im = new InstrumentsManager()
        const exporter = new MidiExporter(im)
        const midiBytes = exporter.export(originalPattern, { loops: 1 })

        const reimported = importMidiToPattern(midiBytes, mfCmd)

        const origPositions = getNotePositions(originalPattern)
        const reimportedPositions = getNotePositions(reimported)

        const origBass = origPositions.get('BASS')
        const reBass = reimportedPositions.get('BASS')
        expect(origBass).toBeDefined()
        expect(reBass).toBeDefined()

        const origPitches = origBass.map(n => n.pitch).sort((a, b) => a - b)
        const rePitches = reBass.map(n => n.pitch).sort((a, b) => a - b)
        expect(rePitches, 'BASS pitch values').toEqual(origPitches)
    })

    it('BASS full beat/beatStep/pitch positions survive', () => {
        const im = new InstrumentsManager()
        const exporter = new MidiExporter(im)
        const midiBytes = exporter.export(originalPattern, { loops: 1 })

        const reimported = importMidiToPattern(midiBytes, mfCmd)

        const origPositions = getNotePositions(originalPattern)
        const reimportedPositions = getNotePositions(reimported)

        const origBass = origPositions.get('BASS')
        const reBass = reimportedPositions.get('BASS')
        expect(origBass).toBeDefined()
        expect(reBass).toBeDefined()

        const origFull = origBass.map(n => `${n.beat}:${n.beatStep}:${n.pitch}`).sort()
        const reFull = reBass.map(n => `${n.beat}:${n.beatStep}:${n.pitch}`).sort()
        expect(reFull, 'BASS beat:beatStep:pitch').toEqual(origFull)
    })
})
