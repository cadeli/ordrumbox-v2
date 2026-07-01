import VoiceFactory from './voices/voice_factory.js'
import SynthVoice from './voices/synth_voice.js'
import NodePool from './node_pool.js'
import { applyTrackToStrip } from './strip_sync.js'
import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { TICK } from '../core/constants.js'

const MAX_POLYPHONY = 16

export default class MfSound {
    constructor(audioCtx, mixer, sounds, generatedSounds) {
        this.audioCtx = audioCtx
        this.mixer = mixer
        this.sounds = sounds
        this.generatedSounds = generatedSounds || {}
        this.activeVoices = new WeakMap()
        this.activeSynthVoices = new Set()
        this._activeVoiceSet = new Set()
        this.nodePool = new NodePool(audioCtx)
        this.voiceFactory = new VoiceFactory(audioCtx, mixer, sounds, this.generatedSounds, this.nodePool)
        this.generatedSoundsLoading = false
        this.generatedSoundsLoadFailed = false

        // Track-level strip parameter cache to avoid redundant Web Audio API calls.
        // Key: track.name, Value: { _version, velocity, pan, filterType, ... }
        this._stripParamCache = new Map()
        this._activeNoteCount = 0
    }

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
        const prevOnEnded = voice.onEnded
        voice.onEnded = () => {
            this.activeSynthVoices.delete(voice)
            prevOnEnded?.()
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

    play = async (flatNote, time) => {
        if (!flatNote || !this.mixer?.analyser) return
        if (flatNote.track.useSoftSynth === true) {
            await this.playGenerated(flatNote, time)
        } else {
            await this.playSample(flatNote, time)
        }
    }

    _playVoice = async (flatNote, time, opts = {}) => {
        try {
            const strip = await this.mixer.getOrCreateStrip(flatNote.track.name)
            if (!strip) return null
            this.updateStripFromTrack(strip, flatNote.track, time)
            this.stopPreviousVoice(flatNote.track, time)

            // Polyphony limit: steal oldest voice when at capacity
            if (this._activeVoiceSet.size >= MAX_POLYPHONY) {
                const oldest = this._activeVoiceSet.values().next().value
                if (oldest) {
                    this.stopVoice(oldest, time)
                }
            }

            if (opts.syncGeneratedSounds) {
                this.voiceFactory.generatedSounds = this.generatedSounds
            }
            const voice = await this.voiceFactory.createVoice(flatNote)
            if (voice) {
                this._activeNoteCount++
                this._activeVoiceSet.add(voice)
                const prevOnEnded = voice.onEnded
                voice.onEnded = () => {
                    this._activeNoteCount = Math.max(0, this._activeNoteCount - 1)
                    this._activeVoiceSet.delete(voice)
                    prevOnEnded?.()
                }
                let lfoContext = null
                if (flatNote.track.pitchLfo) {
                    const tick = serviceRegistry.transport?.tick ?? 0
                    const pattern = appState.patterns?.[appState.selectedPatternNum]
                    const nbTicks = TICK * (pattern?.nbBars ?? 4)
                    lfoContext = { tick, nbTicks }
                }
                await voice.setup(flatNote, time, lfoContext)
                if (flatNote.track.mono) this.registerVoice(flatNote.track, voice)
                if (opts.registerSynth) this.registerSynthVoice(voice)
                voice.start(time)
            }
            return voice
        } catch (e) {
            console.error("Error in _playVoice:", e)
            return null
        }
    }

    playSample = async (flatNote, time) => {
        if (!flatNote) return
        return await this._playVoice(flatNote, time, { registerSynth: true })
    }

    playGenerated = async (flatNote, time, loadFn) => {
        if (Object.keys(this.generatedSounds).length === 0) {
            this.loadGeneratedsounds(flatNote, time, loadFn)
            return
        }
        if (!flatNote) return
        await this._playVoice(flatNote, time, { syncGeneratedSounds: true })
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

        applyTrackToStrip(strip, track, time)
    }

    stopAllVoices = () => {
        const time = this.audioCtx?.currentTime ?? 0
        for (const voice of this._activeVoiceSet) {
            if (voice && typeof voice.stop === "function") {
                voice.stop(time)
            }
        }
        this._activeVoiceSet.clear()
        this.activeSynthVoices.clear()
        this.activeVoices.clear()
        this._activeNoteCount = 0
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
