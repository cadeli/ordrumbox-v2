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
                const note = addNote(
                    track,
                    Number(sourceNote.beat ?? 0),
                    Number(sourceNote.beatStep ?? 0),
                    Number(sourceNote.pitch ?? 0)
                )
                copyNoteProps(note, sourceNote, track)
            }
        } else {
            for (const sourceNote of Object.values(notes)) {
                const note = addNote(
                    track,
                    Number(sourceNote.beat ?? 0),
                    Number(sourceNote.beatStep ?? 0),
                    Number(sourceNote.pitch ?? 0)
                )
                copyNoteProps(note, sourceNote, track)
            }
        }
    }

    fixPattern(importedPattern)
    return importedPattern
}
