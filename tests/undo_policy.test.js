/**
 * @vitest-environment jsdom
 *
 * Undo policy contract (documented in AGENTS.md § Undo policy):
 *   - Track parameter changes ARE undoable through cmd.updateTrack:
 *     values are clamped to TRACK_VALUE_RANGES, one history entry per change,
 *     `coalesce: true` merges a rapid same-key drag into a single undo step.
 *   - Master/mixer changes are NOT undoable: the output panel (and the
 *     pattern panel master shortcut) write straight to the audio mixer and
 *     never go through cmd/HistoryManager.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import outputPanelSrc from '../src/ui/output_panel.js?raw'
import pointerSectionSrc from '../src/ui/pattern_panel/pointer_section.js?raw'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import HistoryManager from '../src/logic/history_manager.js'
import { normalizeTrack } from '../src/model/track_schema.js'

describe('Undo policy — track parameters (cmd.updateTrack)', () => {
    let cmd
    let history
    let track

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        history = new HistoryManager(50)
        serviceRegistry.history = history
        track = normalizeTrack({ name: 'KICK' })
    })

    it('records one undoable entry per change and undo restores the previous value', () => {
        cmd.updateTrack(track, { velocity: 0.5 }, { desc: 'Velocity' })

        expect(track.velocity).toBe(0.5)
        expect(history.pastLength).toBe(1)
        expect(history.canUndo).toBe(true)

        expect(history.undo()).toBe(true)
        expect(track.velocity).toBe(1)
        expect(history.canRedo).toBe(true)

        expect(history.redo()).toBe(true)
        expect(track.velocity).toBe(0.5)
    })

    it('passes desc, params, prev and closures to the history entry (undo report)', () => {
        const spy = vi.spyOn(history, 'record')
        cmd.updateTrack(track, { velocity: 0.4 }, { desc: 'Velocity knob' })

        const entry = spy.mock.calls[0][0]
        expect(entry.meta.desc).toBe('Velocity knob')
        expect(entry.meta.params).toEqual({ track: 'KICK', velocity: 0.4 })
        expect(entry.meta.prev).toEqual({ velocity: 1 })
        expect(entry.coalesceKey).toBeUndefined()
        expect(typeof entry.execute).toBe('function')
        expect(typeof entry.undo).toBe('function')
    })

    it('clamps out-of-range values to TRACK_VALUE_RANGES before applying', () => {
        cmd.updateTrack(track, { velocity: 2, pan: -5, pitch: 99 })

        expect(track.velocity).toBe(1)
        expect(track.pan).toBe(-1)
        expect(track.pitch).toBe(24)
    })

    it('ignores unknown and derived keys — never applied, never recorded', () => {
        cmd.updateTrack(track, { notAKey: 1, loopPointBeat: 9, loopPointStep: 2 })
        expect(track.notAKey).toBeUndefined()
        expect(track.loopPointBeat).toBeUndefined()
        expect(track.loopPointStep).toBeUndefined()
        expect(history.pastLength).toBe(0)

        cmd.updateTrack(track, { beatCount: 8 })
        expect(track.beatCount).toBe(8)
        expect(history.pastLength).toBe(1)
    })

    // The coalesce window itself (merging a drag, keeping distinct keys apart) is
    // asserted in tests/cmd_update.test.js, with a controlled clock and the desc.
    it('a no-op update (same value) records nothing', () => {
        cmd.updateTrack(track, { velocity: 1 })
        expect(history.pastLength).toBe(0)
    })
})

describe('Undo policy — master/mixer is never in history', () => {
    it('output panel drives the mixer directly with no cmd/record/history wiring', () => {
        expect(outputPanelSrc).toContain('setMasterBus')
        expect(outputPanelSrc).not.toMatch(/history_manager|HistoryManager|\.record\(/)
    })

    it('pattern panel master shortcut also bypasses history', () => {
        expect(pointerSectionSrc).toContain('setMasterBus')
        expect(pointerSectionSrc).not.toMatch(/history_manager|HistoryManager|\.record\(/)
    })
})
