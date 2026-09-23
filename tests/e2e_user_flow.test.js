/**
 * @vitest-environment jsdom
 *
 * End-to-end user flow tests
 * ───────────────────────────
 * Exercises the complete lifecycle a real user would go through:
 *
 *   Create pattern → Add tracks → Add notes → Set triggers/params
 *   → Compute flat notes → Export (MIDI + JSON) → Import → Undo/Redo
 *   → Transport (play/stop) → State consistency checks
 *
 * This verifies that all layers (Commander, PatternEngine, MidiExporter,
 * PatternExporter, Transport, HistoryManager, AppState) work together
 * as a coherent system — not just in isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import Commander from '../src/logic/commands/cmd.js'
import { PatternExporter } from '../src/patterns/exporter.js'
import MidiExporter from '../src/logic/midi/midi_exporter.js'
import { recomputeFlatNotes, isTriggered, normalizeArp } from '../src/patterns/engine.js'
import { applyFlatNotes as managerApplyFlat } from '../src/patterns/manager.js'
import { TICK } from '../src/core/constants.js'
import { parseMidi, findAllNotes } from './helpers/midi_reader.js'
import { getTrackFromType } from './helpers/cmd_test_helpers.js'
import HistoryManager from '../src/logic/history_manager.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function resetAll() {
    appState.patterns.length = 0
    appState.selectedPatternNum = 0
    appState.selectedTrackNum = 0
    appState.flatNotes = null
    serviceRegistry.reset()
    serviceRegistry.history = new HistoryManager(50)
    soundRegistry.reset()
    playbackEvents._listeners = {}
}

// ─── PHASE 1: Create a pattern from scratch ─────────────────────────────────

describe('E2E Flow 1 — Create pattern and build beat', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    it('creates a pattern and verifies it is the active pattern', () => {
        const pat = cmd.addPattern('My Beat')
        expect(appState.patterns).toContain(pat)
        expect(pat.name).toBe('My Beat')
        expect(pat.bpm).toBe(120)
        expect(pat.nbBeats).toBe(4)
        expect(pat.tracks).toEqual([])
    })

    it('sets BPM to 140 and verifies', () => {
        const pat = cmd.addPattern('Fast')
        cmd.setPatternBpm(pat, 140)
        expect(pat.bpm).toBe(140)
    })

    it('adds 4 tracks: KICK, SNARE, HIHAT, BASS', () => {
        const pat = cmd.addPattern('Full Kit')

        const kick = cmd.addTrack(pat, 'KICK', 4)
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        const hihat = cmd.addTrack(pat, 'HIHAT', 4)
        const bass = cmd.addTrack(pat, 'BASS', 4)

        expect(pat.tracks).toHaveLength(4)
        expect(kick.name).toBe('KICK')
        expect(snare.name).toBe('SNARE')
        expect(hihat.name).toBe('HIHAT')
        expect(bass.name).toBe('BASS')

        for (const t of pat.tracks) {
            expect(t.nbBeats).toBe(4)
            expect(t.stepsPerBeat).toBe(4)
            expect(t.loopAtStep).toBe(16)
            expect(t.notes).toEqual([])
        }
    })

    it('adds notes to KICK on beats 0, 1, 2, 3 (four-on-the-floor)', () => {
        const pat = cmd.addPattern('4/4 Kick')
        const kick = cmd.addTrack(pat, 'KICK', 4)

        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 1, 0, 0)
        cmd.addNote(kick, 2, 0, 0)
        cmd.addNote(kick, 3, 0, 0)

        expect(kick.notes).toHaveLength(4)
        for (const note of kick.notes) {
            expect(note.pitch).toBe(0)
            expect(note.beatStep).toBe(0)
        }
        expect(kick.notes.map((n) => n.beat).sort()).toEqual([0, 1, 2, 3])
    })

    it('adds SNARE on beats 1 and 3 (backbeat)', () => {
        const pat = cmd.addPattern('Backbeat')
        const snare = cmd.addTrack(pat, 'SNARE', 4)

        const n1 = cmd.addNote(snare, 1, 0, 0)
        const n2 = cmd.addNote(snare, 3, 0, 0)

        expect(snare.notes).toHaveLength(2)
        expect(n1.beat).toBe(1)
        expect(n2.beat).toBe(3)
    })

    it('adds HIHAT on eighth notes (every step)', () => {
        const pat = cmd.addPattern('8th Hats')
        const hihat = cmd.addTrack(pat, 'HIHAT', 4)

        for (let beat = 0; beat < 4; beat++) {
            cmd.addNote(hihat, beat, 0, 0)
            cmd.addNote(hihat, beat, 2, 0)
        }

        expect(hihat.notes).toHaveLength(8)
    })

    it('adds BASS with varying pitch and velocity', () => {
        const pat = cmd.addPattern('Bass Line')
        const bass = cmd.addTrack(pat, 'BASS', 4)

        const n1 = cmd.addNote(bass, 0, 0, 0)
        n1.velocity = 0.9
        const n2 = cmd.addNote(bass, 1, 0, 3)
        n2.velocity = 0.7
        const n3 = cmd.addNote(bass, 2, 0, -2)
        n3.velocity = 0.6
        const n4 = cmd.addNote(bass, 3, 0, 5)
        n4.velocity = 0.8

        expect(bass.notes).toHaveLength(4)
        expect(bass.notes[0].pitch).toBe(0)
        expect(bass.notes[1].pitch).toBe(3)
        expect(bass.notes[2].pitch).toBe(-2)
        expect(bass.notes[3].pitch).toBe(5)
    })

    it('verifies complete pattern structure', () => {
        const pat = cmd.addPattern('Complete')
        cmd.setPatternBpm(pat, 128)
        cmd.setPatternDescription(pat, 'A complete test pattern')

        const kick = cmd.addTrack(pat, 'KICK', 4)
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        cmd.addTrack(pat, 'HIHAT', 4)
        cmd.addTrack(pat, 'BASS', 4)

        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 1, 0, 0)
        cmd.addNote(kick, 2, 0, 0)
        cmd.addNote(kick, 3, 0, 0)
        cmd.addNote(snare, 1, 0, 0)
        cmd.addNote(snare, 3, 0, 0)

        expect(pat.name).toBe('Complete')
        expect(pat.bpm).toBe(128)
        expect(pat.description).toBe('A complete test pattern')
        expect(pat.tracks).toHaveLength(4)
        expect(pat.tracks[0].notes).toHaveLength(4)
        expect(pat.tracks[1].notes).toHaveLength(2)
        expect(pat.tracks[2].notes).toHaveLength(0)
        expect(pat.tracks[3].notes).toHaveLength(0)
    })
})

// ─── PHASE 2: Set triggers (every, pos, retrigger, arp) ─────────────────────

describe('E2E Flow 2 — Set triggers and note parameters', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    it('sets "every" trigger on a note (fires every 2nd loop)', () => {
        const pat = cmd.addPattern('Every')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const note = cmd.addNote(kick, 0, 0, 0)
        note.every = 2
        note.pos = 0

        expect(note.every).toBe(2)
        expect(isTriggered(0, 2, 0)).toBe(true)
        expect(isTriggered(0, 2, 1)).toBe(false)
        expect(isTriggered(0, 2, 2)).toBe(true)
    })

    it('sets retrigger on a note', () => {
        const pat = cmd.addPattern('Retrig')
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        const note = cmd.addNote(snare, 1, 0, 0)
        note.retriggerNum = 4
        note.retriggerRate = 2

        expect(note.retriggerNum).toBe(4)
        expect(note.retriggerRate).toBe(2)
    })

    it('sets arp on a note and normalizes it', () => {
        const pat = cmd.addPattern('Arp')
        const bass = cmd.addTrack(pat, 'BASS', 4)
        const note = cmd.addNote(bass, 0, 0, 0)
        note.arp = [0, 7, 12]

        const normalized = normalizeArp(note.arp)
        expect(normalized).not.toBeNull()
        expect(normalized.sequence).toEqual([0, 7, 12])
    })

    it('updates note velocity via direct mutation', () => {
        const pat = cmd.addPattern('Velocity')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const note = cmd.addNote(kick, 0, 0, 0)

        note.velocity = 0.3
        expect(note.velocity).toBe(0.3)

        note.velocity = 1.0
        expect(note.velocity).toBe(1.0)
    })

    it('updates note pitch via direct mutation', () => {
        const pat = cmd.addPattern('Pitch')
        const bass = cmd.addTrack(pat, 'BASS', 4)
        const note = cmd.addNote(bass, 0, 0, 0)

        note.pitch = 7
        expect(note.pitch).toBe(7)
    })

    it('combined: kick four-on-floor + snare backbeat + hihat 8ths', () => {
        const pat = cmd.addPattern('Beat')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        const hihat = cmd.addTrack(pat, 'HIHAT', 4)

        for (let beat = 0; beat < 4; beat++) {
            cmd.addNote(kick, beat, 0, 0)
            cmd.addNote(hihat, beat, 0, 0)
            cmd.addNote(hihat, beat, 2, 0)
        }
        cmd.addNote(snare, 1, 0, 0)
        cmd.addNote(snare, 3, 0, 0)

        expect(kick.notes).toHaveLength(4)
        expect(snare.notes).toHaveLength(2)
        expect(hihat.notes).toHaveLength(8)
    })
})

// ─── PHASE 3: Track parameters (mute, volume, pan) ─────────────────────────

describe('E2E Flow 3 — Track parameter updates', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    it('toggles mute on a track', () => {
        const pat = cmd.addPattern('Mute')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        expect(kick.mute).toBe(false)

        kick.mute = true
        expect(kick.mute).toBe(true)

        kick.mute = false
        expect(kick.mute).toBe(false)
    })

    it('updates velocity via updateTrack', () => {
        const pat = cmd.addPattern('Vel')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.updateTrack(kick, { velocity: 0.5 })
        expect(kick.velocity).toBe(0.5)
    })

    it('updates pan via updateTrack', () => {
        const pat = cmd.addPattern('Pan')
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        cmd.updateTrack(snare, { pan: -0.7 })
        expect(snare.pan).toBe(-0.7)
    })

    it('clamps velocity to [0, 1]', () => {
        const pat = cmd.addPattern('Clamp')
        const kick = cmd.addTrack(pat, 'KICK', 4)

        cmd.updateTrack(kick, { velocity: 99 })
        expect(kick.velocity).toBe(1)

        cmd.updateTrack(kick, { velocity: -5 })
        expect(kick.velocity).toBe(0)
    })

    it('changes track sound', () => {
        const pat = cmd.addPattern('Sound')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.changeTrackSound(kick, 'kick_808')
        expect(kick.soundId).toBe('kick_808')
        expect(kick.useAutoAssignSound).toBe(false)
        expect(kick.useSoftSynth).toBe(false)
    })

    it('renames a track', () => {
        const pat = cmd.addPattern('Rename')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.changeTrackName(kick, 'KICK 808')
        expect(kick.name).toBe('KICK 808')
    })
})

// ─── PHASE 4: Compute flat notes (engine pipeline) ─────────────────────────

describe('E2E Flow 4 — Compute flat notes from pattern', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    it('computes flat notes for a simple pattern', () => {
        const pat = cmd.addPattern('Flat')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 1, 0, 0)
        cmd.addNote(kick, 2, 0, 0)
        cmd.addNote(kick, 3, 0, 0)

        const flatNotes = recomputeFlatNotes(pat, 0)
        expect(flatNotes).toBeInstanceOf(Map)
        expect(flatNotes.size).toBeGreaterThan(0)
    })

    it('flat notes contain correct tick positions', () => {
        const pat = cmd.addPattern('Ticks')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 2, 0, 0)

        const flatNotes = recomputeFlatNotes(pat, 0)
        const ticks = [...flatNotes.keys()].sort((a, b) => a - b)
        expect(ticks).toContain(0)
        expect(ticks).toContain(2 * TICK)
    })

    it('flat notes contain correct pitch and velocity', () => {
        const pat = cmd.addPattern('Props')
        const bass = cmd.addTrack(pat, 'BASS', 4)
        const note = cmd.addNote(bass, 0, 0, 5)
        note.velocity = 0.8

        const flatNotes = recomputeFlatNotes(pat, 0)
        const allNotes = [...flatNotes.values()].flat()
        const bassNote = allNotes.find((n) => n.track?.name === 'BASS')
        expect(bassNote).toBeDefined()
        expect(bassNote.note.pitch).toBe(5)
        expect(bassNote.note.velocity).toBeCloseTo(0.8, 1)
    })

    it('managerApplyFlat also works and stores in appState', () => {
        const pat = cmd.addPattern('Mgr')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 2, 0, 0)

        const flat = managerApplyFlat(pat, 0)
        expect(flat).toBeInstanceOf(Map)
        expect(appState.flatNotes).toBe(flat)
    })

    it('flat notes for pattern with multiple tracks', () => {
        const pat = cmd.addPattern('Multi')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 2, 0, 0)
        cmd.addNote(snare, 1, 0, 0)
        cmd.addNote(snare, 3, 0, 0)

        const flat = recomputeFlatNotes(pat, 0)
        const allNotes = [...flat.values()].flat()
        const kicks = allNotes.filter((n) => n.track?.name === 'KICK')
        const snares = allNotes.filter((n) => n.track?.name === 'SNARE')
        expect(kicks.length).toBe(2)
        expect(snares.length).toBe(2)
    })
})

// ─── PHASE 5: Export to MIDI ────────────────────────────────────────────────

describe('E2E Flow 5 — Export to MIDI and verify', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    it('exports a pattern to valid MIDI binary', () => {
        const pat = cmd.addPattern('MIDI Export')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 1, 0, 0)
        cmd.addNote(kick, 2, 0, 0)
        cmd.addNote(kick, 3, 0, 0)

        const exporter = new MidiExporter()
        const midiBytes = exporter.export(pat)
        expect(midiBytes).toBeInstanceOf(Uint8Array)
        expect(midiBytes.length).toBeGreaterThan(0)

        const midi = parseMidi(midiBytes)
        expect(midi.header.format).toBe(1)
        expect(midi.tracks.length).toBeGreaterThanOrEqual(2)
    })

    it('MIDI contains notes at correct positions', () => {
        const pat = cmd.addPattern('MIDI Notes')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 2, 0, 0)

        const exporter = new MidiExporter()
        const midiBytes = exporter.export(pat)
        const midi = parseMidi(midiBytes)
        const noteOns = findAllNotes(midi)

        expect(noteOns.length).toBe(2)
        const ticks = noteOns.map((n) => n.absTick).sort((a, b) => a - b)
        expect(ticks[0]).toBe(0)
        expect(ticks[1]).toBeGreaterThan(0)
    })

    it('MIDI export with multiple tracks', () => {
        const pat = cmd.addPattern('Multi MIDI')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 2, 0, 0)
        cmd.addNote(snare, 1, 0, 0)
        cmd.addNote(snare, 3, 0, 0)

        const exporter = new MidiExporter()
        const midiBytes = exporter.export(pat)
        const midi = parseMidi(midiBytes)
        const noteOns = findAllNotes(midi)

        expect(noteOns.length).toBe(4)
    })

    it('MIDI export with 2 loops doubles the notes', () => {
        const pat = cmd.addPattern('2 Loops')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)

        const exporter = new MidiExporter()
        const midiBytes = exporter.export(pat, { loops: 2 })
        const midi = parseMidi(midiBytes)
        const noteOns = findAllNotes(midi)

        expect(noteOns.length).toBe(2)
    })

    it('MIDI export preserves velocity', () => {
        const pat = cmd.addPattern('MIDI Vel')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const note = cmd.addNote(kick, 0, 0, 0)
        note.velocity = 0.5

        const exporter = new MidiExporter()
        const midiBytes = exporter.export(pat)
        const midi = parseMidi(midiBytes)
        const noteOns = findAllNotes(midi)

        expect(noteOns.length).toBe(1)
        expect(noteOns[0].velocity).toBeGreaterThan(0)
    })
})

// ─── PHASE 6: Export to JSON and roundtrip ──────────────────────────────────

describe('E2E Flow 6 — Export to JSON and roundtrip', () => {
    let cmd

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    it('exports pattern to clean JSON', () => {
        const pat = cmd.addPattern('JSON Export')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 2, 0, 0)

        const exported = PatternExporter.export(pat)
        expect(exported).toHaveProperty('application', 'online-ordrumbox')
        expect(exported).toHaveProperty('name', 'JSON Export')
        expect(exported.tracks.length).toBe(1)
    })

    it('JSON roundtrip preserves all data', () => {
        const pat = cmd.addPattern('Roundtrip')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 1, 0, 0)
        cmd.addNote(kick, 2, 0, 0)
        cmd.addNote(kick, 3, 0, 0)
        cmd.addNote(snare, 1, 0, 0)
        cmd.addNote(snare, 3, 0, 0)

        const exported = PatternExporter.export(pat)
        const imported = cmd.importPatternFromJson(exported)

        expect(imported.name).toBe('Roundtrip')
        expect(imported.tracks).toHaveLength(2)
        expect(imported.tracks[0].notes).toHaveLength(4)
        expect(imported.tracks[1].notes).toHaveLength(2)
        expect(imported.bpm).toBe(120)
    })

    it('JSON roundtrip preserves note properties', () => {
        const pat = cmd.addPattern('Note Props')
        const bass = cmd.addTrack(pat, 'BASS', 4)
        const note = cmd.addNote(bass, 0, 0, 7)
        note.velocity = 0.6
        note.arp = [0, 7, 12]

        const exported = PatternExporter.export(pat)
        const imported = cmd.importPatternFromJson(exported)
        const importedBass = getTrackFromType(imported, 'BASS')

        expect(importedBass.notes).toHaveLength(1)
        expect(importedBass.notes[0].pitch).toBe(7)
    })

    it('JSON roundtrip preserves BPM', () => {
        const pat = cmd.addPattern('BPM RT')
        cmd.setPatternBpm(pat, 140)

        const exported = PatternExporter.export(pat)
        const imported = cmd.importPatternFromJson(exported)
        expect(imported.bpm).toBe(140)
    })
})

// ─── PHASE 7: Undo/Redo ─────────────────────────────────────────────────────

describe('E2E Flow 7 — Undo and Redo operations', () => {
    let cmd, history

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        history = cmd.getHistory()
    })

    it('undo removes last added pattern', () => {
        expect(appState.patterns).toHaveLength(0)
        cmd.addPattern('UndoMe')
        expect(appState.patterns).toHaveLength(1)

        history.undo()
        expect(appState.patterns).toHaveLength(0)
    })

    it('undo removes last added track', () => {
        const pat = cmd.addPattern('TrackUndo')
        cmd.addTrack(pat, 'KICK', 4)
        expect(pat.tracks).toHaveLength(1)

        history.undo()
        expect(pat.tracks).toHaveLength(0)
    })

    it('undo removes last added note', () => {
        const pat = cmd.addPattern('NoteUndo')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)
        expect(kick.notes).toHaveLength(1)

        history.undo()
        expect(kick.notes).toHaveLength(0)
    })

    it('undo reverts track parameter update', () => {
        const pat = cmd.addPattern('ParamUndo')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.updateTrack(kick, { velocity: 0.5 })
        expect(kick.velocity).toBe(0.5)

        history.undo()
        expect(kick.velocity).toBe(1)
    })

    it('undo reverts BPM change', () => {
        const pat = cmd.addPattern('BpmUndo')
        cmd.setPatternBpm(pat, 180)
        expect(pat.bpm).toBe(180)

        history.undo()
        expect(pat.bpm).toBe(120)
    })

    it('undo reverts pattern rename', () => {
        const pat = cmd.addPattern('OldName')
        cmd.renamePattern(0, 'NewName')
        expect(pat.name).toBe('NewName')

        history.undo()
        expect(pat.name).toBe('OldName')
    })

    it('multiple undo cycles maintain consistency', () => {
        const pat = cmd.addPattern('Cycle')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 1, 0, 0)

        history.undo()
        expect(kick.notes).toHaveLength(1)

        history.undo()
        expect(kick.notes).toHaveLength(0)

        history.undo()
        expect(pat.tracks).toHaveLength(0)
    })
})

// ─── PHASE 8: Transport (play/stop) ─────────────────────────────────────────

describe('E2E Flow 8 — Transport lifecycle', () => {
    let cmd, transport

    beforeEach(async () => {
        resetAll()
        globalThis.Worker = class MockWorker {
            constructor() {}
            postMessage() {}
            terminate() {}
        }
        cmd = new Commander()
        serviceRegistry.cmd = cmd

        const Transport = (await import('../src/logic/transport/transport.js')).default
        transport = new Transport({ state: 'running', currentTime: 0, sampleRate: 44100 })
        serviceRegistry.transport = transport
    })

    afterEach(() => {
        delete globalThis.Worker
    })

    it('start sets isRunning and resets tick', () => {
        transport.tick = 42
        transport.start()
        expect(transport.isRunning).toBe(true)
        expect(transport.tick).toBe(0)
    })

    it('stop sets isRunning to false', () => {
        transport.start()
        transport.stop()
        expect(transport.isRunning).toBe(false)
    })

    it('start/stop cycle preserves pattern state', () => {
        const pat = cmd.addPattern('PlayMe')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        cmd.addNote(kick, 0, 0, 0)
        cmd.addNote(kick, 1, 0, 0)

        transport.start()
        expect(transport.isRunning).toBe(true)
        expect(pat.tracks[0].notes).toHaveLength(2)

        transport.stop()
        expect(transport.isRunning).toBe(false)
        expect(pat.tracks[0].notes).toHaveLength(2)
    })

    it('scheduler calls onSchedule', () => {
        const onScheduleSpy = vi.fn()
        transport.onSchedule = onScheduleSpy

        transport.start()
        transport.nextStepTime = 0
        transport.scheduleAheadTime = 1.0

        transport.scheduler()
        expect(onScheduleSpy).toHaveBeenCalled()
    })

    it('setBpm updates transport BPM', () => {
        transport.setBpm(140)
        expect(transport.bpm).toBe(140)
    })
})

// ─── PHASE 9: Full user session (combined) ──────────────────────────────────

describe('E2E Flow 9 — Full user session simulation', () => {
    let cmd, history

    beforeEach(() => {
        resetAll()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        history = cmd.getHistory()
    })

    it('complete session: create → build → export → modify → undo → re-export', () => {
        // 1. Create pattern
        const pat = cmd.addPattern('Session Beat')
        cmd.setPatternBpm(pat, 128)

        // 2. Add tracks
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        const hihat = cmd.addTrack(pat, 'HIHAT', 4)

        // 3. Build beat
        for (let beat = 0; beat < 4; beat++) {
            cmd.addNote(kick, beat, 0, 0)
            cmd.addNote(hihat, beat, 0, 0)
            cmd.addNote(hihat, beat, 2, 0)
        }
        cmd.addNote(snare, 1, 0, 0)
        cmd.addNote(snare, 3, 0, 0)

        // 4. First export
        const midi1 = new MidiExporter().export(pat)
        expect(midi1.length).toBeGreaterThan(0)
        const parsed1 = parseMidi(midi1)
        expect(findAllNotes(parsed1).length).toBe(14) // 4 kick + 2 snare + 8 hihat

        // 5. Modify: remove all hihat notes
        while (hihat.notes.length > 0) {
            cmd.deleteNote(hihat, hihat.notes[0])
        }
        expect(hihat.notes).toHaveLength(0)

        // 6. Second export (should have fewer notes)
        const midi2 = new MidiExporter().export(pat)
        const parsed2 = parseMidi(midi2)
        expect(findAllNotes(parsed2).length).toBe(6) // 4 kick + 2 snare

        // 7. Undo the deletions
        for (let i = 0; i < 8; i++) {
            history.undo()
        }
        expect(hihat.notes).toHaveLength(8)

        // 8. Third export (should match first)
        const midi3 = new MidiExporter().export(pat)
        const parsed3 = parseMidi(midi3)
        expect(findAllNotes(parsed3).length).toBe(14)
    })

    it('multi-pattern session: create multiple patterns, switch, modify', () => {
        // Pattern 1
        const pat1 = cmd.addPattern('Intro')
        const kick1 = cmd.addTrack(pat1, 'KICK', 4)
        cmd.addNote(kick1, 0, 0, 0)

        // Pattern 2
        const pat2 = cmd.addPattern('Drop')
        const kick2 = cmd.addTrack(pat2, 'KICK', 4)
        cmd.addNote(kick2, 0, 0, 0)
        cmd.addNote(kick2, 1, 0, 0)
        cmd.addNote(kick2, 2, 0, 0)
        cmd.addNote(kick2, 3, 0, 0)

        expect(appState.patterns).toHaveLength(2)

        // Export both
        const midi1 = new MidiExporter().export(pat1)
        const midi2 = new MidiExporter().export(pat2)
        expect(findAllNotes(parseMidi(midi1)).length).toBe(1)
        expect(findAllNotes(parseMidi(midi2)).length).toBe(4)

        // Remove pattern 1
        cmd.removePattern(0)
        expect(appState.patterns).toHaveLength(1)
        expect(appState.patterns[0].name).toBe('Drop')

        // Undo removal
        history.undo()
        expect(appState.patterns).toHaveLength(2)
    })

    it('pattern with all trigger types: every, retrigger, arp', () => {
        const pat = cmd.addPattern('Complex')
        const kick = cmd.addTrack(pat, 'KICK', 4)
        const snare = cmd.addTrack(pat, 'SNARE', 4)
        const bass = cmd.addTrack(pat, 'BASS', 4)

        // Normal kick
        for (let beat = 0; beat < 4; beat++) {
            cmd.addNote(kick, beat, 0, 0)
        }

        // Snare with retrigger
        const snareNote = cmd.addNote(snare, 1, 0, 0)
        snareNote.retriggerNum = 4
        snareNote.retriggerRate = 2

        // Bass with arp
        const bassNote = cmd.addNote(bass, 0, 0, 0)
        bassNote.arp = [0, 7, 12]
        bassNote.velocity = 0.8

        // Compute flat notes
        const flat = recomputeFlatNotes(pat, 0)
        const allFlat = [...flat.values()].flat()

        // KICK should have 4 notes
        const kickFlat = allFlat.filter((n) => n.track?.name === 'KICK')
        expect(kickFlat.length).toBe(4)

        // SNARE should have retriggered notes
        const snareFlat = allFlat.filter((n) => n.track?.name === 'SNARE')
        expect(snareFlat.length).toBeGreaterThanOrEqual(1)

        // Export to MIDI
        const midi = new MidiExporter().export(pat)
        expect(midi.length).toBeGreaterThan(0)
        const parsed = parseMidi(midi)
        expect(findAllNotes(parsed).length).toBeGreaterThanOrEqual(5)
    })

    it('import from JSON, modify, re-export, verify consistency', () => {
        const originalJson = {
            name: 'Imported Beat',
            bpm: 135,
            nbBeats: 4,
            tracks: [
                {
                    name: 'KICK',
                    nbBeats: 4,
                    stepsPerBeat: 4,
                    loopAtStep: 16,
                    notes: [
                        { beat: 0, beatStep: 0, pitch: 0, velocity: 0.9 },
                        { beat: 1, beatStep: 0, pitch: 0, velocity: 0.8 },
                        { beat: 2, beatStep: 0, pitch: 0, velocity: 0.9 },
                        { beat: 3, beatStep: 0, pitch: 0, velocity: 0.8 },
                    ],
                },
                {
                    name: 'SNARE',
                    nbBeats: 4,
                    stepsPerBeat: 4,
                    loopAtStep: 16,
                    notes: [
                        { beat: 1, beatStep: 0, pitch: 0, velocity: 0.7 },
                        { beat: 3, beatStep: 0, pitch: 0, velocity: 0.7 },
                    ],
                },
            ],
        }

        const imported = cmd.importPatternFromJson(originalJson)
        expect(imported.name).toBe('Imported Beat')
        expect(imported.bpm).toBe(135)
        expect(imported.tracks).toHaveLength(2)

        // Modify imported pattern
        const kick = getTrackFromType(imported, 'KICK')
        cmd.addNote(kick, 0, 2, 0) // add an offbeat
        expect(kick.notes).toHaveLength(5)

        // Export to MIDI
        const midi = new MidiExporter().export(imported)
        const parsed = parseMidi(midi)
        expect(findAllNotes(parsed).length).toBe(7) // 5 kick + 2 snare

        // Export to JSON
        const jsonExport = PatternExporter.export(imported)
        expect(jsonExport.name).toBe('Imported Beat')
        expect(jsonExport.tracks.length).toBe(2)
    })
})
