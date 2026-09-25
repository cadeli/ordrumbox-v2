// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

const downloadMock = vi.fn()
vi.mock('../src/logic/midi/midi_exporter.js', () => ({
    default: class {
        download = downloadMock
    },
}))

import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { showToast } from '../src/core/notify.js'
import { logger } from '../src/core/logger.js'
import { EVENTS } from '../src/core/events.js'
import ToolsPanel from '../src/ui/tools_panel.js'

vi.mock('../src/core/notify.js', () => ({
    showToast: vi.fn(),
}))

function makeToolsPanel() {
    global.window.innerWidth = 1200
    global.window.innerHeight = 800
    appState.reset()
    soundRegistry.reset()
    serviceRegistry.reset()
    document.body.innerHTML = ''
    const toolsPanel = new ToolsPanel()
    toolsPanel.init()
    playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
    return toolsPanel
}

describe('ExportSection MIDI branches', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        makeToolsPanel()
    })

    it('warns when no pattern is selected and does not download', async () => {
        appState.patterns = []
        appState.selectedPatternNum = 0

        const toolsPanel = makeToolsPanel()
        await toolsPanel.exportMidi()

        expect(showToast).toHaveBeenCalledWith('No pattern selected', 'warning')
        expect(downloadMock).not.toHaveBeenCalled()
    })

    it('downloads with filename derived from pattern name and loops from slider', async () => {
        const toolsPanel = makeToolsPanel()
        const input = toolsPanel.container.querySelector('input[data-key="tp-wav-loops"]')
        input.value = '3'
        input.dispatchEvent(new Event('input', { bubbles: true }))

        appState.patterns = [{ name: 'Groove', tracks: [] }]
        appState.selectedPatternNum = 0
        downloadMock.mockClear()

        await toolsPanel.exportMidi()

        expect(downloadMock).toHaveBeenCalledTimes(1)
        const [pattern, filename, options] = downloadMock.mock.calls[0]
        expect(pattern.name).toBe('Groove')
        expect(filename).toBe('ordrumbox-Groove.mid')
        expect(options).toEqual({ loops: 3 })
    })

    it('falls back to "pattern" in the filename when pattern.name is missing', async () => {
        const toolsPanel = makeToolsPanel()
        appState.patterns = [{ tracks: [] }]
        appState.selectedPatternNum = 0
        downloadMock.mockClear()

        await toolsPanel.exportMidi()

        expect(downloadMock.mock.calls[0][1]).toBe('ordrumbox-pattern.mid')
    })

    it('shows an error toast when download throws', async () => {
        // Expected failure path: silence the deliberate logger.error output.
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
        const toolsPanel = makeToolsPanel()
        appState.patterns = [{ name: 'Bad', tracks: [] }]
        appState.selectedPatternNum = 0
        downloadMock.mockImplementationOnce(() => {
            throw new Error('encode fail')
        })

        await toolsPanel.exportMidi()

        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('MIDI Export failed'), 'error')
        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })
})
