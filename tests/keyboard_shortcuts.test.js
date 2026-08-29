/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'

const { mocks } = vi.hoisted(() => ({
    mocks: {
        simpleBeep: vi.fn(),
        toggleStartStop: vi.fn(),
        setSelectedPatternNum: vi.fn(),
        setSelectedDrumkitNum: vi.fn(),
    },
}))

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        seq: { simpleBeep: mocks.simpleBeep, toggleStartStop: mocks.toggleStartStop },
        cmd: { setSelectedPatternNum: mocks.setSelectedPatternNum, setSelectedDrumkitNum: mocks.setSelectedDrumkitNum },
        patterns: { computeFlatNotesFromPattern: vi.fn() },
        audioEngine: { invalidateCache: vi.fn() },
        resourcesLoader: { loadGeneratedSounds: vi.fn().mockResolvedValue() },
    },
}))

vi.mock('../src/state/playback_events.js', () => {
    const listeners = new Map()
    return {
        playbackEvents: {
            on: vi.fn((event, fn) => {
                if (!listeners.has(event)) listeners.set(event, new Set())
                listeners.get(event).add(fn)
            }),
            off: vi.fn((event, fn) => {
                listeners.get(event)?.delete(fn)
            }),
            emit: vi.fn((event, payload) => {
                listeners.get(event)?.forEach(fn => fn(payload))
            }),
            removeAllListeners: vi.fn((event) => {
                if (event) listeners.delete(event)
                else listeners.clear()
            }),
        },
    }
})

vi.mock('../src/ui/toast.js', () => ({
    showToast: vi.fn(),
}))

vi.mock('../src/core/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../src/core/utils.js', () => ({
    default: { detectTrackType: vi.fn().mockReturnValue('KICK') },
}))

vi.mock('../src/loader/resources_loader.js', () => ({
    default: { GENERATED_SOUNDS_URL: 'test' },
}))

vi.mock('../src/state/service_loader.js', () => ({
    getAutoGenerateService: vi.fn().mockResolvedValue({ generatePattern: vi.fn() }),
}))

import { initKeyboardShortcuts } from '../src/keyboard_shortcuts.js'

function makeEvent(code, key = '', target = null) {
    return {
        code,
        key,
        target: target ?? document.body,
        preventDefault: vi.fn(),
    }
}

describe('keyboard_shortcuts', () => {
    let handler

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        Object.values(mocks).forEach(m => m.mockClear())
        playbackEvents.removeAllListeners()

        appState.patterns = [
            { name: 'P1', tracks: [{ name: 'KICK', mute: false }] },
            { name: 'P2', tracks: [{ name: 'SNARE', mute: false }] },
        ]
        appState.selectedPatternNum = 0
        soundRegistry.drumkitList = [{ name: 'kit1' }, { name: 'kit2' }]

        document.body.innerHTML = ''
        const spy = vi.spyOn(document, 'addEventListener')
        initKeyboardShortcuts()
        const call = spy.mock.calls.find(c => c[0] === 'keydown')
        handler = call?.[1]
        spy.mockRestore()
    })

    it('registers a keydown listener on document', () => {
        expect(typeof handler).toBe('function')
    })

    it('toggles track mute on digit keys', async () => {
        const event = makeEvent('Digit1')
        await handler(event)
        expect(appState.patterns[0].tracks[0].mute).toBe(true)
    })

    it('calls seq.simpleBeep on preview keys', async () => {
        const event = makeEvent('KeyQ')
        await handler(event)
        expect(mocks.simpleBeep).toHaveBeenCalledWith(0)
    })

    it('calls toggleStartStop on Space', async () => {
        const event = makeEvent('Space', ' ')
        await handler(event)
        expect(mocks.toggleStartStop).toHaveBeenCalled()
    })

    it('calls setSelectedPatternNum on KeyF (random pattern)', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99)
        const event = makeEvent('KeyF')
        await handler(event)
        expect(mocks.setSelectedPatternNum).toHaveBeenCalled()
        Math.random.mockRestore()
    })

    it('calls setSelectedDrumkitNum on KeyG (random drumkit)', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99)
        const event = makeEvent('KeyG')
        await handler(event)
        expect(mocks.setSelectedDrumkitNum).toHaveBeenCalled()
        Math.random.mockRestore()
    })

    it('skips shortcuts when target is a textarea', async () => {
        const ta = document.createElement('textarea')
        document.body.appendChild(ta)
        const event = makeEvent('Space', ' ', ta)
        await handler(event)
        expect(mocks.toggleStartStop).not.toHaveBeenCalled()
    })

    it('skips shortcuts when target is a text input', async () => {
        const input = document.createElement('input')
        input.type = 'text'
        document.body.appendChild(input)
        const event = makeEvent('Digit1', '', input)
        await handler(event)
        expect(appState.patterns[0].tracks[0].mute).toBe(false)
    })

    it('does not skip for range inputs', async () => {
        const input = document.createElement('input')
        input.type = 'range'
        document.body.appendChild(input)
        const event = makeEvent('Digit1', '', input)
        await handler(event)
        expect(appState.patterns[0].tracks[0].mute).toBe(true)
    })

    it('prevents default on Space', async () => {
        const event = makeEvent('Space', ' ')
        await handler(event)
        expect(event.preventDefault).toHaveBeenCalled()
    })

    it('does nothing for unknown keys', async () => {
        const event = makeEvent('KeyZ')
        await handler(event)
        expect(mocks.simpleBeep).not.toHaveBeenCalled()
        expect(mocks.toggleStartStop).not.toHaveBeenCalled()
    })

    it('toggles showVus on KeyV', async () => {
        appState.showVus = false
        const event = makeEvent('KeyV')
        await handler(event)
        expect(appState.showVus).toBe(true)
    })
})
