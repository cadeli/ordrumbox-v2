// @ts-check
import Utils from '../core/utils.js'
import AudioEngine from '../audio/engine.js'
import AudioStallDetector from '../audio/stall_detector.js'
import Transport from './transport/transport.js'
import { TICK } from '../core/constants.js'
import { songPatterns, songTempo } from './song_playback.js'
import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { getAutoAssignService, getAutoGenerateService } from '../state/service_loader.js'
import { soundRegistry } from '../state/sound_registry.js'
import { logger } from '../core/logger.js'
import { showToast } from '../core/notify.js'
import { EVENTS } from '../core/events.js'

export default class Sequencer {
    static TAG = 'Sequencer'

    #stallDetector
    #starting
    #pendingStop

    /**
     * Offline export flag: keeps the transport on the pattern's own bpm instead
     * of the arrangement's. Nothing assigns it today, so it always reads false.
     * @type {boolean}
     */
    isOffline

    constructor(options = {}) {
        this.serviceRegistry = options.serviceRegistry ?? serviceRegistry
        this.appState = options.appState ?? appState
        this.soundRegistry = options.soundRegistry ?? soundRegistry
        this.playbackEvents = options.playbackEvents ?? playbackEvents
        this.#starting = false
        this.#pendingStop = false

        this.ensureTransport()
    }

    get isRunning() {
        return this.serviceRegistry.transport?.isRunning ?? false
    }
    get tick() {
        return this.serviceRegistry.transport?.tick ?? 0
    }

    ensureTransport = () => {
        if (!this.serviceRegistry.transport) {
            this.serviceRegistry.transport = new Transport(this.serviceRegistry.audioCtx)
            this.serviceRegistry.transport.onSchedule = (tick, time) => {
                this.serviceRegistry.audioEngine?.playNotes(tick, time)
            }
        } else if (!this.serviceRegistry.transport.audioCtx) {
            this.serviceRegistry.transport.audioCtx = this.serviceRegistry.audioCtx
        }
    }

    ensureAudioEngine = () => {
        if (this.serviceRegistry.audioEngine) return
        this.serviceRegistry.audioEngine = new AudioEngine({
            audioCtx: this.serviceRegistry.audioCtx,
            sounds: this.soundRegistry.sounds,
            generatedSounds: this.soundRegistry.generatedSounds,
            patterns: this.appState.patterns,
            selectedPatternIdx: this.appState.selectedPatternIdx,
            getSelectedPatternIdx: () => this.appState.selectedPatternIdx,
            getCurrentView: () => this.appState.currentView,
            getSongs: () => this.appState.songs ?? [],
            getSelectedSongIdx: () => this.appState.selectedSongIdx ?? 0,
            getAutoGenerate: getAutoGenerateService,
            uiState: {}, // UI state removed
            TICK,
            secondsPerBeat: this.appState.secondsPerBeat,
        })
        this.playbackEvents.on(EVENTS.PATTERN_CHANGE, (changedTracks) => {
            if (this.serviceRegistry.audioEngine) {
                this.serviceRegistry.audioEngine.invalidateCache()
                const selectedPattern = this.appState.patterns[this.appState.selectedPatternIdx]
                if (changedTracks?.length) {
                    for (const track of changedTracks) {
                        this.serviceRegistry.audioEngine.syncTrack(track)
                    }
                } else {
                    this.serviceRegistry.audioEngine.syncAllTracks(selectedPattern)
                }
            }
        })
        this.playbackEvents.on(EVENTS.SELECTED_PATTERN_CHANGE, () => {
            if (this.serviceRegistry.audioEngine) {
                this.serviceRegistry.audioEngine.invalidateCache()
                const selectedPattern = this.appState.patterns[this.appState.selectedPatternIdx]
                if (selectedPattern) {
                    this.serviceRegistry.audioEngine.syncAllTracks(selectedPattern)
                    this.serviceRegistry.seq?.setBpm(selectedPattern.bpm)
                }
                if (this.serviceRegistry.transport?.isRunning) {
                    this.serviceRegistry.transport.tick = 0
                    this.serviceRegistry.transport.nextStepTime = this.serviceRegistry.audioCtx.currentTime
                }
            }
        })
        this.playbackEvents.on(EVENTS.VIEW_CHANGED, () => {
            this.syncPlaybackMode()
        })
        this.playbackEvents.on(EVENTS.NOTE_CHANGE, () => {
            if (this.serviceRegistry.audioEngine) {
                this.serviceRegistry.audioEngine.invalidateCache()
            }
        })
        this.playbackEvents.on(EVENTS.TRACK_PARAM_CHANGE, (track) => {
            if (this.serviceRegistry.audioEngine) {
                this.serviceRegistry.audioEngine.invalidateCache()
                this.serviceRegistry.audioEngine.syncTrack(track)
            }
        })
    }

