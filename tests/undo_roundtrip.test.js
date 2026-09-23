/**
 * @vitest-environment jsdom
 *
 * Undo Roundtrip & State Inversion tests
 * ──────────────────────────────────────
 * Proves that:
 *   1. A sequence of 15 diverse operations (notes, tracks, parameters, metadata,
 *      solos, mutes, deletions, cleans) can be sequentially undone step-by-step
 *      until the pattern returns to the EXACT initial state (bit-for-bit deep equality).
 *   2. Batch generative transactions (beginGenerationUndo / commitGenerationUndo)
 *      roll back multi-track mass mutations in a single atomic undo step.
 *   3. History branching rules hold: taking a new action after undoing discards
 *      the redo future and maintains a coherent past stack.
 *   4. History capacity constraints (maxSize sliding window) discard old actions
 *      gracefully without stack underflow or memory corruption.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import HistoryManager from '../src/logic/history_manager.js'

describe('Undo Roundtrip & State Inversion', () => {
    let cmd, history

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        cmd = new Commander()
        serviceRegistry.cmd = cmd
        history = new HistoryManager(50)
        serviceRegistry.history = history
    })

    describe('Roundtrip 1: 15-step Deep Mutation & Complete Inversion', () => {
        it('restores the exact initial pattern state after 15 varied mutations', () => {
            // ── Baseline Pattern P0 ──────────────────────────────────────────
            const pattern = cmd.addPattern('Baseline_Pattern')
            pattern.bpm = 120
            pattern.nbBeats = 4
            pattern.description = 'Original clean pattern'

            const kick = cmd.addTrack(pattern, 'KICK', 4)
            const snare = cmd.addTrack(pattern, 'SNARE', 4)

            // Initial notes in baseline
            const baseNote1 = cmd.addNote(kick, 0, 0, 0)
            cmd.addNote(snare, 1, 0, 0)

            // Clear history so we start our test benchmark strictly from P0
            history.clear()

            // Deep clone baseline P0 for strict equality comparison
            const p0Snapshot = JSON.parse(JSON.stringify(pattern))

            // ── 15 Diverse Mutations ─────────────────────────────────────────

            // 1. Add a new track
            const bass = cmd.addTrack(pattern, 'BASS', 4)
            expect(pattern.tracks).toHaveLength(3)

            // 2. Add note on Kick
            cmd.addNote(kick, 2, 0, 0)

            // 3. Add note on Snare
            cmd.addNote(snare, 3, 0, 0)

            // 4. Add melodic note on Bass
            cmd.addNote(bass, 0, 2, -7)

            // 5. Update Kick track parameters (velocity, pan)
            cmd.updateTrack(kick, { velocity: 0.9, pan: -0.25 })

            // 6. Update Bass filter parameters
            cmd.updateTrack(bass, { filterFreq: 3200, filterQ: 2.8 })

            // 7. Change Pattern BPM
            cmd.setPatternBpm(pattern, 148)

            // 8. Rename Pattern
            cmd.renamePattern(0, 'Mutated_Pattern_Name')

            // 9. Change Pattern Description
            cmd.setPatternDescription(pattern, 'Modified during undo stress test')

            // 10. Delete a baseline note
            cmd.deleteNote(kick, baseNote1)

            // 11. Mute Snare track
            cmd.updateTrack(snare, { mute: true })

            // 12. Solo Bass track
            cmd.updateTrack(bass, { solo: true })

            // 13. Change Kick sound source
            cmd.changeTrackSound(kick, 'custom/punchy_kick.wav')

            // 14. Clean Bass track (removes all notes and resets loop)
            cmd.cleanTrack(bass)

            // 15. Add another track (PERC)
            cmd.addTrack(pattern, 'PERC', 4)
            expect(pattern.tracks).toHaveLength(4)

            // Verify that state is thoroughly mutated
            expect(history.pastLength).toBe(15)
            expect(pattern.name).toBe('Mutated_Pattern_Name')
            expect(pattern.bpm).toBe(148)
            expect(pattern.tracks[0].soundId).toBe('custom/punchy_kick.wav')
            expect(pattern.tracks[1].mute).toBe(true)
            expect(pattern.tracks[2].solo).toBe(true)
            expect(pattern.tracks).toHaveLength(4)

            // ── Inversion: 15 Sequential Undos ───────────────────────────────
            for (let i = 0; i < 15; i++) {
                expect(history.canUndo).toBe(true)
                const ok = history.undo()
                expect(ok).toBe(true)
            }

            // ── Assertions: Exact Roundtrip Equality ─────────────────────────
            expect(history.canUndo).toBe(false)
            expect(history.pastLength).toBe(0)

            // Structure
            expect(pattern.name).toBe(p0Snapshot.name)
            expect(pattern.bpm).toBe(p0Snapshot.bpm)
            expect(pattern.nbBeats).toBe(p0Snapshot.nbBeats)
            expect(pattern.description).toBe(p0Snapshot.description)
            expect(pattern.tracks).toHaveLength(p0Snapshot.tracks.length)

            // Track names and count
            const restoredKick = pattern.tracks[0]
            const restoredSnare = pattern.tracks[1]
            expect(restoredKick.name).toBe('KICK')
            expect(restoredSnare.name).toBe('SNARE')

            // Track parameters restored
            expect(restoredKick.soundId).toBe(p0Snapshot.tracks[0].soundId)
            expect(restoredKick.velocity).toBe(p0Snapshot.tracks[0].velocity)
            expect(restoredKick.pan).toBe(p0Snapshot.tracks[0].pan)
            expect(restoredSnare.mute).toBe(false)

            // Notes restored (including the deleted baseNote1 and removal of added notes)
            expect(restoredKick.notes).toHaveLength(1)
            expect(restoredKick.notes[0].beat).toBe(0)
            expect(restoredKick.notes[0].beatStep).toBe(0)

            expect(restoredSnare.notes).toHaveLength(1)
            expect(restoredSnare.notes[0].beat).toBe(1)
            expect(restoredSnare.notes[0].beatStep).toBe(0)

            // Deep JSON equality between current pattern and original P0 snapshot
            // (ignoring internal runtime _version tracker if present)
            const currentSnapshot = JSON.parse(JSON.stringify(pattern))
            delete currentSnapshot._version
            delete p0Snapshot._version
            expect(currentSnapshot).toEqual(p0Snapshot)
        })
    })

    describe('Roundtrip 2: Atomic Generation Transaction Undo', () => {
        it('rolls back a multi-track generation session in a single undo step', () => {
            const pattern = cmd.addPattern('Gen_Test')
            const kick = cmd.addTrack(pattern, 'KICK', 4)
            const snare = cmd.addTrack(pattern, 'SNARE', 4)

            // Pre-generation state: 1 note on kick
            cmd.addNote(kick, 0, 0, 0)
            const preGenSnapshot = JSON.parse(JSON.stringify(pattern))

            // Start batch generation transaction
            cmd.beginGenerationUndo(pattern)

            // Perform generative operations (normally done by an auto-generator)
            // 1. Add notes across tracks
            cmd.addNote(kick, 1, 0, 0)
            cmd.addNote(kick, 2, 0, 0)
            cmd.addNote(kick, 3, 0, 0)
            cmd.addNote(snare, 1, 2, 0)
            cmd.addNote(snare, 3, 2, 0)

            // 2. Add an extra track during generation
            cmd.addTrack(pattern, 'HIHAT', 4)

            // Commit generation
            cmd.commitGenerationUndo('Generative Drum Pattern')

            // Verify generation is committed
            expect(pattern.tracks).toHaveLength(3)
            expect(kick.notes).toHaveLength(4)
            expect(snare.notes).toHaveLength(2)

            // Single undo must revert the whole generation
            const ok = history.undo()
            expect(ok).toBe(true)

            // Verify instant rollback
            expect(pattern.tracks).toHaveLength(2)
            expect(kick.notes).toHaveLength(1)
            expect(kick.notes[0].beat).toBe(0)
            expect(snare.notes).toHaveLength(0)

            const current = JSON.parse(JSON.stringify(pattern))
            delete current._version
            delete preGenSnapshot._version
            expect(current).toEqual(preGenSnapshot)
        })

        it('cancelGenerationUndo re-enables record after a failed generation', () => {
            const pattern = cmd.addPattern('Cancel_Test')
            const kick = cmd.addTrack(pattern, 'KICK', 4)
            cmd.addNote(kick, 0, 0, 0)
            history.clear()

            cmd.beginGenerationUndo(pattern)
            cmd.addNote(kick, 1, 0, 0)
            // Simulate generation failure: cancel instead of commit
            cmd.cancelGenerationUndo()

            // record() must work again (suppress cleared)
            cmd.addNote(kick, 2, 0, 0)
            expect(history.pastLength).toBe(1)

            // cancel is idempotent
            cmd.cancelGenerationUndo()
            cmd.addNote(kick, 3, 0, 0)
            expect(history.pastLength).toBe(2)
            expect(kick.notes).toHaveLength(4)
        })
    })

    describe('Roundtrip 3: History Branch Invalidation', () => {
        it('discards future redo when a new action is performed after undo', () => {
            const pattern = cmd.addPattern('Branch_Test')
            const kick = cmd.addTrack(pattern, 'KICK', 4)

            // Perform 3 actions
            cmd.addNote(kick, 0, 0, 0) // Action 1
            cmd.addNote(kick, 1, 0, 0) // Action 2
            cmd.addNote(kick, 2, 0, 0) // Action 3
            expect(kick.notes).toHaveLength(3)

            // Undo 2 actions
            history.undo() // reverts note 2
            history.undo() // reverts note 1
            expect(kick.notes).toHaveLength(1)
            expect(history.canRedo).toBe(true)
            expect(history.futureLength).toBe(2)

            // Perform a NEW distinct action (divergent branch)
            cmd.addNote(kick, 3, 0, 0)
            expect(kick.notes).toHaveLength(2)

            // Branching rule: future must be completely cleared
            expect(history.canRedo).toBe(false)
            expect(history.futureLength).toBe(0)

            // Past stack should now contain: AddTrack, Note 0, Note 3
            // Undoing twice should remove Note 3, then Note 0
            history.undo()
            expect(kick.notes).toHaveLength(1)
            expect(kick.notes[0].beat).toBe(0)

            history.undo()
            expect(kick.notes).toHaveLength(0)
        })
    })

    describe('Roundtrip 4: History Sliding Window & Limits', () => {
        it('maintains maximum history size without crashing on empty undo', () => {
            const smallHistory = new HistoryManager(3)
            serviceRegistry.history = smallHistory
            cmd._history = smallHistory

            const pattern = cmd.addPattern('Small_History')
            const kick = cmd.addTrack(pattern, 'KICK', 4)

            // Perform 5 actions with maxSize = 3
            cmd.addNote(kick, 0, 0, 0) // Action 1 (will be dropped)
            cmd.addNote(kick, 1, 0, 0) // Action 2 (will be dropped)
            cmd.addNote(kick, 2, 0, 0) // Action 3
            cmd.addNote(kick, 3, 0, 0) // Action 4
            cmd.updateTrack(kick, { velocity: 0.5 }) // Action 5

            expect(smallHistory.pastLength).toBe(3)

            // Undo 3 available actions
            expect(smallHistory.undo()).toBe(true) // reverts velocity
            expect(smallHistory.undo()).toBe(true) // reverts note 3
            expect(smallHistory.undo()).toBe(true) // reverts note 2

            // 4th undo should return false cleanly (no crash, pastLength = 0)
            expect(smallHistory.canUndo).toBe(false)
            expect(smallHistory.undo()).toBe(false)
            expect(smallHistory.pastLength).toBe(0)
        })
    })
})
