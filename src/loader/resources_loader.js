import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { fixPatterns, getUnloadedSamplesFromDrumkits } from '../patterns/fixer.js'
import { idbGet, idbPut } from '../core/idb.js'
import Utils from '../core/utils.js'

export default class MfResourcesLoader {
    static TAG = "MFResourcesLoader"
    static get KITS_PATH() { return "assets/kits/" }
    static get SCALES_URL() { return "assets/data/scales.json" }
    static get DRUMKITS_URL() { return "assets/data/drumkits.json" }
    static get SONG_URL() { return "assets/data/song.json" }
    static get GENERATED_SOUNDS_URL() { return "assets/data/generated_sounds.json" }
    static get SETTINGS_URL() { return "assets/data/settings.json" }
    static get SETTINGS_KEY() { return 'ordrumbox_settings' }

    constructor(audioCtx = null) {
        this._audioCtx = audioCtx
    }

    get audioCtx() {
        if (!this._audioCtx) {
            const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext
            if (!AudioContextCtor) {
                throw new Error('AudioContext is not available in this runtime')
            }
            this._audioCtx = new AudioContextCtor()
        }
        if (serviceRegistry.audioCtx !== this._audioCtx) {
            serviceRegistry.audioCtx = this._audioCtx
        }
        return this._audioCtx
    }

    isDrumkitListLoaded = false
    isPatternsLoading = false
    patternsLoadFailed = false
    isSamplesLoading = false
    samplesLoadFailed = false

    async ensureResourcesLoaded() {

        // 1. Load Patterns if missing
        if (appState.patterns.length === 0) {
            if (this.isPatternsLoading || this.patternsLoadFailed) return
            this.isPatternsLoading = true
            try {
                await this.loadSong(MfResourcesLoader.SONG_URL)
                this.isPatternsLoading = false
            } catch (error) {
                this.isPatternsLoading = false
                this.patternsLoadFailed = true
                throw error
            }
        }

        // 1b. Load Settings from localStorage (or fallback to JSON file)
        if (!soundRegistry.settings._loaded) {
            await this.loadSettings()
            soundRegistry.settings._loaded = true
        }

        // 2. Load Drumkit List if missing (needed for samples)
        if (soundRegistry.drumkitList.length === 0) {
            await this.loadDrumkitList(MfResourcesLoader.DRUMKITS_URL)
        }

        // 3. Load Samples if missing
        if (Object.keys(soundRegistry.sounds).length === 0) {
            if (this.isSamplesLoading || this.samplesLoadFailed) return
            const drumkit = soundRegistry.drumkitList[0]
            if (!drumkit) {
                this.samplesLoadFailed = true
                return
            }
            this.isSamplesLoading = true
            try {
                await this.loadSamplesFromDrumkit(drumkit)
                this.isSamplesLoading = false
            } catch (error) {
                this.isSamplesLoading = false
                this.samplesLoadFailed = true
                throw error
            }
        }
    }

