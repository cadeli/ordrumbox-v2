import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import Utils from '../src/core/utils.js'
import Commander from '../src/logic/commands/cmd.js'

describe('ToolsPanel._compactPattern logic', () => {
    beforeEach(() => {
        serviceRegistry.reset()
        appState.reset()
    })

    it('compaction detects already-minimal loop', () => {
        const track = {
            nbBeats: 4,
            stepsPerBeat: 4,
            notes: [
                { beat: 0, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                { beat: 1, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                { beat: 2, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                { beat: 3, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
            ],
            loopAtStep: 4,
            loopPointBeat: 1,
            loopPointStep: 0,
        }

        const pattern = { tracks: [track], nbBeats: 4 }
        appState.patterns = [pattern]
        appState.selectedPatternNum = 0

        const result = Utils.addLoopToTrackIfPossible(track)
        expect(result.changed).toBe(false)
    })

    it('no-op when track has no loop pattern', () => {
        const track = {
            nbBeats: 4,
            stepsPerBeat: 4,
            notes: [
                { beat: 0, beatStep: 0, velocity: 0.8, pitch: 0, pan: 0 },
                { beat: 1, beatStep: 1, velocity: 0.8, pitch: 1, pan: 0 },
            ],
            loopAtStep: 16,
            loopPointBeat: 4,
            loopPointStep: 0,
        }

        const result = Utils.addLoopToTrackIfPossible(track)
        expect(result.changed).toBe(false)
    })

    it('empty track returns no-notes', () => {
        const track = { nbBeats: 4, stepsPerBeat: 4, notes: [], loopAtStep: 16 }
        const result = Utils.addLoopToTrackIfPossible(track)
        expect(result.changed).toBe(false)
        expect(result.reason).toBe('no-notes')
    })
})

describe('ToolsPanel._randomizePattern logic', () => {
    let cmd

    beforeEach(() => {
        serviceRegistry.reset()
        appState.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
        serviceRegistry.seq = { setBpm: vi.fn() }
        serviceRegistry.patterns = { computeFlatNotesFromPattern: () => {} }
    })

    it('randomize adds notes to every track via cmd.randomizeTrack', () => {
        const pattern = cmd.addPattern('Test')
        cmd.addTrack(pattern, 'KICK')
        cmd.addTrack(pattern, 'SNARE')
        cmd.setSelectedPatternNum(0)

        for (const track of pattern.tracks) {
            cmd.randomizeTrack(track, pattern)
        }

        for (const track of pattern.tracks) {
            expect(track.notes.length).toBeGreaterThan(0)
        }
    })
})
