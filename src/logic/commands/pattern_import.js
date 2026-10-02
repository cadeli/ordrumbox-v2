import { fixPattern } from '../../patterns/fixer.js'
import { TRACK_DEFAULTS, recalcLoopDerived } from '../../model/track_schema.js'
import { areValidNoteKeys, compactArrayToNote, isCompactFormat } from '../../core/note_schema.js'
import { reportUserError } from '../../core/notify.js'
import Utils from '../../core/utils.js'
import { logger } from '../../core/logger.js'
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
 * Copy all properties from sourceTrack to track.
 * Handles derived properties (loopPointBeat/Step), optional FX props,
 * and beats/beatCount alias.
 */
function copyTrackProps(track, sourceTrack) {
    const derivedKeys = new Set(['loopPointBeat', 'loopPointStep', 'notes', 'noteKeys'])

    for (const prop of Object.keys(TRACK_DEFAULTS)) {
        if (derivedKeys.has(prop)) continue
        if (prop in sourceTrack) {
            track[prop] = sourceTrack[prop]
        }
    }

    const optionalProps = [
        'mono',
        'reverbType',
        'reverbAmount',
        'delayType',
        'delayTime',
        'delayDepth',
        'fxSelected',
        'saturationType',
        'saturationAmount',
        'synthSoundKey',
        'reverbOn',
        'delayOn',
        'sat',
    ]

    for (const prop of optionalProps) {
        if (!(prop in sourceTrack)) delete track[prop]
    }

    if (!('loopAtStep' in sourceTrack)) {
        track.loopAtStep = track.beatCount * track.stepsPerBeat
    }

    recalcLoopDerived(track)
    return track
}

/**
 * Copy note properties from sourceNote to note.
 */
function copyNoteProps(note, sourceNote, track) {
    const props = [
        'beat',
        'velocity',
        'pan',
        'pitch',
        'arp',
        'arpRange',
        '_arpScale',
        '_arpType',
        'every',
        'pos',
        'prob',
        'arpTriggerProbability',
        'retriggerNum',
        'rate',
        'euclideanFill',
        'euclideanRotation',
        'steppc',
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
 * Imports notes from both compact (arrays with noteKeys) and object formats.
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
    // Carry the source id over. addPattern() mints one from the name, but the
    // caller (the loader) already ran fixPattern and settled on a stable id —
    // discarding it here would re-derive it from the name on every reload and
    // detach every song clip referencing this pattern after a rename.
    if (sourcePattern?.id) importedPattern.id = String(sourcePattern.id)
    importedPattern.bpm = Utils.toFiniteNumber(sourcePattern?.bpm, 120, 'PatternImport bpm')
    importedPattern.beatCount = Utils.toFiniteNumber(sourcePattern?.beatCount, 4, 'PatternImport beatCount')

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

        const notes = sourceTrack.notes ?? []
        const noteKeys = sourceTrack.noteKeys
        const notesAreArrays = Array.isArray(notes[0])

        // Compact notes decode positionally: a header with an unknown key (or a
        // reordered one) would silently rewrite velocity/pitch/beat. Refuse
        // that header instead of guessing which property each slot holds.
        if (notesAreArrays && !areValidNoteKeys(noteKeys)) {
            reportUserError('PatternImport.noteKeys', `Unreadable note data in "${sourceTrack.name}" — track skipped`, {
                cause: new Error(`invalid noteKeys: ${JSON.stringify(noteKeys)}`),
            })
            continue
        }

        if (isCompactFormat(sourceTrack)) {
            for (const arr of notes) {
                const sourceNote = compactArrayToNote(arr, noteKeys)
                const bRaw = Number(sourceNote.beat ?? 0)
                const bsRaw = Number(sourceNote.beatStep ?? 0)
                const pRaw = Number(sourceNote.pitch ?? 0)
                const b = Number.isFinite(bRaw) ? bRaw : 0
                const bs = Number.isFinite(bsRaw) ? bsRaw : 0
                const p = Number.isFinite(pRaw) ? pRaw : 0
                if (b !== bRaw || bs !== bsRaw || p !== pRaw) {
                    logger.warn('PatternImport', 'Invalid note values replaced with 0 in compact format', {
                        beat: sourceNote.beat,
                        beatStep: sourceNote.beatStep,
                        pitch: sourceNote.pitch,
                        replaced: { beat: b !== bRaw, beatStep: bs !== bsRaw, pitch: p !== pRaw },
                    })
                }
                const note = addNote(track, b, bs, p)
                copyNoteProps(note, sourceNote, track)
            }
        } else {
            for (const sourceNote of Object.values(notes)) {
                const bRaw = Number(sourceNote.beat ?? 0)
                const bsRaw = Number(sourceNote.beatStep ?? 0)
                const pRaw = Number(sourceNote.pitch ?? 0)
                const b = Number.isFinite(bRaw) ? bRaw : 0
                const bs = Number.isFinite(bsRaw) ? bsRaw : 0
                const p = Number.isFinite(pRaw) ? pRaw : 0
                if (b !== bRaw || bs !== bsRaw || p !== pRaw) {
                    logger.warn('PatternImport', 'Invalid note values replaced with 0 in imported note', {
                        beat: sourceNote.beat,
                        beatStep: sourceNote.beatStep,
                        pitch: sourceNote.pitch,
                        replaced: { beat: b !== bRaw, beatStep: bs !== bsRaw, pitch: p !== pRaw },
                    })
                }
                const note = addNote(track, b, bs, p)
                copyNoteProps(note, sourceNote, track)
            }
        }
    }

    fixPattern(importedPattern)
    return importedPattern
}
