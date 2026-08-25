import { describe, it, expect, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import { isNoteAt } from './helpers/cmd_test_helpers.js'

function ensureTrack(cmd, pattern, trackName, stepsPerBeat) {
    let track = pattern.tracks.find(t => t.name === trackName)
    if (!track) {
        track = cmd.addTrack(pattern, trackName, stepsPerBeat)
    }
    return track
}

function ensurePatternHasEnoughBeats(cmd, pattern, requiredBeat) {
    if (requiredBeat >= pattern.nbBeats) {
        const newNbBeats = Math.ceil((requiredBeat + 1) / 4) * 4
        pattern.nbBeats = newNbBeats
    }
}

describe('Functional: MCP tools flow', () => {
    let cmd

    beforeEach(() => {
        appState.reset()
        serviceRegistry.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    it('createNewPattern creates pattern with expected structure', () => {
        const pattern = cmd.addPattern('MyBeat')

        expect(pattern.name).toBe('MyBeat')
        expect(pattern.bpm).toBe(120)
        expect(pattern.nbBeats).toBe(4)
        expect(pattern.tracks).toEqual([])
        expect(appState.patterns).toContain(pattern)
    })

    it('addNotesToPattern converts step to beat/beatStep correctly', () => {
        const pattern = cmd.addPattern('MyBeat')
        const kick = cmd.addTrack(pattern, 'KICK', 4)
        const snare = cmd.addTrack(pattern, 'SNARE', 4)

        const notes = [
            { trackName: 'KICK', step: 0 },
            { trackName: 'KICK', step: 4 },
            { trackName: 'SNARE', step: 6 }
        ]

        for (const noteData of notes) {
            const track = ensureTrack(cmd, pattern, noteData.trackName, 4)
            const beat = Math.floor(noteData.step / 4)
            const beatStep = noteData.step % 4
            ensurePatternHasEnoughBeats(cmd, pattern, beat)
            cmd.addNote(track, beat, beatStep)
        }

        expect(isNoteAt(kick, 0, 0).length).toBe(1)
        expect(isNoteAt(kick, 1, 0).length).toBe(1)
        expect(isNoteAt(snare, 1, 2).length).toBe(1)
    })

    it('ensureTrack creates track only if not exists', () => {
        const pattern = cmd.addPattern('Test')

        const track1 = ensureTrack(cmd, pattern, 'KICK', 4)
        const track2 = ensureTrack(cmd, pattern, 'KICK', 4)

        expect(track1).toBe(track2)
        expect(pattern.tracks.length).toBe(1)
    })

    it('ensurePatternHasEnoughBeats expands pattern when needed', () => {
        const pattern = cmd.addPattern('Test')
        expect(pattern.nbBeats).toBe(4)

        ensurePatternHasEnoughBeats(cmd, pattern, 5)

        expect(pattern.nbBeats).toBeGreaterThanOrEqual(6)
    })

    it('full MCP workflow: create → add notes → update → verify', () => {
        const pattern = cmd.addPattern('Workflow')
        const kick = ensureTrack(cmd, pattern, 'KICK', 4)
        const snare = ensureTrack(cmd, pattern, 'SNARE', 4)

        cmd.addNote(kick, 0, 0)
        cmd.addNote(kick, 0, 2)
        cmd.addNote(snare, 0, 1)

        cmd.updateTrack(kick, { velocity: 0.9 })

        expect(kick.velocity).toBe(0.9)
        expect(kick.notes.length).toBe(2)
        expect(snare.notes.length).toBe(1)
        expect(isNoteAt(kick, 0, 0).length).toBe(1)
        expect(isNoteAt(kick, 0, 2).length).toBe(1)
        expect(isNoteAt(snare, 0, 1).length).toBe(1)
    })
})
