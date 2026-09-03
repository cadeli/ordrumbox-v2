import VoiceFactory from './voices/voice_factory.js'
import NodePool from './node_pool.js'
import SynthVoiceNodePool from './voices/synth_voice_pool.js'
import { applyTrackToStrip } from './strip_sync.js'
import { serviceRegistry } from '../state/service_registry.js'
import ResourcesLoader from '../loader/resources_loader.js'
import { logger } from '../core/logger.js'
import { TICK } from '../core/constants.js'

const MAX_POLYPHONY = 16

export default class Sound {
    constructor(audioCtx, mixer, sounds, generatedSounds, isOffline = false) {
        this.audioCtx = audioCtx
        this.mixer = mixer
        this.sounds = sounds
        this.generatedSounds = generatedSounds ?? {}
        this.activeVoices = new WeakMap()
        this.activeSynthVoices = new Set()
        this._activeVoiceSet = new Set()
        this.nodePool = new NodePool(audioCtx)
        // The synth-voice pool releases nodes on a JS `setTimeout` keyed to
        // wall-clock time (see synth_voice_pool.js / worklet_synth_voice.js).
        // That's fine for real-time playback, where wall-clock time tracks
        // audio-context time. During an offline export the whole pattern is
        // scheduled synchronously in a tight loop before `startRendering()`
        // ever runs, so wall-clock time stays near zero while audio-context
        // time spans the whole song. A `setTimeout` can then fire (or fail
        // to fire) completely out of sync with the note's real schedule,
        // causing a pooled node to be released and reassigned to an
        // unrelated later note while the original note's trigger/release
        // messages are still pending — corrupting both notes. Offline
        // rendering must not use the pool; it falls back to one fresh
        // (non-pooled) AudioWorkletNode per note, same as before pooling
        // was introduced.
        this.synthNodePool = isOffline ? null : new SynthVoiceNodePool(audioCtx)
        this.voiceFactory = new VoiceFactory(audioCtx, mixer, sounds, this.generatedSounds, this.nodePool, this.synthNodePool)
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
        // Remove from active tracking immediately so polyphony limit
        // is freed right away. In offline export, onended never fires
        // during the scheduling loop, so without this the set fills up
        // and steals voices far too aggressively.
        if (this._activeVoiceSet.has(voice)) {
            this._activeNoteCount = Math.max(0, this._activeNoteCount - 1)
            this._activeVoiceSet.delete(voice)
        }
        if (this.activeSynthVoices.has(voice)) {
            this.activeSynthVoices.delete(voice)
        }
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
                // Re-check polyphony after await — concurrent play() calls
                // may have added voices while createVoice() was pending.
                while (this._activeVoiceSet.size >= MAX_POLYPHONY) {
                    const oldest = this._activeVoiceSet.values().next().value
                    if (oldest) this.stopVoice(oldest, time)
                    else break
                }
                this._activeNoteCount++
                this._activeVoiceSet.add(voice)
                const prevOnEnded = voice.onEnded
                voice.onEnded = () => {
                    if (this._activeVoiceSet.has(voice)) {
                        this._activeNoteCount = Math.max(0, this._activeNoteCount - 1)
                        this._activeVoiceSet.delete(voice)
                    }
                    prevOnEnded?.()
                }
                let lfoContext = null
                if (flatNote.track.pitchLfo) {
                    const tick = serviceRegistry.transport?.tick ?? 0
                    const nbTicks = TICK * (flatNote.track.nbBeats ?? 4)
                    lfoContext = { tick, nbTicks }
                }
                await voice.setup(flatNote, time, lfoContext)
                // For mono tracks, stop the previous voice AFTER setup()
                // completes. This eliminates the interleaving window where
                // two concurrent play() calls could orphan a voice: by the
                // time stopPreviousVoice runs, registerVoice follows
                // immediately (no await in between).
                if (flatNote.track.mono) {
                    this.stopPreviousVoice(flatNote.track, time)
                    this.registerVoice(flatNote.track, voice)
                }
                if (opts.registerSynth) this.registerSynthVoice(voice)
                // Extra guard: if another play() call registered a different
                // voice for this track while we were awaiting setup(), skip.
                if (flatNote.track.mono && this.activeVoices.get(flatNote.track) !== voice) {
                    this._activeVoiceSet.delete(voice)
                    this._activeNoteCount = Math.max(0, this._activeNoteCount - 1)
                    voice.cleanup()
                    return null
                }
                voice.start(time)
            }
            return voice
        } catch (e) {
            logger.error('Sound', 'Error in _playVoice:', e)
            return null
        }
    }

    playSample = async (flatNote, time) => {
        if (!flatNote) return
        return await this._playVoice(flatNote, time)
    }

    playGenerated = async (flatNote, time) => {
        if (Object.keys(this.generatedSounds).length === 0) {
            await this.loadGeneratedSounds()
        }
        if (!flatNote || Object.keys(this.generatedSounds).length === 0) return null
        return await this._playVoice(flatNote, time, { syncGeneratedSounds: true, registerSynth: true })
    }

    loadGeneratedSounds = async () => {
        if (this.generatedSoundsLoading || this.generatedSoundsLoadFailed) return
        this.generatedSoundsLoading = true
        try {
            await serviceRegistry.resourcesLoader?.loadGeneratedSounds(ResourcesLoader.GENERATED_SOUNDS_URL)
            this.generatedSoundsLoading = false
            if (Object.keys(this.generatedSounds).length === 0) {
                this.generatedSoundsLoadFailed = true
                logger.warn('Sound', 'loadGeneratedSounds loaded no generated sounds')
            }
        } catch (error) {
            this.generatedSoundsLoading = false
            this.generatedSoundsLoadFailed = true
            logger.error('Sound', 'loadGeneratedSounds failed', error)
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
            const fp = `${track.filterType}|${track.filterFreq}|${track.filterQ}|${track.saturationType}|${track.saturationAmount}|${track.sat}|${track.reverbType}|${track.reverbAmount}|${track.reverbOn}|${track.delayType}|${track.delayTime}|${track.delayDepth}|${track.delayOn}|${track.velocity}|${track.pan}`
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
        this.activeVoices = new WeakMap()
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