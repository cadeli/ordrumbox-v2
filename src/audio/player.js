import Sound from './sound.js'
import FlatNote from '../model/flatnote.js'
import NoteParams from '../patterns/note_params.js'
import { getAutoGenerateService } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { logger, nameOr } from "../core/logger.js"
import Utils from '../core/utils.js'

export default class Player {
    static TAG = "Player"

    constructor(config) {
        this.audioCtx = config.audioCtx
        this.mixer = config.mixer
        this.sounds = config.sounds
        this.generatedSounds = nameOr(config.generatedSounds, {}, 'Player', 'generatedSounds fallback')
        this.patterns = config.patterns
        this.getSelectedPatternNum = config.getSelectedPatternNum ?? (() => config.selectedPatternNum ?? 0)
        this.computeFlatNotes = config.computeFlatNotes
        this.getAutoGenerate = config.getAutoGenerate
        this.getFlatNotes = config.getFlatNotes
        this.TICK = config.TICK
        this.secondsPerBeat = config.secondsPerBeat
        this.sound = new Sound(config.audioCtx, config.mixer, this.sounds, this.generatedSounds)
        this.loop = 0
        this.lastDisplayBeats = 0

        // Cache to avoid recomputing flatNotes every tick when nothing changed
        this._lastFlatNotesMap = null
        this._lastFlatNotesLoop = -1
        this._trackIdxMap = null
        this._trackIdxMapRef = null
    }

    playNotes = async (tick, atTime) => {
        try {
            const selPat = this.patterns[this.getSelectedPatternNum()]
            const nbTickForPattern = this.TICK * (selPat.nbBeats ?? 4)
            const loopStep = tick % nbTickForPattern

            if (loopStep === 0) {
                await this._handleLoopStart(selPat)
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
            const sound = this.sound

            // Cache trackIdxMap (only rebuild when tracks object changes)
            if (this._trackIdxMapRef !== selPat.tracks) {
                const trackKeys = Object.keys(selPat.tracks)
                this._trackIdxMap = new Map(trackKeys.map((k, i) => [selPat.tracks[k], i]))
                this._trackIdxMapRef = selPat.tracks
            }
            const trackIdxMap = this._trackIdxMap

            // Trigger all notes at the same tick concurrently
            const promises = []
            const anySolo = Utils.hasAnySolo(selPat.tracks)
            for (let i = 0; i < notesToPlay.length; i++) {
                const flatNote = notesToPlay[i]
                if (Utils.shouldTrackPlay(flatNote.track, anySolo)) {
                    NoteParams.applyNoteParams(flatNote, secondsPerBeat)
                    promises.push(sound.play(flatNote, atTime + flatNote.swingTime))
                    playbackEvents.emit('noteTrigger', {
                        trackIdx: trackIdxMap.get(flatNote.track) ?? -1,
                        beat: flatNote.note.beat,
                        beatStep: flatNote.note.beatStep
                    })
                }
            }
            await Promise.all(promises)
        } catch (e) {
            logger.error('Player', e)
        }
    }

    _handleLoopStart = async (selPat) => {
        this._lastFlatNotesLoop = -1

        const tracks = selPat.tracks
        const trackKeys = Object.keys(tracks)

        if (selPat.autoGen) {
            const autoGen = await getAutoGenerateService()
            const element = autoGen.structureGen.getElement(this.loop)
            const isSectionStart = element.loopInElement === 0
            const isSectionEnd = element.isLastLoopBeforeChange

            if (isSectionStart || isSectionEnd) {
                const tag = isSectionEnd ? 'break' : 'generate'
                logger.info('Player', `[AutoGen] loop ${this.loop} — section: ${element.name} (${element.loopInElement + 1}/${element.elementLoops}) — ${tag} — genre: ${selPat._autoGenGenre}`)
            }

            const isHarmonicBoundary = isSectionStart || isSectionEnd
            const promises = []
            for (let i = 0; i < trackKeys.length; i++) {
                const track = tracks[trackKeys[i]]
                if (!isHarmonicBoundary) {
                    const type = Utils.detectTrackType(track.name)
                    if (type !== 'BASS' && type !== 'PIANO' && type !== 'ORGAN') continue
                }
                promises.push(autoGen.changeTrack(this.loop, selPat, track))
            }
            await Promise.all(promises)
        } else {
            const promises = []
            for (let i = 0; i < trackKeys.length; i++) {
                const track = tracks[trackKeys[i]]
                if (track.auto === true) {
                    promises.push(
                        (async () => {
                            const autoGen = await this.getAutoGenerate()
                            return autoGen.changeTrack(this.loop, selPat, track)
                        })()
                    )
                }
            }
            await Promise.all(promises)
        }

        this.computeFlatNotes(selPat, this.loop)
    }

    /**
     * Return the current flat notes map (used by engine to avoid double lookup)
     */
    getCurrentFlatNotesMap = () => this._lastFlatNotesMap

    simpleBeep = async (indexTrack, note = null) => {
        if (this.audioCtx == null) return
        const pat = this.patterns[this.getSelectedPatternNum()]
        if (!pat) return
        const tracks = Utils.getTracksArray(pat)
        const track = typeof indexTrack === 'number' ? tracks[indexTrack] : pat.tracks?.[indexTrack]
        if (!track) return

        const previewNote = {
            name: "N_" + (track.name ?? indexTrack) + "_preview",
            soundId: track.soundId,
            beatStep: note?.beatStep ?? 0,
            steppc: 0,
            beat: note?.beat ?? 0,
            velocity: note?.velocity ?? track.velocity ?? 0.8,
            pan: note?.pan ?? track.pan ?? 0,
            pitch: note?.pitch ?? track.pitch ?? 0,
            arp: note?.arp ?? null,
            every: note?.every ?? 1,
            pos: 0,
            prob: 1,
            arpTriggerProbability: 1,
            retriggerNum: note?.retriggerNum ?? 1,
            rate: note?.rate ?? 1,
            euclidianFill: note?.euclidianFill ?? 0
        }
        const flatNote = new FlatNote(0, track, previewNote)
        NoteParams.applyNoteParams(flatNote, this.secondsPerBeat ?? (60 / 120))
        await this.sound.play(flatNote, this.audioCtx.currentTime)
        logger.info('Player', "Play :" + track.name + "=" + (this.sounds[track.soundId]?.url ?? track.synthSoundKey ?? 'synth'))
    }

    updateGeneratedSounds = (generatedSounds) => {
        this.generatedSounds = generatedSounds
        this.sound.generatedSounds = generatedSounds
    }
}
