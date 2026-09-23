import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'

vi.mock('../src/logic/midi/midi_parser.js', () => ({
    parseMidiNoteOn: vi.fn(),
    parseMidiRealtime: vi.fn(),
    estimateBpmFromClockPulses: vi.fn(),
    updateClockPulseTracking: vi.fn(),
    isMidiSupported: vi.fn(() => true),
}))

vi.mock('../src/logic/services/instruments_manager.js', () => ({
    instrumentsManager: {
        findTrackIndexFromMidi: vi.fn(() => 0),
    },
}))

describe('MidiManager', () => {
    let MidiManager

    beforeEach(async () => {
        appState.reset()
        serviceRegistry.reset()
        soundRegistry.reset()
        const mod = await import('../src/logic/midi/midi.js')
        MidiManager = mod.default
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function createManager() {
        return new MidiManager()
    }

    describe('constructor', () => {
        it('initializes with default state', () => {
            const mgr = createManager()
            expect(mgr.isReady).toBe(false)
            expect(mgr.isInitializing).toBe(false)
            expect(mgr.midiAccess).toBeNull()
            expect(mgr.inputs).toEqual([])
            expect(mgr.outputs).toEqual([])
            expect(mgr.selectedOutputId).toBeNull()
            expect(mgr.externalSyncEnabled).toBe(false)
        })
    })

    describe('getButtonLabel', () => {
        it('returns "Enable MIDI" when not ready', () => {
            const mgr = createManager()
            expect(mgr.getButtonLabel()).toBe('Enable MIDI')
        })

        it('returns "Enabling MIDI..." when initializing', () => {
            const mgr = createManager()
            mgr.isInitializing = true
            expect(mgr.getButtonLabel()).toBe('Enabling MIDI...')
        })

        it('returns "MIDI ready" when ready', () => {
            const mgr = createManager()
            mgr.isReady = true
            expect(mgr.getButtonLabel()).toBe('MIDI ready')
        })
    })

    describe('getStatus', () => {
        it('returns status object', () => {
            const mgr = createManager()
            const status = mgr.getStatus()
            expect(status).toHaveProperty('supported')
            expect(status).toHaveProperty('ready', false)
            expect(status).toHaveProperty('inputCount', 0)
            expect(status).toHaveProperty('outputCount', 0)
            expect(status).toHaveProperty('syncEnabled', false)
        })
    })

    describe('disable', () => {
        it('resets all state', () => {
            const mgr = createManager()
            mgr.isReady = true
            mgr.midiAccess = { removeEventListener: vi.fn() }
            mgr.inputs = [{ id: 'in1', removeEventListener: vi.fn() }]
            mgr.inputHandlers.set('in1', vi.fn())
            mgr.outputs = [{ id: 'out1' }]
            mgr.selectedOutputId = 'out1'

            mgr.disable()

            expect(mgr.isReady).toBe(false)
            expect(mgr.midiAccess).toBeNull()
            expect(mgr.inputs).toEqual([])
            expect(mgr.outputs).toEqual([])
            expect(mgr.selectedOutputId).toBeNull()
            expect(mgr.inputHandlers.size).toBe(0)
        })
    })

    describe('setSelectedOutput', () => {
        it('sets the output id', () => {
            const mgr = createManager()
            mgr.setSelectedOutput('out-42')
            expect(mgr.selectedOutputId).toBe('out-42')
        })
    })

    describe('toggleExternalSync', () => {
        it('toggles externalSyncEnabled', () => {
            const mgr = createManager()
            expect(mgr.externalSyncEnabled).toBe(false)
            const result = mgr.toggleExternalSync()
            expect(result).toBe(true)
            expect(mgr.externalSyncEnabled).toBe(true)
        })

        it('resets clock tracking on toggle', () => {
            const mgr = createManager()
            mgr.clockPulseTimes = [100, 200]
            mgr.clockStartTime = 100
            mgr.toggleExternalSync()
            expect(mgr.clockPulseTimes).toEqual([])
            expect(mgr.clockStartTime).toBeNull()
        })
    })

    describe('setExternalSyncEnabled', () => {
        it('sets the value', () => {
            const mgr = createManager()
            const result = mgr.setExternalSyncEnabled(true)
            expect(result).toBe(true)
            expect(mgr.externalSyncEnabled).toBe(true)
        })
    })

    describe('sendMidiMessage', () => {
        it('does nothing when not ready', () => {
            const mgr = createManager()
            mgr.sendMidiMessage([0x90, 60, 127])
        })

        it('does nothing when no output selected', () => {
            const mgr = createManager()
            mgr.isReady = true
            mgr.sendMidiMessage([0x90, 60, 127])
        })

        it('sends to selected output', () => {
            const mgr = createManager()
            const mockSend = vi.fn()
            mgr.isReady = true
            mgr.selectedOutputId = 'out1'
            mgr.outputs = [{ id: 'out1', send: mockSend }]

            mgr.sendMidiMessage([0x90, 60, 127])
            expect(mockSend).toHaveBeenCalledWith([0x90, 60, 127])
        })

        it('sends with timestamp when provided', () => {
            const mgr = createManager()
            const mockSend = vi.fn()
            mgr.isReady = true
            mgr.selectedOutputId = 'out1'
            mgr.outputs = [{ id: 'out1', send: mockSend }]

            mgr.sendMidiMessage([0x90, 60, 127], 12345)
            expect(mockSend).toHaveBeenCalledWith([0x90, 60, 127], 12345)
        })
    })

    describe('sendNoteOn / sendNoteOff / sendClock / sendStart / sendStop', () => {
        it('sendNoteOn sends correct status byte', () => {
            const mgr = createManager()
            const spy = vi.spyOn(mgr, 'sendMidiMessage')
            mgr.sendNoteOn(0, 60, 100)
            expect(spy).toHaveBeenCalledWith([0x90, 60, 100], undefined)
        })

        it('sendNoteOn clamps channel to 0-15', () => {
            const mgr = createManager()
            const spy = vi.spyOn(mgr, 'sendMidiMessage')
            mgr.sendNoteOn(20, 60, 100)
            expect(spy).toHaveBeenCalledWith([0x90 | 15, 60, 100], undefined)
        })

        it('sendNoteOff sends correct status byte', () => {
            const mgr = createManager()
            const spy = vi.spyOn(mgr, 'sendMidiMessage')
            mgr.sendNoteOff(0, 60)
            expect(spy).toHaveBeenCalledWith([0x80, 60, 0], undefined)
        })

        it('sendClock sends 0xF8', () => {
            const mgr = createManager()
            const spy = vi.spyOn(mgr, 'sendMidiMessage')
            mgr.sendClock()
            expect(spy).toHaveBeenCalledWith([0xf8], undefined)
        })

        it('sendStart sends 0xFA', () => {
            const mgr = createManager()
            const spy = vi.spyOn(mgr, 'sendMidiMessage')
            mgr.sendStart()
            expect(spy).toHaveBeenCalledWith([0xfa], undefined)
        })

        it('sendStop sends 0xFC', () => {
            const mgr = createManager()
            const spy = vi.spyOn(mgr, 'sendMidiMessage')
            mgr.sendStop()
            expect(spy).toHaveBeenCalledWith([0xfc], undefined)
        })
    })

    describe('sendAllNotesOff', () => {
        it('sends all-notes-off on 16 channels', () => {
            const mgr = createManager()
            mgr.isReady = true
            mgr.selectedOutputId = 'out1'
            const mockSend = vi.fn()
            mgr.outputs = [{ id: 'out1', send: mockSend }]

            mgr.sendAllNotesOff()
            expect(mockSend).toHaveBeenCalledTimes(16)
            expect(mockSend).toHaveBeenCalledWith([0xb0, 123, 0])
            expect(mockSend).toHaveBeenCalledWith([0xbf, 123, 0])
        })

        it('does nothing when no output selected', () => {
            const mgr = createManager()
            mgr.sendAllNotesOff()
        })
    })

    describe('onMidiMessage', () => {
        it('ignores messages with no data', () => {
            const mgr = createManager()
            mgr.onMidiMessage({ data: null })
            mgr.onMidiMessage({})
        })

        it('handles 1-byte realtime messages', async () => {
            const { parseMidiRealtime } = await import('../src/logic/midi/midi_parser.js')
            parseMidiRealtime.mockReturnValue('clock')

            const mgr = createManager()
            mgr.externalSyncEnabled = true
            serviceRegistry.seq = { isRunning: false, toggleStartStop: vi.fn() }

            mgr.onMidiMessage({ data: new Uint8Array([0xf8]) })
            expect(parseMidiRealtime).toHaveBeenCalledWith(0xf8)
        })

        it('ignores realtime when sync not enabled', async () => {
            const { parseMidiRealtime } = await import('../src/logic/midi/midi_parser.js')
            parseMidiRealtime.mockReset()
            const mgr = createManager()
            mgr.externalSyncEnabled = false

            mgr.onMidiMessage({ data: new Uint8Array([0xf8]) })
            expect(parseMidiRealtime).not.toHaveBeenCalled()
        })

        it('ignores note on channel != 9', async () => {
            const { parseMidiNoteOn } = await import('../src/logic/midi/midi_parser.js')
            parseMidiNoteOn.mockReturnValue({ noteNumber: 60, channel: 0 })

            const mgr = createManager()
            mgr.onMidiMessage({ data: new Uint8Array([0x90, 60, 100, 0]) })
        })
    })

    describe('handleExternalClock', () => {
        it('starts clock tracking on first pulse', () => {
            serviceRegistry.seq = { isRunning: false, toggleStartStop: vi.fn(), setBpm: vi.fn() }
            const mgr = createManager()
            mgr.handleExternalClock()
            expect(mgr.clockPulseTimes.length).toBe(1)
            expect(mgr.clockStartTime).toBeTypeOf('number')
        })

        it('starts transport if not running', () => {
            serviceRegistry.seq = { isRunning: false, toggleStartStop: vi.fn(), setBpm: vi.fn() }
            const mgr = createManager()
            mgr.handleExternalClock()
            expect(serviceRegistry.seq.toggleStartStop).toHaveBeenCalled()
        })
    })

    describe('handleExternalStart / Stop / Continue', () => {
        it('handleExternalStart resets tracking and starts if not running', () => {
            const mgr = createManager()
            serviceRegistry.seq = { isRunning: false, toggleStartStop: vi.fn() }
            mgr.clockPulseTimes = [100]
            mgr.handleExternalStart()
            expect(mgr.clockPulseTimes).toEqual([])
            expect(serviceRegistry.seq.toggleStartStop).toHaveBeenCalled()
        })

        it('handleExternalStop stops if running', () => {
            const mgr = createManager()
            serviceRegistry.seq = { isRunning: true, toggleStartStop: vi.fn() }
            mgr.handleExternalStop()
            expect(serviceRegistry.seq.toggleStartStop).toHaveBeenCalled()
        })

        it('handleExternalContinue starts if not running', () => {
            const mgr = createManager()
            serviceRegistry.seq = { isRunning: false, toggleStartStop: vi.fn() }
            mgr.handleExternalContinue()
            expect(serviceRegistry.seq.toggleStartStop).toHaveBeenCalled()
        })

        it('handleExternalContinue does nothing if already running', () => {
            const mgr = createManager()
            serviceRegistry.seq = { isRunning: true, toggleStartStop: vi.fn() }
            mgr.handleExternalContinue()
            expect(serviceRegistry.seq.toggleStartStop).not.toHaveBeenCalled()
        })
    })

    describe('resetExternalClockTracking', () => {
        it('clears pulse times and start time', () => {
            const mgr = createManager()
            mgr.clockPulseTimes = [1, 2, 3]
            mgr.clockStartTime = 999
            mgr.resetExternalClockTracking()
            expect(mgr.clockPulseTimes).toEqual([])
            expect(mgr.clockStartTime).toBeNull()
        })
    })

    describe('init', () => {
        it('returns true when already ready', async () => {
            const mgr = createManager()
            mgr.isReady = true
            const result = await mgr.init()
            expect(result).toBe(true)
        })

        it('returns false when not supported', async () => {
            const { isMidiSupported } = await import('../src/logic/midi/midi_parser.js')
            isMidiSupported.mockReturnValue(false)

            const mgr = createManager()
            const result = await mgr.init()
            expect(result).toBe(false)
        })

        it('deduplicates concurrent init calls', async () => {
            const mgr = createManager()
            mgr.isInitializing = true
            mgr.initPromise = Promise.resolve(false)
            const result = await mgr.init()
            expect(result).toBe(false)
        })
    })
})
