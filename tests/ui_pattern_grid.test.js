/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import PatternPanel from '../src/ui/pattern_panel.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'

describe('Pattern Panel UI Grid', () => {
    let panel

    beforeEach(() => {
        // Mock appState with a test pattern
        appState.reset()
        const testPattern = {
            name: 'Test Pattern',
            nbBeats: 2,
            bpm: 120,
            tracks: {
                'T1': {
                    name: 'KICK',
                    nbBeats: 1,
                    stepsPerBeat: 4,
                    loopAtStep: 3, // Loop point at index 2 (4th step of 1st beat)
                    notes: [
                        { beat: 0, beatStep: 0, pitch: 0, velocity: 1 }, // Main note
                        { beat: 0, beatStep: 1, pitch: 0, velocity: 0.8, retriggerNum: 3, rate: 1 } // Note with 2 ghost notes
                    ]
                }
            }
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
            })
        }

        const initialTrackEl = document.querySelector('.pp-track')
        const emptyCell = document.querySelector('.pp-cell[data-pos="3"]')
        expect(emptyCell.classList.contains('filled')).toBe(false)

        emptyCell.click()

        // Verify note was added and cell was updated in-place
        expect(emptyCell.classList.contains('filled')).toBe(true)
        expect(serviceRegistry.cmd.addNote).toHaveBeenCalledWith(
            appState.patterns[0].tracks['T1'], 0, 3
        )
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
})
