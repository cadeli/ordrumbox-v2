import MfPlayer from './player.js'
import MfMixer from './mixer.js'
import MfSound from './sound.js'
import MfNoteParams from '../patterns/note_params.js'
import { computeFlatNotesFromPattern as computeFlatNotesPure } from '../patterns/engine.js'
import { serviceRegistry } from '../state/service_registry.js'
import { appState } from '../state/app_state.js'
import InstrumentsManager from '../logic/services/instruments_manager.js'
import WorkletBridge from './worklets/bridge.js'

export default class AudioEngine {
    static TAG = "AUDIOENGINE"

    constructor(config) {
        this.audioCtx = config.audioCtx
        this.sounds = config.sounds
        this.generatedSounds = config.generatedSounds || {}
        this.patterns = config.patterns
        this.getSelectedPatternNum = config.getSelectedPatternNum ?? (() => config.selectedPatternNum ?? 0)
        this.getAutoGenerate = config.getAutoGenerate
        this.TICK = config.TICK
        this.secondsPerBeat = config.secondsPerBeat
        this.loadGeneratedSoundsFn = config.loadGeneratedSoundsFn
        this.computeNextStep = config.computeNextStep
        this.instrumentsManager = new InstrumentsManager()

        this.flatNotes = new Map()
        this._cachedPatternRef = null
        this._cachedLoop = 0
        this.mixer = new MfMixer(this.audioCtx)

        this.player = new MfPlayer({
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
        })
        this.mfSound = this.player.mfSound

        this.isRunning = false
        this.unlocked = false
        this.nextStepTime = 0
    }

    computeFlatNotes = (pattern, loop) => {
        this.flatNotes = computeFlatNotesPure(pattern, loop, this.computeNextStep, this.TICK)
        return this.flatNotes
    }

    getFlatNotesForCurrentPattern = (loop = 0) => {
        const pattern = this.patterns[this.getSelectedPatternNum()]
        if (!pattern) return this.flatNotes

        // Check if we can use the cache
        const patternVersion = pattern._version || 0
        if (this._cachedPatternRef === pattern && 
            this._cachedLoop === loop && 
            this._cachedVersion === patternVersion) {
            return this.flatNotes
        }

        this._cachedPatternRef = pattern
        this._cachedLoop = loop
        this._cachedVersion = patternVersion
        this.flatNotes = computeFlatNotesPure(pattern, loop, this.computeNextStep, this.TICK)
        return this.flatNotes
    }

    invalidateCache = () => {
        this._cachedPatternRef = null
        this._cachedVersion = -1
    }

    /**
     * Auto-upgrade mixer + all existing strips to use AudioWorkletNodes
     * for saturation, filter, reverb, delay, and LFOs.
     *
     * Idempotent: subsequent calls are no-ops if already upgraded.
     * Updates `appState.workletStatus` to 'active' or 'unavailable'.
     */
    upgradeToWorklets = async () => {
        if (!this.mixer) return false
        if (appState.workletStatus === 'active') return true

        const ctx = this.audioCtx
        if (!WorkletBridge.isAvailable(ctx)) {
            appState.workletStatus = 'unavailable'
            return false
        }

        // Upgrade mixer (master bus)
        const mixerOk = await WorkletBridge.upgradeMixer(this.mixer)
        if (!mixerOk) {
            appState.workletStatus = 'unavailable'
            return false
        }

        // The mixer needs to re-start to wire busInput → busWorklet
        // (preserves native nodes as fallbacks, but in active mode uses worklet)
        // We don't re-start here to avoid disrupting playback; the worklet
        // node is created and will be picked up on next start().

        // Upgrade all existing strips
        const stripNames = Object.keys(this.mixer.strips || {})
        for (const name of stripNames) {
            const strip = this.mixer.strips[name]
            if (strip) {
                await WorkletBridge.upgrade(strip)
                await WorkletBridge.upgradeLfos(strip)
            }
        }

        // Mark as active BEFORE installing hook so the hook sees the right status
        appState.workletStatus = 'active'

        // Hook: any new strips added later should also be upgraded
        this._autoUpgradeStrips()

        return true
    }

    /**
     * Monkey-patch mixer.addStrip so that any new strip is automatically
     * upgraded to worklet mode. Only active if appState.useWorklets is on.
     */
    _autoUpgradeStrips = () => {
        if (!this.mixer || this.mixer._autoUpgradeHooked) return
        const originalAddStrip = this.mixer.addStrip
        const mixer = this.mixer
        this.mixer.addStrip = (name) => {
            try {
                originalAddStrip(name)
            } catch (e) {
                return null
            }
            const strip = mixer.strips[name]
            if (strip && appState.workletStatus === 'active') {
                WorkletBridge.upgrade(strip).catch(() => {})
                WorkletBridge.upgradeLfos(strip).catch(() => {})
            }
            return strip
        }
        this.mixer._autoUpgradeHooked = true
    }

