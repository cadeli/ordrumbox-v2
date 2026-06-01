import Utils from './utils.js'
import AudioEngine from '../audio/engine.js'
import Transport from '../logic/transport/transport.js'
import { TICK } from './constants.js'
import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { getAutoAssignService, getAutoGenerateService, serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'

export default class MfSeq {
    static TAG = "MFSEQ"

    constructor(options = {}) {
        this.serviceRegistry = options.serviceRegistry ?? serviceRegistry
        this.appState = options.appState ?? appState
        this.soundRegistry = options.soundRegistry ?? soundRegistry
        this.playbackEvents = options.playbackEvents ?? playbackEvents

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
            computeNextStep: (note, track) => this.serviceRegistry.mfPatterns.computeNextPatternStepNote(note, track),
            getAutoGenerate: getAutoGenerateService,
            uiState: {}, // UI state removed
            TICK,
            secondsPerBeat: this.appState.secondsPerBeat,
            loadGeneratedSoundsFn: this.serviceRegistry.mfResourcesLoader?.loadGeneratedSounds.bind(this.serviceRegistry.mfResourcesLoader)
        })
        this.playbackEvents.onPatternChange.push(() => {
            if (this.serviceRegistry.audioEngine) {
                this.serviceRegistry.audioEngine.invalidateCache()
                const selPattern = this.appState.patterns[this.appState.selectedPatternNum]
                this.serviceRegistry.audioEngine.syncAllTracks(selPattern)
            }
        })
    }

    playSilentBuffer = () => {
        this.serviceRegistry.audioEngine?.playSilentBuffer()
    }

    start = async () => {
        try {
            await this.serviceRegistry.mfResourcesLoader.ensureResourcesLoaded()
            this.playbackEvents.onDrumkitChange.forEach(cb => cb())
        } catch (error) {
            console.error("MfSeq::start: Failed to load resources", error)
            return
        }

        let selPattern = this.appState.patterns[this.appState.selectedPatternNum]
        if (!selPattern) {
            console.warn("MfSeq::start: No selected pattern")
            return
        }

        // Setup for playback
        this.ensureTransport()
        this.serviceRegistry.transport.setBpm(selPattern.bpm)
        const mfAutoAssign = await getAutoAssignService()
        await mfAutoAssign.autoAssignSounds(selPattern)
        this.serviceRegistry.mfPatterns.computeFlatNotesFromPattern(selPattern, 0)

   

        this.ensureAudioEngine()
        this.serviceRegistry.audioEngine.start(selPattern)
        this.serviceRegistry.transport.start()
        this.playbackEvents.onPlaybackStart.forEach(cb => cb())
    }

    stop = () => {
        this.serviceRegistry.transport?.stop()
        this.playbackEvents.onPlaybackStop.forEach(cb => cb())
        if (this.serviceRegistry.audioEngine) {
            this.serviceRegistry.audioEngine.stop()
        }
    }

    toggleStartStop = () => {
        // Resume audio context on user interaction (spacebar/click)
        if (this.serviceRegistry.audioCtx && this.serviceRegistry.audioCtx.state === 'suspended') {
            this.serviceRegistry.audioCtx.resume().catch(err => {
                console.error("MfSeq::toggleStartStop: Failed to resume AudioContext", err);
            });
        }

        if (this.isRunning === false) {
            this.start()
        } else {
             this.stop()
        }
        console.log("mfSeq::toggleStartStop")
    }

    setBpm = (bpm) => {
        this.serviceRegistry.transport?.setBpm(bpm)
        let selPat = this.appState.patterns[this.appState.selectedPatternNum]
        if (selPat) selPat.bpm = bpm
        if (this.serviceRegistry.audioEngine) {
            this.serviceRegistry.audioEngine.setBpm(bpm)
        }
        console.log("mdSeq::setBpm new bpm is ", bpm)
    }

    displayLagWarning = (interval) => {
        console.log("lag de " + parseFloat(interval) + " Ms")
    }

    simpleBeep = async (indexTrack) => {
        if (!this.serviceRegistry.audioCtx) {
            this.serviceRegistry.audioCtx = this.serviceRegistry.mfResourcesLoader.audioCtx
        }
        if (!this.serviceRegistry.audioCtx) return
        this.ensureAudioEngine()
        const pat = this.appState.patterns[this.appState.selectedPatternNum]
        const track = pat?.tracks?.[indexTrack]
        if (!track) return
        if (track.soundId === "NOT_DEFINED" || !track.soundId) {
            try {
                await this.serviceRegistry.mfResourcesLoader.ensureResourcesLoaded()
            } catch (e) {
                console.error("simpleBeep: resources not loaded", e)
                return
            }
            const mfAutoAssign = await getAutoAssignService()
            mfAutoAssign.autoAssignTrackSounds(track)
        }
        if (this.serviceRegistry.audioEngine?.mixer) {
            this.serviceRegistry.audioEngine.simpleBeep(indexTrack)
        }
    }
}
