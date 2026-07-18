import MfFlatNote from '../model/flatnote.js'
import MfNoteParams from '../patterns/note_params.js'
import { getAutoGenerateService } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { logger } from "../core/logger.js"
import Utils from '../core/utils.js'
import VoiceFactory from './voices/voice_factory.js'
import NodePool from './node_pool.js'
import { applyTrackToStrip } from './strip_sync.js'
import { TICK } from '../core/constants.js'
import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import MfResourcesLoader from '../loader/resources_loader.js'

const MAX_POLYPHONY = 16

/**
 * Unified audio engine core.
 * Combines pattern/sequencing logic (formerly MfPlayer)
 * with voice management (formerly MfSound).
 */
export default class EngineCore {
    constructor(config) {
        this.audioCtx = config.audioCtx
        this.mixer = config.mixer
        this.sounds = config.sounds
        this.generatedSounds = config.generatedSounds ?? {}
        this.patterns = config.patterns
        this.getSelectedPatternNum = config.getSelectedPatternNum ?? (() => config.selectedPatternNum ?? 0)
        this.computeFlatNotes = config.computeFlatNotes
        this.getAutoGenerate = config.getAutoGenerate
        this.TICK = config.TICK
        this.secondsPerBeat = config.secondsPerBeat

        // Voice management
        this.activeVoices = new WeakMap()
        this.activeSynthVoices = new Set()
        this._activeVoiceSet = new Set()
        this._activeNoteCount = 0

        this.nodePool = new NodePool(this.audioCtx)
        this.voiceFactory = new VoiceFactory(this.audioCtx, this.mixer, this.sounds, this.generatedSounds, this.nodePool)
        this.generatedSoundsLoading = false
        this.generatedSoundsLoadFailed = false

        // Track-level strip parameter cache
        this._stripParamCache = new Map()
        this._activeNoteCount = 0

        // Pattern/sequencing state
        this.patterns = this.patterns
        this.loop = 0
        this._lastFlatNotesMap = null
        this._lastFlatNotesLoop = -1
        this._trackIdxMap = null
        this._trackIdxMapRef = null

        // Generated sounds
        this.generatedSoundsLoading = false
        this.generatedSoundsLoadFailed = false
    }

    // ─── Voice Management ─────────────────────────────────────────────

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
                    const nbTicks = TICK * (pattern?.nbBeats ?? 4)
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

    playGenerated = async (flatNote, time) => {
        if (Object.keys(this.generatedSounds).length === 0) {
            this.loadGeneratedsounds()
            return
        }
        if (!flatNote) return
        await this._playVoice(flatNote, time, { syncGeneratedSounds: true })
    }

    play = async (flatNote, time) => {
        if (!flatNote) return
        if (flatNote.track.useSoftSynth === true) {
            await this.playGenerated(flatNote, time)
        } else {
            await this.playSample(flatNote, time)
        }
    }

