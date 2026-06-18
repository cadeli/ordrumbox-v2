import MfPlayer from './player.js'
import MfMixer from './mixer.js'
import MfSound from './sound.js'
import MfNoteParams from '../patterns/note_params.js'
import { computeFlatNotesFromPattern as computeFlatNotesPure } from '../patterns/engine.js'
import { serviceRegistry } from '../state/service_registry.js'
import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import InstrumentsManager from '../logic/services/instruments_manager.js'
import Utils from '../core/utils.js'
import { applyParamsToStrip } from './strip_sync.js'
import { computeTrackLfoValues } from '../logic/lfo_engine.js'
import { logger } from "../core/logger.js"

export default class AudioEngine {
    static TAG = "AUDIOENGINE"

    constructor(config) {
        this.audioCtx = config.audioCtx
        this.sounds = config.sounds
        this.generatedSounds = config.generatedSounds ?? (logger.warn('AE', 'generatedSounds fallback'), {})
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
        this._midiMappingCache = new Map()
        this.mixer = new MfMixer(this.audioCtx)
        this.player = null
        this.mfSound = null

        // Worklet initialisation happens asynchronously. The player/sound are
        // constructed AFTER the worklet mixer is ready so they hold the correct
        // (worklet-based) mixer reference — not the legacy placeholder above.
        this._workletReady = MfMixer.create(this.audioCtx).then(mixer => {
            this.mixer = mixer

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

            appState.workletStatus = 'active'
            playbackEvents.dispatchWorkletStatusChange('active')
        }).catch(err => {
            logger.warn('AudioEngine: worklet init failed, audio unavailable', err)
            appState.workletStatus = 'unavailable'
            playbackEvents.dispatchWorkletStatusChange('unavailable')
        })

        this.isRunning = false
        this.unlocked = false
        this.nextStepTime = 0

        // Pre-allocate silent buffer for unlock (reused across calls)
        this._silentBuffer = this.audioCtx.createBuffer(1, 1, 22050)
    }

    /**
     * Resolves when the worklet mixer is ready to accept strips and play audio.
     */
    get ready() {
        return this._workletReady
    }

    // ─── Pattern / flat-note helpers ────────────────────────────────────────────

    computeFlatNotes = (pattern, loop) => {
        this.flatNotes = computeFlatNotesPure(pattern, loop, this.computeNextStep, this.TICK)
        return this.flatNotes
    }

