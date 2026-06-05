import MfDefaults from '../patterns/defaults.js'
import VoiceFactory from './voices/voice_factory.js'
import SynthVoice from './voices/synth_voice.js'

export default class MfSound {
    static get lastPitchV1() { return SynthVoice.lastPitchV1 }
    static set lastPitchV1(v) { SynthVoice.lastPitchV1 = v }
    static get lastPitchV2() { return SynthVoice.lastPitchV2 }
    static set lastPitchV2(v) { SynthVoice.lastPitchV2 = v }
    static get lastPitchV3() { return SynthVoice.lastPitchV3 }
    static set lastPitchV3(v) { SynthVoice.lastPitchV3 = v }

    constructor(audioCtx, mixer, sounds, generatedSounds) {
        this.audioCtx = audioCtx
        this.mixer = mixer
        this.sounds = sounds
        this.generatedSounds = generatedSounds || {}
        this.activeVoices = new WeakMap()
        this.activeSynthVoices = new Set()
        this.voiceFactory = new VoiceFactory(audioCtx, mixer, sounds, this.generatedSounds)
        this.generatedSoundsLoading = false
        this.generatedSoundsLoadFailed = false

        // Track-level strip parameter cache to avoid redundant Web Audio API calls.
        // Key: track.name, Value: { _version, velocity, pan, filterType, ... }
        this._stripParamCache = new Map()
    }

    init = () => { }

    getStrip = async (track) => {
        if (!track?.name || !this.mixer) return null
        return await this.mixer.getOrCreateStrip(track.name)
    }

    connectToStripInput = (sourceNode, strip) => {
        if (!sourceNode || !strip) return
        const entry = strip.voicesInput ?? strip.filter1
        sourceNode.connect(entry)
    }

    registerVoice = (track, voice) => {
        if (!track?.mono || !voice) return
        this.activeVoices.set(track, voice)
    }

    registerSynthVoice = (voice) => {
        if (!voice || typeof voice.updateGeneratedSound !== "function") return
        this.activeSynthVoices.add(voice)
        voice.onEnded = () => {
            this.activeSynthVoices.delete(voice)
        }
    }

    stopVoice = (voice, time) => {
        if (!voice || typeof voice.stop !== "function") return
        voice.stop(time)
    }

    stopPreviousVoice = (track, time) => {
        if (!track?.mono) return
        const previousVoice = this.activeVoices.get(track)
        if (previousVoice) {
            this.stopVoice(previousVoice, time)
            this.activeVoices.delete(track)
        }
    }

    applyStripSettings = (strip, params) => {
        if (!strip) return

        const {
            filterType, filterFreq, filterQ,
            saturationType, saturationAmount, saturationOn,
            reverbType, reverbAmount, reverbOn,
            delayType, delayTime, delayAmount, delayOn,
            trackVelo, time, track
        } = params

        if (filterType !== undefined) strip.updateFilter(filterType, filterFreq, filterQ)
        if (saturationType !== undefined || saturationAmount !== undefined || saturationOn !== undefined) {
            strip.updateSaturation(saturationType, saturationOn === false ? 0 : saturationAmount)
        }
        if (reverbType !== undefined || reverbAmount !== undefined || reverbOn !== undefined) {
            strip.updateReverb(reverbType, reverbOn === false ? 0 : reverbAmount)
        }
        if (delayType !== undefined || delayTime !== undefined || delayAmount !== undefined || delayOn !== undefined) {
            strip.updateDelay(delayType, delayTime, delayOn === false ? 0 : delayAmount)
        }

        if (trackVelo !== undefined && time !== undefined) {
            strip.output.gain.setTargetAtTime(trackVelo, time, 0.01)
        }

        if (track) {
            this.updateStripFromTrack(strip, track, time)
        }
    }

    play = async (flatNote, time) => {
        if (!flatNote || !this.mixer?.analyser) return
        if (flatNote.track.useSoftSynth === true) {
            await this.playGenerated(flatNote, time)
        } else {
            await this.playSample(flatNote, time)
        }
    }

    playSample = async (flatNote, time) => {
        try {
            if (!flatNote) return
            const strip = await this.mixer.getOrCreateStrip(flatNote.track.name)
            if (!strip) return

            this.updateStripFromTrack(strip, flatNote.track, time)
            this.stopPreviousVoice(flatNote.track, time)

            const voice = await this.voiceFactory.createVoice(flatNote)
            if (voice) {
                voice.setup(flatNote, time)
                if (flatNote.track.mono) this.registerVoice(flatNote.track, voice)
                this.registerSynthVoice(voice)
                voice.start(time)
            }
        } catch (e) {
            console.error("Error in playSample:", e)
        }
    }

