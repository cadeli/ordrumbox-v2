import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/logic/services/instruments_manager.js', () => ({
    default: class MockInstrumentsManager {
        findTrackIndexFromMidi = vi.fn().mockReturnValue(-1)
    },
}))

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        audioCtx: null,
        seq: null,
    },
    __esModule: true,
}))

vi.mock('../src/state/app_state.js', () => ({
    appState: {
        patterns: [],
        selectedPatternNum: 0,
    },
    __esModule: true,
}))

describe('MfMidi', () => {
    let MfMidi

    beforeEach(async () => {
        vi.restoreAllMocks()
        const mod = await import('../src/logic/midi/midi.js')
        MfMidi = mod.default
    })

    it('extends EventTarget', () => {
        const midi = new MfMidi()
        expect(midi).toBeInstanceOf(EventTarget)
    })

    it('has getStatus() returning initial state', () => {
        const midi = new MfMidi()
        const status = midi.getStatus()
        expect(status).toEqual({
            supported: expect.any(Boolean),
            ready: false,
            inputCount: 0,
            outputCount: 0,
            syncEnabled: false,
        })
    })

    it('has getButtonLabel() returning initial label', () => {
        const midi = new MfMidi()
        expect(midi.getButtonLabel()).toBe('Enable MIDI')
    })

    it('emits statusChange on disable()', () => {
        const midi = new MfMidi()
        const handler = vi.fn()
        midi.addEventListener('statusChange', handler)

        midi.disable()
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('emits statusChange on toggleExternalSync()', () => {
        const midi = new MfMidi()
        const handler = vi.fn()
        midi.addEventListener('statusChange', handler)

        midi.toggleExternalSync()
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('emits statusChange on setExternalSyncEnabled()', () => {
        const midi = new MfMidi()
        const handler = vi.fn()
        midi.addEventListener('statusChange', handler)

        midi.setExternalSyncEnabled(true)
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('emits activity on onMidiMessage with note-on channel 9', () => {
        const midi = new MfMidi()
        const handler = vi.fn()
        midi.addEventListener('activity', handler)

        midi.onMidiMessage({ data: new Uint8Array([0x99, 60, 100]) })
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('does not emit activity for non-channel-9 messages', () => {
        const midi = new MfMidi()
        const handler = vi.fn()
        midi.addEventListener('activity', handler)

        midi.onMidiMessage({ data: new Uint8Array([0x90, 60, 100]) })
        expect(handler).not.toHaveBeenCalled()
    })

    it('no longer has renderIndicators, flashActivity, or setLedState', () => {
        const midi = new MfMidi()
        expect(midi.renderIndicators).toBeUndefined()
        expect(midi.flashActivity).toBeUndefined()
        expect(midi.setLedState).toBeUndefined()
    })

    it('no longer references document', () => {
        const src = MfMidi.toString()
        expect(src).not.toContain('document.getElementById')
        expect(src).not.toContain('classList')
        expect(src).not.toContain('innerText')
    })
})
