import MfPlayer from './player.js'
import MfMixer from './mixer.js'
import MfSound from './sound.js'
import MfNoteParams from '../patterns/note_params.js'
import { computeFlatNotesFromPattern as computeFlatNotesPure } from '../patterns/engine.js'

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
        this.mfAudioRec = null
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

    start = (pattern) => {
        if (!this.unlocked) this.playSilentBuffer()
        this.isRunning = true
        this.nextStepTime = this.audioCtx.currentTime
        this.mixer.start()
    }

    stop = () => {
        this.isRunning = false
        this.mixer.stop()
        if (this.mfAudioRec) {
            this.mfAudioRec.finishRecording()
            this.mfAudioRec = null
        }
    }

    playNotes = (tick, atTime) => {
        if (this.isRunning) this.player.playNotes(tick, atTime)
    }

    simpleBeep = (indexTrack) => {
        this.player.simpleBeep(indexTrack)
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
        this.updateStrip(track.name, track)
    }

    syncAllTracks = (pattern) => {
        if (!pattern || !pattern.tracks) return
        Object.values(pattern.tracks).forEach(track => this.syncTrack(track))
    }

    setBpm = (bpm) => {
        this.mixer.setBpm(bpm)
    }

    startRecording = (MfAudioRecClass) => {
        if (this.mfAudioRec == null && this.mixer?.analyser) {
            this.mfAudioRec = new MfAudioRecClass(this.mixer.analyser)
            this.mfAudioRec.startRecording()
        }
        return this.mfAudioRec
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
