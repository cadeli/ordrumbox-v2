import { MfGlobals } from '../mfglobals.js'
import Utils from '../utils.js'

export default class MfResourcesLoader {
    static TAG = "MFResourcesLoader"
    isDrumkitListLoaded = false

    getDynamicAssetURL(path) {
        return new URL(`${path}`, import.meta.url).href;
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
            MfGlobals.drumkitList.length = 0
            Object.values(jsonDrumkits).forEach((drumkit) => {
                MfGlobals.drumkitList.push(drumkit)
            })
            this.isDrumkitListLoaded = true
            complete?.()
        })
    }

    async loadScales(file, callback) {
        return this.loadJsonResource(file, (scales) => {
            Object.assign(MfGlobals.scales, scales)
            callback?.()
        })
    }

    async loadGeneratedSounds(file, callback) {
        return this.loadJsonResource(file, (generatedSounds) => {
            Object.assign(MfGlobals.generatedSounds, generatedSounds)
            callback?.()
        })
    }

    async loadPatterns(file, complete) {
        console.log("mfresourcesloader::loadPatterns called with file:", file)
        this.isPatternsComplete = false
        return this.loadJsonResource(file, (patterns) => {
            console.log("mfressourceloader::loadPatterns: " + file + "  =" + patterns.length)
            const fixedPatterns = this.fix(JSON.parse(JSON.stringify(patterns)))
            MfGlobals.patterns.length = 0
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
                MfGlobals.mfCmd.importPatternFromJson(pattern)
            })
            complete?.()
        })
    }



    onSoundsProgress = (progress) => { //TODO
        // if (typeof document === 'undefined') {
        //     return
        // }
        const progressBar = document.getElementById("resourcesProgressBar")
        if (progressBar) {
            progressBar.value = progress
        }
    }

    ensureAudioContext = () => {
        const AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext
        if (!AudioContextCtor) {
            throw new Error('AudioContext is not available in this runtime')
        }
        if (MfGlobals.audioCtx == null) {
            MfGlobals.audioCtx = new AudioContextCtor()
        }
    }

    getUnloadedSamplesFromDrumkits = (drumkits) => {
        const samples = []
        const seenUrls = new Set()
        Object.values(drumkits || {}).forEach((drumkit) => {
            Object.values(drumkit?.instruments || {}).forEach((sample) => {
                if (!sample?.url || seenUrls.has(sample.url) || MfGlobals.sounds[sample.url]?.buffer) {
                    return
                }
                seenUrls.add(sample.url)
                samples.push({ sample, kitName: drumkit.name })
            })
        })
        return samples
    }

    loadMissingSamplesFromDrumkits = (drumkits, callback) => {
        this.ensureAudioContext()
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
        return fetch(MfGlobals.urlkits + sample.url)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }
                console.log("MfResourcesLoader::loadSample ok " + sample.url)
                return response.arrayBuffer()
            })
            .then((arrayBuffer) => {
                return MfGlobals.audioCtx.decodeAudioData(arrayBuffer)
            })
            .then((buffer) => {
                const sound = {
                    kit_name: kit_name,
                    url: sample.url,
                    key: sample.key,
                    index: Object.keys(MfGlobals.sounds).length + 1,
                    display_name: sample.display_name,
                    buffer: buffer,
                    duration: Math.floor(buffer.duration * 1000),
                    isLoad: true,
                    playStatus: false
                }
                console.log("mfRessourceLoader::loadSample: " + (kit_name + ":" + sample.key) +
                    " load ok  duration:" + (buffer.duration).toFixed(2) +
                    " url=" + sound.url)

                MfGlobals.sounds[sample.url] = sound
                return sound
            })
    }

    fix = (patterns) => { //TODO fix loops
        Object.values(patterns).forEach((pattern, indexPattern) => {
            //pattern.nbBars = pattern.tracks[0].bars
            if (!pattern.application) { pattern.application = "online-ordrumbox" }
            if (!pattern.url) { pattern.url = "https://www.ordrumbox.com" }
            Object.values(pattern.tracks).forEach((track, indexTrack) => {
                this.trackPanningFix(track, indexTrack)
                if (track.useSoftSynth) { track.useAutoAssignSound = false } //JIC
                track.loopPointBar = Math.floor(track.loopAtStep / track.barQuantize)
                track.loopPointStep = track.loopAtStep % track.barQuantize
                if (!track.useAutoAssignSound) { track.useAutoAssignSound = true;track.soundId="NOT_DEFINED" }

                if (!track.swingResolution) { track.swingResolution = Utils.TRACK_DEFAULTS.swingResolution }
                if (!track.swingAmount) { track.swingAmount = Utils.TRACK_DEFAULTS.swingAmount }
                if (!track.velocityLfo) { track.velocityLfo = Utils.TRACK_DEFAULTS.velocityLfo }
                if (!track.pitchLfo) { track.pitchLfo = Utils.TRACK_DEFAULTS.pitchLfo }
                if (!track.panLfo) { track.panLfo = Utils.TRACK_DEFAULTS.panLfo }
                if (!track.filterFreqLfo) { track.filterFreqLfo = Utils.TRACK_DEFAULTS.filterFreqLfo }
                if (!track.filterQLfo) { track.filterQLfo = Utils.TRACK_DEFAULTS.filterQLfo }
                if (!track.filterType) { track.filterType = Utils.TRACK_DEFAULTS.filterType }
                if (track.filterType === 'all') { track.filterType = 'allpass' }
                if (track.filterFreq == null) { track.filterFreq = Utils.TRACK_DEFAULTS.filterFreq }
                if (track.filterQ == null) { track.filterQ = Utils.TRACK_DEFAULTS.filterQ }
                if (!track.filterLfoFreq) { track.filterLfoFreq = 0 }
                if (!track.sampleLength) { track.sampleLength = 1 }
                if (!track.notes) { track.notes = [] }
                Object.values(track.notes).forEach((note) => {
                    this.stepBarFix(track, note) //TODO due to inconsistant json 
                    if (!note.retriggerNum) { note.retriggerNum = Utils.NOTE_DEFAULTS.retriggerNum }
                    if (!note.retriggerStep) { note.retriggerStep = Utils.NOTE_DEFAULTS.retriggerStep }
                    if (!note.triggerFreq) { note.triggerFreq = Utils.NOTE_DEFAULTS.triggerFreq }
                    if (!note.triggerPhase) { note.triggerPhase = Utils.NOTE_DEFAULTS.triggerPhase }
                    if (!note.euclidianFill) { note.euclidianFill = Utils.NOTE_DEFAULTS.euclidianFill }
                })
            })
        })
        return patterns
    }


    // fixGeneratedSounds = (generatedSounds) => {
    //     Object.values(generatedSounds).forEach((generatedSound) => {
    //         generatedSound.filter ??= {}
    //         if (generatedSound.filter.freq == null) { generatedSound.filter.freq = 50 }
    //         if (generatedSound.filter.Q == null) { generatedSound.filter.Q = 1 }
    //         if (generatedSound.filter.filterEnvelopeAmount == null) { generatedSound.filter.filterEnvelopeAmount = 0 }
    //         generatedSound.filter.freq = Utils.normalizeSynthFilterFreqValue(generatedSound.filter.freq)
    //         generatedSound.filter.Q = Utils.normalizeSynthFilterQValue(generatedSound.filter.Q)
    //         generatedSound.filter.filterEnvelopeAmount = Math.min(1, Math.max(0, Number(generatedSound.filter.filterEnvelopeAmount) || 0))
    //     })
    //     return generatedSounds
    // }

    // fixFilterLfo = (lfo, kind) => {
    //     if (!lfo) {
    //         return
    //     }
    //     if (kind === 'freq') {
    //         lfo.min = Utils.normalizeTrackFilterFreqValue(lfo.min ?? 20)
    //         lfo.max = Utils.normalizeTrackFilterFreqValue(lfo.max ?? 20000)
    //         return
    //     }
    //     lfo.min = Utils.normalizeTrackFilterQValue(lfo.min ?? 0.707)
    //     lfo.max = Utils.normalizeTrackFilterQValue(lfo.max ?? 18.707)
    // }

    // fixPitchLfo = (lfo) => {
    //     if (!lfo) {
    //         return
    //     }

    //     const min = Number(lfo.min)
    //     const max = Number(lfo.max)

    //     if (Number.isFinite(min) && Number.isFinite(max) && Math.abs(min) <= 1 && Math.abs(max) <= 1) {
    //         lfo.min = -12
    //         lfo.max = 12
    //     } else {
    //         lfo.min = Number.isFinite(min) ? min : -12
    //         lfo.max = Number.isFinite(max) ? max : 12
    //     }

    //     if (lfo.min > lfo.max) {
    //         const tmp = lfo.min
    //         lfo.min = lfo.max
    //         lfo.max = tmp
    //     }

    //     if (!Number.isFinite(Number(lfo.phase))) { lfo.phase = 0 }
    //     if (!Number.isFinite(Number(lfo.freq))) { lfo.freq = 1 }
    //     if (!lfo.wave) { lfo.wave = "SIN" }
    // }

    stepBarFix = (track, note) => { // json is not consistant TODO fix json
        note.barStep ??= note.step ?? 0
        delete note.step
        if (note.barStep >= track.barQuantize) {
            let pStep = note.barStep
            note.barStep %= track.barQuantize
            note.bar = Math.floor(pStep / track.barQuantize)
        }
        note.steppc = Math.round((note.barStep * 100) / track.barQuantize)
    }

    trackPanningFix = (track, indexTrack) => {
        switch (indexTrack) {
            case 0:
                track.pan = 0
                break;
            case 1:
                track.pan = 0.3
                break;
            case 2:
                track.pan = 0.5
                break;
            case 3:
                track.pan = -0.4
                break;
            case 4:
                track.pan = 0.4
                break;
            case 5:
                track.pan = -0.3
                break;
            case 6:
                track.pan = -0.2
                break;
            case 7:
                track.pan = 1
                break;
            default:
                track.pan = 0
                break;
        }
    }

}