    playGenerated = async (flatNote, time, loadFn) => {
        try {
            if (Object.keys(this.generatedSounds).length === 0) {
                this.loadGeneratedsounds(flatNote, time, loadFn)
                return
            }
            if (!flatNote) return
            const strip = await this.mixer.getOrCreateStrip(flatNote.track.name)
            if (!strip) return

            this.updateStripFromTrack(strip, flatNote.track, time)
            this.stopPreviousVoice(flatNote.track, time)

            this.voiceFactory.generatedSounds = this.generatedSounds
            const voice = await this.voiceFactory.createVoice(flatNote)
            if (voice) {
                voice.setup(flatNote, time)
                if (flatNote.track.mono) this.registerVoice(flatNote.track, voice)
                voice.start(time)
            }
        } catch (e) {
            console.error("Error in playGenerated:", e)
        }
    }

    loadGeneratedsounds = (flatNote, time, loadFn) => {
        if (this.generatedSoundsLoading || this.generatedSoundsLoadFailed) return

        this.generatedSoundsLoading = true
        if (loadFn) {
            const promise = loadFn(() => {
                this.generatedSoundsLoading = false
                if (Object.keys(this.generatedSounds).length === 0) {
                    this.generatedSoundsLoadFailed = true
                    console.warn("MfSounds::loadGeneratedsounds loaded no generated sounds")
                    return
                }
                this.playGenerated(flatNote, time)
            })
            
            if (promise && typeof promise.catch === 'function') {
                promise.catch((error) => {
                    this.generatedSoundsLoading = false
                    this.generatedSoundsLoadFailed = true
                    console.error("MfSounds::loadGeneratedsounds failed", error)
                })
            }
        }
    }

    /**
     * Invalidate strip cache for a specific track (call when track settings change via UI).
     */
    invalidateStripCache = (trackName) => {
        if (trackName) {
            this._stripParamCache.delete(trackName)
        } else {
            this._stripParamCache.clear()
        }
    }

    /**
     * Update the Web Audio strip only when track parameters have actually changed.
     * Uses a version counter (_version) on the track object if available, otherwise
     * compares a shallow fingerprint of the relevant parameters.
     */
    updateStripFromTrack = (strip, track, time) => {
        if (!strip || !track) return

        const name = track.name
        const version = track._version ?? null

        // Fast path: if the track has a version counter and it hasn't changed, skip
        if (version !== null) {
            const cached = this._stripParamCache.get(name)
            if (cached && cached._version === version) return
            this._stripParamCache.set(name, { _version: version })
        } else {
            // Fallback fingerprint for tracks without _version
            const fp = `${track.filterType}|${track.filterFreq}|${track.filterQ}|${track.saturationType}|${track.saturationAmount}|${track.saturationOn}|${track.reverbType}|${track.reverbAmount}|${track.reverbOn}|${track.delayType}|${track.delayTime}|${track.delayAmount}|${track.delayOn}|${track.velocity}|${track.pan}`
            const cached = this._stripParamCache.get(name)
            if (cached && cached.fp === fp) return
            this._stripParamCache.set(name, { fp })
        }

        // Apply all strip settings
        if (track.filterType) strip.updateFilter(track.filterType, track.filterFreq, track.filterQ)
        if (track.saturationType !== undefined || track.saturationOn !== undefined) {
            strip.updateSaturation(track.saturationType, track.saturationOn === false ? 0 : track.saturationAmount)
        }
        if (track.reverbType !== undefined || track.reverbOn !== undefined) {
            strip.updateReverb(track.reverbType, track.reverbOn === false ? 0 : track.reverbAmount)
        }
        if (track.delayType !== undefined || track.delayOn !== undefined) {
            strip.updateDelay(track.delayType, track.delayTime, track.delayOn === false ? 0 : track.delayAmount)
        }

        if (track.pitchLfo) strip.updateLfo('pitchLfo', track.pitchLfo)
        if (track.velocityLfo) strip.updateLfo('velocityLfo', track.velocityLfo)
        if (track.panLfo) strip.updateLfo('panLfo', track.panLfo)
        if (track.filterFreqLfo) strip.updateLfo('filterFreqLfo', track.filterFreqLfo)
        if (track.filterQLfo) strip.updateLfo('filterQLfo', track.filterQLfo)

        const trackVelo = track.velocity ?? MfDefaults.getTrackProp(track, 'velocity')
        strip.output.gain.setTargetAtTime(trackVelo, time, 0.01)

        const trackPan = track.pan ?? MfDefaults.getTrackProp(track, 'pan')
        strip.pan.pan.setTargetAtTime(trackPan, time, 0.01)
    }

    updateGeneratedSounds = (generatedSounds) => {
        Object.assign(this.generatedSounds, generatedSounds)
        const time = this.audioCtx?.currentTime ?? 0
        this.activeSynthVoices.forEach(voice => {
            const generatedSound = this.generatedSounds?.[voice.soundKey]
            if (generatedSound) voice.updateGeneratedSound(generatedSound, time)
        })
    }
}
