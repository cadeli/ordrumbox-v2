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
        const trackNames = document.querySelectorAll('.pp-track-name')
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
        const emptyMsg = document.querySelector('.pp-empty')
        expect(emptyMsg).not.toBeNull()
        expect(emptyMsg.textContent).toContain('Empty Pattern')
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
})
