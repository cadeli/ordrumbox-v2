import { fixPattern } from '../../patterns/fixer.js'
import { normalizeTrack, TRACK_DEFAULTS, recalcLoopDerived } from '../../model/track_schema.js'
import {
    NOTE_DEFAULTS,
    NOTE_KEY_ORDER,
    compactArrayToNote,
    isCompactFormat
} from '../../core/note_schema.js'
import Utils from '../../core/utils.js'
import { logger } from "../../core/logger.js"
import { MAX_IMPORT_TRACKS, MAX_IMPORT_NOTES } from '../../core/constants.js'

/**
 * Validate a parsed JSON object as a candidate for pattern import.
 * Returns { ok: true } or { ok: false, error: string }.
 *
 * Checks:
 *  - top-level is a non-null, non-array object
 *  - tracks (if present) is an object or array
 *  - track count ≤ MAX_IMPORT_TRACKS
 *  - total note count ≤ MAX_IMPORT_NOTES
 *  - each track (if present) is a non-null object
 */
export function validatePatternJson(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, error: 'Expected a JSON object' }
    }

    const tracks = data.tracks
    if (tracks != null) {
        if (typeof tracks !== 'object') {
            return { ok: false, error: '"tracks" must be an object or array' }
        }

        const entries = Object.values(tracks)
        if (entries.length > MAX_IMPORT_TRACKS) {
            return { ok: false, error: `Too many tracks (max ${MAX_IMPORT_TRACKS})` }
        }

        let totalNotes = 0
        for (const t of entries) {
            if (!t || typeof t !== 'object' || Array.isArray(t)) {
                return { ok: false, error: 'Each track must be a JSON object' }
            }
            const notes = t.notes
            if (notes != null && typeof notes === 'object') {
                totalNotes += Array.isArray(notes) ? notes.length : Object.keys(notes).length
                if (totalNotes > MAX_IMPORT_NOTES) {
                    return { ok: false, error: `Too many notes (max ${MAX_IMPORT_NOTES})` }
                }
            }
        }
    }

    return { ok: true }
}

/**
 * Create a new track from a source track's properties.
 * Pure function — no side effects on global state.
 */
export function createTrackFromSource(sourceTrack, nbBeats) {
    const track = normalizeTrack({
        name: sourceTrack.name,
        nbBeats: nbBeats,
        stepsPerBeat: sourceTrack.stepsPerBeat ?? 4,
        loopAtStep: nbBeats * (sourceTrack.stepsPerBeat ?? 4),
        pan: Utils.getPanFromTrackName(sourceTrack.name),
    })
    return track
}

/**
 * Copy all properties from sourceTrack to track.
 * Handles derived properties (loopPointBeat/Step), optional FX props,
 * and beats/nbBeats alias.
 */
export function copyTrackProps(track, sourceTrack) {
    const derivedKeys = new Set(['loopPointBeat', 'loopPointStep', 'notes', 'noteKeys'])

    for (const prop of Object.keys(TRACK_DEFAULTS)) {
        if (derivedKeys.has(prop)) continue
        if (prop in sourceTrack) {
            track[prop] = sourceTrack[prop]
        }
    }

    const optionalProps = ['mono', 'filterLfoFreq', 'reverbType', 'reverbAmount',
        'delayType', 'delayTime', 'delayDepth', 'fxSelected',
        'saturationType', 'saturationAmount', 'synthSoundKey',
        'reverbOn', 'delayOn', 'sat']

    for (const prop of optionalProps) {
        if (!(prop in sourceTrack)) delete track[prop]
    }

    if (!('loopAtStep' in sourceTrack)) {
        track.loopAtStep = track.nbBeats * track.stepsPerBeat
    }

    recalcLoopDerived(track)
    return track
}

/**
 * Copy note properties from sourceNote to note.
 */
