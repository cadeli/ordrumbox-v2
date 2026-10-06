import Sound from './sound.js'
import { resolveSelectedPatternIdxGetter } from './selected_pattern_idx.js'
import FlatNote from '../model/flat_note.js'
import NoteParams from '../patterns/note_params.js'
import { getAutoGeneratorService } from '../state/service_loader.js'
import { playbackEvents } from '../state/event_bus.js'
import { logger, valueOrFallback } from '../core/logger.js'
import { isMelodicTrack } from '../core/drum_taxonomy.js'
import { getTracksArray, hasAnySolo, shouldTrackPlay } from '../core/tracks.js'
import { EVENTS } from '../core/events.js'
import { BEATS_PER_MEASURE } from '../model/song_schema.js'
import { PLAYBACK_MODE, resolveSongSources, songTempo, tickToSongMeasures } from '../logic/song_playback.js'

export default class Player {
    static TAG = 'Player'

    #lastFlatNotesMap = null
    #lastFlatNotesLoop = -1
    /** Pattern the cached map was computed from — see getCurrentFlatNotesMap. */
    #lastFlatNotesPattern = null
    #trackIdxMap = null
    #trackIdxMapRef = null
    #trackIdxMapCount = -1
    #patternsById = null
    #songMeasure = 0

    /**
     * Drop every playback-derived cache. Called by Engine.invalidateCache()
     * after state mutations (pattern switch, track add/remove/paste, history
     * undo/redo) so the next tick recomputes from fresh state.
     */
    invalidateCache() {
        this.#lastFlatNotesMap = null
        this.#lastFlatNotesLoop = -1
        this.#lastFlatNotesPattern = null
        this.#trackIdxMap = null
        this.#trackIdxMapRef = null
        this.#trackIdxMapCount = -1
        this.#patternsById = null
    }

    constructor(config) {
        this.audioCtx = config.audioCtx
        this.mixer = config.mixer
        this.sounds = config.sounds
        this.generatedSounds = valueOrFallback(config.generatedSounds, {}, 'Player', 'generatedSounds fallback')
        this.patterns = config.patterns
        this.getSelectedPatternIdx = resolveSelectedPatternIdxGetter(config)
        this.computeFlatNotes = config.computeFlatNotes
        this.getAutoGenerator = config.getAutoGenerator
        this.getFlatNotes = config.getFlatNotes
        this.getFlatNotesForPattern = config.getFlatNotesForPattern ?? null
        this.getPlaybackMode = config.getPlaybackMode ?? (() => PLAYBACK_MODE.PATTERN)
        this.getSong = config.getSong ?? (() => null)
        this.TICK = config.TICK
        this.secondsPerTick = config.secondsPerTick
        this.isOffline = !!config.isOffline
        this.sound = new Sound(config.audioCtx, config.mixer, this.sounds, this.generatedSounds, this.isOffline)
        this.loop = 0
        this.lastDisplayBeats = 0
    }

    #handleLoopStart = async (selectedPattern, loop = this.loop) => {
        this.#lastFlatNotesLoop = -1

        const tracks = selectedPattern.tracks
        const trackKeys = Object.keys(tracks)

        if (selectedPattern.autoGen) {
            const autoGen = await getAutoGeneratorService()
            const element = autoGen.structureGen.getElement(loop)
            const isSectionStart = element.loopInElement === 0
            const isSectionEnd = element.isLastLoopBeforeChange

            if (isSectionStart || isSectionEnd) {
                const tag = isSectionEnd ? 'break' : 'generate'
                logger.info(
                    'Player',
                    `[AutoGen] loop ${loop} — section: ${element.name} (${element.loopInElement + 1}/${element.elementLoops}) — ${tag} — genre: ${selectedPattern._autoGenGenre}`,
                )
            }

            const isHarmonicBoundary = isSectionStart || isSectionEnd
            const promises = []
            for (let i = 0; i < trackKeys.length; i++) {
                const track = tracks[trackKeys[i]]
                if (!isHarmonicBoundary && !isMelodicTrack(track)) continue
                promises.push(autoGen.changeTrack(loop, selectedPattern, track))
            }
            await Promise.all(promises)
        } else {
            const promises = []
            for (let i = 0; i < trackKeys.length; i++) {
                const track = tracks[trackKeys[i]]
                if (track.auto === true) {
                    promises.push(
                        (async () => {
                            const autoGen = await this.getAutoGenerator()
                            return autoGen.changeTrack(loop, selectedPattern, track)
                        })(),
                    )
                }
            }
            await Promise.all(promises)
        }

