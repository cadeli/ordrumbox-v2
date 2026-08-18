import { isMidiSupported } from '../logic/midi/midi_parser.js'

const ACTIVITY_FLASH_MS = 120

export default class MidiIndicatorView {
    constructor(container) {
        this._container = container
        this._midiManager = null
        this._activityTimer = null

        this._onStatusChange = () => this.sync(this._midiManager)
        this._onActivity = () => this._flashActivity()
    }

    connect(midiManager) {
        if (this._midiManager === midiManager) return
        this.disconnect()
        this._midiManager = midiManager
        if (midiManager) {
            midiManager.addEventListener('statusChange', this._onStatusChange)
            midiManager.addEventListener('activity', this._onActivity)
        }
    }

    disconnect() {
        if (this._midiManager) {
            this._midiManager.removeEventListener('statusChange', this._onStatusChange)
            this._midiManager.removeEventListener('activity', this._onActivity)
            this._midiManager = null
        }
    }

    sync(midiManager) {
        if (midiManager) {
            const s = midiManager.getStatus()
            this._setLedState('midiSupportLed', s.supported, s.supported ? 'Supported' : 'Unavailable')
            this._setLedState('midiReadyLed', s.ready, s.ready ? 'Ready' : 'Locked')
            this._setLedState('midiConnectedLed', s.inputCount > 0, s.inputCount > 0 ? `${s.inputCount} input(s)` : 'None')
            this._setLedState('midiSyncLed', s.syncEnabled, s.syncEnabled ? 'External' : 'Internal')
        } else {
            const support = isMidiSupported()
            this._setLedState('midiSupportLed', support, support ? 'Supported' : 'Unavailable')
            this._setLedState('midiReadyLed', false, 'Locked')
            this._setLedState('midiConnectedLed', false, 'None')
            this._setLedState('midiSyncLed', false, 'Internal')
            this._setLedState('midiActivityLed', false, 'Idle')
        }
    }

    _setLedState(ledId, isOn, label) {
        const led = this._container.querySelector(`#${ledId}`)
        const text = this._container.querySelector(`#${ledId.replace('Led', 'Label')}`)
        if (led) {
            led.classList.toggle('midi-indicator-on', !!isOn)
            led.classList.toggle('midi-indicator-off', !isOn)
        }
        if (text) {
            text.textContent = label
        }
    }

    _flashActivity() {
        const led = this._container.querySelector('#midiActivityLed')
        const label = this._container.querySelector('#midiActivityLabel')
        if (led) {
            led.classList.add('midi-indicator-on')
            led.classList.remove('midi-indicator-off')
        }
        if (label) {
            label.textContent = 'Activity'
        }

        if (this._activityTimer) {
            clearTimeout(this._activityTimer)
        }
        this._activityTimer = setTimeout(() => {
            if (led) {
                led.classList.add('midi-indicator-off')
                led.classList.remove('midi-indicator-on')
            }
            if (label) {
                label.textContent = 'Idle'
            }
        }, ACTIVITY_FLASH_MS)
    }
}
