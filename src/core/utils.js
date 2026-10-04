import { TRACK_DEFAULTS } from '../model/track_schema.js'
import { toFiniteNumber } from './numbers.js'
import { NOTE_DEFAULTS, NOTE_POSITION_KEYS } from './note_schema.js'
import { logger } from './logger.js'

export default class Utils {
    /** Logger tag for every warning this module emits. */
    static TAG = 'UTILS'

    static filterTypeList = ['lowpass', 'highpass', 'bandpass']

    static waveList = ['sine', 'triangle', 'sawtooth', 'square', 'random']

    static delayTimeValues = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4]

    static delayTimeLabels = ['1/16', '1/8', '1/4', '1/2', '1', '2', '4']

    static getDelayTimeInSeconds = (delayTimeValue, bpm) => {
        const num = Number(delayTimeValue)
        // 0 is a valid delayTime (TRACK_VALUE_RANGES.delayTime.min = 0) — only non-finite falls back.
        if (!Number.isFinite(num)) {
            logger.warn(Utils.TAG, 'invalid delayTimeValue, using 1 beat', delayTimeValue)
            return (60 / bpm) * 1
        }
        return (60 / bpm) * num
    }

    static TRACK_DEFAULTS = TRACK_DEFAULTS

    static PATTERN_DEFAULTS = {
        // Stable id, assigned once at creation and never regenerated: song
        // arrangements reference patterns by id (see model/song_schema.js).
        // A rename must not change it.
        id: '',
        beatCount: 4,
        bpm: 120,
        description: '',
        tags: [],
        tracks: [],
    }

    static NOTE_DEFAULTS = NOTE_DEFAULTS

    static NOTE_POSITION_KEYS = NOTE_POSITION_KEYS

    /**
     * Returns the tracks of a pattern as an array, regardless of
     * the original format (Array or indexed object).
     */
    static getTracksArray(pattern) {
        if (!pattern?.tracks) return []
        return Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)
    }

    static addLoopToTrackIfPossible = (track, _options = {}) => {
        if (!track || !Array.isArray(track.notes)) {
            return { changed: false, reason: 'invalid-track', loopAtStep: null, removedNotes: 0 }
        }

        const stepsPerBeat = Number(track.stepsPerBeat)
        if (!Number.isInteger(stepsPerBeat) || stepsPerBeat <= 0) {
            return { changed: false, reason: 'invalid-beat-quantize', loopAtStep: null, removedNotes: 0 }
        }

        const trackSteps = Utils.getTrackStepLength(track)
        if (trackSteps <= 1) {
            return { changed: false, reason: 'track-too-short', loopAtStep: null, removedNotes: 0 }
        }

        const currentLoopAtStep = Utils.getTrackLoopAtStep(track)

        if (track.notes.length === 0) {
            return {
                changed: false,
                reason: 'no-notes',
                loopAtStep: currentLoopAtStep,
                removedNotes: 0,
            }
        }

        for (let loopAtStep = 1; loopAtStep < currentLoopAtStep; loopAtStep++) {
            if (!Utils.trackNotesMatchLoop(track, loopAtStep, trackSteps)) {
                continue
            }

            const previousNoteCount = track.notes.length
            track.notes = track.notes
                .filter((note) => Utils.getNoteAbsoluteStep(note, stepsPerBeat) < loopAtStep)
                .sort((a, b) => Utils.getNoteAbsoluteStep(a, stepsPerBeat) - Utils.getNoteAbsoluteStep(b, stepsPerBeat))

            track.loopAtStep = loopAtStep

            return {
                changed: true,
                reason: 'loop-added',
                loopAtStep,
                removedNotes: previousNoteCount - track.notes.length,
            }
        }

        return {
            changed: false,
            reason: 'no-identical-loop-found',
            loopAtStep: currentLoopAtStep,
            removedNotes: 0,
        }
    }

    static getTrackStepLength = (track) => {
        const stepsPerBeat = Number(track?.stepsPerBeat)
        const beats = Number(track?.beatCount)
        const declaredSteps =
            Number.isFinite(beats) && beats > 0 && Number.isFinite(stepsPerBeat) && stepsPerBeat > 0
                ? Math.floor(beats * stepsPerBeat)
                : 0
        const notesLastStep = Math.max(
            0,
            ...Object.values(track?.notes ?? []).map((note) => Utils.getNoteAbsoluteStep(note, stepsPerBeat) + 1),
        )
        return Math.max(declaredSteps, notesLastStep)
    }

    static getTrackLoopAtStep = (track) => {
        const loopAtStep = Number(track?.loopAtStep)
        if (Number.isFinite(loopAtStep) && loopAtStep > 0) {
            return Math.floor(loopAtStep)
        }

        return Utils.getTrackStepLength(track)
    }

    static trackNotesMatchLoop = (track, loopAtStep, trackSteps = Utils.getTrackStepLength(track)) => {
        const stepsPerBeat = Number(track.stepsPerBeat)
        const original = Utils.createStepSignatureMap(track.notes, stepsPerBeat, (step) => step)
        const looped = Utils.createStepSignatureMap(
            track.notes.filter((note) => Utils.getNoteAbsoluteStep(note, stepsPerBeat) < loopAtStep),
            stepsPerBeat,
            (step) => step % loopAtStep,
        )

        for (let step = 0; step < trackSteps; step++) {
            const originalSignature = original.get(step) ?? ''
            const loopedSignature = looped.get(step % loopAtStep) ?? ''
            if (originalSignature !== loopedSignature) {
                return false
            }
        }

        return true
    }

    static createStepSignatureMap = (notes, stepsPerBeat, stepMapper) => {
        const map = new Map()
        Object.values(notes ?? []).forEach((note) => {
            const sourceStep = Utils.getNoteAbsoluteStep(note, stepsPerBeat)
            const step = stepMapper(sourceStep)
            if (!Number.isInteger(step) || step < 0) {
                return
            }
            const signatures = map.get(step) ?? []
            signatures.push(Utils.getAudibleNoteSignature(note))
            signatures.sort()
            map.set(step, signatures)
        })

        for (const [step, signatures] of map) {
            map.set(step, signatures.join('|'))
        }

        return map
    }

    static getNoteAbsoluteStep = (note, stepsPerBeat) => {
        const beat = toFiniteNumber(note?.beat, 0, 'getNoteAbsoluteStep.beat')
        const beatStep = toFiniteNumber(note?.beatStep, 0, 'getNoteAbsoluteStep.beatStep')
        return Math.floor(beat * stepsPerBeat + beatStep)
    }

    /**
     * Canonical step → tick conversion: the single source of the
     * `beat * tick + Math.round((beatStep * tick) / stepsPerBeat)` formula.
     */
    static stepToTick = (step, stepsPerBeat, tick) => {
        const { beat, beatStep } = Utils.stepToBeat(step, stepsPerBeat)
        return beat * tick + Math.round((beatStep * tick) / stepsPerBeat)
    }

    /**
     * Inverse of getNoteAbsoluteStep: absolute step → { beat, beatStep }.
     * @param {number} step
     * @param {number} stepsPerBeat
     * @returns {{beat: number, beatStep: number}}
     */
    static stepToBeat = (step, stepsPerBeat) => ({
        beat: Math.floor(step / stepsPerBeat),
        beatStep: step % stepsPerBeat,
    })

    /**
     * Notes sitting at one grid position. Safe for both storage shapes
     * (array or indexed object) — a bare `(track.notes ?? []).filter(...)`
     * breaks on the object form.
     * @param {any} track
     * @param {number} beat
     * @param {number} beatStep
     * @returns {any[]}
     */
    static notesAtStep = (track, beat, beatStep) =>
        Object.values(track?.notes ?? {}).filter((n) => n.beat === beat && n.beatStep === beatStep)

    /** Track types treated as melodic (auto-generate + empty-track pruning). */
    static MELODIC_TYPES = new Set(['BASS', 'PIANO', 'ORGAN'])

    /** @param {{name?: string}} track @returns {boolean} */
    static isMelodicTrack = (track) => Utils.MELODIC_TYPES.has(Utils.detectTrackType(track?.name))

    static getAudibleNoteSignature = (note) => {
        const audibleProps = {}
        Object.keys(note ?? {})
            .filter((key) => !Utils.NOTE_POSITION_KEYS.has(key))
            .sort()
            .forEach((key) => {
                audibleProps[key] = Utils.normalizeSignatureValue(note[key])
            })
        return JSON.stringify(audibleProps)
    }

    static normalizeSignatureValue = (value) => {
        if (Array.isArray(value)) {
            return value.map((item) => Utils.normalizeSignatureValue(item))
        }
        if (value && typeof value === 'object') {
            return Object.keys(value)
                .sort()
                .reduce((normalized, key) => {
                    normalized[key] = Utils.normalizeSignatureValue(value[key])
                    return normalized
                }, {})
        }
        return value
    }

    static semiToneToPitch = (semiTone) => Math.pow(2, semiTone / 12)

    static getStepSpacing = (value) => {
        if (value < 8) {
            return value / 8
        } else {
            return value - 7
        }
    }

    static getRandomKey(obj) {
        const keys = Object.keys(obj)
        if (keys.length === 0) return null

        const randomIdx = Math.floor(Math.random() * keys.length)
        return keys[randomIdx]
    }

    /**
     * The drum taxonomy, one row per instrument: where it sits in the stereo
     * field, and which coarse type it belongs to.
     *
     * These used to be three independent vocabularies — TRACK_NAME_TO_INDEX
     * (names), DRUM_TYPES (types) and detectTrackType() (substring rules) — so
     * "CHH" was index 5 for panning but type HAT everywhere else, and nothing in
     * the code said so. Both readers now come from this table.
     */
    static TRACK_KINDS = {
        KICK: { panIndex: 0, type: 'KICK' },
        SNARE: { panIndex: 1, type: 'SNARE' },
        TOM: { panIndex: 2, type: 'PERC' },
        CLAP: { panIndex: 3, type: 'CLAP' },
        COWBELL: { panIndex: 4, type: 'COWBELL' },
        CHH: { panIndex: 5, type: 'HAT' },
        OHH: { panIndex: 6, type: 'HAT' },
        CRASH: { panIndex: 7, type: 'PERC' },
    }

    static PAN_MAP = [0, 0.3, 0.5, -0.4, 0.4, -0.3, -0.2, 1]

    /** Coarse types a track can belong to (everything but the melodic ones). */
    static DRUM_TYPES = new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC'])

    /** name → pan slot, derived from TRACK_KINDS. */
    static TRACK_NAME_TO_INDEX = Object.fromEntries(
        Object.entries(Utils.TRACK_KINDS).map(([name, kind]) => [name, kind.panIndex]),
    )

    static computeTrackPan(trackTypeIndex) {
        return Utils.PAN_MAP[trackTypeIndex] ?? 0
    }

    /**
     * Default pan of a track, from its NAME ("KICK", "OHH", …).
     * @param {string} trackName  a track name, NOT a detectTrackType() result
     */
    static getPanFromTrackName = (trackName) => {
        const idx = Utils.TRACK_NAME_TO_INDEX[trackName]
        return idx !== undefined ? Utils.computeTrackPan(idx) : 0
    }

    /**
     * Coarse type of a track. The TRACK_KINDS table answers for the canonical
     * names; anything else ("808 KICK", "SYNTH BASS") goes through the substring
     * rules below, which is why this cannot be a plain lookup.
     * @param {string} name
     * @returns {string}
     */
    static detectTrackType = (name) => {
        const n = name.toUpperCase()
        const exact = Utils.TRACK_KINDS[n]
        if (exact) return exact.type
        if (n.includes('KICK') || n.includes('BD')) return 'KICK'
        if (n.includes('SNARE') || n.includes('SD')) return 'SNARE'
        if (n.includes('OHH') || n.includes('HAT') || n.includes('CHH')) return 'HAT'
        if (n.includes('CLAP') || n.includes('CLP') || n.includes('CP')) return 'CLAP'
        if (n.includes('BASS')) return 'BASS'
        if (n.includes('PIANO')) return 'PIANO'
        if (n.includes('COWBELL') || n.includes('COW')) return 'COWBELL'
        if (n.includes('ORGAN')) return 'ORGAN'
        if (n.includes('SYNTH')) return 'BASS'
        return 'PERC'
    }

    /**
     * Keep only the melodic tracks (BASS, PIANO, ORGAN) that have notes.
     * Returns a NEW array; `tracks` is left untouched.
     * @param {Array} tracks
     * @returns {Array}
     */
    static filterEmptyMelodicTracks(tracks) {
        return tracks.filter((t) => !Utils.isMelodicTrack(t) || (t.notes && t.notes.length > 0))
    }

    /**
     * Determine whether a track should produce sound given solo/mute state.
     * When any track has solo=true, only soloed tracks play.
     * Otherwise, all non-muted tracks play.
     *
     * @param {any} track       - track object with mute/solo properties
     * @param {boolean} anySolo - whether any track in the pattern has solo=true
     * @returns {boolean}
     */
    static shouldTrackPlay(track, anySolo) {
        return anySolo ? track.solo === true : track.mute !== true
    }

    /**
     * Compute whether any track in a tracks collection has solo enabled.
     *
     * @param {object[]|object} tracks - array or object values of tracks
     * @returns {boolean}
     */
    static hasAnySolo(tracks) {
        const arr = Array.isArray(tracks) ? tracks : Object.values(tracks)
        return arr.some((t) => t.solo === true)
    }
}