    playSilentBuffer = () => {
        this.serviceRegistry.audioEngine?.playSilentBuffer()
    }

    start = async () => {
        if (this.#starting) {
            // If stop() was requested while start() was in-flight, honor it.
            this.#pendingStop = true
            return
        }
        this.#pendingStop = false
        this.#starting = true
        try {
            await this.#startInner()
            // If the user clicked stop while we were starting, honor it now.
            if (this.#pendingStop) {
                this.#pendingStop = false
                this.stop()
            }
        } catch (error) {
            logger.error('Sequencer', 'Sequencer::start: unexpected error', error)
        } finally {
            this.#starting = false
        }
    }

    #startInner = async () => {
        try {
            await this.serviceRegistry.resourcesLoader.ensureResourcesLoaded()
            this.playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)
        } catch (error) {
            logger.error('Sequencer', 'Sequencer::start: Failed to load resources', error)
            showToast('Failed to load audio resources', 'error')
            return
        }

        const selectedPattern = this.appState.patterns[this.appState.selectedPatternIdx]
        if (!selectedPattern) {
            logger.warn('Sequencer', 'Sequencer::start: No selected pattern')
            showToast('No pattern selected', 'warning')
            return
        }

        // Ensure transport has the current audioCtx (created in toggleStartStop)
        if (!this.serviceRegistry.audioCtx) {
            logger.warn('Sequencer', 'Sequencer::start: No audioCtx available')
            showToast('Audio not available', 'error')
            return
        }
        this.ensureTransport()
        // A song plays every pattern at one tempo; the arrangement's bpm wins.
        // Offline export deliberately keeps the pattern's own bpm so a render
        // never depends on which view happens to be open.
        const songBpm = this.isOffline ? null : this.currentSongTempo()
        this.serviceRegistry.transport.setBpm(songBpm ?? selectedPattern.bpm)
        const autoAssign = await getAutoAssignService()
        // A song sounds every pattern its clips reference, not only the selected
        // one. In pattern mode the selected pattern is the one that gets its
        // tracks assigned; here the others would keep soundId 'NOT_DEFINED'
        // and play nothing at all.
        for (const pattern of this.patternsToPlay(selectedPattern)) {
            await autoAssign.autoAssignSounds(pattern)
        }
        this.serviceRegistry.patterns.applyFlatNotes(selectedPattern)

        this.ensureAudioEngine()
        // Flat notes cache each track's soundId, so a pattern auto-assign has
        // just re-pointed must not keep its pre-assignment map.
        this.serviceRegistry.audioEngine.invalidateCache()
        await this.serviceRegistry.audioEngine.start(selectedPattern)
        this.serviceRegistry.transport.start()
        this.#stallDetector = new AudioStallDetector({
            audioCtx: this.serviceRegistry.audioCtx,
            transport: this.serviceRegistry.transport,
        })
        this.#stallDetector.start()
        this.playbackEvents.emit(EVENTS.PLAYBACK_START)
    }

    stop = () => {
        this.#stallDetector?.stop()
        this.#stallDetector = null
        this.serviceRegistry.transport?.stop()
        this.playbackEvents.emit(EVENTS.PLAYBACK_STOP)
        if (this.serviceRegistry.audioEngine) {
            this.serviceRegistry.audioEngine.stop()
        }
    }

    toggleStartStop = () => {
        // Trigger lazy AudioContext creation synchronously inside the user
        // gesture handler so that resume() is allowed by the browser.
        if (!this.serviceRegistry.audioCtx) {
            try {
                this.serviceRegistry.audioCtx = this.serviceRegistry.resourcesLoader.audioCtx
            } catch (err) {
                logger.error('Sequencer', 'Sequencer::toggleStartStop: Failed to create AudioContext', err)
                showToast('Audio initialization failed', 'error')
                return
            }
        }

        // Resume audio context on user interaction (spacebar/click)
        if (this.serviceRegistry.audioCtx && this.serviceRegistry.audioCtx.state === 'suspended') {
            this.serviceRegistry.audioCtx.resume().catch((err) => {
                logger.error('Sequencer', 'Sequencer::toggleStartStop: Failed to resume AudioContext', err)
            })
        }

        if (this.isRunning === false) {
            this.start()
        } else {
            this.stop()
        }
    }

    /** Tempo of the arrangement when a song is selected and being played. */
    /**
     * Patterns that need sounds assigned before the transport runs: the selected
     * one in pattern mode, the whole arrangement in song mode.
     * @param {object} selectedPattern
     * @returns {object[]}
     */
    patternsToPlay = (selectedPattern) => {
        if (this.isOffline || this.appState.currentView !== 'song') return [selectedPattern]
        const song = this.appState.songs?.[this.appState.selectedSongIdx ?? 0]
        const patterns = songPatterns(song, this.appState.patterns)
        return patterns.length ? patterns : [selectedPattern]
    }

    currentSongTempo = () => {
        const song = this.appState.songs?.[this.appState.selectedSongIdx ?? 0]
        if (!song) return null
        const lib = new Map((this.appState.patterns ?? []).filter((p) => p?.id).map((p) => [p.id, p]))
        return songTempo(song, lib)
    }

    /**
     * Re-anchor the transport when the view (and so the playback mode) changes:
     * a switch between pattern and song mode mid-playback must start the new
     * mode from its own zero, not continue a stale tick count.
     */
    syncPlaybackMode = () => {
        const transport = this.serviceRegistry.transport
        if (!transport?.isRunning) return
        transport.tick = 0
        transport.nextStepTime = this.serviceRegistry.audioCtx.currentTime
        const songBpm = this.currentSongTempo()
        if (songBpm != null) transport.setBpm(songBpm)
        this.serviceRegistry.audioEngine?.invalidateCache()
    }

    setBpm = (bpm) => {
        this.serviceRegistry.transport?.setBpm(bpm)
        const selectedPattern = this.appState.patterns[this.appState.selectedPatternIdx]
        if (selectedPattern) selectedPattern.bpm = bpm
        if (this.serviceRegistry.audioEngine) {
            this.serviceRegistry.audioEngine.setBpm(bpm)
        }
    }

    simpleBeep = async (indexTrack, note = null) => {
        if (!this.serviceRegistry.audioCtx) {
            this.serviceRegistry.audioCtx = this.serviceRegistry.resourcesLoader?.audioCtx ?? null
        }
        if (!this.serviceRegistry.audioCtx && typeof window !== 'undefined') {
            try {
                const win = /** @type {Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }} */ (
                    window
                )
                this.serviceRegistry.audioCtx = new (win.AudioContext ?? win.webkitAudioContext)()
            } catch (_) {
                /* no-op */
            }
        }
        if (!this.serviceRegistry.audioCtx) return
        if (this.serviceRegistry.audioCtx.state === 'suspended') {
            try {
                await this.serviceRegistry.audioCtx.resume()
            } catch (_) {
                /* no-op */
            }
        }
        this.ensureTransport()
        this.ensureAudioEngine()
        const pat = this.appState.patterns[this.appState.selectedPatternIdx]
        if (!pat) return
        const tracks = Utils.getTracksArray(pat)
        const track = typeof indexTrack === 'number' ? tracks[indexTrack] : pat.tracks?.[indexTrack]
        if (!track) return
        if ((track.soundId === 'NOT_DEFINED' || !track.soundId) && !track.useSoftSynth) {
            try {
                await this.serviceRegistry.resourcesLoader.ensureResourcesLoaded()
            } catch (e) {
                logger.error('Sequencer', 'simpleBeep: resources not loaded', e)
                return
            }
            const autoAssign = await getAutoAssignService()
            autoAssign.autoAssignTrackSounds(track)
        }
        if (this.serviceRegistry.audioEngine?.mixer) {
            await this.serviceRegistry.audioEngine.simpleBeep(indexTrack, note)
        }
    }
}
