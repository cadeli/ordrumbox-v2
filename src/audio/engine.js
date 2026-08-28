import Player from './player.js'
import Mixer from './mixer.js'
import Sound from './sound.js'
import NoteParams from '../patterns/note_params.js'
import { computeFlatNotesFromPattern as computeFlatNotesPure } from '../patterns/engine.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { _setAudioUnlocked } from '../state/signals.js'
import { instrumentsManager } from '../logic/services/instruments_manager.js'
import Utils from '../core/utils.js'
import { applyParamsToStrip } from './strip_sync.js'
import { computeTrackLfoValues } from '../logic/lfo_engine.js'
import { logger, nameOr } from "../core/logger.js"

export default class AudioEngine {
    static TAG = "AUDIOENGINE"

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

        this.flatNotes = new Map()
        this._cachedPatternRef = null
        this._cachedLoop = 0
        this._midiMappingCache = new Map()
        this.mixer = new Mixer(this.audioCtx)
        this.player = null
        this.sound = null

        // Worklet initialisation happens asynchronously. The player/sound are
        // constructed AFTER the worklet mixer is ready so they hold the correct
        // (worklet-based) mixer reference — not the legacy placeholder above.
        this._workletReady = (async () => {
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
                })
                this.sound = this.player.sound

                playbackEvents.emit("workletStatusChange", 'active')
            } catch (err) {
                logger.warn('AudioEngine: worklet init failed, audio unavailable', err)
                playbackEvents.emit("workletStatusChange", 'unavailable')
            }
        })()

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

        const patternVersion = pattern._version ?? 0
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
        if (this.player) {
            this.player._lastFlatNotesLoop = -1
        }
    }

    // ─── Playback ───────────────────────────────────────────────────────────────

    start = async (pattern) => {
        try {
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
        } catch (err) {
            logger.warn('AudioEngine', 'start failed', err)
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
        await this._pushStepLfo(tick, atTime)
        await this.player.playNotes(tick, atTime)
        this.sendMidiNotes(tick, atTime)
    }

    _pushStepLfo = async (tick, atTime) => {
        const pattern = this.patterns[this.getSelectedPatternNum()]
        if (!pattern?.tracks) return
        const nbTicks = this.TICK * pattern.nbBeats
        const bpm = pattern.bpm
        const tracks = pattern.tracks
        const t = 0.005

        for (const track of Object.values(tracks)) {
            const hasLfo = track.velocityLfo != null || track.panLfo != null || track.pitchLfo != null || track.filterFreqLfo != null || track.filterQLfo != null
            if (!hasLfo) continue

            let strip = this.mixer.strips[track.name]
            if (!strip?.stripNode) {
                strip = await this.mixer.getOrCreateStrip(track.name)
                if (!strip?.stripNode) continue
            }

            const lfoValues = computeTrackLfoValues(track, tick, nbTicks, bpm)

            if (track.velocityLfo) {
                const finalVelo = Math.max(0, Math.min(2, lfoValues.velocity))
                strip.output.gain.setTargetAtTime(finalVelo, atTime, t)
            }

            if (track.panLfo) {
                const basePan = track.pan ?? 0
                const finalPan = Math.max(-1, Math.min(1, basePan + lfoValues.pan))
                strip.pan.pan.setTargetAtTime(finalPan, atTime, t)
            }

            if (track.filterFreqLfo) {
                const baseFreq = track.filterFreq ?? 20
                const finalFreq = Math.max(20, Math.min(20000, baseFreq + lfoValues.filterFreq))
                strip.stripNode.parameters.get('cutoff')?.setTargetAtTime(finalFreq, atTime, t)
            }

            if (track.filterQLfo) {
                const baseQ = track.filterQ ?? 0.707
                const finalQ = Math.max(0.707, Math.min(18.707, baseQ + lfoValues.filterQ))
                strip.stripNode.parameters.get('q')?.setTargetAtTime(finalQ, atTime, t)
            }
        }
    }

    sendMidiNotes = (tick, atTime) => {
        const midi = serviceRegistry.midiManager
        if (!midi || !midi.isReady || !midi.selectedOutputId) return

        const selPat = this.patterns[this.getSelectedPatternNum()]
        if (!selPat) return

        const nbTickForPattern = this.TICK * selPat.nbBeats
        const loopStep = tick % nbTickForPattern
        const flatNotesMap = this.player.getCurrentFlatNotesMap() ?? this.getFlatNotesForCurrentPattern(this.player.loop)

        if (!(flatNotesMap instanceof Map)) return
        const notesToPlay = flatNotesMap.get(loopStep)
        if (!notesToPlay) return

        const perfNow  = performance.now()
        const audioNow = this.audioCtx.currentTime
        const midiTime = perfNow + (atTime - audioNow) * 1000

        const anySolo = Utils.hasAnySolo(selPat.tracks)
        notesToPlay.forEach(flatNote => {
            if (Utils.shouldTrackPlay(flatNote.track, anySolo)) {
                const mapping = this._resolveMidiMapping(flatNote.track.id)
                if (mapping) {
                    const channel   = Number.isFinite(parseInt(mapping.ch, 10)) ? parseInt(mapping.ch, 10) : (logger.warn('Fallback','pi',mapping.ch,9), 9)
                    const note      = Number.isFinite(parseInt(mapping.key, 10)) ? parseInt(mapping.key, 10) : (logger.warn('Fallback','pi',mapping.key,60), 60)
                    const vel       = Math.floor(flatNote.velocity * 127)
                    const startTime = midiTime + (flatNote.swingTime * 1000)

                    midi.sendNoteOn(channel, note, vel, startTime)
                    const durationMs = nameOr(flatNote.duration, 100, 'AudioEngine', 'duration fallback')
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

    simpleBeep = async (indexTrack, note = null) => {
        // Wait for the worklet mixer and player to be ready before triggering.
        await this._workletReady
        if (!this.player) return
        if (this.audioCtx?.state === 'suspended') {
            await this.audioCtx.resume()
        }

        await this.player.simpleBeep(indexTrack, note)

        const midi = serviceRegistry.midiManager
        if (midi && midi.isReady && midi.selectedOutputId) {
            const pat   = this.patterns[this.getSelectedPatternNum()]
            const tracks = Utils.getTracksArray(pat)
            const track = typeof indexTrack === 'number' ? tracks[indexTrack] : pat?.tracks?.[indexTrack]
            if (track) {
                const mapping = this._resolveMidiMapping(track.id)
                if (mapping) {
                    const rawCh = parseInt(mapping.ch, 10)
                    const rawNote = parseInt(mapping.key, 10)
                    const channel = Number.isFinite(rawCh) ? rawCh : 9
                    const noteNum = Number.isFinite(rawNote) ? rawNote : 60
                    if (!Number.isFinite(rawCh) || !Number.isFinite(rawNote)) {
                        logger.warn('Engine', 'MIDI mapping NaN fallback', { ch: mapping.ch, key: mapping.key })
                    }
                    const vel = Math.floor((note?.velocity ?? track.velocity ?? 0.8) * 127)
                    midi.sendNoteOn(channel, noteNum, vel)
                    setTimeout(() => midi.sendNoteOff(channel, noteNum), 100)
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
        _setAudioUnlocked(true)
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

    exportOffline = async (pattern, numLoops, OfflineAudioContextClass, _unusedStripClass, bufferToWavFn) => {
        try {
            const bpm              = pattern.bpm
            const nbBeats           = pattern.nbBeats
            const totalLoops       = Math.max(1, numLoops)
            const secondsPerBeat   = 60 / bpm
            const patternDuration  = nbBeats * secondsPerBeat
            const sampleRate       = this.audioCtx.sampleRate
            const samplesPerPattern = Math.round(patternDuration * sampleRate)
            const totalSamples     = samplesPerPattern * totalLoops

            const offlineCtx    = new OfflineAudioContextClass(2, totalSamples, sampleRate)

            // Build a full worklet-based mixer for the offline context. AudioWorklet
            // is supported in OfflineAudioContext, so the same code path works.
            const offlineMixer  = await Mixer.create(offlineCtx)
            const offlineSound  = new Sound(offlineCtx, offlineMixer, this.sounds, this.generatedSounds)

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

            const anySolo = Utils.hasAnySolo(pattern.tracks)
            for (let loop = 0; loop < totalLoops; loop++) {
                const loopStartTime = loop * truePatternDuration
                this.computeFlatNotes(pattern, loop)

                for (const [tick, notesAtTick] of this.flatNotes.entries()) {
                    for (const flatNote of notesAtTick) {
                        const nbTickForPattern = this.TICK * nbBeats
                        const noteTime         = NoteParams.tickToTime(tick, nbTickForPattern, truePatternDuration)
                        const absoluteTime     = loopStartTime + noteTime
                        NoteParams.applyNoteParams(flatNote, secondsPerBeat)

                        if (Utils.shouldTrackPlay(flatNote.track, anySolo)) {
                            await offlineSound.play(flatNote, absoluteTime + flatNote.swingTime)
                        }
                    }
                }
            }

            const renderedBuffer = await offlineCtx.startRendering()
            const blob           = bufferToWavFn(renderedBuffer)
            return { blob, fileName: `ordrumbox-${pattern.name.replace(/\s+/g, '_')}-${totalLoops}loops.wav` }
        } catch (err) {
            logger.warn('AudioEngine', 'exportOffline failed', err)
            return { blob: null, fileName: '' }
        }
    }
}
