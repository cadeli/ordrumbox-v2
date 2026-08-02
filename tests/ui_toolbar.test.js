/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Toolbar from '../src/ui/toolbar.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'

describe('Toolbar UI Layout', () => {
    let toolbar

    beforeEach(() => {
        // Reset state
        appState.reset()
        soundRegistry.reset()
        
        // Mock serviceRegistry dependencies
        serviceRegistry.mfSeq = {
            toggleStartStop: vi.fn(),
            setBpm: vi.fn()
        }
        serviceRegistry.mfCmd = {
            setSelectedPatternNum: vi.fn(),
            setSelectedDrumkitNum: vi.fn(),
            cleanPattern: vi.fn()
        }
        serviceRegistry.mfPatterns = {
            computeFlatNotesFromPattern: vi.fn()
        }

        // Clear body
        document.body.innerHTML = ''

        toolbar = new Toolbar()
        toolbar.init()
    })

    it('renders the toolbar container at the root level', () => {
        const tb = document.getElementById('tb')
        expect(tb).not.toBeNull()
        expect(tb.parentElement).toBe(document.body)
    })

    it('contains all essential control buttons', () => {
        const tb = document.getElementById('tb')
        const buttons = Array.from(tb.querySelectorAll('button'))
        const classes = buttons.map(b => b.className)
        const textContents = buttons.map(b => b.textContent)

        expect(textContents.some(t => t.includes('BPM')) || document.querySelector('.tb-label')?.textContent === 'BPM').toBe(true)
        expect(classes).toContain('tb-start')
        expect(classes).toContain('tb-clear')
        expect(classes).toContain('tb-output')
        expect(classes).toContain('tb-tools')
        expect(classes).toContain('tb-about')

        // Check pagination arrows
        expect(textContents).toContain('◀')
        expect(textContents).toContain('▶')

        // Check generation buttons
        expect(textContents).toContain('Drum')
        expect(textContents).toContain('Bass')
        expect(textContents).toContain('Chords')
    })

    it('toggles the BPM panel visibility when clicked', () => {
        const toggle = document.querySelector('.tb-bpm-toggle')
        const panel = document.querySelector('.tb-bpm-panel')
        
        // Initially should not have "open" class
        expect(panel.classList.contains('open')).toBe(false)
        
        toggle.click()
        expect(panel.classList.contains('open')).toBe(true)
        
        toggle.click()
        expect(panel.classList.contains('open')).toBe(false)
    })

    it('updates BPM when the slider value changes', () => {
        const slider = document.querySelector('.tb-bpm-panel input[type="range"]')
        const valDisplay = document.querySelector('.tb-bpm-val')
        const toggle = document.querySelector('.tb-bpm-toggle')
        
        slider.value = '140'
        slider.dispatchEvent(new Event('input'))
        
        expect(valDisplay.textContent).toBe('140')
        expect(toggle.textContent).toBe('140')
        expect(serviceRegistry.mfSeq.setBpm).toHaveBeenCalledWith(140)
    })

    it('contains the pattern, drumkit and beats selectors', () => {
        const selects = document.querySelectorAll('#tb select')
        expect(selects.length).toBe(3)
        
        // Check labels associated with selects
        const labels = Array.from(document.querySelectorAll('#tb .tb-label')).map(l => l.textContent)
        expect(labels).toContain('Pattern')
        expect(labels).toContain('Drumkit')
        expect(labels).toContain('Beats')
    })

    it('shows the current page indicator', () => {
        const label = document.querySelector('.tb-page-label')
        expect(label).not.toBeNull()
        expect(label.textContent).toBe('1/1')
    })
})
