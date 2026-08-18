/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function makeLedPair() {
    const led = document.createElement('button')
    led.className = 'lfo-led midi-indicator-off'
    const label = document.createElement('span')
    label.className = 'ne-val'
    label.textContent = ''
    return { led, label }
}

function buildMidiContainer() {
    const container = document.createElement('div')
    const ids = [
        'midiSupportLed', 'midiSupportLabel',
        'midiReadyLed', 'midiReadyLabel',
        'midiConnectedLed', 'midiConnectedLabel',
        'midiSyncLed', 'midiSyncLabel',
        'midiActivityLed', 'midiActivityLabel',
    ]
    for (const id of ids) {
        const el = document.createElement(id.includes('Led') ? 'button' : 'span')
        el.id = id
        el.className = id.includes('Led') ? 'lfo-led midi-indicator-off' : 'ne-val'
        container.appendChild(el)
    }
    return container
}

function makeMidiManager(overrides = {}) {
    return Object.assign(new EventTarget(), {
        getStatus: vi.fn().mockReturnValue({
            supported: true,
            ready: false,
            inputCount: 0,
            outputCount: 0,
            syncEnabled: false,
            ...overrides,
        }),
    })
}

describe('MidiIndicatorView', () => {
    let MidiIndicatorView

    beforeEach(async () => {
        const mod = await import('../src/ui/midi_indicator_view.js')
        MidiIndicatorView = mod.default
    })

    it('sync(null) sets default inactive state', () => {
        const container = buildMidiContainer()
        const view = new MidiIndicatorView(container)
        view.sync(null)

        expect(container.querySelector('#midiReadyLabel').textContent).toBe('Locked')
        expect(container.querySelector('#midiConnectedLabel').textContent).toBe('None')
        expect(container.querySelector('#midiSyncLabel').textContent).toBe('Internal')
    })

    it('sync(manager) reads getStatus and updates LEDs', () => {
        const container = buildMidiContainer()
        const view = new MidiIndicatorView(container)
        const manager = makeMidiManager({ ready: true, inputCount: 2, syncEnabled: true })

        view.sync(manager)

        expect(container.querySelector('#midiReadyLabel').textContent).toBe('Ready')
        expect(container.querySelector('#midiConnectedLabel').textContent).toBe('2 input(s)')
        expect(container.querySelector('#midiSyncLabel').textContent).toBe('External')
    })

    it('sync(manager) toggles indicator classes', () => {
        const container = buildMidiContainer()
        const view = new MidiIndicatorView(container)
        const manager = makeMidiManager({ ready: true })

        view.sync(manager)

        const readyLed = container.querySelector('#midiReadyLed')
        expect(readyLed.classList.contains('midi-indicator-on')).toBe(true)
        expect(readyLed.classList.contains('midi-indicator-off')).toBe(false)
    })

    it('connect subscribes to statusChange events', () => {
        const container = buildMidiContainer()
        const view = new MidiIndicatorView(container)
        const manager = makeMidiManager({ ready: true })

        view.connect(manager)
        manager.dispatchEvent(new Event('statusChange'))

        expect(container.querySelector('#midiReadyLabel').textContent).toBe('Ready')
    })

    it('connect is idempotent', () => {
        const container = buildMidiContainer()
        const view = new MidiIndicatorView(container)
        const manager = makeMidiManager()

        view.connect(manager)
        view.connect(manager)

        manager.dispatchEvent(new Event('statusChange'))
        manager.dispatchEvent(new Event('statusChange'))
    })

    it('disconnect stops receiving events', () => {
        const container = buildMidiContainer()
        const view = new MidiIndicatorView(container)
        const manager = makeMidiManager({ ready: true })

        view.connect(manager)
        view.disconnect()
        manager.dispatchEvent(new Event('statusChange'))

        view.sync(null)
        expect(container.querySelector('#midiReadyLabel').textContent).toBe('Locked')
    })

    it('flashActivity shows Activity then reverts to Idle', () => {
        vi.useFakeTimers()
        const container = buildMidiContainer()
        const view = new MidiIndicatorView(container)

        view._flashActivity()
        expect(container.querySelector('#midiActivityLabel').textContent).toBe('Activity')
        expect(container.querySelector('#midiActivityLed').classList.contains('midi-indicator-on')).toBe(true)

        vi.advanceTimersByTime(150)
        expect(container.querySelector('#midiActivityLabel').textContent).toBe('Idle')
        expect(container.querySelector('#midiActivityLed').classList.contains('midi-indicator-off')).toBe(true)

        vi.useRealTimers()
    })

    it('activity event triggers flash', () => {
        vi.useFakeTimers()
        const container = buildMidiContainer()
        const view = new MidiIndicatorView(container)
        const manager = makeMidiManager()

        view.connect(manager)
        manager.dispatchEvent(new Event('activity'))

        expect(container.querySelector('#midiActivityLabel').textContent).toBe('Activity')

        vi.advanceTimersByTime(150)
        expect(container.querySelector('#midiActivityLabel').textContent).toBe('Idle')

        vi.useRealTimers()
    })

    it('rapid activity resets timer', () => {
        vi.useFakeTimers()
        const container = buildMidiContainer()
        const view = new MidiIndicatorView(container)

        view._flashActivity()
        vi.advanceTimersByTime(80)
        view._flashActivity()
        vi.advanceTimersByTime(80)
        expect(container.querySelector('#midiActivityLabel').textContent).toBe('Activity')

        vi.advanceTimersByTime(80)
        expect(container.querySelector('#midiActivityLabel').textContent).toBe('Idle')

        vi.useRealTimers()
    })
})
