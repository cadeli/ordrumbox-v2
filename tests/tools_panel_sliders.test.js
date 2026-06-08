// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import ToolsPanel from '../src/ui/tools_panel.js'

function fireInput(el, value) {
    el.value = String(value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ToolsPanel — OrSlider integration (WAV loops)', () => {
    let toolsPanel

    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        document.body.innerHTML = ''

        toolsPanel = new ToolsPanel()
        toolsPanel.init()
        playbackEvents.dispatchToolsToggle(true)
    })

    it('renders the WAV loops slider inside the Export group', () => {
        const input = toolsPanel.container.querySelector('input[data-key="tp-wav-loops"]')
        expect(input).not.toBeNull()
        expect(input.type).toBe('range')
        expect(input.min).toBe('1')
        expect(input.max).toBe('32')
        expect(input.step).toBe('1')
        expect(input.value).toBe('1')

        const row = input.closest('.ne-row')
        const group = row.closest('.ne-group')
        expect(group.querySelector('.ne-group-label').textContent).toBe('Export')
        expect(row.querySelector('label').textContent).toBe('Loops')
    })

    it('displays the initial value as "1" and updates on input', () => {
        const input = toolsPanel.container.querySelector('input[data-key="tp-wav-loops"]')
        const span  = toolsPanel.container.querySelector('.ne-val[data-key="tp-wav-loops"]')
        expect(span.textContent).toBe('1')

        fireInput(input, 4)
        expect(span.textContent).toBe('4')
        expect(toolsPanel._wavLoops.getValue()).toBe(4)
    })

    it('keyboard arrow on the WAV loops slider increments the value', () => {
        const input = toolsPanel.container.querySelector('input[data-key="tp-wav-loops"]')
        input.focus()
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowRight', bubbles: true, cancelable: true,
        }))

        expect(parseInt(input.value, 10)).toBe(2)
        expect(toolsPanel._wavLoops.getValue()).toBe(2)
    })

    it('export MIDI reads the current value from the OrSlider', async () => {
        const input = toolsPanel.container.querySelector('input[data-key="tp-wav-loops"]')
        fireInput(input, 3)

        const pattern = { name: 'demo', tracks: [] }
        appState.patterns = [pattern]
        appState.selectedPatternNum = 0

        // Stub the dynamic import to avoid loading the MIDI exporter module
        const downloadMock = vi.fn()
        vi.doMock('../src/logic/midi/midi_exporter.js', () => ({
            default: class { download = downloadMock },
        }))

        await toolsPanel._exportMidi()

        expect(downloadMock).toHaveBeenCalledTimes(1)
        const opts = downloadMock.mock.calls[0][2]
        expect(opts.loops).toBe(3)
    })
})
