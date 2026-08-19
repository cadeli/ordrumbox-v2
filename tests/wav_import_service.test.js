import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDecodeAudioData = vi.fn().mockResolvedValue({
    duration: 0.5,
    numberOfChannels: 1,
    sampleRate: 44100,
    length: 22050,
    getChannelData: () => new Float32Array(22050),
})

const mockCacheSample = vi.fn().mockResolvedValue(undefined)
const mockCacheDrumkits = vi.fn().mockResolvedValue(undefined)

vi.mock('../src/cache/idb_cache.js', () => ({
    cacheSample: (...a) => mockCacheSample(...a),
    cacheDrumkits: (...a) => mockCacheDrumkits(...a),
}))

vi.mock('../src/ui/toast.js', () => ({
    showToast: vi.fn(),
}))

const mockPlaybackEmit = vi.fn()
vi.mock('../src/state/playback_events.js', () => ({
    playbackEvents: {
        emit: (...a) => mockPlaybackEmit(...a),
    },
    __esModule: true,
}))

const sharedSoundRegistry = {
    sounds: {},
    drumkitList: [],
    drumkits: {},
}

vi.mock('../src/state/service_registry.js', () => ({
    serviceRegistry: {
        audioCtx: {
            decodeAudioData: (...a) => mockDecodeAudioData(...a),
        },
        cmd: null,
    },
    getAutoAssignService: vi.fn().mockResolvedValue({
        autoAssignSounds: vi.fn(),
    }),
    __esModule: true,
}))

const sharedAppState = {
    patterns: [],
    selectedPatternNum: 0,
    selectedDrumkitNum: 0,
}

vi.mock('../src/state/app_state.js', () => ({
    appState: sharedAppState,
    __esModule: true,
}))

vi.mock('../src/state/sound_registry.js', () => ({
    soundRegistry: sharedSoundRegistry,
    __esModule: true,
}))

function makeWavFile(name, webkitRelativePath = '') {
    const buffer = new ArrayBuffer(100)
    const blob = new Blob([buffer], { type: 'audio/wav' })
    const file = new File([blob], name, { type: 'audio/wav' })
    Object.defineProperty(file, 'webkitRelativePath', { value: webkitRelativePath })
    return file
}

