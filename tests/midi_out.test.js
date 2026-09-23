import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMidiMappingResolver, sendMidiNotes, sendTriggerMidi } from '../src/audio/midi_out.js'
import { serviceRegistry } from '../src/state/service_registry.js'

function makeReadyMidi() {
    return {
        isReady: true,
        selectedOutputId: 'out-1',
        sendNoteOn: vi.fn(),
        sendNoteOff: vi.fn(),
    }
}

function makeCtx({ midiMap = new Map(), pattern, resolveMapping } = {}) {
    const flatNotes = midiMap
    const track = pattern?.tracks?.[0] ?? { id: 'KICK', mute: false, solo: false, velocity: 0.8 }
    const pat = pattern ?? { nbBeats: 1, tracks: [track] }
    return {
        audioCtx: { currentTime: 0 },
        patterns: [pat],
        getSelectedPatternNum: () => 0,
        TICK: 32,
        player: { getCurrentFlatNotesMap: () => flatNotes, loop: 0 },
        getFlatNotes: () => flatNotes,
        resolveMapping: resolveMapping ?? (() => ({ ch: '1', key: '36' })),
    }
}

describe('createMidiMappingResolver', () => {
    it('returns the first MIDI mapping for a known instrument id', () => {
        const resolve = createMidiMappingResolver()
        const mapping = resolve('BASS')
        expect(mapping).toBeTruthy()
        expect(mapping.name).toBe('Acoustic Bass')
    })

    it('returns null for an unknown instrument id', () => {
        const resolve = createMidiMappingResolver()
        expect(resolve('DOES_NOT_EXIST')).toBeNull()
    })

    it('memoizes results (same reference on repeat calls)', () => {
        const resolve = createMidiMappingResolver()
        const first = resolve('BASS')
        const second = resolve('BASS')
        expect(second).toBe(first)
    })
})

describe('sendMidiNotes', () => {
    beforeEach(() => {
        serviceRegistry.reset()
    })

    afterEach(() => {
        serviceRegistry.reset()
        vi.useRealTimers()
    })

    it('no-op when midiManager is missing', () => {
        const ctx = makeCtx()
        expect(() => sendMidiNotes(ctx, 0, 0)).not.toThrow()
    })

    it('no-op when MIDI is not ready', () => {
        serviceRegistry.midiManager = { isReady: false, selectedOutputId: 'x', sendNoteOn: vi.fn() }
        const ctx = makeCtx()
        sendMidiNotes(ctx, 0, 0)
        expect(serviceRegistry.midiManager.sendNoteOn).not.toHaveBeenCalled()
    })

    it('no-op when no output is selected', () => {
        serviceRegistry.midiManager = { isReady: true, selectedOutputId: null, sendNoteOn: vi.fn() }
        const ctx = makeCtx()
        sendMidiNotes(ctx, 0, 0)
        expect(serviceRegistry.midiManager.sendNoteOn).not.toHaveBeenCalled()
    })

    it('no-op when selected pattern is missing', () => {
        serviceRegistry.midiManager = makeReadyMidi()
        const ctx = makeCtx()
        ctx.patterns = []
        sendMidiNotes(ctx, 0, 0)
        expect(serviceRegistry.midiManager.sendNoteOn).not.toHaveBeenCalled()
    })

    it('no-op when flatNotes is not a Map', () => {
        serviceRegistry.midiManager = makeReadyMidi()
        const ctx = makeCtx({ midiMap: null })
        sendMidiNotes(ctx, 0, 0)
        expect(serviceRegistry.midiManager.sendNoteOn).not.toHaveBeenCalled()
    })

    it('no-op when no notes are scheduled at the tick', () => {
        serviceRegistry.midiManager = makeReadyMidi()
        const ctx = makeCtx({ midiMap: new Map() })
        sendMidiNotes(ctx, 0, 0)
        expect(serviceRegistry.midiManager.sendNoteOn).not.toHaveBeenCalled()
    })

    it('sends noteOn and noteOff for a mapped note at the loop step', () => {
        const midi = makeReadyMidi()
        serviceRegistry.midiManager = midi
        const track = { id: 'KICK', mute: false, solo: false }
        const flatNotes = new Map([[0, [{ track, velocity: 0.5, swingTime: 0, duration: 100 }]]])
        const ctx = makeCtx({ midiMap: flatNotes, pattern: { nbBeats: 1, tracks: [track] } })

        sendMidiNotes(ctx, 0, 0.1)

        expect(midi.sendNoteOn).toHaveBeenCalledTimes(1)
        expect(midi.sendNoteOff).toHaveBeenCalledTimes(1)
        const [ch, note, vel] = midi.sendNoteOn.mock.calls[0]
        expect(ch).toBe(1)
        expect(note).toBe(36)
        expect(vel).toBe(63)
    })

    it('skips muted tracks when no solo is active', () => {
        const midi = makeReadyMidi()
        serviceRegistry.midiManager = midi
        const track = { id: 'KICK', mute: true, solo: false }
        const flatNotes = new Map([[0, [{ track, velocity: 0.5, swingTime: 0, duration: 100 }]]])
        const ctx = makeCtx({ midiMap: flatNotes, pattern: { nbBeats: 1, tracks: [track] } })

        sendMidiNotes(ctx, 0, 0)

        expect(midi.sendNoteOn).not.toHaveBeenCalled()
    })

    it('only plays soloed tracks when a solo is active', () => {
        const midi = makeReadyMidi()
        serviceRegistry.midiManager = midi
        const kick = { id: 'KICK', mute: false, solo: false }
        const snare = { id: 'SNARE', mute: false, solo: true }
        const flatNotes = new Map([
            [
                0,
                [
                    { track: kick, velocity: 0.5, swingTime: 0, duration: 100 },
                    { track: snare, velocity: 0.5, swingTime: 0, duration: 100 },
                ],
            ],
        ])
        const ctx = makeCtx({ midiMap: flatNotes, pattern: { nbBeats: 1, tracks: [kick, snare] } })

        sendMidiNotes(ctx, 0, 0)

        expect(midi.sendNoteOn).toHaveBeenCalledTimes(1)
        expect(midi.sendNoteOn.mock.calls[0][0]).toBe(1)
    })

    it('falls back to channel 9 / note 60 on invalid mapping', () => {
        const midi = makeReadyMidi()
        serviceRegistry.midiManager = midi
        const track = { id: 'KICK', mute: false, solo: false }
        const flatNotes = new Map([[0, [{ track, velocity: 1, swingTime: 0, duration: 100 }]]])
        const ctx = makeCtx({
            midiMap: flatNotes,
            pattern: { nbBeats: 1, tracks: [track] },
            resolveMapping: () => ({ ch: 'xx', key: 'yy' }),
        })

        sendMidiNotes(ctx, 0, 0)

        expect(midi.sendNoteOn).toHaveBeenCalledWith(9, 60, 127, expect.any(Number))
    })

    it('skips notes whose track has no MIDI mapping', () => {
        const midi = makeReadyMidi()
        serviceRegistry.midiManager = midi
        const track = { id: 'KICK', mute: false, solo: false }
        const flatNotes = new Map([[0, [{ track, velocity: 0.5, swingTime: 0, duration: 100 }]]])
        const ctx = makeCtx({
            midiMap: flatNotes,
            pattern: { nbBeats: 1, tracks: [track] },
            resolveMapping: () => null,
        })

        sendMidiNotes(ctx, 0, 0)

        expect(midi.sendNoteOn).not.toHaveBeenCalled()
    })

    it('wraps tick into the pattern loop (tick % nbTickForPattern)', () => {
        const midi = makeReadyMidi()
        serviceRegistry.midiManager = midi
        const track = { id: 'KICK', mute: false, solo: false }
        const flatNotes = new Map([[5, [{ track, velocity: 0.5, swingTime: 0, duration: 100 }]]])
        const ctx = makeCtx({ midiMap: flatNotes, pattern: { nbBeats: 1, tracks: [track] } })

        sendMidiNotes(ctx, 5, 0)
        expect(midi.sendNoteOn).toHaveBeenCalledTimes(1)

        midi.sendNoteOn.mockClear()
        sendMidiNotes(ctx, 5 + 32, 0)
        expect(midi.sendNoteOn).toHaveBeenCalledTimes(1)
    })
})

