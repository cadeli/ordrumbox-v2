import Player from './player.js'
import Mixer from './mixer.js'
import { recomputeFlatNotes } from '../patterns/engine.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { instrumentsManager } from '../logic/services/instrument_manager/index.js'
import Utils from '../core/utils.js'
import { applyParamsToStrip } from './strip_sync.js'
import { logger, nameOr } from '../core/logger.js'
import { showToast } from '../core/notify.js'
import { pushStepLfo } from './step_lfo.js'
import { createMidiMappingResolver, sendMidiNotes, sendTriggerMidi } from './midi_out.js'
import { exportOffline as renderOffline } from './offline_export.js'

export default class AudioEngine {
    static TAG = 'AUDIOENGINE'

    #cachedPatternRef
    #cachedLoop
    #cachedVersion
    #resolveMidiMapping
    #workletReady
    #silentBuffer

    constructor(config) {
        this.audioCtx = config.audioCtx
        this.sounds = config.sounds
        this.generatedSounds = nameOr(config.generatedSounds, {}, 'AudioEngine', 'generatedSounds fallback')
        this.patterns = config.patterns
        this.getSelectedPatternNum = config.getSelectedPatternNum ?? (() => config.selectedPatternNum ?? 0)
        this.getAutoGenerate = config.getAutoGenerate
        this.TICK = config.TICK
        this.secondsPerBeat = config.secondsPerBeat
        this.computeNextStep = config.computeNextStep
        this.instrumentsManager = instrumentsManager
        this.isOffline = !!config.isOffline

        this.flatNotes = new Map()
        this.#cachedPatternRef = null
        this.#cachedLoop = 0
        this.#resolveMidiMapping = createMidiMappingResolver()
        this.mixer = new Mixer(this.audioCtx)
        this.player = null
        this.sound = null

        // Worklet initialisation happens asynchronously. The player/sound are
        // constructed AFTER the worklet mixer is ready so they hold the correct
        // (worklet-based) mixer reference — not the legacy placeholder above.
        this.#workletReady = (async () => {
            try {
                const mixer = await Mixer.create(this.audioCtx)
                this.mixer = mixer

                this.player = new Player({
                    audioCtx: this.audioCtx,
                    mixer: this.mixer,
                    sounds: this.sounds,
                    generatedSounds: this.generatedSounds,
                    patterns: this.patterns,
                    getSelectedPatternNum: this.getSelectedPatternNum,
                    computeFlatNotes: this.computeFlatNotes.bind(this),
                    getAutoGenerate: this.getAutoGenerate,
                    getFlatNotes: (loop) => this.getFlatNotesForCurrentPattern(loop),
                    TICK: this.TICK,
                    secondsPerBeat: this.secondsPerBeat,
                    isOffline: this.isOffline,
                })
                this.sound = this.player.sound

                playbackEvents.emit('workletStatusChange', 'active')
            } catch (err) {
                logger.warn('AudioEngine: worklet init failed, audio unavailable', err)
                playbackEvents.emit('workletStatusChange', 'unavailable')
            }
        })()

        this.isRunning = false
        this.unlocked = false
        this.nextStepTime = 0

        // Pre-allocate silent buffer for unlock (reused across calls)
        this.#silentBuffer = this.audioCtx.createBuffer(1, 1, 22050)
    }

    /**
     * Resolves when the worklet mixer is ready to accept strips and play audio.
     */
    get ready() {
        return this.#workletReady
    }

    // ─── Pattern / flat-note helpers ────────────────────────────────────────────

    computeFlatNotes = (pattern, loop) => {
        this.flatNotes = recomputeFlatNotes(pattern, loop, this.computeNextStep, this.TICK)
        // Update cache so getFlatNotesForCurrentPattern doesn't recompute.
        // Without this, every loop start calls recomputeFlatNotes TWICE,
        // causing double TrackVariation.applyNoteVariation mutations.
        this.#cachedPatternRef = pattern
        this.#cachedLoop = loop
        this.#cachedVersion = pattern._version ?? 0
        return this.flatNotes
    }

    getFlatNotesForCurrentPattern = (loop = 0) => {
        const pattern = this.patterns[this.getSelectedPatternNum()]
        if (!pattern) return this.flatNotes

        const patternVersion = pattern._version ?? 0
        if (this.#cachedPatternRef === pattern && this.#cachedLoop === loop && this.#cachedVersion === patternVersion) {
            return this.flatNotes
        }

        this.#cachedPatternRef = pattern
        this.#cachedLoop = loop
        this.#cachedVersion = patternVersion
        this.flatNotes = recomputeFlatNotes(pattern, loop, this.computeNextStep, this.TICK)
        return this.flatNotes
    }

    invalidateCache = () => {
        this.#cachedPatternRef = null
        this.#cachedVersion = -1
        if (this.player) {
            this.player._lastFlatNotesLoop = -1
        }
    }

    // ─── Playback ───────────────────────────────────────────────────────────────

    start = async (pattern) => {
        try {
            if (!this.unlocked) this.playSilentBuffer()
            // Wait for worklet mixer to be ready before starting
            await this.#workletReady
            if (!this.player) {
                throw new Error('Audio engine failed to initialise (worklet unavailable)')
            }
            this.isRunning = true
            this.nextStepTime = this.audioCtx.currentTime
            this.mixer.start()

            // Reset and ramp transport clock
            if (this.mixer.transportClock) {
                const time = this.audioCtx.currentTime
                this.mixer.transportClock.offset.cancelScheduledValues(time)
                this.mixer.transportClock.offset.setValueAtTime(0, time)
                // Ramp for 1 hour to keep it linear
                this.mixer.transportClock.offset.linearRampToValueAtTime(3600, time + 3600)
            }

            // Re-apply every track's effect settings to its strip.
            if (pattern?.tracks) {
                await this.syncAllTracks(pattern)
            }
        } catch (err) {
            logger.warn('AudioEngine', 'start failed', err)
            showToast('Playback start failed', 'error')
            // Only abort callers when the engine cannot play at all (player never built).
            // Mixer/worklet degradation is non-fatal — playback/export continues degraded.
            if (!this.player) throw err
        }
    }

    stop = () => {
        this.isRunning = false
        if (this.sound) this.sound.stopAllVoices()
        if (this.mixer.transportClock) {
            this.mixer.transportClock.offset.cancelScheduledValues(this.audioCtx.currentTime)
            this.mixer.transportClock.offset.setValueAtTime(0, this.audioCtx.currentTime)
        }
        this.mixer.stop()
        if (serviceRegistry.midiManager) {
            serviceRegistry.midiManager.sendAllNotesOff()
        }
    }

    playNotes = async (tick, atTime) => {
        if (!this.isRunning) return
        if (!this.player) return
        const pattern = this.patterns[this.getSelectedPatternNum()]
        await pushStepLfo(this.mixer, pattern, tick, atTime, this.TICK)
        await this.player.playNotes(tick, atTime)
        sendMidiNotes(
            {
                audioCtx: this.audioCtx,
                patterns: this.patterns,
                getSelectedPatternNum: this.getSelectedPatternNum,
                TICK: this.TICK,
                player: this.player,
                getFlatNotes: (loop) => this.getFlatNotesForCurrentPattern(loop),
                resolveMapping: this.#resolveMidiMapping,
            },
            tick,
            atTime,
        )
    }

    simpleBeep = async (indexTrack, note = null) => {
        // Wait for the worklet mixer and player to be ready before triggering.
        await this.#workletReady
        if (!this.player) return
        if (this.audioCtx?.state === 'suspended') {
            await this.audioCtx.resume()
        }

        await this.player.simpleBeep(indexTrack, note)

        const midi = serviceRegistry.midiManager
        if (midi && midi.isReady && midi.selectedOutputId) {
            const pat = this.patterns[this.getSelectedPatternNum()]
            const tracks = Utils.getTracksArray(pat)
            const track = typeof indexTrack === 'number' ? tracks[indexTrack] : pat?.tracks?.[indexTrack]
            sendTriggerMidi({ track, note, resolveMapping: this.#resolveMidiMapping })
        }
    }

    playSilentBuffer = () => {
        const node = this.audioCtx.createBufferSource()
        node.buffer = this.#silentBuffer
        node.connect(this.audioCtx.destination)
        node.start(0)
        this.unlocked = true
    }

    // ─── Strip / track control ──────────────────────────────────────────────────

    getAnalyserData = () => {
        if (!this.mixer?.analyser) return null
        return {
            analyser: this.mixer.analyser,
            gFftData: this.mixer.gFftData,
            dataArray: this.mixer.dataArray,
        }
    }

    updateStrip = async (trackName, params) => {
        const strip = await this.mixer?.getOrCreateStrip(trackName)
        if (!strip) return
        applyParamsToStrip(strip, params, this.audioCtx.currentTime)
    }

    syncTrack = async (track) => {
        if (!track) return
        this.sound?.invalidateStripCache(track.name)
        await this.updateStrip(track.name, track)
    }

    syncAllTracks = async (pattern) => {
        if (!pattern?.tracks) return
        for (const track of Object.values(pattern.tracks)) {
            await this.syncTrack(track)
        }
    }

    setBpm = (bpm) => {
        this.mixer.setBpm(bpm)
    }

    updateGeneratedSounds = (generatedSounds) => {
        this.generatedSounds = generatedSounds
        if (!this.player) return
        this.player.updateGeneratedSounds(generatedSounds)
    }

    // ─── Offline export ─────────────────────────────────────────────────────────

    exportOffline = async (pattern, numLoops, OfflineAudioContextClass, bufferToWavFn) => {
        return renderOffline(
            {
                audioCtx: this.audioCtx,
                sounds: this.sounds,
                generatedSounds: this.generatedSounds,
                TICK: this.TICK,
                computeFlatNotes: this.computeFlatNotes,
            },
            pattern,
            numLoops,
            OfflineAudioContextClass,
            bufferToWavFn,
        )
    }
}
