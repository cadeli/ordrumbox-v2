import { MfGlobals } from '../mfglobals.js'
import Utils from '../utils.js'
import InstrumentsManager from '../ctrl/instrumentsManager.js'

export default class MfMidi {
    static TAG = "MFMIDI"

    constructor() {
        this.midiAccess = null
        this.inputs = []
        this.inputHandlers = new Map()
        this.instrumentsManager = new InstrumentsManager()
        this.isReady = false
        this.isInitializing = false
        this.initPromise = null
        this.activityTimer = null
        this.externalSyncEnabled = false
        this.clockPulseTimes = []
        this.clockStartTime = null
    }

    isSupported = () => {
        return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
    }

    init = async () => {
        if (this.isReady) {
            return true
        }
        if (this.isInitializing && this.initPromise) {
            return this.initPromise
        }

        if (!this.isSupported()) {
            console.info(`${MfMidi.TAG}: MIDI is not supported in this browser`)
            Utils.displayStatusBar("MIDI input is not supported in this browser")
            return false
        }

        this.isInitializing = true
        this.initPromise = (async () => {
            try {
                this.midiAccess = await navigator.requestMIDIAccess()
                this.midiAccess.addEventListener('statechange', this.onStateChange)
                this.refreshInputs()
                this.isReady = true
                console.info(`${MfMidi.TAG}: MIDI input ready`)
                Utils.displayStatusBar("MIDI input ready")
                this.renderIndicators()
                return true
            } catch (error) {
                this.isReady = false
                console.warn(`${MfMidi.TAG}: Unable to initialize MIDI access`, error)
                Utils.displayStatusBar("Unable to initialize MIDI input")
                this.renderIndicators()
                return false
            } finally {
                this.isInitializing = false
            }
        })()

        return this.initPromise
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
            connected: this.inputs.length > 0,
            inputCount: this.inputs.length,
            syncEnabled: this.externalSyncEnabled
        }
    }

    renderIndicators = () => {
        this.setLedState('midiSupportLed', this.isSupported(), this.isSupported() ? 'Supported' : 'Unavailable')
        this.setLedState('midiReadyLed', this.isReady, this.isReady ? 'Ready' : 'Locked')
        this.setLedState('midiConnectedLed', this.inputs.length > 0, this.inputs.length > 0 ? `${this.inputs.length} input(s)` : 'No inputs')
        this.setLedState('midiSyncLed', this.externalSyncEnabled, this.externalSyncEnabled ? 'External sync' : 'Internal')
    }

    flashActivity = () => {
        const led = document.getElementById('midiActivityLed')
        const label = document.getElementById('midiActivityLabel')
        if (led) {
            led.classList.add('midi-indicator-on')
            led.classList.remove('midi-indicator-off')
        }
        if (label) {
            label.innerText = 'Activity'
        }

        if (this.activityTimer) {
            window.clearTimeout(this.activityTimer)
        }
        this.activityTimer = window.setTimeout(() => {
            const resetLed = document.getElementById('midiActivityLed')
            const resetLabel = document.getElementById('midiActivityLabel')
            if (resetLed) {
                resetLed.classList.add('midi-indicator-off')
                resetLed.classList.remove('midi-indicator-on')
            }
            if (resetLabel) {
                resetLabel.innerText = 'Idle'
            }
        }, 120)
    }

    setLedState = (ledId, isOn, label) => {
        const led = document.getElementById(ledId)
        const labelId = ledId.replace('Led', 'Label')
        const text = document.getElementById(labelId)
        if (led) {
            led.classList.toggle('midi-indicator-on', !!isOn)
            led.classList.toggle('midi-indicator-off', !isOn)
        }
        if (text) {
            text.innerText = label
        }
    }

    onStateChange = () => {
        this.refreshInputs()
    }

    refreshInputs = () => {
        if (!this.midiAccess) {
            this.renderIndicators()
            return
        }

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
            console.info(`${MfMidi.TAG}: MIDI input connected -> ${input.name || 'Unknown device'}`)
        }

        if (this.inputs.length === 0) {
            console.info(`${MfMidi.TAG}: No MIDI input device connected`)
        }
        this.renderIndicators()
    }

    onMidiMessage = (event) => {
        console.log("onMidiMessage ", event)
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
        const command = status & 0xF0
        const channel = (status & 0x0F) + 1
        const noteNumber = data[1]
        const velocity = data[2]

        if (command !== 0x90 || velocity <= 0) {
            return
        }

        if (channel !== 10) {
            return
        }

        this.flashActivity()
        this.triggerMappedTrack(noteNumber)
    }

    onRealtimeMessage = (status) => {
        if (!this.externalSyncEnabled) {
            return
        }
        console.log("onRealtimeMessage")
        switch (status) {
            case 0xFA:
                this.handleExternalStart()
                console.log("handleExternalStart")

                break
            case 0xFB:
                this.handleExternalContinue()
                break
            case 0xFC:
                this.handleExternalStop()
                break
            case 0xF8:
                this.handleExternalClock()
                break
            default:
                break
        }
    }

    toggleExternalSync = () => {
        this.externalSyncEnabled = !this.externalSyncEnabled
        this.resetExternalClockTracking()
        this.renderIndicators()
        Utils.displayStatusBar(this.externalSyncEnabled ? "External MIDI sync enabled" : "External MIDI sync disabled")
        return this.externalSyncEnabled
    }

    setExternalSyncEnabled = (enabled) => {
        this.externalSyncEnabled = !!enabled
        this.resetExternalClockTracking()
        this.renderIndicators()
        return this.externalSyncEnabled
    }

    resetExternalClockTracking = () => {
        this.clockPulseTimes = []
        this.clockStartTime = null
    }

    handleExternalStart = () => {
        this.resetExternalClockTracking()
        if (!MfGlobals.mfSeq.isRunning) {
            MfGlobals.mfSeq.toggleStartStop()
        }
        Utils.displayStatusBar("External MIDI start received")
    }

    handleExternalContinue = () => {
        if (!MfGlobals.mfSeq.isRunning) {
            MfGlobals.mfSeq.toggleStartStop()
        }
        Utils.displayStatusBar("External MIDI continue received")
    }

    handleExternalStop = () => {
        if (MfGlobals.mfSeq.isRunning) {
            MfGlobals.mfSeq.toggleStartStop()
        }
        this.resetExternalClockTracking()
        Utils.displayStatusBar("External MIDI stop received")
    }

    handleExternalClock = () => {
        const now = performance.now()
        if (!this.clockStartTime) {
            this.clockStartTime = now
        }

        if (this.clockPulseTimes.length > 0) {
            const delta = now - this.clockPulseTimes[this.clockPulseTimes.length - 1]
            if (delta > 0) {
                this.clockPulseTimes.push(now)
                if (this.clockPulseTimes.length > 24) {
                    this.clockPulseTimes.shift()
                }
                const bpm = this.estimateExternalBpm()
                if (Number.isFinite(bpm) && bpm > 0) {
                    MfGlobals.mfSeq.setBpm(Math.round(bpm * 100) / 100)
                }
            }
        } else {
            this.clockPulseTimes.push(now)
        }

        if (!MfGlobals.mfSeq.isRunning) {
            MfGlobals.mfSeq.toggleStartStop()
        }
    }

    estimateExternalBpm = () => {
        if (this.clockPulseTimes.length < 2) {
            return null
        }

        const intervals = []
        for (let i = 1; i < this.clockPulseTimes.length; i++) {
            intervals.push(this.clockPulseTimes[i] - this.clockPulseTimes[i - 1])
        }

        const avgIntervalMs = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
        if (!avgIntervalMs || avgIntervalMs <= 0) {
            return null
        }

        return 60000 / (avgIntervalMs * 24)
    }

    triggerMappedTrack = async (noteNumber) => {
        const pattern = MfGlobals.patterns?.[MfGlobals.selectedPatternNum]
        if (!pattern) {
            console.info(`${MfMidi.TAG}: No current pattern available`)
            return
        }

        const trackIndex = this.instrumentsManager.findTrackIndexFromMidi(pattern, 10, noteNumber)
        if (trackIndex < 0) {
            console.info(`${MfMidi.TAG}: No GM track mapped for MIDI note ${noteNumber} on channel 10`)
            return
        }

        if (MfGlobals.audioCtx && MfGlobals.audioCtx.state === 'suspended') {
            try {
                await MfGlobals.audioCtx.resume()
            } catch (error) {
                console.warn(`${MfMidi.TAG}: Unable to resume audio context`, error)
            }
        }

        if (MfGlobals.mfSeq) {
            MfGlobals.mfSeq.simpleBeep(trackIndex)
        }
    }
}
