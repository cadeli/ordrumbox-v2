/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../src/state/playback_events.js', async () => {
    const { EventEmitter } = await import('events')
    const emitter = new EventEmitter()
    let batchDepth = 0
    const pending = []
    return {
        playbackEvents: {
            emit: vi.fn((...a) => {
                if (batchDepth > 0) {
                    pending.push(a)
                    return
                }
                emitter.emit(...a)
            }),
            on: vi.fn((...a) => emitter.on(...a)),
            off: vi.fn((...a) => emitter.off(...a)),
            removeAllListeners: vi.fn((...a) => emitter.removeAllListeners(...a)),
            batch: vi.fn((fn) => {
                batchDepth++
                try {
                    fn()
                } finally {
                    batchDepth--
                    if (batchDepth === 0) {
                        while (pending.length) emitter.emit(...pending.shift())
                    }
                }
            }),
        },
    }
})

import HistoryManager from '../src/logic/history_manager.js'
import { logger } from '../src/core/logger.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { EVENTS } from '../src/core/events.js'
import { showToast } from '../src/core/notify.js'

vi.mock('../src/core/notify.js', () => ({ showToast: vi.fn() }))

describe('HistoryManager', () => {
    let history

    beforeEach(() => {
        history = new HistoryManager(5)
    })

    describe('initial state', () => {
        it('canUndo is false', () => expect(history.canUndo).toBe(false))
        it('canRedo is false', () => expect(history.canRedo).toBe(false))
        it('pastLength is 0', () => expect(history.pastLength).toBe(0))
        it('futureLength is 0', () => expect(history.futureLength).toBe(0))
    })

    describe('record', () => {
        it('records a command', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            expect(history.canUndo).toBe(true)
            expect(history.pastLength).toBe(1)
        })

        it('clears future when recording new command', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history.undo()
            expect(history.canRedo).toBe(true)
            history.record({ execute: vi.fn(), undo: vi.fn() })
            expect(history.canRedo).toBe(false)
        })

        it('respects maxSize', () => {
            for (let i = 0; i < 10; i++) {
                history.record({ execute: vi.fn(), undo: vi.fn() })
            }
            expect(history.pastLength).toBe(5)
        })

        it('does not record during undo', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history._isUndoing = true
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history._isUndoing = false
            expect(history.pastLength).toBe(2)
        })

        it('does not record during redo', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history._isRedoing = true
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history._isRedoing = false
            expect(history.pastLength).toBe(1)
        })
    })

    describe('execute', () => {
        it('calls executeFn and records', () => {
            const ex = vi.fn().mockReturnValue(42)
            const un = vi.fn()
            const result = history.execute(ex, un, { desc: 'test' })
            expect(result).toBe(42)
            expect(ex).toHaveBeenCalled()
            expect(history.canUndo).toBe(true)
        })
    })

    describe('undo', () => {
        it('calls the undo function of the last command', () => {
            const undo = vi.fn()
            history.record({ execute: vi.fn(), undo })
            history.undo()
            expect(undo).toHaveBeenCalled()
        })

        it('moves command to future', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history.undo()
            expect(history.canUndo).toBe(false)
            expect(history.canRedo).toBe(true)
        })

        it('returns false when nothing to undo', () => {
            expect(history.undo()).toBe(false)
        })

        it('re-pushes command on undo failure', () => {
            // Expected failure path: silence the deliberate logger.error output.
            const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
            const cmd = {
                execute: vi.fn(),
                undo: vi.fn(() => {
                    throw new Error('fail')
                }),
            }
            history.record(cmd)
            const result = history.undo()
            expect(result).toBe(false)
            expect(history.canUndo).toBe(true)
            expect(errorSpy).toHaveBeenCalled()
            errorSpy.mockRestore()
        })
    })

    describe('redo', () => {
        it('re-executes the undone command', () => {
            const ex = vi.fn()
            history.record({ execute: ex, undo: vi.fn() })
            history.undo()
            ex.mockClear()
            history.redo()
            expect(ex).toHaveBeenCalled()
        })

        it('moves command back to past', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history.undo()
            history.redo()
            expect(history.canUndo).toBe(true)
            expect(history.canRedo).toBe(false)
        })

        it('returns false when nothing to redo', () => {
            expect(history.redo()).toBe(false)
        })

        it('re-pushes command on redo failure', () => {
            // Expected failure path: silence the deliberate logger.error output.
            const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
            const cmd = {
                execute: vi.fn(() => {
                    throw new Error('fail')
                }),
                undo: vi.fn(),
            }
            history.record(cmd)
            history.undo()
            const result = history.redo()
            expect(result).toBe(false)
            expect(history.canRedo).toBe(true)
            expect(errorSpy).toHaveBeenCalled()
            errorSpy.mockRestore()
        })

        it('blocks redo without execute closure and never re-runs its undo', () => {
            // Regression: a no-op execute let a 2nd undo re-run the undo
            // closure on stale state (note loss/duplication).
            const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
            const undo = vi.fn()
            history.record({ execute: null, undo })
            expect(history.undo()).toBe(true)
            expect(history.canRedo).toBe(true)

            expect(history.redo()).toBe(false)
            expect(undo).toHaveBeenCalledTimes(1)
            // Must stay in future (blocked), NOT move to past where a later
            // undo would corrupt state.
            expect(history.canRedo).toBe(true)
            expect(history.canUndo).toBe(false)
            expect(errorSpy).toHaveBeenCalled()
            errorSpy.mockRestore()
        })
    })

    describe('clear', () => {
        it('empties both past and future', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history.undo()
            history.clear()
            expect(history.canUndo).toBe(false)
            expect(history.canRedo).toBe(false)
            expect(history.pastLength).toBe(0)
            expect(history.futureLength).toBe(0)
        })
    })

    describe('coalescing', () => {
        let now
        let nowSpy

        beforeEach(() => {
            now = 1_000_000
            nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
        })

        afterEach(() => {
            nowSpy.mockRestore()
        })

        it('merges same-key records inside the window into ONE undo step', () => {
            const undoFirst = vi.fn()
            const executeFirst = vi.fn()
            const executeSecond = vi.fn()

            history.record({
                coalesceKey: 'track:1:velocity',
                execute: executeFirst,
                undo: undoFirst,
                meta: { desc: 'drag' },
            })
            now += 50
            history.record({
                coalesceKey: 'track:1:velocity',
                execute: executeSecond,
                undo: vi.fn(),
                meta: { desc: 'drop' },
            })

            expect(history.pastLength).toBe(1)

            // Undo restores the PRE-gesture state (first entry's undo kept).
            expect(history.undo()).toBe(true)
            expect(undoFirst).toHaveBeenCalledTimes(1)

            // Redo replays the LAST state (execute was replaced).
            expect(history.redo()).toBe(true)
            expect(executeSecond).toHaveBeenCalledTimes(1)
            expect(executeFirst).not.toHaveBeenCalled()
        })

        it('starts a new entry once the window has elapsed', () => {
            history.record({ coalesceKey: 'k', execute: vi.fn(), undo: vi.fn() })
            now += HistoryManager.COALESCE_WINDOW_MS
            history.record({ coalesceKey: 'k', execute: vi.fn(), undo: vi.fn() })

            expect(history.pastLength).toBe(2)
        })

        it('never merges records with different keys', () => {
            history.record({ coalesceKey: 'track:1:velocity', execute: vi.fn(), undo: vi.fn() })
            history.record({ coalesceKey: 'track:2:velocity', execute: vi.fn(), undo: vi.fn() })

            expect(history.pastLength).toBe(2)
        })

        it('never merges records without a coalesceKey', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history.record({ execute: vi.fn(), undo: vi.fn() })

            expect(history.pastLength).toBe(2)
        })

        it('keeps only the newest meta so the undo hint matches the last tick', () => {
            history.record({ coalesceKey: 'k', execute: vi.fn(), undo: vi.fn(), meta: { desc: 'first' } })
            now += 100
            history.record({ coalesceKey: 'k', execute: vi.fn(), undo: vi.fn(), meta: { desc: 'second' } })

            const lastEmit = playbackEvents.emit.mock.calls.at(-1)
            expect(lastEmit[0]).toBe(EVENTS.HISTORY_CHANGE)
            expect(lastEmit[1].nextUndoDesc).toBe('second')
            expect(history.pastLength).toBe(1)
        })
    })

    describe('undo/redo cycle', () => {
        it('restores state through full cycle', () => {
            const state = { value: 0 }
            const cmds = [
                {
                    execute: () => {
                        state.value = 1
                    },
                    undo: () => {
                        state.value = 0
                    },
                },
                {
                    execute: () => {
                        state.value = 2
                    },
                    undo: () => {
                        state.value = 1
                    },
                },
                {
                    execute: () => {
                        state.value = 3
                    },
                    undo: () => {
                        state.value = 2
                    },
                },
            ]
            cmds.forEach((c) => history.record(c))
            expect(state.value).toBe(0)

            history.undo()
            expect(state.value).toBe(2)
            history.undo()
            expect(state.value).toBe(1)
            history.redo()
            expect(state.value).toBe(2)
            history.redo()
            expect(state.value).toBe(3)
        })

        it('new command after undo clears redo stack', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history.undo()
            expect(history.canRedo).toBe(true)
            history.record({ execute: vi.fn(), undo: vi.fn() })
            expect(history.canRedo).toBe(false)
        })
    })

    describe('undo/redo report toast', () => {
        const makeCommand = () => ({
            execute: vi.fn(),
            undo: vi.fn(),
            meta: {
                desc: 'Update KICK',
                params: { track: 'KICK', velocity: 0.6 },
                prev: { velocity: 0.9 },
            },
        })

        beforeEach(() => {
            vi.mocked(showToast).mockClear()
        })

        it('undo reports command name, parameters and stack sizes', () => {
            history.record(makeCommand())
            history.undo()

            expect(showToast).toHaveBeenCalledTimes(1)
            const [message, type, opts] = vi.mocked(showToast).mock.calls[0]
            expect(message).toBe(
                ['Undo — Update KICK', 'track: KICK', 'velocity: 0.6 → 0.9', 'history: 0 undo · 1 redo'].join('\n'),
            )
            expect(type).toBe('info')
            expect(opts).toEqual({ duration: 4500 })
        })

        it('redo reports parameters in the forward direction', () => {
            history.record(makeCommand())
            history.undo()
            vi.mocked(showToast).mockClear()
            history.redo()

            expect(showToast).toHaveBeenCalledTimes(1)
            const [message] = vi.mocked(showToast).mock.calls[0]
            expect(message).toContain('Redo — Update KICK')
            expect(message).toContain('velocity: 0.9 → 0.6')
        })

        it('commands without params only show name and stack sizes', () => {
            history.record({ execute: vi.fn(), undo: vi.fn() })
            history.undo()

            const [message] = vi.mocked(showToast).mock.calls[0]
            expect(message).toBe('Undo — Unnamed command\nhistory: 0 undo · 1 redo')
        })

        it('caps the parameter list at 8 entries with a "+N more" line', () => {
            const params = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i]))
            history.record({ execute: vi.fn(), undo: vi.fn(), meta: { desc: 'Big', params } })
            history.undo()

            const [message] = vi.mocked(showToast).mock.calls[0]
            const lines = message.split('\n')
            expect(lines[0]).toBe('Undo — Big')
            expect(lines).toHaveLength(1 + 8 + 1 + 1)
            expect(lines.at(-2)).toBe('+4 more…')
            expect(lines.at(-1)).toBe('history: 0 undo · 1 redo')
        })

        it('summarizes arrays as item counts instead of dumping them', () => {
            history.record({
                execute: vi.fn(),
                undo: vi.fn(),
                meta: { desc: 'Add note', params: { notes: [{ beat: 0 }, { beat: 1 }] } },
            })
            history.undo()

            const [message] = vi.mocked(showToast).mock.calls[0]
            expect(message).toContain('notes: [2 items]')
        })

        it('failed undo shows the error toast instead of a report', () => {
            const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
            history.record({
                execute: vi.fn(),
                undo: () => {
                    throw new Error('boom')
                },
                meta: { desc: 'Bad' },
            })
            history.undo()

            expect(showToast).toHaveBeenCalledTimes(1)
            const [message, type] = vi.mocked(showToast).mock.calls[0]
            expect(message).toBe('Undo failed')
            expect(type).toBe('error')
            errorSpy.mockRestore()
        })
    })
})
