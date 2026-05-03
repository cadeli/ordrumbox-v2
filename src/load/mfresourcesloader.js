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
            const fixedGeneratedSounds = this.fixGeneratedSounds(JSON.parse(JSON.stringify(generatedSounds)))
            Object.assign(MfGlobals.generatedSounds, fixedGeneratedSounds)
            callback?.()
        })
    }

    async loadPatterns(file, complete) {
        this.isPatternsComplete = false
        return this.loadJsonResource(file, (patterns) => {
            console.log("mfressourceloader::loadPatterns: " + file + "  =" + patterns.length)
            const fixedPatterns = this.fix(JSON.parse(JSON.stringify(patterns)))
            MfGlobals.patterns.length = 0
            fixedPatterns.forEach((pattern) => {
                // Migration: reset soundId of all tracks to NOT_DEFINED to reflect migration to soundId-only usage
                // Only reset tracks that have autoSound enabled (default behavior)
                // Keep original soundId for tracks with autoSound: false
                if (pattern?.tracks) {
                    Object.values(pattern.tracks).forEach((trk) => {
                        if (trk?.soundId && trk.soundId !== "NOT_DEFINED") {
                            // Only reset if autoSound is true or undefined
                            // Keep original soundId if autoSound is explicitly false
                            if (trk.autoSound !== false) {
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

    async loadTrackLib(file, complete) {
        return this.loadJsonResource(file, (trackLib) => {
            const fixedTrackLib = this.fixTrackLib(JSON.parse(JSON.stringify(trackLib)))
            MfGlobals.trackLib.length = 0
            fixedTrackLib.forEach((track) => {
                MfGlobals.trackLib.push(track)
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
                if (track.generated) { track.autoSound = false } //JIC
                track.loopPointBar = Math.floor(track.loopPoint / track.nbStepPerBar)
                track.loopPointStep = track.loopPoint % track.nbStepPerBar

                if (!track.swingRez) { track.swingRez = 1 }
                if (!track.swingDepth) { track.swingDepth = 0 }
                if (!track.veloLfo) { track.veloLfo = null }
                if (!track.pitchLfo) { track.pitchLfo = null }
                if (!track.panoLfo) { track.panoLfo = null }
                if (!track.filterFreqLfo) { track.filterFreqLfo = null }
                if (!track.filterQLfo) { track.filterQLfo = null }
                this.fixPitchLfo(track.pitchLfo)
                if (!track.filterType) { track.filterType = "allpass" }
                if (track.filterType === 'all') { track.filterType = 'allpass' }
                if (track.filterFreq == null) { track.filterFreq = 20 }
                if (track.filterQ == null) { track.filterQ = 0.707 }
                track.filterFreq = Utils.normalizeTrackFilterFreqValue(track.filterFreq)
                track.filterQ = Utils.normalizeTrackFilterQValue(track.filterQ)
                this.fixFilterLfo(track.filterFreqLfo, 'freq')
                this.fixFilterLfo(track.filterQLfo, 'q')
                if (!track.filterLfoFreq) { track.filterLfoFreq = 0 }
                if (!track.sampleLength) { track.sampleLength = 1 }
                Object.values(track.notes).forEach((note) => {
                    this.stepBarFix(track, note) //TODO due to inconsistant json 
                    if (!note.retriggNum) { note.retriggNum = 1 }
                    if (!note.retriggStep) { note.retriggStep = 1 }
                    if (!note.triggFreq) { note.triggFreq = 1 }
                    if (!note.triggPhase) { note.triggPhase = 0 }
                    if (!note.euclidianFill) { note.euclidianFill = 0 }
                })
            })
        })
        return patterns
    }

    fixTrackLib = (trackLib) => {
        Object.values(trackLib).forEach((track, indexTrack) => {
            this.trackPanningFix(track, indexTrack)
            track.generated = false
            track.loopPointBar = Math.floor(track.loopPoint / track.nbStepPerBar)
            track.loopPointStep = track.loopPoint % track.nbStepPerBar

            if (!track.swingRez) { track.swingRez = 1 }
            if (!track.swingDepth) { track.swingDepth = 0 }
            if (!track.veloLfo) { track.veloLfo = null }
            if (!track.pitchLfo) { track.pitchLfo = null }
            if (!track.panoLfo) { track.panoLfo = null }
            if (!track.filterFreqLfo) { track.filterFreqLfo = null }
            if (!track.filterQLfo) { track.filterQLfo = null }
            this.fixPitchLfo(track.pitchLfo)
            if (!track.filterType) { track.filterType = "allpass" }
            if (track.filterType === 'all') { track.filterType = 'allpass' }
            if (track.filterFreq == null) { track.filterFreq = 20 }
            if (track.filterQ == null) { track.filterQ = 0.707 }
            track.filterFreq = Utils.normalizeTrackFilterFreqValue(track.filterFreq)
            track.filterQ = Utils.normalizeTrackFilterQValue(track.filterQ)
            this.fixFilterLfo(track.filterFreqLfo, 'freq')
            this.fixFilterLfo(track.filterQLfo, 'q')
            if (!track.filterLfoFreq) { track.filterLfoFreq = 0 }
            if (!track.sampleLength) { track.sampleLength = 1 }
            if (!track.reverbType) { track.reverbType = "none" }
            if (track.reverbAmount == null) { track.reverbAmount = 0 }
            if (!track.saturationType) { track.saturationType = "soft" }
            if (track.saturationAmount == null) { track.saturationAmount = 0 }

            Object.values(track.notes ?? []).forEach((note) => {
                this.stepBarFix(track, note)
                if (!note.retriggNum) { note.retriggNum = 1 }
                if (!note.retriggStep) { note.retriggStep = 1 }
                if (!note.triggFreq) { note.triggFreq = 1 }
                if (!note.triggPhase) { note.triggPhase = 0 }
                if (!note.euclidianFill) { note.euclidianFill = 0 }
            })
        })
        return trackLib
    }

    fixGeneratedSounds = (generatedSounds) => {
        Object.values(generatedSounds).forEach((generatedSound) => {
            generatedSound.filter ??= {}
            if (generatedSound.filter.freq == null) { generatedSound.filter.freq = 50 }
            if (generatedSound.filter.Q == null) { generatedSound.filter.Q = 1 }
            if (generatedSound.filter.filterEnvelopeAmount == null) { generatedSound.filter.filterEnvelopeAmount = 0 }
            generatedSound.filter.freq = Utils.normalizeSynthFilterFreqValue(generatedSound.filter.freq)
            generatedSound.filter.Q = Utils.normalizeSynthFilterQValue(generatedSound.filter.Q)
            generatedSound.filter.filterEnvelopeAmount = Math.min(1, Math.max(0, Number(generatedSound.filter.filterEnvelopeAmount) || 0))
        })
        return generatedSounds
    }

    fixFilterLfo = (lfo, kind) => {
        if (!lfo) {
            return
        }
        if (kind === 'freq') {
            lfo.min = Utils.normalizeTrackFilterFreqValue(lfo.min ?? 20)
            lfo.max = Utils.normalizeTrackFilterFreqValue(lfo.max ?? 20000)
            return
        }
        lfo.min = Utils.normalizeTrackFilterQValue(lfo.min ?? 0.707)
        lfo.max = Utils.normalizeTrackFilterQValue(lfo.max ?? 18.707)
    }

    fixPitchLfo = (lfo) => {
        if (!lfo) {
            return
        }

        const min = Number(lfo.min)
        const max = Number(lfo.max)

        if (Number.isFinite(min) && Number.isFinite(max) && Math.abs(min) <= 1 && Math.abs(max) <= 1) {
            lfo.min = -12
            lfo.max = 12
        } else {
            lfo.min = Number.isFinite(min) ? min : -12
            lfo.max = Number.isFinite(max) ? max : 12
        }

        if (lfo.min > lfo.max) {
            const tmp = lfo.min
            lfo.min = lfo.max
            lfo.max = tmp
        }

        if (!Number.isFinite(Number(lfo.phase))) { lfo.phase = 0 }
        if (!Number.isFinite(Number(lfo.freq))) { lfo.freq = 1 }
        if (!lfo.wave) { lfo.wave = "SIN" }
    }

    stepBarFix = (track, note) => { // json is not consistant TODO fix json
        note.stepInBar ??= note.step ?? 0
        delete note.step
        if (note.stepInBar >= track.nbStepPerBar) {
            let pStep = note.stepInBar
            note.stepInBar %= track.nbStepPerBar
            note.bar = Math.floor(pStep / track.nbStepPerBar)
        }
        note.steppc = Math.round((note.stepInBar * 100) / track.nbStepPerBar)
    }

    trackPanningFix = (track, indexTrack) => {
        switch (indexTrack) {
            case 0:
                track.pano = 0
                break;
            case 1:
                track.pano = 0.3
                break;
            case 2:
                track.pano = 0.5
                break;
            case 3:
                track.pano = -0.4
                break;
            case 4:
                track.pano = 0.4
                break;
            case 5:
                track.pano = -0.3
                break;
            case 6:
                track.pano = -0.2
                break;
            case 7:
                track.pano = 1
                break;
            default:
                track.pano = 0
                break;
        }
    }

}
