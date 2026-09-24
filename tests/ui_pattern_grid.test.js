/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import PatternPanel from '../src/ui/pattern_panel.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { showToast } from '../src/core/notify.js'

vi.mock('../src/core/notify.js', () => ({
    showToast: vi.fn(),
}))

describe('Pattern Panel UI Grid', () => {
    let panel

    beforeEach(() => {
        vi.clearAllMocks()
        // Mock appState with a test pattern
        appState.reset()
        const testPattern = {
            name: 'Test Pattern',
            nbBeats: 2,
            bpm: 120,
            tracks: {
                T1: {
                    name: 'KICK',
                    nbBeats: 1,
                    stepsPerBeat: 4,
                    loopAtStep: 3, // Loop point at index 2 (4th step of 1st beat)
                    notes: [
                        { beat: 0, beatStep: 0, pitch: 0, velocity: 1 }, // Main note
                        { beat: 0, beatStep: 1, pitch: 0, velocity: 0.8, retriggerNum: 3, rate: 1 }, // Note with 2 ghost notes
                    ],
                },
            },
        }
        appState.patterns = [testPattern]
        appState.selectedPatternNum = 0
        appState.currentPage = 0

        // Mock dependencies
        serviceRegistry.transport = { isRunning: false, tick: 0 }

        // Setup DOM
        document.body.innerHTML = ''
        panel = new PatternPanel()
        panel.init()
    })

    it('renders the pattern header with correct info', () => {
        const header = document.querySelector('.pp-header')
        expect(header.textContent).toContain('Test Pattern')
        expect(header.textContent).toContain('120 BPM')
        expect(header.textContent).toContain('2 beats')
    })

    it('renders the correct number of tracks', () => {
        // Only count regular track names, not the master track
        const trackNames = document.querySelectorAll('.pp-track:not(.pp-master-track) .pp-track-name')
        expect(trackNames.length).toBe(1)
        expect(trackNames[0].textContent).toBe('KICK')
    })

    it('displays active notes with the "filled" class', () => {
        const filledCells = document.querySelectorAll('.pp-cell.filled')
        // We have 2 notes in the mocked track
        expect(filledCells.length).toBe(2)
    })

    it('renders the loop point correctly', () => {
        // loopAtStep: 3 means the 3rd step (index 2) should have the pp-loop class
        const loopCell = document.querySelector('.pp-cell[data-pos="2"]')
        expect(loopCell.classList.contains('pp-loop')).toBe(true)
    })

    it('renders ghost notes for retriggering notes', () => {
        // The second note (beat 0, step 1) has retriggerNum: 3
        // This should generate 2 ghost notes in addition to the main note
        const ghosts = document.querySelectorAll('.pp-ghost')
        expect(ghosts.length).toBeGreaterThan(0)

        // Check if ghosts are inside the expected cell or nearby
        const cellWithGhosts = document.querySelector('.pp-cell[data-pos="1"]')
        expect(cellWithGhosts.querySelector('.pp-ghost')).not.toBeNull()
    })

    it('paints beats and cells according to track quantization', () => {
        // T1 has stepsPerBeat: 4. The pattern has 2 beats.
        // So we expect 2 beats * 4 steps = 8 cells.
        const cells = document.querySelectorAll('.pp-cell')
        expect(cells.length).toBe(8)
    })

    it('rebuilds cell count per beat when stepsPerBeat changes without PATTERN_META_CHANGE', () => {
        // TRACK_PARAM_CHANGE only marks trackDataDirty — structureSig must force full render.
        expect(document.querySelectorAll('.pp-cell').length).toBe(8)
        expect(document.querySelectorAll('.pp-beat')[0].querySelectorAll('.pp-cell').length).toBe(4)

        appState.patterns[0].tracks['T1'].stepsPerBeat = 8
        panel.sync()

        expect(document.querySelectorAll('.pp-cell').length).toBe(16)
        const firstBeat = document.querySelectorAll('.pp-beat')[0]
        expect(firstBeat.querySelectorAll('.pp-cell').length).toBe(8)
    })

    it('handles empty tracks gracefully', () => {
        appState.patterns[0].tracks = {}
        panel.sync()
        const masterBtn = document.querySelector('#pp-master-btn')
        expect(masterBtn).not.toBeNull()
        const addTrack = document.querySelector('#pp-add-track')
        expect(addTrack).not.toBeNull()
        expect(addTrack.textContent).toContain('new track')
    })

    it('renders a mute divider for each track', () => {
        const dividers = document.querySelectorAll('.pp-divider')
        expect(dividers.length).toBe(1)
        expect(dividers[0].dataset.track).toBe('0')
    })

    it('divider has muted class when track.mute is true', () => {
        appState.patterns[0].tracks['T1'].mute = true
        panel.sync()
        const divider = document.querySelector('.pp-divider')
        expect(divider.classList.contains('muted')).toBe(true)
        const trackRow = divider.closest('.pp-track')
        expect(trackRow.classList.contains('pp-muted')).toBe(true)
    })

    it('divider does not have muted class when track.mute is false', () => {
        appState.patterns[0].tracks['T1'].mute = false
        panel.sync()
        const divider = document.querySelector('.pp-divider')
        expect(divider.classList.contains('muted')).toBe(false)
        const trackRow = divider.closest('.pp-track')
        expect(trackRow.classList.contains('pp-muted')).toBe(false)
    })

    it('clicking divider toggles track.mute', () => {
        appState.patterns[0].tracks['T1'].mute = false
        panel.sync()
        document.querySelector('.pp-divider').click()
        expect(appState.patterns[0].tracks['T1'].mute).toBe(true)
        document.querySelector('.pp-divider').click()
        expect(appState.patterns[0].tracks['T1'].mute).toBe(false)
    })

    it('clicking divider updates DOM classes', () => {
        appState.patterns[0].tracks['T1'].mute = false
        panel.sync()
        document.querySelector('.pp-divider').click()
        expect(document.querySelector('.pp-divider').classList.contains('muted')).toBe(true)
        document.querySelector('.pp-divider').click()
        expect(document.querySelector('.pp-divider').classList.contains('muted')).toBe(false)
    })

    it('clicking an empty cell adds a note surgically and previews audio', () => {
        const simpleBeepSpy = vi.fn()
        serviceRegistry.seq = { simpleBeep: simpleBeepSpy }
        serviceRegistry.cmd = {
            addNote: vi.fn((track, beat, step) => {
                const note = { beat, beatStep: step, pitch: 0, velocity: 0.8 }
                track.notes.push(note)
                return note
            }),
        }

        const initialTrackEl = document.querySelector('.pp-track')
        const emptyCell = document.querySelector('.pp-cell[data-pos="3"]')
        expect(emptyCell.classList.contains('filled')).toBe(false)

        emptyCell.click()

        // Verify note was added and cell was updated in-place
        expect(emptyCell.classList.contains('filled')).toBe(true)
        expect(serviceRegistry.cmd.addNote).toHaveBeenCalledWith(appState.patterns[0].tracks['T1'], 0, 3)
        // Verify audio preview was called
        expect(simpleBeepSpy).toHaveBeenCalledWith(0, expect.objectContaining({ beat: 0, beatStep: 3 }))
        // Verify DOM elements were preserved in-place (not destroyed and recreated)
        expect(document.querySelector('.pp-track')).toBe(initialTrackEl)
    })

    it('clicking an existing note selects it and triggers audio preview', () => {
        const simpleBeepSpy = vi.fn()
        serviceRegistry.seq = { simpleBeep: simpleBeepSpy }

        const filledCell = document.querySelector('.pp-cell[data-pos="0"]')
        expect(filledCell.classList.contains('filled')).toBe(true)

        filledCell.click()

        expect(filledCell.classList.contains('selected')).toBe(true)
        expect(simpleBeepSpy).toHaveBeenCalledWith(0, expect.objectContaining({ beat: 0, beatStep: 0 }))
    })

    it('clicking an already-selected note deletes it surgically', () => {
        const deleteNoteSpy = vi.fn((track, note) => {
            const idx = track.notes.indexOf(note)
            if (idx >= 0) track.notes.splice(idx, 1)
        })
        serviceRegistry.cmd = { deleteNote: deleteNoteSpy }
        serviceRegistry.seq = { simpleBeep: vi.fn() }

        const filledCell = document.querySelector('.pp-cell[data-pos="0"]')
        // First click selects
        filledCell.click()
        expect(filledCell.classList.contains('selected')).toBe(true)

        // Second click deletes
        filledCell.click()
        expect(deleteNoteSpy).toHaveBeenCalled()
        expect(filledCell.classList.contains('filled')).toBe(false)
        expect(filledCell.classList.contains('selected')).toBe(false)
    })

    it('clicking a track name selects track and previews track audio', () => {
        const simpleBeepSpy = vi.fn()
        serviceRegistry.seq = { simpleBeep: simpleBeepSpy }

        const trackName = document.querySelector('.pp-track-name')
        trackName.click()

        expect(trackName.classList.contains('selected')).toBe(true)
        expect(simpleBeepSpy).toHaveBeenCalledWith(0)
    })

    describe('keyboard Delete/Backspace', () => {
        function pressKey(key) {
            panel.container.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
        }

        function mockDeleteNote() {
            serviceRegistry.cmd = {
                ...serviceRegistry.cmd,
                deleteNote: vi.fn((track, note) => {
                    const idx = track.notes.indexOf(note)
                    if (idx >= 0) track.notes.splice(idx, 1)
                }),
                setCurrentPage: vi.fn(),
                addNote: vi.fn((track, beat, step) => {
                    const note = { beat, beatStep: step, pitch: 0, velocity: 0.8 }
                    track.notes.push(note)
                    return note
                }),
            }
            serviceRegistry.seq = { simpleBeep: vi.fn() }
        }

        it('Delete removes the note under the cursor without prior selection', () => {
            mockDeleteNote()
            const track = appState.patterns[0].tracks['T1']
            const note = track.notes[0]
            expect(note).toEqual(expect.objectContaining({ beat: 0, beatStep: 0 }))

            pressKey('Delete')

            expect(track.notes).not.toContain(note)
            expect(panel.selNote).toBeNull()
            const cell = document.querySelector('.pp-cell[data-pos="0"]')
            expect(cell.classList.contains('filled')).toBe(false)
            expect(cell.classList.contains('selected')).toBe(false)
        })

        it('Backspace removes the note under the cursor without prior selection', () => {
            mockDeleteNote()
            const track = appState.patterns[0].tracks['T1']
            const note = track.notes[0]

            pressKey('Backspace')

            expect(track.notes).not.toContain(note)
            expect(panel.selNote).toBeNull()
            const cell = document.querySelector('.pp-cell[data-pos="0"]')
            expect(cell.classList.contains('filled')).toBe(false)
        })

        it('Delete removes selected note and clears selection', () => {
            mockDeleteNote()
            const track = appState.patterns[0].tracks['T1']
            const note = track.notes[0]

            document.querySelector('.pp-cell[data-pos="0"]').click()
            expect(panel.selNote).toBe(note)
            expect(document.querySelector('.pp-cell[data-pos="0"]').classList.contains('selected')).toBe(true)

            pressKey('Delete')

            expect(track.notes).not.toContain(note)
            expect(panel.selNote).toBeNull()
            expect(panel.selTrackIdx).toBe(-1)
            expect(document.querySelector('.pp-cell[data-pos="0"]').classList.contains('selected')).toBe(false)
        })

        it('Delete on empty cell clears selection without error', () => {
            mockDeleteNote()
            const track = appState.patterns[0].tracks['T1']
            const initialCount = track.notes.length

            document.querySelector('.pp-cell[data-pos="0"]').click()
            expect(panel.selNote).not.toBeNull()

            panel.container.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
            )
            panel.container.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
            )
            pressKey('Delete')

            expect(track.notes.length).toBe(initialCount)
            expect(panel.selNote).toBeNull()
        })

        it('Delete preventDefault stops browser back navigation', () => {
            mockDeleteNote()
            const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
            const preventSpy = vi.spyOn(event, 'preventDefault')
            panel.container.dispatchEvent(event)
            expect(preventSpy).toHaveBeenCalled()
        })

        it('Delete removes every note stacked on the same step', () => {
            mockDeleteNote()
            const track = appState.patterns[0].tracks['T1']
            track.notes.push({ beat: 0, beatStep: 0, pitch: 12, velocity: 0.9 })
            expect(track.notes.filter((n) => n.beat === 0 && n.beatStep === 0).length).toBe(2)

            pressKey('Delete')

            expect(track.notes.filter((n) => n.beat === 0 && n.beatStep === 0).length).toBe(0)
            expect(track.notes.filter((n) => n.beat === 0 && n.beatStep === 1).length).toBe(1)
        })
    })

    describe('keyboard Escape', () => {
        function pressKey(key) {
            panel.container.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
        }

        function setupCmd() {
            serviceRegistry.cmd = {
                ...serviceRegistry.cmd,
                setCurrentPage: vi.fn(),
                addNote: vi.fn((track, beat, step) => {
                    const note = { beat, beatStep: step, pitch: 0, velocity: 0.8 }
                    track.notes.push(note)
                    return note
                }),
                deleteNote: vi.fn((track, note) => {
                    const idx = track.notes.indexOf(note)
                    if (idx >= 0) track.notes.splice(idx, 1)
                }),
            }
            serviceRegistry.seq = { simpleBeep: vi.fn() }
        }

        it('Escape clears cursor and selection state', () => {
            setupCmd()
            pressKey('ArrowRight')
            expect(panel.cursorTrackIdx).toBe(0)

            document.querySelector('.pp-cell[data-pos="0"]').click()
            expect(panel.selNote).not.toBeNull()

            pressKey('Escape')

            expect(panel.cursorTrackIdx).toBe(-1)
            expect(panel.selNote).toBeNull()
            expect(panel.selTrackIdx).toBe(-1)
        })

        it('Escape removes cursor and selected classes from the grid', () => {
            setupCmd()
            pressKey('ArrowRight')
            document.querySelector('.pp-cell[data-pos="0"]').click()
            expect(document.querySelector('.pp-cell.selected')).not.toBeNull()

            pressKey('Escape')

            expect(document.querySelector('.pp-cell.cursor')).toBeNull()
            expect(document.querySelector('.pp-cell.selected')).toBeNull()
            expect(document.querySelector('.pp-note-slice.selected')).toBeNull()
        })

        it('Escape preventDefault', () => {
            setupCmd()
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
            const preventSpy = vi.spyOn(event, 'preventDefault')
            panel.container.dispatchEvent(event)
            expect(preventSpy).toHaveBeenCalled()
        })

        it('next arrow after Escape re-initializes the cursor', () => {
            setupCmd()
            pressKey('ArrowRight')
            pressKey('Escape')
            expect(panel.cursorTrackIdx).toBe(-1)

            pressKey('ArrowRight')

            expect(panel.cursorTrackIdx).toBe(0)
            expect(panel.cursorBeat).toBe(0)
            expect(panel.cursorBeatStep).toBe(1)
            const cell = document.querySelector('.pp-cell[data-pos="1"]')
            expect(cell.classList.contains('selected') || cell.classList.contains('cursor')).toBe(true)
        })
    })

    describe('keyboard Ctrl+C / Ctrl+V', () => {
        function pressKey(key) {
            panel.container.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
        }

        function pressMod(key, { shift = false } = {}) {
            const code = key === 'c' || key === 'C' ? 'KeyC' : key === 'v' || key === 'V' ? 'KeyV' : key
            panel.container.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key,
                    code,
                    ctrlKey: true,
                    shiftKey: shift,
                    bubbles: true,
                    cancelable: true,
                }),
            )
        }

        function initCursor() {
            // ArrowUp with cursor at -1 initializes to 0:0 without moving track
            pressKey('ArrowUp')
        }

        function setupCmd() {
            serviceRegistry.cmd = {
                ...serviceRegistry.cmd,
                setCurrentPage: vi.fn(),
                addNote: vi.fn((track, beat, step) => {
                    const note = { beat, beatStep: step, pitch: 0, velocity: 0.8 }
                    track.notes.push(note)
                    return note
                }),
                deleteNote: vi.fn((track, note) => {
                    const idx = track.notes.indexOf(note)
                    if (idx >= 0) track.notes.splice(idx, 1)
                }),
                pasteStepNotes: vi.fn((track, beat, beatStep, sourceNotes) => {
                    track.notes = (track.notes ?? []).filter((n) => !(n.beat === beat && n.beatStep === beatStep))
                    for (const src of sourceNotes) {
                        track.notes.push({ ...src, beat, beatStep })
                    }
                }),
                pasteTrack: vi.fn((pattern, insertIdx, sourceTrack) => {
                    if (!Array.isArray(pattern.tracks)) {
                        pattern.tracks = Object.values(pattern.tracks)
                    }
                    const clone = structuredClone(sourceTrack)
                    clone.name = `${sourceTrack.name} copy`
                    pattern.tracks.splice(insertIdx, 0, clone)
                    return clone
                }),
            }
            serviceRegistry.seq = { simpleBeep: vi.fn() }
        }

        it('Ctrl+C copies notes at the cursor step', () => {
            setupCmd()
            initCursor()

            pressMod('c')

            expect(panel.clipboard).not.toBeNull()
            expect(panel.clipboard.type).toBe('step')
            expect(panel.clipboard.notes).toHaveLength(1)
            expect(panel.clipboard.notes[0]).toEqual(expect.objectContaining({ beat: 0, beatStep: 0 }))
            expect(showToast).toHaveBeenCalledWith('Copied 1 note — KICK @ beat 1.1', 'success')
        })

        it('Ctrl+C on empty step copies empty step clipboard', () => {
            setupCmd()
            initCursor()
            pressKey('ArrowRight')
            pressKey('ArrowRight')
            pressKey('ArrowRight')

            pressMod('c')

            expect(panel.clipboard.type).toBe('step')
            expect(panel.clipboard.notes).toHaveLength(0)
            expect(showToast).toHaveBeenCalledWith('Copied empty step — KICK @ beat 1.4', 'success')
        })

        it('Ctrl+V pastes step notes at cursor', () => {
            setupCmd()
            const track = appState.patterns[0].tracks['T1']

            initCursor()
            pressMod('c')
            pressKey('ArrowRight')
            pressKey('ArrowRight')
            pressKey('ArrowRight')
            pressMod('V')

            expect(serviceRegistry.cmd.pasteStepNotes).toHaveBeenCalledWith(
                track,
                0,
                3,
                expect.arrayContaining([expect.objectContaining({ beat: 0, beatStep: 0 })]),
            )
            expect(track.notes.some((n) => n.beat === 0 && n.beatStep === 3)).toBe(true)
            expect(showToast).toHaveBeenCalledWith('Pasted 1 note — KICK @ beat 1.4', 'success')
        })

        it('Ctrl+V replaces existing notes on target step', () => {
            setupCmd()
            const track = appState.patterns[0].tracks['T1']
            const beforeCount = track.notes.length

            initCursor()
            pressMod('c')
            pressKey('ArrowRight')
            pressMod('V')

            expect(track.notes.filter((n) => n.beat === 0 && n.beatStep === 1)).toHaveLength(1)
            expect(track.notes.length).toBe(beforeCount)
        })

        it('Ctrl+Shift+C copies the track when cursor is inactive', () => {
            setupCmd()
            pressKey('Escape')
            expect(panel.cursorTrackIdx).toBe(-1)

            pressMod('c', { shift: true })

            expect(panel.clipboard.type).toBe('track')
            expect(panel.clipboard.track.name).toBe('KICK')
            expect(panel.clipboard.track.notes).toHaveLength(2)
            expect(showToast).toHaveBeenCalledWith('Copied track "KICK" (2 notes)', 'success')
        })

        it('Ctrl+Shift+C copies track even with active cursor', () => {
            setupCmd()
            initCursor()

            pressMod('c', { shift: true })

            expect(panel.clipboard.type).toBe('track')
            expect(panel.clipboard.track.name).toBe('KICK')
        })

        it('Ctrl+V pastes track clipboard as a new track', () => {
            setupCmd()
            const pattern = appState.patterns[0]
            pressMod('c', { shift: true })

            pressMod('V', { shift: true })

            expect(serviceRegistry.cmd.pasteTrack).toHaveBeenCalled()
            const tracksAfter = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)
            expect(tracksAfter).toHaveLength(2)
            expect(tracksAfter[1].name).toContain('KICK')
            expect(tracksAfter[1].notes).toHaveLength(2)
            expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Pasted track "KICK copy"'), 'success')
            expect(showToast).toHaveBeenCalledWith(expect.stringContaining('(2 notes)'), 'success')
        })

        it('Ctrl+C after Escape with no shift copies track (cursor inactive)', () => {
            setupCmd()
            initCursor()
            pressKey('Escape')
            expect(panel.cursorTrackIdx).toBe(-1)

            pressMod('c')

            expect(panel.clipboard.type).toBe('track')
        })

        it('Ctrl+V with empty clipboard is a no-op', () => {
            setupCmd()
            const track = appState.patterns[0].tracks['T1']
            const count = track.notes.length

            pressMod('V')

            expect(serviceRegistry.cmd.pasteStepNotes).not.toHaveBeenCalled()
            expect(track.notes).toHaveLength(count)
            expect(showToast).toHaveBeenCalledWith('Clipboard is empty', 'info')
        })

        it('Ctrl+C preventDefault', () => {
            setupCmd()
            const event = new KeyboardEvent('keydown', {
                key: 'c',
                code: 'KeyC',
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
            })
            const spy = vi.spyOn(event, 'preventDefault')
            panel.container.dispatchEvent(event)
            expect(spy).toHaveBeenCalled()
        })
    })

    describe('keyboard Shift+Arrow multi-step selection', () => {
        function pressKey(key, opts = {}) {
            panel.container.dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }),
            )
        }

        function pressArrow(key, { shift = false } = {}) {
            const event = new KeyboardEvent('keydown', {
                key,
                shiftKey: shift,
                bubbles: true,
                cancelable: true,
            })
            const spy = vi.spyOn(event, 'preventDefault')
            panel.container.dispatchEvent(event)
            return spy
        }

        function setupCmd() {
            serviceRegistry.cmd = {
                ...serviceRegistry.cmd,
                setCurrentPage: vi.fn(),
                addNote: vi.fn((track, beat, step) => {
                    const note = { beat, beatStep: step, pitch: 0, velocity: 0.8 }
                    track.notes.push(note)
                    return note
                }),
                deleteNote: vi.fn((track, note) => {
                    const idx = track.notes.indexOf(note)
                    if (idx >= 0) track.notes.splice(idx, 1)
                }),
            }
            serviceRegistry.seq = { simpleBeep: vi.fn() }
        }

        function initCursor() {
            pressKey('ArrowUp')
        }

        function rangeCells() {
            return document.querySelectorAll('.pp-cell.pp-range')
        }

        it('first Shift+Arrow sets the range anchor at the cursor', () => {
            setupCmd()
            initCursor()
            expect(panel.rangeAnchor).toBeNull()

            pressArrow('ArrowRight', { shift: true })

            expect(panel.rangeAnchor).toEqual({ trackIdx: 0, beat: 0, beatStep: 0 })
            expect(panel.cursorBeatStep).toBe(1)
        })

        it('Shift+ArrowRight extends the selection across steps', () => {
            setupCmd()
            initCursor()

            pressArrow('ArrowRight', { shift: true })
            pressArrow('ArrowRight', { shift: true })

            expect(panel.cursorBeatStep).toBe(2)
            expect(panel.rangeAnchor).toEqual({ trackIdx: 0, beat: 0, beatStep: 0 })
            expect(rangeCells().length).toBe(3)
            expect(document.querySelector('.pp-cell[data-pos="0"]').classList.contains('pp-range')).toBe(true)
            expect(document.querySelector('.pp-cell[data-pos="1"]').classList.contains('pp-range')).toBe(true)
            expect(document.querySelector('.pp-cell[data-pos="2"]').classList.contains('pp-range')).toBe(true)
            expect(document.querySelector('.pp-cell[data-pos="3"]').classList.contains('pp-range')).toBe(false)
        })

        it('Shift+ArrowLeft extends backwards from the anchor', () => {
            setupCmd()
            initCursor()
            pressArrow('ArrowRight', { shift: true })
            pressArrow('ArrowRight', { shift: true })
            pressArrow('ArrowRight', { shift: true })
            expect(panel.cursorBeatStep).toBe(3)

            pressArrow('ArrowLeft', { shift: true })

            expect(panel.cursorBeatStep).toBe(2)
            expect(panel.rangeAnchor).toEqual({ trackIdx: 0, beat: 0, beatStep: 0 })
            expect(rangeCells().length).toBe(3)
            expect(document.querySelector('.pp-cell[data-pos="0"]').classList.contains('pp-range')).toBe(true)
            expect(document.querySelector('.pp-cell[data-pos="1"]').classList.contains('pp-range')).toBe(true)
            expect(document.querySelector('.pp-cell[data-pos="2"]').classList.contains('pp-range')).toBe(true)
        })

        it('Shift+ArrowDown extends across tracks', () => {
            setupCmd()
            appState.patterns[0].tracks = {
                T1: {
                    name: 'KICK',
                    nbBeats: 1,
                    stepsPerBeat: 4,
                    notes: [{ beat: 0, beatStep: 0, pitch: 0, velocity: 1 }],
                },
                T2: {
                    name: 'SNARE',
                    nbBeats: 1,
                    stepsPerBeat: 4,
                    notes: [],
                },
            }
            panel.sync()
            initCursor()

            pressArrow('ArrowDown', { shift: true })

            expect(panel.cursorTrackIdx).toBe(1)
            expect(panel.rangeAnchor.trackIdx).toBe(0)
            expect(rangeCells().length).toBe(2)
            const cells = [...rangeCells()]
            expect(cells.map((c) => c.dataset.track).sort()).toEqual(['0', '1'])
        })

        it('plain Arrow clears the range selection', () => {
            setupCmd()
            initCursor()
            pressArrow('ArrowRight', { shift: true })
            pressArrow('ArrowRight', { shift: true })
            expect(rangeCells().length).toBe(3)

            pressArrow('ArrowRight')

            expect(panel.rangeAnchor).toBeNull()
            expect(rangeCells().length).toBe(0)
            expect(panel.cursorBeatStep).toBe(3)
        })

        it('Escape clears the range selection', () => {
            setupCmd()
            initCursor()
            pressArrow('ArrowRight', { shift: true })
            expect(panel.rangeAnchor).not.toBeNull()

            pressKey('Escape')

            expect(panel.rangeAnchor).toBeNull()
            expect(rangeCells().length).toBe(0)
            expect(panel.cursorTrackIdx).toBe(-1)
        })

        it('click clears the range selection', () => {
            setupCmd()
            initCursor()
            pressArrow('ArrowRight', { shift: true })
            expect(panel.rangeAnchor).not.toBeNull()

            document.querySelector('.pp-cell[data-pos="0"]').click()

            expect(panel.rangeAnchor).toBeNull()
            expect(rangeCells().length).toBe(0)
        })

        it('Shift+Arrow preventDefault', () => {
            setupCmd()
            initCursor()
            const spy = pressArrow('ArrowRight', { shift: true })
            expect(spy).toHaveBeenCalled()
        })

        it('Delete removes every note inside the range', () => {
            setupCmd()
            const track = appState.patterns[0].tracks['T1']
            track.notes.push({ beat: 0, beatStep: 2, pitch: 0, velocity: 0.9 })
            expect(track.notes).toHaveLength(3)

            initCursor()
            pressArrow('ArrowRight', { shift: true })
            pressArrow('ArrowRight', { shift: true })
            pressKey('Delete')

            expect(track.notes).toHaveLength(0)
            expect(panel.rangeAnchor).toBeNull()
            expect(document.querySelector('.pp-cell.filled')).toBeNull()
        })

        it('Delete on multi-track range only clears notes in selected tracks', () => {
            setupCmd()
            appState.patterns[0].tracks = {
                T1: {
                    name: 'KICK',
                    nbBeats: 1,
                    stepsPerBeat: 4,
                    notes: [
                        { beat: 0, beatStep: 0, pitch: 0, velocity: 1 },
                        { beat: 0, beatStep: 3, pitch: 0, velocity: 1 },
                    ],
                },
                T2: {
                    name: 'SNARE',
                    nbBeats: 1,
                    stepsPerBeat: 4,
                    notes: [{ beat: 0, beatStep: 0, pitch: 2, velocity: 1 }],
                },
            }
            panel.sync()
            initCursor()
            pressArrow('ArrowDown', { shift: true })
            pressKey('Delete')

            expect(appState.patterns[0].tracks.T1.notes).toHaveLength(1)
            expect(appState.patterns[0].tracks.T1.notes[0]).toEqual(expect.objectContaining({ beatStep: 3 }))
            expect(appState.patterns[0].tracks.T2.notes).toHaveLength(0)
        })

        it('Delete outside range keeps notes beyond the selection', () => {
            setupCmd()
            const track = appState.patterns[0].tracks['T1']
            track.notes.push({ beat: 0, beatStep: 3, pitch: 0, velocity: 0.9 })

            initCursor()
            pressArrow('ArrowRight', { shift: true })
            pressKey('Delete')

            expect(track.notes).toHaveLength(1)
            expect(track.notes[0]).toEqual(expect.objectContaining({ beat: 0, beatStep: 3 }))
        })
    })

    describe('track context menu (right-click)', () => {
        function openMenu(trackEl = document.querySelector('.pp-track')) {
            const event = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 10,
                clientY: 20,
            })
            trackEl.dispatchEvent(event)
            return event
        }

        function menu() {
            return document.querySelector('.pp-context-menu')
        }

        function menuLabels() {
            return [...document.querySelectorAll('.pp-context-menu-item')].map((el) => el.textContent)
        }

        function menuItem(label) {
            return [...document.querySelectorAll('.pp-context-menu-item')].find((el) => el.textContent === label)
        }

        function clickItem(label) {
            const item = menuItem(label)
            expect(item).not.toBeNull()
            expect(item.disabled).toBe(false)
            item.click()
        }

        function setupCmd() {
            serviceRegistry.cmd = {
                ...serviceRegistry.cmd,
                setCurrentPage: vi.fn(),
                removeTrack: vi.fn(),
                cleanTrack: vi.fn((track) => {
                    track.notes = []
                }),
                randomizeTrack: vi.fn(),
                addNote: vi.fn((track, beat, step) => {
                    const note = { beat, beatStep: step, pitch: 0, velocity: 0.8 }
                    track.notes.push(note)
                    return note
                }),
                deleteNote: vi.fn((track, note) => {
                    const idx = track.notes.indexOf(note)
                    if (idx >= 0) track.notes.splice(idx, 1)
                }),
                pasteTrack: vi.fn((pattern, insertIdx, sourceTrack) => {
                    if (!Array.isArray(pattern.tracks)) {
                        pattern.tracks = Object.values(pattern.tracks)
                    }
                    const clone = structuredClone(sourceTrack)
                    clone.name = `${sourceTrack.name} copy`
                    pattern.tracks.splice(insertIdx, 0, clone)
                    return clone
                }),
            }
            serviceRegistry.seq = { simpleBeep: vi.fn() }
            serviceRegistry.audioEngine = { invalidateCache: vi.fn() }
        }

        it('right-click preventDefault and opens menu with track name header', () => {
            setupCmd()
            const track = document.querySelector('.pp-track:not(.pp-master-track)')

            const event = openMenu(track)

            expect(event.defaultPrevented).toBe(true)
            expect(menu()).not.toBeNull()
            expect(document.querySelector('.pp-context-menu-header').textContent).toBe('KICK')
        })

        it('lists Copy track, Paste tracks, Duplicate track, Delete track, Randomize, Clear notes', () => {
            setupCmd()
            openMenu()

            expect(menuLabels()).toEqual([
                'Copy track',
                'Paste tracks',
                'Duplicate track',
                'Delete track',
                'Randomize',
                'Clear notes',
            ])
        })

        it('right-click outside tracks closes the menu', () => {
            setupCmd()
            openMenu()
            expect(menu()).not.toBeNull()

            const header = document.querySelector('.pp-header')
            header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

            expect(menu()).toBeNull()
        })

        it('Escape closes the menu', () => {
            setupCmd()
            openMenu()
            expect(menu()).not.toBeNull()

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

            expect(menu()).toBeNull()
        })

        it('click outside closes the menu', () => {
            setupCmd()
            openMenu()

            document.body.click()

            expect(menu()).toBeNull()
        })

        it('menu is removed after choosing an item', () => {
            setupCmd()
            openMenu()
            clickItem('Copy track')
            expect(menu()).toBeNull()
        })

        it('Copy track puts the track on the clipboard with toast', () => {
            setupCmd()
            openMenu()

            clickItem('Copy track')

            expect(panel.clipboard).not.toBeNull()
            expect(panel.clipboard.type).toBe('track')
            expect(panel.clipboard.track.name).toBe('KICK')
            expect(showToast).toHaveBeenCalledWith('Copied track "KICK" (2 notes)', 'success')
        })

        it('Paste tracks is disabled when clipboard has no track', () => {
            setupCmd()
            openMenu()

            const paste = menuItem('Paste tracks')
            expect(paste.disabled).toBe(true)
            paste.click()
            expect(serviceRegistry.cmd.pasteTrack).not.toHaveBeenCalled()
        })

        it('Paste tracks is disabled when clipboard holds a step', () => {
            setupCmd()
            panel.container.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
            )
            panel.container.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'c',
                    code: 'KeyC',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true,
                }),
            )
            expect(panel.clipboard.type).toBe('step')

            openMenu()

            expect(menuItem('Paste tracks').disabled).toBe(true)
        })

        it('Paste tracks inserts the clipboard track after the context track', () => {
            setupCmd()
            const pattern = appState.patterns[0]
            openMenu()
            clickItem('Copy track')
            vi.clearAllMocks()

            openMenu()
            expect(menuItem('Paste tracks').disabled).toBe(false)
            clickItem('Paste tracks')

            expect(serviceRegistry.cmd.pasteTrack).toHaveBeenCalled()
            const tracksAfter = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)
            expect(tracksAfter).toHaveLength(2)
            expect(tracksAfter[1].name).toContain('KICK')
            expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Pasted track "KICK copy"'), 'success')
        })

        it('Duplicate track inserts a clone without touching the clipboard', () => {
            setupCmd()
            const pattern = appState.patterns[0]

            openMenu()
            clickItem('Duplicate track')

            expect(serviceRegistry.cmd.pasteTrack).toHaveBeenCalledWith(
                pattern,
                1,
                expect.objectContaining({ name: 'KICK' }),
            )
            const tracksAfter = Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)
            expect(tracksAfter).toHaveLength(2)
            expect(tracksAfter[1].name).toContain('KICK')
            expect(panel.clipboard).toBeNull()
            expect(showToast).toHaveBeenCalledWith(
                expect.stringContaining('Duplicated track as "KICK copy"'),
                'success',
            )
        })

        it('Delete track removes the track and shows toast', () => {
            setupCmd()
            appState.patterns[0].tracks = {
                T1: { name: 'KICK', nbBeats: 1, stepsPerBeat: 4, notes: [] },
                T2: { name: 'SNARE', nbBeats: 1, stepsPerBeat: 4, notes: [] },
            }
            panel.sync()

            openMenu(document.querySelectorAll('.pp-track:not(.pp-master-track)')[0])
            clickItem('Delete track')

            expect(serviceRegistry.cmd.removeTrack).toHaveBeenCalledWith(appState.patterns[0], 0)
            expect(showToast).toHaveBeenCalledWith('Track deleted', 'success')
        })

        it('Delete track on last track shows warning and does not call removeTrack', () => {
            setupCmd()
            openMenu()
            clickItem('Delete track')

            expect(serviceRegistry.cmd.removeTrack).not.toHaveBeenCalled()
            expect(showToast).toHaveBeenCalledWith('Cannot delete the last track', 'warning')
        })

        it('Randomize calls cmd.randomizeTrack for the context track', () => {
            setupCmd()
            const track = appState.patterns[0].tracks['T1']

            openMenu()
            clickItem('Randomize')

            expect(serviceRegistry.cmd.randomizeTrack).toHaveBeenCalledWith(track, appState.patterns[0])
            expect(showToast).toHaveBeenCalledWith('Randomized "KICK"', 'success')
            expect(serviceRegistry.audioEngine.invalidateCache).toHaveBeenCalled()
        })

        it('Clear notes empties the track notes', () => {
            setupCmd()
            const track = appState.patterns[0].tracks['T1']
            expect(track.notes).toHaveLength(2)

            openMenu()
            clickItem('Clear notes')

            expect(serviceRegistry.cmd.cleanTrack).toHaveBeenCalledWith(track)
            expect(track.notes).toHaveLength(0)
            expect(showToast).toHaveBeenCalledWith('Cleared notes on "KICK"', 'success')
            expect(document.querySelector('.pp-cell.filled')).toBeNull()
        })
    })
})
