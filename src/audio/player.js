import MfSound from './sound.js'
import MfFlatNote from '../model/flatnote.js'
import MfNoteParams from '../patterns/note_params.js'
import { getAutoGenerateService } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'

export default class MfPlayer {
    static TAG = "MFPLAYER"

    constructor(config) {
        this.audioCtx = config.audioCtx
        this.mixer = config.mixer
        this.sounds = config.sounds
        this.generatedSounds = config.generatedSounds || {}
        this.patterns = config.patterns
        this.getSelectedPatternNum = config.getSelectedPatternNum ?? (() => config.selectedPatternNum ?? 0)
        this.computeFlatNotes = config.computeFlatNotes
        this.getAutoGenerate = config.getAutoGenerate
        this.getFlatNotes = config.getFlatNotes
        this.TICK = config.TICK
        this.secondsPerBeat = config.secondsPerBeat
        this.mfSound = new MfSound(config.audioCtx, config.mixer, this.sounds, this.generatedSounds)
        this.loop = 0
        this.lastDisplayBars = 0

        // Cache to avoid recomputing flatNotes every tick when nothing changed
        this._lastFlatNotesMap = null
        this._lastFlatNotesLoop = -1
        this._trackIdxMap = null
        this._trackIdxMapRef = null
    }

    playNotes = async (tick, atTime) => {
        try {
            const selPat = this.patterns[this.getSelectedPatternNum()]
            const nbTickForPattern = this.TICK * selPat.nbBars
            const loopStep = tick % nbTickForPattern

            if (loopStep === 0) {
                this._handleLoopStart(selPat)
            }

            // Use cached flatNotes map when loop hasn't changed
            let flatNotesMap
            if (this._lastFlatNotesLoop === this.loop && this._lastFlatNotesMap !== null) {
                flatNotesMap = this._lastFlatNotesMap
            } else {
                flatNotesMap = this.getFlatNotes(this.loop)
                this._lastFlatNotesLoop = this.loop
                this._lastFlatNotesMap = flatNotesMap
            }

            if (loopStep === nbTickForPattern - 1) {
                this.loop++
            }

            if (!(flatNotesMap instanceof Map)) return

            const notesToPlay = flatNotesMap.get(loopStep)
            if (!notesToPlay) return

            const secondsPerBeat = this.secondsPerBeat
            const mfSound = this.mfSound

            // Cache trackIdxMap (only rebuild when tracks object changes)
            if (this._trackIdxMapRef !== selPat.tracks) {
                const trackKeys = Object.keys(selPat.tracks)
                this._trackIdxMap = new Map(trackKeys.map((k, i) => [selPat.tracks[k], i]))
                this._trackIdxMapRef = selPat.tracks
            }
            const trackIdxMap = this._trackIdxMap

            // Trigger all notes at the same tick concurrently
            const promises = []
            for (let i = 0; i < notesToPlay.length; i++) {
                const flatNote = notesToPlay[i]
                if (flatNote.track.mute === false) {
                    MfNoteParams.applyNoteParams(flatNote, secondsPerBeat)
                    promises.push(mfSound.play(flatNote, atTime + flatNote.swingTime))
                    playbackEvents.dispatchNoteTrigger({
                        trackIdx: trackIdxMap.get(flatNote.track) ?? -1,
                        bar: flatNote.note.bar,
                        barStep: flatNote.note.barStep
                    })
                }
            }
            await Promise.all(promises)
        } catch (e) {
            console.error(e)
        }
    }

    _handleLoopStart = async (selPat) => {
        this.computeFlatNotes(selPat, this.loop)
        this._lastFlatNotesLoop = -1

        const tracks = selPat.tracks
        const trackKeys = Object.keys(tracks)

        if (selPat.autoGen) {
            const mfAutoGenerate = await getAutoGenerateService()
            const element = mfAutoGenerate.structureGen.getElement(this.loop)
            const isSectionStart = element.loopInElement === 0
            const isSectionEnd = element.isLastLoopBeforeChange

            if (isSectionStart || isSectionEnd) {
                const tag = isSectionEnd ? 'break' : 'generate'
                console.log(`[AutoGen] loop ${this.loop} — section: ${element.name} (${element.loopInElement + 1}/${element.elementLoops}) — ${tag} — genre: ${selPat._autoGenGenre}`)

                for (let i = 0; i < trackKeys.length; i++) {
                    const track = tracks[trackKeys[i]]
                    mfAutoGenerate.changeTrack(this.loop, selPat, track)
                        .catch((error) => console.error(error))
                }
            }
        } else {
            for (let i = 0; i < trackKeys.length; i++) {
                const track = tracks[trackKeys[i]]
                if (track.auto === true) {
                    this.getAutoGenerate()
                        .then((mfAutoGenerate) => mfAutoGenerate.changeTrack(this.loop, selPat, track))
                        .catch((error) => console.error(error))
                }
            }
        }
    }

    /**
     * Return the current flat notes map (used by engine to avoid double lookup)
     */
    getCurrentFlatNotesMap = () => this._lastFlatNotesMap

    simpleBeep = async (indexTrack) => {
        if (this.audioCtx == null) return
        const pat = this.patterns[this.getSelectedPatternNum()]
        const track = pat.tracks[indexTrack]
        if (!track) return

        const note = {
            name: "N_" + indexTrack + "_0_0",
            soundId: track.soundId,
            barStep: 0,
            steppc: 0,
            bar: 0,
            velocity: 0.8,
            pan: 0,
            pitch: 0,
            arp: null,
            triggerFreq: 1,
            triggerPhase: 0,
            triggerProbability: 1,
            arpTriggerProbability: 1,
            retriggerNum: 1,
            retriggerStep: 1,
            euclidianFill: 0
        }
        const flatNote = new MfFlatNote(0, track, note)

        // Worklet mixer is always initialised by the engine before play;
        // legacy `mixer.compressor` check removed.
        await this.mfSound.playSample(flatNote, this.audioCtx.currentTime)
        console.log("Play :" + track.name + "=" + this.sounds[track.soundId].url)
    }

    updateGeneratedSounds = (generatedSounds) => {
        this.generatedSounds = generatedSounds
        this.mfSound.generatedSounds = generatedSounds
    }
}
