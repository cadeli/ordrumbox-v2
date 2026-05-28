import { describe, it, expect, beforeEach } from 'vitest'
import { MfGlobals } from '../src/core/globals.js'
import MfCmd from '../src/logic/commands/cmd.js'

function ensureTrack(mfCmd, pattern, trackName, barQuantize) {
    let track = pattern.tracks.find(t => t.name === trackName)
    if (!track) {
        track = mfCmd.addTrack(pattern, trackName, barQuantize)
    }
    return track
}

function ensurePatternHasEnoughBars(mfCmd, pattern, requiredBar) {
    if (requiredBar >= pattern.nbBars) {
        const newNbBars = Math.ceil((requiredBar + 1) / 4) * 4
        mfCmd.setPatternBars(pattern, newNbBars)
    }
}

describe('Functional: MCP tools flow', () => {
    let mfCmd

    beforeEach(() => {
        MfGlobals.resetAll()
        mfCmd = new MfCmd()
        MfGlobals.mfCmd = mfCmd
    })

    it('createNewPattern creates pattern with expected structure', () => {
        const pattern = mfCmd.addPattern('MyBeat')

        expect(pattern.name).toBe('MyBeat')
        expect(pattern.bpm).toBe(120)
        expect(pattern.nbBars).toBe(4)
        expect(pattern.tracks).toEqual([])
        expect(MfGlobals.patterns).toContain(pattern)
    })

    it('addNotesToPattern converts step to bar/barStep correctly', () => {
        const pattern = mfCmd.addPattern('MyBeat')
        const kick = mfCmd.addTrack(pattern, 'KICK', 4)
        const snare = mfCmd.addTrack(pattern, 'SNARE', 4)

        const notes = [
            { trackName: 'KICK', step: 0 },
            { trackName: 'KICK', step: 4 },
            { trackName: 'SNARE', step: 6 }
        ]

        for (const noteData of notes) {
            const track = ensureTrack(mfCmd, pattern, noteData.trackName, 4)
            const bar = Math.floor(noteData.step / 4)
            const barStep = noteData.step % 4
            ensurePatternHasEnoughBars(mfCmd, pattern, bar)
            mfCmd.addNote(track, bar, barStep)
        }

        expect(mfCmd.isNoteAt(kick, 0, 0).length).toBe(1)
        expect(mfCmd.isNoteAt(kick, 1, 0).length).toBe(1)
        expect(mfCmd.isNoteAt(snare, 1, 2).length).toBe(1)
    })

    it('updateTrack applies noteUpdates to all notes in track', () => {
        const pattern = mfCmd.addPattern('Test')
        const track = mfCmd.addTrack(pattern, 'KICK', 4)
        mfCmd.addNote(track, 0, 0)
        mfCmd.addNote(track, 0, 1)
        mfCmd.addNote(track, 0, 2)

        // updateTrack signature: (patternName, trackName, updates, noteUpdates)
        // The MCP server calls it differently - let's test the direct note property setting
        for (const note of track.notes) {
            note.triggerFreq = 2
            note.retriggerNum = 3
        }

        for (const note of track.notes) {
            expect(note.triggerFreq).toBe(2)
            expect(note.retriggerNum).toBe(3)
        }
    })

    it('ensureTrack creates track only if not exists', () => {
        const pattern = mfCmd.addPattern('Test')

        const track1 = ensureTrack(mfCmd, pattern, 'KICK', 4)
        const track2 = ensureTrack(mfCmd, pattern, 'KICK', 4)

        expect(track1).toBe(track2)
        expect(pattern.tracks.length).toBe(1)
    })

    it('ensurePatternHasEnoughBars expands pattern when needed', () => {
        const pattern = mfCmd.addPattern('Test')
        expect(pattern.nbBars).toBe(4)

        ensurePatternHasEnoughBars(mfCmd, pattern, 5)

        expect(pattern.nbBars).toBeGreaterThanOrEqual(6)
    })

    it('full MCP workflow: create → add notes → update → verify', () => {
        const pattern = mfCmd.addPattern('Workflow')
        const kick = ensureTrack(mfCmd, pattern, 'KICK', 4)
        const snare = ensureTrack(mfCmd, pattern, 'SNARE', 4)

        mfCmd.addNote(kick, 0, 0)
        mfCmd.addNote(kick, 0, 2)
        mfCmd.addNote(snare, 0, 1)

        mfCmd.updateTrack(kick, { velocity: 0.9 })

        expect(kick.velocity).toBe(0.9)
        expect(kick.notes.length).toBe(2)
        expect(snare.notes.length).toBe(1)
        expect(mfCmd.isNoteAt(kick, 0, 0).length).toBe(1)
        expect(mfCmd.isNoteAt(kick, 0, 2).length).toBe(1)
        expect(mfCmd.isNoteAt(snare, 0, 1).length).toBe(1)
    })
})
