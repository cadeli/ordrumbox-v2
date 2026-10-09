import { getTracksArray } from '../core/tracks.js'
import Engine from '../audio/engine.js'
import StallDetector from '../audio/stall_detector.js'
import Transport from './transport/transport.js'
import { TICK } from '../core/constants.js'
import { measureToTick, songPatterns, songTempo } from './song_playback.js'
import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/event_bus.js'
import { serviceRegistry } from '../state/service_registry.js'
import { getAutoAssignService, getAutoGeneratorService } from '../state/service_loader.js'
import { soundRegistry } from '../state/sound_registry.js'
import { logger } from '../core/logger.js'
import { showToast } from '../core/notify.js'
import { EVENTS } from '../core/events.js'

export default class Sequencer {
    static TAG = 'Sequencer'

    #stallDetector
    #starting
    #pendingStop
    /** Measure the arrangement cursor is on; the song ruler sets it. */
    #songCursorMeasure = 0
    /** Whether the transport was last anchored in the song view's mode. */
    #anchoredSongMode = false

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
    /** @returns {number} measure the arrangement cursor is on */
    get songCursorMeasure() {
        return this.#songCursorMeasure
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
        this.serviceRegistry.audioEngine = new Engine({
            audioCtx: this.serviceRegistry.audioCtx,
            sounds: this.soundRegistry.sounds,
            generatedSounds: this.soundRegistry.generatedSounds,
            patterns: this.appState.patterns,
            getSelectedPatternIdx: () => this.appState.selectedPatternIdx,
            getCurrentView: () => this.appState.currentView,
            getSongs: () => this.appState.songs ?? [],
            getSelectedSongIdx: () => this.appState.selectedSongIdx ?? 0,
            getAutoGenerator: getAutoGeneratorService,
            uiState: {}, // UI state removed
            TICK,
            secondsPerTick: this.appState.secondsPerTick,
        })
        this.playbackEvents.on(EVENTS.PATTERN_CHANGE, (changedTracks) => {
            if (this.serviceRegistry.audioEngine) {
                this.serviceRegistry.audioEngine.invalidateCache()
                const selectedPattern = this.appState.selectedPattern
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
                const selectedPattern = this.appState.selectedPattern
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

        const selectedPattern = this.appState.selectedPattern
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
        // The tempo belongs to the visible view: the song view runs the whole
        // arrangement at its bpm, every other view loops the selected pattern at
        // the pattern's own bpm. Offline export deliberately keeps the pattern's
        // own bpm so a render never depends on which view happens to be open.
        const bpm = this.currentPlaybackTempo() ?? selectedPattern.bpm
        this.serviceRegistry.transport.setBpm(bpm)
        this.#anchoredSongMode = this.appState.currentView === 'song'
        const autoAssign = await getAutoAssignService()
        // A song sounds every pattern its clips reference, not only the selected
        // one. In pattern mode the selected pattern is the one that gets its
        // tracks assigned; here the others would keep sampleId 'NOT_DEFINED'
        // and play nothing at all.
        for (const pattern of this.patternsToPlay(selectedPattern)) {
            await autoAssign.autoAssignSounds(pattern)
        }
        this.serviceRegistry.flatNotes.applyFlatNotes(selectedPattern)

        this.ensureAudioEngine()
        // Flat notes cache each track's sampleId, so a pattern auto-assign has
        // just re-pointed must not keep its pre-assignment map.
        this.serviceRegistry.audioEngine.invalidateCache()
        await this.serviceRegistry.audioEngine.start(selectedPattern)
        // The strips derive their delay times from the bpm, so they must follow
        // the tempo the transport was just given.
        this.serviceRegistry.audioEngine.setBpm(bpm)
        this.serviceRegistry.transport.start()
        // An arrangement plays from the cursor the user aimed with the ruler. A
        // pattern view has no measures, so it always starts from its own zero: a
        // song measure would land mid-pattern.
        if (this.appState.currentView === 'song') this.#applySongCursor()
        this.#stallDetector = new StallDetector({
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

    /**
     * Aim the arrangement cursor at a measure — the DAW gesture of clicking the
     * ruler to move the playhead.
     *
     * The cursor is what the next play starts from; while the transport already
     * runs it is also jumped to at once, so playback follows the click.
     *
     * @param {number} measure 0-based measure
     */
    setSongCursor = (measure) => {
        this.#songCursorMeasure = Math.max(0, Math.floor(Number(measure) || 0))
        this.#applySongCursor()
    }

    /**
     * Put the running transport on the cursor.
     *
     * Re-anchored on the audio clock, so the measure jumped to sounds right away
     * instead of after whatever the scheduler had already queued.
     * @returns {boolean} false when there is no transport to aim
     */
    #applySongCursor = () => {
        const transport = this.serviceRegistry.transport
        if (!transport?.isRunning) return false
        transport.tick = measureToTick(this.#songCursorMeasure, TICK)
        transport.nextStepTime = this.serviceRegistry.audioCtx?.currentTime ?? 0
        this.serviceRegistry.audioEngine?.invalidateCache()
        return true
    }

    /**
     * Patterns that need sounds assigned before the transport runs: the selected
     * one in pattern mode, the whole arrangement in song mode.
     * @param {object} selectedPattern
     * @returns {object[]}
     */
    patternsToPlay = (selectedPattern) => {
        if (this.appState.currentView !== 'song') return [selectedPattern]
        const song = this.appState.songs?.[this.appState.selectedSongIdx ?? 0]
        const patterns = songPatterns(song, this.appState.patterns)
        return patterns.length ? patterns : [selectedPattern]
    }

    /** Tempo of the arrangement when a song is selected and being played. */
    currentSongTempo = () => {
        const song = this.appState.songs?.[this.appState.selectedSongIdx ?? 0]
        if (!song) return null
        const lib = new Map((this.appState.patterns ?? []).filter((p) => p?.id).map((p) => [p.id, p]))
        return songTempo(song, lib)
    }

    /**
     * The tempo the transport must run at for the visible view: the song view
     * plays the whole arrangement at its own bpm, every other view loops the
     * selected pattern at the pattern's own bpm. Looking at a song's tempo from
     * a pattern view is what made playback jump back to the arrangement's bpm
     * on a view switch.
     * @returns {number|null}
     */
    currentPlaybackTempo = () => {
        const patternBpm = this.appState.selectedPattern?.bpm ?? null
        if (this.appState.currentView !== 'song') return patternBpm
        return this.currentSongTempo() ?? patternBpm
    }

    /**
     * Re-anchor the transport when the playback mode (pattern vs song) changes:
     * a switch between the two modes mid-playback must start the new mode from
     * its own zero, not continue a stale tick count. Two pattern views — grid,
     * synth, piano roll — share one mode, so switching between them leaves the
     * transport, and its tempo, alone.
     */
    syncPlaybackMode = () => {
        const transport = this.serviceRegistry.transport
        if (!transport?.isRunning) return
        const songMode = this.appState.currentView === 'song'
        if (songMode === this.#anchoredSongMode) return
        this.#anchoredSongMode = songMode
        transport.tick = 0
        transport.nextStepTime = this.serviceRegistry.audioCtx.currentTime
        const bpm = this.currentPlaybackTempo()
        if (bpm != null) {
            transport.setBpm(bpm)
            this.serviceRegistry.audioEngine?.setBpm(bpm)
        }
        this.serviceRegistry.audioEngine?.invalidateCache()
    }

    setBpm = (bpm) => {
        this.serviceRegistry.transport?.setBpm(bpm)
        const selectedPattern = this.appState.selectedPattern
        if (selectedPattern) selectedPattern.bpm = bpm
        if (this.serviceRegistry.audioEngine) {
            this.serviceRegistry.audioEngine.setBpm(bpm)
        }
    }

    simpleBeep = async (trackIdx, note = null) => {
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
        const pat = this.appState.selectedPattern
        if (!pat) return
        const tracks = getTracksArray(pat)
        const track = typeof trackIdx === 'number' ? tracks[trackIdx] : pat.tracks?.[trackIdx]
        if (!track) return
        if ((track.sampleId === 'NOT_DEFINED' || !track.sampleId) && !track.useSoftSynth) {
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
            await this.serviceRegistry.audioEngine.simpleBeep(trackIdx, note)
        }
    }
}