    start = (pattern) => {
        if (!this.unlocked) this.playSilentBuffer()
        // Auto-upgrade to worklet mode if enabled
        if (appState.useWorklets && appState.workletStatus !== 'active') {
            this.upgradeToWorklets()
        }
        this.isRunning = true
        this.nextStepTime = this.audioCtx.currentTime
        this.mixer.start()
    }

    stop = () => {
        this.isRunning = false
        this.mixer.stop()
        if (serviceRegistry.midiManager) {
            serviceRegistry.midiManager.sendAllNotesOff()
        }
    }

    playNotes = (tick, atTime) => {
        if (this.isRunning) {
            this.player.playNotes(tick, atTime)
            this.sendMidiNotes(tick, atTime)
        }
    }

    sendMidiNotes = (tick, atTime) => {
        const midi = serviceRegistry.midiManager
        if (!midi || !midi.isReady || !midi.selectedOutputId) return

        const selPat = this.patterns[this.getSelectedPatternNum()]
        if (!selPat) return

        const nbTickForPattern = this.TICK * selPat.nbBars
        const loopStep = tick % nbTickForPattern
        // Reuse the flatNotes map already computed by player.playNotes this tick
        const flatNotesMap = this.player.getCurrentFlatNotesMap() ?? this.getFlatNotesForCurrentPattern(this.player.loop)
        
        if (!(flatNotesMap instanceof Map)) return
        const notesToPlay = flatNotesMap.get(loopStep)
        if (!notesToPlay) return

        const perfNow = performance.now()
        const audioNow = this.audioCtx.currentTime
        const midiTime = perfNow + (atTime - audioNow) * 1000

        notesToPlay.forEach(flatNote => {
            if (flatNote.track.mute === false) {
                const midiMapping = InstrumentsManager.DATA.instruments.find(i => i.id === flatNote.track.id)?.midi?.[0]
                if (midiMapping) {
                    const channel = parseInt(midiMapping.ch) || 10
                    const note = parseInt(midiMapping.key) || 60
                    const vel = Math.floor(flatNote.velocity * 127)
                    const startTime = midiTime + (flatNote.swingTime * 1000)
                    
                    midi.sendNoteOn(channel, note, vel, startTime)
                    
                    const durationMs = flatNote.duration || 100
                    midi.sendNoteOff(channel, note, startTime + durationMs)
                }
            }
        })
    }

    simpleBeep = (indexTrack) => {
        this.player.simpleBeep(indexTrack)
        
        // Trigger MIDI for simpleBeep
        const midi = serviceRegistry.midiManager
        if (midi && midi.isReady && midi.selectedOutputId) {
            const pat = this.patterns[this.getSelectedPatternNum()]
            const track = pat?.tracks?.[indexTrack]
            if (track) {
                const midiMapping = InstrumentsManager.DATA.instruments.find(i => i.id === track.id)?.midi?.[0]
                if (midiMapping) {
                    const channel = parseInt(midiMapping.ch) || 10
                    const note = parseInt(midiMapping.key) || 60
                    midi.sendNoteOn(channel, note, 100)
                    setTimeout(() => midi.sendNoteOff(channel, note), 100)
                }
            }
        }
    }

    playSilentBuffer = () => {
        const buffer = this.audioCtx.createBuffer(1, 1, 22050)
        const node = this.audioCtx.createBufferSource()
        node.buffer = buffer
        node.start(0)
        this.unlocked = true
    }

    getAnalyserData = () => {
        if (!this.mixer?.analyser) return null
        return {
            analyser: this.mixer.analyser,
            gFftData: this.mixer.gFftData,
            dataArray: this.mixer.dataArray
        }
    }

