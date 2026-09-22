import { isMidiSupported } from '../logic/midi/midi_parser.js'

const ACTIVITY_FLASH_MS = 120

export default class MidiIndicatorView {
    #container;
    #midiManager;
    #activityTimer;
    #onActivity;
    #onStatusChange;

    flashActivity() { this.#flashActivity() }

    constructor(container) {
        this.#container = container
        this.#midiManager = null
        this.#activityTimer = null

        this.#onStatusChange = () => this.sync(this.#midiManager)
        this.#onActivity = () => this.#flashActivity()
    }

    connect(midiManager) {
        if (this.#midiManager === midiManager) return
        this.disconnect()
        this.#midiManager = midiManager
        if (midiManager) {
            midiManager.addEventListener('statusChange', this.#onStatusChange)
            midiManager.addEventListener('activity', this.#onActivity)
        }
    }

    disconnect() {
        if (this.#midiManager) {
            this.#midiManager.removeEventListener('statusChange', this.#onStatusChange)
            this.#midiManager.removeEventListener('activity', this.#onActivity)
            this.#midiManager = null
        }
    }

    sync(midiManager) {
        if (midiManager) {
            const s = midiManager.getStatus()
            this.#setLedState('midiSupportLed', s.supported, s.supported ? 'Supported' : 'Unavailable')
            this.#setLedState('midiReadyLed', s.ready, s.ready ? 'Ready' : 'Locked')
            this.#setLedState('midiConnectedLed', s.inputCount > 0, s.inputCount > 0 ? `${s.inputCount} input(s)` : 'None')
            this.#setLedState('midiSyncLed', s.syncEnabled, s.syncEnabled ? 'External' : 'Internal')
        } else {
            const support = isMidiSupported()
            this.#setLedState('midiSupportLed', support, support ? 'Supported' : 'Unavailable')
            this.#setLedState('midiReadyLed', false, 'Locked')
            this.#setLedState('midiConnectedLed', false, 'None')
            this.#setLedState('midiSyncLed', false, 'Internal')
            this.#setLedState('midiActivityLed', false, 'Idle')
        }
    }

    #setLedState(ledId, isOn, label) {
        const led = this.#container.querySelector(`#${ledId}`)
        const text = this.#container.querySelector(`#${ledId.replace('Led', 'Label')}`)
        if (led) {
            led.classList.toggle('midi-indicator-on', !!isOn)
            led.classList.toggle('midi-indicator-off', !isOn)
        }
        if (text) {
            text.textContent = label
        }
    }

    #flashActivity() {
        const led = this.#container.querySelector('#midiActivityLed')
        const label = this.#container.querySelector('#midiActivityLabel')
        if (led) {
            led.classList.add('midi-indicator-on')
            led.classList.remove('midi-indicator-off')
        }
        if (label) {
            label.textContent = 'Activity'
        }

        if (this.#activityTimer) {
            clearTimeout(this.#activityTimer)
        }
        this.#activityTimer = setTimeout(() => {
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