    getFlatNotesForCurrentPattern = (loop = 0) => {
        const pattern = this.patterns[this.getSelectedPatternNum()]
        if (!pattern) return this.flatNotes

        const patternVersion = pattern._version ?? (logger.warn('AE', '_version fallback'), 0)
        if (
            this._cachedPatternRef === pattern &&
            this._cachedLoop === loop &&
            this._cachedVersion === patternVersion
        ) {
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

    // ─── Playback ───────────────────────────────────────────────────────────────

    start = async (pattern) => {
        if (!this.unlocked) this.playSilentBuffer()
        // Wait for worklet mixer to be ready before starting
        await this._workletReady
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
    }

    stop = () => {
        this.isRunning = false
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
        this._pushStepLfo(tick, atTime)
        await this.player.playNotes(tick, atTime)
        this.sendMidiNotes(tick, atTime)
    }

    _pushStepLfo = (tick, atTime) => {
        const pattern = this.patterns[this.getSelectedPatternNum()]
        if (!pattern?.tracks) return
        const nbTicks = this.TICK * pattern.nbBars
        const bpm = appState.bpm
        const tracks = pattern.tracks
        const t = 0.005

        for (const track of Object.values(tracks)) {
            const hasLfo = track.velocityLfo || track.panLfo || track.pitchLfo || track.filterFreqLfo || track.filterQLfo
            if (!hasLfo) continue

            const strip = this.mixer.strips[track.name]
            if (!strip?.stripNode) continue

            const lfoValues = computeTrackLfoValues(track, tick, nbTicks, bpm)

            if (track.velocityLfo) {
                const baseVelo = track.velocity ?? 1
                const finalVelo = Math.max(0, Math.min(2, baseVelo + lfoValues.velocity))
                strip.output.gain.setTargetAtTime(finalVelo, atTime, t)
            }

            if (track.panLfo) {
                const basePan = track.pan ?? 0
                const finalPan = Math.max(-1, Math.min(1, basePan + lfoValues.pan))
                strip.pan.pan.setTargetAtTime(finalPan, atTime, t)
            }

            if (track.filterFreqLfo) {
                const baseFreq = track.filterFreq ?? 1
                const normBaseFreq = baseFreq > 1 ? Utils.hzToNormalizedTrackFilterFreq(baseFreq) : Math.max(0, Math.min(1, baseFreq))
                const finalFreq = Math.max(0, Math.min(1, normBaseFreq + lfoValues.filterFreq))
                strip.stripNode.parameters.get('cutoff')?.setTargetAtTime(finalFreq, atTime, t)
            }

            if (track.filterQLfo) {
                const baseQ = track.filterQ ?? 0
                const normBaseQ = baseQ > 1 ? Utils.valueToNormalizedTrackFilterQ(baseQ) : Math.max(0, Math.min(1, baseQ))
                const finalQ = Math.max(0, Math.min(1, normBaseQ + lfoValues.filterQ))
                strip.stripNode.parameters.get('q')?.setTargetAtTime(finalQ, atTime, t)
            }
        }
    }

    sendMidiNotes = (tick, atTime) => {
        const midi = serviceRegistry.midiManager
        if (!midi || !midi.isReady || !midi.selectedOutputId) return

        const selPat = this.patterns[this.getSelectedPatternNum()]
        if (!selPat) return

        const nbTickForPattern = this.TICK * selPat.nbBars
        const loopStep = tick % nbTickForPattern
        const flatNotesMap = this.player.getCurrentFlatNotesMap() ?? this.getFlatNotesForCurrentPattern(this.player.loop)

        if (!(flatNotesMap instanceof Map)) return
        const notesToPlay = flatNotesMap.get(loopStep)
        if (!notesToPlay) return

        const perfNow  = performance.now()
        const audioNow = this.audioCtx.currentTime
        const midiTime = perfNow + (atTime - audioNow) * 1000

        notesToPlay.forEach(flatNote => {
            if (flatNote.track.mute === false) {
                const mapping = this._resolveMidiMapping(flatNote.track.id)
                if (mapping) {
                    const channel   = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','pi',mapping.ch,10),10))(parseInt(mapping.ch)))
                    const note      = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','pi',mapping.key,60),60))(parseInt(mapping.key)))
                    const vel       = Math.floor(flatNote.velocity * 127)
                    const startTime = midiTime + (flatNote.swingTime * 1000)

                    midi.sendNoteOn(channel, note, vel, startTime)
                    const durationMs = flatNote.duration ?? (logger.warn('AE', 'duration fallback'), 100)
                    midi.sendNoteOff(channel, note, startTime + durationMs)
                }
            }
        })
    }

    _resolveMidiMapping = (trackId) => {
        if (this._midiMappingCache.has(trackId)) {
            return this._midiMappingCache.get(trackId)
        }
        const mapping = InstrumentsManager.DATA.instruments.find(i => i.id === trackId)?.midi?.[0] ?? null
        this._midiMappingCache.set(trackId, mapping)
        return mapping
    }

    simpleBeep = async (indexTrack) => {
        // Wait for the worklet mixer and player to be ready before triggering.
        await this._workletReady
        if (!this.player) return
        if (this.audioCtx?.state === 'suspended') {
            await this.audioCtx.resume()
        }

        await this.player.simpleBeep(indexTrack)

        const midi = serviceRegistry.midiManager
        if (midi && midi.isReady && midi.selectedOutputId) {
            const pat   = this.patterns[this.getSelectedPatternNum()]
            const track = pat?.tracks?.[indexTrack]
            if (track) {
                const mapping = this._resolveMidiMapping(track.id)
                if (mapping) {
                    const channel = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','pi',mapping.ch,10),10))(parseInt(mapping.ch)))
                    const note    = ((_v=>!Number.isNaN(_v)?_v:(logger.warn('FB','pi',mapping.key,60),60))(parseInt(mapping.key)))
                    midi.sendNoteOn(channel, note, 100)
                    setTimeout(() => midi.sendNoteOff(channel, note), 100)
                }
            }
        }
    }

    playSilentBuffer = () => {
        const node = this.audioCtx.createBufferSource()
        node.buffer = this._silentBuffer
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
        this.mfSound?.invalidateStripCache(track.name)
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

    exportOffline = async (pattern, numLoops, OfflineAudioContextClass, _unusedMfStripClass, bufferToWavFn) => {
        const bpm              = pattern.bpm
        const nbBars           = pattern.nbBars
        const totalLoops       = Math.max(1, numLoops)
        const secondsPerBeat   = 60 / bpm
        const patternDuration  = nbBars * secondsPerBeat
        const sampleRate       = this.audioCtx.sampleRate
        const samplesPerPattern = Math.round(patternDuration * sampleRate)
        const totalSamples     = samplesPerPattern * totalLoops

        const offlineCtx    = new OfflineAudioContextClass(2, totalSamples, sampleRate)

        // Build a full worklet-based mixer for the offline context. AudioWorklet
        // is supported in OfflineAudioContext, so the same code path works.
        const offlineMixer  = await MfMixer.create(offlineCtx)
        const offlineSound  = new MfSound(offlineCtx, offlineMixer, this.sounds, this.generatedSounds)

        for (const track of Object.values(pattern.tracks)) {
            const strip = await offlineMixer.getOrCreateStrip(track.name)
            if (strip) {
                await offlineSound.updateStripFromTrack(strip, track, 0)
            }
        }

        // Initialize and ramp transport clock for offline render
        if (offlineMixer.transportClock) {
            offlineMixer.transportClock.offset.setValueAtTime(0, 0)
            offlineMixer.transportClock.offset.linearRampToValueAtTime(patternDuration * totalLoops, patternDuration * totalLoops)
            offlineMixer.transportClock.start(0)
        }

        const truePatternDuration = samplesPerPattern / sampleRate

        for (let loop = 0; loop < totalLoops; loop++) {
            const loopStartTime = loop * truePatternDuration
            this.computeFlatNotes(pattern, loop)

            for (const [tick, notesAtTick] of this.flatNotes.entries()) {
                for (const flatNote of notesAtTick) {
                    const nbTickForPattern = this.TICK * nbBars
                    const noteTime         = MfNoteParams.tickToTime(tick, nbTickForPattern, truePatternDuration)
                    const absoluteTime     = loopStartTime + noteTime
                    MfNoteParams.applyNoteParams(flatNote, secondsPerBeat)

                    if (flatNote.track.mute === false) {
                        await offlineSound.play(flatNote, absoluteTime + flatNote.swingTime)
                    }
                }
            }
        }

        const renderedBuffer = await offlineCtx.startRendering()
        const blob           = bufferToWavFn(renderedBuffer)
        return { blob, fileName: `ordrumbox-${pattern.name.replace(/\s+/g, '_')}-${totalLoops}loops.wav` }
    }
}