describe('sendTriggerMidi', () => {
    beforeEach(() => {
        serviceRegistry.reset()
        vi.useFakeTimers()
    })

    afterEach(() => {
        serviceRegistry.reset()
        vi.useRealTimers()
    })

    const resolveMapping = () => ({ ch: '10', key: '40' })

    it('no-op when midiManager is missing', () => {
        expect(() => sendTriggerMidi({ track: { id: 'X' }, resolveMapping })).not.toThrow()
    })

    it('no-op when track is missing', () => {
        serviceRegistry.midiManager = makeReadyMidi()
        sendTriggerMidi({ track: null, resolveMapping })
        expect(serviceRegistry.midiManager.sendNoteOn).not.toHaveBeenCalled()
    })

    it('no-op when mapping is missing', () => {
        serviceRegistry.midiManager = makeReadyMidi()
        sendTriggerMidi({ track: { id: 'X' }, resolveMapping: () => null })
        expect(serviceRegistry.midiManager.sendNoteOn).not.toHaveBeenCalled()
    })

    it('sends noteOn immediately and noteOff after 100ms', () => {
        const midi = makeReadyMidi()
        serviceRegistry.midiManager = midi

        sendTriggerMidi({ track: { id: 'X', velocity: 0.5 }, resolveMapping })

        expect(midi.sendNoteOn).toHaveBeenCalledWith(10, 40, 63)
        expect(midi.sendNoteOff).not.toHaveBeenCalled()

        vi.advanceTimersByTime(100)
        expect(midi.sendNoteOff).toHaveBeenCalledWith(10, 40)
    })

    it('uses note.velocity when provided, else track.velocity', () => {
        const midi = makeReadyMidi()
        serviceRegistry.midiManager = midi

        sendTriggerMidi({ track: { id: 'X', velocity: 0.5 }, note: { velocity: 1 }, resolveMapping })
        expect(midi.sendNoteOn).toHaveBeenCalledWith(10, 40, 127)

        sendTriggerMidi({ track: { id: 'X', velocity: 0.5 }, resolveMapping })
        expect(midi.sendNoteOn).toHaveBeenLastCalledWith(10, 40, 63)
    })

    it('falls back to ch 9 / note 60 on invalid mapping', () => {
        const midi = makeReadyMidi()
        serviceRegistry.midiManager = midi

        sendTriggerMidi({ track: { id: 'X', velocity: 1 }, resolveMapping: () => ({ ch: 'a', key: 'b' }) })
        expect(midi.sendNoteOn).toHaveBeenCalledWith(9, 60, 127)
    })
})
