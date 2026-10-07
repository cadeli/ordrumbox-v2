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
import { getAutoGeneratorService, getAutoAssignService } from '../src/state/service_loader.js'
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
    getAutoGeneratorService: vi.fn(async () => ({ generatePattern: vi.fn() })),
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

/**
 * Let an async shortcut handler settle.
 *
 * vi.runAllTimersAsync() drains the fake timers *and* the microtasks queued by
 * them, so this does not depend on how many `await`s a handler chain happens to
 * have — a hand-rolled "10 microtasks" loop broke silently when one was added.
 */
async function flushAsyncShortcut() {
    await vi.runAllTimersAsync()
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
        appState.selectedPatternIdx = 0
        appState.showVus = false

        serviceRegistry.seq = { toggleStartStop: vi.fn(), simpleBeep: vi.fn() }
        serviceRegistry.cmd = {
            setSelectedPatternIdx: vi.fn(),
            setSelectedDrumkitIdx: vi.fn(),
            toggleShowVus: vi.fn(() => {
                appState.showVus = !appState.showVus
            }),
            addPattern: vi.fn((name) => {
                const pattern = {
                    name: name ?? `NewPat_${appState.patterns.length}`,
                    tracks: [],
                    bpm: 120,
                    beatCount: 4,
                }
                appState.patterns.push(pattern)
                return pattern
            }),
            removePattern: vi.fn((idx) => {
                appState.patterns.splice(idx, 1)
                return true
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
        const { playbackEvents } = await import('../src/state/event_bus.js')
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

    it('KeyF calls cmd.setSelectedPatternIdx', () => {
        fireKeydown('KeyF')
        expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalled()
    })

    it('KeyF confirms the new pattern with a toast', () => {
        fireKeydown('KeyF')
        expect(showToast).toHaveBeenCalledWith('Pattern "P1" selected', 'success')
    })

    it('KeyF shows info toast when there is no pattern', () => {
        appState.patterns = []
        fireKeydown('KeyF')
        expect(serviceRegistry.cmd.setSelectedPatternIdx).not.toHaveBeenCalled()
        expect(showToast).toHaveBeenCalledWith('No pattern selected', 'info')
    })

    it('KeyG calls cmd.setSelectedDrumkitIdx', () => {
        fireKeydown('KeyG')
        expect(serviceRegistry.cmd.setSelectedDrumkitIdx).toHaveBeenCalled()
    })

    it('KeyG confirms the new drumkit with a toast', () => {
        fireKeydown('KeyG')
        expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/^Drumkit "(8bits|real)" selected$/), 'success')
    })

    it('KeyG shows info toast when no drumkit is loaded', () => {
        soundRegistry.drumkitList = []
        fireKeydown('KeyG')
        expect(serviceRegistry.cmd.setSelectedDrumkitIdx).not.toHaveBeenCalled()
        expect(showToast).toHaveBeenCalledWith('No drumkit available', 'info')
    })

    it('KeyV toggles showVus', () => {
        expect(appState.showVus).toBe(false)
        fireKeydown('KeyV')
        expect(appState.showVus).toBe(true)
        expect(showToast).toHaveBeenCalledWith('VU meters on', 'info')
    })

    it('KeyV toasts the off state when toggling back', () => {
        appState.showVus = true
        fireKeydown('KeyV')
        expect(appState.showVus).toBe(false)
        expect(showToast).toHaveBeenCalledWith('VU meters off', 'info')
    })

    it('KeyC cycles the color scheme 1 → 2 → 3 → 1', () => {
        expect(soundRegistry.settings.colorScheme).toBe(1)
        fireKeydown('KeyC')
        expect(soundRegistry.settings.colorScheme).toBe(2)
        expect(showToast).toHaveBeenCalledWith('Color scheme 2/3', 'info')
        fireKeydown('KeyC')
        expect(soundRegistry.settings.colorScheme).toBe(3)
        expect(showToast).toHaveBeenCalledWith('Color scheme 3/3', 'info')
        fireKeydown('KeyC')
        expect(soundRegistry.settings.colorScheme).toBe(1)
        expect(showToast).toHaveBeenCalledWith('Color scheme 1/3', 'info')
    })

    it('KeyC emits COLOR_SCHEME_CHANGE and persists the new scheme', async () => {
        const { playbackEvents } = await import('../src/state/event_bus.js')
        const saveSpy = vi.fn()
        serviceRegistry.resourcesLoader = { saveSettings: saveSpy }
        const schemeSpy = vi.fn()
        playbackEvents.on(EVENTS.COLOR_SCHEME_CHANGE, schemeSpy)
        try {
            fireKeydown('KeyC')
            expect(schemeSpy).toHaveBeenCalledWith(2)
            expect(saveSpy).toHaveBeenCalled()
        } finally {
            playbackEvents.off?.(EVENTS.COLOR_SCHEME_CHANGE, schemeSpy)
        }
    })

    it('KeyC is ignored while typing in a text INPUT', () => {
        const input = document.createElement('input')
        input.type = 'text'
        document.body.appendChild(input)

        fireKeydownOn(input, 'KeyC')

        expect(soundRegistry.settings.colorScheme).toBe(1)
        input.remove()
    })

    it('Ctrl+C does not cycle the color scheme (copy shortcut wins)', () => {
        fireKeydown('KeyC', 'c', { ctrlKey: true })

        expect(soundRegistry.settings.colorScheme).toBe(1)
        expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('Color scheme'), 'info')
    })

    it('Ctrl+V does not toggle the VU meters (modifier guard)', () => {
        fireKeydown('KeyV', 'v', { ctrlKey: true })

        expect(serviceRegistry.cmd.toggleShowVus).not.toHaveBeenCalled()
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
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }
        soundRegistry.generatedSounds = { BASS0: {}, SN: {} }

        fireKeydown('KeyH')
        await flushAsyncShortcut()

        const track = appState.patterns[0].tracks[0]
        expect(track.useSoftSynth).toBe(true)
        expect(track.useAutoAssignSound).toBe(false)
        expect(track.synthSoundKey).toBe('BASS0')
        expect(serviceRegistry.flatNotes.applyFlatNotes).toHaveBeenCalledWith(appState.patterns[0])
        expect(showToast).toHaveBeenCalledWith('All tracks converted to generated sounds', 'success')
    })

    // A type with no patch in SYNTH_SOUND_MAP (COWBELL, CLAP, CRASH…) used to be
    // left on its sample with a toast listing it; the expected behaviour is a
    // RANDOM patch so the conversion actually converts every track.
    it('KeyH gives a random synth patch to a track whose type has none', async () => {
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }
        soundRegistry.generatedSounds = { BASS0: {}, PIANO: {}, RANDOM_A: {} }
        const pattern = appState.patterns[0]
        pattern.tracks = { COWBELL: { name: 'COWBELL', useSoftSynth: false } }

        fireKeydown('KeyH')
        await flushAsyncShortcut()

        const track = pattern.tracks.COWBELL
        expect(track.useSoftSynth).toBe(true)
        expect(track.synthSoundKey).toBeTruthy()
        // never BASS1-ish defaulting: the key must be one of the loaded patches
        expect(Object.keys(soundRegistry.generatedSounds)).toContain(track.synthSoundKey)
        expect(track.synthSoundKey).not.toBe('BASS1')
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('COWBELL→'), 'info')
    })

    it('KeyH keeps the mapped patch when the type has one', async () => {
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }
        soundRegistry.generatedSounds = { BASS0: {}, SN: {}, RANDOM_A: {} }
        const pattern = appState.patterns[0]
        pattern.tracks = { KICK: { name: 'KICK', useSoftSynth: false } }

        fireKeydown('KeyH')
        await flushAsyncShortcut()

        expect(pattern.tracks.KICK.synthSoundKey).toBe('BASS0')
        expect(showToast).toHaveBeenCalledWith('All tracks converted to generated sounds', 'success')
    })

    it('KeyH reassigns a mapped patch that is not loaded any more', async () => {
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }
        // SYNTH_SOUND_MAP maps HAT to CHH_SYNTH, which is NOT loaded here
        soundRegistry.generatedSounds = { BASS0: {}, RANDOM_A: {} }
        const pattern = appState.patterns[0]
        pattern.tracks = { CHH: { name: 'CHH', useSoftSynth: false } }

        fireKeydown('KeyH')
        await flushAsyncShortcut()

        expect(pattern.tracks.CHH.synthSoundKey).toBeTruthy()
        expect(Object.keys(soundRegistry.generatedSounds)).toContain(pattern.tracks.CHH.synthSoundKey)
    })

    it('KeyH shows info toast when no pattern is selected', async () => {
        appState.patterns = []
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }

        fireKeydown('KeyH')
        await flushAsyncShortcut()

        expect(showToast).toHaveBeenCalledWith('No pattern selected', 'info')
        expect(serviceRegistry.flatNotes.applyFlatNotes).not.toHaveBeenCalled()
    })

    it('KeyH shows error toast when generated sounds fail to load', async () => {
        // Expected failure path: silence the deliberate logger.error output.
        const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }
        serviceRegistry.resourcesLoader = {
            loadGeneratedSounds: vi.fn(() => Promise.reject(new Error('boom'))),
        }
        soundRegistry.generatedSounds = {}

        fireKeydown('KeyH')
        await flushAsyncShortcut()

        expect(showToast).toHaveBeenCalledWith('Failed to load generated sounds', 'error')
        expect(serviceRegistry.flatNotes.applyFlatNotes).not.toHaveBeenCalled()
        expect(errorSpy).toHaveBeenCalled()
    })

    // ── KeyB / KeyJ / KeyK ─────────────────────────────────────────

    it('KeyB creates a new pattern and selects it before generating', async () => {
        const mockGen = {
            generatePattern: vi.fn(async () => appState.patterns[appState.patterns.length - 1]),
        }
        getAutoGeneratorService.mockImplementation(async () => mockGen)

        fireKeydown('KeyB')
        await flushAsyncShortcut()

        expect(serviceRegistry.cmd.addPattern).toHaveBeenCalledTimes(1)
        expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalledWith(1)
        expect(serviceRegistry.cmd.resetPage).toHaveBeenCalled()
        expect(appState.patterns).toHaveLength(2)
        expect(mockGen.generatePattern).toHaveBeenCalledTimes(1)
        expect(showToast).toHaveBeenCalledWith('Pattern "NewPat_1" generated', 'success')

        // the pattern is created first, generation happens afterwards
        const createdOrder = serviceRegistry.cmd.addPattern.mock.invocationCallOrder[0]
        const generatedOrder = mockGen.generatePattern.mock.invocationCallOrder[0]
        expect(createdOrder).toBeLessThan(generatedOrder)
    })

    it('KeyB does not overwrite the previously selected pattern', async () => {
        const previousPattern = appState.patterns[0]
        previousPattern.tracks.push({ name: 'KICK', mute: false })
        const mockGen = {
            generatePattern: vi.fn(async () => appState.patterns[appState.patterns.length - 1]),
        }
        getAutoGeneratorService.mockImplementation(async () => mockGen)

        fireKeydown('KeyB')
        await flushAsyncShortcut()

        expect(appState.patterns[0]).toBe(previousPattern)
        expect(appState.patterns[0].tracks).toHaveLength(3)
        expect(appState.patterns[1].tracks).toHaveLength(0)
    })

    it('KeyB removes the new pattern when generation fails', async () => {
        getAutoGeneratorService.mockImplementation(async () => ({ generatePattern: vi.fn(async () => null) }))

        fireKeydown('KeyB')
        await flushAsyncShortcut()

        expect(showToast).toHaveBeenCalledWith('Pattern generation failed', 'error')
        expect(serviceRegistry.cmd.removePattern).toHaveBeenCalledWith(1)
        expect(appState.patterns).toHaveLength(1)
    })

    it('plain KeyS does nothing (shortcut removed)', () => {
        const infoSpy = vi.spyOn(logger, 'info')

        fireKeydown('KeyS')

        expect(infoSpy).not.toHaveBeenCalled()
        expect(downloadBlob).not.toHaveBeenCalled()
        infoSpy.mockRestore()
    })

    it('KeyJ auto-assigns all tracks', async () => {
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }
        const autoAssign = { autoAssignSounds: vi.fn() }
        getAutoAssignService.mockResolvedValueOnce(autoAssign)

        fireKeydown('KeyJ')
        await flushAsyncShortcut()

        const track = appState.patterns[0].tracks[0]
        expect(track.useAutoAssignSound).toBe(true)
        expect(track.useSoftSynth).toBe(false)
        expect(autoAssign.autoAssignSounds).toHaveBeenCalledWith(appState.patterns[0])
        expect(serviceRegistry.flatNotes.applyFlatNotes).toHaveBeenCalledWith(appState.patterns[0])
        expect(showToast).toHaveBeenCalledWith('All tracks auto-assigned', 'success')
    })

    it('KeyJ no-ops when no pattern is selected', async () => {
        appState.patterns = []
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }

        fireKeydown('KeyJ')
        await flushAsyncShortcut()

        expect(serviceRegistry.flatNotes.applyFlatNotes).not.toHaveBeenCalled()
        expect(showToast).not.toHaveBeenCalledWith('All tracks auto-assigned', 'success')
        expect(showToast).toHaveBeenCalledWith('No pattern selected', 'info')
    })

    it('KeyK assigns a random sample to all tracks', async () => {
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }
        soundRegistry.sounds = { 'kick.wav': {}, 'snare.wav': {} }

        fireKeydown('KeyK')

        const tracks = appState.patterns[0].tracks
        for (const track of tracks) {
            expect(track.useAutoAssignSound).toBe(false)
            expect(track.useSoftSynth).toBe(false)
            expect(['kick.wav', 'snare.wav']).toContain(track.sampleId)
        }
        expect(serviceRegistry.flatNotes.applyFlatNotes).toHaveBeenCalledWith(appState.patterns[0])
        expect(showToast).toHaveBeenCalledWith('Random samples assigned', 'success')
    })

    it('KeyK shows error toast when no samples are loaded', async () => {
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }
        soundRegistry.sounds = {}

        fireKeydown('KeyK')

        expect(showToast).toHaveBeenCalledWith('No samples loaded', 'error')
        expect(serviceRegistry.flatNotes.applyFlatNotes).not.toHaveBeenCalled()
    })

    it('KeyK no-ops when no pattern is selected', async () => {
        appState.patterns = []
        serviceRegistry.flatNotes = { applyFlatNotes: vi.fn() }

        fireKeydown('KeyK')

        expect(showToast).not.toHaveBeenCalledWith('Random samples assigned', 'success')
        expect(showToast).toHaveBeenCalledWith('No pattern selected', 'info')
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
        expect(showToast).toHaveBeenCalledWith('Pattern "P1" exported', 'success')
    })

    it('Ctrl+S preventDefault', () => {
        const event = fireKeydown('KeyS', 's', { ctrlKey: true })
        expect(event.defaultPrevented).toBe(true)
    })

    it('Ctrl+S shows info toast when no pattern is selected', () => {
        appState.patterns = []
        appState.selectedPatternIdx = 0

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
        expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalledWith(1)
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
        expect(serviceRegistry.cmd.setSelectedPatternIdx).toHaveBeenCalledWith(1)
        expect(showToast).toHaveBeenCalledWith('Pattern duplicated', 'success')
    })

    it('Ctrl+D preventDefault', () => {
        const event = fireKeydown('KeyD', 'd', { ctrlKey: true })
        expect(event.defaultPrevented).toBe(true)
    })

    it('plain KeyD does nothing (shortcut removed)', () => {
        fireKeydown('KeyD')
        expect(serviceRegistry.cmd.addPattern).not.toHaveBeenCalled()
        expect(showToast).not.toHaveBeenCalledWith('Current track does not use a generated sound', 'info')
        expect(showToast).not.toHaveBeenCalledWith('No track selected', 'info')
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
