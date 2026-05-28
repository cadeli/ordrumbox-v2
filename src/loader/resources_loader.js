import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { fixPatterns, getUnloadedSamplesFromDrumkits } from '../patterns/fixer.js'

export default class MfResourcesLoader {
    static TAG = "MFResourcesLoader"
    static get KITS_PATH() { return "public/assets/kits/" }
    static get SCALES_URL() { return "public/assets/data/scales.json" }
    static get DRUMKITS_URL() { return "public/assets/data/drumkits.json" }
    static get PATTERNS_URL() { return "public/assets/data/patterns.json" }
    static get GENERATED_SOUNDS_URL() { return "public/assets/data/generated_sounds.json" }

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

    getDynamicAssetURL(path) {
        return new URL(`${path}`, import.meta.url).href;
    }

    async ensureResourcesLoaded() {

        // 1. Load Patterns if missing
        if (appState.patterns.length === 0) {
            if (this.isPatternsLoading || this.patternsLoadFailed) return
            this.isPatternsLoading = true
            try {
                await this.loadPatterns(MfResourcesLoader.PATTERNS_URL)
                this.isPatternsLoading = false
            } catch (error) {
                this.isPatternsLoading = false
                this.patternsLoadFailed = true
                throw error
            }
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

    async loadJsonResource(file, onLoad) {
        try {
            const response = await fetch(file)
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }
            const json = await response.json()
            onLoad(json)
            return json
        } catch (error) {
            console.error(`MfResourcesLoader::loadJsonResource: ${file}`, error)
            throw error
        }
    }

    async loadDrumkitList(file, complete) {
        console.log("MfResourcesLoader::loadDrumkitList. = ", this.getDynamicAssetURL(file))
        return this.loadJsonResource(file, (jsonDrumkits) => {
            soundRegistry.drumkitList.length = 0
            Object.values(jsonDrumkits).forEach((drumkit) => {
                soundRegistry.drumkitList.push(drumkit)
            })
            this.isDrumkitListLoaded = true
            complete?.()
        })
    }

    async loadScales(file, callback) {
        return this.loadJsonResource(file, (scales) => {
            Object.assign(soundRegistry.scales, scales)
            callback?.()
        })
    }

    async loadGeneratedSounds(file, callback) {
        return this.loadJsonResource(file, (generatedSounds) => {
            Object.assign(soundRegistry.generatedSounds, generatedSounds)
            callback?.()
        })
    }

    async loadPatterns(file, complete) {
        console.log("mfresourcesloader::loadPatterns called with file:", file)
        this.isPatternsComplete = false
        return this.loadJsonResource(file, (patterns) => {
            console.log("mfressourceloader::loadPatterns: " + file + "  =" + patterns.length)
            const fixedPatterns = this.fix(JSON.parse(JSON.stringify(patterns)))
            appState.patterns.length = 0
            fixedPatterns.forEach((pattern) => {
                if (pattern?.tracks) {
                    Object.values(pattern.tracks).forEach((trk) => {
                        if (trk?.soundId && trk.soundId !== "NOT_DEFINED") {
                            if (trk.useAutoAssignSound !== false) {
                                trk.soundId = "NOT_DEFINED"
                            }
                        }
                    })
                }
                serviceRegistry.mfCmd.importPatternFromJson(pattern)
            })
            complete?.()
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

    loadMissingSamplesFromDrumkits = (drumkits, callback) => {
        const samplesToLoad = this.getUnloadedSamplesFromDrumkits(drumkits)

        let nbLoad = 0
        const nbToLoad = samplesToLoad.length

        if (nbToLoad === 0) {
            callback?.()
            return Promise.resolve([])
        }

        const updateProgress = () => {
            this.onSoundsProgress(Math.floor(nbLoad * 100 / nbToLoad))
        }

        return Promise.all(samplesToLoad.map(({ sample, kitName }) => {
            return this.loadSample(sample, kitName)
                .catch((error) => {
                    console.error("MfResourcesLoader::loadSample error " + sample.url, error)
                    return null
                })
                .finally(() => {
                    nbLoad++
                    updateProgress()
                })
        })).then((sounds) => {
            callback?.()
            return sounds.filter(Boolean)
        })
    }

    loadSamplesFromDrumkit = (drumkit, callback) => {
        return this.loadMissingSamplesFromDrumkits([drumkit], callback)
    }

    loadSample = (sample, kit_name) => {
        return fetch(MfResourcesLoader.KITS_PATH + sample.url)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }
                console.log("MfResourcesLoader::loadSample ok " + sample.url)
                return response.arrayBuffer()
            })
            .then((arrayBuffer) => {
                return this.audioCtx.decodeAudioData(arrayBuffer)
            })
            .then((buffer) => {
                const sound = {
                    kit_name: kit_name,
                    url: sample.url,
                    key: sample.key,
                    index: Object.keys(soundRegistry.sounds).length + 1,
                    display_name: sample.display_name,
                    buffer: buffer,
                    duration: Math.floor(buffer.duration * 1000),
                    isLoad: true,
                    playStatus: false
                }
                console.log("mfRessourceLoader::loadSample: " + (kit_name + ":" + sample.key) +
                    " load ok  duration:" + (buffer.duration).toFixed(2) +
                    " url=" + sound.url)

                soundRegistry.sounds[sample.url] = sound
                return sound
            })
    }

    fix = (patterns) => {
        return fixPatterns(JSON.parse(JSON.stringify(patterns)))
    }
}