    async loadJsonResource(file) {
        try {
            const response = await fetch(file)
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} for ${file}`)
            }
            return await response.json()
        } catch (error) {
            console.error(`MfResourcesLoader::loadJsonResource: ${file}`, error)
            throw error
        }
    }

    async loadDrumkitList(file) {
        const jsonDrumkits = await this.loadJsonResource(file)
        soundRegistry.drumkitList.length = 0
        Object.values(jsonDrumkits).forEach((drumkit) => {
            soundRegistry.drumkitList.push(drumkit)
        })
        this.isDrumkitListLoaded = true
    }

    async loadScales(file) {
        const scales = await this.loadJsonResource(file)
        Object.assign(soundRegistry.scales, scales)
    }

    async loadGeneratedSounds(file) {
        const generatedSounds = await this.loadJsonResource(file)
        Object.assign(soundRegistry.generatedSounds, generatedSounds)
    }

    async loadSettings() {
        const defaults = { version: 1, sampleDirs: [], maxSampleDirs: 10 }
        try {
            const raw = await idbGet('settings', MfResourcesLoader.SETTINGS_KEY)
            if (raw) {
                Object.assign(soundRegistry.settings, defaults, raw)
                return
            }
        } catch { /* IndexedDB unavailable or empty */ }
        try {
            const settings = await this.loadJsonResource(MfResourcesLoader.SETTINGS_URL)
            Object.assign(soundRegistry.settings, defaults, settings)
        } catch { /* file not found — use defaults */ }
    }

    async saveSettings() {
        const { version, sampleDirs, maxSampleDirs } = soundRegistry.settings
        try {
            await idbPut('settings', MfResourcesLoader.SETTINGS_KEY, { version, sampleDirs, maxSampleDirs })
        } catch { /* IndexedDB unavailable */ }
    }

    async loadSong(file) {
        this.isPatternsComplete = false
        const json = await this.loadJsonResource(file)
        const patterns = json.patterns ?? json
        appState.songInfos = {
            name: json.infos?.name ?? '',
            description: json.infos?.description ?? '',
            date: json.infos?.date ?? '',
        }
        const fixedPatterns = this.fix(Array.isArray(patterns) ? patterns : Object.values(patterns))
        appState.patterns.length = 0
        fixedPatterns.forEach((pattern) => {
            if (pattern?.tracks) {
                Utils.getTracksArray(pattern).forEach((trk) => {
                    if (trk?.soundId && trk.soundId !== "NOT_DEFINED") {
                        if (trk.useAutoAssignSound !== false) {
                            trk.soundId = "NOT_DEFINED"
                        }
                    }
                })
            }
            serviceRegistry.mfCmd.importPatternFromJson(pattern)
        })
    }



    onSoundsProgress = (progress) => {
        if (typeof document === 'undefined') return
        const progressBar = document.getElementById("resourcesProgressBar")
        if (progressBar) {
            progressBar.value = progress
        }
    }

    getUnloadedSamplesFromDrumkits = (drumkits) => {
        return getUnloadedSamplesFromDrumkits(drumkits, soundRegistry.sounds)
    }

    loadMissingSamplesFromDrumkits = async (drumkits) => {
        const samplesToLoad = this.getUnloadedSamplesFromDrumkits(drumkits)

        let nbLoad = 0
        const nbToLoad = samplesToLoad.length

        if (nbToLoad === 0) {
            return []
        }

        const updateProgress = () => {
            this.onSoundsProgress(Math.floor(nbLoad * 100 / nbToLoad))
        }

        const results = await Promise.all(samplesToLoad.map(async ({ sample, kitName }) => {
            try {
                return await this.loadSample(sample, kitName)
            } catch (error) {
                console.error("MfResourcesLoader::loadSample error " + sample.url, error)
                return null
            } finally {
                nbLoad++
                updateProgress()
            }
        }))
        return results.filter(Boolean)
    }

    loadSamplesFromDrumkit = (drumkit) => {
        return this.loadMissingSamplesFromDrumkits([drumkit])
    }

    loadSample = async (sample, kit_name) => {
        const response = await fetch(MfResourcesLoader.KITS_PATH + sample.url)
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        const buffer = await this.audioCtx.decodeAudioData(arrayBuffer)
        const sound = {
            kit_name: kit_name,
            url: sample.url,
            key: sample.key,
            index: Object.keys(soundRegistry.sounds).length + 1,
            display_name: sample.display_name,
            buffer: buffer,
            duration: Math.floor(buffer.duration * 1000),
            isLoad: true,
            playStatus: false,
            rootMidi: sample.rootMidi ?? null,
            peakDb: sample.peakDb ?? null,
            decay: sample.decay ?? null,
        }
        soundRegistry.sounds[sample.url] = sound
        return sound
    }

    fix = (patterns) => {
        return fixPatterns(JSON.parse(JSON.stringify(patterns)))
    }
}
