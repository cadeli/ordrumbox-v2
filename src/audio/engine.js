import Player from './player.js'
import Mixer from './mixer.js'
import { recomputeFlatNotes } from '../patterns/pattern_engine.js'
import { PLAYBACK_MODE, songPatterns } from '../logic/song_playback.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/event_bus.js'
import { instrumentsManager } from '../logic/services/instruments_manager/index.js'
import { getTracksArray } from '../core/tracks.js'
import { applyTrackParamsToStrip } from './strip_sync.js'
import { logger, valueOrFallback } from '../core/logger.js'
import { showToast } from '../core/notify.js'
import { pushStepLfo } from './step_lfo.js'
import { createMidiMappingResolver, sendMidiNotes, sendTriggerMidi } from './midi_out.js'
import { exportOffline as renderOffline } from './offline_export.js'
import { resolveSelectedPatternIdxGetter } from './selected_pattern_idx.js'
import { EVENTS } from '../core/events.js'

export default class Engine {
    static TAG = 'AUDIOENGINE'

    #cachedPatternRef
    #cachedLoop
    #cachedVersion
    /** pattern -> { loop, version, map }, for multi-pattern song playback */
    #perPatternFlatNotes = new Map()
    #resolveMidiMapping
    #workletReady
    #silentBuffer