    updateStrip = (trackName, params) => {
        const strip = this.mixer?.strips[trackName]
        if (!strip) return
        
        const time = this.audioCtx.currentTime
        
        if (params.filterType !== undefined) strip.updateFilter(params.filterType, params.filterFreq, params.filterQ)
        if (params.reverbType !== undefined || params.reverbAmount !== undefined || params.reverbOn !== undefined) {
            strip.updateReverb(params.reverbType, params.reverbOn === false ? 0 : params.reverbAmount)
        }
        if (params.delayType !== undefined || params.delayTime !== undefined || params.delayAmount !== undefined || params.delayOn !== undefined) {
            strip.updateDelay(params.delayType, params.delayTime, params.delayOn === false ? 0 : params.delayAmount)
        }
        if (params.saturationType !== undefined || params.saturationAmount !== undefined || params.saturationOn !== undefined) {
            strip.updateSaturation(params.saturationType, params.saturationOn === false ? 0 : params.saturationAmount)
        }
        
        if (params.velocity !== undefined) strip.output.gain.setTargetAtTime(params.velocity, time, 0.01)
        if (params.pan !== undefined) strip.pan.pan.setTargetAtTime(params.pan, time, 0.01)

        if (params.mute === true) {
            strip.output.gain.setTargetAtTime(0, time, 0.01)
        } else if (params.mute === false) {
            const velo = params.velocity ?? 1.0
            strip.output.gain.setTargetAtTime(velo, time, 0.01)
        }

        // LFOs
        if (params.pitchLfo !== undefined) strip.updateLfo('pitchLfo', params.pitchLfo)
        if (params.velocityLfo !== undefined) strip.updateLfo('velocityLfo', params.velocityLfo)
        if (params.panLfo !== undefined) strip.updateLfo('panLfo', params.panLfo)
        if (params.filterFreqLfo !== undefined) strip.updateLfo('filterFreqLfo', params.filterFreqLfo)
        if (params.filterQLfo !== undefined) strip.updateLfo('filterQLfo', params.filterQLfo)
    }

    syncTrack = (track) => {
        if (!track) return
        // Invalidate the per-track strip param cache so next playback applies updated settings
        this.mfSound?.invalidateStripCache(track.name)
        this.updateStrip(track.name, track)
    }

    syncAllTracks = (pattern) => {
        if (!pattern || !pattern.tracks) return
        Object.values(pattern.tracks).forEach(track => this.syncTrack(track))
    }

    setBpm = (bpm) => {
        this.mixer.setBpm(bpm)
    }

    updateGeneratedSounds = (generatedSounds) => {
        this.generatedSounds = generatedSounds
        this.player.updateGeneratedSounds(generatedSounds)
    }

    exportOffline = async (pattern, numLoops, OfflineAudioContextClass, MfStripClass, bufferToWavFn) => {
        const bpm = pattern.bpm
        const nbBars = pattern.nbBars
        const totalLoops = Math.max(1, numLoops)
        const secondsPerBeat = 60 / bpm
        const patternDuration = nbBars * secondsPerBeat
        const sampleRate = this.audioCtx.sampleRate
        const samplesPerPattern = Math.round(patternDuration * sampleRate)
        const totalSamples = samplesPerPattern * totalLoops

        const offlineCtx = new OfflineAudioContextClass(2, totalSamples, sampleRate)
        const offlineMixer = this._createOfflineMixer(offlineCtx)

        Object.values(pattern.tracks).forEach(track => {
            offlineMixer.strips[track.name] = new MfStripClass(track.name, offlineCtx)
            offlineMixer.strips[track.name].pan.connect(offlineMixer.compressor)
        })

        const offlineSound = new MfSound(offlineCtx, offlineMixer, this.sounds, this.generatedSounds)
        const truePatternDuration = samplesPerPattern / sampleRate

        for (let loop = 0; loop < totalLoops; loop++) {
            const loopStartTime = loop * truePatternDuration
            this.computeFlatNotes(pattern, loop)

            this.flatNotes.forEach((notesAtTick, tick) => {
                notesAtTick.forEach(flatNote => {
                    const nbTickForPattern = this.TICK * nbBars
                    const noteTime = MfNoteParams.tickToTime(tick, nbTickForPattern, truePatternDuration)
                    const absoluteTime = loopStartTime + noteTime
                    MfNoteParams.applyNoteParams(flatNote, secondsPerBeat)

                    if (flatNote.track.mute === false) {
                        offlineSound.play(flatNote, absoluteTime + flatNote.swingTime)
                    }
                })
            })
        }

        const renderedBuffer = await offlineCtx.startRendering()
        const blob = bufferToWavFn(renderedBuffer)

        return { blob, fileName: `ordrumbox-${pattern.name.replace(/\s+/g, '_')}-${totalLoops}loops.wav` }
    }

    _createOfflineMixer = (offlineCtx) => {
        const offlineMixer = {
            strips: {},
            masterGain: offlineCtx.createGain(),
            compressor: offlineCtx.createDynamicsCompressor(),
            analyser: offlineCtx.createAnalyser(),
            lfo: offlineCtx.createOscillator()
        }
        offlineMixer.lfo.start()
        offlineMixer.compressor.connect(offlineMixer.masterGain)
        offlineMixer.masterGain.connect(offlineCtx.destination)

        if (this.mixer?.compressor) {
            offlineMixer.compressor.threshold.value = this.mixer.compressor.threshold.value
            offlineMixer.compressor.ratio.value = this.mixer.compressor.ratio.value
            offlineMixer.compressor.attack.value = this.mixer.compressor.attack.value
            offlineMixer.compressor.release.value = this.mixer.compressor.release.value
            offlineMixer.masterGain.gain.value = this.mixer.masterGain.gain.value
        }

        return offlineMixer
    }
}
