import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import InstrumentsManager from '../services/instruments_manager.js'
import { logger } from '../../core/logger.js'
import {
    parseMidiNoteOn,
    parseMidiRealtime,
    estimateBpmFromClockPulses,
    updateClockPulseTracking,
    isMidiSupported,
} from './midi_parser.js'

export default class MidiManager extends EventTarget {
    static TAG = "MidiManager"

    constructor() {
        super()
        this.midiAccess = null
        this.inputs = []
        this.outputs = []
        this.selectedOutputId = null
        this.inputHandlers = new Map()
        this.instrumentsManager = new InstrumentsManager()
        this.isReady = false
        this.isInitializing = false
        this.initPromise = null
        this.externalSyncEnabled = false
        this.clockPulseTimes = []
        this.clockStartTime = null
    }

    isSupported = () => {
        return isMidiSupported()
    }

    init = async () => {
        if (this.isReady) {
            return true
        }
        if (this.isInitializing && this.initPromise) {
            return this.initPromise
        }

        if (!this.isSupported()) {
            logger.info('MidiManager', `${MidiManager.TAG}: MIDI is not supported in this browser`)
            return false
        }

        this.isInitializing = true
        this.initPromise = (async () => {
            try {
                this.midiAccess = await navigator.requestMIDIAccess()
                this.midiAccess.addEventListener('statechange', this.onStateChange)
                this.refreshPorts()
                this.isReady = true
                logger.info('MidiManager', `${MidiManager.TAG}: MIDI ready`)
                this.dispatchEvent(new Event('statusChange'))
                return true
            } catch (error) {
                this.isReady = false
                logger.warn('MidiManager', `${MidiManager.TAG}: Unable to initialize MIDI access`, error)
                this.dispatchEvent(new Event('statusChange'))
                return false
            } finally {
                this.isInitializing = false
            }
        })()

        return this.initPromise
    }

    disable = () => {
        if (this.midiAccess) {
            this.midiAccess.removeEventListener('statechange', this.onStateChange)
            this.midiAccess = null
        }
        this.inputs.forEach((input) => {
            const handler = this.inputHandlers.get(input.id)
            if (handler) {
                input.removeEventListener('midimessage', handler)
            }
        })
        this.inputs = []
        this.outputs = []
        this.inputHandlers.clear()
        this.isReady = false
        this.selectedOutputId = null
        this.dispatchEvent(new Event('statusChange'))
    }

    getButtonLabel = () => {
        if (this.isInitializing) {
            return "Enabling MIDI..."
        }
        if (this.isReady) {
            return "MIDI ready"
        }
        return "Enable MIDI"
    }

    getStatus = () => {
        return {
            supported: this.isSupported(),
            ready: this.isReady,
            inputCount: this.inputs.length,
            outputCount: this.outputs.length,
            syncEnabled: this.externalSyncEnabled
        }
    }

    onStateChange = () => {
        this.refreshPorts()
    }

    refreshPorts = () => {
        if (!this.midiAccess) {
            this.dispatchEvent(new Event('statusChange'))
            return
        }

        // Inputs
        this.inputs.forEach((input) => {
            const handler = this.inputHandlers.get(input.id)
            if (handler) {
                input.removeEventListener('midimessage', handler)
            }
        })
        this.inputs = []
        this.inputHandlers.clear()

        for (const input of this.midiAccess.inputs.values()) {
            const handler = (event) => this.onMidiMessage(event)
            input.addEventListener('midimessage', handler)
            this.inputHandlers.set(input.id, handler)
            this.inputs.push(input)
        }

        // Outputs
        this.outputs = []
        for (const output of this.midiAccess.outputs.values()) {
            this.outputs.push(output)
        }

        if (!this.selectedOutputId && this.outputs.length > 0) {
            this.selectedOutputId = this.outputs[0].id
        }

        this.dispatchEvent(new Event('statusChange'))
    }

    setSelectedOutput = (id) => {
        this.selectedOutputId = id
    }

    sendMidiMessage = (data, timestamp) => {
        if (!this.isReady || !this.selectedOutputId) return
        const output = this.outputs.find(o => o.id === this.selectedOutputId)
        if (output) {
            try {
                if (timestamp) {
                    output.send(data, timestamp)
                } else {
                    output.send(data)
                }
            } catch (e) {
                logger.warn('MidiManager', `${MidiManager.TAG}: Failed to send MIDI message`, e)
            }
        }
    }

    sendNoteOn = (channel, note, velocity, timestamp) => {
        const status = 0x90 | (Math.max(0, Math.min(15, channel)))
        this.sendMidiMessage([status, note, velocity], timestamp)
    }

    sendNoteOff = (channel, note, timestamp) => {
        const status = 0x80 | (Math.max(0, Math.min(15, channel)))
        this.sendMidiMessage([status, note, 0], timestamp)
    }

