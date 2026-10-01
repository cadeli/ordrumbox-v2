import Sound from './sound.js'
import FlatNote from '../model/flatnote.js'
import NoteParams from '../patterns/note_params.js'
import { getAutoGenerateService } from '../state/service_loader.js'
import { playbackEvents } from '../state/playback_events.js'
import { logger, nameOr } from '../core/logger.js'
import Utils from '../core/utils.js'
import { EVENTS } from '../core/events.js'

export default class Player {
    static TAG = 'Player'

    #lastFlatNotesMap = null
    #lastFlatNotesLoop = -1
    #trackIdxMap = null
    #trackIdxMapRef = null
    #trackIdxMapCount = -1

    /**
     * Drop every playback-derived cache. Called by AudioEngine.invalidateCache()
     * after state mutations (pattern switch, track add/remove/paste, history
     * undo/redo) so the next tick recomputes from fresh state.
     */
    invalidateCache() {
        this.#lastFlatNotesMap = null
        this.#lastFlatNotesLoop = -1
        this.#trackIdxMap = null
        this.#trackIdxMapRef = null
        this.#trackIdxMapCount = -1
    }

    constructor(config) {
        this.audioCtx = config.audioCtx
        this.mixer = config.mixer
        this.sounds = config.sounds
        this.generatedSounds = nameOr(config.generatedSounds, {}, 'Player', 'generatedSounds fallback')
        this.patterns = config.patterns
        this.getSelectedPatternIdx = config.getSelectedPatternIdx ?? (() => config.selectedPatternIdx ?? 0)
        this.computeFlatNotes = config.computeFlatNotes
        this.getAutoGenerate = config.getAutoGenerate
        this.getFlatNotes = config.getFlatNotes
        this.TICK = config.TICK
        this.secondsPerBeat = config.secondsPerBeat
        this.isOffline = !!config.isOffline
        this.sound = new Sound(config.audioCtx, config.mixer, this.sounds, this.generatedSounds, this.isOffline)
        this.loop = 0
        this.lastDisplayBeats = 0
    }

    #handleLoopStart = async (selectedPattern) => {
        this.#lastFlatNotesLoop = -1

        const tracks = selectedPattern.tracks
        const trackKeys = Object.keys(tracks)

