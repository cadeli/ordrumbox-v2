/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { initKeyboardShortcuts } from '../src/keyboard_shortcuts.js'
import { EVENTS } from '../src/core/events.js'
import { showToast } from '../src/core/notify.js'
import { getAutoGenerateService, getAutoAssignService } from '../src/state/service_loader.js'
import { logger } from '../src/core/logger.js'
import { downloadBlob } from '../src/core/download.js'

vi.mock('../src/core/notify.js', () => ({
    showToast: vi.fn(),
}))

vi.mock('../src/core/download.js', () => ({
    downloadBlob: vi.fn(),
}))

vi.mock('../src/state/service_loader.js', () => ({
    getService: vi.fn(),
    getAutoGenerateService: vi.fn(async () => ({ generatePattern: vi.fn() })),
    getAutoAssignService: vi.fn(async () => ({ autoAssignSounds: vi.fn() })),
    getMidiManagerService: vi.fn(),
    getHistoryService: vi.fn(),
}))

function fireKeydown(code, key = '', opts = {}) {
    const event = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...opts })
    document.dispatchEvent(event)
    return event
}

function fireKeydownOn(target, code, key = '') {
    const event = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    return event
}

async function flushAsyncShortcut() {
    for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('Keyboard shortcuts', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        appState.reset()
        serviceRegistry.reset()
        soundRegistry.reset()

        appState.patterns = [
            {
                name: 'P1',
                tracks: [
                    { name: 'KICK', mute: false },
                    { name: 'SNARE', mute: false },
                ],
            },
        ]
        appState.selectedPatternNum = 0
        appState.showVus = false

        serviceRegistry.seq = { toggleStartStop: vi.fn(), simpleBeep: vi.fn() }
        serviceRegistry.cmd = {
            setSelectedPatternNum: vi.fn(),
            setSelectedDrumkitNum: vi.fn(),
            toggleShowVus: vi.fn(() => {
                appState.showVus = !appState.showVus
            }),
            addPattern: vi.fn((name) => {
                const pattern = { name: name ?? `NewPat_${appState.patterns.length}`, tracks: [], bpm: 120, nbBeats: 4 }
                appState.patterns.push(pattern)
                return pattern
            }),
            resetPage: vi.fn(),
        }
        soundRegistry.drumkitList = [{ name: '8bits' }, { name: 'real' }]
    })

    beforeAll(() => {
        initKeyboardShortcuts()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('Digit1 toggles mute on track 0', () => {
        fireKeydown('Digit1')
        expect(appState.patterns[0].tracks[0].mute).toBe(true)
    })

    it('Digit1 emits trackParamChange and patternChange to refresh mute UI', async () => {
        const { playbackEvents } = await import('../src/state/playback_events.js')
        const trackParamSpy = vi.fn()
        const patternChangeSpy = vi.fn()
        playbackEvents.on(EVENTS.TRACK_PARAM_CHANGE, trackParamSpy)
        playbackEvents.on(EVENTS.PATTERN_CHANGE, patternChangeSpy)
        try {
            fireKeydown('Digit1')
            expect(trackParamSpy).toHaveBeenCalledWith(appState.patterns[0].tracks[0])
            expect(patternChangeSpy).toHaveBeenCalled()
        } finally {
            playbackEvents.off?.('trackParamChange', trackParamSpy)
            playbackEvents.off?.('patternChange', patternChangeSpy)
        }
    })

    it('Digit2 toggles mute on track 1', () => {
        fireKeydown('Digit2')
        expect(appState.patterns[0].tracks[1].mute).toBe(true)
    })

    it('Space calls seq.toggleStartStop', () => {
        fireKeydown('Space')
        expect(serviceRegistry.seq.toggleStartStop).toHaveBeenCalled()
    })

    it('KeyF calls cmd.setSelectedPatternNum', () => {
        fireKeydown('KeyF')
        expect(serviceRegistry.cmd.setSelectedPatternNum).toHaveBeenCalled()
    })

    it('KeyG calls cmd.setSelectedDrumkitNum', () => {
        fireKeydown('KeyG')
        expect(serviceRegistry.cmd.setSelectedDrumkitNum).toHaveBeenCalled()
    })

    it('KeyV toggles showVus', () => {
        expect(appState.showVus).toBe(false)
        fireKeydown('KeyV')
        expect(appState.showVus).toBe(true)
    })

    it('KeyQ calls seq.simpleBeep for track 0', () => {
        fireKeydown('KeyQ')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(0)
    })

    it('KeyW calls seq.simpleBeep for track 1', () => {
        fireKeydown('KeyW')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(1)
    })

    it('unknown code does nothing', () => {
        fireKeydown('F12')
        expect(serviceRegistry.seq.toggleStartStop).not.toHaveBeenCalled()
    })

    it('Digit9 for out-of-bounds track does nothing', () => {
        fireKeydown('Digit9')
        expect(serviceRegistry.seq.simpleBeep).not.toHaveBeenCalled()
    })

    it('Space works when key property is " "', () => {
        fireKeydown('Space', ' ')
        expect(serviceRegistry.seq.toggleStartStop).toHaveBeenCalled()
    })

    it('Digit3 through Digit8 toggle mute on respective tracks', () => {
        appState.patterns[0].tracks.push(
            { name: 'T3', mute: false },
            { name: 'T4', mute: false },
            { name: 'T5', mute: false },
            { name: 'T6', mute: false },
            { name: 'T7', mute: false },
            { name: 'T8', mute: false },
        )
        fireKeydown('Digit3')
        expect(appState.patterns[0].tracks[2].mute).toBe(true)
        fireKeydown('Digit8')
        expect(appState.patterns[0].tracks[7].mute).toBe(true)
    })

    it('KeyE previews track 2', () => {
        fireKeydown('KeyE')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(2)
    })

    it('KeyR previews track 3', () => {
        fireKeydown('KeyR')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(3)
    })

    it('KeyH converts tracks and shows success toast', async () => {
        serviceRegistry.patterns = { applyFlatNotes: vi.fn() }
        soundRegistry.generatedSounds = { BASS0: {}, SN: {} }

        fireKeydown('KeyH')
        await flushAsyncShortcut()

        const track = appState.patterns[0].tracks[0]
        expect(track.useSoftSynth).toBe(true)
        expect(track.useAutoAssignSound).toBe(false)
        expect(track.synthSoundKey).toBe('BASS0')
        expect(serviceRegistry.patterns.applyFlatNotes).toHaveBeenCalledWith(appState.patterns[0])
        expect(showToast).toHaveBeenCalledWith('All tracks converted to generated sounds', 'success')
    })

    it('KeyH shows info toast when no pattern is selected', async () => {
        appState.patterns = []
        serviceRegistry.patterns = { applyFlatNotes: vi.fn() }

        fireKeydown('KeyH')
        await flushAsyncShortcut()

        expect(showToast).toHaveBeenCalledWith('No pattern selected', 'info')
        expect(serviceRegistry.patterns.applyFlatNotes).not.toHaveBeenCalled()
    })

    it('KeyH shows error toast when generated sounds fail to load', async () => {
        serviceRegistry.patterns = { applyFlatNotes: vi.fn() }
        serviceRegistry.resourcesLoader = {
            loadGeneratedSounds: vi.fn(() => Promise.reject(new Error('boom'))),
        }
        soundRegistry.generatedSounds = {}

        fireKeydown('KeyH')
        await flushAsyncShortcut()

        expect(showToast).toHaveBeenCalledWith('Failed to load generated sounds', 'error')
        expect(serviceRegistry.patterns.applyFlatNotes).not.toHaveBeenCalled()
    })

    // ── KeyB / KeyJ / KeyK / KeyD ─────────────────────────────────

    it('KeyB triggers auto-generate pattern', async () => {
        const mockGen = { generatePattern: vi.fn() }
        getAutoGenerateService.mockImplementation(async () => mockGen)

        fireKeydown('KeyB')
        await flushAsyncShortcut()

        expect(getAutoGenerateService).toHaveBeenCalled()
        expect(mockGen.generatePattern).toHaveBeenCalled()
    })

    it('plain KeyS does nothing (shortcut removed)', () => {
        const infoSpy = vi.spyOn(logger, 'info')

        fireKeydown('KeyS')

        expect(infoSpy).not.toHaveBeenCalled()
        expect(downloadBlob).not.toHaveBeenCalled()
        infoSpy.mockRestore()
    })

    it('KeyJ auto-assigns all tracks', async () => {
        serviceRegistry.patterns = { applyFlatNotes: vi.fn() }
        const autoAssign = { autoAssignSounds: vi.fn() }
        getAutoAssignService.mockResolvedValueOnce(autoAssign)

        fireKeydown('KeyJ')
        await flushAsyncShortcut()

        const track = appState.patterns[0].tracks[0]
        expect(track.useAutoAssignSound).toBe(true)
        expect(track.useSoftSynth).toBe(false)
        expect(autoAssign.autoAssignSounds).toHaveBeenCalledWith(appState.patterns[0])
        expect(serviceRegistry.patterns.applyFlatNotes).toHaveBeenCalledWith(appState.patterns[0])
        expect(showToast).toHaveBeenCalledWith('All tracks auto-assigned', 'success')
    })

    it('KeyJ no-ops when no pattern is selected', async () => {
        appState.patterns = []
        serviceRegistry.patterns = { applyFlatNotes: vi.fn() }

        fireKeydown('KeyJ')
        await flushAsyncShortcut()

        expect(serviceRegistry.patterns.applyFlatNotes).not.toHaveBeenCalled()
        expect(showToast).not.toHaveBeenCalledWith('All tracks auto-assigned', 'success')
    })

    it('KeyK assigns a random sample to all tracks', async () => {
        serviceRegistry.patterns = { applyFlatNotes: vi.fn() }
        soundRegistry.sounds = { 'kick.wav': {}, 'snare.wav': {} }

        fireKeydown('KeyK')

        const tracks = appState.patterns[0].tracks
        for (const track of tracks) {
            expect(track.useAutoAssignSound).toBe(false)
            expect(track.useSoftSynth).toBe(false)
            expect(['kick.wav', 'snare.wav']).toContain(track.soundId)
        }
        expect(serviceRegistry.patterns.applyFlatNotes).toHaveBeenCalledWith(appState.patterns[0])
        expect(showToast).toHaveBeenCalledWith('Random samples assigned', 'success')
    })

    it('KeyK shows error toast when no samples are loaded', async () => {
        serviceRegistry.patterns = { applyFlatNotes: vi.fn() }
        soundRegistry.sounds = {}

        fireKeydown('KeyK')

        expect(showToast).toHaveBeenCalledWith('No samples loaded', 'error')
        expect(serviceRegistry.patterns.applyFlatNotes).not.toHaveBeenCalled()
    })

    it('KeyK no-ops when no pattern is selected', async () => {
        appState.patterns = []
        serviceRegistry.patterns = { applyFlatNotes: vi.fn() }

        fireKeydown('KeyK')

        expect(showToast).not.toHaveBeenCalledWith('Random samples assigned', 'success')
    })

    it('KeyD shows info toast when selected track does not use a generated sound', async () => {
        fireKeydown('KeyD')

        expect(showToast).toHaveBeenCalledWith('Current track does not use a generated sound', 'info')
    })

    it('KeyD shows info toast when no track is selected', async () => {
        appState.selectedTrackNum = 99

        fireKeydown('KeyD')

        expect(showToast).toHaveBeenCalledWith('No track selected', 'info')
    })

    it('KeyD shows error toast when generated sound is missing from registry', async () => {
        const track = appState.patterns[0].tracks[0]
        track.useSoftSynth = true
        track.synthSoundKey = 'MISSING_KEY'
        soundRegistry.generatedSounds = {}

        fireKeydown('KeyD')

        expect(showToast).toHaveBeenCalledWith('Generated sound not found', 'error')
    })

    it('KeyD logs the generated sound on success', async () => {
        const infoSpy = vi.spyOn(logger, 'info')
        const track = appState.patterns[0].tracks[0]
        track.useSoftSynth = true
        track.synthSoundKey = 'BASS0'
        const sound = { name: 'BASS0' }
        soundRegistry.generatedSounds = { BASS0: sound }

        fireKeydown('KeyD')

        expect(infoSpy).toHaveBeenCalled()
        const logged = infoSpy.mock.calls.at(-1)?.[1] ?? ''
        expect(String(logged)).toBe(JSON.stringify(sound, null, 2))
        infoSpy.mockRestore()
    })

    // ── Preview keys KeyT / KeyY / KeyU / KeyI / KeyO / KeyP ──────

    it('KeyT / KeyY / KeyU / KeyI / KeyO / KeyP preview tracks 4-9', () => {
        fireKeydown('KeyT')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(4)
        fireKeydown('KeyY')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(5)
        fireKeydown('KeyU')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(6)
        fireKeydown('KeyI')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(7)
        fireKeydown('KeyO')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(8)
        fireKeydown('KeyP')
        expect(serviceRegistry.seq.simpleBeep).toHaveBeenCalledWith(9)
    })

    // ── Ctrl+S / Ctrl+N / Ctrl+D global pattern shortcuts ─────────

    it('Ctrl+S exports the current pattern as JSON', async () => {
        fireKeydown('KeyS', 's', { ctrlKey: true })
        await flushAsyncShortcut()

        expect(downloadBlob).toHaveBeenCalledTimes(1)
        const [blob, filename] = downloadBlob.mock.calls[0]
        expect(filename).toBe('ordrumbox-P1.json')
        expect(blob.type).toBe('application/json')
        const text = await blob.text()
        const data = JSON.parse(text)
        expect(data.name).toBe('P1')
    })

    it('Ctrl+S preventDefault', () => {
        const event = fireKeydown('KeyS', 's', { ctrlKey: true })
        expect(event.defaultPrevented).toBe(true)
    })

    it('Ctrl+S shows info toast when no pattern is selected', () => {
        appState.patterns = []
        appState.selectedPatternNum = 0

        fireKeydown('KeyS', 's', { ctrlKey: true })

        expect(showToast).toHaveBeenCalledWith('No pattern selected', 'info')
        expect(downloadBlob).not.toHaveBeenCalled()
    })

    it('Cmd+S on mac metaKey also exports', async () => {
        fireKeydown('KeyS', 's', { metaKey: true })
        await flushAsyncShortcut()
        expect(downloadBlob).toHaveBeenCalledTimes(1)
    })

    it('Ctrl+N adds a new pattern', async () => {
        fireKeydown('KeyN', 'n', { ctrlKey: true })
        await flushAsyncShortcut()

        expect(serviceRegistry.cmd.addPattern).toHaveBeenCalled()
        expect(serviceRegistry.cmd.setSelectedPatternNum).toHaveBeenCalledWith(1)
        expect(serviceRegistry.cmd.resetPage).toHaveBeenCalled()
        expect(appState.patterns).toHaveLength(2)
        expect(showToast).toHaveBeenCalledWith('Pattern added', 'success')
    })

    it('Ctrl+N preventDefault', () => {
        const event = fireKeydown('KeyN', 'n', { ctrlKey: true })
        expect(event.defaultPrevented).toBe(true)
    })

    it('Ctrl+D duplicates the current pattern', async () => {
        appState.patterns[0].tracks.push({ name: 'HIHAT', mute: false })

        fireKeydown('KeyD', 'd', { ctrlKey: true })
        await flushAsyncShortcut()

        expect(serviceRegistry.cmd.addPattern).toHaveBeenCalledWith('P1 copy')
        expect(appState.patterns).toHaveLength(2)
        expect(appState.patterns[1].name).toBe('P1 copy')
        expect(appState.patterns[1].tracks).toHaveLength(3)
        expect(serviceRegistry.cmd.setSelectedPatternNum).toHaveBeenCalledWith(1)
        expect(showToast).toHaveBeenCalledWith('Pattern duplicated', 'success')
    })

    it('Ctrl+D preventDefault', () => {
        const event = fireKeydown('KeyD', 'd', { ctrlKey: true })
        expect(event.defaultPrevented).toBe(true)
    })

    it('plain KeyD still exports track sound (not duplicate)', () => {
        fireKeydown('KeyD')
        expect(serviceRegistry.cmd.addPattern).not.toHaveBeenCalled()
        expect(showToast).toHaveBeenCalledWith('Current track does not use a generated sound', 'info')
    })

    // ── INPUT / TEXTAREA guards ───────────────────────────────────

    it('ignores shortcuts when focus is in a text INPUT', () => {
        const input = document.createElement('input')
        input.type = 'text'
        document.body.appendChild(input)

        fireKeydownOn(input, 'Space')

        expect(serviceRegistry.seq.toggleStartStop).not.toHaveBeenCalled()
        input.remove()
    })

    it('ignores shortcuts when focus is in a TEXTAREA', () => {
        const textarea = document.createElement('textarea')
        document.body.appendChild(textarea)

        fireKeydownOn(textarea, 'Space')

        expect(serviceRegistry.seq.toggleStartStop).not.toHaveBeenCalled()
        textarea.remove()
    })

    it('ignores shortcuts when focus is in a contenteditable element', () => {
        const div = document.createElement('div')
        div.setAttribute('contenteditable', 'true')
        Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true })
        document.body.appendChild(div)

        fireKeydownOn(div, 'Space')

        expect(serviceRegistry.seq.toggleStartStop).not.toHaveBeenCalled()
        div.remove()
    })

    it('still handles shortcuts when focus is in a range INPUT', () => {
        const input = document.createElement('input')
        input.type = 'range'
        document.body.appendChild(input)

        fireKeydownOn(input, 'Space')

        expect(serviceRegistry.seq.toggleStartStop).toHaveBeenCalled()
        input.remove()
    })

    it('Space keydown calls preventDefault', () => {
        const event = fireKeydown('Space')
        expect(event.defaultPrevented).toBe(true)
    })
})