export function copyNoteProps(note, sourceNote, track) {
    const props = [
        'beat', 'velocity', 'pan', 'pitch', 'arp',
        'every', 'pos', 'prob',
        'arpTriggerProbability', 'retriggerNum', 'rate',
        'euclidianFill', 'steppc'
    ]

    for (const prop of props) {
        if (prop in sourceNote) {
            note[prop] = sourceNote[prop]
        }
    }

    if (sourceNote.beatStep !== undefined) note.beatStep = sourceNote.beatStep

    if (sourceNote.steppc === undefined) {
        note.steppc = Math.round((note.beatStep * 100) / track.stepsPerBeat)
    }

    return note
}

/**
 * Import a pattern from a JSON object.
 * Pure function that returns the imported pattern — does not mutate appState.
 *
 * Supports both legacy format (notes as objects) and compact format (notes as arrays
 * with noteKeys header).
 *
 * @param {object} sourcePattern – the JSON pattern to import
 * @param {Function} addPattern  – fn(name) => pattern  (creates + registers)
 * @param {Function} addTrack    – fn(pattern, name) => track
 * @param {Function} addNote     – fn(track, beat, beatStep, pitch) => note
 * @returns {object} the imported pattern
 */
export function importPatternFromJson(sourcePattern, addPattern, addTrack, addNote) {
    const patternName = sourcePattern?.name ?? undefined
    const importedPattern = addPattern(patternName)

    importedPattern.name = patternName ?? importedPattern.name ?? ''
    importedPattern.bpm = Utils.toFiniteNumber(sourcePattern?.bpm, 120, 'PatternImport bpm')
    importedPattern.nbBeats = Utils.toFiniteNumber(sourcePattern?.nbBeats, 4, 'PatternImport nbBeats')

    if (sourcePattern?.application) importedPattern.application = sourcePattern.application
    if (sourcePattern?.url) importedPattern.url = sourcePattern.url
    if (sourcePattern?.tags) importedPattern.tags = { ...sourcePattern.tags }

    if (!('description' in sourcePattern)) {
        delete importedPattern.description
    } else if (sourcePattern.description !== '') {
        importedPattern.description = sourcePattern.description
    } else {
        delete importedPattern.description
    }

    importedPattern.tracks = []

    for (const sourceTrack of Object.values(sourcePattern?.tracks ?? [])) {
        const track = addTrack(importedPattern, sourceTrack.name)
        copyTrackProps(track, sourceTrack)

        const notes = sourceTrack.notes ?? [];
        const noteKeys = sourceTrack.noteKeys;

        if (Array.isArray(noteKeys) && Array.isArray(notes) && notes.length > 0 && Array.isArray(notes[0])) {
            for (const arr of notes) {
                const sourceNote = compactArrayToNote(arr, noteKeys);
                const b = Number(sourceNote.beat ?? 0)
                const bs = Number(sourceNote.beatStep ?? 0)
                const p = Number(sourceNote.pitch ?? 0)
                if (!Number.isFinite(b) || !Number.isFinite(bs) || !Number.isFinite(p)) {
                    logger.warn('PatternImport', 'NaN note values in compact format', { beat: sourceNote.beat, beatStep: sourceNote.beatStep, pitch: sourceNote.pitch })
                }
                const note = addNote(track, b || 0, bs || 0, p || 0)
                copyNoteProps(note, sourceNote, track)
            }
        } else {
            for (const sourceNote of Object.values(notes)) {
                const b = Number(sourceNote.beat ?? 0)
                const bs = Number(sourceNote.beatStep ?? 0)
                const p = Number(sourceNote.pitch ?? 0)
                if (!Number.isFinite(b) || !Number.isFinite(bs) || !Number.isFinite(p)) {
                    logger.warn('PatternImport', 'NaN note values in legacy format', { beat: sourceNote.beat, beatStep: sourceNote.beatStep, pitch: sourceNote.pitch })
                }
                const note = addNote(track, b || 0, bs || 0, p || 0)
                copyNoteProps(note, sourceNote, track)
            }
        }
    }

    fixPattern(importedPattern)
    return importedPattern
}
