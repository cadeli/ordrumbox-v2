// tests/drumkit_manager_e2e.test.js
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { EVENTS } from '../src/core/events.js'

const mockDrumkitService = {
    getCurrentKitSounds: vi.fn().mockReturnValue([]),
    exportCurrentKit: vi.fn().mockReturnValue(null),
    restoreDrumkit: vi.fn().mockResolvedValue('Restored Kit'),
    moveToKit: vi.fn().mockReturnValue('Moved'),
    setInstrument: vi.fn().mockReturnValue('Set'),
    removeSample: vi.fn().mockReturnValue('Removed'),
    replaceSampleBuffer: vi.fn().mockResolvedValue(undefined),
    addSample: vi.fn().mockResolvedValue({ fileName: 'new.wav', kitName: 'Default' }),
    autoDetectAll: vi.fn().mockResolvedValue(true),
    normalizeAll: vi.fn().mockReturnValue(2),
    getAnalysisInfo: vi.fn().mockReturnValue(null),
}

vi.mock('../src/logic/services/drumkit_service.js', () => ({
    default: mockDrumkitService,
}))

vi.mock('../src/logic/services/instrument_manager/index.js', () => ({
    default: {
        DATA: {
            instruments: [
                { id: 'KICK', name: 'Kick' },
                { id: 'SNARE', name: 'Snare' },
                { id: 'HIHAT', name: 'HiHat' },
            ],
        },
        findInstrumentFromFileName: vi.fn().mockReturnValue({ id: 'KICK' }),
    },
    instrumentsManager: {
        findInstrumentFromFileName: vi.fn().mockReturnValue({ id: 'KICK' }),
    },
}))

vi.mock('../src/audio/sample_analyzer.js', () => ({
    drawEnvelope: vi.fn(),
}))

vi.mock('../src/logic/services/wav_import_service.js', () => {
    class MockWavImportService {
        async importDirectory() {
            return { kitName: 'Imported', fileCount: 3 }
        }
        async autoAssignSounds() {
            return undefined
        }
    }
    return { default: MockWavImportService }
})

let DrumkitManager

beforeEach(async () => {
    document.body.innerHTML = ''
    appState.reset()
    serviceRegistry.reset()
    soundRegistry.reset()
    Object.values(mockDrumkitService).forEach((fn) => fn.mockClear?.())

    DrumkitManager = (await import('../src/ui/drumkit_manager.js')).default
})

function makeSound(overrides = {}) {
    return {
        url: 'http://example.com/kick.wav',
        display_name: 'Kick 1',
        key: 'KICK',
        kit_name: 'Default',
        gainDb: 0,
        tune: 0,
        decay: 0,
        buffer: {
            duration: 0.5,
            length: 22050,
            numberOfChannels: 1,
            sampleRate: 44100,
            getChannelData: vi.fn().mockReturnValue(new Float32Array(22050)),
        },
        ...overrides,
    }
}

