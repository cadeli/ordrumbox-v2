import Utils from './utils.js'
import AudioEngine from '../audio/engine.js'
import AudioStallDetector from '../audio/stall_detector.js'
import Transport from '../logic/transport/transport.js'
import { TICK } from './constants.js'
import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { getAutoAssignService, getAutoGenerateService } from '../state/service_loader.js'
import { soundRegistry } from '../state/sound_registry.js'
import { logger } from '../core/logger.js'

export default class Sequencer {
    static TAG = "Sequencer"

    constructor(options = {}) {
        this.serviceRegistry = options.serviceRegistry ?? serviceRegistry
        this.appState = options.appState ?? appState
        this.soundRegistry = options.soundRegistry ?? soundRegistry
        this.playbackEvents = options.playbackEvents ?? playbackEvents
        this._starting = false

        this.ensureTransport()
    }

    get isRunning() { return this.serviceRegistry.transport?.isRunning ?? false }
    get tick() { return this.serviceRegistry.transport?.tick ?? 0 }

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
            selectedPatternNum: this.appState.selectedPatternNum,
            getSelectedPatternNum: () => this.appState.selectedPatternNum,
            computeNextStep: (note, track) => this.serviceRegistry.patterns.computeNextPatternStepNote(note, track),
            getAutoGenerate: getAutoGenerateService,
            uiState: {}, // UI state removed
            TICK,
            secondsPerBeat: this.appState.secondsPerBeat,
        })
        this.playbackEvents.on("patternChange", (changedTracks) => {
            if (this.serviceRegistry.audioEngine) {
                this.serviceRegistry.audioEngine.invalidateCache()
                const selPattern = this.appState.patterns[this.appState.selectedPatternNum]
                if (changedTracks?.length) {
                    for (const track of changedTracks) {
                        this.serviceRegistry.audioEngine.syncTrack(track)
                    }
                } else {
                    this.serviceRegistry.audioEngine.syncAllTracks(selPattern)
                }
            }
        })
        this.playbackEvents.on("noteChange", () => {
            if (this.serviceRegistry.audioEngine) {
                this.serviceRegistry.audioEngine.invalidateCache()
            }
        })
        this.playbackEvents.on("trackParamChange", (track) => {
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
        if (this._starting) {
            logger.warn('Sequencer', "Sequencer::start: already starting, skipping")
            return
        }
        this._starting = true
        try {
            await this._startInner()
        } catch (error) {
            logger.error('Sequencer', "Sequencer::start: unexpected error", error)
        } finally {
            this._starting = false
        }
    }

    _startInner = async () => {
        try {
            await this.serviceRegistry.resourcesLoader.ensureResourcesLoaded()
            this.playbackEvents.emit("drumkitChange")
        } catch (error) {
            logger.error('Sequencer', "Sequencer::start: Failed to load resources", error)
            return
        }

        let selPattern = this.appState.patterns[this.appState.selectedPatternNum]
        if (!selPattern) {
            logger.warn('Sequencer', "Sequencer::start: No selected pattern")
            return
        }

        // Ensure transport has the current audioCtx (created in toggleStartStop)
        if (!this.serviceRegistry.audioCtx) {
            logger.warn('Sequencer', "Sequencer::start: No audioCtx available")
            return
        }
        this.ensureTransport()
        this.serviceRegistry.transport.setBpm(selPattern.bpm)
        const autoAssign = await getAutoAssignService()
        await autoAssign.autoAssignSounds(selPattern)
        this.serviceRegistry.patterns.computeFlatNotesFromPattern(selPattern, 0)

        this.ensureAudioEngine()
        await this.serviceRegistry.audioEngine.start(selPattern)
        this.serviceRegistry.transport.start()
        this._stallDetector = new AudioStallDetector({
            audioCtx: this.serviceRegistry.audioCtx,
            transport: this.serviceRegistry.transport
        })
        this._stallDetector.start()
        this.playbackEvents.emit("playbackStart")
    }

    stop = () => {
        this._stallDetector?.stop()
        this._stallDetector = null
        this.serviceRegistry.transport?.stop()
        this.playbackEvents.emit("playbackStop")
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
                logger.error('Sequencer', "Sequencer::toggleStartStop: Failed to create AudioContext", err)
                return
            }
        }

        // Resume audio context on user interaction (spacebar/click)
        if (this.serviceRegistry.audioCtx && this.serviceRegistry.audioCtx.state === 'suspended') {
            this.serviceRegistry.audioCtx.resume().catch(err => {
                logger.error('Sequencer', "Sequencer::toggleStartStop: Failed to resume AudioContext", err);
            });
        }

        if (this.isRunning === false) {
            this.start()
        } else {
             this.stop()
        }
    }

    setBpm = (bpm) => {
        this.serviceRegistry.transport?.setBpm(bpm)
        let selPat = this.appState.patterns[this.appState.selectedPatternNum]
        if (selPat) selPat.bpm = bpm
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
                this.serviceRegistry.audioCtx = new (window.AudioContext ?? window.webkitAudioContext)()
            } catch (_) {}
        }
        if (!this.serviceRegistry.audioCtx) return
        if (this.serviceRegistry.audioCtx.state === 'suspended') {
            try {
                await this.serviceRegistry.audioCtx.resume()
            } catch (_) {}
        }
        this.ensureTransport()
        this.ensureAudioEngine()
        const pat = this.appState.patterns[this.appState.selectedPatternNum]
        if (!pat) return
        const tracks = Utils.getTracksArray(pat)
        const track = typeof indexTrack === 'number' ? tracks[indexTrack] : pat.tracks?.[indexTrack]
        if (!track) return
        if ((track.soundId === "NOT_DEFINED" || !track.soundId) && !track.useSoftSynth) {
            try {
                await this.serviceRegistry.resourcesLoader.ensureResourcesLoaded()
            } catch (e) {
                logger.error('Sequencer', "simpleBeep: resources not loaded", e)
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
