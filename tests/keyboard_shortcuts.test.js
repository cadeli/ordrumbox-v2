/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { initKeyboardShortcuts } from '../src/keyboard_shortcuts.js'

function fireKeydown(code, key = '') {
    const event = new KeyboardEvent('keydown', { code, key, bubbles: true })
    document.dispatchEvent(event)
    return event
}

describe('Keyboard shortcuts', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        appState.reset()
        serviceRegistry.reset()
        soundRegistry.reset()

        appState.patterns = [{ name: 'P1', tracks: [
            { name: 'KICK', mute: false },
            { name: 'SNARE', mute: false }
        ] }]
        appState.selectedPatternNum = 0
        appState.showVus = false

        serviceRegistry.seq = { toggleStartStop: vi.fn(), simpleBeep: vi.fn() }
        serviceRegistry.cmd = {
            setSelectedPatternNum: vi.fn(),
            setSelectedDrumkitNum: vi.fn()
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
        playbackEvents.on('trackParamChange', trackParamSpy)
        playbackEvents.on('patternChange', patternChangeSpy)
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
            { name: 'T3', mute: false }, { name: 'T4', mute: false },
            { name: 'T5', mute: false }, { name: 'T6', mute: false },
            { name: 'T7', mute: false }, { name: 'T8', mute: false }
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
})
