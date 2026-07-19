import { FILTER_FREQ_MIN, FILTER_FREQ_MAX } from './constants.js'
import { TRACK_DEFAULTS, TRACK_RECALCULATED } from '../model/track_schema.js'
import { NOTE_DEFAULTS, NOTE_RECALCULATED, NOTE_POSITION_KEYS } from './note_schema.js'
import { logger } from "./logger.js"

export default class Utils {
static TAG = "UTILS"

    static filterTypeList = ['lowpass','highpass','bandpass','peaking','lowshelf','highshelf','notch','allpass']

    static waveList = ["sine", "triangle", "sawtooth", "square", "random"]

    static delayTimeValues = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4]

    static delayTimeLabels = ['1/16', '1/8', '1/4', '1/2', '1', '2', '4']

    static sanitizePatternFileName = (name) => {
        return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    }

    static getDelayTimeInSeconds = (delayTimeValue, bpm) => {
        const num = Number(delayTimeValue)
        const multiplier = Number.isFinite(num) && num !== 0 ? num : 1
        if (multiplier === 1 && (Number.isNaN(num) || num === 0)) {
            logger.warn('Fallback', 'num', 'delayTimeValue', 1)
        }
        return (60 / bpm) * multiplier;
    }

    static TRACK_DEFAULTS = TRACK_DEFAULTS;

    static TRACK_RECALCULATED = TRACK_RECALCULATED;

    static toFiniteNumber(value, fallback = 0, label = 'value') {
        const num = Number(value)
        if (Number.isFinite(num)) return num
        logger.warn('Fallback', 'num', label, fallback)
        return fallback
    }

    static PATTERN_DEFAULTS = {
        "nbBeats": 4,
        "bpm": 120,
        "description": "",
        "tags": [],
        "tracks": []
    };

    static toFiniteNumber = (value, fallback = 0, label = null) => {
        const num = Number(value)
        if (!Number.isFinite(num)) {
            if (label) logger.warn('Fallback', 'num', label, fallback)
            return fallback
        }
        return num
    }

    static NOTE_DEFAULTS = NOTE_DEFAULTS;

    static NOTE_RECALCULATED = NOTE_RECALCULATED;

    static NOTE_POSITION_KEYS = NOTE_POSITION_KEYS;

    /**
     * Returns the tracks of a pattern as an array, regardless of
     * the original format (Array or indexed object).
     */
    static getTracksArray(pattern) {
        if (!pattern?.tracks) return []
        return Array.isArray(pattern.tracks) ? pattern.tracks : Object.values(pattern.tracks)
    }


    constructor() { }

    static addLoopToTrackIfPossible = (track, options = {}) => {
        if (!track || !Array.isArray(track.notes)) {
            return { changed: false, reason: "invalid-track", loopAtStep: null, removedNotes: 0 }
        }

        const stepsPerBeat = Number(track.stepsPerBeat)
        if (!Number.isInteger(stepsPerBeat) || stepsPerBeat <= 0) {
            return { changed: false, reason: "invalid-beat-quantize", loopAtStep: null, removedNotes: 0 }
        }

        const trackSteps = Utils.getTrackStepLength(track)
        if (trackSteps <= 1) {
            return { changed: false, reason: "track-too-short", loopAtStep: null, removedNotes: 0 }
        }

        const currentLoopAtStep = Utils.getTrackLoopAtStep(track)

        for (let loopAtStep = 1; loopAtStep < currentLoopAtStep; loopAtStep++) {
            if (!Utils.trackNotesMatchLoop(track, loopAtStep, trackSteps)) {
                continue
            }

            const previousNoteCount = track.notes.length
            track.notes = track.notes
                .filter((note) => Utils.getNoteAbsoluteStep(note, stepsPerBeat) < loopAtStep)
                .sort((a, b) => Utils.getNoteAbsoluteStep(a, stepsPerBeat) - Utils.getNoteAbsoluteStep(b, stepsPerBeat))

            track.loopAtStep = loopAtStep
            track.loopPointBeat = Math.floor(loopAtStep / stepsPerBeat)
            track.loopPointStep = loopAtStep % stepsPerBeat

            return {
                changed: true,
                reason: "loop-added",
                loopAtStep,
                removedNotes: previousNoteCount - track.notes.length
            }
        }

        return {
            changed: false,
            reason: "no-identical-loop-found",
            loopAtStep: currentLoopAtStep,
            removedNotes: 0
        }
    }

    static getTrackStepLength = (track) => {
        const stepsPerBeat = Number(track?.stepsPerBeat)
        const beats = Number(track?.nbBeats)
        const declaredSteps = Number.isFinite(beats) && beats > 0 && Number.isFinite(stepsPerBeat) && stepsPerBeat > 0
            ? Math.floor(beats * stepsPerBeat)
            : 0
        const notesLastStep = Math.max(
            0,
            ...Object.values(track?.notes ?? []).map((note) => Utils.getNoteAbsoluteStep(note, stepsPerBeat) + 1)
        )
        return Math.max(declaredSteps, notesLastStep)
    }

    static getTrackLoopAtStep = (track) => {
        const stepsPerBeat = Number(track?.stepsPerBeat)
        const loopAtStep = Number(track?.loopAtStep)
        if (Number.isFinite(loopAtStep) && loopAtStep > 0) {
            return Math.floor(loopAtStep)
        }

        const loopPointBeat = Number(track?.loopPointBeat)
        const loopPointStep = Number(track?.loopPointStep ?? 0)
        if (Number.isFinite(loopPointBeat) && Number.isFinite(loopPointStep) && Number.isFinite(stepsPerBeat)) {
            return Math.floor((loopPointBeat * stepsPerBeat) + loopPointStep)
        }

        return Utils.getTrackStepLength(track)
    }

    static getLoopCandidateSteps = (trackSteps, minLoopSteps = 1) => {
        const candidates = []
        for (let loopAtStep = minLoopSteps; loopAtStep < trackSteps; loopAtStep++) {
            if (trackSteps % loopAtStep === 0) {
                candidates.push(loopAtStep)
            }
        }
        return candidates
    }

    static trackNotesMatchLoop = (track, loopAtStep, trackSteps = Utils.getTrackStepLength(track)) => {
        const stepsPerBeat = Number(track.stepsPerBeat)
        const original = Utils.createStepSignatureMap(track.notes, stepsPerBeat, (step) => step)
        const looped = Utils.createStepSignatureMap(
            track.notes.filter((note) => Utils.getNoteAbsoluteStep(note, stepsPerBeat) < loopAtStep),
            stepsPerBeat,
            (step) => step % loopAtStep
        )

        for (let step = 0; step < trackSteps; step++) {
            const originalSignature = original.get(step) ?? ""
            const loopedSignature = looped.get(step % loopAtStep) ?? ""
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
            map.set(step, signatures.join("|"))
        }

        return map
    }

    static getNoteAbsoluteStep = (note, stepsPerBeat) => {
        const beat = Number(note?.beat ?? 0)
        const beatStep = Number(note?.beatStep ?? 0)
        return Math.floor((beat * stepsPerBeat) + beatStep)
    }

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
        if (value && typeof value === "object") {
            return Object.keys(value)
                .sort()
                .reduce((normalized, key) => {
                    normalized[key] = Utils.normalizeSignatureValue(value[key])
                    return normalized
                }, {})
        }
        return value
    }

    static semiToneToPitch = (semiTone) => Math.pow(2, semiTone / 12);

    static normalizedTrackFilterFreqToHz = (value) => {
        const v = Utils.toFiniteNumber(value, 0, 'filterFreq')
        return Math.floor(FILTER_FREQ_MIN * Math.pow(1000, v))
    }
    static hzToNormalizedTrackFilterFreq = (hz) => {
        const h = Math.max(FILTER_FREQ_MIN, Math.min(FILTER_FREQ_MAX, Utils.toFiniteNumber(hz, 0, 'hz')))
        return Math.log10(h / FILTER_FREQ_MIN) / 3
    }
    static normalizedTrackFilterQToValue = (value) => (Utils.toFiniteNumber(value, 0, 'filterQ') * 18) + 0.707
    static valueToNormalizedTrackFilterQ = (q) => {
        const val = Math.max(0.707, Math.min(18.707, Utils.toFiniteNumber(q, 0.707, 'filterQ')))
        return (val - 0.707) / 18
    }
    static normalizedSynthFilterFreqToHz = (value) => Math.floor((2000 * Utils.toFiniteNumber(value, 0, 'synthFilterFreq')) + 50)
    static normalizedSynthFilterQToValue = (value) => (20 * Utils.toFiniteNumber(value, 0, 'synthFilterQ')) + 1

    static normalizeTrackFilterFreqValue = (value) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) return FILTER_FREQ_MIN
        return numericValue <= 1 ? Utils.normalizedTrackFilterFreqToHz(numericValue) : numericValue
    }

    static normalizeSynthFilterFreqValue = (value) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) return 50
        return numericValue <= 1 ? Utils.normalizedSynthFilterFreqToHz(numericValue) : numericValue
    }

    static normalizeSynthFilterQValue = (value) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) return 1
        return numericValue <= 1 ? Utils.normalizedSynthFilterQToValue(numericValue) : numericValue
    }

    static getStepSpacing = (value) => {
        if (value < 8) {
        return (value/8)
        } else {
            return (value-7)
        } 
    }

    static getRandomKey(obj) {
        const keys = Object.keys(obj); 
        if (keys.length === 0) return null;

        const randomIndex = Math.floor(Math.random() * keys.length);
        return keys[randomIndex];
    }

    static TRACK_NAME_TO_INDEX = {
        KICK: 0, SNARE: 1, TOM: 2, CLAP: 3,
        COWBELL: 4, CHH: 5, OHH: 6, CRASH: 7
    }

    static PAN_MAP = [0, 0.3, 0.5, -0.4, 0.4, -0.3, -0.2, 1]

    static computeTrackPan(indexTrack) {
        return Utils.PAN_MAP[indexTrack] ?? 0
    }

    static getPanFromTrackName = (type) => {
        const idx = Utils.TRACK_NAME_TO_INDEX[type]
        return idx !== undefined ? Utils.computeTrackPan(idx) : 0
    }

    static detectTrackType = (name) => {
        const n = name.toUpperCase()
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
}