        if (selectedPattern.autoGen) {
            const autoGen = await getAutoGenerateService()
            const element = autoGen.structureGen.getElement(this.loop)
            const isSectionStart = element.loopInElement === 0
            const isSectionEnd = element.isLastLoopBeforeChange

            if (isSectionStart || isSectionEnd) {
                const tag = isSectionEnd ? 'break' : 'generate'
                logger.info(
                    'Player',
                    `[AutoGen] loop ${this.loop} — section: ${element.name} (${element.loopInElement + 1}/${element.elementLoops}) — ${tag} — genre: ${selectedPattern._autoGenGenre}`,
                )
            }

            const isHarmonicBoundary = isSectionStart || isSectionEnd
            const promises = []
            for (let i = 0; i < trackKeys.length; i++) {
                const track = tracks[trackKeys[i]]
                if (!isHarmonicBoundary && !Utils.isMelodicTrack(track)) continue
                promises.push(autoGen.changeTrack(this.loop, selectedPattern, track))
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
                            return autoGen.changeTrack(this.loop, selectedPattern, track)
                        })(),
                    )
                }
            }
            await Promise.all(promises)
        }

        this.computeFlatNotes(selectedPattern, this.loop)
    }

    playNotes = async (tick, atTime) => {
        try {
            const selectedPattern = this.patterns[this.getSelectedPatternIdx()]
            const nbTickForPattern = this.TICK * (selectedPattern.nbBeats ?? 4)
            const loopStep = tick % nbTickForPattern

            if (loopStep === 0) {
                await this.#handleLoopStart(selectedPattern)
                // #handleLoopStart awaits (dynamic import + auto-generate): the
                // user may have switched pattern in the meantime. Playing on
                // with notes resolved against the NEW pattern while trackIdxMap
                // still described the old one emitted another pattern's notes.
                if (this.patterns[this.getSelectedPatternIdx()] !== selectedPattern) return
            }

            // Use cached flatNotes map when loop hasn't changed
            let flatNotesMap
            if (this.#lastFlatNotesLoop === this.loop && this.#lastFlatNotesMap !== null) {
                flatNotesMap = this.#lastFlatNotesMap
            } else {
                flatNotesMap = this.getFlatNotes(this.loop)
                this.#lastFlatNotesLoop = this.loop
                this.#lastFlatNotesMap = flatNotesMap
            }

            if (loopStep === nbTickForPattern - 1) {
                this.loop++
            }

            if (!(flatNotesMap instanceof Map)) return

            const notesToPlay = flatNotesMap.get(loopStep)
            if (!notesToPlay) return

            const secondsPerBeat = this.secondsPerBeat
            const sound = this.sound

            // Cache trackIdxMap: rebuild when the tracks container changes OR
            // when its size changes in place (splice keeps the same array ref,
            // so a ref-only check mapped NOTE_TRIGGER to stale row indices).
            const tracks = selectedPattern.tracks
            const trackCount = Array.isArray(tracks) ? tracks.length : Object.keys(tracks).length
            if (this.#trackIdxMapRef !== tracks || this.#trackIdxMapCount !== trackCount) {
                const trackKeys = Object.keys(tracks)
                this.#trackIdxMap = new Map(trackKeys.map((k, i) => [tracks[k], i]))
                this.#trackIdxMapRef = tracks
                this.#trackIdxMapCount = trackCount
            }
            const trackIdxMap = this.#trackIdxMap

            // Trigger all notes at the same tick concurrently
            const promises = []
            const anySolo = Utils.hasAnySolo(selectedPattern.tracks)
            for (let i = 0; i < notesToPlay.length; i++) {
                const flatNote = notesToPlay[i]
                if (Utils.shouldTrackPlay(flatNote.track, anySolo)) {
                    NoteParams.applyNoteParams(flatNote, secondsPerBeat)
                    promises.push(sound.play(flatNote, atTime + flatNote.swingTime))
                    playbackEvents.emit(EVENTS.NOTE_TRIGGER, {
                        trackIdx: trackIdxMap.get(flatNote.track) ?? -1,
                        beat: flatNote.note.beat,
                        beatStep: flatNote.note.beatStep,
                    })
                }
            }
            await Promise.all(promises)
        } catch (e) {
            logger.error('Player', e)
        }
    }

    /**
     * Return the current flat notes map (used by engine to avoid double lookup)
     */
    getCurrentFlatNotesMap = () => this.#lastFlatNotesMap

    simpleBeep = async (indexTrack, note = null) => {
        if (this.audioCtx == null) return
        const pat = this.patterns[this.getSelectedPatternIdx()]
        if (!pat) return
        const tracks = Utils.getTracksArray(pat)
        const track = typeof indexTrack === 'number' ? tracks[indexTrack] : pat.tracks?.[indexTrack]
        if (!track) return

        const previewNote = {
            name: 'N_' + (track.name ?? indexTrack) + '_preview',
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
            euclideanFill: note?.euclideanFill ?? 0,
            euclideanRotation: note?.euclideanRotation ?? 0,
        }
        const flatNote = new FlatNote(0, track, previewNote)
        NoteParams.applyNoteParams(flatNote, this.secondsPerBeat ?? 60 / 120)
        await this.sound.play(flatNote, this.audioCtx.currentTime)
        logger.info(
            'Player',
            'Play :' + track.name + '=' + (this.sounds[track.soundId]?.url ?? track.synthSoundKey ?? 'synth'),
        )
    }

    updateGeneratedSounds = (generatedSounds) => {
        this.generatedSounds = generatedSounds
        this.sound.generatedSounds = generatedSounds
    }
}