    sendClock = (timestamp) => {
        this.sendMidiMessage([0xF8], timestamp)
    }

    sendStart = (timestamp) => {
        this.sendMidiMessage([0xFA], timestamp)
    }

    sendStop = (timestamp) => {
        this.sendMidiMessage([0xFC], timestamp)
    }

    sendAllNotesOff = () => {
        if (!this.selectedOutputId) return
        for (let ch = 0; ch < 16; ch++) {
            this.sendMidiMessage([0xB0 | ch, 123, 0])
        }
    }

    onMidiMessage = (event) => {
        logger.info('MidiManager', "onMidiMessage ", event)
        const data = event?.data
        if (!data || data.length < 3) {
            if (data && data.length === 1 && data[0] >= 0xF8) {
                this.onRealtimeMessage(data[0])
            }
            return
        }

        const status = data[0]
        if (status >= 0xF8) {
            this.onRealtimeMessage(status)
            return
        }

        const noteOn = parseMidiNoteOn(data)
        if (!noteOn) return
        if (noteOn.channel !== 9) return

        this.dispatchEvent(new Event('activity'))
        this.triggerMappedTrack(noteOn.noteNumber)
    }

    onRealtimeMessage = (status) => {
        if (!this.externalSyncEnabled) return
        logger.info('MidiManager', "onRealtimeMessage")
        const type = parseMidiRealtime(status)
        switch (type) {
            case 'start':
                this.handleExternalStart()
                logger.info('MidiManager', "handleExternalStart")
                break
            case 'continue':
                this.handleExternalContinue()
                break
            case 'stop':
                this.handleExternalStop()
                break
            case 'clock':
                this.handleExternalClock()
                break
            default:
                break
        }
    }

    toggleExternalSync = () => {
        this.externalSyncEnabled = !this.externalSyncEnabled
        this.resetExternalClockTracking()
        this.dispatchEvent(new Event('statusChange'))
        return this.externalSyncEnabled
    }

    setExternalSyncEnabled = (enabled) => {
        this.externalSyncEnabled = !!enabled
        this.resetExternalClockTracking()
        this.dispatchEvent(new Event('statusChange'))
        return this.externalSyncEnabled
    }

    resetExternalClockTracking = () => {
        this.clockPulseTimes = []
        this.clockStartTime = null
    }

    handleExternalStart = () => {
        this.resetExternalClockTracking()
        if (!serviceRegistry.seq.isRunning) {
            serviceRegistry.seq.toggleStartStop()
        }
    }

    handleExternalContinue = () => {
        if (!serviceRegistry.seq.isRunning) {
            serviceRegistry.seq.toggleStartStop()
        }
    }

    handleExternalStop = () => {
        if (serviceRegistry.seq.isRunning) {
            serviceRegistry.seq.toggleStartStop()
        }
        this.resetExternalClockTracking()
    }

    handleExternalClock = () => {
        const now = performance.now()
        if (!this.clockStartTime) {
            this.clockStartTime = now
        }

        if (this.clockPulseTimes.length > 0) {
            const delta = now - this.clockPulseTimes[this.clockPulseTimes.length - 1]
            if (delta > 0) {
                this.clockPulseTimes = updateClockPulseTracking(this.clockPulseTimes, now)
                const bpm = estimateBpmFromClockPulses(this.clockPulseTimes)
                if (Number.isFinite(bpm) && bpm > 0) {
                    serviceRegistry.seq.setBpm(Math.round(bpm * 100) / 100)
                }
            }
        } else {
            this.clockPulseTimes.push(now)
        }

        if (!serviceRegistry.seq.isRunning) {
            serviceRegistry.seq.toggleStartStop()
        }
    }

    estimateExternalBpm = () => {
        return estimateBpmFromClockPulses(this.clockPulseTimes)
    }

    triggerMappedTrack = async (noteNumber) => {
        const pattern = appState.patterns?.[appState.selectedPatternNum]
        if (!pattern) {
            logger.info('MidiManager', `${MidiManager.TAG}: No current pattern available`)
            return
        }

        const trackIndex = this.instrumentsManager.findTrackIndexFromMidi(pattern, 9, noteNumber)
        if (trackIndex < 0) {
            logger.info('MidiManager', `${MidiManager.TAG}: No GM track mapped for MIDI note ${noteNumber} on channel 9`)
            return
        }

        if (serviceRegistry.audioCtx && serviceRegistry.audioCtx.state === 'suspended') {
            try {
                await serviceRegistry.audioCtx.resume()
            } catch (error) {
                logger.warn('MidiManager', `${MidiManager.TAG}: Unable to resume audio context`, error)
            }
        }

        if (serviceRegistry.seq) {
            serviceRegistry.seq.simpleBeep(trackIndex)
        }
    }
}