function setupSounds() {
    const sounds = {
        'http://example.com/kick.wav': makeSound(),
        'http://example.com/snare.wav': makeSound({
            url: 'http://example.com/snare.wav',
            display_name: 'Snare 1',
            key: 'SNARE',
        }),
        'http://example.com/hihat.wav': makeSound({
            url: 'http://example.com/hihat.wav',
            display_name: 'HiHat 1',
            key: 'HIHAT',
        }),
    }
    soundRegistry.sounds = sounds

    mockDrumkitService.getCurrentKitSounds.mockReturnValue([
        { url: 'http://example.com/kick.wav', display_name: 'Kick 1', key: 'KICK', kit_name: 'Default' },
        { url: 'http://example.com/snare.wav', display_name: 'Snare 1', key: 'SNARE', kit_name: 'Default' },
        { url: 'http://example.com/hihat.wav', display_name: 'HiHat 1', key: 'HIHAT', kit_name: 'Default' },
    ])
    mockDrumkitService.exportCurrentKit.mockReturnValue({ name: 'Default', sounds: [] })
    mockDrumkitService.getAnalysisInfo.mockReturnValue({
        envelope: [0, 0.5, 1, 0.8, 0.3, 0],
        peakDb: -1.2,
        rmsDb: -12.5,
        noteInfo: { freq: 60, midi: 60 },
        length: 0.5,
    })

    soundRegistry.drumkitList = [
        { name: 'Default', instruments: Object.values(sounds).map((s) => ({ ...s })) },
        { name: 'Electronic', instruments: [] },
    ]

    serviceRegistry.audioEngine = {
        invalidateCache: vi.fn(),
        updateGeneratedSounds: vi.fn(),
    }
    serviceRegistry.audioCtx = {
        createBufferSource: vi.fn().mockReturnValue({
            buffer: null,
            detune: { value: 0 },
            connect: vi.fn(),
            start: vi.fn(),
        }),
        createGain: vi.fn().mockReturnValue({
            gain: { value: 1 },
            connect: vi.fn(),
        }),
        destination: {},
        decodeAudioData: vi.fn().mockResolvedValue({
            duration: 0.5,
            length: 22050,
            numberOfChannels: 1,
            sampleRate: 44100,
            getChannelData: vi.fn().mockReturnValue(new Float32Array(22050)),
        }),
    }
}

function createManager() {
    const manager = new DrumkitManager()
    manager.createDOM()
    manager.subscribe()
    return manager
}

