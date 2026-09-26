import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { fixPatterns, getUnloadedSamplesFromDrumkits } from '../patterns/fixer.js'
import { idbGet, idbPut } from '../core/idb.js'
import {
    cachePatterns,
    getCachedPatterns,
    cacheDrumkits,
    getCachedDrumkits,
    cacheSample,
    getCachedSample,
    cacheGeneratedSounds,
    getCachedGeneratedSounds,
} from '../cache/idb_cache.js'
import Utils from '../core/utils.js'
import { logger } from '../core/logger.js'
import { showToast } from '../core/notify.js'
import { EVENTS } from '../core/events.js'

export default class ResourcesLoader {
    static TAG = 'ResourcesLoader'
    static get KITS_PATH() {
        return 'assets/kits/'
    }
    static get SCALES_URL() {
        return 'assets/data/scales.json'
    }
    static get DRUMKITS_URL() {
        return 'assets/data/drumkits.json'
    }
    static get SONG_URL() {
        return 'assets/data/song.json'
    }
    static get GENERATED_SOUNDS_URL() {
        return 'assets/data/generated_sounds.json'
    }
    static get SETTINGS_URL() {
        return 'assets/data/settings.json'
    }
    static get SETTINGS_KEY() {
        return 'ordrumbox_settings'
    }

    #audioCtx
    #autoPersistEnabled

