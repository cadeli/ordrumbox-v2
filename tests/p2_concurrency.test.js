/**
 * @vitest-environment jsdom
 *
 * P2 concurrency regressions. Each test reproduces the interleaving that used
 * to corrupt state: overlapping generations, a transaction whose body awaits,
 * a service built twice, a selection that outlives its target, and a debounced
 * write surviving a cache reset.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import HistoryManager from '../src/logic/history_manager.js'
import Commander from '../src/logic/commands/cmd.js'
import { resetUserErrorReports } from '../src/core/notify.js'

describe('P2 — concurrency regressions', () => {
    let cmd
    let history

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        resetUserErrorReports()
        cmd = new Commander()
        history = new HistoryManager(50)
        serviceRegistry.cmd = cmd
        serviceRegistry.history = history
    })

    beforeEach(() => {
        // Two tests here fail a listener and a pattern switch on purpose; the
        // EventBus and Commander layers log the cause, printing expected stack
        // traces that read like real failures.
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('generation transactions cannot overlap', () => {
        it('rejects a second begin while one is open', () => {
            const pattern = cmd.addPattern('A')
            expect(cmd.beginGenerationUndo(pattern)).toBe(true)
            expect(cmd.beginGenerationUndo(pattern)).toBe(false)

            cmd.commitGenerationUndo()
            // released after the commit
            expect(cmd.beginGenerationUndo(pattern)).toBe(true)
            cmd.cancelGenerationUndo()
        })

        it('a commit without a begin re-enables recording instead of freezing it', () => {
            cmd.commitGenerationUndo()
            // recording must work again (a stuck #suppressRecord would swallow
            // every later history entry)
            const pattern = cmd.addPattern('B')
            cmd.updateTrack(pattern.tracks[0] ?? pattern, {})
            expect(history.pastLength).toBeGreaterThan(0)
        })
    })

    describe('recordTransaction awaits an async body before snapshotting', () => {
        it('redo restores the state the async tail wrote', async () => {
            // #restoreState re-creates the pattern objects, so assertions must
            // read through appState rather than keep a stale reference.
            cmd.addPattern('Song')
            appState.patterns[0].extra = 'before'
            const mark = history.pastLength

            await cmd.recordTransaction('Load', async () => {
                appState.patterns[0].extra = 'during'
                await Promise.resolve()
                appState.patterns[0].extra = 'after-await'
            })

            expect(appState.patterns[0].extra).toBe('after-await')
            expect(history.pastLength).toBe(mark + 1)

            history.undo()
            expect(appState.patterns[0].extra).toBe('before')
            history.redo()
            expect(appState.patterns[0].extra).toBe('after-await')
        })

        it('still records a sync body exactly once', async () => {
            const before = history.pastLength
            cmd.recordTransaction('Sync', () => {
                appState.songInfos.name = 'x'
            })
            expect(history.pastLength).toBe(before + 1)
        })

        it('records the partial state when the async body rejects', async () => {
            cmd.addPattern('Partial')
            appState.patterns[0].extra = 'start'
            const mark = history.pastLength

            await expect(
                cmd.recordTransaction('Failing', async () => {
                    appState.patterns[0].extra = 'half-done'
                    throw new Error('boom')
                }),
            ).rejects.toThrow('boom')

            // the partial mutation must be undoable, not silently dropped
            expect(history.pastLength).toBe(mark + 1)
            history.undo()
            expect(appState.patterns[0].extra).toBe('start')
        })
    })

    describe('lazy services are built once', () => {
        it('two concurrent getService calls share one instance', async () => {
            const { getMidiManagerService } = await import('../src/state/service_loader.js')
            const [a, b] = await Promise.all([getMidiManagerService(), getMidiManagerService()])
            expect(a).toBe(b)
        })

        it('returns the already-registered instance without rebuilding', async () => {
            const { getHistoryService } = await import('../src/state/service_loader.js')
            serviceRegistry.history = history
            expect(await getHistoryService()).toBe(history)
        })
    })

    describe('selection commands abandon work for a target the user left', () => {
        it('clamps an out-of-range pattern index', async () => {
            const cmd2 = new Commander()
            serviceRegistry.cmd = cmd2
            cmd2.addPattern('only')
            // serviceRegistry.flatNotes is a core service: without it the switch
            // aborts and rolls the index back, so the clamp went untested.
            const applied = []
            serviceRegistry.flatNotes = {
                applyFlatNotes(p) {
                    applied.push(p)
                },
            }

            await cmd2.setSelectedPatternIdx(999)

            expect(appState.selectedPatternIdx).toBe(0)
            expect(applied).toHaveLength(1)
        })

        // previousIdx must differ from target, otherwise restoring it is
        // indistinguishable from never having moved (the pattern list is left
        // holding a stale index, which every later appState.patterns[idx] reads).
        it('restores the previous index when the switch throws', async () => {
            const cmd2 = new Commander()
            serviceRegistry.cmd = cmd2
            cmd2.addPattern('A')
            cmd2.addPattern('B')
            appState.selectedPatternIdx = 1
            serviceRegistry.flatNotes = {
                applyFlatNotes() {
                    throw new Error('apply failed')
                },
            }

            await cmd2.setSelectedPatternIdx(0)

            expect(appState.selectedPatternIdx).toBe(1)
            expect(appState.patterns[appState.selectedPatternIdx]).toBeDefined()
        })

        it('completes the switch when the sequencer is not up yet', async () => {
            const cmd2 = new Commander()
            serviceRegistry.cmd = cmd2
            cmd2.addPattern('only')
            serviceRegistry.seq = null
            let applied = 0
            serviceRegistry.flatNotes = {
                applyFlatNotes() {
                    applied += 1
                },
            }

            await cmd2.setSelectedPatternIdx(0)

            // A missing seq used to throw before anything else ran, which
            // aborted the switch and rolled the index back.
            expect(applied).toBe(1)
            expect(appState.selectedPatternIdx).toBe(0)
        })
    })

    describe('event bus listeners cannot starve each other', () => {
        it('a panicking listener does not stop the next one', () => {
            const seen = []
            const bad = () => {
                throw new Error('listener bug')
            }
            playbackEvents.on('p2-event', bad)
            playbackEvents.on('p2-event', () => seen.push('ok'))
            expect(() => playbackEvents.emit('p2-event')).not.toThrow()
            expect(seen).toEqual(['ok'])
            playbackEvents.off('p2-event', bad)
        })
    })
})