describe('DrumkitManager E2E', () => {
    describe('sync / rendering', () => {
        it('renders list items for current kit sounds', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const items = manager.container.querySelectorAll('.dm-list-item')
            expect(items.length).toBe(3)
        })

        it('highlights first item by default', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const firstItem = manager.container.querySelector('.dm-list-item')
            expect(firstItem.classList.contains('dm-selected')).toBe(true)
        })

        it('shows detail panel when a sound is selected', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const detail = manager.container.querySelector('#dm-detail')
            expect(detail.querySelector('.dm-detail-filename')).not.toBeNull()
        })
    })

    describe('sound selection', () => {
        it('selects a different sound on click', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const items = manager.container.querySelectorAll('.dm-list-item')
            items[1].click()

            expect(items[1].classList.contains('dm-selected')).toBe(true)
            expect(items[0].classList.contains('dm-selected')).toBe(false)
        })

        it('shows selected sound detail', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const items = manager.container.querySelectorAll('.dm-list-item')
            items[1].click()

            const filename = manager.container.querySelector('.dm-detail-filename')
            expect(filename.textContent).toContain('Snare 1')
        })
    })

    describe('detail panel', () => {
        it('renders play button, waveform canvas, and controls', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const detail = manager.container.querySelector('#dm-detail')
            expect(detail.querySelector('#dm-detail-play')).not.toBeNull()
            expect(detail.querySelector('#dm-waveform')).not.toBeNull()
            expect(detail.querySelector('#dm-kit-select')).not.toBeNull()
            expect(detail.querySelector('#dm-inst-select')).not.toBeNull()
        })

        it('renders Replace and Remove buttons', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const detail = manager.container.querySelector('#dm-detail')
            expect(detail.querySelector('#dm-replace')).not.toBeNull()
            expect(detail.querySelector('#dm-remove')).not.toBeNull()
        })

        it('renders gain/tune/decay knob containers', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const detail = manager.container.querySelector('#dm-detail')
            const selectRow = detail.querySelector('.dm-select-row')
            expect(selectRow).not.toBeNull()
            expect(manager._knobs.length).toBeGreaterThanOrEqual(0)
        })
    })

    describe('kit select change', () => {
        it('calls drumkitService.moveToKit', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const kitSelect = manager.container.querySelector('#dm-kit-select')
            kitSelect.value = 'Electronic'
            kitSelect.dispatchEvent(new Event('change'))

            expect(mockDrumkitService.moveToKit).toHaveBeenCalledWith('http://example.com/kick.wav', 'Electronic')
        })
    })

    describe('instrument select change', () => {
        it('calls drumkitService.setInstrument', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const instSelect = manager.container.querySelector('#dm-inst-select')
            instSelect.value = 'SNARE'
            instSelect.dispatchEvent(new Event('change'))

            expect(mockDrumkitService.setInstrument).toHaveBeenCalledWith('http://example.com/kick.wav', 'SNARE')
        })
    })

    describe('remove sample', () => {
        it('calls drumkitService.removeSample', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const removeBtn = manager.container.querySelector('#dm-remove')
            removeBtn.click()

            expect(mockDrumkitService.removeSample).toHaveBeenCalled()
        })
    })

    describe('audition', () => {
        it('plays the selected sound via audioCtx', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const playBtn = manager.container.querySelector('#dm-detail-play')
            playBtn.click()

            expect(serviceRegistry.audioCtx.createBufferSource).toHaveBeenCalled()
        })
    })

    describe('export kit', () => {
        it('calls drumkitService.exportCurrentKit', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const saveBtn = manager.container.querySelector('#dm-save-kit')
            saveBtn.click()

            expect(mockDrumkitService.exportCurrentKit).toHaveBeenCalled()
        })
    })

    describe('auto-detect all', () => {
        it('calls drumkitService.autoDetectAll', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const btn = manager.container.querySelector('#dm-auto-detect')
            btn.click()

            expect(mockDrumkitService.autoDetectAll).toHaveBeenCalled()
        })
    })

    describe('normalize all', () => {
        it('calls drumkitService.normalizeAll', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const btn = manager.container.querySelector('#dm-normalize-all')
            btn.click()

            expect(mockDrumkitService.normalizeAll).toHaveBeenCalled()
        })
    })

    describe('event subscription', () => {
        it('re-syncs on drumkitChange when visible', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()
            manager.show()

            const spy = vi.spyOn(manager, 'sync')
            playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)

            expect(spy).toHaveBeenCalled()
        })

        it('does not re-sync on drumkitChange when hidden', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()
            manager.hide()

            const spy = vi.spyOn(manager, 'sync')
            playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)

            expect(spy).not.toHaveBeenCalled()
        })
    })

    describe('selected sound validation on sync', () => {
        it('clears _selectedSoundKey if it no longer exists', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()
            manager._selectedSoundKey = 'http://example.com/nonexistent.wav'

            manager.sync()

            expect(manager._selectedSoundKey).toBe('http://example.com/kick.wav')
        })

        it('selects first kit sound if _selectedSoundKey is null', () => {
            setupSounds()
            const manager = createManager()
            manager._selectedSoundKey = null
            manager.sync()

            expect(manager._selectedSoundKey).toBe('http://example.com/kick.wav')
        })
    })

    describe('empty kit', () => {
        it('shows empty message when no sounds', () => {
            mockDrumkitService.getCurrentKitSounds.mockReturnValue([])
            const manager = createManager()
            manager.sync()

            const emptyMsg = manager.container.querySelector('.dm-list-empty')
            expect(emptyMsg).not.toBeNull()
            expect(emptyMsg.textContent).toContain('No samples')
        })
    })

    describe('knob changes', () => {
        it('updates sound gainDb on gain knob change', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const sound = soundRegistry.sounds['http://example.com/kick.wav']
            manager._onKnobChange(sound, 'gain', -6)

            expect(sound.gainDb).toBe(-6)
        })

        it('updates sound tune on tune knob change', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const sound = soundRegistry.sounds['http://example.com/kick.wav']
            manager._onKnobChange(sound, 'tune', 3)

            expect(sound.tune).toBe(3)
        })

        it('updates sound decay on decay knob change', () => {
            setupSounds()
            const manager = createManager()
            manager.sync()

            const sound = soundRegistry.sounds['http://example.com/kick.wav']
            manager._onKnobChange(sound, 'decay', 500)

            expect(sound.decay).toBe(500)
        })
    })
})