    loadGeneratedsounds = () => {
        if (this.generatedSoundsLoading || this.generatedSoundsLoadFailed) return
        this.generatedSoundsLoading = true
        serviceRegistry.mfResourcesLoader?.loadGeneratedSounds(MfResourcesLoader.GENERATED_SOUNDS_URL).then(() => {
            this.generatedSoundsLoading = false
            if (Object.keys(this.generatedSounds).length === 0) {
                this.generatedSoundsLoadFailed = true
                console.warn("EngineCore::loadGeneratedsounds loaded no generated sounds")
            }
        }).catch((error) => {
            this.generatedSoundsLoading = false
            this.generatedSoundsLoadFailed = true
            console.error("EngineCore::loadGeneratedsounds failed", error)
        })
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

    // ─── Pattern / Sequencing ──────────────────────────────────────────

    playNotes = async (tick, atTime) => {
        try {
            const selPat = this.patterns[this.getSelectedPatternNum()]
            const nbTickForPattern = this.TICK * selPat.nbBeats
            const loopStep = tick % nbTickForPattern

            if (loopStep === 0) {
                await this._handleLoopStart(selPat)
            }

            // Use cached flatNotes map when loop hasn't changed
            let flatNotesMap
            if (this._lastFlatNotesLoop === this.loop && this._lastFlatNotesMap !== null) {
                flatNotesMap = this._lastFlatNotesMap
            } else {
                flatNotesMap = this.computeFlatNotes(selPat, this.loop)
                this._lastFlatNotesLoop = this.loop
                this._lastFlatNotesMap = flatNotesMap
            }

            if (loopStep === nbTickForPattern - 1) {
                this.loop++
            }

            if (!(flatNotesMap instanceof Map)) return

            const notesToPlay = flatNotesMap.get(loopStep)
            if (!notesToPlay) return

            const secondsPerBeat = this.secondsPerBeat

            // Cache trackIdxMap (only rebuild when tracks object changes)
            if (this._trackIdxMapRef !== selPat.tracks) {
                const trackKeys = Object.keys(selPat.tracks)
                this._trackIdxMap = new Map(trackKeys.map((k, i) => [selPat.tracks[k], i]))
                this._trackIdxMapRef = selPat.tracks
            }
            const trackIdxMap = this._trackIdxMap

            // Trigger all notes at the same tick concurrently
            const promises = []
            for (let i = 0; i < notesToPlay.length; i++) {
                const flatNote = notesToPlay[i]
                if (flatNote.track.mute === false) {
                    MfNoteParams.applyNoteParams(flatNote, secondsPerBeat)
                    promises.push(this.playSample(flatNote, atTime + flatNote.swingTime))
                    playbackEvents.dispatchNoteTrigger({
                        trackIdx: trackIdxMap.get(flatNote.track) ?? -1,
                        beat: flatNote.note.beat,
                        beatStep: flatNote.note.beatStep
                    })
                }
            }
            await Promise.all(promises)
        } catch (e) {
            console.error(e)
        }
    }

    _handleLoopStart = async (selPat) => {
        this._lastFlatNotesLoop = -1

        const tracks = selPat.tracks
        const trackKeys = Object.keys(tracks)

        if (selPat.autoGen) {
            const mfAutoGenerate = await getAutoGenerateService()
            const element = mfAutoGenerate.structureGen.getElement(this.loop)
            const isSectionStart = element.loopInElement === 0
            const isSectionEnd = element.isLastLoopBeforeChange

            if (isSectionStart || isSectionEnd) {
                const tag = isSectionEnd ? 'break' : 'generate'
                console.log(`[AutoGen] loop ${this.loop} — section: ${element.name} (${element.loopInElement + 1}/${element.elementLoops}) — ${tag} — genre: ${selPat._autoGenGenre}`)
            }

            const isHarmonicBoundary = isSectionStart || isSectionEnd
            const promises = []
            for (let i = 0; i < trackKeys.length; i++) {
                const track = tracks[trackKeys[i]]
                if (!isHarmonicBoundary) {
                    const type = Utils.detectTrackType(track.name)
                    if (type !== 'BASS' && type !== 'PIANO' && type !== 'ORGAN') continue
                }
                promises.push(mfAutoGenerate.changeTrack(this.loop, selPat, track))
            }
            await Promise.all(promises)
        } else {
            const promises = []
            for (let i = 0; i < trackKeys.length; i++) {
                const track = tracks[trackKeys[i]]
                if (track.auto === true) {
                    promises.push(
                        (async () => {
                            const mfAutoGenerate = await this.getAutoGenerate()
                            return mfAutoGenerate.changeTrack(this.loop, selPat, track)
                        })()
                    )
                }
            }
            await Promise.all(promises)
        }

        this.computeFlatNotes(selPat, this.loop)
    }

    computeFlatNotes = (pattern, loop) => {
        this._lastFlatNotesMap = this.computeFlatNotes(pattern, loop)
        return this._lastFlatNotesMap
    }

    getCurrentFlatNotesMap = () => this._lastFlatNotesMap

    simpleBeep = async (indexTrack) => {
        if (this.audioCtx == null) return
        const pat = this.patterns[this.getSelectedPatternNum()]
        const track = pat.tracks[indexTrack]
        if (!track) return

        const note = {
            name: "N_" + indexTrack + "_0_0",
            soundId: track.soundId,
            beatStep: 0,
            steppc: 0,
            beat: 0,
            velocity: 0.8,
            pan: 0,
            pitch: 0,
            arp: null,
            every: 1,
            pos: 0,
            prob: 1,
            arpTriggerProbability: 1,
            retriggerNum: 1,
            rate: 1,
            euclidianFill: 0
        }
        const flatNote = new MfFlatNote(0, track, note)
        await this.playSample(flatNote, this.audioCtx.currentTime)
        console.log("Play :" + track.name + "=" + this.sounds[track.soundId].url)
    }

    updateGeneratedSounds = (generatedSounds) => {
        this.generatedSounds = generatedSounds
    }
}