    constructor(audioCtx = null) {
        this.#audioCtx = audioCtx
        this.#autoPersistEnabled = false
        playbackEvents.on(EVENTS.PATTERN_CHANGE, () => {
            if (this.#autoPersistEnabled) this.persistPatterns()
        })
        playbackEvents.on(EVENTS.DRUMKIT_CHANGE, () => this.saveSession())
        playbackEvents.on(EVENTS.SELECTED_PATTERN_CHANGE, () => this.saveSession())
        playbackEvents.on(EVENTS.TRACK_PARAM_CHANGE, () => this.saveSession())
        playbackEvents.on(EVENTS.TOOLS_TOGGLE, () => this.saveSession())
        playbackEvents.on(EVENTS.DRUMKIT_MANAGER_TOGGLE, () => this.saveSession())
        playbackEvents.on(EVENTS.SONG_TOGGLE, () => this.saveSession())
        playbackEvents.on(EVENTS.ABOUT_TOGGLE, () => this.saveSession())
        playbackEvents.on(EVENTS.MASTER_TOGGLE, () => this.saveSession())
        playbackEvents.on(EVENTS.SYNTH_TOGGLE, () => this.saveSession())
        playbackEvents.on(EVENTS.EDIT_TOGGLE, () => this.saveSession())
        playbackEvents.on(EVENTS.PROLL_TOGGLE, () => this.saveSession())
    }

    get audioCtx() {
        if (!this.#audioCtx) {
            const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext
            if (!AudioContextCtor) {
                throw new Error('AudioContext is not available in this runtime')
            }
            this.#audioCtx = new AudioContextCtor()
        }
        if (serviceRegistry.audioCtx !== this.#audioCtx) {
            serviceRegistry.audioCtx = this.#audioCtx
        }
        return this.#audioCtx
    }

    isDrumkitListLoaded = false
    patternsLoadFailed = false
    samplesLoadFailed = false
    /** @type {Promise<void> | null} In-flight single-flight promise for pattern loading */
    _patternsLoadingPromise = null
    /** @type {Promise<void> | null} In-flight single-flight promise for sample loading */
    _samplesLoadingPromise = null

    async ensureResourcesLoaded() {
        // 1. Load Patterns if missing
        if (appState.patterns.length === 0) {
            if (this.patternsLoadFailed) return
            if (!this._patternsLoadingPromise) {
                this._patternsLoadingPromise = this.loadSong(ResourcesLoader.SONG_URL)
                    .catch((err) => {
                        this.patternsLoadFailed = true
                        throw err
                    })
                    .finally(() => {
                        this._patternsLoadingPromise = null
                    })
            }
            await this._patternsLoadingPromise
        }

        // 1b. Load Settings from localStorage (or fallback to JSON file)
        if (!soundRegistry.settings._loaded) {
            await this.loadSettings()
            soundRegistry.settings._loaded = true
        }

        // 2. Load Drumkit List if missing (needed for samples)
        if (soundRegistry.drumkitList.length === 0) {
            await this.loadDrumkitList(ResourcesLoader.DRUMKITS_URL)
        }

        // 3. Load Samples if missing
        if (Object.keys(soundRegistry.sounds).length === 0) {
            if (this.samplesLoadFailed) return
            const drumkit = soundRegistry.drumkitList[0]
            if (!drumkit) {
                this.samplesLoadFailed = true
                return
            }
            if (!this._samplesLoadingPromise) {
                this._samplesLoadingPromise = this.loadSamplesFromDrumkit(drumkit)
                    .catch((err) => {
                        this.samplesLoadFailed = true
                        throw err
                    })
                    .finally(() => {
                        this._samplesLoadingPromise = null
                    })
            }
            await this._samplesLoadingPromise
        }

        // 3b. Load the samples referenced by the patterns: an explicitly
        // assigned sound can live in another drumkit than the one loaded above,
        // and without this step those tracks stay silent after a reload.
        if (appState.patterns.length > 0) {
            await this.loadSamplesForPatterns(appState.patterns)
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
            logger.error('ResourcesLoader', `ResourcesLoader::loadJsonResource: ${file}`, error)
            throw error
        }
    }

    async loadDrumkitList(file) {
        let jsonDrumkits = await getCachedDrumkits()
        if (!jsonDrumkits) {
            jsonDrumkits = await this.loadJsonResource(file)
            await cacheDrumkits(jsonDrumkits)
        } else {
            logger.debug('ResourcesLoader', 'Drumkit list loaded from IDB cache')
        }
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
        let generatedSounds = await getCachedGeneratedSounds()
        if (!generatedSounds) {
            generatedSounds = await this.loadJsonResource(file)
            await cacheGeneratedSounds(generatedSounds)
        } else {
            logger.debug('ResourcesLoader', 'Generated sounds loaded from IDB cache')
        }
        Object.assign(soundRegistry.generatedSounds, generatedSounds)
    }

    async loadSettings() {
        const masterDefaults = {
            volume: 1,
            preGain: 0,
            lowcut: 35,
            hicut: 18500,
            compBypass: false,
            threshold: -18,
            ratio: 8,
            attack: 0.002,
            release: 0.08,
            knee: 3,
            makeup: 8,
        }
        const sessionDefaults = {
            selectedDrumkitNum: 0,
            selectedPatternNum: 0,
            selectedTrackNum: 0,
            currentView: 'edit',
        }
        const defaults = {
            version: 1,
            sampleDirs: [],
            maxSampleDirs: 10,
            master: masterDefaults,
            session: sessionDefaults,
        }
        try {
            const raw = await idbGet('settings', ResourcesLoader.SETTINGS_KEY)
            if (raw) {
                if (raw.master) raw.master = { ...masterDefaults, ...raw.master }
                if (raw.session) raw.session = { ...sessionDefaults, ...raw.session }
                Object.assign(soundRegistry.settings, defaults, raw)
                return
            }
        } catch (e) {
            logger.warn('ResourcesLoader', 'Failed to load settings from IndexedDB', e)
        }
        try {
            const settings = await this.loadJsonResource(ResourcesLoader.SETTINGS_URL)
            if (settings.master) settings.master = { ...masterDefaults, ...settings.master }
            Object.assign(soundRegistry.settings, defaults, settings)
        } catch (e) {
            logger.warn('ResourcesLoader', 'Failed to load settings from JSON, using defaults', e)
        }
    }

    async saveSettings() {
        try {
            await idbPut('settings', ResourcesLoader.SETTINGS_KEY, structuredClone(soundRegistry.settings))
        } catch (e) {
            logger.warn('ResourcesLoader', 'Failed to save settings', e)
            showToast('Settings save failed', 'error')
        }
    }

    saveSession = () => {
        // Persist session snapshot from appState (authoritative runtime source).
        // soundRegistry.settings.session is a serialization buffer for IDB only.
        const s = (soundRegistry.settings.session ??= {})
        s.selectedDrumkitNum = appState.selectedDrumkitNum
        s.selectedPatternNum = appState.selectedPatternNum
        s.selectedTrackNum = appState.selectedTrackNum
        s.currentView = serviceRegistry.viewManager?.currentView ?? appState.currentView ?? 'edit'
        appState.currentView = s.currentView
        this.saveSettings()
    }

    restoreSession = () => {
        const s = soundRegistry.settings.session
        if (!s) return
        if (typeof s.selectedDrumkitNum === 'number') appState.selectedDrumkitNum = s.selectedDrumkitNum
        if (typeof s.selectedPatternNum === 'number') appState.selectedPatternNum = s.selectedPatternNum
        if (typeof s.selectedTrackNum === 'number') appState.selectedTrackNum = s.selectedTrackNum
        if (typeof s.currentView === 'string') appState.currentView = s.currentView
    }

    #persistTimer = null

    persistPatterns = () => {
        if (this.#persistTimer) clearTimeout(this.#persistTimer)
        this.#persistTimer = setTimeout(async () => {
            try {
                const data = {
                    infos: appState.songInfos ?? {},
                    patterns: structuredClone(appState.patterns),
                }
                await cachePatterns(data)
            } catch (e) {
                logger.warn('ResourcesLoader', 'Failed to persist patterns', e)
                showToast('Pattern save failed', 'error')
            }
        }, 500)
    }