        this.computeFlatNotes(selectedPattern, loop)
    }

    /** The pattern library indexed by stable id, for clip resolution. */
    get patternsById() {
        if (this.#patternsById === null) {
            this.#patternsById = new Map()
            for (const pattern of this.patterns ?? []) {
                if (pattern?.id) this.#patternsById.set(pattern.id, pattern)
            }
        }
        return this.#patternsById
    }

    /**
     * Song mode only when the arrangement view is the visible one AND a song is
     * actually selected — the engine owns that decision (see getPlaybackMode).
     */
    get isSongMode() {
        return this.getPlaybackMode() === PLAYBACK_MODE.SONG && this.getSong() != null
    }

    /** Where the transport sits in the arrangement, in measures (fractional). */
    get currentSongMeasure() {
        return this.#songMeasure
    }

    /** The song's own tempo, or null outside song mode. */
    getSongTempo = () => (this.isSongMode ? songTempo(this.getSong(), this.patternsById) : null)

    #songMeasureOf = (tick) => {
        const tickPerMeasure = this.TICK * BEATS_PER_MEASURE
        // Measured from the clip under the playhead, so it stays unwrapped and
        // the UI does not jump back to 0 when the arrangement loops.
        const source = resolveSongSources(this.getSong(), this.patternsById, tick, this.TICK)[0]
        if (!source) return tickToSongMeasures(tick, tickPerMeasure)
        return source.clip.startMeasure + (tick - source.clip.startMeasure * tickPerMeasure) / tickPerMeasure
    }

    playNotes = async (tick, atTime) => {
        try {
            if (this.isSongMode) return await this.#playSongNotes(tick, atTime)

            const selectedPattern = this.patterns[this.getSelectedPatternIdx()]
            const tickCountForPattern = this.TICK * (selectedPattern.beatCount ?? 4)
            const loopStep = tick % tickCountForPattern

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
                this.#lastFlatNotesPattern = selectedPattern
            }

            if (loopStep === tickCountForPattern - 1) {
                this.loop++
            }

            if (!(flatNotesMap instanceof Map)) return

            const notesToPlay = flatNotesMap.get(loopStep)
            if (!notesToPlay) return

            const secondsPerTick = this.secondsPerTick
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
            const anySolo = hasAnySolo(selectedPattern.tracks)
            for (let i = 0; i < notesToPlay.length; i++) {
                const flatNote = notesToPlay[i]
                if (shouldTrackPlay(flatNote.track, anySolo)) {
                    NoteParams.applyNoteParams(flatNote, secondsPerTick)
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
     * Sound every clip covering the current measure, at the same time.
     *
     * A gap is silent but still publishes the position, so the UI playhead
     * keeps moving across empty measures of the arrangement.
     */
    #playSongNotes = async (tick, atTime) => {
        const song = this.getSong()
        const sources = resolveSongSources(song, this.patternsById, tick, this.TICK)
        this.#songMeasure = this.#songMeasureOf(tick)
        if (sources.length === 0) return

        const secondsPerTick = this.secondsPerTick
        const sound = this.sound
        const visiblePattern = this.patterns[this.getSelectedPatternIdx()]
        const promises = []

        for (const source of sources) {
            const { pattern, localStep, loop, patternTicks } = source

            // autoGen / per-track `auto` regenerate content at a cycle boundary.
            // Keyed on the source's own loop, not the transport's.
            if (localStep === 0) {
                await this.#handleLoopStart(pattern, loop)
            }

            if (!this.getFlatNotesForPattern) continue
            const flatNotesMap = this.getFlatNotesForPattern(pattern, loop)
            if (!(flatNotesMap instanceof Map)) continue

            const notesToPlay = flatNotesMap.get(localStep)
            if (!notesToPlay) continue

            // a SongSource only types its pattern as {object}
            const tracks = /** @type {{tracks: object}} */ (pattern).tracks
            const trackIdxMap = this.#trackIndexMap(tracks)
            const anySolo = hasAnySolo(tracks)
            // Only the pattern the user is looking at drives the grid playhead;
            // the others are heard but must not repaint another pattern's cells.
            const isVisible = pattern === visiblePattern

            for (let i = 0; i < notesToPlay.length; i++) {
                const flatNote = notesToPlay[i]
                if (!shouldTrackPlay(flatNote.track, anySolo)) continue
                NoteParams.applyNoteParams(flatNote, secondsPerTick)
                promises.push(sound.play(flatNote, atTime + flatNote.swingTime))
                if (isVisible) {
                    playbackEvents.emit(EVENTS.NOTE_TRIGGER, {
                        trackIdx: trackIdxMap.get(flatNote.track) ?? -1,
                        beat: flatNote.note.beat,
                        beatStep: flatNote.note.beatStep,
                    })
                }
            }

            // keep this.loop advancing so pattern mode resumes coherently
            if (localStep === patternTicks - 1) this.loop++
        }

        await Promise.all(promises)
    }

    /** Row index of every track of `pattern`, for NOTE_TRIGGER payloads. */
    #trackIndexMap = (tracks) => {
        const trackCount = Array.isArray(tracks) ? tracks.length : Object.keys(tracks).length
        if (this.#trackIdxMapRef !== tracks || this.#trackIdxMapCount !== trackCount) {
            const trackKeys = Object.keys(tracks)
            this.#trackIdxMap = new Map(trackKeys.map((k, i) => [tracks[k], i]))
            this.#trackIdxMapRef = tracks
            this.#trackIdxMapCount = trackCount
        }
        return this.#trackIdxMap
    }

    /**
     * The flat-notes map of the pattern that is selected NOW, or null.
     *
     * It used to return whatever the last playNotes() call had computed, so after
     * a pattern switch that skipped invalidateCache() (or landed between two
     * ticks) midi_out read the PREVIOUS pattern's notes while claiming they were
     * current. Same for a loop that has moved on.
     *
     * @returns {Map<number, object[]>|null}
     */
    getCurrentFlatNotesMap = () => {
        if (this.#lastFlatNotesPattern !== this.patterns[this.getSelectedPatternIdx()]) return null
        if (this.#lastFlatNotesLoop !== this.loop) return null
        return this.#lastFlatNotesMap
    }

    simpleBeep = async (trackIdx, note = null) => {
        if (this.audioCtx == null) return
        const pat = this.patterns[this.getSelectedPatternIdx()]
        if (!pat) return
        const tracks = getTracksArray(pat)
        const track = typeof trackIdx === 'number' ? tracks[trackIdx] : pat.tracks?.[trackIdx]
        if (!track) return

        const previewNote = {
            name: 'N_' + (track.name ?? trackIdx) + '_preview',
            sampleId: track.sampleId,
            beatStep: note?.beatStep ?? 0,
            stepPercent: 0,
            beat: note?.beat ?? 0,
            velocity: note?.velocity ?? track.velocity ?? 0.8,
            pan: note?.pan ?? track.pan ?? 0,
            pitch: note?.pitch ?? track.pitch ?? 0,
            arp: note?.arp ?? null,
            every: note?.every ?? 1,
            pos: 0,
            prob: 1,
            arpTriggerProbability: 1,
            retriggerCount: note?.retriggerCount ?? 1,
            rate: note?.rate ?? 1,
            euclideanFill: note?.euclideanFill ?? 0,
            euclideanRotation: note?.euclideanRotation ?? 0,
        }
        const flatNote = new FlatNote(0, track, previewNote)
        NoteParams.applyNoteParams(flatNote, this.secondsPerTick ?? 60 / (120 * 32))
        await this.sound.play(flatNote, this.audioCtx.currentTime)
        logger.info(
            'Player',
            'Play :' + track.name + '=' + (this.sounds[track.sampleId]?.url ?? track.synthSoundKey ?? 'synth'),
        )
    }

    /** Replaces the reference (no merge) — see Engine.setGeneratedSounds. */
    setGeneratedSounds = (generatedSounds) => {
        this.generatedSounds = generatedSounds
        this.sound.generatedSounds = generatedSounds
    }
}
