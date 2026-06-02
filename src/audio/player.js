import MfSound from './sound.js'
import MfFlatNote from '../model/flatnote.js'
import MfNoteParams from '../patterns/note_params.js'

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
    }

    playNotes = (tick, atTime) => {
        try {
            const selPat = this.patterns[this.getSelectedPatternNum()]
            const nbTickForPattern = this.TICK * selPat.nbBars
            const loopStep = tick % nbTickForPattern

            if (loopStep === 0) {
                this.computeFlatNotes(selPat, this.loop)
                // Invalidate local cache on new loop
                this._lastFlatNotesLoop = -1

                const tracks = selPat.tracks
                const trackKeys = Object.keys(tracks)
                for (let i = 0; i < trackKeys.length; i++) {
                    const track = tracks[trackKeys[i]]
                    if (track.auto === true) {
                        // Fire-and-forget: catch errors without blocking scheduler
                        this.getAutoGenerate()
                            .then((mfAutoGenerate) => mfAutoGenerate.changeTrack(this.loop, selPat, track))
                            .catch((error) => console.error(error))
                    }
                }
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

            for (let i = 0; i < notesToPlay.length; i++) {
                const flatNote = notesToPlay[i]
                if (flatNote.track.mute === false) {
                    MfNoteParams.applyNoteParams(flatNote, secondsPerBeat)
                    mfSound.play(flatNote, atTime + flatNote.swingTime)
                }
            }
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * Return the current flat notes map (used by engine to avoid double lookup)
     */
    getCurrentFlatNotesMap = () => this._lastFlatNotesMap

    simpleBeep = (indexTrack) => {
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

        if (!this.mixer.compressor) {
            this.mixer.start()
        }
        this.mfSound.playSample(flatNote, this.audioCtx.currentTime)
        console.log("Play :" + track.name + "=" + this.sounds[track.soundId].url)
    }

    updateGeneratedSounds = (generatedSounds) => {
        this.generatedSounds = generatedSounds
        this.mfSound.generatedSounds = generatedSounds
    }
}
