/**
 * @vitest-environment jsdom
 *
 * Commander history API tests (Lot A):
 *   - recordTransaction(): collapses an import into ONE undoable entry
 *   - withSuppressedRecord(): no entries inside (boot / nested suppression)
 *   - record(): missing undo skips the entry; missing execute degrades to
 *     "undo works, redo blocked" (never a silent no-op that corrupts undo)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { logger } from '../src/core/logger.js'
import Commander from '../src/logic/commands/cmd.js'
import HistoryManager from '../src/logic/history_manager.js'

describe('Commander history API', () => {
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

    describe('recordTransaction', () => {
        it('collapses many inner commands into ONE undoable entry', () => {
            const pattern = cmd.addPattern('Base')
            const kick = cmd.addTrack(pattern, 'KICK', 4)
            history.clear()
            // Undo/redo of a transaction swaps pattern objects (cloned
            // snapshots, same as an import does) — always re-read via appState.
            const kickNow = () => appState.patterns[0].tracks.find((t) => t.name === 'KICK')

            cmd.recordTransaction('Import stuff', () => {
                cmd.addPattern('Imported_1')
                cmd.addNote(kick, 0, 0, 0)
                cmd.addNote(kick, 1, 0, 0)
                cmd.updateTrack(kick, { velocity: 0.7 })
            })

            expect(history.pastLength).toBe(1)
            expect(appState.patterns).toHaveLength(2)
            expect(kickNow().notes).toHaveLength(2)

            // Single undo restores the exact pre-transaction state
            expect(history.undo()).toBe(true)
            expect(appState.patterns).toHaveLength(1)
            expect(kickNow().notes).toHaveLength(0)
            expect(history.canUndo).toBe(false)

            // Single redo re-applies everything
            expect(history.redo()).toBe(true)
            expect(appState.patterns).toHaveLength(2)
            expect(kickNow().notes).toHaveLength(2)
            expect(kickNow().velocity).toBe(0.7)
        })

        it('undo/redo roundtrips with deep equality', () => {
            const pattern = cmd.addPattern('Base')
            cmd.addTrack(pattern, 'KICK', 4)
            const pre = JSON.stringify(appState.patterns)

            cmd.recordTransaction('Import MIDI file', () => {
                const imported = cmd.addPattern('MIDI Pat')
                cmd.addTrack(imported, 'DRUMS', 4)
            })
            const post = JSON.stringify(appState.patterns)
            expect(post).not.toBe(pre)

            history.undo()
            expect(JSON.stringify(appState.patterns)).toBe(pre)

            history.redo()
            expect(JSON.stringify(appState.patterns)).toBe(post)
        })

        it('records nothing when the transaction changes nothing', () => {
            history.clear()
            cmd.recordTransaction('No-op import', () => {
                // no state change
            })
            expect(history.pastLength).toBe(0)
            expect(history.canUndo).toBe(false)
        })

        it('restores selection on undo/redo', () => {
            cmd.addPattern('Base')
            cmd.addTrack(appState.patterns[0], 'KICK', 4)
            appState.selectedPatternIdx = 0
            history.clear()

            cmd.recordTransaction('Import two patterns', () => {
                cmd.addPattern('P2')
                cmd.addPattern('P3')
                appState.selectedPatternIdx = 2
            })
            expect(appState.selectedPatternIdx).toBe(2)

            history.undo()
            expect(appState.selectedPatternIdx).toBe(0)
            history.redo()
            expect(appState.selectedPatternIdx).toBe(2)
        })

        it('clamps a stale selection index when restoring', () => {
            cmd.addPattern('Base')
            appState.selectedPatternIdx = 5 // stale index (out of range)
            history.clear()

            cmd.recordTransaction('Load song', () => {
                appState.selectedPatternIdx = 0
                cmd.addPattern('Imported')
            })
            expect(history.pastLength).toBe(1)

            history.undo()
            expect(appState.selectedPatternIdx).toBe(0)
        })

        it('still records the partial mutation when the transaction throws', () => {
            const pattern = cmd.addPattern('Base')
            cmd.addTrack(pattern, 'KICK', 4)
            history.clear()

            expect(() =>
                cmd.recordTransaction('Boom', () => {
                    cmd.addPattern('Partial')
                    throw new Error('boom')
                }),
            ).toThrow('boom')

            // The partial import is undoable as one entry
            expect(history.pastLength).toBe(1)
            expect(appState.patterns).toHaveLength(2)
            history.undo()
            expect(appState.patterns).toHaveLength(1)
        })

        it('returns the transaction result', () => {
            const result = cmd.recordTransaction('With result', () => 42)
            expect(result).toBe(42)
        })
    })

    describe('withSuppressedRecord', () => {
        it('records nothing inside and restores normal recording after', () => {
            const pattern = cmd.addPattern('Base')
            const kick = cmd.addTrack(pattern, 'KICK', 4)
            history.clear()

            cmd.withSuppressedRecord(() => {
                cmd.addNote(kick, 0, 0, 0)
                cmd.addNote(kick, 1, 0, 0)
                expect(history.pastLength).toBe(0)
            })
            expect(history.pastLength).toBe(0)

            cmd.addNote(kick, 2, 0, 0)
            expect(history.pastLength).toBe(1)
        })

        it('restores the previous flag even when fn throws', () => {
            expect(() =>
                cmd.withSuppressedRecord(() => {
                    throw new Error('boom')
                }),
            ).toThrow('boom')

            cmd.addPattern('After')
            expect(history.pastLength).toBe(1)
        })

        it('is re-entrant: inner suppression does not re-enable recording early', () => {
            cmd.withSuppressedRecord(() => {
                cmd.withSuppressedRecord(() => {
                    cmd.addPattern('Inner')
                })
                cmd.addPattern('StillInner')
                expect(history.pastLength).toBe(0)
            })
            cmd.addPattern('Outer')
            expect(history.pastLength).toBe(1)
        })
    })

    describe('record validation', () => {
        it('skips the entry when undo is missing (logs error)', () => {
            const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
            cmd.record({ desc: 'broken' })
            expect(history.pastLength).toBe(0)
            expect(errorSpy).toHaveBeenCalled()
            errorSpy.mockRestore()
        })

        it('keeps undo working but blocks redo when execute is missing', () => {
            const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
            let value = 1
            cmd.record({
                desc: 'no execute',
                undo: () => {
                    value = 0
                },
            })
            expect(history.pastLength).toBe(1)

            expect(history.undo()).toBe(true)
            expect(value).toBe(0)

            // Redo is blocked loudly instead of silently doing nothing
            expect(history.redo()).toBe(false)
            expect(value).toBe(0)
            expect(history.canRedo).toBe(true)
            expect(errorSpy).toHaveBeenCalled()
            errorSpy.mockRestore()
        })

        it('does not record while suppressed (generation or transaction)', () => {
            const pattern = cmd.addPattern('Gen')
            history.clear()

            cmd.beginGenerationUndo(pattern)
            cmd.record({ desc: 'inner', execute: vi.fn(), undo: vi.fn() })
            expect(history.pastLength).toBe(0)
            cmd.cancelGenerationUndo()

            cmd.record({ desc: 'after cancel', execute: vi.fn(), undo: vi.fn() })
            expect(history.pastLength).toBe(1)
        })
    })
})