describe('WavImportService', () => {
    let WavImportService

    beforeEach(async () => {
        vi.restoreAllMocks()
        mockDecodeAudioData.mockClear()
        mockCacheSample.mockClear()
        mockCacheDrumkits.mockClear()
        mockPlaybackEmit.mockClear()

        sharedSoundRegistry.sounds = {}
        sharedSoundRegistry.drumkitList = []
        sharedSoundRegistry.drumkits = {}
        sharedAppState.selectedDrumkitNum = 0
        sharedAppState.patterns = []
        sharedAppState.selectedPatternNum = 0

        const mod = await import('../src/logic/services/wav_import_service.js')
        WavImportService = mod.default
    })

    it('imports a directory of WAV files as a drumkit', async () => {
        const files = [
            makeWavFile('kick.wav', 'my_drums/kick.wav'),
            makeWavFile('snare.wav', 'my_drums/snare.wav'),
        ]
        const service = new WavImportService()
        const result = await service.importDirectory(files)

        expect(result.kitName).toBe('my_drums')
        expect(result.fileCount).toBe(2)
    })

    it('registers sounds in soundRegistry', async () => {
        const files = [makeWavFile('kick.wav', 'my_drums/kick.wav')]
        const service = new WavImportService()
        await service.importDirectory(files)

        expect(sharedSoundRegistry.sounds['kick.wav']).toBeDefined()
        expect(sharedSoundRegistry.sounds['kick.wav'].kit_name).toBe('my_drums')
        expect(sharedSoundRegistry.sounds['kick.wav'].isLoad).toBe(true)
    })

    it('registers drumkit in soundRegistry', async () => {
        const files = [makeWavFile('kick.wav', 'my_drums/kick.wav')]
        const service = new WavImportService()
        await service.importDirectory(files)

        expect(sharedSoundRegistry.drumkits['my_drums']).toBeDefined()
        expect(sharedSoundRegistry.drumkits['my_drums'].instruments).toHaveLength(1)
    })

    it('adds drumkit to drumkitList', async () => {
        const files = [
            makeWavFile('kick.wav', 'my_drums/kick.wav'),
            makeWavFile('hat.wav', 'my_drums/hat.wav'),
        ]
        const service = new WavImportService()
        await service.importDirectory(files)

        const kit = sharedSoundRegistry.drumkitList.find(d => d.name === 'my_drums')
        expect(kit).toBeDefined()
        expect(kit.instruments).toHaveLength(2)
    })

    it('updates selectedDrumkitNum', async () => {
        const files = [makeWavFile('kick.wav', 'my_drums/kick.wav')]
        const service = new WavImportService()
        await service.importDirectory(files)

        expect(sharedAppState.selectedDrumkitNum).toBeGreaterThanOrEqual(0)
    })

    it('decodes audio data for each file', async () => {
        const files = [
            makeWavFile('kick.wav', 'my_drums/kick.wav'),
            makeWavFile('snare.wav', 'my_drums/snare.wav'),
        ]
        const service = new WavImportService()
        await service.importDirectory(files)

        expect(mockDecodeAudioData).toHaveBeenCalledTimes(2)
    })

    it('caches samples to IDB', async () => {
        const files = [makeWavFile('kick.wav', 'my_drums/kick.wav')]
        const service = new WavImportService()
        await service.importDirectory(files)

        expect(mockCacheSample).toHaveBeenCalledWith('kick.wav', expect.any(ArrayBuffer))
    })

    it('caches drumkits to IDB', async () => {
        const files = [makeWavFile('kick.wav', 'my_drums/kick.wav')]
        const service = new WavImportService()
        await service.importDirectory(files)

        expect(mockCacheDrumkits).toHaveBeenCalledWith(
            expect.objectContaining({ 'my_drums': expect.any(Object) })
        )
    })

    it('emits drumkitChange event', async () => {
        const files = [makeWavFile('kick.wav', 'my_drums/kick.wav')]
        const service = new WavImportService()
        await service.importDirectory(files)

        expect(mockPlaybackEmit).toHaveBeenCalledWith('drumkitChange')
    })

    it('shows success toast after import', async () => {
        const { showToast } = await import('../src/ui/toast.js')
        const files = [makeWavFile('kick.wav', 'my_drums/kick.wav')]
        const service = new WavImportService()
        await service.importDirectory(files)

        expect(showToast).toHaveBeenCalledWith(
            expect.stringContaining('Imported 1 WAV files'),
            'success'
        )
    })

    it('returns 0 files for directory with no audio files', async () => {
        const files = [makeWavFile('readme.txt', 'my_drums/readme.txt')]
        const service = new WavImportService()
        const result = await service.importDirectory(files)

        expect(result.fileCount).toBe(0)
        expect(result.kitName).toBe('')
    })

    it('shows warning for empty directory', async () => {
        const { showToast } = await import('../src/ui/toast.js')
        const files = [makeWavFile('readme.txt', 'my_drums/readme.txt')]
        const service = new WavImportService()
        await service.importDirectory(files)

        expect(showToast).toHaveBeenCalledWith(
            expect.stringContaining('No audio files found'),
            'warning'
        )
    })

    it('updates existing drumkit if name matches', async () => {
        sharedSoundRegistry.drumkitList.push({ name: 'my_drums', instruments: [] })

        const files = [makeWavFile('kick.wav', 'my_drums/kick.wav')]
        const service = new WavImportService()
        await service.importDirectory(files)

        const kit = sharedSoundRegistry.drumkitList.find(d => d.name === 'my_drums')
        expect(kit.instruments).toHaveLength(1)
        expect(sharedAppState.selectedDrumkitNum).toBe(0)
    })

    it('assigns instrument keys via InstrumentsManager', async () => {
        const files = [makeWavFile('kick.wav', 'my_drums/kick.wav')]
        const service = new WavImportService()
        await service.importDirectory(files)

        const sound = sharedSoundRegistry.sounds['kick.wav']
        expect(sound.key).toBeDefined()
        expect(typeof sound.key).toBe('string')
    })
})
