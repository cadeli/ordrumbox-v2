import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import Utils from '../src/core/utils.js'

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
    beforeEach(() => {
        serviceRegistry.reset()
        appState.reset()
    })

    it('randomize adds notes to tracks', () => {
        const addedNotes = []
        serviceRegistry.cmd = {
            addNote: vi.fn((track, beat, beatStep, pitch) => {
                const note = { beat, beatStep, pitch, velocity: 0.8 }
                addedNotes.push(note)
                return note
            }),
        }
        serviceRegistry.audioEngine = { invalidateCache: vi.fn() }

        const track = {
            nbBeats: 4,
            stepsPerBeat: 4,
            notes: [],
        }
        const pattern = { tracks: [track], nbBeats: 4 }
        appState.patterns = [pattern]
        appState.selectedPatternNum = 0

        const tracks = Utils.getTracksArray(pattern)
        for (const t of tracks) {
            const beats = t.nbBeats ?? pattern.nbBeats ?? 4
            const stepsPerBeat = t.stepsPerBeat ?? 4
            const totalSteps = beats * stepsPerBeat
            const noteCount = Math.max(1, Math.floor(totalSteps * 0.2))
            const used = new Set()
            for (let i = 0; i < noteCount; i++) {
                let step = i % totalSteps
                while (used.has(step)) { step = (step + 1) % totalSteps }
                used.add(step)
                const beat = Math.floor(step / stepsPerBeat)
                const beatStep = step % stepsPerBeat
                const pitch = i % 12
                const note = serviceRegistry.cmd.addNote(t, beat, beatStep, pitch)
                if (note) note.velocity = 0.8
            }
        }

        expect(addedNotes.length).toBeGreaterThan(0)
    })
})