    constructor(config) {
        this.audioCtx = config.audioCtx
        this.sounds = config.sounds
        this.generatedSounds = valueOrFallback(config.generatedSounds, {}, 'Engine', 'generatedSounds fallback')
        this.patterns = config.patterns
        // The audio layer reads appState only through injected resolvers, which
        // keeps it testable without the store.
        this.getSelectedPatternIdx = resolveSelectedPatternIdxGetter(config)
        this.getCurrentView = config.getCurrentView ?? (() => 'edit')
        this.getSongs = config.getSongs ?? (() => [])
        this.getSelectedSongIdx = config.getSelectedSongIdx ?? (() => 0)
        this.getAutoGenerator = config.getAutoGenerator
        this.TICK = config.TICK
        this.secondsPerTick = config.secondsPerTick
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
                    getSelectedPatternIdx: this.getSelectedPatternIdx,
                    computeFlatNotes: this.computeFlatNotes.bind(this),
                    getAutoGenerator: this.getAutoGenerator,
                    getFlatNotes: (loop) => this.getFlatNotesForCurrentPattern(loop),
                    getFlatNotesForPattern: (pattern, loop) => this.getFlatNotesForPattern(pattern, loop),
                    getPlaybackMode: this.getPlaybackMode,
                    getSong: this.getSong,
                    TICK: this.TICK,
                    secondsPerTick: this.secondsPerTick,
                    isOffline: this.isOffline,
                })
                this.sound = this.player.sound

                playbackEvents.emit(EVENTS.WORKLET_STATUS_CHANGE, 'active')
            } catch (err) {
                logger.warn('Engine: worklet init failed, audio unavailable', err)
                playbackEvents.emit(EVENTS.WORKLET_STATUS_CHANGE, 'unavailable')
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

    /**
     * Playback mode follows the visible view: the Song view plays the
     * arrangement, every other view loops the selected pattern.
     * @returns {'pattern'|'song'}
     */
    getPlaybackMode = () => (this.getCurrentView() === 'song' ? PLAYBACK_MODE.SONG : PLAYBACK_MODE.PATTERN)

    /**
     * Patterns the current arrangement plays, so their strips get built.
     * Empty outside song mode, where only the selected pattern is prepared.
     * @returns {object[]}
     */
    songPatternsToPlay = () => {
        if (this.getCurrentView() !== 'song') return []
        return songPatterns(this.getSong(), this.patterns)
    }

    /** The selected song, or null when the library has none. */
    getSong = () => this.getSongs?.()[this.getSelectedSongIdx?.() ?? 0] ?? null

    computeFlatNotes = (pattern, loop) => {
        this.flatNotes = recomputeFlatNotes(pattern, loop, this.TICK)
        // Update cache so getFlatNotesForCurrentPattern doesn't recompute.
        // Without this, every loop start would build flat notes (including the
        // variation2 layer) twice.
        this.#cachedPatternRef = pattern
        this.#cachedLoop = loop
        this.#cachedVersion = pattern._revision ?? 0
        return this.flatNotes
    }

    /**
     * Flat notes for an arbitrary pattern at a given cycle.
     *
     * Song playback layers several patterns at once, so the single-slot cache
     * above cannot serve it: each pattern needs its own map, keyed by identity
     * plus its cycle counter (which drives `every` and variation).
     * @param {{_revision?: number}} pattern
     * @param {number} [loop]
     * @returns {Map<number, any[]>}
     */
    getFlatNotesForPattern = (pattern, loop = 0) => {
        if (!pattern) return this.flatNotes
        const version = pattern._revision ?? 0
        const cached = this.#perPatternFlatNotes.get(pattern)
        if (cached && cached.loop === loop && cached.version === version) return cached.map
        const map = recomputeFlatNotes(pattern, loop, this.TICK)
        this.#perPatternFlatNotes.set(pattern, { loop, version, map })
        return map
    }

    getFlatNotesForCurrentPattern = (loop = 0) => {
        const pattern = this.patterns[this.getSelectedPatternIdx()]
        if (!pattern) return this.flatNotes

        const patternVersion = pattern._revision ?? 0
        if (this.#cachedPatternRef === pattern && this.#cachedLoop === loop && this.#cachedVersion === patternVersion) {
            return this.flatNotes
        }

        this.#cachedPatternRef = pattern
        this.#cachedLoop = loop
        this.#cachedVersion = patternVersion
        this.flatNotes = recomputeFlatNotes(pattern, loop, this.TICK)
        return this.flatNotes
    }

    invalidateCache = () => {
        this.#cachedPatternRef = null
        this.#cachedVersion = -1
        this.#perPatternFlatNotes.clear()
        if (this.player) {
            this.player.invalidateCache()
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

            // Re-apply every track's effect settings to its strip. In song mode
            // the arrangement plays patterns other than the selected one, and a
            // strip is created lazily per track name — so they need their own
            // pass or those patterns would play through nothing.
            if (pattern?.tracks) {
                await this.syncAllTracks(pattern)
            }
            for (const songPattern of this.songPatternsToPlay()) {
                if (songPattern === pattern) continue
                await this.syncAllTracks(songPattern)
            }
        } catch (err) {
            logger.warn('Engine', 'start failed', err)
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
        const pattern = this.patterns[this.getSelectedPatternIdx()]
        await pushStepLfo(this.mixer, pattern, tick, atTime, this.TICK)
        await this.player.playNotes(tick, atTime)
        sendMidiNotes(
            {
                audioCtx: this.audioCtx,
                patterns: this.patterns,
                getSelectedPatternIdx: this.getSelectedPatternIdx,
                TICK: this.TICK,
                player: this.player,
                getFlatNotes: (loop) => this.getFlatNotesForCurrentPattern(loop),
                resolveMapping: this.#resolveMidiMapping,
            },
            tick,
            atTime,
        )
    }

    simpleBeep = async (trackIdx, note = null) => {
        // Wait for the worklet mixer and player to be ready before triggering.
        await this.#workletReady
        if (!this.player) return
        if (this.audioCtx?.state === 'suspended') {
            await this.audioCtx.resume()
        }

        await this.player.simpleBeep(trackIdx, note)

        const midi = serviceRegistry.midiManager
        if (midi && midi.isReady && midi.selectedOutputId) {
            const pat = this.patterns[this.getSelectedPatternIdx()]
            const tracks = getTracksArray(pat)
            const track = typeof trackIdx === 'number' ? tracks[trackIdx] : pat?.tracks?.[trackIdx]
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

    /**
     * @param {string} trackName
     * @param {object} track the TRACK (not a params bag): absent fields are left
     *   untouched, which is what distinguishes this from syncTrack
     */
    updateStrip = async (trackName, track) => {
        const strip = await this.mixer?.getOrCreateStrip(trackName)
        if (!strip) return
        applyTrackParamsToStrip(strip, track, this.audioCtx.currentTime)
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

    /**
     * Points the engine at a new generatedSounds map (REPLACES the reference, it
     * does not merge). Sound.mergeGeneratedSounds merges instead and
     * re-pushes the playing voices — hence the distinct names.
     * @param {Record<string, object>} generatedSounds
     */
    setGeneratedSounds = (generatedSounds) => {
        this.generatedSounds = generatedSounds
        if (!this.player) return
        this.player.setGeneratedSounds(generatedSounds)
    }

    // ─── Offline export ─────────────────────────────────────────────────────────

    exportOffline = async (pattern, loopCount, OfflineAudioContextClass, bufferToWavFn) => {
        return renderOffline(
            {
                audioCtx: this.audioCtx,
                sounds: this.sounds,
                generatedSounds: this.generatedSounds,
                TICK: this.TICK,
                computeFlatNotes: this.computeFlatNotes,
            },
            pattern,
            loopCount,
            OfflineAudioContextClass,
            bufferToWavFn,
        )
    }
}
