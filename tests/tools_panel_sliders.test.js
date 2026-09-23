// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

const downloadMock = vi.fn()
vi.mock('../src/logic/midi/midi_exporter.js', () => ({
    default: class {
        download = downloadMock
    },
}))

import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import { EVENTS } from '../src/core/events.js'

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
        playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
    })

    it('renders the WAV loops slider inside the Export tab', () => {
        const input = toolsPanel.container.querySelector('input[data-key="tp-wav-loops"]')
        expect(input).not.toBeNull()
        expect(input.type).toBe('range')
        expect(input.min).toBe('1')
        expect(input.max).toBe('32')
        expect(input.step).toBe('1')
        expect(input.value).toBe('1')

        const panel = input.closest('.ne-tab-panel')
        expect(panel.dataset.tabPanel).toBe('export')
        const row = input.closest('.ne-row')
        expect(row.querySelector('label').textContent).toBe('Loops')
    })

    it('displays the initial value as "1" and updates on input', () => {
        const input = toolsPanel.container.querySelector('input[data-key="tp-wav-loops"]')
        const span = toolsPanel.container.querySelector('.ne-val[data-key="tp-wav-loops"]')
        expect(span.textContent).toBe('1')

        fireInput(input, 4)
        expect(span.textContent).toBe('4')
        expect(toolsPanel._wavLoops.getValue()).toBe(4)
    })

    it('setValue on the WAV loops slider updates the value', () => {
        toolsPanel._wavLoops.setValue(2, true)
        expect(toolsPanel._wavLoops.getValue()).toBe(2)
    })

    it('export MIDI reads the current value from the OrSlider', async () => {
        const input = toolsPanel.container.querySelector('input[data-key="tp-wav-loops"]')
        fireInput(input, 3)

        const pattern = { name: 'demo', tracks: [] }
        appState.patterns = [pattern]
        appState.selectedPatternNum = 0

        downloadMock.mockClear()
        await toolsPanel.exportMidi()

        expect(downloadMock).toHaveBeenCalledTimes(1)
        const opts = downloadMock.mock.calls[0][2]
        expect(opts.loops).toBe(3)
    })
})
