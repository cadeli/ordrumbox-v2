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
        const textContents = buttons.map(b => b.textContent)

        expect(textContents.some(t => t.includes('BPM'))).toBe(true)
        expect(textContents).toContain('Start')
        expect(textContents).toContain('Auto Gen')
        expect(textContents).toContain('Clear')
        expect(textContents).toContain('Output')
        expect(textContents).toContain('Tools')
        
        // Check pagination arrows
        expect(textContents).toContain('◀')
        expect(textContents).toContain('▶')
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
        expect(toggle.textContent).toBe('BPM 140')
        expect(serviceRegistry.mfSeq.setBpm).toHaveBeenCalledWith(140)
    })

    it('contains the pattern and drumkit selectors', () => {
        const selects = document.querySelectorAll('#tb select')
        expect(selects.length).toBe(2)
        
        // Check labels associated with selects
        const labels = Array.from(document.querySelectorAll('#tb label')).map(l => l.textContent)
        expect(labels).toContain('Pattern:')
        expect(labels).toContain('Kit:')
    })

    it('shows the current page indicator', () => {
        const label = document.querySelector('.tb-page-label')
        expect(label).not.toBeNull()
        expect(label.textContent).toBe('P1')
    })
})
