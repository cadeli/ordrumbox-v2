/**
 * @vitest-environment jsdom
 *
 * Tests for the AudioWorklet toggle row in the Output panel.
 * Verifies the checkbox + status badge, the click handler that
 * triggers AudioEngine.upgradeToWorklets, and the onWorkletStatusChange event.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import OutputPanel from '../src/ui/output_panel.js'

vi.mock('../src/patterns/engine.js', () => ({
    computeFlatNotesFromPattern: vi.fn(() => new Map()),
}))

vi.mock('../src/logic/services/instruments_manager.js', () => ({
    default: class { },
}))

function makeAudioCtx() {
    return {
        sampleRate: 44100,
        currentTime: 0,
        destination: {},
        audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
        createGain: vi.fn(() => ({ gain: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(function () { return this }), disconnect: vi.fn() })),
        createBiquadFilter: vi.fn(() => ({
            type: 'allpass',
            frequency: { value: 1000, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            Q: { value: 1, setValueAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createDynamicsCompressor: vi.fn(() => ({
            threshold: { value: 0, setValueAtTime: vi.fn() },
            knee: { value: 0, setValueAtTime: vi.fn() },
            ratio: { value: 1, setValueAtTime: vi.fn() },
            attack: { value: 0, setValueAtTime: vi.fn() },
            release: { value: 0, setValueAtTime: vi.fn() },
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
        createAnalyser: vi.fn(() => ({
            fftSize: 0,
            frequencyBinCount: 512,
            connect: vi.fn(function () { return this }),
            disconnect: vi.fn()
        })),
    }
}

describe('OutputPanel — Worklet toggle', () => {
    let panel, container, checkbox, badge

    beforeEach(() => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        // Clean up any leftover panels from previous tests
        document.body.innerHTML = ''

        // Stub canvas getContext for jsdom
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
            fillStyle: '',
            fillRect: vi.fn(),
            clearRect: vi.fn(),
        }))

        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        soundRegistry.drumkitList = [
            { name: 'real', instruments: [{ key: 'KICK', url: 'real/kick.wav' }] }
        ]
        soundRegistry.sounds = {
            'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: {} }
        }

        const ctx = makeAudioCtx()
        const fakeEngine = {
            audioCtx: ctx,
            mixer: {
                masterGain: ctx.createGain(),
                lowcutFilter: ctx.createBiquadFilter(),
                hicutFilter: ctx.createBiquadFilter(),
                compressor: ctx.createDynamicsCompressor(),
            },
            getAnalyserData: () => null,
        }
        serviceRegistry.audioEngine = fakeEngine

        panel = new OutputPanel()
        panel.init()
        container = panel.container
        checkbox = container.querySelector('#op-use-worklets')
        badge = container.querySelector('#op-worklet-status')
    })

    it('renders the worklet toggle row with initial OFF state', () => {
        expect(checkbox).toBeTruthy()
        expect(badge).toBeTruthy()
        expect(checkbox.checked).toBe(false)
        expect(badge.textContent).toBe('OFF')
        expect(badge.classList.contains('op-status-off')).toBe(true)
    })

    it('marks checkbox as checked and shows ACTIVE when workletStatus is active', () => {
        appState.workletStatus = 'active'
        appState.useWorklets = 1
        panel.show()
        expect(checkbox.checked).toBe(true)
        expect(badge.textContent).toBe('ACTIVE')
        expect(badge.classList.contains('op-status-active')).toBe(true)
        expect(checkbox.disabled).toBe(true)
    })

    it('shows UNAVAILABLE status and unchecks when workletStatus is unavailable', () => {
        appState.workletStatus = 'unavailable'
        appState.useWorklets = 0
        panel.show()
        expect(checkbox.checked).toBe(false)
        expect(badge.textContent).toBe('UNAVAILABLE')
        expect(badge.classList.contains('op-status-unavailable')).toBe(true)
    })

    it('clicking the checkbox calls engine.upgradeToWorklets and flips useWorklets on', async () => {
        const upgradeSpy = vi.fn().mockResolvedValue(true)
        serviceRegistry.audioEngine.upgradeToWorklets = upgradeSpy

        checkbox.checked = true
        checkbox.dispatchEvent(new Event('change'))

        expect(appState.useWorklets).toBe(1)
        await Promise.resolve()
        await Promise.resolve()
        expect(upgradeSpy).toHaveBeenCalled()
    })

    it('reverts the checkbox when engine.upgradeToWorklets returns false', async () => {
        const upgradeSpy = vi.fn().mockResolvedValue(false)
        serviceRegistry.audioEngine.upgradeToWorklets = upgradeSpy

        checkbox.checked = true
        checkbox.dispatchEvent(new Event('change'))

        await Promise.resolve()
        await Promise.resolve()

        expect(upgradeSpy).toHaveBeenCalled()
        expect(appState.useWorklets).toBe(0)
        expect(checkbox.checked).toBe(false)
    })

    it('unchecking the checkbox clears useWorklets flag', () => {
        appState.useWorklets = 1
        checkbox.checked = false
        checkbox.dispatchEvent(new Event('change'))
        expect(appState.useWorklets).toBe(0)
    })

    it('responds to onWorkletStatusChange event by re-syncing the UI', () => {
        appState.workletStatus = 'active'
        appState.useWorklets = 1
        playbackEvents.onWorkletStatusChange.forEach(cb => cb('active'))
        expect(badge.textContent).toBe('ACTIVE')
        expect(checkbox.checked).toBe(true)
    })

    it('does nothing if the engine is not in the service registry', () => {
        const saved = serviceRegistry.audioEngine
        serviceRegistry.audioEngine = null
        checkbox.checked = true
        checkbox.dispatchEvent(new Event('change'))
        expect(checkbox.checked).toBe(false)
        serviceRegistry.audioEngine = saved
    })

    it('hides other panels when shown', () => {
        const te = document.createElement('div')
        te.id = 'te-panel'
        const ne = document.createElement('div')
        ne.id = 'ne-panel'
        const tools = document.createElement('div')
        tools.id = 'tools-panel'
        const about = document.createElement('div')
        about.id = 'about-panel'
        te.style.display = 'block'
        ne.style.display = 'block'
        tools.style.display = 'block'
        about.style.display = 'block'
        document.body.appendChild(te)
        document.body.appendChild(ne)
        document.body.appendChild(tools)
        document.body.appendChild(about)

        panel.show()
        expect(te.style.display).toBe('none')
        expect(ne.style.display).toBe('none')
        expect(tools.style.display).toBe('none')
        expect(about.style.display).toBe('none')
    })
})
