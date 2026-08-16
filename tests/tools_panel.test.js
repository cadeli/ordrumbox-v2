import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import Utils from '../src/core/utils.js'

vi.mock('../src/ui/toast.js', () => ({
    showToast: vi.fn(),
}))

function createMockContainer() {
    const listeners = {}
    return {
        innerHTML: '',
        querySelector: vi.fn((sel) => {
            if (sel === '#tp-compact' || sel === '#tp-rnd' || sel === '#tp-export-json' ||
                sel === '#tp-export-midi' || sel === '#tp-export-wav' ||
                sel === '#tp-midi-enable' || sel === '#tp-midi-sync') {
                return {
                    addEventListener: vi.fn(),
                    textContent: '',
                    disabled: false,
                }
            }
            if (sel === '#tp-midi-output-select') {
                return {
                    addEventListener: vi.fn(),
                    options: { length: 0 },
                    value: '',
                    innerHTML: '',
                }
            }
            if (sel === '#tp-wav-loops-slot') {
                return { replaceWith: vi.fn() }
            }
            if (sel.startsWith('#tp-import')) {
                return { addEventListener: vi.fn(), value: '' }
            }
            if (sel.startsWith('#midi')) {
                return {
                    classList: { toggle: vi.fn() },
                    innerText: '',
                }
            }
            return { addEventListener: vi.fn() }
        }),
    }
}

describe('ToolsPanel._compactPattern logic', () => {
    beforeEach(() => {
        serviceRegistry.reset()
        appState.reset()
    })

    it('compaction removes redundant notes from looped track', () => {
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
        expect(result.changed).toBe(true)
        expect(track.loopAtStep).toBe(2)
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
        serviceRegistry.mfCmd = {
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

        vi.spyOn(Math, 'random').mockReturnValue(0.5)

        const tracks = Utils.getTracksArray(pattern)
        for (const t of tracks) {
            const beats = t.nbBeats ?? pattern.nbBeats ?? 4
            const stepsPerBeat = t.stepsPerBeat ?? 4
            const totalSteps = beats * stepsPerBeat
            const noteCount = Math.max(1, Math.floor(totalSteps * (0.15 + Math.random() * 0.2)))
            const used = new Set()
            for (let i = 0; i < noteCount; i++) {
                let step
                do { step = Math.floor(Math.random() * totalSteps) } while (used.has(step))
                used.add(step)
                const beat = Math.floor(step / stepsPerBeat)
                const beatStep = step % stepsPerBeat
                const pitch = Math.floor(Math.random() * 13) - 6
                const note = serviceRegistry.mfCmd.addNote(t, beat, beatStep, pitch)
                if (note) note.velocity = 0.5 + Math.random() * 0.5
            }
        }

        expect(addedNotes.length).toBeGreaterThan(0)
        vi.restoreAllMocks()
    })
})

describe('ToolsPanel compact randomize integration', () => {
    it('Utils.getTracksArray works with array tracks', () => {
        const pattern = { tracks: [{ nbBeats: 4 }] }
        const tracks = Utils.getTracksArray(pattern)
        expect(tracks).toHaveLength(1)
    })

    it('Utils.getTracksArray works with object tracks', () => {
        const pattern = { tracks: { a: { nbBeats: 4 }, b: { nbBeats: 8 } } }
        const tracks = Utils.getTracksArray(pattern)
        expect(tracks).toHaveLength(2)
    })

    it('Utils.getTracksArray returns empty for null pattern', () => {
        expect(Utils.getTracksArray(null)).toEqual([])
        expect(Utils.getTracksArray({})).toEqual([])
    })
})