    async loadSong(file) {
        let json = await getCachedPatterns()
        if (!json) {
            json = await this.loadJsonResource(file)
            try {
                await cachePatterns(json)
            } catch {
                // cachePatterns already logged — load from network must still succeed
            }
        } else {
            logger.debug('ResourcesLoader', 'Patterns loaded from IDB cache')
        }
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
                    if (trk?.soundId && trk.soundId !== 'NOT_DEFINED') {
                        if (trk.useAutoAssignSound !== false) {
                            trk.soundId = 'NOT_DEFINED'
                        }
                    }
                })
            }
            serviceRegistry.cmd.importPatternFromJson(pattern)
        })
        this.#autoPersistEnabled = true
    }

    onSoundsProgress = (progress) => {
        if (typeof document === 'undefined') return
        const progressBar = document.getElementById('resourcesProgressBar')
        if (progressBar) {
            progressBar.value = progress
        }
    }

    getUnloadedSamplesFromDrumkits = (drumkits) => {
        return getUnloadedSamplesFromDrumkits(drumkits, soundRegistry.sounds)
    }

    loadMissingSamplesFromDrumkits = async (drumkits) => {
        return this.#loadSampleEntries(this.getUnloadedSamplesFromDrumkits(drumkits))
    }

    /**
     * Loads every sample referenced by the given patterns that is not in the
     * registry yet. The samples are searched in all drumkits, because a track
     * can keep an explicit sound assigned from a kit that is not the selected
     * one (kit switches and reloads do not rewrite those ids).
     *
     * @param {object[] | object} patterns pattern or list of patterns
     * @returns {Promise<object[]>} the loaded sounds
     */
    loadSamplesForPatterns = async (patterns) => {
        const wanted = new Set()
        const patternList = patterns?.tracks ? [patterns] : Object.values(patterns ?? {})
        for (const pattern of patternList) {
            for (const track of Object.values(pattern?.tracks ?? {})) {
                const soundId = track?.soundId
                if (soundId && soundId !== 'NOT_DEFINED' && !soundRegistry.sounds[soundId]?.buffer) {
                    wanted.add(soundId)
                }
            }
        }
        if (wanted.size === 0) return []

        const samplesToLoad = []
        for (const drumkit of soundRegistry.drumkitList) {
            for (const sample of Object.values(drumkit?.instruments ?? {})) {
                if (wanted.delete(sample.url)) {
                    samplesToLoad.push({ sample, kitName: drumkit.name })
                }
            }
        }
        return this.#loadSampleEntries(samplesToLoad)
    }

    #loadSampleEntries = async (samplesToLoad) => {
        let nbLoad = 0
        const nbToLoad = samplesToLoad.length

        if (nbToLoad === 0) {
            return []
        }

        const updateProgress = () => {
            this.onSoundsProgress(Math.floor((nbLoad * 100) / nbToLoad))
        }

        const results = await Promise.all(
            samplesToLoad.map(async ({ sample, kitName }) => {
                try {
                    return await this.loadSample(sample, kitName)
                } catch (error) {
                    logger.error('ResourcesLoader', 'ResourcesLoader::loadSample error ' + sample.url, error)
                    return null
                } finally {
                    nbLoad++
                    updateProgress()
                }
            }),
        )
        return results.filter(Boolean)
    }

    loadSamplesFromDrumkit = (drumkit) => {
        return this.loadMissingSamplesFromDrumkits([drumkit])
    }

    loadSample = async (sample, kit_name) => {
        let arrayBuffer = await getCachedSample(sample.url)
        if (!arrayBuffer) {
            const response = await fetch(ResourcesLoader.KITS_PATH + sample.url)
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
            arrayBuffer = await response.arrayBuffer()
            await cacheSample(sample.url, arrayBuffer)
        } else {
            logger.debug('ResourcesLoader', `Sample "${sample.url}" loaded from IDB cache`)
        }
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
            gainDb: sample.gainDb ?? 0,
            tune: sample.tune ?? 0,
        }
        soundRegistry.sounds[sample.url] = sound
        return sound
    }

    fix = (patterns) => {
        return fixPatterns(structuredClone(patterns))
    }
}
