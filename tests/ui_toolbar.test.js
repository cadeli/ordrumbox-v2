/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Toolbar from '../src/ui/toolbar.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'

describe('Toolbar UI Layout', () => {
    let toolbar

    beforeEach(() => {
        // Reset state
        appState.reset()
        soundRegistry.reset()
        
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

        expect(textContents).toContain('Start')
        expect(textContents).toContain('Auto Gen')
        expect(textContents).toContain('Clear')
        expect(textContents).toContain('Output')
        expect(textContents).toContain('Tools')
        
        // Check pagination arrows
        expect(textContents).toContain('◀')
        expect(textContents).toContain('▶')
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
